export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'xai' | 'ollama';

export interface ModelCapabilities {
  streaming: boolean;
  thinking: boolean;
  vision: boolean;
  tools: boolean;
  webGrounding: boolean;
  imageGen: boolean;
  audioIn: boolean;
  audioOut: boolean;
}

export interface ModelSpec {
  id: string;
  provider: ProviderId;
  displayName: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  requiresPaidTier?: boolean;
  inputCostPer1M: number;
  outputCostPer1M: number;
  capabilities: ModelCapabilities;
}

export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: 'gemini-4-hydrogen',
    provider: 'gemini',
    displayName: 'Gemini 4 Hydrogen',
    description: 'Fast multimodal workhorse with search grounding, thinking levels, and low-latency streaming.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: true,
      tools: true,
      webGrounding: true,
      imageGen: false,
      audioIn: true,
      audioOut: false,
    },
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    displayName: 'Gemini 3.1 Flash Lite',
    description: 'High-throughput model optimized for rapid classification, summaries, and lightweight tasks.',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: true,
      tools: true,
      webGrounding: true,
      imageGen: false,
      audioIn: true,
      audioOut: false,
    },
  },
  {
    id: 'gemini-4-neon',
    provider: 'gemini',
    displayName: 'Gemini 4 Neon',
    description: 'High-reasoning model for software architecture, STEM analysis, and complex multi-step synthesis.',
    contextWindow: 2000000,
    maxOutputTokens: 65536,
    requiresPaidTier: true,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: true,
      tools: true,
      webGrounding: true,
      imageGen: false,
      audioIn: true,
      audioOut: false,
    },
  },
  {
    id: 'gemini-4-carbon',
    provider: 'gemini',
    displayName: 'Gemini 4 Carbon',
    description: 'Deep reasoning model built for root-cause debugging, security auditing, and formal analysis.',
    contextWindow: 2000000,
    maxOutputTokens: 65536,
    requiresPaidTier: true,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: true,
      tools: true,
      webGrounding: true,
      imageGen: false,
      audioIn: true,
      audioOut: false,
    },
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    provider: 'gemini',
    displayName: 'Nano Banana Image Lite',
    description: 'Dedicated fast image generation and reference-based image editing model.',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    requiresPaidTier: true,
    inputCostPer1M: 0.3,
    outputCostPer1M: 3.0,
    capabilities: {
      streaming: false,
      thinking: false,
      vision: true,
      tools: false,
      webGrounding: false,
      imageGen: true,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'gemini-nano-banana-2.1',
    provider: 'gemini',
    displayName: 'Nano Banana 2.1',
    description: 'High-resolution (1K–4K) studio image generation with search grounding and wide aspect ratios.',
    contextWindow: 65536,
    maxOutputTokens: 8192,
    requiresPaidTier: true,
    inputCostPer1M: 1.0,
    outputCostPer1M: 6.0,
    capabilities: {
      streaming: false,
      thinking: false,
      vision: true,
      tools: false,
      webGrounding: true,
      imageGen: true,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o (OpenAI)',
    description: 'OpenAI multimodal flagship model (requires server OPENAI_API_KEY or user BYOK key).',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    capabilities: {
      streaming: true,
      thinking: false,
      vision: true,
      tools: true,
      webGrounding: false,
      imageGen: false,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3-mini (OpenAI)',
    description: 'OpenAI reasoning model for coding and math (requires OPENAI_API_KEY or user BYOK key).',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: false,
      tools: true,
      webGrounding: false,
      imageGen: false,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4 (Anthropic)',
    description: 'Anthropic balanced coding and writing model (requires ANTHROPIC_API_KEY or user BYOK key).',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    capabilities: {
      streaming: true,
      thinking: true,
      vision: true,
      tools: true,
      webGrounding: false,
      imageGen: false,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'grok-3',
    provider: 'xai',
    displayName: 'Grok 3 (xAI)',
    description: 'xAI general reasoning model (requires XAI_API_KEY or user BYOK key).',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    capabilities: {
      streaming: true,
      thinking: false,
      vision: false,
      tools: true,
      webGrounding: false,
      imageGen: false,
      audioIn: false,
      audioOut: false,
    },
  },
  {
    id: 'qwen3:1.7b',
    provider: 'ollama',
    displayName: 'Ollama Local (qwen3:1.7b)',
    description: 'Local Ollama runtime model (requires configured OLLAMA_BASE_URL or user local endpoint).',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    capabilities: {
      streaming: true,
      thinking: false,
      vision: false,
      tools: false,
      webGrounding: false,
      imageGen: false,
      audioIn: false,
      audioOut: false,
    },
  },
];

export function getModelSpec(modelId: string): ModelSpec | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const spec = getModelSpec(modelId);
  if (!spec) return 0;
  return (
    (inputTokens / 1_000_000) * spec.inputCostPer1M +
    (outputTokens / 1_000_000) * spec.outputCostPer1M
  );
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}
