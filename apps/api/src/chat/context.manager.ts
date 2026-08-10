import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Message } from '../common/entities/message.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

function loadSystemPrompt(): string {
  // Look for system_prompt.md next to the project root (apps/api/)
  const candidates = [
    path.join(process.cwd(), 'system_prompt.md'),
    path.join(__dirname, '..', '..', 'system_prompt.md'),
    path.join(__dirname, '..', '..', '..', 'system_prompt.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  throw new Error('system_prompt.md not found. Checked: ' + candidates.join(', '));
}

export let SYSTEM_PROMPT = loadSystemPrompt();

export interface StudentProfile {
  major?: string;
  concentration?: string;
  yearLevel?: string;
  creditHoursCompleted?: number;
  currentGPA?: number;
  completedCourses?: string[];
  notes?: string;
  updatedAt?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userContext: string;
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const SECTION_URL_MAP: Array<[RegExp, string, string]> = [
  [/ACADEMIC CALENDAR/,                    'NAU Academic Calendar 2026-2027',  'https://na.edu/academics/academic-calendar/'],
  [/ADMISSIONS|UNDERGRADUATE.*ADMISSION|TRANSFER.*STUDENT|INTERNATIONAL.*ADMISSION/, 'NAU Admissions', 'https://na.edu/admissions/'],
  [/TUITION|FEE|PAYMENT|REFUND/,           'NAU Tuition & Fees',               'https://na.edu/tuition-and-fees/'],
  [/FINANCIAL AID|SCHOLARSHIP|STALLION|STARS|TASFA|TEXAS.*GRANT/, 'NAU Financial Aid', 'https://na.edu/financial-aid/'],
  [/COMP COURSE|CS COURSE|CS DEPARTMENT|COMPUTER SCIENCE COURSE|COMP.*DESCRIPTION/, 'CS Department', 'https://cs.na.edu/'],
  [/BUSINESS COURSE|BUSINESS DEPARTMENT|MBA.*DESCRIPTION|ACCT|BUSI|FINA|MNGT|MRKT/, 'Business Department', 'https://business.na.edu/'],
  [/DEGREE PLAN|DEGREE PROGRAM|BS COMPUTER|BS BUSINESS|MBA.*DEGREE|MS COMPUTER/, 'NAU Academic Catalog 2026-2027', 'https://www.na.edu/documents/academics/catalog.pdf'],
  [/ACADEMIC POLIC|GRADING|ATTENDANCE|GPA|INCOMPLETE|REPEATED COURSE/, 'NAU Academic Policies', 'https://na.edu/academics/'],
  [/STUDENT SERVICE|STUDENT SUCCESS|CAREER|TESTING|DISABILITY|STUDENT ORG/, 'Student Services', 'https://na.edu/student-services/'],
  [/INTERNATIONAL|ISO|F-1|CPT|OPT|SEVIS|I-20/, 'International Student Office', 'https://na.edu/international-student-office/'],
  [/HOUSING|RESIDENTIAL|CAMPUS LIFE/,      'Housing & Campus Life',            'https://na.edu/campus-life/'],
  [/REGISTRATION|ENROLLMENT|REGISTRAR|TRANSCRIPT|GRADUATION.*PROCESS/, 'Registrar', 'https://na.edu/registrar/'],
  [/LIBRARY/,                              'NAU Library',                      'https://na.edu/library/'],
  [/STUDENT ACCOUNT|BURSAR|PAYMENT PLAN|INSTALLMENT/, 'Student Accounts',      'https://na.edu/student-accounts/'],
  [/CANVAS|IT SERVICE|STUDENT EMAIL|TECH SUPPORT/, 'NAU IT Services',          'https://na.edu/it/'],
  [/TEACHER CERT|CERTIFICATION PROGRAM|TEXES|TCP/, 'NAU Teacher Certification', 'https://na.edu/education/teacher-certification/'],
  [/FACULTY DIRECTOR/,                     'NAU Faculty Directory',            'https://na.edu/academics/faculty/'],
  [/ACADEMIC PROGRAM|PROGRAM OVERVIEW/,    'NAU Academic Programs',            'https://na.edu/academics/'],
];

function getSourceInfo(metadata: Record<string, unknown>): { title: string; url: string } | null {
  const source = (metadata?.source as string) ?? '';
  const section = ((metadata?.section as string) ?? '').toUpperCase();
  const sourceUrl = metadata?.sourceUrl as string | undefined;

  // 1. Dedicated academic-calendar source (added via separate seeding)
  if (source === 'academic-calendar') {
    return { title: 'NAU Academic Calendar 2026-2027', url: 'https://na.edu/academics/academic-calendar/' };
  }

  // 2. URL extracted from section content during seeding — most specific
  if (sourceUrl) {
    // Derive a human-readable title from the section name (strip leading number)
    const rawTitle = (metadata?.section as string ?? 'NAU').replace(/^\d+\.\s*/, '').replace(/_/g, ' ');
    // Shorten overly long titles
    const title = rawTitle.length > 50 ? rawTitle.slice(0, 47) + '...' : rawTitle;
    return { title, url: sourceUrl };
  }

  // 3. Pattern-based fallback
  for (const [pattern, title, url] of SECTION_URL_MAP) {
    if (pattern.test(section)) return { title, url };
  }

  // 4. Generic NAU fallback
  if (source === 'NAU_KNOWLEDGE_BASE') {
    return { title: 'NAU', url: 'https://na.edu/' };
  }

  return null;
}

@Injectable()
export class ContextManager {
  private readonly CONTENT_BUDGET = 5500; // increased for 12 RAG chunks // keep context small for faster responses // 10000 - 2000 (response) - 1000 (system)
  private readonly RAG_BUDGET = Math.floor(this.CONTENT_BUDGET * 0.4); // 2800
  private readonly TRANSCRIPT_BUDGET = Math.floor(this.CONTENT_BUDGET * 0.3); // 2100
  private readonly HISTORY_BUDGET = Math.floor(this.CONTENT_BUDGET * 0.3); // 2100

  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars);
  }

  buildPrompt(
    _userId: string,
    _question: string,
    ragChunks: KnowledgeChunk[],
    transcriptData: {
      parsedData?: Record<string, unknown>;
      sanitizedText?: string;
    } | null,
    historyMessages: Message[],
    studentProfile?: StudentProfile | null,
  ): BuiltPrompt {
    // RAG context — include source tags so Claude can cite with hyperlinks
    const ragText = ragChunks.map((c) => {
      const src = getSourceInfo(c.metadata ?? {});
      const header = src ? `[Source: ${src.title} | ${src.url}]` : '';
      return header ? `${header}\n${c.content}` : c.content;
    }).join('\n\n---\n\n');
    const truncatedRag = this.truncateToTokens(ragText, this.RAG_BUDGET);

    // Transcript context
    let transcriptText = '';
    if (transcriptData?.sanitizedText) {
      transcriptText = transcriptData.sanitizedText;
    } else if (transcriptData?.parsedData) {
      transcriptText = JSON.stringify(transcriptData.parsedData);
    }
    const truncatedTranscript = this.truncateToTokens(transcriptText, this.TRANSCRIPT_BUDGET);

    // History — trim old messages if over budget
    let historyTokensUsed = 0;
    const trimmedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const msg = historyMessages[i];
      const tokens = this.countTokens(msg.content);
      if (historyTokensUsed + tokens > this.HISTORY_BUDGET) break;
      historyTokensUsed += tokens;
      trimmedHistory.unshift({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    // Student profile context
    let profileText = '';
    if (studentProfile && Object.keys(studentProfile).length > 0) {
      const lines: string[] = [];
      if (studentProfile.major) lines.push(`Major: ${studentProfile.major}`);
      if (studentProfile.concentration) lines.push(`Concentration: ${studentProfile.concentration}`);
      if (studentProfile.yearLevel) lines.push(`Year: ${studentProfile.yearLevel}`);
      if (studentProfile.creditHoursCompleted != null) lines.push(`Credits completed: ${studentProfile.creditHoursCompleted}`);
      if (studentProfile.currentGPA != null) lines.push(`Current GPA: ${studentProfile.currentGPA}`);
      if (studentProfile.completedCourses?.length) lines.push(`Completed courses: ${studentProfile.completedCourses.join(', ')}`);
      if (studentProfile.notes) lines.push(`Notes: ${studentProfile.notes}`);
      if (lines.length > 0) profileText = lines.join('\n');
    }

    // Compose user context block
    const parts: string[] = [];
    if (profileText) {
      parts.push(`## Student Profile\n${profileText}`);
    }
    if (truncatedRag) {
      parts.push(`## Relevant Academic Information\n${truncatedRag}`);
    }
    if (truncatedTranscript) {
      parts.push(`## Student Academic Record\n${truncatedTranscript}`);
    }
    const userContext = parts.join('\n\n');

    return { systemPrompt: SYSTEM_PROMPT, userContext, historyMessages: trimmedHistory };
  }
}
