import { GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import { usageLogs, userApiKeys } from '../../src/db/schema.ts';
import { decryptSecret } from '../utils/crypto.ts';
import { assertSafeExternalUrl } from '../utils/security.ts';
import { estimateCostUsd, estimateTokens, getModelSpec, type ProviderId } from './registry.ts';

export interface ChatTurnInput {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    mimeType: string;
    base64Data?: string;
    name?: string;
    extractedText?: string;
  }>;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onThinking?: (text: string) => void;
  onSource?: (source: { title: string; url: string; domain: string }) => void;
}

export interface GenerateChatOptions {
  userId: number;
  modelId: string;
  messages: ChatTurnInput[];
  systemInstruction?: string;
  thinkingLevel?: 'low' | 'medium' | 'high' | 'xhigh';
  enableWebSearch?: boolean;
  feature?: 'chat' | 'research' | 'builder' | 'docs' | 'coding';
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  thinkingText: string;
  sources: Array<{ title: string; url: string; domain: string }>;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  provider: ProviderId;
  model: string;
  latencyMs: number;
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function getUserProviderStatus(userId: number) {
  const userKeys = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));

  const byokMap = new Map(userKeys.map((k) => [k.provider, k]));

  const hasEnvGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasEnvOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasEnvAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasEnvXai = Boolean(process.env.XAI_API_KEY?.trim());
  const hasEnvOllama = Boolean(process.env.OLLAMA_BASE_URL?.trim());

  return {
    gemini: {
      configured: hasEnvGemini,
      source: hasEnvGemini ? 'server_env' : 'unconfigured',
    },
    openai: {
      configured: hasEnvOpenai || byokMap.has('openai'),
      source: byokMap.has('openai') ? 'byok' : hasEnvOpenai ? 'server_env' : 'unconfigured',
      keyHint: byokMap.get('openai')?.keyHint ?? null,
    },
    anthropic: {
      configured: hasEnvAnthropic || byokMap.has('anthropic'),
      source: byokMap.has('anthropic') ? 'byok' : hasEnvAnthropic ? 'server_env' : 'unconfigured',
      keyHint: byokMap.get('anthropic')?.keyHint ?? null,
    },
    xai: {
      configured: hasEnvXai || byokMap.has('xai'),
      source: byokMap.has('xai') ? 'byok' : hasEnvXai ? 'server_env' : 'unconfigured',
      keyHint: byokMap.get('xai')?.keyHint ?? null,
    },
    ollama: {
      configured: hasEnvOllama || Boolean(byokMap.get('ollama')?.baseUrl),
      source: byokMap.has('ollama') ? 'byok' : hasEnvOllama ? 'server_env' : 'unconfigured',
      baseUrl: byokMap.get('ollama')?.baseUrl || process.env.OLLAMA_BASE_URL || '',
    },
  };
}

async function resolveProviderCredential(
  userId: number,
  provider: ProviderId,
): Promise<{ apiKey?: string; baseUrl?: string }> {
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error('Gemini API key is not configured on the server.');
    return { apiKey: key };
  }

  const rows = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  const userRow = rows.find((r) => r.provider === provider);

  if (userRow) {
    const decrypted = userRow.encryptedKey
      ? decryptSecret({
          encryptedKey: userRow.encryptedKey,
          iv: userRow.iv,
          authTag: userRow.authTag,
        })
      : undefined;
    return { apiKey: decrypted, baseUrl: userRow.baseUrl || undefined };
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY?.trim()) {
    return { apiKey: process.env.OPENAI_API_KEY.trim(), baseUrl: 'https://api.openai.com/v1' };
  }
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY?.trim()) {
    return { apiKey: process.env.ANTHROPIC_API_KEY.trim() };
  }
  if (provider === 'xai' && process.env.XAI_API_KEY?.trim()) {
    return { apiKey: process.env.XAI_API_KEY.trim(), baseUrl: 'https://api.x.ai/v1' };
  }
  if (provider === 'ollama' && process.env.OLLAMA_BASE_URL?.trim()) {
    return { baseUrl: process.env.OLLAMA_BASE_URL.trim() };
  }

  throw new Error(
    `Provider "${provider}" is not configured. Add an API key in Settings > Provider Keys or configure server credentials.`,
  );
}

