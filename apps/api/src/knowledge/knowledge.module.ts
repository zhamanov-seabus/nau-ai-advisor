import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeProcessor } from './knowledge.processor';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeChunk]),
    BullModule.registerQueue({ name: 'knowledge-indexing' }),
    RagModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessor],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
