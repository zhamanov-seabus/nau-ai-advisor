import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import axios from 'axios';

import { TranscriptService } from './transcript.service';
import { TranscriptStatus } from '../common/entities/transcript.entity';
import { EncryptionService } from '../common/encryption.service';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

import { execFileSync } from 'child_process';
import * as fsSync from 'fs';
import * as path from 'path';

interface ParsedAcademicData {
  courses: Array<{ code: string; grade: string; credits: number }>;
  cumulativeGpa: number | null;
  totalCredits: number | null;
  program: string | null;
  major: string | null;
  academicStatus: string | null;
}

@Processor('transcript-processing')
export class TranscriptProcessor {
  private readonly logger = new Logger(TranscriptProcessor.name);
  private readonly publisher: Redis;

  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {
    this.publisher = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  @Process('process')
  async handleProcess(job: Job<{ transcriptId: string; buffer: string }>): Promise<void> {
    const { transcriptId, buffer } = job.data;

    // a. Update status → processing
    await this.transcriptService.updateStatus(transcriptId, TranscriptStatus.PROCESSING);
    await this.publishStatus(transcriptId, TranscriptStatus.PROCESSING);

    try {
      // b. Extract raw text from PDF
      const pdfBuffer = Buffer.from(buffer, 'base64');
      let rawText = await this.extractText(pdfBuffer);

      if (!rawText) {
        await this.transcriptService.updateStatus(transcriptId, TranscriptStatus.ERROR, {
          errorMessage: 'Could not extract text from PDF',
        });
        await this.publishStatus(transcriptId, TranscriptStatus.ERROR);
        return;
      }

      // c. Structure academic data
      const parsedData = {};

      // d. FERPA sanitization
      const sanitizedText = await this.sanitizeText(rawText);

      // e. Encrypt sanitized text (never store raw text)
      const encryptedText = this.encryption.encrypt(sanitizedText);

      // Clear raw text from memory
      rawText = '';

      // f. Save result
      await this.transcriptService.updateStatus(transcriptId, TranscriptStatus.READY, {
        parsedData: parsedData as unknown as Record<string, unknown>,
        sanitizedText: encryptedText,
      });

      // g. Emit WebSocket event via Redis pub/sub
      await this.publishStatus(transcriptId, TranscriptStatus.READY);
    } catch (error) {
      this.logger.error(`Failed to process transcript ${transcriptId}`, error);
      await this.transcriptService.updateStatus(transcriptId, TranscriptStatus.ERROR, {
        errorMessage: error instanceof Error ? error.message : 'Unknown processing error',
      });
      await this.publishStatus(transcriptId, TranscriptStatus.ERROR);
    }
  }

  private async extractText(pdfBuffer: Buffer): Promise<string> {
    // Use PyMuPDF via Python subprocess for reliable PDF text extraction
    const tmpPath = `/tmp/transcript_${Date.now()}.pdf`;
    require('fs').writeFileSync(tmpPath, pdfBuffer);
    try {
      const result = execFileSync('python3', ['-c', `
import fitz, sys
doc = fitz.open(sys.argv[1])
print(''.join(p.get_text() for p in doc))
`, tmpPath], { timeout: 30000, encoding: 'utf8' });
      return result;
    } catch (err) {
      this.logger.error('PDF extraction failed', err);
      throw new Error('Could not extract text from PDF');
    } finally {
      try { require('fs').unlinkSync(tmpPath); } catch { }
    }
  }

    private async sanitizeText(text: string): Promise<string> {
    // Try Presidio analyzer + anonymizer
    try {
      const analyzeResponse = await axios.post(
        'http://localhost:5001/analyze',
        {
          text,
          language: 'en',
          entities: [
            'PERSON',
            'EMAIL_ADDRESS',
            'PHONE_NUMBER',
            'US_SSN',
            'DATE_TIME',
            'US_DRIVER_LICENSE',
            'US_PASSPORT',
            'LOCATION',
          ],
        },
        { timeout: 5000 },
      );

      const anonymizeResponse = await axios.post(
        'http://localhost:5002/anonymize',
        {
          text,
          analyzer_results: analyzeResponse.data,
          anonymizers: {
            DEFAULT: { type: 'replace', new_value: '[REDACTED]' },
          },
        },
        { timeout: 5000 },
      );

      return anonymizeResponse.data.text as string;
    } catch (err) {
      this.logger.warn('Presidio unavailable, using regex fallback for FERPA sanitization', err instanceof Error ? err.message : err);
      return this.regexSanitize(text);
    }
  }

  private regexSanitize(text: string): string {
    return text
      // Remove SSN patterns (XXX-XX-XXXX or XXXXXXXXX)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
      .replace(/\b\d{9}\b/g, '[ID REDACTED]')
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL REDACTED]')
      // Remove phone numbers
      .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE REDACTED]')
      // Remove dates of birth (common formats)
      .replace(/\b(?:dob|date of birth|birth\s?date)[:\s]+[^\n]{5,30}/gi, 'DOB: [REDACTED]')
      // Remove student ID patterns
      .replace(/\b(?:student\s*id|stu\s*id|id\s*no\.?)[:\s#]*\d{4,12}/gi, 'Student ID: [REDACTED]')
      // Remove full names on "Name:" lines
      .replace(/\b(?:name|student)[:\s]+[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g, 'Name: [REDACTED]');
  }

  private async publishStatus(transcriptId: string, status: TranscriptStatus): Promise<void> {
    try {
      await this.publisher.publish(
        'transcript:status',
        JSON.stringify({ transcriptId, status, timestamp: new Date().toISOString() }),
      );
    } catch (err) {
      this.logger.warn('Failed to publish status to Redis', err);
    }
  }
}
