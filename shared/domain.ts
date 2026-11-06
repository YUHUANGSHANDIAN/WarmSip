import { z } from "zod";

export const VERSION = "0.2.0-beta.2";
const text = z.string().trim();
const timestamp = z.number().int().nonnegative();
export const dateOnly = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "请输入真实有效的日期");
export const optionalDate = z.union([dateOnly, z.literal("")]).default("");
const base = {
  id: z.string().min(1).max(200),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
};
export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  crs: z.enum(["WGS84", "GCJ02"]),
});
export type Coordinate = z.infer<typeof coordinateSchema>;
export const profileSchema = z.object({
  ...base,
  name: text.min(1, "请填写称呼").max(80),
  relation: text.max(80).default("朋友"),
  city: text.max(100).default(""),
  likes: text.max(1000).default(""),
  allergies: text.max(1000).default(""),
  health: text.max(1000).default(""),
  diet: text.max(1000).default(""),
  note: text.max(5000).default(""),
  avatarId: z.string().default(""),
  tags: z.array(text.max(40)).max(20).default([]),
  budgetMin: z.number().finite().min(0).max(1000000).default(0),
  budgetMax: z.number().finite().min(0).max(1000000).default(0),
  archivedAt: timestamp.nullable().default(null),
  anniversaries: z
    .array(z.object({ name: text.min(1).max(100), date: dateOnly }))
    .max(50)
    .default([]),
});
export const mapSchema = z.object({
  ...base,
  title: text.min(1, "请填写地图名称").max(80),
  description: text.max(3000).default(""),
  theme: text.max(80).default("我和 TA"),
  coverId: z.string().default(""),
  profileId: z.string().default(""),
  city: text.max(100).default(""),
  privacy: z.literal("private").default("private"),
  owner: z.literal("local").default("local"),
  schemaVersion: z.literal(1).default(1),
  lastViewedAt: timestamp.default(0),
});
export const placeStatuses = ["want", "visited", "toGift", "gifted"] as const;
export const statusLabels: Record<(typeof placeStatuses)[number], string> = {
  want: "想去",
  visited: "去过",
  toGift: "想送",
  gifted: "已送",
};
export const placeSchema = z.object({
  ...base,
  mapId: z.string().min(1),
  name: text.min(1, "请填写地点名称").max(200),
  address: text.max(500).default(""),
  city: text.max(100).default(""),
  coordinate: coordinateSchema.nullable().default(null),
  provider: z.enum(["manual", "amap"]).default("manual"),
  poiId: z.string().max(200).default(""),
  category: text.max(100).default("其他"),
  status: z.enum(placeStatuses).default("want"),
  tags: z.array(text.max(40)).max(20).default([]),
  note: text.max(10000).default(""),
  mood: text.max(200).default(""),
  photoIds: z.array(z.string()).max(12).default([]),
  visitedAt: optionalDate,
  plannedAt: optionalDate,
  profileId: z.string().default(""),
  orderId: z.string().default(""),
  sortOrder: z.number().finite().default(0),
  favorite: z.boolean().default(false),
  deletedWithMap: z.boolean().default(false),
});
export const giftItemSchema = z.object({
  name: text.min(1).max(200),
  category: text.max(80).default("饮品"),
  price: text.max(100).default(""),
  store: text.max(200).default(""),
  reason: text.max(2000).default(""),
});
export const recommendationResultSchema = z.object({
  summary: text.max(2000),
  items: z.array(giftItemSchema).min(1).max(6),
  healthTips: z.array(text.max(1000)).max(10),
  blessing: text.max(1000),
});
export const recommendationSchema = z.object({
  ...base,
  profileId: z.string().default(""),
  profileName: text.default("TA"),
  city: text.default(""),
  scene: text.default("日常关心"),
  budget: z.number().finite().min(0).max(100000).default(50),
  kind: z.enum(["normal", "box"]).default("normal"),
  source: z.enum(["local", "ai", "legacy"]).default("local"),
  taskId: z.string().default("gift"),
  providerId: z.string().default(""),
  modelId: z.string().default(""),
  modelVersion: z.string().default(""),
  promptVersion: z.string().default(""),
  generatedAt: timestamp.default(0),
  result: recommendationResultSchema,
});
export const placeSnapshotSchema = z.object({
  name: text,
  address: text,
  city: text,
  coordinate: coordinateSchema.nullable(),
});
export const orderSchema = z.object({
  ...base,
  title: text.min(1).max(200),
  profileId: z.string().default(""),
  profileName: text.default("TA"),
  items: z.array(giftItemSchema).max(20).default([]),
  budget: z.number().finite().min(0).max(1000000).default(0),
  expectDate: optionalDate,
  status: z
    .enum([
      "draft",
      "planned",
      "pending",
      "preparing",
      "ready",
      "gifted",
      "completed",
    ])
    .default("planned"),
  source: z
    .enum(["manual", "gift", "map", "capsule", "legacy"])
    .default("manual"),
  reminderAt: z.string().default(""),
  recommendationId: z.string().default(""),
  capsuleId: z.string().default(""),
  note: text.max(10000).default(""),
  blessing: text.max(2000).default(""),
  placeId: z.string().default(""),
  placeSnapshot: placeSnapshotSchema.nullable().default(null),
});
export const orderStatusLabels: Record<
  z.infer<typeof orderSchema>["status"],
  string
