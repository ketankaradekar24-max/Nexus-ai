import esbuild from 'esbuild';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { analysisNotebooks, uploadedFiles } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { generateTextUnary } from '../ai/adapters.ts';
import { sanitizeCsvCell } from '../utils/security.ts';
import { parseCsvRows } from './files.ts';

const router = Router();

const codingAssistSchema = z.object({
  mode: z.enum(['generate', 'explain', 'debug', 'refactor', 'review', 'tests']),
  language: z.string().max(40).optional().default('typescript'),
  prompt: z.string().min(2).max(16000),
  code: z.string().max(40000).optional().default(''),
  model: z.string().max(120).optional(),
});

router.post('/coding/assist', requireAuth, async (req: AuthRequest, res) => {
  const parsed = codingAssistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid coding request.' });
    return;
  }

  const u = req.dbUser!;
  const { mode, language, prompt, code, model } = parsed.data;

  try {
    let staticDiagnostic = '';
    if (code.trim() && ['typescript', 'tsx', 'javascript', 'jsx'].includes(language.toLowerCase())) {
      try {
        const loader =
          language.toLowerCase() === 'tsx'
            ? 'tsx'
            : language.toLowerCase() === 'jsx'
              ? 'jsx'
              : language.toLowerCase() === 'javascript'
                ? 'js'
                : 'ts';
        await esbuild.transform(code, { loader });
        staticDiagnostic = 'Static syntax check (esbuild): passed with 0 syntax errors.';
      } catch (err) {
        staticDiagnostic = `Static syntax check (esbuild) detected issues:\n${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const modeDirectives: Record<string, string> = {
      generate: 'Write clean, production-grade code with clear types and edge-case handling.',
      explain: 'Explain architecture, control flow, complexity, and edge cases clearly.',
      debug: 'Identify the root cause of the bug, explain why it occurs, and provide the exact fix.',
      refactor: 'Refactor for readability, modularity, and safety without altering behavior.',
      review: 'Perform a senior code review covering correctness, security, and performance.',
      tests: 'Write comprehensive unit tests covering normal cases, edge cases, and error paths.',
    };

    const aiRes = await generateTextUnary({
      userId: u.id,
      modelId: model || 'gemini-4-hydrogen',
      feature: 'coding',
      systemInstruction: `You are SUB AI Coding Assistant (${language}). ${modeDirectives[mode]}`,
      prompt: `${prompt}\n\n${code ? `Source Code:\n\`\`\`${language}\n${code}\n\`\`\`\n` : ''}${staticDiagnostic ? `\n${staticDiagnostic}` : ''}`,
    });

    res.json({
      result: aiRes.text,
      staticDiagnostic,
      model: aiRes.model,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Coding assistant request failed.',
    });
  }
});

router.get('/data/notebooks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const list = await db
      .select()
      .from(analysisNotebooks)
      .where(eq(analysisNotebooks.userId, u.id))
      .orderBy(desc(analysisNotebooks.updatedAt))
      .limit(50);
    res.json({ notebooks: list });
  } catch {
    res.status(500).json({ error: 'Failed to load data notebooks.' });
  }
});

router.post('/data/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const fileId = Number(req.body?.fileId);
    const [file] = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.userId, u.id)))
      .limit(1);

    if (!file) {
      res.status(404).json({ error: 'Dataset file not found.' });
      return;
    }

    let rows: string[][] = [];
    const previewTables = (file.previewJson as { tables?: Array<{ rows: string[][] }> })?.tables;
    if (Array.isArray(previewTables) && previewTables[0]?.rows) {
      rows = previewTables[0].rows;
    } else if (file.extractedText) {
      rows = parseCsvRows(file.extractedText);
    }

    if (rows.length === 0) {
      res.status(400).json({ error: 'No tabular rows could be parsed from this file.' });
      return;
    }

    const headers = rows[0].map((h, i) => h.trim() || `col_${i + 1}`);
    const dataRows = rows.slice(1);
    const columnProfiles = headers.map((colName, colIdx) => {
      const vals = dataRows.map((r) => (r[colIdx] ?? '').trim());
      const nonEmpty = vals.filter((v) => v !== '');
      const nums = nonEmpty.map(Number).filter((n) => !Number.isNaN(n));
      const isNumeric = nonEmpty.length > 0 && nums.length >= nonEmpty.length * 0.8;

      if (isNumeric && nums.length > 0) {
        const sorted = [...nums].sort((a, b) => a - b);
        const sum = nums.reduce((a, b) => a + b, 0);
        return {
          name: colName,
          type: 'numeric',
          nonNullCount: nonEmpty.length,
          nullCount: vals.length - nonEmpty.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: Number((sum / nums.length).toFixed(2)),
          median: sorted[Math.floor(sorted.length / 2)],
        };
      }

      const uniqueCount = new Set(nonEmpty).size;
      return {
        name: colName,
        type: 'categorical',
        nonNullCount: nonEmpty.length,
        nullCount: vals.length - nonEmpty.length,
        uniqueCount,
        sampleValues: Array.from(new Set(nonEmpty)).slice(0, 4),
      };
    });

    res.json({
      fileId: file.id,
      fileName: file.originalName,
      rowCount: dataRows.length,
      headers,
      columns: columnProfiles,
      sampleRows: dataRows.slice(0, 50),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Dataset profiling failed.' });
  }
});

const dataAssistSchema = z.object({
  fileId: z.number().int().positive(),
  question: z.string().min(2).max(2000),
  language: z.enum(['python', 'sql']).optional().default('python'),
  model: z.string().max(120).optional(),
});

router.post('/data/assist', requireAuth, async (req: AuthRequest, res) => {
  const parsed = dataAssistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Select a dataset and ask an analysis question.' });
    return;
  }

  const u = req.dbUser!;
  try {
    const [file] = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, parsed.data.fileId), eq(uploadedFiles.userId, u.id)))
      .limit(1);
    if (!file) {
      res.status(404).json({ error: 'Dataset file not found.' });
      return;
    }

    const previewTables = (file.previewJson as { tables?: Array<{ rows: string[][] }> })?.tables;
    const rows = previewTables?.[0]?.rows ?? parseCsvRows(file.extractedText || '');
    const headers = rows[0] ?? [];
    const sample = rows.slice(0, 12).map((r) => r.join(', ')).join('\n');

    const prompt = `Analyze this dataset "${file.originalName}" (columns: ${headers.join(', ')}).
Sample rows:
${sample}

User request: ${parsed.data.question}

Return ONLY valid JSON:
{
  "title": "Analysis Title",
  "summary": "Clear statistical/analytical findings and methodology",
  "code": "${parsed.data.language === 'sql' ? 'SELECT ... FROM dataset ...' : '# Clean Python/pandas or JavaScript computation script'}",
  "chart": {
    "type": "bar" | "line" | "area",
    "xKey": "${headers[0] || 'label'}",
    "yKey": "${headers[1] || 'value'}",
    "title": "Chart Title"
  }
}`;

    const aiRes = await generateTextUnary({
      userId: u.id,
      modelId: parsed.data.model || 'gemini-4-hydrogen',
      feature: 'coding',
      prompt,
    });

    const cleaned = aiRes.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const fb = cleaned.indexOf('{');
    const lb = cleaned.lastIndexOf('}');
    const parsedJson = JSON.parse(cleaned.slice(fb, lb + 1)) as {
      title?: string;
      summary?: string;
      code?: string;
      chart?: Record<string, unknown>;
    };

    const [saved] = await db
      .insert(analysisNotebooks)
      .values({
        userId: u.id,
        fileId: file.id,
        title: parsedJson.title || parsed.data.question.slice(0, 80),
        language: parsed.data.language,
        code: parsedJson.code || '',
        resultJson: { summary: parsedJson.summary || '' },
        chartConfigJson: parsedJson.chart || {},
      })
      .returning();

    res.json({ notebook: saved, summary: parsedJson.summary || '' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Data analysis failed.' });
  }
});

router.post('/data/export-csv', requireAuth, async (req: AuthRequest, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    res.status(400).json({ error: 'Rows array required.' });
    return;
  }
  const csv = rows
    .slice(0, 5000)
    .map((r) => (Array.isArray(r) ? r.map(sanitizeCsvCell).join(',') : ''))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sub-ai-dataset-export.csv"');
  res.send(csv);
});

router.delete('/data/notebooks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    await db
      .delete(analysisNotebooks)
      .where(and(eq(analysisNotebooks.id, id), eq(analysisNotebooks.userId, u.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete notebook.' });
  }
});

export default router;
