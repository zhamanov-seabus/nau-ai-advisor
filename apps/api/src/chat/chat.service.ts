import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message, MessageRole } from '../common/entities/message.entity';
import { RagService } from '../rag/rag.service';
import { TranscriptService } from '../transcript/transcript.service';
import { EncryptionService } from '../common/encryption.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';
import { ContextManager } from './context.manager';

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number };

const MOCK_RESPONSE = 'AI chat is not configured. Please set ANTHROPIC_API_KEY.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private anthropic: Anthropic;

  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    private ragService: RagService,
    private transcriptService: TranscriptService,
    private encryptionService: EncryptionService,
    private ferpaSanitizer: FerpaSanitizer,
    private contextManager: ContextManager,
    private config: ConfigService,
  ) {
    this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') });
  }

  private isApiKeyConfigured(): boolean {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    return !!key && !key.includes('xxx') && key.startsWith('sk-ant-') && key.length > 20;
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
    if (!this.isApiKeyConfigured()) {
      yield { type: 'delta', content: MOCK_RESPONSE };
      yield { type: 'done', tokensUsed: 0 };
      return;
    }

    const sanitizedQuestion = this.ferpaSanitizer.sanitizeUserMessage(question);

    const session = await this.getOrCreateSession(userId);

    const [ragChunks, transcriptData, rawHistory] = await Promise.all([
      this.ragService.search(sanitizedQuestion, 8).catch(() => []),
      this.transcriptService.getStudentTranscript(userId).catch(() => null),
      this.messageRepo
        .find({
          where: { sessionId: session.id },
          order: { createdAt: 'ASC' },
          take: 20,
        })
        .catch(() => []),
    ]);

    // Decrypt history
    const history = rawHistory.map((msg) => {
      try {
        return { ...msg, content: this.encryptionService.decrypt(msg.content) };
      } catch {
        return msg;
      }
    });

    const { systemPrompt, userContext, historyMessages } = this.contextManager.buildPrompt(
      userId,
      sanitizedQuestion,
      ragChunks,
      transcriptData,
      history,
    );

    const fullSystem = userContext ? `${systemPrompt}\n\n${userContext}` : systemPrompt;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...historyMessages,
      { role: 'user', content: sanitizedQuestion },
    ];

    let fullResponse = '';

    try {
      const stream = this.anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: fullSystem,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullResponse += event.delta.text;
          yield { type: 'delta', content: event.delta.text };
        }
      }

      const finalMsg = await stream.finalMessage();
      const tokensUsed = finalMsg.usage.output_tokens;

      // Save user message (encrypted)
      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.USER,
          content: this.encryptionService.encrypt(sanitizedQuestion),
        }),
      );

      // Save assistant message (encrypted)
      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.ASSISTANT,
          content: this.encryptionService.encrypt(fullResponse),
          tokensUsed,
        }),
      );

      session.lastMessageAt = new Date();
      await this.sessionRepo.save(session);

      yield { type: 'done', tokensUsed };
    } catch (err) {
      this.logger.error(`Claude stream error: ${err.message}`);
      const errorMsg = 'Unable to process request. Please try again or contact your academic advisor.';
      yield { type: 'delta', content: errorMsg };
      yield { type: 'done', tokensUsed: 0 };
    }
  }
}
