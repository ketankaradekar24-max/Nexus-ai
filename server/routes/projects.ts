import JSZip from 'jszip';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import {
  builderProjects,
  conversations,
  generatedImages,
  memoryItems,
  projects,
  uploadedFiles,
} from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';

const router = Router();

router.get('/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const list = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, u.id))
      .orderBy(desc(projects.updatedAt));
    res.json({ projects: list });
  } catch (err) {
    console.error('Failed to list projects:', err);
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

const projectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().default(''),
  instructions: z.string().max(4000).optional().default(''),
  sharedMemory: z.boolean().optional().default(true),
});

router.post('/projects', requireAuth, async (req: AuthRequest, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project details.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const [created] = await db
      .insert(projects)
      .values({
        userId: u.id,
        name: parsed.data.name.trim(),
        description: parsed.data.description,
        instructions: parsed.data.instructions,
        sharedMemory: parsed.data.sharedMemory,
      })
      .returning();
    res.status(201).json({ project: created });
  } catch (err) {
    console.error('Failed to create project:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

router.get('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const pid = Number(req.params.id);
    const [proj] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, pid), eq(projects.userId, u.id)))
      .limit(1);
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const [convs, files, imgs, mems, builders] = await Promise.all([
      db.select().from(conversations).where(and(eq(conversations.projectId, pid), eq(conversations.userId, u.id))).orderBy(desc(conversations.updatedAt)),
      db.select().from(uploadedFiles).where(and(eq(uploadedFiles.projectId, pid), eq(uploadedFiles.userId, u.id))).orderBy(desc(uploadedFiles.createdAt)),
      db.select().from(generatedImages).where(and(eq(generatedImages.projectId, pid), eq(generatedImages.userId, u.id))).orderBy(desc(generatedImages.createdAt)),
      db.select().from(memoryItems).where(and(eq(memoryItems.projectId, pid), eq(memoryItems.userId, u.id))).orderBy(desc(memoryItems.updatedAt)),
      db.select().from(builderProjects).where(and(eq(builderProjects.projectId, pid), eq(builderProjects.userId, u.id))).orderBy(desc(builderProjects.updatedAt)),
    ]);

    res.json({
      project: proj,
      conversations: convs,
      files,
      images: imgs,
      memories: mems,
      builderProjects: builders,
    });
  } catch (err) {
    console.error('Failed to fetch project details:', err);
    res.status(500).json({ error: 'Failed to fetch project workspace.' });
  }
});

router.patch('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project update.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const pid = Number(req.params.id);
    const [updated] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(projects.id, pid), eq(projects.userId, u.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project: updated });
  } catch (err) {
    console.error('Failed to update project:', err);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

router.delete('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const pid = Number(req.params.id);
    await db
      .delete(projects)
      .where(and(eq(projects.id, pid), eq(projects.userId, u.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete project:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

router.get('/projects/:id/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const pid = Number(req.params.id);
    const [proj] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, pid), eq(projects.userId, u.id)))
      .limit(1);
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const [convs, files, mems] = await Promise.all([
      db.select().from(conversations).where(and(eq(conversations.projectId, pid), eq(conversations.userId, u.id))),
      db.select().from(uploadedFiles).where(and(eq(uploadedFiles.projectId, pid), eq(uploadedFiles.userId, u.id))),
      db.select().from(memoryItems).where(and(eq(memoryItems.projectId, pid), eq(memoryItems.userId, u.id))),
    ]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="project-${proj.id}.zip"`);

    const zip = new JSZip();
    zip.file(
      'project.json',
      JSON.stringify({ project: proj, conversations: convs, memories: mems }, null, 2),
    );
    zip.file(
      'README.md',
      `# ${proj.name}\n\n${proj.description}\n\n## Instructions\n${proj.instructions}\n`,
    );
    for (const f of files) {
      if (f.extractedText) {
        zip.file(`extracted/${f.originalName}.txt`, f.extractedText);
      }
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.send(zipBuffer);
  } catch (err) {
    console.error('Project export failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export project archive.' });
    }
  }
});

export default router;
