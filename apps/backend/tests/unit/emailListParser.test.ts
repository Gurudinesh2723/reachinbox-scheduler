import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { isValidEmail, parseEmailListFile } from '../../src/utils/emailListParser';

const tempFiles: string[] = [];

async function writeTempFile(contents: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `lead-list-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  await fs.writeFile(filePath, contents, 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((f) => fs.unlink(f).catch(() => undefined)));
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('alice@example.com')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('missing-at-sign.com')).toBe(false);
    expect(isValidEmail('two@@at.com')).toBe(false);
  });
});

describe('parseEmailListFile', () => {
  it('extracts valid unique emails, ignoring invalid and duplicate entries', async () => {
    const file = await writeTempFile(['alice@example.com', 'invalid', 'bob@example.com', 'alice@example.com'].join('\n'));

    const result = await parseEmailListFile(file);

    expect(result.validEmails.sort()).toEqual(['alice@example.com', 'bob@example.com']);
    expect(result.validCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(result.totalLines).toBe(4);
  });

  it('handles an empty file', async () => {
    const file = await writeTempFile('');
    const result = await parseEmailListFile(file);
    expect(result.totalLines).toBe(0);
    expect(result.validCount).toBe(0);
  });

  it('supports simple CSV rows (email in the first column) and skips a header row', async () => {
    const file = await writeTempFile(['email,name', 'alice@example.com,Alice', 'bob@example.com,Bob'].join('\n'));
    const result = await parseEmailListFile(file);
    expect(result.validEmails.sort()).toEqual(['alice@example.com', 'bob@example.com']);
    expect(result.validCount).toBe(2);
  });

  it('is case-insensitive when deduplicating', async () => {
    const file = await writeTempFile(['Alice@Example.com', 'alice@example.com'].join('\n'));
    const result = await parseEmailListFile(file);
    expect(result.validCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
  });
});
