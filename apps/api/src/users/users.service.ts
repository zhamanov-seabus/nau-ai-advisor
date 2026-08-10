import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User, UserRole } from '../common/entities/user.entity';

export interface CreateUserDto {
  name?: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface FindAllQuery {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  status?: 'active' | 'inactive';
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private usersRepo: Repository<User>) {}

  async findAll(query: FindAllQuery = {}): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown>[] = [];
    const baseWhere: Record<string, unknown> = {};

    if (query.department) {
      baseWhere['department'] = query.department;
    }
    if (query.status !== undefined) {
      baseWhere['isActive'] = query.status === 'active';
    }

    if (query.search) {
      const term = `%${query.search}%`;
      where.push(
        { ...baseWhere, email: ILike(term) },
        { ...baseWhere, firstName: ILike(term) },
        { ...baseWhere, lastName: ILike(term) },
      );
    } else {
      where.push(baseWhere);
    }

    const [data, total] = await this.usersRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.usersRepo.create({
      email: dto.email,
      firstName: dto.firstName ?? (dto.name ? dto.name.split(" ")[0] : ""),
      lastName: dto.lastName ?? (dto.name ? dto.name.split(" ").slice(1).join(" ") : ""),
      department: dto.department,
      role: dto.role ?? UserRole.STUDENT,
      isActive: dto.isActive ?? true,
    });
    return this.usersRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.usersRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.usersRepo.remove(user);
  }

  // Kept for backwards compatibility with existing UsersController
  findOne(id: string): Promise<User> {
    return this.findById(id);
  }
}
