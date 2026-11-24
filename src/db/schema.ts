import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default('').notNull(),
  avatarUrl: text('avatar_url').default('').notNull(),
  role: text('role').default('user').notNull(),
  theme: text('theme').default('dark').notNull(),
  customInstructions: text('custom_instructions').default('').notNull(),
  memoryEnabled: boolean('memory_enabled').default(true).notNull(),
  preferredModel: text('preferred_model').default('gemini-4-hydrogen').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userApiKeys = pgTable(
  'user_api_keys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(), // openai | anthropic | xai | ollama | custom
    label: text('label').default('').notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    keyHint: text('key_hint').notNull(),
    baseUrl: text('base_url').default('').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_user_api_keys_user_provider').on(table.userId, table.provider),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    instructions: text('instructions').default('').notNull(),
    sharedMemory: boolean('shared_memory').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_projects_user').on(table.userId, table.updatedAt)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').default('New Conversation').notNull(),
    model: text('model').default('gemini-4-hydrogen').notNull(),
    provider: text('provider').default('gemini').notNull(),
    systemPrompt: text('system_prompt').default('').notNull(),
    pinned: boolean('pinned').default(false).notNull(),
    archived: boolean('archived').default(false).notNull(),
    isTemporary: boolean('is_temporary').default(false).notNull(),
    activeLeafMessageId: integer('active_leaf_message_id'),
    shareToken: text('share_token'),
    isShared: boolean('is_shared').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_conversations_user_updated').on(table.userId, table.updatedAt),
    index('idx_conversations_project').on(table.projectId),
    index('idx_conversations_share').on(table.shareToken),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    parentId: integer('parent_id'),
    branchIndex: integer('branch_index').default(0).notNull(),
    role: text('role').notNull(), // user | assistant | system
    content: text('content').default('').notNull(),
    thinkingText: text('thinking_text').default('').notNull(),
    model: text('model').default('').notNull(),
    provider: text('provider').default('').notNull(),
    stopped: boolean('stopped').default(false).notNull(),
    sourcesJson: jsonb('sources_json').$type<unknown[]>().default([]).notNull(),
    attachmentsJson: jsonb('attachments_json').$type<unknown[]>().default([]).notNull(),
    toolCallsJson: jsonb('tool_calls_json').$type<unknown[]>().default([]).notNull(),
    usageJson: jsonb('usage_json').$type<Record<string, unknown>>().default({}).notNull(),
    feedback: text('feedback'), // up | down | null
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_messages_conv_created').on(table.conversationId, table.createdAt),
    index('idx_messages_parent').on(table.parentId),
  ],
);

export const conversationSummaries = pgTable('conversation_summaries', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  summary: text('summary').default('').notNull(),
  summarizedUpToMessageId: integer('summarized_up_to_message_id'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const memoryItems = pgTable(
  'memory_items',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    content: text('content').notNull(),
    category: text('category').default('general').notNull(),
    sourceConversationId: integer('source_conversation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_memory_user').on(table.userId, table.projectId)],
);

export const memoryCandidates = pgTable(
  'memory_candidates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    category: text('category').default('general').notNull(),
    status: text('status').default('pending').notNull(), // pending | approved | rejected
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_memory_candidates_user').on(table.userId, table.status)],
);

export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    extractedText: text('extracted_text').default('').notNull(),
    previewJson: jsonb('preview_json').$type<Record<string, unknown>>().default({}).notNull(),
    chunkCount: integer('chunk_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_files_user').on(table.userId, table.createdAt)],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: serial('id').primaryKey(),
    fileId: integer('file_id')
      .references(() => uploadedFiles.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenEstimate: integer('token_estimate').default(0).notNull(),
  },
  (table) => [index('idx_chunks_file').on(table.fileId, table.chunkIndex)],
);

export const generatedImages = pgTable(
  'generated_images',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    enhancedPrompt: text('enhanced_prompt').default('').notNull(),
    negativePrompt: text('negative_prompt').default('').notNull(),
    aspectRatio: text('aspect_ratio').default('1:1').notNull(),
    resolution: text('resolution').default('1K').notNull(),
    quality: text('quality').default('standard').notNull(),
    stylePreset: text('style_preset').default('none').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').default('image/png').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_images_user').on(table.userId, table.createdAt)],
);

export const researchRuns = pgTable(
  'research_runs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    query: text('query').notNull(),
    status: text('status').default('completed').notNull(),
    reportMarkdown: text('report_markdown').default('').notNull(),
    sourcesJson: jsonb('sources_json').$type<unknown[]>().default([]).notNull(),
    stepsJson: jsonb('steps_json').$type<unknown[]>().default([]).notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_research_user').on(table.userId, table.createdAt)],
);

export const builderProjects = pgTable(
  'builder_projects',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    stack: text('stack').default('react-ts-tailwind').notNull(),
    planMarkdown: text('plan_markdown').default('').notNull(),
    filesJson: jsonb('files_json').$type<Record<string, string>>().default({}).notNull(),
    checkpointsJson: jsonb('checkpoints_json').$type<unknown[]>().default([]).notNull(),
    lastBuildStatus: text('last_build_status').default('idle').notNull(),
    lastBuildLogs: text('last_build_logs').default('').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_builder_user').on(table.userId, table.updatedAt)],
);

export const analysisNotebooks = pgTable(
  'analysis_notebooks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: integer('file_id').references(() => uploadedFiles.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    language: text('language').default('python').notNull(),
    code: text('code').default('').notNull(),
    resultJson: jsonb('result_json').$type<Record<string, unknown>>().default({}).notNull(),
    chartConfigJson: jsonb('chart_config_json').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_notebooks_user').on(table.userId, table.updatedAt)],
);

export const usageLogs = pgTable(
  'usage_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    feature: text('feature').notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 })
      .default('0')
      .notNull(),
    latencyMs: integer('latency_ms').default(0).notNull(),
    status: text('status').default('success').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_usage_user_created').on(table.userId, table.createdAt)],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    suiteName: text('suite_name').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    totalCases: integer('total_cases').default(0).notNull(),
    passedCases: integer('passed_cases').default(0).notNull(),
    avgLatencyMs: integer('avg_latency_ms').default(0).notNull(),
    resultsJson: jsonb('results_json').$type<unknown[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_eval_runs_user').on(table.userId, table.createdAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    resourceType: text('resource_type').default('').notNull(),
    resourceId: text('resource_id').default('').notNull(),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>().default({}).notNull(),
    ipAddress: text('ip_address').default('').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_created').on(table.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(userApiKeys),
  projects: many(projects),
  conversations: many(conversations),
  memoryItems: many(memoryItems),
  files: many(uploadedFiles),
  images: many(generatedImages),
  researchRuns: many(researchRuns),
  builderProjects: many(builderProjects),
  usageLogs: many(usageLogs),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  project: one(projects, { fields: [conversations.projectId], references: [projects.id] }),
  messages: many(messages),
  summary: one(conversationSummaries, {
    fields: [conversations.id],
    references: [conversationSummaries.conversationId],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
