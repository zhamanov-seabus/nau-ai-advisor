import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  Transcript,
  TranscriptStatus,
} from '../common/entities/transcript.entity';
import { User } from '../common/entities/user.entity';
import { EncryptionService } from '../common/encryption.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class TranscriptService {
  constructor(
    @InjectRepository(Transcript)
    private transcriptRepo: Repository<Transcript>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectQueue('transcript-processing')
    private transcriptQueue: Queue,
    private encryption: EncryptionService,
  ) {}

  async uploadTranscript(
    file: Express.Multer.File,
    studentId: string,
    adminId: string,
  ): Promise<{ status: string; transcriptId: string }> {
    if (!file.mimetype.includes('pdf') && !file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are allowed');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size must not exceed 10 MB');
    }

    let transcript = await this.transcriptRepo.findOne({ where: { userId: studentId } });

    if (!transcript) {
      transcript = this.transcriptRepo.create({ userId: studentId, uploadedById: adminId });
    } else {
      transcript.uploadedById = adminId;
    }

    transcript.status = TranscriptStatus.PENDING;
    transcript.originalFilename = file.originalname;
    transcript.parsedData = undefined;
    transcript.sanitizedText = undefined;
    transcript.errorMessage = undefined;

    await this.transcriptRepo.save(transcript);

    await this.transcriptQueue.add('process', {
      transcriptId: transcript.id,
      buffer: file.buffer.toString('base64'),
    });

    return { status: 'processing', transcriptId: transcript.id };
  }

  async getTranscriptStatus(
    studentId: string,
  ): Promise<{ status: TranscriptStatus; uploadedAt: Date | null; errorMessage?: string }> {
    const transcript = await this.transcriptRepo.findOne({ where: { userId: studentId } });
    if (!transcript) {
      return { status: TranscriptStatus.PENDING, uploadedAt: null };
    }
    return {
      status: transcript.status,
      uploadedAt: transcript.createdAt,
      errorMessage: transcript.errorMessage,
    };
  }

  async getStudentTranscript(
    userId: string,
  ): Promise<{ parsedData: Record<string, unknown> | undefined; sanitizedText: string | undefined }> {
    const transcript = await this.transcriptRepo.findOne({ where: { userId } });
    if (!transcript || transcript.status !== TranscriptStatus.READY) {
      throw new NotFoundException('Transcript not ready');
    }

    let decryptedText: string | undefined;
    if (transcript.sanitizedText) {
      try {
        decryptedText = this.encryption.decrypt(transcript.sanitizedText);
      } catch {
        decryptedText = undefined;
      }
    }

    return {
      parsedData: transcript.parsedData,
      sanitizedText: decryptedText,
    };
  }

  async deleteTranscript(studentId: string): Promise<void> {
    const result = await this.transcriptRepo.delete({ userId: studentId });
    if (!result.affected) {
      throw new NotFoundException('Transcript not found');
    }
  }

  async getAllTranscriptStatuses(query?: {
    status?: TranscriptStatus;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ data: Array<{ studentId: string; studentName: string; email: string; status: TranscriptStatus | 'missing'; updatedAt?: string }>; total: number }> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;

    const usersQb = this.usersRepo.createQueryBuilder('u');

    if (query?.search) {
      usersQb.andWhere('(u.email ILIKE :s OR u.first_name ILIKE :s OR u.last_name ILIKE :s)', { s: `%${query.search}%` });
    }

    const [users, total] = await usersQb
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const userIds = users.map((u) => u.id);
    const transcripts = userIds.length > 0
      ? await this.transcriptRepo.find({ where: { userId: In(userIds) } })
      : [];
    const tMap = new Map(transcripts.map((t) => [t.userId, t]));

    const data = users.map((u) => {
      const t = tMap.get(u.id);
      return {
        studentId: u.id,
        studentName: `${u.firstName} ${u.lastName}`.trim() || u.email,
        email: u.email,
        status: (t?.status ?? 'missing') as TranscriptStatus | 'missing',
        updatedAt: t?.updatedAt?.toISOString(),
      };
    });

    return { data, total };
  }

  async findByUser(userId: string): Promise<Transcript> {
    const transcript = await this.transcriptRepo.findOne({ where: { userId } });
    if (!transcript) throw new NotFoundException('Transcript not found');
    return transcript;
  }

  async updateStatus(
    id: string,
    status: TranscriptStatus,
    data?: {
      parsedData?: Record<string, unknown>;
      sanitizedText?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.transcriptRepo.update(id, { status, ...(data as any) });
  }
}
