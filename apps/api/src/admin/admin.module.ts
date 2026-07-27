import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../common/entities/user.entity';
import { Transcript } from '../common/entities/transcript.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Transcript])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
