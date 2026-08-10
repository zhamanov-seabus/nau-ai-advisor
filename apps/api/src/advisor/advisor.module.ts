import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message } from '../common/entities/message.entity';
import { User } from '../common/entities/user.entity';
import { TranscriptModule } from '../transcript/transcript.module';
import { RagModule } from '../rag/rag.module';
import { EncryptionService } from '../common/encryption.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, Message, User]),
    TranscriptModule,
    RagModule,
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService, EncryptionService, FerpaSanitizer],
})
export class AdvisorModule {}
