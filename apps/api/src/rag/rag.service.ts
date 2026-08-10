import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

const EMBED_URL = 'http://127.0.0.1:9430/embed';
const EMBED_DIM = 384;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @InjectRepository(KnowledgeChunk) private chunkRepo: Repository<KnowledgeChunk>,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await fetch(EMBED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.substring(0, 8192) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { embedding: number[] };
      return data.embedding;
    } catch (error) {
      this.logger.warn(`Embedding server unavailable: ${(error as Error).message} — using zero embeddings`);
      return new Array(EMBED_DIM).fill(0);
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    return this.generateEmbedding(text);
  }

  chunkText(text: string, type: 'reference' | 'policy'): string[] {
    const maxChars = type === 'reference' ? 1024 : 2048;
    const overlapChars = type === 'reference' ? 120 : 200;
    const paragraphs = text.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const candidate = current ? current + '\n\n' + trimmed : trimmed;
      if (candidate.length > maxChars && current.length > 0) {
        chunks.push(current.trim());
        const overlapSource = current.slice(-overlapChars * 2);
        const sentenceBreak = overlapSource.lastIndexOf('. ');
        const overlap = sentenceBreak !== -1 ? overlapSource.slice(sentenceBreak + 2) : overlapSource.slice(-overlapChars);
        current = overlap ? overlap + '\n\n' + trimmed : trimmed;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.filter(c => c.length > 10);
  }

  async search(query: string, limit = 8): Promise<KnowledgeChunk[]> {
    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;
    return this.chunkRepo.query(
      `SELECT * FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2`,
      [embeddingStr, limit],
    );
  }

  async searchWithMetadata(query: string, options?: { department?: string; limit?: number }): Promise<KnowledgeChunk[]> {
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
    } catch { return ''; }
  }

  async storeChunk(documentId: string, content: string, chunkIndex: number, metadata: Record<string, unknown> = {}): Promise<KnowledgeChunk> {
    const embedding = await this.generateEmbedding(content);
    return this.chunkRepo.save(
      this.chunkRepo.create({ documentId, content, embedding, chunkIndex, metadata }),
    );
  }
}
