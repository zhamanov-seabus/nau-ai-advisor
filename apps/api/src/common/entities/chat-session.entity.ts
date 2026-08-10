import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'last_message_at', nullable: true })
  lastMessageAt: Date;

  // For advisor sessions: the student being discussed
  @Column({ name: 'target_user_id', nullable: true })
  targetUserId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
