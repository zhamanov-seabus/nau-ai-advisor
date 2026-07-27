import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController, AdminStudentsController } from './users.controller';
import { UsersService } from './users.service';
import { User } from '../common/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController, AdminStudentsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
