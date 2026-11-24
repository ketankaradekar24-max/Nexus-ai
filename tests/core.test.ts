import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptSecret, decryptSecret } from '../server/utils/crypto.ts';
import {
  assertSafeExternalUrl,
  resolveSafePath,
  sanitizeCsvCell,
} from '../server/utils/security.ts';
import { MODEL_REGISTRY, estimateCostUsd, estimateTokens, getModelSpec } from '../server/ai/registry.ts';
import { chunkText, parseCsvRows } from '../server/routes/files.ts';
import { buildMessageLineage } from '../server/routes/conversations.ts';
import {
  checkSecretLeakage,
  compileVirtualWorkspace,
  validateVirtualFilePath,
} from '../server/routes/builder.ts';
import { classifyDomainReliability } from '../server/routes/research.ts';

test('AES-256-GCM encryptSecret / decryptSecret roundtrip masks key hint', () => {
  const original = 'sk-test-1234567890abcdef';
  const encrypted = encryptSecret(original);
  assert.notEqual(encrypted.encryptedKey, original);
  assert.equal(encrypted.keyHint, 'sk-t...cdef');
  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, original);
});

test('resolveSafePath blocks traversal outside confined directory', () => {
  const safe = resolveSafePath('/tmp/subai-storage', 'user-1/file.txt');
  assert.equal(safe, '/tmp/subai-storage/user-1/file.txt');
  assert.throws(() => resolveSafePath('/tmp/subai-storage', '../../etc/passwd'));
});

test('sanitizeCsvCell neutralizes spreadsheet formula injection', () => {
  assert.equal(sanitizeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
  assert.equal(sanitizeCsvCell('+SUM(A1:A2)'), '\'+SUM(A1:A2)');
  assert.equal(sanitizeCsvCell('@HYPERLINK("http://x")'), '"\'@HYPERLINK(""http://x"")"');
  assert.equal(sanitizeCsvCell('hello, world'), '"hello, world"');
  assert.equal(sanitizeCsvCell('normal'), 'normal');
});

test('assertSafeExternalUrl blocks loopback, metadata, private IPs, and file://', async () => {
  await assert.rejects(() => assertSafeExternalUrl('http://127.0.0.1:8080/secret'));
  await assert.rejects(() => assertSafeExternalUrl('http://169.254.169.254/latest/meta-data/'));
  await assert.rejects(() => assertSafeExternalUrl('http://10.0.0.5/internal'));
  await assert.rejects(() => assertSafeExternalUrl('http://localhost:3000'));
  await assert.rejects(() => assertSafeExternalUrl('file:///etc/passwd'));
  const valid = await assertSafeExternalUrl('https://1.1.1.1/dns-query');
  assert.equal(valid.hostname, '1.1.1.1');
});

test('parseCsvRows handles quoted fields, escaped quotes, and CRLF', () => {
  const csv = 'name,note\r\n"Ada, Lovelace","She wrote ""first"" code"\r\nBob,Simple';
  const rows = parseCsvRows(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['Ada, Lovelace', 'She wrote "first" code']);
  assert.deepEqual(rows[2], ['Bob', 'Simple']);
});

test('chunkText splits long documents cleanly with overlap', () => {
  const sample = 'A'.repeat(2500);
  const chunks = chunkText(sample, 1000, 200);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 1000);
  assert.equal(chunks[2].length, 900);
});

test('buildMessageLineage traverses branching conversation trees accurately', () => {
  const tree = [
    { id: 1, parentId: null, text: 'u1' },
    { id: 2, parentId: 1, text: 'a1-branchA' },
    { id: 3, parentId: 1, text: 'a1-branchB' },
    { id: 4, parentId: 3, text: 'u2-on-branchB' },
    { id: 5, parentId: 4, text: 'a2-on-branchB' },
  ];
  const branchB = buildMessageLineage(tree, 5);
  assert.deepEqual(
    branchB.map((m) => m.id),
    [1, 3, 4, 5],
  );
  const branchA = buildMessageLineage(tree, 2);
  assert.deepEqual(
    branchA.map((m) => m.id),
    [1, 2],
  );
});

test('Builder path validation, secret scanning, and virtual esbuild compilation', async () => {
  assert.equal(validateVirtualFilePath('/src/App.tsx'), 'src/App.tsx');
  assert.throws(() => validateVirtualFilePath('../secret.ts'));

  const leaked = checkSecretLeakage({ 'src/App.tsx': 'const k = process.env.GEMINI_API_KEY;' });
  assert.equal(leaked.length, 1);

  const validBuild = await compileVirtualWorkspace({
    'src/App.tsx': `export default function App() { return <div>Hello SUB AI</div>; }`,
  });
  assert.equal(validBuild.ok, true);
  assert.ok(validBuild.previewHtml.includes('<!doctype html>'));

  const invalidBuild = await compileVirtualWorkspace({
    'src/App.tsx': `export default function App() { return <div>Broken`,
  });
  assert.equal(invalidBuild.ok, false);
});

test('Model registry metadata, token estimation, cost math, and domain reliability', () => {
  const hydrogen = getModelSpec('gemini-4-hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.capabilities.streaming, true);
  assert.equal(hydrogen.capabilities.webGrounding, true);
  assert.ok(MODEL_REGISTRY.length >= 8);
  assert.ok(estimateTokens('Hello world!') >= 3);
  assert.ok(estimateCostUsd('gemini-4-hydrogen', 1_000_000, 1_000_000) > 0);

  assert.equal(classifyDomainReliability('arxiv.org'), 'high');
  assert.equal(classifyDomainReliability('mit.edu'), 'high');
  assert.equal(classifyDomainReliability('reddit.com'), 'unverified');
  assert.equal(classifyDomainReliability('example.com'), 'standard');
});
