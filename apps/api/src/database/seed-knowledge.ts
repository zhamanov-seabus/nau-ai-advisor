import { DataSource, Repository } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';

config({ path: join(__dirname, '../../.env') });

import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { User } from '../common/entities/user.entity';

const NAU_KB_PATH =
  process.env.NAU_KB_PATH || './knowledge-base/NAU_KNOWLEDGE_BASE.md';
const EMBEDDING_DIM = 1536;

function isApiKeyConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !key.includes('xxx') && key.startsWith('sk-') && key.length > 20;
}

let openaiClient: OpenAI | null = null;

async function generateEmbedding(text: string): Promise<number[]> {
  if (!isApiKeyConfigured()) {
    return new Array(EMBEDDING_DIM).fill(0);
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8192),
  });
  return response.data[0].embedding;
}

function chunkText(text: string, type: 'reference' | 'policy'): string[] {
  const maxChars = type === 'reference' ? 1024 : 2048;
  const overlapChars = type === 'reference' ? 120 : 200;

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const candidate = current ? current + '\n\n' + trimmed : trimmed;

    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      const overlapSource = current.slice(-overlapChars * 2);
      const sentenceBreak = overlapSource.lastIndexOf('. ');
      const overlap = sentenceBreak !== -1
        ? overlapSource.slice(sentenceBreak + 2)
        : overlapSource.slice(-overlapChars);
      current = overlap ? overlap + '\n\n' + trimmed : trimmed;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 10);
}

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, KnowledgeDocument, KnowledgeChunk],
  synchronize: true,
});

async function seedKnowledge() {
  console.log('Connecting to database...');
  await dataSource.initialize();

  const docRepo: Repository<KnowledgeDocument> = dataSource.getRepository(KnowledgeDocument);
  const chunkRepo: Repository<KnowledgeChunk> = dataSource.getRepository(KnowledgeChunk);

  const usingRealEmbeddings = isApiKeyConfigured();
  console.log(
    usingRealEmbeddings
      ? 'Using real OpenAI embeddings (text-embedding-3-small)'
      : 'OPENAI_API_KEY is placeholder — using zero embeddings (dev mode)',
  );

  console.log(`Reading knowledge base from: ${NAU_KB_PATH}`);
  const content = fs.readFileSync(NAU_KB_PATH, 'utf-8');

  // Remove existing NAU KB document if present
  let doc = await docRepo.findOne({ where: { filename: 'NAU_KNOWLEDGE_BASE.md' } });
  if (doc) {
    console.log('Removing existing NAU KB data...');
    await chunkRepo.delete({ documentId: doc.id });
    await docRepo.update(doc.id, { status: 'processing', chunkCount: 0 });
  } else {
    doc = await docRepo.save(
      docRepo.create({
        filename: 'NAU_KNOWLEDGE_BASE.md',
        fileType: 'text/markdown',
        description: 'NAU Academic Advisor Knowledge Base — Auto-indexed',
        status: 'processing',
      }),
    );
  }

  // Split by ## headings
  const rawSections = content.split(/(?=^## )/m).filter(s => s.trim().length > 0);
  console.log(`Found ${rawSections.length} sections`);

  let chunkIndex = 0;
  let sectionsProcessed = 0;

  for (const section of rawSections) {
    const titleMatch = section.match(/^##+ (.+)/m);
    const sectionTitle = titleMatch ? titleMatch[1].trim() : 'General';

    const lower = section.toLowerCase();
    const isReference =
      lower.includes('course') ||
      lower.includes('credit') ||
      lower.includes('contact') ||
      lower.includes('phone') ||
      lower.includes('email') ||
      lower.includes('schedule') ||
      lower.includes('tuition') ||
      lower.includes('fee');
    const chunkType: 'reference' | 'policy' = isReference ? 'reference' : 'policy';

    const chunks = chunkText(section, chunkType);
    process.stdout.write(
      `[${sectionsProcessed + 1}/${rawSections.length}] "${sectionTitle}" (${chunkType}): ${chunks.length} chunks\n`,
    );

    for (const chunkContent of chunks) {
      const embedding = await generateEmbedding(chunkContent);
      await chunkRepo.save(
        chunkRepo.create({
          documentId: doc.id,
          content: chunkContent,
          embedding,
          chunkIndex,
          metadata: {
            source: 'NAU_KNOWLEDGE_BASE',
            section: sectionTitle,
            chunkType,
          },
        }),
      );
      chunkIndex++;
    }

    sectionsProcessed++;
  }

  await docRepo.update(doc.id, { status: 'ready', chunkCount: chunkIndex });

  console.log(`\nDone! ${chunkIndex} chunks indexed from ${sectionsProcessed} sections.`);

  // Verify
  const count = await chunkRepo.count({ where: { documentId: doc.id } });
  console.log(`Verification: ${count} chunks in knowledge_chunks table for this document.`);

  await dataSource.destroy();
}

seedKnowledge().catch((err) => {
  console.error('Knowledge seed failed:', err);
  process.exit(1);
});
