import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  STUDENT = 'student',
  ADMIN = 'admin',
  ADVISOR = 'advisor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  profile: {
    major?: string;
    concentration?: string;
    yearLevel?: string;
    creditHoursCompleted?: number;
    currentGPA?: number;
    completedCourses?: string[];
    notes?: string;
    updatedAt?: string;
  };


  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
