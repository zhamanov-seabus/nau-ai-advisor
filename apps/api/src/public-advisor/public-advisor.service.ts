import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { execFileSync } from 'child_process';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { OtpCode } from '../common/entities/otp-code.entity';
import { User } from '../common/entities/user.entity';
import { RagService } from '../rag/rag.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'keepalive' }
  | { type: 'error'; message: string };

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const AGENT_CWD = process.env.AGENT_CWD || './advisor-agent';

// Extra emails allowed to use the public advisor beyond the institutional
// domain check. Comma-separated, configured via the WHITELIST_EMAILS env var.
const WHITELIST_EMAILS = (process.env.WHITELIST_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const MAX_SESSION_MESSAGES = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 15;
const OTP_THROTTLE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_THROTTLE_MAX = 3;

@Injectable()
export class PublicAdvisorService {
  private readonly logger = new Logger(PublicAdvisorService.name);
  private mailer: nodemailer.Transporter | null = null;

  // In-memory stores (keyed by email)
  private chatHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
  private transcripts = new Map<string, string>(); // sanitized text
  private rateLimits = new Map<string, number[]>(); // timestamps of messages
  private otpThrottles = new Map<string, number[]>(); // timestamps of OTP requests

  constructor(
    @InjectRepository(OtpCode) private otpRepo: Repository<OtpCode>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
    private ragService: RagService,
    private ferpaSanitizer: FerpaSanitizer,
  ) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    if (smtpUser && smtpPass) {
      this.mailer = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });
    }
  }

  private isAllowedEmail(email: string): boolean {
    const lower = email.toLowerCase();
    if (WHITELIST_EMAILS.includes(lower)) return true;
    const domain = lower.split('@')[1];
    return domain === 'na.edu' || domain?.endsWith('.na.edu');
  }

  async sendCode(email: string): Promise<{ message: string; expires_in: number }> {
    const lower = email.toLowerCase().trim();
    if (!this.isAllowedEmail(lower)) {
      throw new BadRequestException('Only NAU students (@na.edu) can use this service');
    }

    // OTP throttle: 3 per 10 min per email
    const now = Date.now();
    const otpTimestamps = this.otpThrottles.get(lower) ?? [];
    const recentOtps = otpTimestamps.filter((t) => now - t < OTP_THROTTLE_WINDOW_MS);
    if (recentOtps.length >= OTP_THROTTLE_MAX) {
      throw new BadRequestException('Too many code requests. Please wait a few minutes.');
    }
    recentOtps.push(now);
    this.otpThrottles.set(lower, recentOtps);

    // Get or create user
    let user = await this.userRepo.findOne({ where: { email: lower } });
    if (!user) {
      user = this.userRepo.create({ email: lower, firstName: '', lastName: '' });
      await this.userRepo.save(user);
    }

    // Invalidate previous OTPs
    await this.otpRepo.update(
      { userId: user.id, isUsed: false },
      { isUsed: true },
    );

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.otpRepo.save(this.otpRepo.create({ userId: user.id, codeHash, expiresAt }));

    await this.sendOtpEmail(lower, code);

    return { message: 'Verification code sent', expires_in: 600 };
  }

  async verifyCode(email: string, code: string): Promise<{ sessionToken: string }> {
    const lower = email.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email: lower } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const otp = await this.otpRepo.findOne({
      where: { userId: user.id, isUsed: false },
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('Code expired or not found');
    }

    if (otp.attempts >= 5) {
      otp.isUsed = true;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException('Invalid code');
    }

    otp.isUsed = true;
    await this.otpRepo.save(otp);

    // Issue lightweight JWT (24h TTL)
    const sessionToken = this.jwtService.sign(
      { email: lower, type: 'student-advisor' },
      { expiresIn: '24h' },
    );

    return { sessionToken };
  }

  validateSessionToken(token: string): { email: string } {
    try {
      const payload = this.jwtService.verify(token) as { email: string; type: string };
      if (payload.type !== 'student-advisor') {
        throw new UnauthorizedException('Invalid session');
      }
      return { email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  private checkRateLimit(email: string): void {
    const now = Date.now();
    const timestamps = this.rateLimits.get(email) ?? [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new ForbiddenException('Rate limit exceeded. Please wait a few minutes.');
    }
    recent.push(now);
    this.rateLimits.set(email, recent);
  }

  private getMessageCount(email: string): number {
    const history = this.chatHistory.get(email) ?? [];
    return history.filter((m) => m.role === 'user').length;
  }

  async *streamChat(email: string, message: string): AsyncGenerator<StreamEvent> {
    // Check rate limit
    this.checkRateLimit(email);

    // Check session message limit
    const messageCount = this.getMessageCount(email);
    if (messageCount >= MAX_SESSION_MESSAGES) {
      yield { type: 'error', message: 'Session message limit reached (30). Please start a new conversation.' };
      yield { type: 'done' };
      return;
    }

    const sanitizedMessage = this.ferpaSanitizer.sanitizeUserMessage(message);

    // Get history
    const history = this.chatHistory.get(email) ?? [];

    // Get transcript (if uploaded)
    const transcriptText = this.transcripts.get(email);

    // Enrich RAG query with transcript context if available
    let ragQuery = sanitizedMessage;
    if (transcriptText) {
      const majorMatch = transcriptText.match(/(?:major|program|degree)[:\s]*([A-Za-z\s]+?)(?:\n|,|;)/i);
      const deptMatch = transcriptText.match(/(?:department|dept)[:\s]*([A-Za-z\s]+?)(?:\n|,|;)/i);
      const extras: string[] = [];
      if (majorMatch?.[1]) extras.push(majorMatch[1].trim());
      if (deptMatch?.[1]) extras.push(deptMatch[1].trim());
      if (extras.length) ragQuery = `${sanitizedMessage} ${extras.join(' ')} degree requirements courses`;
    }
    const ragChunks = await this.ragService.search(ragQuery, 5).catch(() => []);

    // Build context — limit total size to keep Claude fast
    const parts: string[] = [];

    if (transcriptText) {
      // Limit transcript to 4000 chars to keep response time under 30s
      const trimmedTranscript = transcriptText.length > 4000
        ? transcriptText.substring(0, 4000) + '\n\n[Transcript truncated — showing first 4000 characters]'
        : transcriptText;
      parts.push(`## Student Academic Record\n${trimmedTranscript}`);
    }

    if (ragChunks.length > 0) {
      const ragText = ragChunks.map((c: { content: string; metadata?: Record<string, unknown> }) => {
        const title = (c.metadata as Record<string, unknown>)?.title || '';
        return title ? `### ${title}\n${c.content}` : c.content;
      }).join('\n\n---\n\n');
      parts.push(`## NAU Policies & Degree Requirements\n${ragText}`);
    }

    // Keep only last 10 messages for context (reduce prompt size)
    const recentHistory = history.slice(-10);
    const historyText = recentHistory
      .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    // Build input with context — CLAUDE.md is read automatically from advisor-agent/
    const contextParts = [
      parts.length > 0 ? parts.join('\n\n') : '',
      historyText ? `## Conversation so far\n${historyText}` : '',
      `## Student Question\n${sanitizedMessage}`,
    ].filter(Boolean).join('\n\n');

    let fullResponse = '';
    try {
      const responsePromise = this.callClaudeAsync(contextParts);
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

      // Sanitize Claude's response — remove any PII that leaked through
      fullResponse = this.sanitizeResponse(fullResponse);

      // Save to in-memory history
      history.push({ role: 'user', content: sanitizedMessage });
      history.push({ role: 'assistant', content: fullResponse });
      this.chatHistory.set(email, history);

      this.logger.log(`[ANALYTICS] email=${email} msg=${messageCount + 1}/${MAX_SESSION_MESSAGES} transcript=${!!transcriptText} query="${sanitizedMessage.substring(0, 80)}"`);

      yield { type: 'delta', content: fullResponse };
      yield { type: 'done' };
    } catch (err) {
      this.logger.error(`Public advisor Claude error: ${(err as Error).message}`);
      yield { type: 'delta', content: 'Unable to process request. Please try again.' };
      yield { type: 'done' };
    }
  }

  async uploadTranscript(email: string, file: Express.Multer.File): Promise<{ status: string; message: string }> {
    if (!file.mimetype.includes('pdf') && !file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are allowed');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 10 MB');
    }

    // Extract text via PyMuPDF
    const rawText = await this.extractText(file.buffer);
    if (!rawText) {
      throw new BadRequestException('Could not extract text from PDF');
    }

    // Sanitize via FerpaSanitizer (regex-based, lightweight)
    const sanitized = this.ferpaSanitizer.sanitizeUserMessage(rawText);

    // Extra PII scrubbing for transcripts
    const cleaned = sanitized
      // SSN variants: 123-45-6789, 123.45.6789, 123456789, 123 45 6789
      .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[SSN REDACTED]')
      // Student IDs: A12345678, S1234567, N12345678
      .replace(/\b[A-Z]\d{7,8}\b/g, '[STUDENT ID REDACTED]')
      // Phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE REDACTED]')
      // Date of birth patterns: 01/15/1999, 1999-01-15, Jan 15 1999, January 15, 1999
      .replace(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g, '[DOB REDACTED]')
      .replace(/\b(19|20)\d{2}[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/g, '[DOB REDACTED]')
      .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+(19|20)\d{2}\b/gi, '[DOB REDACTED]')
      // Name lines in transcript: "Name: John Smith", "Student: ...", "Advisor: ...", "Instructor: ..."
      .replace(/^(Name|Student|Student Name|Advisor|Academic Advisor|Instructor|Faculty|Counselor|Professor|Dean)\s*[:]\s*.+$/gim, '$1: [NAME REDACTED]')
      // "Prepared for: Name" or "Issued to: Name"
      .replace(/^(Prepared for|Issued to|Attention|Attn)\s*[:]\s*.+$/gim, '$1: [NAME REDACTED]')
      // Address patterns: street number + street name
      .replace(/\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)\b\.?/gi, '[ADDRESS REDACTED]');

    // Store in memory only
    this.transcripts.set(email, cleaned);

    return { status: 'ok', message: 'Transcript loaded' };
  }

  newSession(email: string): { status: string } {
    this.chatHistory.delete(email);
    this.transcripts.delete(email);
    return { status: 'ok' };
  }

  getSessionInfo(email: string): { messageCount: number; maxMessages: number; hasTranscript: boolean } {
    return {
      messageCount: this.getMessageCount(email),
      maxMessages: MAX_SESSION_MESSAGES,
      hasTranscript: this.transcripts.has(email),
    };
  }

  private sanitizeResponse(text: string): string {
    // Remove any PII that Claude might have included from transcript
    return text
      // SSN
      .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[REDACTED]')
      // Student IDs
      .replace(/\b[A-Z]\d{7,8}\b/g, '[REDACTED]')
      // Phone numbers (except NAU official: 832-230-5555)
      .replace(/\b(?!832[-.]?230[-.]?5555)\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED]')
      // Email addresses (except @na.edu official ones)
      .replace(/[a-zA-Z0-9._%+-]+@(?!na\.edu)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED]');
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

  private callClaudeAsync(input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = this.buildClaudeEnv();
      const proc = spawn(CLAUDE_BIN, [
        '-p', '--output-format', 'json',
        '--permission-mode', 'bypassPermissions',
        '--model', 'sonnet',
        '--allowedTools', '',
      ], { env, cwd: AGENT_CWD });
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

  private async extractText(pdfBuffer: Buffer): Promise<string> {
    const tmpPath = `/tmp/public_transcript_${Date.now()}.pdf`;
    require('fs').writeFileSync(tmpPath, pdfBuffer);
    try {
      const result = execFileSync('python3', ['-c', `
import fitz, sys
doc = fitz.open(sys.argv[1])
print(''.join(p.get_text() for p in doc))
`, tmpPath], { timeout: 30000, encoding: 'utf8' });
      return result;
    } catch (err) {
      this.logger.error('PDF extraction failed', err);
      throw new Error('Could not extract text from PDF');
    } finally {
      try { require('fs').unlinkSync(tmpPath); } catch { }
    }
  }

  private async sendOtpEmail(email: string, code: string): Promise<void> {
    if (!this.mailer) {
      console.log(`[DEV] Public advisor OTP for ${email}: ${code}`);
      return;
    }

    try {
      await this.mailer.sendMail({
        from: this.config.get<string>('EMAIL_FROM', 'noreply@na.edu'),
        to: email,
        subject: 'Your NAU AI Advisor verification code',
        html: `
          <h2>Your verification code</h2>
          <p>Your one-time code is: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>
          <p>This code expires in 10 minutes. Do not share it with anyone.</p>
          <p style="color:#666;font-size:12px">NAU AI Academic Advisor</p>
        `,
      });
      this.logger.log(`OTP email sent to ${email}`);
    } catch (err) {
      this.logger.error('Failed to send OTP email:', err);
      console.log(`[DEV] Public advisor OTP for ${email}: ${code}`);
    }
  }
}
