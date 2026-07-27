import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum TranscriptStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

@Entity('transcripts')
export class Transcript {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy: User;

  @Column({ name: 'uploaded_by', nullable: true })
  uploadedById: string;

  @Column({ name: 'parsed_data', type: 'jsonb', nullable: true })
  parsedData: Record<string, unknown> | undefined;

  @Column({ name: 'sanitized_text', type: 'text', nullable: true })
  sanitizedText: string | undefined;

  @Column({
    type: 'enum',
    enum: TranscriptStatus,
    default: TranscriptStatus.PENDING,
  })
  status: TranscriptStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | undefined;

  @Column({ name: 'original_filename', type: 'varchar', nullable: true })
  originalFilename: string | undefined;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
