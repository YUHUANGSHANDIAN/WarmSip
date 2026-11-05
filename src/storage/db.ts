import Dexie, { type EntityTable, type Table } from "dexie";
import { z } from "zod";
import {
  profileSchema,
  mapSchema,
  placeSchema,
  recommendationSchema,
  orderSchema,
  capsuleSchema,
  settingsSchema,
  type Profile,
  type MapCollection,
  type PlaceRecord,
  type Recommendation,
  type Order,
  type Capsule,
  type MediaAsset,
  type Settings,
} from "../domain";

export class WarmDatabase extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  maps!: EntityTable<MapCollection, "id">;
  places!: EntityTable<PlaceRecord, "id">;
  recommendations!: EntityTable<Recommendation, "id">;
  orders!: EntityTable<Order, "id">;
  capsules!: EntityTable<Capsule, "id">;
  media!: EntityTable<MediaAsset, "id">;
  settings!: EntityTable<Settings, "id">;
  constructor(name = "warmsip-v1") {
    super(name);
    this.version(1).stores({
      profiles: "id,updatedAt",
      maps: "id,updatedAt,lastViewedAt",
      places: "id,mapId,status,updatedAt",
      recommendations: "id,createdAt,profileId",
      orders: "id,updatedAt",
      capsules: "id,openDate",
      media: "id",
      settings: "id",
    });
    this.version(2)
      .stores({
        profiles: "id,updatedAt,archivedAt",
        maps: "id,updatedAt,lastViewedAt,profileId",
        places: "id,mapId,status,updatedAt,profileId,orderId",
        recommendations: "id,createdAt,profileId,providerId,modelId",
        orders: "id,updatedAt,profileId,status",
        capsules: "id,openDate,mapId,placeId",
        media: "id",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        for (const [name, schema] of Object.entries(recordSchemas))
          await transaction
            .table(name)
            .toCollection()
            .modify((record) => {
              Object.assign(record, schema.parse(record));
            });
        await transaction
          .table("settings")
          .toCollection()
          .modify((record) => {
            Object.assign(record, settingsSchema.parse(record));
          });
      });
  }
}
export const db = new WarmDatabase();
export const recordSchemas = {
  profiles: profileSchema,
  maps: mapSchema,
  places: placeSchema,
  recommendations: recommendationSchema,
  orders: orderSchema,
  capsules: capsuleSchema,
} as const;
export type RecordTable = keyof typeof recordSchemas;
export async function saveRecord<K extends RecordTable>(
  table: K,
  value: z.input<(typeof recordSchemas)[K]>,
  database = db,
) {
  const record = recordSchemas[table].parse({
    ...value,
    updatedAt: Date.now(),
  });
  await database.transaction("rw", database[table], async () => {
    await (database[table] as Table).put(record);
  });
  return record;
}
export async function softDelete(
  table: RecordTable,
  id: string,
  database = db,
) {
  const now = Date.now();
  await database.transaction(
    "rw",
    [database[table], database.places],
    async () => {
      const exists = await (database[table] as Table).get(id);
      if (!exists) throw new Error("记录不存在");
      await (database[table] as Table).update(id, {
        deletedAt: now,
        updatedAt: now,
      });
      if (table === "maps")
        await database.places
          .where("mapId")
          .equals(id)
          .filter((p) => p.deletedAt === null)
          .modify({ deletedAt: now, deletedWithMap: true, updatedAt: now });
    },
  );
}
export async function restoreRecord(
  table: RecordTable,
  id: string,
  database = db,
) {
  await database.transaction(
    "rw",
    [database[table], database.places, database.maps],
    async () => {
      if (table === "places") {
        const p = await database.places.get(id);
        const m = p && (await database.maps.get(p.mapId));
        if (!m || m.deletedAt !== null) throw new Error("请先恢复所属地图");
      }
      await (database[table] as Table).update(id, {
        deletedAt: null,
        updatedAt: Date.now(),
      });
      if (table === "maps")
        await database.places
          .where("mapId")
          .equals(id)
          .filter((p) => p.deletedWithMap)
          .modify({ deletedAt: null, deletedWithMap: false });
    },
  );
}
export async function permanentlyDelete(
  table: RecordTable,
  id: string,
  database = db,
) {
  await database.transaction(
    "rw",
    [database[table], database.places],
    async () => {
      const r = await (database[table] as Table).get(id);
      if (!r?.deletedAt) throw new Error("请先将记录移入回收站");
      if (table === "maps")
        await database.places.where("mapId").equals(id).delete();
      await (database[table] as Table).delete(id);
    },
  );
}
export function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}
export async function getSettings() {
  return settingsSchema.parse(
    (await db.settings.get("app")) ?? { timeZone: currentTimeZone() },
  );
}
export async function saveSettings(settings: Settings) {
  await db.settings.put(settingsSchema.parse(settings));
}
export async function clearPersonalData() {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
export function storageMessage(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message || "数据格式不正确";
  const name = error instanceof Error ? error.name : "";
  if (/Quota|Disk/.test(name))
    return "本地存储空间不足，未保存。请先导出备份，再释放空间。";
  if (/Security|NotAllowed/.test(name))
    return "无法访问本地存储。请检查浏览器或应用的存储权限。";
  return error instanceof Error
    ? error.message
    : "操作失败，原有记录已保留，请重试。";
}
