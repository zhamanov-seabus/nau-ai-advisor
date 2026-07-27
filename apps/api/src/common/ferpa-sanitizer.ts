import { Injectable } from '@nestjs/common';

@Injectable()
export class FerpaSanitizer {
  sanitizeUserMessage(text: string): string {
    // Remove emails
    let sanitized = text.replace(
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
      '[REDACTED_EMAIL]',
    );

    // Remove SSNs (###-##-#### format)
    sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');

    // Remove phone numbers (various formats)
    sanitized = sanitized.replace(
      /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      '[REDACTED_PHONE]',
    );

    // Remove student IDs: S####### (7 digits) format
    sanitized = sanitized.replace(/\bS\d{7}\b/gi, '[REDACTED_STUDENT_ID]');

    // Remove standalone 9-digit numbers (likely SSN without dashes or student IDs)
    sanitized = sanitized.replace(/\b\d{9}\b/g, '[REDACTED_ID]');

    return sanitized;
  }
}
