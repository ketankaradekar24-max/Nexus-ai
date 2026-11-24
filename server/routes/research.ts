import * as cheerio from 'cheerio';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { researchRuns } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { createGeminiClient, generateTextUnary, normalizeProviderError } from '../ai/adapters.ts';
import { assertSafeExternalUrl } from '../utils/security.ts';

const router = Router();

export interface NormalizedSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  reliabilityTier: 'high' | 'standard' | 'unverified';
  retrievedAt: string;
  provider: string;
}

export function classifyDomainReliability(domain: string): 'high' | 'standard' | 'unverified' {
  const d = domain.toLowerCase();
  if (
    d.endsWith('.gov') ||
    d.endsWith('.edu') ||
    d.includes('arxiv.org') ||
    d.includes('developer.mozilla.org') ||
    d.includes('wikipedia.org') ||
    d.includes('reuters.com') ||
    d.includes('nature.com') ||
    d.includes('ieee.org') ||
    d.includes('github.com') ||
    d.includes('nodejs.org') ||
    d.includes('react.dev')
  ) {
    return 'high';
  }
  if (d.includes('reddit.com') || d.includes('quora.com')) {
    return 'unverified';
  }
  return 'standard';
}

async function searchWithSearxng(query: string): Promise<NormalizedSource[]> {
  const base = process.env.SEARXNG_URL?.trim();
  if (!base) return [];
  const url = `${base.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`SearXNG HTTP ${resp.status}`);
  const json = (await resp.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const out: NormalizedSource[] = [];
  for (const r of json.results ?? []) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    try {
      const domain = new URL(r.url).hostname.replace(/^www\./, '');
      out.push({
        title: r.title || domain,
        url: r.url,
        domain,
        snippet: (r.content || '').slice(0, 320),
        reliabilityTier: classifyDomainReliability(domain),
        retrievedAt: now,
        provider: 'searxng',
      });
    } catch {
      // skip invalid URL
    }
    if (out.length >= 8) break;
  }
  return out;
}

async function searchWithGeminiGrounding(query: string): Promise<{
  summary: string;
  sources: NormalizedSource[];
}> {
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Provide a factual, source-backed answer to this query based on retrieved web results. Clearly distinguish retrieved facts from synthesis.\n\nQuery: ${query}`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const sources: NormalizedSource[] = [];
  for (const gc of chunks) {
    const uri = gc.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    try {
      const domain = new URL(uri).hostname.replace(/^www\./, '');
      sources.push({
        title: gc.web?.title || domain,
        url: uri,
        domain,
        snippet: '',
        reliabilityTier: classifyDomainReliability(domain),
        retrievedAt: now,
        provider: 'gemini-google-search',
      });
    } catch {
      // skip
    }
  }
  return {
    summary: response.text || '',
    sources,
  };
}

async function safeReadWebPage(targetUrl: string): Promise<string> {
  const parsed = await assertSafeExternalUrl(targetUrl);
  const resp = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'SUB-AI-ResearchBot/1.0' },
    signal: AbortSignal.timeout(7000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    return '';
  }
  const html = await resp.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header').remove();
  const text = $('main, article, body').text().replace(/\s+/g, ' ').trim();
  return text.slice(0, 4500);
}

router.get('/research/runs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const runs = await db
      .select()
      .from(researchRuns)
      .where(eq(researchRuns.userId, u.id))
      .orderBy(desc(researchRuns.createdAt))
      .limit(30);
    res.json({ runs });
  } catch (err) {
    console.error('Failed to list research runs:', err);
    res.status(500).json({ error: 'Failed to load research history.' });
  }
});

router.delete('/research/runs/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    await db
      .delete(researchRuns)
      .where(and(eq(researchRuns.id, id), eq(researchRuns.userId, u.id)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete research report.' });
  }
});

router.get('/research/search', requireAuth, async (req: AuthRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.status(400).json({ error: 'Query parameter q is required.' });
    return;
  }

  try {
    if (process.env.SEARXNG_URL?.trim()) {
      const sources = await searchWithSearxng(q);
      res.json({ query: q, summary: '', sources, provider: 'searxng' });
      return;
    }

    const grounded = await searchWithGeminiGrounding(q);
    res.json({
      query: q,
      summary: grounded.summary,
      sources: grounded.sources,
      provider: 'gemini-google-search',
    });
  } catch (err) {
    res.status(502).json({
      error: `Live search failed: ${normalizeProviderError(err, 'gemini-4-hydrogen')}`,
    });
  }
});

const deepSchema = z.object({
  query: z.string().min(3).max(2000),
  model: z.string().max(120).optional(),
});

