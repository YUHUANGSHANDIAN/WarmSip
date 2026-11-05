import { z } from "zod";

const text = z.string().trim();
const timestamp = z.number().int().nonnegative();

export const aiTaskIds = [
  "gift",
  "copywriting",
  "map-intent",
  "city-guide",
  "story",
  "vision",
] as const;
export type AITaskId = (typeof aiTaskIds)[number];
export const aiTaskLabels: Record<AITaskId, string> = {
  gift: "AI 选礼顾问",
  copywriting: "暖心文案",
  "map-intent": "暖迹地图灵感",
  "city-guide": "城市味道导览",
  story: "足迹故事润色",
  vision: "照片理解",
};

export const aiProviderIds = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openrouter",
  "moonshotai",
  "moonshotai-cn",
  "minimax",
  "minimax-cn",
  "custom",
] as const;
export type AIProviderId = (typeof aiProviderIds)[number];

export const aiConnectionStatuses = [
  "configured",
  "connected",
  "expired",
  "error",
  "disabled",
] as const;

export const aiConnectionSchema = z.object({
  id: z.string().min(1).max(120),
  providerId: z.enum(aiProviderIds),
  label: text.min(1).max(100),
  authType: z.enum(["api-key", "oauth", "local"]),
  baseUrl: z.string().default(""),
  enabled: z.boolean().default(true),
  status: z.enum(aiConnectionStatuses).default("configured"),
  maskedCredential: z.string().default(""),
  modelCount: z.number().int().nonnegative().default(0),
  modelIds: z.array(text.min(1).max(200)).max(50).default([]),
  lastCheckedAt: timestamp.nullable().default(null),
  lastError: z.string().default(""),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type AIConnection = z.infer<typeof aiConnectionSchema>;

export const aiModelDescriptorSchema = z.object({
  providerId: z.string(),
  id: z.string(),
  name: z.string(),
  input: z.array(z.enum(["text", "image"])).default(["text"]),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  reasoning: z.boolean().default(false),
  estimatedInputUsdPerMillion: z.number().nonnegative().optional(),
  estimatedOutputUsdPerMillion: z.number().nonnegative().optional(),
});
export type AIModelDescriptor = z.infer<typeof aiModelDescriptorSchema>;

export const aiTaskRouteSchema = z.object({
  taskId: z.enum(aiTaskIds),
  connectionId: z.string().min(1),
  modelId: z.string().min(1),
});
export type AITaskRoute = z.infer<typeof aiTaskRouteSchema>;

export const aiUsageRecordSchema = z.object({
  id: z.string(),
  taskId: z.enum(aiTaskIds),
  providerId: z.string(),
  connectionId: z.string(),
  modelId: z.string(),
  status: z.enum(["running", "completed", "cancelled", "failed"]),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative().default(0),
  costSource: z.enum(["provider", "estimated", "unknown"]).default("unknown"),
  durationMs: z.number().int().nonnegative().default(0),
  errorCode: z.string().default(""),
  startedAt: timestamp,
  finishedAt: timestamp.nullable().default(null),
});
export type AIUsageRecord = z.infer<typeof aiUsageRecordSchema>;

export const aiUsageSummarySchema = z.object({
  todayCalls: z.number().int().nonnegative(),
  monthCalls: z.number().int().nonnegative(),
  todayCostUsd: z.number().nonnegative(),
  monthCostUsd: z.number().nonnegative(),
  recent: z.array(aiUsageRecordSchema).max(50),
});
export type AIUsageSummary = z.infer<typeof aiUsageSummarySchema>;

export const aiStateSchema = z.object({
  available: z.boolean(),
  credentialManagementReady: z.boolean(),
  connections: z.array(aiConnectionSchema),
  models: z.array(aiModelDescriptorSchema),
  routes: z.array(aiTaskRouteSchema),
  usage: aiUsageSummarySchema,
  privacy: z.object({
    singleTenant: z.literal(true),
    message: z.string(),
  }),
});
export type AIState = z.infer<typeof aiStateSchema>;

export const aiContextPreviewSchema = z.object({
  taskId: z.enum(aiTaskIds),
  fields: z.array(text.min(1).max(80)).max(30),
  includesSensitive: z.boolean().default(false),
  includesPhotos: z.boolean().default(false),
});
export type AIContextPreview = z.infer<typeof aiContextPreviewSchema>;
export const aiBudgetSchema = z.object({
  dailyUsd: z.number().nonnegative().max(10000).default(0),
  monthlyUsd: z.number().nonnegative().max(100000).default(0),
});

export const aiCopywritingRequestSchema = z.object({
  text: text.max(5000),
  scene: text.max(200).default("日常关心"),
  tone: z.enum(["温柔", "简洁", "俏皮", "郑重"]).default("温柔"),
  length: z.enum(["短", "中"]).default("短"),
});
export const aiMapIntentRequestSchema = z.object({
  query: text.min(1).max(500),
  city: text.max(100).default(""),
  longitude: z.number().finite().min(-180).max(180).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
});
export const aiCityGuideRequestSchema = z.object({
  city: text.min(1).max(100),
  interests: z.array(text.max(60)).max(10).default([]),
});
export const aiStoryRequestSchema = z.object({
  mapTitle: text.max(120),
  places: z
    .array(
      z.object({
        name: text.max(200),
        note: text.max(2000).default(""),
        mood: text.max(200).default(""),
        status: z.string().max(40),
        visitedAt: z.string().max(20).default(""),
      }),
    )
    .min(1)
    .max(20),
  tone: z.enum(["温柔", "克制", "纪念"]).default("温柔"),
});

export const aiRunRequestSchema = z.discriminatedUnion("taskId", [
  z.object({
    taskId: z.literal("gift"),
    payload: z.record(z.string(), z.unknown()),
    consent: aiContextPreviewSchema,
    budget: aiBudgetSchema.default({ dailyUsd: 0, monthlyUsd: 0 }),
  }),
  z.object({
    taskId: z.literal("copywriting"),
    payload: aiCopywritingRequestSchema,
    consent: aiContextPreviewSchema,
    budget: aiBudgetSchema.default({ dailyUsd: 0, monthlyUsd: 0 }),
  }),
  z.object({
    taskId: z.literal("map-intent"),
    payload: aiMapIntentRequestSchema,
    consent: aiContextPreviewSchema,
    budget: aiBudgetSchema.default({ dailyUsd: 0, monthlyUsd: 0 }),
  }),
  z.object({
    taskId: z.literal("city-guide"),
    payload: aiCityGuideRequestSchema,
    consent: aiContextPreviewSchema,
    budget: aiBudgetSchema.default({ dailyUsd: 0, monthlyUsd: 0 }),
  }),
  z.object({
    taskId: z.literal("story"),
    payload: aiStoryRequestSchema,
    consent: aiContextPreviewSchema,
    budget: aiBudgetSchema.default({ dailyUsd: 0, monthlyUsd: 0 }),
  }),
]);
export type AIRunRequest = z.infer<typeof aiRunRequestSchema>;

export const aiCopywritingResultSchema = z.object({
  text: text.min(1).max(8000),
});
export const aiMapIntentResultSchema = z.object({
  keyword: text.max(100).default(""),
  category: text.max(100).default(""),
  city: text.max(100).default(""),
  radius: z.number().int().min(100).max(50000).default(3000),
});
export const aiCityGuideResultSchema = z.object({
  title: text.max(120),
  summary: text.max(2000),
  themes: z
    .array(z.object({ name: text.max(80), why: text.max(500) }))
    .min(1)
    .max(6),
  searchSuggestions: z.array(text.max(100)).min(1).max(8),
});
export const aiStoryResultSchema = z.object({
  title: text.max(120),
  narrative: text.max(6000),
  blessing: text.max(1000),
});

export type AIStreamEvent =
  | {
      type: "start";
      runId: string;
      providerId: string;
      connectionId: string;
      modelId: string;
    }
  | { type: "delta"; delta: string }
  | { type: "result"; payload: unknown }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      costSource: "provider" | "estimated" | "unknown";
    }
  | { type: "error"; code: string; message: string }
  | { type: "done"; cancelled?: boolean };

export const aiConnectionInputSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  providerId: z.enum(aiProviderIds),
  label: text.min(1).max(100),
  authType: z.enum(["api-key", "oauth", "local"]),
  baseUrl: z.string().default(""),
  apiKey: text.max(10000).default(""),
  modelIds: z.array(text.min(1).max(200)).max(50).default([]),
});
export type AIConnectionInput = z.infer<typeof aiConnectionInputSchema>;

export const aiTaskRoutesInputSchema = z.object({
  routes: z.array(aiTaskRouteSchema).max(aiTaskIds.length),
});