> = {
  draft: "草稿",
  planned: "待准备",
  pending: "待准备",
  preparing: "准备中",
  ready: "已准备",
  gifted: "已送出",
  completed: "已完成",
};
export const capsuleSchema = z.object({
  ...base,
  title: text.min(1).max(200),
  content: text.min(1).max(20000),
  blessing: text.max(2000).default(""),
  openDate: dateOnly,
  timeZone: z.string().refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }, "时区无效"),
  openedAt: timestamp.nullable().default(null),
  mapId: z.string().default(""),
  placeId: z.string().default(""),
  placeSnapshot: placeSnapshotSchema.nullable().default(null),
  photoIds: z.array(z.string()).max(4).default([]),
});
export const settingsSchema = z.object({
  id: z.literal("app").default("app"),
  city: text.max(100).default(""),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  serviceUrl: z.string().default(""),
  timeZone: z.string().default("Asia/Shanghai"),
  language: z.enum(["zh-CN"]).default("zh-CN"),
  reduceMotion: z.boolean().default(false),
  aiEnabled: z.boolean().default(false),
  aiSendLikes: z.boolean().default(false),
  aiSendSensitive: z.boolean().default(false),
  aiSendPhotos: z.boolean().default(false),
  aiBudgetDailyUsd: z.number().finite().min(0).max(10000).default(0),
  aiBudgetMonthlyUsd: z.number().finite().min(0).max(100000).default(0),
});
export type Profile = z.infer<typeof profileSchema>;
export type MapCollection = z.infer<typeof mapSchema>;
export type PlaceRecord = z.infer<typeof placeSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type GiftResult = z.infer<typeof recommendationResultSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Capsule = z.infer<typeof capsuleSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type PlaceSnapshot = z.infer<typeof placeSnapshotSchema>;
export interface MediaAsset {
  id: string;
  blob: Blob;
  mime: string;
  size: number;
  createdAt: number;
  width: number;
  height: number;
}
export interface LocationContext {
  kind: "manual-city" | "recipient-city" | "device" | "viewport";
  city: string;
  coordinate: Coordinate | null;
}
export const recommendationRequestSchema = z.object({
  relation: text.max(80).default("朋友"),
  likes: text.max(1000).default(""),
  allergies: text.max(1000).default(""),
  diet: text.max(1000).default(""),
  city: text.max(100).default(""),
  scene: text.max(200),
  budget: z.number().finite().min(0).max(100000),
  kind: z.enum(["normal", "box"]).default("normal"),
});
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export const poiSchema = z.object({
  id: z.string(),
  provider: z.literal("amap"),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  category: z.string(),
  coordinate: coordinateSchema,
  source: z.literal("高德地图"),
});
export type Poi = z.infer<typeof poiSchema>;
export const weatherSchema = z.object({
  city: z.string(),
  condition: z.string(),
  temperature: z.string(),
  reportedAt: z.string(),
  source: z.literal("高德地图"),
});
export type Weather = z.infer<typeof weatherSchema>;
export interface Capabilities {
  ai: boolean;
  places: boolean;
  weather: boolean;
  map: boolean;
  mapJsKey: string;
  mapProxyUrl: string;
}
export function newEntity() {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
export function snapshot(place: PlaceRecord | Poi): PlaceSnapshot {
  return {
    name: place.name,
    address: place.address,
    city: place.city,
    coordinate: place.coordinate,
  };
}
