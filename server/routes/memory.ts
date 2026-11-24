import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { memoryCandidates, memoryItems } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';

const router = Router();

router.get('/memory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const items = await db
      .select()
      .from(memoryItems)
      .where(eq(memoryItems.userId, u.id))
      .orderBy(desc(memoryItems.updatedAt));
    res.json({ memories: items });
  } catch (err) {
    console.error('Failed to load memories:', err);
    res.status(500).json({ error: 'Failed to load saved memories.' });
  }
});

const memorySchema = z.object({
  content: z.string().min(2).max(1000),
  category: z.string().max(50).optional().default('general'),
  projectId: z.number().int().positive().nullable().optional(),
});

router.post('/memory', requireAuth, async (req: AuthRequest, res) => {
  const parsed = memorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid memory content.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const [created] = await db
      .insert(memoryItems)
      .values({
        userId: u.id,
        projectId: parsed.data.projectId ?? null,
        content: parsed.data.content.trim(),
        category: parsed.data.category,
      })
      .returning();
    res.status(201).json({ memory: created });
  } catch (err) {
    console.error('Failed to save memory:', err);
    res.status(500).json({ error: 'Failed to save memory.' });
  }
});

router.patch('/memory/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = memorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid memory update.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const memId = Number(req.params.id);
    const [updated] = await db
      .update(memoryItems)
      .set({
        ...(parsed.data.content ? { content: parsed.data.content.trim() } : {}),
        ...(parsed.data.category ? { category: parsed.data.category } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(memoryItems.id, memId), eq(memoryItems.userId, u.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Memory not found.' });
      return;
    }
    res.json({ memory: updated });
  } catch (err) {
    console.error('Failed to update memory:', err);
    res.status(500).json({ error: 'Failed to update memory.' });
  }
});

router.delete('/memory/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const memId = Number(req.params.id);
    await db
      .delete(memoryItems)
      .where(and(eq(memoryItems.id, memId), eq(memoryItems.userId, u.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete memory:', err);
    res.status(500).json({ error: 'Failed to delete memory.' });
  }
});

router.get('/memory/candidates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const candidates = await db
      .select()
      .from(memoryCandidates)
      .where(and(eq(memoryCandidates.userId, u.id), eq(memoryCandidates.status, 'pending')))
      .orderBy(desc(memoryCandidates.createdAt))
      .limit(20);
    res.json({ candidates });
  } catch (err) {
    console.error('Failed to list memory candidates:', err);
    res.status(500).json({ error: 'Failed to list suggested memories.' });
  }
});

router.post('/memory/candidates/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const cid = Number(req.params.id);
    const [cand] = await db
      .select()
      .from(memoryCandidates)
      .where(and(eq(memoryCandidates.id, cid), eq(memoryCandidates.userId, u.id)))
      .limit(1);
    if (!cand) {
      res.status(404).json({ error: 'Memory suggestion not found.' });
      return;
    }

    const [created] = await db
      .insert(memoryItems)
      .values({
        userId: u.id,
        content: cand.content,
        category: cand.category,
        sourceConversationId: cand.conversationId,
      })
      .returning();

    await db
      .update(memoryCandidates)
      .set({ status: 'approved' })
      .where(eq(memoryCandidates.id, cid));

    res.json({ memory: created });
  } catch (err) {
    console.error('Failed to approve memory candidate:', err);
    res.status(500).json({ error: 'Failed to approve memory suggestion.' });
  }
});

router.post('/memory/candidates/:id/reject', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const cid = Number(req.params.id);
    await db
      .update(memoryCandidates)
      .set({ status: 'rejected' })
      .where(and(eq(memoryCandidates.id, cid), eq(memoryCandidates.userId, u.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to reject memory candidate:', err);
    res.status(500).json({ error: 'Failed to reject memory suggestion.' });
  }
});

export default router;
