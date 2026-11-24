import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { Router } from 'express';
import { and, asc, desc, eq, ilike, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import {
  conversations,
  conversationSummaries,
  memoryCandidates,
  memoryItems,
  messages,
  projects,
  uploadedFiles,
} from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { generateChatStream, generateTextUnary, type ChatTurnInput } from '../ai/adapters.ts';
import { getModelSpec } from '../ai/registry.ts';
import { resolveSafePath } from '../utils/security.ts';

const router = Router();
const UPLOADS_DIR = process.cwd() + '/storage/uploads';

// Prune expired temporary chats (>24 hours old) safely when querying
async function pruneExpiredTempChats(userId: number) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.isTemporary, true),
        lt(conversations.updatedAt, cutoff),
      ),
    )
    .catch(() => {});
}

router.get('/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    await pruneExpiredTempChats(u.id);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const archived = req.query.archived === 'true';
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;

    const conditions = [eq(conversations.userId, u.id), eq(conversations.archived, archived)];
    if (projectId && Number.isFinite(projectId)) {
      conditions.push(eq(conversations.projectId, projectId));
    }
    if (q) {
      conditions.push(ilike(conversations.title, `%${q}%`));
    }

    const list = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
      .limit(150);

    res.json({ conversations: list });
  } catch (err) {
    console.error('Failed to list conversations:', err);
    res.status(500).json({ error: 'Failed to load conversation history.' });
  }
});

const createConvSchema = z.object({
  title: z.string().max(160).optional(),
  model: z.string().max(120).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  systemPrompt: z.string().max(4000).optional(),
  isTemporary: z.boolean().optional(),
});

router.post('/conversations', requireAuth, async (req: AuthRequest, res) => {
  const parsed = createConvSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid conversation parameters.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const modelId = parsed.data.model || u.preferredModel || 'gemini-4-hydrogen';
    const spec = getModelSpec(modelId);
    const [created] = await db
      .insert(conversations)
      .values({
        userId: u.id,
        projectId: parsed.data.projectId ?? null,
        title: parsed.data.title?.trim() || 'New Conversation',
        model: modelId,
        provider: spec?.provider ?? 'gemini',
        systemPrompt: parsed.data.systemPrompt ?? '',
        isTemporary: parsed.data.isTemporary ?? false,
      })
      .returning();

    res.status(201).json({ conversation: created });
  } catch (err) {
    console.error('Failed to create conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

router.get('/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const convId = Number(req.params.id);
    if (!Number.isFinite(convId)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, u.id)))
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const [msgs, summaryRows] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(asc(messages.createdAt), asc(messages.id)),
      db
        .select()
        .from(conversationSummaries)
        .where(eq(conversationSummaries.conversationId, conv.id))
        .limit(1),
    ]);

    res.json({
      conversation: conv,
      messages: msgs,
      summary: summaryRows[0]?.summary ?? '',
    });
  } catch (err) {
    console.error('Failed to load conversation:', err);
    res.status(500).json({ error: 'Failed to load conversation messages.' });
  }
});

const patchConvSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  model: z.string().min(1).max(120).optional(),
  systemPrompt: z.string().max(4000).optional(),
  activeLeafMessageId: z.number().int().positive().nullable().optional(),
});

router.patch('/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = patchConvSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid conversation update.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const convId = Number(req.params.id);
    const updatePayload: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.model) {
      updatePayload.provider = getModelSpec(parsed.data.model)?.provider ?? 'gemini';
    }
    const [updated] = await db
      .update(conversations)
      .set(updatePayload)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, u.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ conversation: updated });
  } catch (err) {
    console.error('Failed to update conversation:', err);
    res.status(500).json({ error: 'Failed to update conversation.' });
  }
});

router.delete('/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const convId = Number(req.params.id);
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, u.id)))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete conversation:', err);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

