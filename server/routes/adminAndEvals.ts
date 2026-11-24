import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import {
  auditLogs,
  conversations,
  evalRuns,
  generatedImages,
  uploadedFiles,
  usageLogs,
  users,
} from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { generateTextUnary, getUserProviderStatus } from '../ai/adapters.ts';
import { compileVirtualWorkspace } from './builder.ts';

const router = Router();

router.get('/usage/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const logs = await db
      .select()
      .from(usageLogs)
      .where(eq(usageLogs.userId, u.id))
      .orderBy(desc(usageLogs.createdAt))
      .limit(200);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const byModel: Record<string, { requests: number; tokens: number; costUsd: number }> = {};
    const byFeature: Record<string, number> = {};

    for (const log of logs) {
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
      const cost = Number(log.estimatedCostUsd || 0);
      totalCostUsd += cost;

      if (!byModel[log.model]) {
        byModel[log.model] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      byModel[log.model].requests += 1;
      byModel[log.model].tokens += log.inputTokens + log.outputTokens;
      byModel[log.model].costUsd += cost;

      byFeature[log.feature] = (byFeature[log.feature] || 0) + 1;
    }

    res.json({
      totals: {
        requests: logs.length,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: Number(totalCostUsd.toFixed(6)),
      },
      byModel,
      byFeature,
      recentLogs: logs.slice(0, 40),
    });
  } catch (err) {
    console.error('Usage query failed:', err);
    res.status(500).json({ error: 'Failed to load usage summary.' });
  }
});

interface EvalSuiteDef {
  id: string;
  name: string;
  description: string;
  cases: Array<{
    id: string;
    prompt: string;
    type: 'exact_substring' | 'builder_compile' | 'json_valid';
    expected?: string;
  }>;
}

const EVAL_SUITES: EvalSuiteDef[] = [
  {
    id: 'reasoning_core',
    name: 'Reasoning & Math Precision',
    description: 'Verifies deterministic logic, multi-step arithmetic, and instruction adherence.',
    cases: [
      {
        id: 'math-1',
        prompt: 'A warehouse has 148 crates. It ships 39 crates and receives 2 shipments of 15 crates each. Return ONLY the final integer.',
        type: 'exact_substring',
        expected: '139',
      },
      {
        id: 'logic-1',
        prompt: 'If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops definitely Lazzies? Answer YES or NO.',
        type: 'exact_substring',
        expected: 'YES',
      },
      {
        id: 'json-1',
        prompt: 'Return ONLY a valid JSON object with keys "status" (string "ok") and "count" (number 3).',
        type: 'json_valid',
      },
    ],
  },
  {
    id: 'builder_sandbox',
    name: 'Website Builder Compilation Check',
    description: 'Verifies React + TypeScript virtual bundling via esbuild sandbox.',
    cases: [
      {
        id: 'react-tsx-1',
        prompt: 'Compile minimal React TypeScript dashboard module',
        type: 'builder_compile',
      },
    ],
  },
];

router.get('/evals/suites', requireAuth, async (req: AuthRequest, res) => {
  const u = req.dbUser!;
  const runs = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.userId, u.id))
    .orderBy(desc(evalRuns.createdAt))
    .limit(20);
  res.json({
    suites: EVAL_SUITES.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      caseCount: s.cases.length,
    })),
    runs,
  });
});

const runEvalSchema = z.object({
  suiteId: z.string().min(1),
  model: z.string().max(120).optional().default('gemini-4-hydrogen'),
});

router.post('/evals/run', requireAuth, async (req: AuthRequest, res) => {
  const parsed = runEvalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid evaluation request.' });
    return;
  }

  const u = req.dbUser!;
  const suite = EVAL_SUITES.find((s) => s.id === parsed.data.suiteId);
  if (!suite) {
    res.status(404).json({ error: 'Evaluation suite not found.' });
    return;
  }

  try {
    const caseResults = [];
    let passedCases = 0;
    let totalLatency = 0;

    for (const c of suite.cases) {
      const t0 = Date.now();
      let passed = false;
      let output = '';

      if (c.type === 'builder_compile') {
        const resCompile = await compileVirtualWorkspace({
          'src/App.tsx': `import React, { useState } from 'react'; export default function App() { const [n, setN] = useState(1); return <button onClick={() => setN(n + 1)}>{n}</button>; }`,
        });
        passed = resCompile.ok;
        output = resCompile.logs;
      } else {
        const aiRes = await generateTextUnary({
          userId: u.id,
          modelId: parsed.data.model,
          prompt: c.prompt,
        });
        output = aiRes.text.trim();
        if (c.type === 'exact_substring' && c.expected) {
          passed = output.toUpperCase().includes(c.expected.toUpperCase());
        } else if (c.type === 'json_valid') {
          try {
            const parsedOut = JSON.parse(output.replace(/```json|```/g, '').trim());
            passed = parsedOut?.status === 'ok' && parsedOut?.count === 3;
          } catch {
            passed = false;
          }
        }
      }

      const latencyMs = Date.now() - t0;
      totalLatency += latencyMs;
      if (passed) passedCases++;
      caseResults.push({
        caseId: c.id,
        passed,
        latencyMs,
        output: output.slice(0, 300),
      });
    }

    const avgLatencyMs = Math.round(totalLatency / Math.max(1, suite.cases.length));
    const [savedRun] = await db
      .insert(evalRuns)
      .values({
        userId: u.id,
        suiteName: suite.name,
        model: parsed.data.model,
        provider: 'gemini',
        totalCases: suite.cases.length,
        passedCases,
        avgLatencyMs,
        resultsJson: caseResults,
      })
      .returning();

    res.json({ run: savedRun });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Evaluation run failed.',
    });
  }
});

router.get('/admin/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - dbStart;

    const [providers, convCount, fileCount, imgCount, recentAudit] = await Promise.all([
      getUserProviderStatus(u.id),
      db.select({ count: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.userId, u.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(uploadedFiles).where(eq(uploadedFiles.userId, u.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(generatedImages).where(eq(generatedImages.userId, u.id)),
      db.select().from(auditLogs).where(eq(auditLogs.userId, u.id)).orderBy(desc(auditLogs.createdAt)).limit(25),
    ]);

    res.json({
      health: {
        database: 'connected',
        dbLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
      },
      providers,
      counts: {
        conversations: convCount[0]?.count ?? 0,
        files: fileCount[0]?.count ?? 0,
        images: imgCount[0]?.count ?? 0,
      },
      auditLogs: recentAudit,
    });
  } catch (err) {
    console.error('Admin overview failed:', err);
    res.status(500).json({ error: 'Failed to load workspace health overview.' });
  }
});

export default router;
