import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagService } from './rag.service';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk])],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
