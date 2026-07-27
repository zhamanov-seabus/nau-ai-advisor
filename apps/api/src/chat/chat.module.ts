import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ContextManager } from './context.manager';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message } from '../common/entities/message.entity';
import { RagModule } from '../rag/rag.module';
import { TranscriptModule } from '../transcript/transcript.module';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, Message]),
    RagModule,
    TranscriptModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ContextManager, FerpaSanitizer, EncryptionService],
})
export class ChatModule {}
