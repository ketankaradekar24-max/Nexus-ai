import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { usageLogs } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { createGeminiClient, normalizeProviderError } from '../ai/adapters.ts';

const router = Router();

const transcribeSchema = z.object({
  mimeType: z.string().min(3).max(60),
  base64Audio: z.string().min(10).max(15_000_000),
  languageHint: z.string().max(40).optional(),
});

router.post('/voice/transcribe', requireAuth, async (req: AuthRequest, res) => {
  const parsed = transcribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid audio payload is required.' });
    return;
  }

  const u = req.dbUser!;
  const startedAt = Date.now();
  try {
    const ai = createGeminiClient();
    const promptText = parsed.data.languageHint
      ? `Transcribe this audio accurately (hint language: ${parsed.data.languageHint}). Return only the transcript.`
      : 'Transcribe this audio accurately. Return only the transcript.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: parsed.data.mimeType,
              data: parsed.data.base64Audio,
            },
          },
          { text: promptText },
        ],
      },
    });

    await db.insert(usageLogs).values({
      userId: u.id,
      provider: 'gemini',
      model: 'gemini-3.5-transcribe',
      feature: 'voice',
      inputTokens: response.usageMetadata?.promptTokenCount ?? 300,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 150,
      estimatedCostUsd: '0.000400',
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });

    res.json({ transcript: (response.text || '').trim(), mode: 'batch_transcription' });
  } catch (err) {
    res.status(400).json({ error: normalizeProviderError(err, 'gemini-3.5-transcribe') });
  }
});

const ttsSchema = z.object({
  text: z.string().min(1).max(3500),
  voiceName: z.enum(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']).optional().default('Kore'),
  style: z.string().max(120).optional(),
});

router.post('/voice/tts', requireAuth, async (req: AuthRequest, res) => {
  const parsed = ttsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Text is required for speech synthesis.' });
    return;
  }

  const u = req.dbUser!;
  const startedAt = Date.now();
  try {
    const ai = createGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: parsed.data.text,
              ...(parsed.data.style
                ? { speechMetadata: { style: parsed.data.style } }
                : {}),
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: parsed.data.voiceName },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('TTS model did not return audio data.');
    }

    await db.insert(usageLogs).values({
      userId: u.id,
      provider: 'gemini',
      model: 'gemini-3.8-flash-lite-tts',
      feature: 'voice',
      inputTokens: parsed.data.text.length,
      outputTokens: 500,
      estimatedCostUsd: '0.000500',
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });

    res.json({
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      mimeType: 'audio/wav',
      voiceName: parsed.data.voiceName,
    });
  } catch (err) {
    res.status(400).json({ error: normalizeProviderError(err, 'gemini-3.8-flash-lite-tts') });
  }
});

export default router;
