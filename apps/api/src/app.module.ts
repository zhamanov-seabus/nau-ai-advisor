import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TranscriptModule } from './transcript/transcript.module';
import { ChatModule } from './chat/chat.module';
import { RagModule } from './rag/rag.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AdminModule } from './admin/admin.module';
import { User } from './common/entities/user.entity';
import { OtpCode } from './common/entities/otp-code.entity';
import { RefreshToken } from './common/entities/refresh-token.entity';
import { Transcript } from './common/entities/transcript.entity';
import { ChatSession } from './common/entities/chat-session.entity';
import { Message } from './common/entities/message.entity';
import { KnowledgeDocument } from './common/entities/knowledge-document.entity';
import { KnowledgeChunk } from './common/entities/knowledge-chunk.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60 * 60 * 1000, // 1 hour in ms
        limit: 100,           // default global limit; auth endpoint overrides per-route
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [
          User,
          OtpCode,
          RefreshToken,
          Transcript,
          ChatSession,
          Message,
          KnowledgeDocument,
          KnowledgeChunk,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get('REDIS_URL', 'redis://localhost:6379'),
      }),
    }),
    AuthModule,
    UsersModule,
    TranscriptModule,
    ChatModule,
    RagModule,
    KnowledgeModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
