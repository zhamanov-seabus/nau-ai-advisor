import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { spawn } from 'child_process';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message, MessageRole } from '../common/entities/message.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { TranscriptService } from '../transcript/transcript.service';
import { RagService } from '../rag/rag.service';
import { EncryptionService } from '../common/encryption.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'keepalive' };

const CLAUDE_BIN = '/usr/local/bin/claude';

const ADVISOR_SYSTEM_PROMPT = `You are the NAU Academic Advisor Assistant — an AI tool that helps academic advisors at North American University (NAU) review student records and plan advising sessions.

IDENTITY:
- You assist human academic advisors (not students directly).
- Never reveal the underlying AI model or technology.
- Never mention internal systems (Jenzabar, SIS, database, etc.).

GUARDRAILS:
- ONLY use information provided in the context sections below (Student Record, Academic Record, NAU Policies).
- If a student's transcript/record is NOT in the context, clearly say: "No transcript is available for this student. Please upload one to get a personalized degree audit."
- Do NOT invent, guess, or hallucinate course completion data. If you don't see specific courses listed in the provided context, do NOT claim the student has completed them.
- Do NOT generate external URLs (Google Docs, Google Sheets, etc.). Only use official NAU links if needed.
- NEVER include person names (student, advisor, faculty) in responses.

YOUR ROLE:
- Analyze the student's academic record ONLY when it is provided in the context.
- Perform degree audits: identify completed requirements, remaining requirements, and suggested next steps.
- Flag academic risks: low GPA, missing prerequisites, missing graduation requirements.
- Suggest courses the student should register for next semester based on their degree plan.
- Answer advisor questions about NAU policies, degree requirements, and academic planning.
- Be analytical, precise, and professional — you are speaking with a trained academic advisor.

DEGREE AUDIT (ONLY when transcript data is provided in context):
- Identify declared major and concentration.
- List completed vs. remaining core requirements.
- List completed vs. remaining concentration requirements.
- Calculate total credits completed and estimate credits remaining to graduation.
- Flag any repeated courses, low grades (D/F), or missing prerequisites.
- Recommend courses for next semester based on prerequisites completed.

FORMAT:
- Never use emojis. Plain text and markdown only.
- Use clear headings and bullet points.
- For degree audits, use structured checklists.
- Be concise and actionable. Avoid decorative or ceremonial language.`;

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private transcriptService: TranscriptService,
    private ragService: RagService,
    private encryptionService: EncryptionService,
    private ferpaSanitizer: FerpaSanitizer,
  ) {}

  async getStudents(): Promise<Array<{ id: string; name: string; email: string; department: string; transcriptStatus: string }>> {
    const students = await this.userRepo.find({
      where: { role: UserRole.STUDENT, isActive: true },
      order: { firstName: 'ASC' },
    });

    const results = await Promise.all(
      students.map(async (s) => {
        let transcriptStatus = 'missing';
        try {
          const t = await this.transcriptService.getTranscriptStatus(s.id);
          transcriptStatus = t.uploadedAt ? t.status : 'missing';
        } catch {
          // no transcript
        }
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`.trim() || s.email,
          email: s.email,
          department: s.department ?? '',
          transcriptStatus,
        };
      }),
    );

    return results;
  }

  async getOrCreateSession(advisorId: string, studentId: string): Promise<ChatSession> {
    let session = await this.sessionRepo.findOne({
      where: { userId: advisorId, targetUserId: studentId },
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      session = await this.sessionRepo.save(
        this.sessionRepo.create({ userId: advisorId, targetUserId: studentId }),
      );
    }
    return session;
  }

  async getHistory(advisorId: string, studentId: string): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
    const session = await this.getOrCreateSession(advisorId, studentId);
    const messages = await this.messageRepo.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    return messages.map((m) => {
      let content = m.content;
      try { content = this.encryptionService.decrypt(m.content); } catch { /* raw */ }
      return { role: m.role, content, createdAt: m.createdAt };
    });
  }

  async newSession(advisorId: string, studentId: string): Promise<ChatSession> {
    return this.sessionRepo.save(
      this.sessionRepo.create({ userId: advisorId, targetUserId: studentId }),
    );
  }

  private buildClaudeEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env['CLAUDECODE'];
    delete env['CLAUDE_CODE_ENTRYPOINT'];
    delete env['ANTHROPIC_API_KEY'];
    env['DUCTOR_CHAT_ID'] = '0';
    return env;
  }

  private parseClaudeOutput(raw: string): string {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return raw.trim(); }
    if (Array.isArray(data)) {
      const item = (data as Array<Record<string, unknown>>).find((i) => i?.type === 'result');
      return String(item?.result ?? '');
    }
    return String((data as Record<string, unknown>)?.result ?? '');
  }

  private callClaudeAsync(systemPrompt: string, input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = this.buildClaudeEnv();
      const proc = spawn(CLAUDE_BIN, [
        '-p', '--output-format', 'json',
        '--permission-mode', 'bypassPermissions',
        '--model', 'sonnet',
        '--system-prompt', systemPrompt,
      ], { env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude timeout')); }, 180000);
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number) => {
        clearTimeout(timer);
        if (code !== 0) reject(Object.assign(new Error(`claude exited ${code}`), { stdout, stderr }));
        else resolve(this.parseClaudeOutput(stdout));
      });
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  async *streamMessage(advisorId: string, studentId: string, question: string): AsyncGenerator<StreamEvent> {
    const sanitizedQuestion = this.ferpaSanitizer.sanitizeUserMessage(question);
    const session = await this.getOrCreateSession(advisorId, studentId);

    // Load all context in parallel
    const [student, transcriptData, rawHistory] = await Promise.all([
      this.userRepo.findOne({ where: { id: studentId } }),
      this.transcriptService.getStudentTranscript(studentId).catch(() => null),
      this.messageRepo.find({
        where: { sessionId: session.id },
        order: { createdAt: 'ASC' },
        take: 20,
      }).catch(() => []),
    ]);

    // Build RAG query: enrich with student's major/department for targeted degree plan retrieval
    const major = (student?.profile as Record<string, unknown>)?.major as string | undefined;
    const department = student?.department;
    const ragQuery = [
      sanitizedQuestion,
      major ? `${major} degree plan requirements` : '',
      department ? `${department} courses` : '',
    ].filter(Boolean).join(' ');
    const ragChunks = await this.ragService.search(ragQuery, 8).catch(() => []);

    const history = rawHistory.map((m) => {
      let content = m.content;
      try { content = this.encryptionService.decrypt(m.content); } catch { /* raw */ }
      return { role: m.role as 'user' | 'assistant', content };
    });

    // Build context — no PII in prompt
    const parts: string[] = [`## Student Record${student?.department ? ` — Department: ${student.department}` : ''}`];

    if (student?.profile && Object.keys(student.profile).length > 0) {
      const p = student.profile as Record<string, unknown>;
      const lines: string[] = [];
      if (p.major) lines.push(`Major: ${p.major}`);
      if (p.yearLevel) lines.push(`Year: ${p.yearLevel}`);
      if (p.creditHoursCompleted != null) lines.push(`Credits completed: ${p.creditHoursCompleted}`);
      if (p.currentGPA != null) lines.push(`GPA: ${p.currentGPA}`);
      if (lines.length) parts.push(`## Student Profile\n${lines.join('\n')}`);
    }

    if (transcriptData?.sanitizedText) {
      parts.push(`## Student Academic Record\n${transcriptData.sanitizedText}`);
    } else if (transcriptData?.parsedData) {
      parts.push(`## Student Academic Record\n${JSON.stringify(transcriptData.parsedData)}`);
    }

    if (ragChunks.length > 0) {
      const ragText = ragChunks.map((c: { content: string }) => c.content).join('\n\n---\n\n');
      parts.push(`## NAU Policies & Degree Requirements\n${ragText}`);
    }

    const historyText = history
      .map((m) => `${m.role === 'user' ? 'Advisor' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const fullSystem = [
      ADVISOR_SYSTEM_PROMPT,
      parts.join('\n\n'),
      historyText ? `\n\n## Conversation so far\n${historyText}` : '',
    ].join('\n\n');

    let fullResponse = '';
    try {
      const responsePromise = this.callClaudeAsync(fullSystem, sanitizedQuestion);
      let claudeDone = false;
      responsePromise.finally(() => { claudeDone = true; });

      while (!claudeDone) {
        await Promise.race([
          responsePromise.then(() => {}).catch(() => {}),
          new Promise<void>((r) => setTimeout(r, 15000)),
        ]);
        if (!claudeDone) yield { type: 'keepalive' } as StreamEvent;
      }
      fullResponse = await responsePromise;

      await this.messageRepo.save(this.messageRepo.create({
        sessionId: session.id,
        role: MessageRole.USER,
        content: this.encryptionService.encrypt(sanitizedQuestion),
      }));
      await this.messageRepo.save(this.messageRepo.create({
        sessionId: session.id,
        role: MessageRole.ASSISTANT,
        content: this.encryptionService.encrypt(fullResponse),
        tokensUsed: 0,
      }));
      session.lastMessageAt = new Date();
      await this.sessionRepo.save(session);

      yield { type: 'delta', content: fullResponse };
      yield { type: 'done' };
    } catch (err) {
      this.logger.error(`Advisor Claude error: ${err.message}`);
      yield { type: 'delta', content: 'Unable to process request. Please try again.' };
      yield { type: 'done' };
    }
  }
  async createStudent(dto: { firstName: string; lastName: string; email: string; department?: string }): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) return existing;
    const user = this.userRepo.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      department: dto.department,
      role: UserRole.STUDENT,
      isActive: true,
    });
    return this.userRepo.save(user);
  }

}