import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PublicAdvisorController } from './public-advisor.controller';
import { PublicAdvisorService } from './public-advisor.service';
import { OtpCode } from '../common/entities/otp-code.entity';
import { User } from '../common/entities/user.entity';
import { RagModule } from '../rag/rag.module';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';

@Module({
  imports: [
    TypeOrmModule.forFeature([OtpCode, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
    RagModule,
  ],
  controllers: [PublicAdvisorController],
  providers: [PublicAdvisorService, FerpaSanitizer],
})
export class PublicAdvisorModule {}
