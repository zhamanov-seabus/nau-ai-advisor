import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private openai: OpenAI;

  constructor(
    @InjectRepository(KnowledgeChunk) private chunkRepo: Repository<KnowledgeChunk>,
    private config: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: config.get('OPENAI_API_KEY') });
  }

  private isApiKeyConfigured(): boolean {
    const key = this.config.get<string>('OPENAI_API_KEY');
    return !!key && !key.includes('xxx') && key.startsWith('sk-') && key.length > 20;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isApiKeyConfigured()) {
      this.logger.warn('OPENAI_API_KEY not configured — using zero embeddings (dev mode)');
      return new Array(1536).fill(0);
    }
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8192),
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.warn(`Embedding generation failed: ${error.message} — using zero embeddings`);
      return new Array(1536).fill(0);
    }
  }

  // Keep legacy alias for backward compatibility
  async getEmbedding(text: string): Promise<number[]> {
    return this.generateEmbedding(text);
  }

  chunkText(text: string, type: 'reference' | 'policy'): string[] {
    // reference (courses, contacts): ~256 tokens, overlap 30 → 1024 chars, overlap 120
    // policy (policies, degree plans): ~512 tokens, overlap 50 → 2048 chars, overlap 200
    const maxChars = type === 'reference' ? 1024 : 2048;
    const overlapChars = type === 'reference' ? 120 : 200;

    // Split by double newlines (paragraphs/sections)
    const paragraphs = text.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      const candidate = current ? current + '\n\n' + trimmed : trimmed;

      if (candidate.length > maxChars && current.length > 0) {
        chunks.push(current.trim());
        // Overlap: keep last overlapChars characters of current, don't break mid-sentence
        const overlapSource = current.slice(-overlapChars * 2);
        const sentenceBreak = overlapSource.lastIndexOf('. ');
        const overlap = sentenceBreak !== -1
          ? overlapSource.slice(sentenceBreak + 2)
          : overlapSource.slice(-overlapChars);
        current = overlap ? overlap + '\n\n' + trimmed : trimmed;
      } else {
        current = candidate;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.filter(c => c.length > 10);
  }

  async search(query: string, limit: number = 8): Promise<KnowledgeChunk[]> {
    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    return this.chunkRepo.query(
      `SELECT * FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2`,
      [embeddingStr, limit],
    );
  }

  async searchWithMetadata(
    query: string,
    options?: { department?: string; limit?: number },
  ): Promise<KnowledgeChunk[]> {
    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;
    const limit = options?.limit ?? 8;

    if (options?.department) {
      return this.chunkRepo.query(
        `SELECT * FROM knowledge_chunks WHERE metadata->>'department' = $1 ORDER BY embedding <=> $2::vector LIMIT $3`,
        [options.department, embeddingStr, limit],
      );
    }

    return this.chunkRepo.query(
      `SELECT * FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2`,
      [embeddingStr, limit],
    );
  }

  async retrieveContext(query: string, topK = 5): Promise<string> {
    try {
      const chunks = await this.search(query, topK);
      return chunks.map((c: KnowledgeChunk) => c.content).join('\n\n');
    } catch {
      return '';
    }
  }

  async storeChunk(
    documentId: string,
    content: string,
    chunkIndex: number,
    metadata: Record<string, unknown> = {},
  ): Promise<KnowledgeChunk> {
    const embedding = await this.generateEmbedding(content);
    return this.chunkRepo.save(
      this.chunkRepo.create({ documentId, content, embedding, chunkIndex, metadata }),
    );
  }
}