export function normalizeProviderError(err: unknown, modelId: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/API_KEY_INVALID|401|Incorrect API key|authentication_error/i.test(msg)) {
    return `Authentication failed for ${modelId}. Check the configured API key.`;
  }
  if (/PERMISSION_DENIED|403|paid/i.test(msg)) {
    return `Access denied for ${modelId}. This model may require a billing-enabled API key in Settings > Secrets.`;
  }
  if (/RESOURCE_EXHAUSTED|429|rate limit/i.test(msg)) {
    return `Rate or quota limit reached for ${modelId}. Try again shortly or select Gemini 4 Hydrogen.`;
  }
  if (/NOT_FOUND|404/i.test(msg)) {
    return `Model "${modelId}" is unavailable on the selected provider.`;
  }
  return msg || 'AI generation failed.';
}

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 3) {
    if (signal?.aborted) {
      throw new Error('Request aborted by user.');
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /429|503|502|504|ETIMEDOUT|ECONNRESET/i.test(msg);
      if (!isTransient || attempt === 2) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
      attempt++;
    }
  }
  throw lastErr;
}

function mapGeminiThinkingLevel(
  modelId: string,
  level?: 'low' | 'medium' | 'high' | 'xhigh',
): ThinkingLevel | undefined {
  if (!level) return undefined;
  if (level === 'xhigh') {
    if (modelId === 'gemini-4-hydrogen' || modelId === 'gemini-4-neon') {
      return ThinkingLevel.XHIGH;
    }
    return ThinkingLevel.HIGH;
  }
  if (level === 'high') return ThinkingLevel.HIGH;
  if (level === 'medium') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

async function streamGemini(
  options: GenerateChatOptions,
  callbacks: StreamCallbacks,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const ai = createGeminiClient();
  const contents: Content[] = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const parts: Part[] = [];
      for (const att of m.attachments ?? []) {
        if (att.base64Data && att.mimeType.startsWith('image/')) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            },
          });
        } else if (att.extractedText) {
          parts.push({
            text: `[Attached file: ${att.name || 'document'}]\n${att.extractedText.slice(0, 24000)}`,
          });
        }
      }
      if (m.content) {
        parts.push({ text: m.content });
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: parts.length > 0 ? parts : [{ text: '' }],
      };
    });

  const thinkingLevel = mapGeminiThinkingLevel(options.modelId, options.thinkingLevel);
  const config: Record<string, unknown> = {};
  if (options.systemInstruction?.trim()) {
    config.systemInstruction = options.systemInstruction.trim();
  }
  if (thinkingLevel) {
    config.thinkingConfig = {
      thinkingLevel,
      includeThoughts: true,
    };
  }
  if (options.enableWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  let fullText = '';
  let thinkingText = '';
  const sourceMap = new Map<string, { title: string; url: string; domain: string }>();
  let promptTokens = 0;
  let candidateTokens = 0;

  const stream = await withRetry(
    () =>
      ai.models.generateContentStream({
        model: options.modelId,
        contents,
        config,
      }),
    options.signal,
  );

  for await (const chunk of stream) {
    if (options.signal?.aborted) break;

    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const p = part as Part & { thought?: boolean };
      if (p.text) {
        if (p.thought) {
          thinkingText += p.text;
          callbacks.onThinking?.(p.text);
        } else {
          fullText += p.text;
          callbacks.onDelta(p.text);
        }
      }
    }

    const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(groundingChunks)) {
      for (const gc of groundingChunks) {
        const uri = gc.web?.uri;
        if (uri && !sourceMap.has(uri)) {
          try {
            const domain = new URL(uri).hostname.replace(/^www\./, '');
            const src = {
              title: gc.web?.title || domain,
              url: uri,
              domain,
            };
            sourceMap.set(uri, src);
            callbacks.onSource?.(src);
          } catch {
            // ignore malformed URL
          }
        }
      }
    }

    if (chunk.usageMetadata) {
      promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
      candidateTokens = chunk.usageMetadata.candidatesTokenCount ?? candidateTokens;
    }
  }

  if (promptTokens === 0) {
    promptTokens = estimateTokens(
      options.messages.map((m) => m.content).join(' ') + (options.systemInstruction || ''),
    );
  }
  if (candidateTokens === 0) {
    candidateTokens = estimateTokens(fullText + thinkingText);
  }

  return {
    text: fullText,
    thinkingText,
    sources: Array.from(sourceMap.values()),
    inputTokens: promptTokens,
    outputTokens: candidateTokens,
    estimatedCostUsd: estimateCostUsd(options.modelId, promptTokens, candidateTokens),
    provider: 'gemini',
    model: options.modelId,
    latencyMs: Date.now() - startedAt,
  };
}