router.post('/conversations/:id/share', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const convId = Number(req.params.id);
    const enable = req.body?.isShared !== false;
    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, u.id)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const token = existing.shareToken || crypto.randomBytes(16).toString('hex');
    const [updated] = await db
      .update(conversations)
      .set({ isShared: enable, shareToken: token, updatedAt: new Date() })
      .where(eq(conversations.id, convId))
      .returning();
    res.json({ isShared: updated.isShared, shareToken: updated.shareToken });
  } catch (err) {
    console.error('Failed to toggle share:', err);
    res.status(500).json({ error: 'Failed to update sharing permissions.' });
  }
});

router.get('/shared/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(404).json({ error: 'Shared conversation not found.' });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.shareToken, token), eq(conversations.isShared, true)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: 'Shared conversation not found or revoked.' });
      return;
    }
    const msgs = await db
      .select({
        id: messages.id,
        parentId: messages.parentId,
        role: messages.role,
        content: messages.content,
        model: messages.model,
        sourcesJson: messages.sourcesJson,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    res.json({
      title: conv.title,
      model: conv.model,
      createdAt: conv.createdAt,
      messages: msgs,
    });
  } catch (err) {
    console.error('Failed to load shared conversation:', err);
    res.status(500).json({ error: 'Failed to load shared conversation.' });
  }
});

