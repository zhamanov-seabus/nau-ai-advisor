import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { execFileSync, spawn } from 'child_process';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message, MessageRole } from '../common/entities/message.entity';
import { User } from '../common/entities/user.entity';
import { RagService } from '../rag/rag.service';
import { TranscriptService } from '../transcript/transcript.service';
import { EncryptionService } from '../common/encryption.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';
import { ContextManager, StudentProfile } from './context.manager';

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number }
  | { type: 'keepalive' };

const CLAUDE_BIN = '/usr/local/bin/claude';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private ragService: RagService,
    private transcriptService: TranscriptService,
    private encryptionService: EncryptionService,
    private ferpaSanitizer: FerpaSanitizer,
    private contextManager: ContextManager,
    private config: ConfigService,
  ) {
    // Cache availability check at startup
    try { execFileSync(CLAUDE_BIN, ['--version'], { timeout: 5000, encoding: 'utf8' }); this.claudeAvailable = true; } catch { this.claudeAvailable = false; }
  }

  // Extract profile signals from student message and update DB
  private async updateProfileFromMessage(userId: string, message: string, response: string): Promise<void> {
    const text = (message + ' ' + response).toLowerCase();
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const profile: StudentProfile = (user.profile as StudentProfile) ?? {};
    let changed = false;

    // Detect major
    const majorMap: Record<string, string> = {
      'bs cs': 'BS Computer Science', 'computer science': 'BS Computer Science',
      'bs ba': 'BS Business Administration', 'business administration': 'BS Business Administration',
      'mba': 'MBA', 'ms cs': 'MS Computer Science', 'ms computer science': 'MS Computer Science',
      'education': 'BS Interdisciplinary Studies in Education',
      'criminal justice': 'BS Criminal Justice',
    };
    for (const [kw, major] of Object.entries(majorMap)) {
      if (text.includes(kw) && profile.major !== major) {
        profile.major = major; changed = true; break;
      }
    }

    // Detect year level
    const yearMap: Record<string, string> = {
      'freshman': 'Freshman (Year 1)', 'first year': 'Freshman (Year 1)', '1st year': 'Freshman (Year 1)',
      'sophomore': 'Sophomore (Year 2)', 'second year': 'Sophomore (Year 2)', '2nd year': 'Sophomore (Year 2)',
      'junior': 'Junior (Year 3)', 'third year': 'Junior (Year 3)', '3rd year': 'Junior (Year 3)',
      'senior': 'Senior (Year 4)', 'fourth year': 'Senior (Year 4)', '4th year': 'Senior (Year 4)',
    };
    for (const [kw, year] of Object.entries(yearMap)) {
      if (text.includes(kw) && profile.yearLevel !== year) {
        profile.yearLevel = year; changed = true; break;
      }
    }

    // Detect credit hours from patterns like "completed 45 credits" or "45 credit hours"
    const creditMatch = text.match(/(\d{1,3})\s*(?:credit hours?|credits?\s*(?:completed|done|finished))/);
    if (creditMatch) {
      const cr = parseInt(creditMatch[1]);
      if (cr > 0 && cr <= 150 && profile.creditHoursCompleted !== cr) {
        profile.creditHoursCompleted = cr; changed = true;
      }
    }

    if (changed) {
      profile.updatedAt = new Date().toISOString();
      await this.userRepo.update(userId, { profile });
    }
  }

  async getProfile(userId: string): Promise<StudentProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return (user?.profile as StudentProfile) ?? {};
  }

  async updateProfile(userId: string, updates: Partial<StudentProfile>): Promise<StudentProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    const profile = { ...((user.profile as StudentProfile) ?? {}), ...updates, updatedAt: new Date().toISOString() };
    await this.userRepo.update(userId, { profile });
    return profile;
  }

  private claudeAvailable = false;

  private isClaudeAvailable(): boolean {
    return this.claudeAvailable;
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

  // Post-process: strip any accidental model/company leaks
  private readonly MODEL_LEAK_RE = /\b(claude|anthropic|claude agent sdk|openai|gpt-[\d]+|gemini|llama|mistral|built on anthropic|language model|large language model|llm)\b/gi;

  private sanitizeResponse(text: string): string {
    if (this.MODEL_LEAK_RE.test(text)) {
      this.logger.warn('Model leak detected in response — replacing');
      this.MODEL_LEAK_RE.lastIndex = 0;
      return text.replace(this.MODEL_LEAK_RE, 'NAU Academic Advisor Assistant');
    }
    return text;
  }

  private callClaude(systemPrompt: string, input: string): string {
    const raw = execFileSync(
      CLAUDE_BIN,
      ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions', '--model', 'haiku', '--system-prompt', systemPrompt],
      { input, timeout: 180000, encoding: 'utf8', env: this.buildClaudeEnv() },
    );
    return this.parseClaudeOutput(raw);
  }

  private callClaudeAsync(systemPrompt: string, input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = this.buildClaudeEnv();
      const proc = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions', '--model', 'haiku', '--system-prompt', systemPrompt], { env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude timeout after 180s')); }, 180000);
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

  async getOrCreateSession(userId: string): Promise<ChatSession> {
    let session = await this.sessionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      session = await this.sessionRepo.save(this.sessionRepo.create({ userId }));
    }
    return session;
  }

  async getHistory(userId: string, limit = 50): Promise<Message[]> {
    const session = await this.getOrCreateSession(userId);
    const messages = await this.messageRepo.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    return messages.map((msg) => {
      try {
        return { ...msg, content: this.encryptionService.decrypt(msg.content) };
      } catch {
        return msg;
      }
    });
  }

  async newSession(userId: string): Promise<ChatSession> {
    return this.sessionRepo.save(this.sessionRepo.create({ userId }));
  }

  async *streamMessage(userId: string, question: string): AsyncGenerator<StreamEvent> {
    if (!this.isClaudeAvailable()) {
      yield { type: 'delta', content: 'AI chat is currently unavailable. Please contact your academic advisor.' };
      yield { type: 'done', tokensUsed: 0 };
      return;
    }

    const sanitizedQuestion = this.ferpaSanitizer.sanitizeUserMessage(question);
    const session = await this.getOrCreateSession(userId);

    const [ragChunks, transcriptData, rawHistory, studentProfile] = await Promise.all([
      this.ragService.search(sanitizedQuestion, 12).catch(() => []),
      this.transcriptService.getStudentTranscript(userId).catch(() => null),
      this.messageRepo
        .find({ where: { sessionId: session.id }, order: { createdAt: 'ASC' }, take: 20 })
        .catch(() => []),
      this.getProfile(userId).catch(() => ({})),
    ]);

    const history = rawHistory.map((msg) => {
      try { return { ...msg, content: this.encryptionService.decrypt(msg.content) }; }
      catch { return msg; }
    });

    const { systemPrompt, userContext, historyMessages } = this.contextManager.buildPrompt(
      userId, sanitizedQuestion, ragChunks, transcriptData, history, studentProfile,
    );

    // Build full system prompt including conversation history
    const historyText = historyMessages
      .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const fullSystem = [
      userContext ? `${systemPrompt}\n\n${userContext}` : systemPrompt,
      historyText ? `\n\n## Conversation so far\n${historyText}` : '',
    ].join('');

    let fullResponse = '';
    try {
      const responsePromise = this.callClaudeAsync(fullSystem, sanitizedQuestion);
      let claudeDone = false;
      responsePromise.finally(() => { claudeDone = true; });

      // Send keepalive every 15s but respond immediately when Claude finishes
      while (!claudeDone) {
        await Promise.race([
          responsePromise.then(() => {}).catch(() => {}),
          new Promise<void>((r) => setTimeout(r, 15000)),
        ]);
        if (!claudeDone) yield { type: 'keepalive' } as StreamEvent;
      }
      fullResponse = await responsePromise;

      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.USER,
          content: this.encryptionService.encrypt(sanitizedQuestion),
        }),
      );
      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.ASSISTANT,
          content: this.encryptionService.encrypt(fullResponse),
          tokensUsed: 0,
        }),
      );
      session.lastMessageAt = new Date();
      await this.sessionRepo.save(session);

      // Async profile update — don't await, never block the response
      this.updateProfileFromMessage(userId, sanitizedQuestion, fullResponse).catch(() => {});

      yield { type: 'delta', content: this.sanitizeResponse(fullResponse) };
      yield { type: 'done', tokensUsed: 0 };
    } catch (err) {
      this.logger.error(`Claude CLI error: ${err.message}\nstdout: ${err.stdout ?? ''}\nstderr: ${err.stderr ?? ''}`);
      yield { type: 'delta', content: 'Unable to process request. Please try again or contact your academic advisor.' };
      yield { type: 'done', tokensUsed: 0 };
    }
  }
}
