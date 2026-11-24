import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import {
  conversations,
  generatedImages,
  memoryItems,
  projects,
  uploadedFiles,
  usageLogs,
  userApiKeys,
  users,
} from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { MODEL_REGISTRY } from '../ai/registry.ts';
import { getUserProviderStatus } from '../ai/adapters.ts';
import { encryptSecret } from '../utils/crypto.ts';
import { assertSafeExternalUrl, recordAuditLog } from '../utils/security.ts';

const router = Router();

router.get('/models', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;
    const status = await getUserProviderStatus(dbUser.id);
    const models = MODEL_REGISTRY.map((m) => ({
      ...m,
      available: status[m.provider]?.configured ?? false,
      availabilitySource: status[m.provider]?.source ?? 'unconfigured',
    }));
    res.json({ models, providers: status });
  } catch (err) {
    console.error('Failed to list models:', err);
    res.status(500).json({ error: 'Failed to load model registry.' });
  }
});

router.get('/account/me', requireAuth, async (req: AuthRequest, res) => {
  const u = req.dbUser!;
  res.json({
    user: {
      id: u.id,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      role: u.role,
      theme: u.theme,
      customInstructions: u.customInstructions,
      memoryEnabled: u.memoryEnabled,
      preferredModel: u.preferredModel,
      createdAt: u.createdAt,
    },
  });
});

const updateAccountSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  theme: z.enum(['dark', 'light']).optional(),
  customInstructions: z.string().max(4000).optional(),
  memoryEnabled: z.boolean().optional(),
  preferredModel: z.string().min(1).max(120).optional(),
});

router.patch('/account/me', requireAuth, async (req: AuthRequest, res) => {
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update payload.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const [updated] = await db
      .update(users)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, u.id))
      .returning();

    res.json({ user: updated });
  } catch (err) {
    console.error('Profile update failed:', err);
    res.status(500).json({ error: 'Failed to update profile preferences.' });
  }
});

router.get('/account/keys', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const rows = await db
      .select({
        id: userApiKeys.id,
        provider: userApiKeys.provider,
        label: userApiKeys.label,
        keyHint: userApiKeys.keyHint,
        baseUrl: userApiKeys.baseUrl,
        createdAt: userApiKeys.createdAt,
      })
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, u.id));
    res.json({ keys: rows });
  } catch (err) {
    console.error('Failed to list provider keys:', err);
    res.status(500).json({ error: 'Failed to load provider credentials.' });
  }
});

const upsertKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'xai', 'ollama']),
  apiKey: z.string().max(500).optional().default(''),
  label: z.string().max(80).optional().default(''),
  baseUrl: z.string().max(300).optional().default(''),
});

router.put('/account/keys', requireAuth, async (req: AuthRequest, res) => {
  const parsed = upsertKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid provider key payload.' });
    return;
  }
  try {
    const u = req.dbUser!;
    const { provider, apiKey, label, baseUrl } = parsed.data;
    if (provider !== 'ollama' && !apiKey.trim()) {
      res.status(400).json({ error: 'API key is required for this provider.' });
      return;
    }
    if (baseUrl.trim()) {
      if (provider !== 'ollama') {
        await assertSafeExternalUrl(baseUrl.trim());
      } else {
        const parsedUrl = new URL(baseUrl.trim());
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new Error('Ollama endpoint must use HTTP or HTTPS.');
        }
      }
    }

    const encrypted = apiKey.trim()
      ? encryptSecret(apiKey.trim())
      : { encryptedKey: '', iv: '', authTag: '', keyHint: 'local' };

    await db
      .insert(userApiKeys)
      .values({
        userId: u.id,
        provider,
        label: label || provider.toUpperCase(),
        encryptedKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyHint: encrypted.keyHint,
        baseUrl: baseUrl.trim(),
      })
      .onConflictDoUpdate({
        target: [userApiKeys.userId, userApiKeys.provider],
        set: {
          label: label || provider.toUpperCase(),
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyHint: encrypted.keyHint,
          baseUrl: baseUrl.trim(),
        },
      });

    await recordAuditLog({
      userId: u.id,
      action: 'byok_key_saved',
      resourceType: 'provider',
      resourceId: provider,
      ipAddress: req.ip,
    });

    res.json({ ok: true, provider, keyHint: encrypted.keyHint });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to store provider configuration.',
    });
  }
});

router.delete('/account/keys/:provider', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const provider = String(req.params.provider || '');
    await db
      .delete(userApiKeys)
      .where(and(eq(userApiKeys.userId, u.id), eq(userApiKeys.provider, provider)));
    await recordAuditLog({
      userId: u.id,
      action: 'byok_key_deleted',
      resourceType: 'provider',
      resourceId: provider,
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete key:', err);
    res.status(500).json({ error: 'Failed to remove provider credential.' });
  }
});

router.get('/account/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const [convs, mems, projs, files, imgs, usage] = await Promise.all([
      db.select().from(conversations).where(eq(conversations.userId, u.id)).orderBy(desc(conversations.updatedAt)),
      db.select().from(memoryItems).where(eq(memoryItems.userId, u.id)),
      db.select().from(projects).where(eq(projects.userId, u.id)),
      db.select({ id: uploadedFiles.id, originalName: uploadedFiles.originalName, mimeType: uploadedFiles.mimeType, sizeBytes: uploadedFiles.sizeBytes, createdAt: uploadedFiles.createdAt }).from(uploadedFiles).where(eq(uploadedFiles.userId, u.id)),
      db.select({ id: generatedImages.id, prompt: generatedImages.prompt, model: generatedImages.model, aspectRatio: generatedImages.aspectRatio, createdAt: generatedImages.createdAt }).from(generatedImages).where(eq(generatedImages.userId, u.id)),
      db.select().from(usageLogs).where(eq(usageLogs.userId, u.id)).orderBy(desc(usageLogs.createdAt)).limit(500),
    ]);

    res.setHeader('Content-Disposition', `attachment; filename="sub-ai-export-${u.id}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      user: {
        email: u.email,
        displayName: u.displayName,
        customInstructions: u.customInstructions,
        preferredModel: u.preferredModel,
      },
      projects: projs,
      conversations: convs,
      memories: mems,
      files,
      generatedImages: imgs,
      recentUsage: usage,
    });
  } catch (err) {
    console.error('Account export failed:', err);
    res.status(500).json({ error: 'Failed to export user data.' });
  }
});

router.delete('/account/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    await recordAuditLog({
      userId: u.id,
      action: 'account_deleted',
      resourceType: 'user',
      resourceId: u.id,
      ipAddress: req.ip,
    });
    await db.delete(users).where(eq(users.id, u.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Account deletion failed:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

export default router;
