import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { generatedImages, usageLogs } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { createGeminiClient, generateTextUnary, normalizeProviderError } from '../ai/adapters.ts';
import { resolveSafePath } from '../utils/security.ts';

const router = Router();
const IMAGES_DIR = path.resolve(process.cwd(), 'storage', 'images');

async function ensureImagesDir(userId: number): Promise<string> {
  const dir = resolveSafePath(IMAGES_DIR, String(userId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

router.get('/images', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const conds = [eq(generatedImages.userId, u.id)];
    if (projectId && Number.isFinite(projectId)) {
      conds.push(eq(generatedImages.projectId, projectId));
    }
    const items = await db
      .select()
      .from(generatedImages)
      .where(and(...conds))
      .orderBy(desc(generatedImages.createdAt))
      .limit(100);
    res.json({ images: items });
  } catch (err) {
    console.error('Failed to list images:', err);
    res.status(500).json({ error: 'Failed to load image gallery.' });
  }
});

router.get('/images/:id/file', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const imgId = Number(req.params.id);
    const [img] = await db
      .select()
      .from(generatedImages)
      .where(and(eq(generatedImages.id, imgId), eq(generatedImages.userId, u.id)))
      .limit(1);
    if (!img) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    const safePath = resolveSafePath(IMAGES_DIR, img.filePath);
    const buf = await fs.readFile(safePath);
    res.setHeader('Content-Type', img.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch (err) {
    console.error('Failed to read image file:', err);
    res.status(404).json({ error: 'Image binary not found.' });
  }
});

const enhanceSchema = z.object({
  prompt: z.string().min(2).max(2000),
  stylePreset: z.string().max(60).optional(),
});

router.post('/images/enhance-prompt', requireAuth, async (req: AuthRequest, res) => {
  const parsed = enhanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const result = await generateTextUnary({
      userId: u.id,
      modelId: 'gemini-4-hydrogen',
      prompt: `Rewrite this image generation prompt into one vivid, photographic or artistic prompt specifying lighting, composition, texture, and mood (under 90 words). Return ONLY the enhanced prompt.\n\nOriginal: ${parsed.data.prompt}\nStyle preference: ${parsed.data.stylePreset || 'natural'}`,
    });
    res.json({ enhancedPrompt: result.text.trim() });
  } catch (err) {
    res.status(500).json({ error: normalizeProviderError(err, 'gemini-4-hydrogen') });
  }
});