router.get('/conversations/:id/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const convId = Number(req.params.id);
    const format = req.query.format === 'json' ? 'json' : 'md';
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, u.id)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${conv.id}.json"`);
      res.json({ conversation: conv, messages: msgs });
      return;
    }

    const md = [
      `# ${conv.title}`,
      `Model: ${conv.model} | Exported: ${new Date().toISOString()}`,
      '',
      ...msgs.map((m) => {
        const header = m.role === 'user' ? '## User' : `## Assistant (${m.model || conv.model})`;
        return `${header}\n\n${m.content}\n`;
      }),
    ].join('\n');

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="conversation-${conv.id}.md"`);
    res.send(md);
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'Failed to export conversation.' });
  }
});

router.post('/messages/:id/feedback', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const msgId = Number(req.params.id);
    const feedback = req.body?.feedback === 'up' || req.body?.feedback === 'down' ? req.body.feedback : null;

    const [msg] = await db.select().from(messages).where(eq(messages.id, msgId)).limit(1);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, msg.conversationId), eq(conversations.userId, u.id)))
      .limit(1);
    if (!conv) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    await db.update(messages).set({ feedback }).where(eq(messages.id, msgId));
    res.json({ ok: true, feedback });
  } catch (err) {
    console.error('Feedback update failed:', err);
    res.status(500).json({ error: 'Failed to record message feedback.' });
  }
});

// Build active linear history walking backwards from leafId using parentId
export function buildMessageLineage<T extends { id: number; parentId: number | null }>(
  allMessages: T[],
  leafId: number | null,
): T[] {
  if (allMessages.length === 0) return [];
  const byId = new Map(allMessages.map((m) => [m.id, m]));
  let cursor = leafId ? byId.get(leafId) : allMessages[allMessages.length - 1];
  if (!cursor) {
    cursor = allMessages[allMessages.length - 1];
  }
  const chain: T[] = [];
  const seen = new Set<number>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain.reverse();
}

const chatStreamSchema = z.object({
  conversationId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  message: z.string().max(40000),
  parentId: z.number().int().positive().nullable().optional(),
  regenerateFromMessageId: z.number().int().positive().nullable().optional(),
  continueMessageId: z.number().int().positive().nullable().optional(),
  model: z.string().min(1).max(120).optional(),
  thinkingLevel: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
  enableWebSearch: z.boolean().optional(),
  isTemporary: z.boolean().optional(),
  systemPrompt: z.string().max(4000).optional(),
  fileIds: z.array(z.number().int().positive()).max(8).optional(),
  inlineImages: z
    .array(
      z.object({
        name: z.string().max(120),
        mimeType: z.string().max(60),
        base64Data: z.string().max(8_000_000),
      }),
    )
    .max(3)
    .optional(),
});

router.post('/chat/stream', requireAuth, async (req: AuthRequest, res) => {
  const parsed = chatStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid chat request payload.' });
    return;
  }

  const u = req.dbUser!;
  const body = parsed.data;
  const modelId = body.model || u.preferredModel || 'gemini-4-hydrogen';
  const modelSpec = getModelSpec(modelId);

  if (!body.message.trim() && !body.regenerateFromMessageId && !body.continueMessageId) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
  });

  try {
    // 1. Resolve or create conversation
    let conv;
    if (body.conversationId) {
      const rows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, body.conversationId), eq(conversations.userId, u.id)))
        .limit(1);
      conv = rows[0];
      if (!conv) {
        sendEvent('error', { message: 'Conversation not found.' });
        res.end();
        return;
      }
    } else {
      const initialTitle =
        body.message.trim().slice(0, 56) || 'New Conversation';
      const [created] = await db
        .insert(conversations)
        .values({
          userId: u.id,
          projectId: body.projectId ?? null,
          title: initialTitle,
          model: modelId,
          provider: modelSpec?.provider ?? 'gemini',
          systemPrompt: body.systemPrompt ?? '',
          isTemporary: body.isTemporary ?? false,
        })
        .returning();
      conv = created;
    }

    sendEvent('meta', { conversationId: conv.id, model: modelId });

    const allConvMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    // 2. Load attached files safely
    const attachmentsForTurn: NonNullable<ChatTurnInput['attachments']> = [];
    const attachmentMeta: Array<{ fileId?: number; name: string; mimeType: string }> = [];

    if (body.fileIds && body.fileIds.length > 0) {
      const files = await db
        .select()
        .from(uploadedFiles)
        .where(and(eq(uploadedFiles.userId, u.id), inArray(uploadedFiles.id, body.fileIds)));

      for (const f of files) {
        attachmentMeta.push({ fileId: f.id, name: f.originalName, mimeType: f.mimeType });
        if (f.mimeType.startsWith('image/')) {
          try {
            const safeDiskPath = resolveSafePath(UPLOADS_DIR, f.storagePath);
            const buf = await fs.readFile(safeDiskPath);
            attachmentsForTurn.push({
              name: f.originalName,
              mimeType: f.mimeType,
              base64Data: buf.toString('base64'),
            });
          } catch {
            // fallback to extracted text if file missing
          }
        } else if (f.extractedText) {
          attachmentsForTurn.push({
            name: f.originalName,
            mimeType: f.mimeType,
            extractedText: f.extractedText,
          });
        }
      }
    }

    for (const img of body.inlineImages ?? []) {
      attachmentMeta.push({ name: img.name, mimeType: img.mimeType });
      attachmentsForTurn.push({
        name: img.name,
        mimeType: img.mimeType,
        base64Data: img.base64Data,
      });
    }

    // 3. Determine parentId & user/assistant turn behavior
    let parentIdForAssistant: number | null = null;
    let lineageForModel: typeof allConvMsgs = [];
    let continuePrefix = '';

    if (body.regenerateFromMessageId) {
      const targetMsg = allConvMsgs.find((m) => m.id === body.regenerateFromMessageId);
      if (!targetMsg) {
        sendEvent('error', { message: 'Message to regenerate was not found.' });
        res.end();
        return;
      }
      parentIdForAssistant = targetMsg.parentId;
      lineageForModel = buildMessageLineage(allConvMsgs, targetMsg.parentId);
    } else if (body.continueMessageId) {
      const targetMsg = allConvMsgs.find((m) => m.id === body.continueMessageId);
      if (!targetMsg || targetMsg.role !== 'assistant') {
        sendEvent('error', { message: 'Assistant message to continue was not found.' });
        res.end();
        return;
      }
      continuePrefix = targetMsg.content;
      parentIdForAssistant = targetMsg.parentId;
      lineageForModel = buildMessageLineage(allConvMsgs, targetMsg.id);
    } else {
      const effectiveParentId =
        body.parentId !== undefined ? body.parentId : conv.activeLeafMessageId;
      const siblingCount = allConvMsgs.filter((m) => m.parentId === effectiveParentId).length;
      const [userMsg] = await db
        .insert(messages)
        .values({
          conversationId: conv.id,
          parentId: effectiveParentId ?? null,
          branchIndex: siblingCount,
          role: 'user',
          content: body.message.trim(),
          attachmentsJson: attachmentMeta,
        })
        .returning();

      sendEvent('user_message', { message: userMsg });
      parentIdForAssistant = userMsg.id;
      lineageForModel = [...buildMessageLineage(allConvMsgs, effectiveParentId ?? null), userMsg];
    }

    // 4. Assemble system context: custom instructions + project instructions + memory + rolling summary
    const [summaryRow] = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conv.id))
      .limit(1);

    let projectInstructions = '';
    if (conv.projectId) {
      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, conv.projectId), eq(projects.userId, u.id)))
        .limit(1);
      if (proj?.instructions) {
        projectInstructions = proj.instructions;
      }
    }

    let memoryBlock = '';
    if (u.memoryEnabled && !conv.isTemporary) {
      const mems = await db
        .select()
        .from(memoryItems)
        .where(eq(memoryItems.userId, u.id))
        .orderBy(desc(memoryItems.updatedAt))
        .limit(15);
      if (mems.length > 0) {
        memoryBlock =
          'Saved user preferences & facts (treat as user-approved context):\n' +
          mems.map((m) => `- [${m.category}] ${m.content}`).join('\n');
      }
    }

    const systemParts = [
      'You are SUB AI, an accurate, helpful multi-model AI assistant. Cite only retrieved URLs when web search is enabled. Do not fabricate files, code execution results, or sources.',
      u.customInstructions ? `User Custom Instructions:\n${u.customInstructions}` : '',
      projectInstructions ? `Project Workspace Instructions:\n${projectInstructions}` : '',
      conv.systemPrompt || body.systemPrompt
        ? `Conversation System Prompt:\n${body.systemPrompt || conv.systemPrompt}`
        : '',
      memoryBlock,
      summaryRow?.summary ? `Earlier Conversation Summary:\n${summaryRow.summary}` : '',
    ].filter(Boolean);

    // Keep recent 12 turns verbatim in context window
    const recentTurns = lineageForModel.slice(-12);
    const modelMessages: ChatTurnInput[] = recentTurns.map((m, idx) => {
      const isLastUser = idx === recentTurns.length - 1 && m.role === 'user';
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        attachments: isLastUser ? attachmentsForTurn : undefined,
      };
    });

    if (body.continueMessageId) {
      modelMessages.push({
        role: 'user',
        content:
          'Continue your previous response seamlessly from exact stopping point without repeating prior text.',
      });
    }

    // 5. Stream AI generation
    let accumulatedText = continuePrefix;
    let accumulatedThinking = '';
    const collectedSources: Array<{ title: string; url: string; domain: string }> = [];

    const siblingAssistantCount = allConvMsgs.filter(
      (m) => m.parentId === parentIdForAssistant,
    ).length;

    const result = await generateChatStream(
      {
        userId: u.id,
        modelId,
        messages: modelMessages,
        systemInstruction: systemParts.join('\n\n'),
        thinkingLevel: body.thinkingLevel,
        enableWebSearch: Boolean(body.enableWebSearch),
        feature: 'chat',
        signal: abortController.signal,
      },
      {
        onDelta: (delta) => {
          accumulatedText += delta;
          sendEvent('delta', { text: delta });
        },
        onThinking: (thought) => {
          accumulatedThinking += thought;
          sendEvent('thinking', { text: thought });
        },
        onSource: (src) => {
          collectedSources.push(src);
          sendEvent('source', src);
        },
      },
    );

    const wasStopped = abortController.signal.aborted;

    // 6. Persist assistant message (update if continuing, insert new branch otherwise)
    let savedAssistant;
    if (body.continueMessageId) {
      const [updated] = await db
        .update(messages)
        .set({
          content: accumulatedText,
          stopped: wasStopped,
          usageJson: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd,
            latencyMs: result.latencyMs,
          },
        })
        .where(eq(messages.id, body.continueMessageId))
        .returning();
      savedAssistant = updated;
    } else {
      const [inserted] = await db
        .insert(messages)
        .values({
          conversationId: conv.id,
          parentId: parentIdForAssistant,
          branchIndex: siblingAssistantCount,
          role: 'assistant',
          content: accumulatedText || result.text,
          thinkingText: accumulatedThinking || result.thinkingText,
          model: modelId,
          provider: result.provider,
          stopped: wasStopped,
          sourcesJson: collectedSources.length > 0 ? collectedSources : result.sources,
          usageJson: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd,
            latencyMs: result.latencyMs,
          },
        })
        .returning();
      savedAssistant = inserted;
    }

    await db
      .update(conversations)
      .set({
        activeLeafMessageId: savedAssistant.id,
        model: modelId,
        provider: result.provider,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conv.id));

    sendEvent('done', {
      conversationId: conv.id,
      message: savedAssistant,
      stopped: wasStopped,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        latencyMs: result.latencyMs,
      },
    });
    res.end();

    // 7. Background non-blocking rolling summary & memory candidate suggestion (if not temporary & completed cleanly)
    if (!wasStopped && !conv.isTemporary && process.env.GEMINI_API_KEY?.trim()) {
      void (async () => {
        try {
          if (lineageForModel.length >= 14) {
            const summaryPrompt = `Summarize the key decisions, facts, and user goals from this conversation in <= 180 words:\n\n${lineageForModel
              .slice(-14, -4)
              .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
              .join('\n')}`;
            const sumRes = await generateTextUnary({
              userId: u.id,
              modelId: 'gemini-3.1-flash-lite',
              prompt: summaryPrompt,
            });
            if (sumRes.text.trim()) {
              await db
                .insert(conversationSummaries)
                .values({
                  conversationId: conv.id,
                  summary: sumRes.text.trim(),
                  summarizedUpToMessageId: savedAssistant.id,
                })
                .onConflictDoUpdate({
                  target: conversationSummaries.conversationId,
                  set: {
                    summary: sumRes.text.trim(),
                    summarizedUpToMessageId: savedAssistant.id,
                    updatedAt: new Date(),
                  },
                });
            }
          }

          if (u.memoryEnabled && body.message.trim().length > 24 && !body.regenerateFromMessageId) {
            const memPrompt = `Extract at most 1 durable, non-sensitive user fact or preference (role, tech stack, language, ongoing project, formatting preference) from this user prompt. Return ONLY JSON: {"candidate": string | null, "category": "preference" | "profile" | "project"}. Never store passwords, secrets, or temporary tasks.\n\nUser prompt: ${body.message.slice(0, 1000)}`;
            const memRes = await generateTextUnary({
              userId: u.id,
              modelId: 'gemini-3.1-flash-lite',
              prompt: memPrompt,
            });
            const cleaned = memRes.text.replace(/```json|```/g, '').trim();
            const parsedMem = JSON.parse(cleaned);
            if (parsedMem?.candidate && typeof parsedMem.candidate === 'string') {
              await db.insert(memoryCandidates).values({
                userId: u.id,
                conversationId: conv.id,
                content: parsedMem.candidate.slice(0, 280),
                category: String(parsedMem.category || 'general'),
                status: 'pending',
              });
            }
          }
        } catch {
          // non-critical background task
        }
      })();
    }
  } catch (err) {
    sendEvent('error', {
      message: err instanceof Error ? err.message : 'Streaming failed.',
    });
    res.end();
  }
});

export default router;
