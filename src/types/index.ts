export type WorkspaceView =
  | 'chat'
  | 'research'
  | 'images'
  | 'builder'
  | 'voice'
  | 'docs-data'
  | 'coding'
  | 'projects'
  | 'memory'
  | 'explore'
  | 'usage-evals'
  | 'settings';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  theme: 'dark' | 'light';
  customInstructions: string;
  memoryEnabled: boolean;
  preferredModel: string;
  createdAt?: string;
}

export interface ModelSpec {
  id: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'xai' | 'ollama';
  displayName: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  requiresPaidTier?: boolean;
  inputCostPer1M: number;
  outputCostPer1M: number;
  available: boolean;
  availabilitySource: string;
  capabilities: {
    streaming: boolean;
    thinking: boolean;
    vision: boolean;
    tools: boolean;
    webGrounding: boolean;
    imageGen: boolean;
    audioIn: boolean;
    audioOut: boolean;
  };
}

export interface ConversationItem {
  id: number;
  projectId: number | null;
  title: string;
  model: string;
  provider: string;
  systemPrompt: string;
  pinned: boolean;
  archived: boolean;
  isTemporary: boolean;
  activeLeafMessageId: number | null;
  shareToken: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSource {
  title: string;
  url: string;
  domain: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  parentId: number | null;
  branchIndex: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinkingText: string;
  model: string;
  provider: string;
  stopped: boolean;
  sourcesJson: ChatSource[];
  attachmentsJson: Array<{ fileId?: number; name: string; mimeType: string }>;
  usageJson: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
    latencyMs?: number;
  };
  feedback: 'up' | 'down' | null;
  createdAt: string;
}

export interface MemoryItem {
  id: number;
  projectId: number | null;
  content: string;
  category: string;
  updatedAt: string;
}

export interface MemoryCandidate {
  id: number;
  conversationId: number;
  content: string;
  category: string;
  status: string;
  createdAt: string;
}

export interface ProjectItem {
  id: number;
  name: string;
  description: string;
  instructions: string;
  sharedMemory: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileItem {
  id: number;
  projectId: number | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  extractedText?: string;
  previewJson: {
    kind?: string;
    pages?: number;
    language?: string;
    tables?: Array<{ name: string; rows: string[][] }>;
    totalRows?: number;
    headers?: string[];
  };
  createdAt: string;
}

export interface GeneratedImageItem {
  id: number;
  projectId: number | null;
  provider: string;
  model: string;
  prompt: string;
  enhancedPrompt: string;
  negativePrompt: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  stylePreset: string;
  mimeType: string;
  createdAt: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  reliabilityTier: 'high' | 'standard' | 'unverified';
  retrievedAt: string;
  provider: string;
}

export interface ResearchRunItem {
  id: number;
  query: string;
  status: string;
  reportMarkdown: string;
  sourcesJson: ResearchSource[];
  stepsJson: Array<{ step: string; detail: string; status: string }>;
  durationMs: number;
  createdAt: string;
}

export interface BuilderProjectItem {
  id: number;
  projectId: number | null;
  name: string;
  description: string;
  stack: string;
  planMarkdown: string;
  filesJson: Record<string, string>;
  checkpointsJson: Array<{
    id: string;
    label: string;
    createdAt: string;
    buildStatus: string;
    files: Record<string, string>;
  }>;
  lastBuildStatus: string;
  lastBuildLogs: string;
  createdAt: string;
  updatedAt: string;
}