async function streamOpenAICompatible(
  provider: 'openai' | 'xai' | 'ollama',
  options: GenerateChatOptions,
  callbacks: StreamCallbacks,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const creds = await resolveProviderCredential(options.userId, provider);
  const defaultBase =
    provider === 'openai'
      ? 'https://api.openai.com/v1'
      : provider === 'xai'
        ? 'https://api.x.ai/v1'
        : 'http://127.0.0.1:11434/v1';

  const baseUrl = (creds.baseUrl || defaultBase).replace(/\/+$/, '');
  if (provider !== 'ollama') {
    await assertSafeExternalUrl(baseUrl);
  }

  const formattedMessages = [];
  if (options.systemInstruction?.trim()) {
    formattedMessages.push({ role: 'system', content: options.systemInstruction.trim() });
  }
  for (const m of options.messages) {
    if (m.role === 'system') continue;
    const textAttachments = (m.attachments ?? [])
      .filter((a) => a.extractedText)
      .map((a) => `[Attached file: ${a.name || 'file'}]\n${a.extractedText?.slice(0, 18000)}`)
      .join('\n\n');
    const combined = textAttachments ? `${textAttachments}\n\n${m.content}` : m.content;
    formattedMessages.push({ role: m.role, content: combined });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (creds.apiKey) {
    headers.Authorization = `Bearer ${creds.apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal: options.signal,
    body: JSON.stringify({
      model: options.modelId,
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(`${provider} error (${response.status}): ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    if (options.signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          fullText += delta;
          callbacks.onDelta(delta);
        }
      } catch {
        // ignore partial SSE line
      }
    }
  }

  const inputTokens = estimateTokens(
    formattedMessages.map((m) => String(m.content)).join(' '),
  );
  const outputTokens = estimateTokens(fullText);

  return {
    text: fullText,
    thinkingText: '',
    sources: [],
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(options.modelId, inputTokens, outputTokens),
    provider,
    model: options.modelId,
    latencyMs: Date.now() - startedAt,
  };
}

async function streamAnthropic(
  options: GenerateChatOptions,
  callbacks: StreamCallbacks,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const creds = await resolveProviderCredential(options.userId, 'anthropic');
  if (!creds.apiKey) throw new Error('Anthropic API key is not configured.');

  const messagesPayload = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': creds.apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: options.signal,
    body: JSON.stringify({
      model: options.modelId,
      max_tokens: 4096,
      system: options.systemInstruction || undefined,
      messages: messagesPayload,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic error (${response.status}): ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    if (options.signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          callbacks.onDelta(parsed.delta.text);
        } else if (parsed.type === 'message_start' && parsed.message?.usage) {
          inputTokens = parsed.message.usage.input_tokens ?? 0;
        } else if (parsed.type === 'message_delta' && parsed.usage) {
          outputTokens = parsed.usage.output_tokens ?? outputTokens;
        }
      } catch {
        // ignore partial line
      }
    }
  }

  if (inputTokens === 0) inputTokens = estimateTokens(options.messages.map((m) => m.content).join(' '));
  if (outputTokens === 0) outputTokens = estimateTokens(fullText);

  return {
    text: fullText,
    thinkingText: '',
    sources: [],
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(options.modelId, inputTokens, outputTokens),
    provider: 'anthropic',
    model: options.modelId,
    latencyMs: Date.now() - startedAt,
  };
}

export async function generateChatStream(
  options: GenerateChatOptions,
  callbacks: StreamCallbacks,
): Promise<GenerateResult> {
  const spec = getModelSpec(options.modelId);
  const provider: ProviderId = spec?.provider ?? 'gemini';

  let result: GenerateResult;
  try {
    if (provider === 'gemini') {
      result = await streamGemini(options, callbacks);
    } else if (provider === 'anthropic') {
      result = await streamAnthropic(options, callbacks);
    } else {
      result = await streamOpenAICompatible(provider, options, callbacks);
    }

    await db.insert(usageLogs).values({
      userId: options.userId,
      provider: result.provider,
      model: result.model,
      feature: options.feature ?? 'chat',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd.toFixed(6),
      latencyMs: result.latencyMs,
      status: options.signal?.aborted ? 'stopped' : 'success',
    });

    return result;
  } catch (err) {
    await db
      .insert(usageLogs)
      .values({
        userId: options.userId,
        provider,
        model: options.modelId,
        feature: options.feature ?? 'chat',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: '0',
        latencyMs: 0,
        status: 'error',
      })
      .catch(() => {});
    throw new Error(normalizeProviderError(err, options.modelId));
  }
}

export async function generateTextUnary(params: {
  userId: number;
  modelId?: string;
  prompt: string;
  systemInstruction?: string;
  feature?: 'chat' | 'research' | 'builder' | 'docs' | 'coding';
}): Promise<GenerateResult> {
  let collected = '';
  return generateChatStream(
    {
      userId: params.userId,
      modelId: params.modelId ?? 'gemini-4-hydrogen',
      messages: [{ role: 'user', content: params.prompt }],
      systemInstruction: params.systemInstruction,
      feature: params.feature,
    },
    {
      onDelta: (delta) => {
        collected += delta;
      },
    },
  ).then((res) => ({ ...res, text: res.text || collected }));
}
