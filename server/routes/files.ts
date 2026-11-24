import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { and, desc, eq, ilike, inArray } from 'drizzle-orm';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { documentChunks, uploadedFiles } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { generateTextUnary } from '../ai/adapters.ts';
import { resolveSafePath } from '../utils/security.ts';

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), 'storage', 'uploads');
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 35 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 6,
  },
});

export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.slice(0, 2000);
}

function decodeXmlEntities(str: string): string {
  return str
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

async function loadZipSafely(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  let totalUncompressed = 0;
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    const data = await file.async('uint8array');
    totalUncompressed += data.byteLength;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error('Archive exceeds uncompressed safety limit (possible ZIP bomb).');
    }
  }
  return zip;
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await loadZipSafely(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const out: string[] = [];
  for (const name of slideNames.slice(0, 80)) {
    const xml = await zip.files[name].async('string');
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
      decodeXmlEntities(m[1]),
    );
    if (texts.length > 0) {
      out.push(`[${path.basename(name, '.xml')}] ${texts.join(' ')}`);
    }
  }
  return out.join('\n\n');
}

async function extractXlsxSafe(buffer: Buffer): Promise<{
  text: string;
  tables: Array<{ name: string; rows: string[][] }>;
}> {
  const zip = await loadZipSafely(buffer);
  const sharedStringsXml = await zip.files['xl/sharedStrings.xml']?.async('string');
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    for (const siMatch of sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = Array.from(siMatch[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) =>
        decodeXmlEntities(m[1]),
      );
      sharedStrings.push(parts.join(''));
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const tables: Array<{ name: string; rows: string[][] }> = [];
  const textSections: string[] = [];

  for (const sName of sheetNames.slice(0, 10)) {
    const xml = await zip.files[sName].async('string');
    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const typeMatch = attrs.match(/t="([^"]+)"/);
        const cellType = typeMatch?.[1] ?? '';
        const valMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        const inlineMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        let value = '';
        if (cellType === 's' && valMatch) {
          const idx = Number(valMatch[1]);
          value = sharedStrings[idx] ?? '';
        } else if (cellType === 'inlineStr' && inlineMatch) {
          value = decodeXmlEntities(inlineMatch[1]);
        } else if (valMatch) {
          value = decodeXmlEntities(valMatch[1]);
        }
        cells.push(value);
      }
      if (cells.length > 0) rows.push(cells);
      if (rows.length >= 1000) break;
    }
    const label = path.basename(sName, '.xml');
    tables.push({ name: label, rows: rows.slice(0, 200) });
    textSections.push(
      `Sheet ${label}:\n` + rows.slice(0, 120).map((r) => r.join(' | ')).join('\n'),
    );
  }

  return { text: textSections.join('\n\n'), tables };
}

export function chunkText(text: string, maxChars = 1800, overlap = 200): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let idx = 0;
  while (idx < clean.length && chunks.length < 150) {
    chunks.push(clean.slice(idx, idx + maxChars));
    if (idx + maxChars >= clean.length) break;
    idx += maxChars - overlap;
  }
  return chunks;
}

const CODE_OR_TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.sql',
  '.html', '.css', '.scss', '.yaml', '.yml', '.xml', '.sh', '.java', '.go', '.rs', '.c', '.cpp',
]);

async function extractDocumentContent(
  file: Express.Multer.File,
): Promise<{ text: string; previewJson: Record<string, unknown> }> {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (ext === '.pdf' || mime === 'application/pdf') {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return {
        text: (result.text || '').trim(),
        previewJson: { kind: 'pdf', pages: result.pages?.length ?? 1 },
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (ext === '.docx' || mime.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return {
      text: (result.value || '').trim(),
      previewJson: { kind: 'docx' },
    };
  }

  if (ext === '.xlsx' || mime.includes('spreadsheetml')) {
    const extracted = await extractXlsxSafe(file.buffer);
    return {
      text: extracted.text,
      previewJson: { kind: 'table', tables: extracted.tables },
    };
  }

  if (ext === '.pptx' || mime.includes('presentationml')) {
    const text = await extractPptxText(file.buffer);
    return {
      text,
      previewJson: { kind: 'pptx' },
    };
  }

  if (ext === '.csv' || mime === 'text/csv') {
    const raw = file.buffer.toString('utf8');
    const rows = parseCsvRows(raw);
    return {
      text: raw.slice(0, 120000),
      previewJson: {
        kind: 'table',
        tables: [{ name: file.originalname, rows: rows.slice(0, 200) }],
        totalRows: rows.length,
        headers: rows[0] ?? [],
      },
    };
  }

  if (mime.startsWith('image/')) {
    return {
      text: `[Image attachment: ${file.originalname} (${mime})]`,
      previewJson: { kind: 'image' },
    };
  }

  if (CODE_OR_TEXT_EXTS.has(ext) || mime.startsWith('text/')) {
    const text = file.buffer.toString('utf8');
    return {
      text: text.slice(0, 180000),
      previewJson: { kind: 'code', language: ext.replace('.', '') || 'text' },
    };
  }

  throw new Error(`Unsupported file type: ${ext || mime}`);
}

router.get('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;

    const conds = [eq(uploadedFiles.userId, u.id)];
    if (projectId && Number.isFinite(projectId)) {
      conds.push(eq(uploadedFiles.projectId, projectId));
    }
    if (q) {
      conds.push(ilike(uploadedFiles.originalName, `%${q}%`));
    }

    const list = await db
      .select({
        id: uploadedFiles.id,
        projectId: uploadedFiles.projectId,
        originalName: uploadedFiles.originalName,
        mimeType: uploadedFiles.mimeType,
        sizeBytes: uploadedFiles.sizeBytes,
        chunkCount: uploadedFiles.chunkCount,
        previewJson: uploadedFiles.previewJson,
        createdAt: uploadedFiles.createdAt,
      })
      .from(uploadedFiles)
      .where(and(...conds))
      .orderBy(desc(uploadedFiles.createdAt))
      .limit(100);

    res.json({ files: list });
  } catch (err) {
    console.error('Failed to list files:', err);
    res.status(500).json({ error: 'Failed to list files.' });
  }
});