router.post('/research/deep', requireAuth, async (req: AuthRequest, res) => {
  const parsed = deepSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a research topic.' });
    return;
  }

  const u = req.dbUser!;
  const query = parsed.data.query.trim();
  const startedAt = Date.now();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const steps: Array<{ step: string; detail: string; status: string }> = [];

  try {
    // Step 1: Decompose research query
    sendEvent('step', { step: 'Planning', detail: 'Decomposing topic into targeted search queries...' });
    const planRes = await generateTextUnary({
      userId: u.id,
      modelId: 'gemini-4-hydrogen',
      feature: 'research',
      prompt: `Break this research question into 3 concise, distinct web search queries. Return ONLY a JSON array of strings.\n\nQuestion: ${query}`,
    });
    let subQueries: string[] = [query];
    try {
      const arr = JSON.parse(planRes.text.replace(/```json|```/g, '').trim());
      if (Array.isArray(arr) && arr.length > 0) {
        subQueries = arr.slice(0, 3).map(String);
      }
    } catch {
      // fallback to original query
    }
    steps.push({ step: 'Query Planning', detail: subQueries.join(' · '), status: 'done' });
    sendEvent('step', { step: 'Searching', detail: `Executing ${subQueries.length} grounded searches...`, queries: subQueries });

    // Step 2: Run live grounded searches across sub-queries
    const allSources = new Map<string, NormalizedSource>();
    const retrievedNotes: string[] = [];

    for (const sq of subQueries) {
      if (process.env.SEARXNG_URL?.trim()) {
        const hits = await searchWithSearxng(sq);
        for (const h of hits) {
          if (!allSources.has(h.url)) allSources.set(h.url, h);
        }
        retrievedNotes.push(
          `Query "${sq}":\n` + hits.map((h) => `- ${h.title} (${h.url}): ${h.snippet}`).join('\n'),
        );
      } else {
        const grounded = await searchWithGeminiGrounding(sq);
        for (const h of grounded.sources) {
          if (!allSources.has(h.url)) allSources.set(h.url, h);
        }
        if (grounded.summary) {
          retrievedNotes.push(`Query "${sq}" findings:\n${grounded.summary}`);
        }
      }
    }

    const dedupedSources = Array.from(allSources.values());
    if (dedupedSources.length === 0 && retrievedNotes.length === 0) {
      throw new Error('No live sources could be retrieved for this query.');
    }

    steps.push({
      step: 'Source Retrieval',
      detail: `Collected ${dedupedSources.length} unique sources`,
      status: 'done',
    });
    sendEvent('sources', { sources: dedupedSources });

    // Step 3: Optionally inspect top 2 safe URLs for primary text verification
    sendEvent('step', { step: 'Verifying', detail: 'Inspecting primary source pages...' });
    const extractedPages: string[] = [];
    for (const src of dedupedSources.slice(0, 2)) {
      try {
        const pageText = await safeReadWebPage(src.url);
        if (pageText) {
          extractedPages.push(`Page [${src.title}](${src.url}):\n${pageText.slice(0, 2200)}`);
        }
      } catch {
        // skip pages blocking bots or SSRF-blocked
      }
    }
    steps.push({
      step: 'Page Inspection',
      detail: `Extracted text from ${extractedPages.length} primary pages`,
      status: 'done',
    });

    // Step 4: Synthesize structured deep research report
    sendEvent('step', { step: 'Synthesizing', detail: 'Writing cited research report...' });
    const numberedSources = dedupedSources
      .map((s, idx) => `[${idx + 1}] ${s.title} — ${s.url} (reliability: ${s.reliabilityTier})`)
      .join('\n');

    const reportRes = await generateTextUnary({
      userId: u.id,
      modelId: parsed.data.model || 'gemini-4-hydrogen',
      feature: 'research',
      systemInstruction:
        'Write a rigorous, well-structured Deep Research Report in Markdown. Clearly separate **Retrieved Facts** (with inline [n] citations matching the numbered source list) from **Analytical Conclusions**. Never invent URLs or facts not present in the retrieved evidence.',
      prompt: `Research Topic: ${query}\n\nNumbered Retrieved Sources:\n${numberedSources}\n\nRetrieved Search Summaries:\n${retrievedNotes.join('\n\n')}\n\nExtracted Page Excerpts:\n${extractedPages.join('\n\n')}`,
    });

    const durationMs = Date.now() - startedAt;
    steps.push({ step: 'Report Complete', detail: `Generated in ${(durationMs / 1000).toFixed(1)}s`, status: 'done' });

    const [savedRun] = await db
      .insert(researchRuns)
      .values({
        userId: u.id,
        query,
        status: 'completed',
        reportMarkdown: reportRes.text,
        sourcesJson: dedupedSources,
        stepsJson: steps,
        durationMs,
      })
      .returning();

    sendEvent('done', { run: savedRun });
    res.end();
  } catch (err) {
    sendEvent('error', {
      message: err instanceof Error ? err.message : 'Deep research failed.',
    });
    res.end();
  }
});

export default router;
