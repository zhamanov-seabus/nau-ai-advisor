import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { Transcript } from '../common/entities/transcript.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Transcript) private transcriptRepo: Repository<Transcript>,
  ) {}

  findAllUsers(): Promise<User[]> {
    return this.usersRepo.find({ order: { createdAt: 'DESC' } });
  }

  async setUserRole(userId: string, role: UserRole): Promise<User | null> {
    await this.usersRepo.update(userId, { role });
    return this.usersRepo.findOne({ where: { id: userId } });
  }

  async toggleUserActive(userId: string, isActive: boolean): Promise<User | null> {
    await this.usersRepo.update(userId, { isActive });
    return this.usersRepo.findOne({ where: { id: userId } });
  }

  findAllTranscripts(): Promise<Transcript[]> {
    return this.transcriptRepo.find({ relations: { user: true }, order: { createdAt: 'DESC' } });
  }
}