router.post('/files', requireAuth, upload.array('files', 6), async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const uploaded = (req.files as Express.Multer.File[]) || [];
    if (uploaded.length === 0) {
      res.status(400).json({ error: 'No files provided.' });
      return;
    }

    const projectId = req.body?.projectId ? Number(req.body.projectId) : null;
    const userDir = resolveSafePath(UPLOADS_DIR, String(u.id));
    await fs.mkdir(userDir, { recursive: true });

    const savedFiles = [];
    for (const file of uploaded) {
      const cleanName = path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_');
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const relPath = path.join(String(u.id), `${crypto.randomUUID()}-${cleanName}`);
      const absPath = resolveSafePath(UPLOADS_DIR, relPath);

      const extracted = await extractDocumentContent(file);
      await fs.writeFile(absPath, file.buffer);

      const chunks = chunkText(extracted.text);

      const [record] = await db
        .insert(uploadedFiles)
        .values({
          userId: u.id,
          projectId: projectId && Number.isFinite(projectId) ? projectId : null,
          originalName: cleanName,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          sha256,
          storagePath: relPath,
          extractedText: extracted.text,
          previewJson: extracted.previewJson,
          chunkCount: chunks.length,
        })
        .returning();

      if (chunks.length > 0) {
        await db.insert(documentChunks).values(
          chunks.map((c, idx) => ({
            fileId: record.id,
            userId: u.id,
            chunkIndex: idx,
            content: c,
            tokenEstimate: Math.ceil(c.length / 4),
          })),
        );
      }

      savedFiles.push(record);
    }

    res.status(201).json({ files: savedFiles });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'File upload and extraction failed.',
    });
  }
});

router.get('/files/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const fileId = Number(req.params.id);
    const [file] = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.userId, u.id)))
      .limit(1);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.json({ file });
  } catch (err) {
    console.error('Failed to get file:', err);
    res.status(500).json({ error: 'Failed to inspect file.' });
  }
});

router.get('/files/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const fileId = Number(req.params.id);
    const [file] = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.userId, u.id)))
      .limit(1);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const safePath = resolveSafePath(UPLOADS_DIR, file.storagePath);
    const buf = await fs.readFile(safePath);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.originalName.replaceAll('"', '')}"`,
    );
    res.send(buf);
  } catch (err) {
    console.error('File download failed:', err);
    res.status(404).json({ error: 'File payload missing from storage.' });
  }
});

const qaSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1).max(8),
  question: z.string().min(2).max(4000),
  model: z.string().max(120).optional(),
});

router.post('/files/qa', requireAuth, async (req: AuthRequest, res) => {
  const parsed = qaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Select at least one document and enter a question.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const files = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.userId, u.id), inArray(uploadedFiles.id, parsed.data.fileIds)));
    if (files.length === 0) {
      res.status(404).json({ error: 'Selected files not found.' });
      return;
    }

    const keywords = parsed.data.question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    const chunks = await db
      .select()
      .from(documentChunks)
      .where(and(eq(documentChunks.userId, u.id), inArray(documentChunks.fileId, files.map((f) => f.id))));

    const fileMap = new Map(files.map((f) => [f.id, f.originalName]));
    const scored = chunks
      .map((ch) => {
        const lower = ch.content.toLowerCase();
        const score = keywords.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0);
        return { ch, score };
      })
      .sort((a, b) => b.score - a.score || a.ch.chunkIndex - b.ch.chunkIndex)
      .slice(0, 10);

    const evidence = scored
      .map(
        ({ ch }) =>
          `[Source: ${fileMap.get(ch.fileId) || 'Document'}, chunk ${ch.chunkIndex + 1}]\n${ch.content}`,
      )
      .join('\n\n---\n\n');

    const answer = await generateTextUnary({
      userId: u.id,
      modelId: parsed.data.model || 'gemini-4-hydrogen',
      feature: 'docs',
      systemInstruction:
        'Answer using ONLY the provided document excerpts. Cite exact source filenames and chunk numbers. If an answer is not in the documents, state that explicitly.',
      prompt: `Documents:\n${evidence}\n\nQuestion: ${parsed.data.question}`,
    });

    res.json({
      answer: answer.text,
      sources: scored.map(({ ch }) => ({
        fileId: ch.fileId,
        fileName: fileMap.get(ch.fileId) || 'Document',
        chunkIndex: ch.chunkIndex,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Document Q&A failed.' });
  }
});

router.delete('/files/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const fileId = Number(req.params.id);
    const [deleted] = await db
      .delete(uploadedFiles)
      .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.userId, u.id)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const safePath = resolveSafePath(UPLOADS_DIR, deleted.storagePath);
    await fs.unlink(safePath).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete file:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

export default router;
