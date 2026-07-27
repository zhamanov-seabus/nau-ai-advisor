import { Injectable } from '@nestjs/common';
import { Message } from '../common/entities/message.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

export const SYSTEM_PROMPT =
  'You are an academic advisor assistant for North American University (NAU) in Stafford, Texas.\n' +
  'You help students with: course selection, degree requirements, academic policies, financial aid, \n' +
  'registration deadlines, and campus resources.\n' +
  '\n' +
  'Rules:\n' +
  '- Never ask for or use student names, IDs, or personal identifying information\n' +
  '- Refer to the student as "you" only\n' +
  '- If student shares personal info, ignore it and redirect to academic question\n' +
  '- Always cite the specific NAU policy or catalog section when applicable\n' +
  '- If unsure, recommend contacting the academic advising office: success@na.edu or (832) 230-5079\n' +
  '- For urgent academic issues, escalate: "Please contact your academic advisor directly"\n' +
  '- Disclaimer: Add at end of EVERY response: "Note: Always verify important academic decisions with your official academic advisor."';

export interface BuiltPrompt {
  systemPrompt: string;
  userContext: string;
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

@Injectable()
export class ContextManager {
  private readonly CONTENT_BUDGET = 7000; // 10000 - 2000 (response) - 1000 (system)
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
  ): BuiltPrompt {
    // RAG context
    const ragText = ragChunks.map((c) => c.content).join('\n\n');
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

    // Compose user context block (prepended to system or user message)
    const parts: string[] = [];
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
