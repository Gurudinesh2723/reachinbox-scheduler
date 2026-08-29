import fs from 'fs';
import readline from 'readline';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface ParsedEmailList {
  validEmails: string[];
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  totalLines: number;
}

function extractCandidate(line: string): string {
  // Supports both plain-text (one email per line) and simple CSV (email in
  // the first column, e.g. "email,name").
  return line.split(',')[0]?.trim() ?? '';
}

/**
 * Streams the uploaded file line-by-line instead of reading it fully into
 * memory, so a very large CSV/text lead list does not require buffering the
 * whole upload in process memory at once.
 */
export async function parseEmailListFile(filePath: string): Promise<ParsedEmailList> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const seen = new Set<string>();
  const validEmails: string[] = [];
  let totalLines = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    totalLines += 1;

    const candidate = extractCandidate(line).toLowerCase();

    // Skip an optional CSV header row such as "email" or "email,name".
    if (totalLines === 1 && (candidate === 'email' || candidate === 'email address')) {
      totalLines -= 1;
      continue;
    }

    if (!EMAIL_REGEX.test(candidate)) {
      invalidCount += 1;
      continue;
    }

    if (seen.has(candidate)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(candidate);
    validEmails.push(candidate);
  }

  return {
    validEmails,
    validCount: validEmails.length,
    duplicateCount,
    invalidCount,
    totalLines,
  };
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim().toLowerCase());
}
