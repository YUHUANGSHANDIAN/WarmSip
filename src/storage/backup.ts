import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import { z } from "zod";
import { type Table } from "dexie";
import {
  db,
  recordSchemas,
  type RecordTable,
  type WarmDatabase,
  currentTimeZone,
} from "./db";
import { sha256 } from "./media";
import { type MediaAsset, settingsSchema } from "../domain";

type Records = Record<RecordTable, Record<string, unknown>[]>;
export interface ImportBundle {
  records: Records;
  media: MediaAsset[];
  settings?: {
    city?: string;
    theme?: "light" | "dark" | "system";
    timeZone?: string;
  };
  legacy: boolean;
}
export const tables = Object.keys(recordSchemas) as RecordTable[];
const emptyRecords = (): Records => ({
  profiles: [],
  maps: [],
  places: [],
  recommendations: [],
  orders: [],
  capsules: [],
});
const metaSchema = z.object({
  format: z.literal("warmsip-backup"),
  version: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.string(),
  records: z.record(z.string(), z.array(z.unknown())),
  settings: z
    .object({
      city: z.string(),
      theme: z.enum(["light", "dark", "system"]),
      timeZone: z.string(),
    })
    .optional(),
  media: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f0-9]{64}$/),
        path: z.string().regex(/^media\/[a-f0-9]{64}\.(jpg|png|webp)$/),
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        sha256: z.string(),
        width: z.number().positive().max(2048),
        height: z.number().positive().max(2048),
        createdAt: z.number(),
      }),
    )
    .max(3000),
});
export async function exportBackup(
  database = db,
  mapId?: string,
): Promise<Blob> {
  const records = emptyRecords();
  let media: MediaAsset[] = [];
  let settings;
  await database.transaction("r", database.tables, async () => {
    for (const key of tables)
      records[key] = await (database[key] as Table).toArray();
    media = await database.media.toArray();
    settings = await database.settings.get("app");
  });
  if (mapId) {
    records.maps = records.maps.filter((x) => x.id === mapId);
    records.places = records.places.filter((x) => x.mapId === mapId);
    const profileIds = new Set(
      [...records.maps, ...records.places].map((x) => x.profileId),
    );
    records.profiles = records.profiles.filter((x) => profileIds.has(x.id));
    records.recommendations = [];
    records.orders = [];
    records.capsules = [];
    records.places = records.places.map((p) => ({ ...p, orderId: "" }));
  }
  const usedMedia = new Set<string>([
    ...records.maps.map((m) => String(m.coverId)),
    ...records.places.flatMap((p) => p.photoIds as string[]),
  ]);
  media = media.filter((m) => usedMedia.has(m.id));
  const files: Record<string, Uint8Array> = {};
  const metadata = [];
  for (const m of media) {
    const data = new Uint8Array(await m.blob.arrayBuffer());
    const ext =
      m.mime === "image/png" ? "png" : m.mime === "image/jpeg" ? "jpg" : "webp";
    const path = `media/${m.id}.${ext}`;
    files[path] = data;
    metadata.push({
      id: m.id,
      path,
      mime: m.mime,
      sha256: await sha256(data),
      width: m.width,
      height: m.height,
      createdAt: m.createdAt,
    });
  }
  const safe = settings ? settingsSchema.parse(settings) : undefined;
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "warmsip-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      records,
      media: metadata,
      settings: safe
        ? { city: safe.city, theme: safe.theme, timeZone: safe.timeZone }
        : undefined,
    }),
  );
  return new Blob([new Uint8Array(zipSync(files, { level: 3 }))], {
    type: "application/zip",
  });
}
export async function readBackup(file: File): Promise<ImportBundle> {
  if (file.size > 60 * 1024 * 1024)
    throw new Error("备份超过 60 MB，请拆分为单张地图导出");
  if (file.name.toLowerCase().endsWith(".json"))
    return readLegacy(JSON.parse(await file.text()));
  let total = 0;
  let count = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      count++;
      total += entry.originalSize;
      if (
        count > 3001 ||
        entry.originalSize > 20 * 1024 * 1024 ||
        total > 200 * 1024 * 1024
      )
        throw new Error("备份解压大小超出限制");
      if (
        entry.name !== "manifest.json" &&
        !/^media\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(entry.name)
      )
        throw new Error("备份含有不允许的文件路径");
      return true;
    },
  });
  if (!files["manifest.json"]) throw new Error("缺少备份清单");
  const meta = metaSchema.parse(JSON.parse(strFromU8(files["manifest.json"])));
  const records = emptyRecords();
  for (const table of tables) {
    records[table] = (meta.records[table] ?? []).map((x) =>
      recordSchemas[table].parse(x),
    );
    const ids = records[table].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      throw new Error("备份包含重复记录 ID");
  }
  const media: MediaAsset[] = [];
  for (const m of meta.media) {
    const data = files[m.path];
    if (!data || (await sha256(data)) !== m.sha256 || m.id !== m.sha256)
      throw new Error("图片完整性校验失败");
    const valid =
      m.mime === "image/png"
        ? data[0] === 137 && data[1] === 80 && data[2] === 78
        : m.mime === "image/jpeg"
          ? data[0] === 255 && data[1] === 216
          : strFromU8(data.slice(0, 4)) === "RIFF" &&
            strFromU8(data.slice(8, 12)) === "WEBP";
    if (!valid) throw new Error("图片格式与备份清单不一致");
    if (
      m.mime === "image/png" &&
      (data.length < 45 ||
        strFromU8(data.slice(12, 16)) !== "IHDR" ||
        new DataView(data.buffer, data.byteOffset).getUint32(16) !== m.width ||
        new DataView(data.buffer, data.byteOffset).getUint32(20) !== m.height)
    )
      throw new Error("图片尺寸与备份清单不一致");
    const blob = new Blob([new Uint8Array(data)], { type: m.mime });
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob).catch(() => {
        throw new Error("备份图片无法解码");
      });
      const matches = bitmap.width === m.width && bitmap.height === m.height;
      bitmap.close();
      if (!matches) throw new Error("图片尺寸与备份清单不一致");
    }
    media.push({
      id: m.id,
      blob,
      mime: m.mime,
      size: data.length,
      width: m.width,
      height: m.height,
      createdAt: m.createdAt,
    });
  }
  return { records, media, settings: meta.settings, legacy: false };
}
function array(value: unknown): Record<string, unknown>[] {
  const v = typeof value === "string" ? JSON.parse(value) : value;
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error("旧备份记录必须是数组");
  return v;
}
export function readLegacy(input: unknown): ImportBundle {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("请选择旧存储键对应的 JSON 对象");
  const raw = input as Record<string, unknown>;
  if (
    ![
      "lg_warm_profiles_v1",
      "lg_warm_recs_v1",
      "lg_warm_orders_v1",
      "lg_warm_capsules_v1",
      "lg_warm_city_v1",
    ].some((k) => k in raw)
  )
    throw new Error("无法识别此 JSON 备份格式");
  const records = emptyRecords();
  const base = (r: Record<string, unknown>) => ({
    createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    deletedAt: null,
    ...r,
  });
  records.profiles = array(raw.lg_warm_profiles_v1).map((r) =>
    recordSchemas.profiles.parse(base(r)),
  );
  records.recommendations = array(raw.lg_warm_recs_v1).map((r) =>
    recordSchemas.recommendations.parse({
      ...base(r),
      source: "legacy",
      budget: typeof r.budget === "number" ? r.budget : 0,
    }),
  );
  records.orders = array(raw.lg_warm_orders_v1).map((r) =>
    recordSchemas.orders.parse({
      ...base(r),
      title: r.title || `给 ${r.profileName || "TA"} 的心意`,
      status: r.status === "delivered" ? "completed" : "pending",
      expectDate:
        typeof r.expectTime === "string" ? r.expectTime.slice(0, 10) : "",
      note: [r.note, r.expectTime ? `原期望时间：${r.expectTime}` : ""]
        .filter(Boolean)
        .join("\n"),
    }),
  );
  records.capsules = array(raw.lg_warm_capsules_v1).map((r) =>
    recordSchemas.capsules.parse({
      ...base(r),
      timeZone: currentTimeZone(),
      openedAt: r.status === "opened" ? r.openedAt || r.createdAt || 1 : null,
    }),
  );
  const city =
    typeof raw.lg_warm_city_v1 === "string" ? raw.lg_warm_city_v1 : "";
  return { records, media: [], legacy: true, settings: { city } };
}
function comparable(value: Record<string, unknown>) {
  const clone = { ...value };
  delete clone.updatedAt;
  delete clone.lastViewedAt;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(clone).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
export async function importBackup(
  bundle: ImportBundle,
  database: WarmDatabase = db,
) {
  const remap = new Map<string, string>();
  const accepted = emptyRecords();
  let duplicates = 0;
  let conflicts = 0;
  await database.transaction("rw", database.tables, async () => {
    // References may form cycles (place <-> order). Allocate all conflicting IDs
    // to a fixed point before deciding which records are duplicates.
    const existing = new Map<string, Record<string, unknown>>();
    for (const table of tables) {
      for (const record of await (database[table] as Table).toArray())
        existing.set(`${table}:${record.id}`, record);
    }
    const references: [string, RecordTable][] = [
      ["profileId", "profiles"],
      ["mapId", "maps"],
      ["placeId", "places"],
      ["orderId", "orders"],
    ];
    const remapped = (original: Record<string, unknown>) => {
      const r = { ...original };
      for (const [field, parent] of references)
        if (r[field]) r[field] = remap.get(`${parent}:${r[field]}`) || r[field];
      return r;
    };
    let changed: boolean;
    do {
      changed = false;
      for (const table of tables) {
        for (const original of bundle.records[table]) {
          const key = `${table}:${original.id}`;
          const old = existing.get(key);
          if (
            old &&
            !remap.has(key) &&
            comparable(old) !== comparable(remapped(original))
          ) {
            remap.set(key, crypto.randomUUID());
            changed = true;
          }
        }
      }
    } while (changed);
    for (const table of tables) {
      for (const original of bundle.records[table]) {
        const r = remapped(original);
        const key = `${table}:${original.id}`;
        if (existing.has(key) && !remap.has(key)) {
          duplicates++;
          continue;
        }
        if (remap.has(key)) {
          r.id = remap.get(key);
          conflicts++;
        }
        accepted[table].push(recordSchemas[table].parse(r));
      }
    }
    const knownMapIds = new Set([
      ...(await database.maps.toCollection().primaryKeys()),
      ...accepted.maps.map((m) => m.id),
    ]);
    const knownMedia = new Set([
      ...(await database.media.toCollection().primaryKeys()),
      ...bundle.media.map((m) => m.id),
    ]);
    for (const p of accepted.places) {
      if (!knownMapIds.has(String(p.mapId)))
        throw new Error("地点缺少所属地图，未导入任何记录");
      for (const id of p.photoIds as string[])
        if (!knownMedia.has(id))
          throw new Error("备份缺少照片，未导入任何记录");
    }
    for (const m of accepted.maps)
      if (m.coverId && !knownMedia.has(String(m.coverId)))
        throw new Error("备份缺少地图封面");
    for (const table of tables)
      await (database[table] as Table).bulkPut(accepted[table]);
    await database.media.bulkPut(bundle.media);
    if (bundle.settings && !(await database.settings.get("app")))
      await database.settings.put(settingsSchema.parse(bundle.settings));
  });
  return {
    imported: tables.reduce((n, k) => n + accepted[k].length, 0),
    duplicates,
    conflicts,
  };
}
