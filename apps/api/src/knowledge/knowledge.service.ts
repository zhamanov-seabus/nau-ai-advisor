import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { RagService } from '../rag/rag.service';

const NAU_KB_PATH = './knowledge-base/NAU_KNOWLEDGE_BASE.md';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeDocument) private docRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk) private chunkRepo: Repository<KnowledgeChunk>,
    @InjectQueue('knowledge-indexing') private indexingQueue: Queue,
    private ragService: RagService,
  ) {}

  getDocuments(): Promise<KnowledgeDocument[]> {
    return this.docRepo.find({ order: { createdAt: 'DESC' } });
  }

  // Legacy alias
  findAll(): Promise<KnowledgeDocument[]> {
    return this.getDocuments();
  }

  async findOne(id: string): Promise<KnowledgeDocument> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async indexDocument(
    file: Express.Multer.File,
    description: string,
    adminId: string,
  ): Promise<{ documentId: string; status: string }> {
    const doc = await this.docRepo.save(
      this.docRepo.create({
        filename: file.originalname,
        fileType: file.mimetype,
        description,
        uploadedById: adminId,
        status: 'processing',
      }),
    );

    await this.indexingQueue.add('index-document', {
      documentId: doc.id,
      buffer: file.buffer.toString('base64'),
      filename: file.originalname,
      mimetype: file.mimetype,
    });

    return { documentId: doc.id, status: 'processing' };
  }

  // Legacy alias
  async uploadDocument(
    uploadedById: string,
    file: Express.Multer.File,
    description?: string,
  ): Promise<KnowledgeDocument> {
    await this.indexDocument(file, description ?? '', uploadedById);
    return this.docRepo.findOne({ where: { uploadedById }, order: { createdAt: 'DESC' } }) as Promise<KnowledgeDocument>;
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.findOne(id);
    await this.chunkRepo.delete({ documentId: id });
    await this.docRepo.remove(doc);
  }

  // Legacy alias
  async delete(id: string): Promise<void> {
    return this.deleteDocument(id);
  }

  async indexNAUKnowledgeBase(): Promise<{ chunksCreated: number; sectionsProcessed: number }> {
    this.logger.log('Starting NAU Knowledge Base indexing...');

    const content = fs.readFileSync(NAU_KB_PATH, 'utf-8');

    // Create or find the source document record
    let doc = await this.docRepo.findOne({ where: { filename: 'NAU_KNOWLEDGE_BASE.md' } });
    if (doc) {
      this.logger.log('Removing existing NAU KB chunks...');
      await this.chunkRepo.delete({ documentId: doc.id });
      await this.docRepo.update(doc.id, { status: 'processing', chunkCount: 0 });
    } else {
      doc = await this.docRepo.save(
        this.docRepo.create({
          filename: 'NAU_KNOWLEDGE_BASE.md',
          fileType: 'text/markdown',
          description: 'NAU Academic Advisor Knowledge Base — Auto-indexed',
          status: 'processing',
        }),
      );
    }

    // Split by ## headings into sections
    const sectionRegex = /^## .+$/m;
    const rawSections = content.split(/(?=^## )/m).filter(s => s.trim().length > 0);

    let chunkIndex = 0;
    let sectionsProcessed = 0;

    for (const section of rawSections) {
      const titleMatch = section.match(/^##+ (.+)/m);
      const sectionTitle = titleMatch ? titleMatch[1].trim() : 'General';

      // Determine chunk type based on section content
      const lower = section.toLowerCase();
      const isReference =
        lower.includes('course') ||
        lower.includes('credit') ||
        lower.includes('contact') ||
        lower.includes('phone') ||
        lower.includes('email') ||
        lower.includes('schedule') ||
        lower.includes('tuition') ||
        lower.includes('fee');
      const chunkType: 'reference' | 'policy' = isReference ? 'reference' : 'policy';

      const chunks = this.ragService.chunkText(section, chunkType);

      this.logger.log(
        `Section "${sectionTitle}" (${chunkType}): ${chunks.length} chunks`,
      );

      for (const chunkContent of chunks) {
        const embedding = await this.ragService.generateEmbedding(chunkContent);
        await this.chunkRepo.save(
          this.chunkRepo.create({
            documentId: doc.id,
            content: chunkContent,
            embedding,
            chunkIndex,
            metadata: {
              source: 'NAU_KNOWLEDGE_BASE',
              section: sectionTitle,
              chunkType,
            },
          }),
        );
        chunkIndex++;
      }

      sectionsProcessed++;
    }

    await this.docRepo.update(doc.id, { status: 'ready', chunkCount: chunkIndex });
    this.logger.log(`NAU KB indexing complete: ${chunkIndex} chunks from ${sectionsProcessed} sections`);

    return { chunksCreated: chunkIndex, sectionsProcessed };
  }
}
