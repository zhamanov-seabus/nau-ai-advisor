import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { RagService } from '../rag/rag.service';

@Processor('knowledge-indexing')
export class KnowledgeProcessor {
  private readonly logger = new Logger(KnowledgeProcessor.name);

  constructor(
    @InjectRepository(KnowledgeDocument) private docRepo: Repository<KnowledgeDocument>,
    private ragService: RagService,
  ) {}

  @Process('index-document')
  async handleIndexDocument(
    job: Job<{ documentId: string; buffer: string; filename: string; mimetype: string }>,
  ) {
    const { documentId, buffer, filename } = job.data;
    this.logger.log(`Processing document ${filename} (id: ${documentId})`);

    try {
      const text = Buffer.from(buffer, 'base64').toString('utf-8');

      // Determine chunk type from filename/mimetype
      const lowerName = filename.toLowerCase();
      const isReference =
        lowerName.includes('course') ||
        lowerName.includes('contact') ||
        lowerName.includes('schedule');
      const chunkType: 'reference' | 'policy' = isReference ? 'reference' : 'policy';

      const chunks = this.ragService.chunkText(text, chunkType);

      for (let i = 0; i < chunks.length; i++) {
        await this.ragService.storeChunk(documentId, chunks[i], i, { filename });
        await job.progress(Math.round(((i + 1) / chunks.length) * 100));
      }

      await this.docRepo.update(documentId, { status: 'ready', chunkCount: chunks.length });
      this.logger.log(`Document ${filename}: indexed ${chunks.length} chunks`);
    } catch (error) {
      this.logger.error(`Failed to index document ${filename}: ${error.message}`);
      await this.docRepo.update(documentId, { status: 'error' });
      throw error;
    }
  }
}
