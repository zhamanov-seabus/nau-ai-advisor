import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { User } from '../common/entities/user.entity';
import { TranscriptController, TranscriptAdminController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { TranscriptProcessor } from './transcript.processor';
import { TranscriptGateway } from './transcript.gateway';
import { Transcript } from '../common/entities/transcript.entity';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transcript, User]),
    BullModule.registerQueue({ name: 'transcript-processing' }),
  ],
  controllers: [TranscriptController, TranscriptAdminController],
  providers: [TranscriptService, TranscriptProcessor, TranscriptGateway, EncryptionService],
  exports: [TranscriptService, EncryptionService],
})
export class TranscriptModule {}