const generateImageSchema = z.object({
  prompt: z.string().min(2).max(2500),
  negativePrompt: z.string().max(800).optional().default(''),
  model: z
    .enum(['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1'])
    .optional()
    .default('gemini-3.1-flash-lite-image'),
  aspectRatio: z
    .enum(['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '1:8', '4:1', '8:1'])
    .optional()
    .default('1:1'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('1K'),
  quality: z.enum(['standard', 'high']).optional().default('standard'),
  stylePreset: z.string().max(60).optional().default('none'),
  variations: z.number().int().min(1).max(3).optional().default(1),
  projectId: z.number().int().positive().nullable().optional(),
  referenceImage: z
    .object({
      mimeType: z.string().max(60),
      base64Data: z.string().max(8_000_000),
    })
    .optional(),
});

router.post('/images/generate', requireAuth, async (req: AuthRequest, res) => {
  const parsed = generateImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid image generation parameters.' });
    return;
  }

  const u = req.dbUser!;
  const body = parsed.data;
  const startedAt = Date.now();

  try {
    const ai = createGeminiClient();
    await ensureImagesDir(u.id);

    const styleSuffix =
      body.stylePreset && body.stylePreset !== 'none'
        ? `. Visual style: ${body.stylePreset}`
        : '';
    const negativeSuffix = body.negativePrompt.trim()
      ? `. Avoid: ${body.negativePrompt.trim()}`
      : '';
    const finalPrompt = `${body.prompt.trim()}${styleSuffix}${negativeSuffix}`;

    const useNano21 = body.model === 'gemini-nano-banana-2.1';
    const allowedAspect =
      !useNano21 && ['1:4', '1:8', '4:1', '8:1'].includes(body.aspectRatio)
        ? '1:1'
        : body.aspectRatio;

    const createdRecords = [];

    for (let i = 0; i < body.variations; i++) {
      const parts: Array<Record<string, unknown>> = [];
      if (body.referenceImage?.base64Data) {
        parts.push({
          inlineData: {
            data: body.referenceImage.base64Data,
            mimeType: body.referenceImage.mimeType,
          },
        });
      }
      parts.push({
        text:
          body.variations > 1
            ? `${finalPrompt} (Variation ${i + 1})`
            : finalPrompt,
      });

      const imageConfig: Record<string, string> = {
        aspectRatio: allowedAspect,
      };
      if (useNano21) {
        imageConfig.imageSize = body.resolution;
      }

      const response = await ai.models.generateContent({
        model: body.model,
        contents: { parts },
        config: {
          imageConfig,
        },
      });

      let imgBase64 = '';
      let mimeType = 'image/png';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          imgBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!imgBase64) {
        throw new Error('The image model did not return an image payload.');
      }

      const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
      const relPath = path.join(String(u.id), `${crypto.randomUUID()}.${ext}`);
      const absPath = resolveSafePath(IMAGES_DIR, relPath);
      await fs.writeFile(absPath, Buffer.from(imgBase64, 'base64'));

      const [saved] = await db
        .insert(generatedImages)
        .values({
          userId: u.id,
          projectId: body.projectId ?? null,
          provider: 'gemini',
          model: body.model,
          prompt: body.prompt.trim(),
          enhancedPrompt: finalPrompt,
          negativePrompt: body.negativePrompt.trim(),
          aspectRatio: allowedAspect,
          resolution: useNano21 ? body.resolution : '1K',
          quality: body.quality,
          stylePreset: body.stylePreset,
          filePath: relPath,
          mimeType,
        })
        .returning();

      createdRecords.push(saved);
    }

    await db.insert(usageLogs).values({
      userId: u.id,
      provider: 'gemini',
      model: body.model,
      feature: 'image',
      inputTokens: 0,
      outputTokens: body.variations * 1000,
      estimatedCostUsd: (body.variations * (useNano21 ? 0.06 : 0.03)).toFixed(6),
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });

    res.status(201).json({ images: createdRecords });
  } catch (err) {
    const msg = normalizeProviderError(err, body.model);
    await db
      .insert(usageLogs)
      .values({
        userId: u.id,
        provider: 'gemini',
        model: body.model,
        feature: 'image',
        status: 'error',
      })
      .catch(() => {});
    res.status(400).json({ error: msg });
  }
});

const analyzeSchema = z.object({
  question: z.string().min(1).max(2000),
  mimeType: z.string().max(60),
  base64Data: z.string().max(8_000_000),
});

router.post('/images/analyze', requireAuth, async (req: AuthRequest, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Image and question are required.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const ai = createGeminiClient();
    const startedAt = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: parsed.data.mimeType,
              data: parsed.data.base64Data,
            },
          },
          { text: parsed.data.question },
        ],
      },
    });
    const answer = response.text || '';
    await db.insert(usageLogs).values({
      userId: u.id,
      provider: 'gemini',
      model: 'gemini-4-hydrogen',
      feature: 'image',
      inputTokens: response.usageMetadata?.promptTokenCount ?? 500,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 200,
      estimatedCostUsd: '0.000500',
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });
    res.json({ answer });
  } catch (err) {
    res.status(400).json({ error: normalizeProviderError(err, 'gemini-4-hydrogen') });
  }
});

router.patch('/images/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const imgId = Number(req.params.id);
    const projectId = req.body?.projectId ? Number(req.body.projectId) : null;
    const [updated] = await db
      .update(generatedImages)
      .set({ projectId })
      .where(and(eq(generatedImages.id, imgId), eq(generatedImages.userId, u.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    res.json({ image: updated });
  } catch (err) {
    console.error('Failed to update image project:', err);
    res.status(500).json({ error: 'Failed to update image.' });
  }
});

router.delete('/images/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const imgId = Number(req.params.id);
    const [deleted] = await db
      .delete(generatedImages)
      .where(and(eq(generatedImages.id, imgId), eq(generatedImages.userId, u.id)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    const safePath = resolveSafePath(IMAGES_DIR, deleted.filePath);
    await fs.unlink(safePath).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete image:', err);
    res.status(500).json({ error: 'Failed to delete image.' });
  }
});

export default router;
