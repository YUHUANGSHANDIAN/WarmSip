import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import Dexie from "dexie";
import {
  WarmDatabase,
  saveRecord,
  softDelete,
  restoreRecord,
  permanentlyDelete,
} from "../../src/storage/db";
import {
  exportBackup,
  readBackup,
  importBackup,
  readLegacy,
} from "../../src/storage/backup";
import { sha256 } from "../../src/storage/media";
import {
  newEntity,
  mapSchema,
  placeSchema,
  profileSchema,
  orderSchema,
  snapshot,
} from "../../shared/domain";
let db: WarmDatabase;
beforeEach(() => {
  db = new WarmDatabase(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});
async function fixture() {
  const profile = profileSchema.parse({
    ...newEntity(),
    name: "家人",
    city: "杭州",
  });
  const map = mapSchema.parse({
    ...newEntity(),
    title: "一起探索",
    profileId: profile.id,
  });
  const place = placeSchema.parse({
    ...newEntity(),
    mapId: map.id,
    name: "喜欢的小店",
    note: "私人记录",
    profileId: profile.id,
  });
  await db.profiles.add(profile);
  await db.maps.add(map);
  await db.places.add(place);
  return { profile, map, place };
}
describe("transactional local storage", () => {
  it("migrates a version 1 database in place without losing the profile", async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      profiles: "id,updatedAt",
      maps: "id,updatedAt,lastViewedAt",
      places: "id,mapId,status,updatedAt",
      recommendations: "id,createdAt,profileId",
      orders: "id,updatedAt",
      capsules: "id,openDate",
      media: "id",
      settings: "id",
    });
    await old.open();
    await old.table("profiles").add({
      id: "legacy-profile",
      name: "旧档案",
      city: "杭州",
      relation: "朋友",
      likes: "",
      allergies: "",
      health: "",
      diet: "",
      note: "",
      anniversaries: [],
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    });
    old.close();
    const migrated = new WarmDatabase(name);
    try {
      const profile = await migrated.profiles.get("legacy-profile");
      expect(profile).toMatchObject({
        name: "旧档案",
        archivedAt: null,
        tags: [],
        budgetMin: 0,
      });
    } finally {
      await migrated.delete();
    }
  });
  it("preserves two independent maps through edit, delete and restore", async () => {
    const a = await fixture();
    const b = await fixture();
    await saveRecord(
      "places",
      { ...a.place, status: "visited", visitedAt: "2026-11-03" },
      db,
    );
    await softDelete("maps", a.map.id, db);
    expect((await db.places.get(a.place.id))?.deletedAt).not.toBeNull();
    expect((await db.places.get(b.place.id))?.deletedAt).toBeNull();
    await restoreRecord("maps", a.map.id, db);
    expect(await db.places.get(a.place.id)).toMatchObject({
      status: "visited",
      deletedAt: null,
      visitedAt: "2026-11-03",
    });
  });
  it("does not restore a previously deleted place when restoring its map", async () => {
    const { map, place } = await fixture();
    await softDelete("places", place.id, db);
    await softDelete("maps", map.id, db);
    await restoreRecord("maps", map.id, db);
    expect((await db.places.get(place.id))?.deletedAt).not.toBeNull();
  });
  it("does not destroy order snapshots or profiles with a map", async () => {
    const { map, place, profile } = await fixture();
    const order = orderSchema.parse({
      ...newEntity(),
      title: "小心意",
      placeId: place.id,
      placeSnapshot: snapshot(place),
    });
    await db.orders.add(order);
    await softDelete("maps", map.id, db);
    await permanentlyDelete("maps", map.id, db);
    expect(await db.places.get(place.id)).toBeUndefined();
    expect((await db.orders.get(order.id))?.placeSnapshot?.name).toBe(
      place.name,
    );
    expect(await db.profiles.get(profile.id)).toBeDefined();
  });
  it("reports an actual write failure and retains existing records", async () => {
    const { map } = await fixture();
    db.maps.hook("updating", () => {
      throw new DOMException("disk full", "QuotaExceededError");
    });
    await expect(
      saveRecord("maps", { ...map, title: "不应写入" }, db),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect((await db.maps.get(map.id))?.title).toBe("一起探索");
  });
  it("persists records after closing and reopening the database", async () => {
    const { map } = await fixture();
    db.close();
    await db.open();
    expect((await db.maps.get(map.id))?.title).toBe("一起探索");
  });
});
describe("portable backups", () => {
  it("round trips metadata and real image bytes", async () => {
    const { place } = await fixture();
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEmkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const id = await sha256(bytes);
    await db.media.add({
      id,
      blob: new Blob([bytes], { type: "image/png" }),
      mime: "image/png",
      size: bytes.length,
      createdAt: Date.now(),
      width: 1,
      height: 1,
    });
    await db.places.update(place.id, { photoIds: [id] });
    const archive = await exportBackup(db);
    const bundle = await readBackup(new File([archive], "backup.zip"));
    expect(bundle.media[0].id).toBe(id);
    expect(new Uint8Array(await bundle.media[0].blob.arrayBuffer())).toEqual(
      bytes,
    );
    const target = new WarmDatabase(`restore-${crypto.randomUUID()}`);
    try {
      const result = await importBackup(bundle, target);
      expect(result.imported).toBe(3);
      expect((await target.places.get(place.id))?.photoIds).toEqual([id]);
      expect((await importBackup(bundle, target)).imported).toBe(0);
    } finally {
      await target.delete();
    }
  });
  it("keeps conflicting originals and reconnects imported child records", async () => {
    const { map, place } = await fixture();
    const bundle = await readBackup(
      new File([await exportBackup(db)], "backup.zip"),
    );
    await db.maps.update(map.id, { title: "本机的新名称" });
    const result = await importBackup(bundle, db);
    expect(result.conflicts).toBeGreaterThan(0);
    expect((await db.maps.get(map.id))?.title).toBe("本机的新名称");
    const copy = await db.maps.filter((m) => m.id !== map.id).first();
    expect(copy?.title).toBe("一起探索");
    const children = await db.places.where("mapId").equals(copy!.id).toArray();
    expect(children[0].name).toBe(place.name);
  });
  it("rejects path traversal before importing records", async () => {
    const bytes = zipSync({
      "../escape": strToU8("bad"),
      "manifest.json": strToU8("{}"),
    });
    await expect(
      readBackup(new File([new Uint8Array(bytes)], "bad.zip")),
    ).rejects.toThrow("路径");
    expect(await db.maps.count()).toBe(0);
  });
  it("reconnects both directions when an order conflicts with an otherwise identical place", async () => {
    const { place } = await fixture();
    const order = orderSchema.parse({
      ...newEntity(),
      title: "原心意",
      placeId: place.id,
    });
    await db.orders.add(order);
    await db.places.update(place.id, { orderId: order.id });
    const bundle = await readBackup(
      new File([await exportBackup(db)], "backup.zip"),
    );
    await db.orders.update(order.id, { title: "本机修改" });
    await importBackup(bundle, db);
    const copy = await db.orders.filter((o) => o.id !== order.id).first();
    const copiedPlace = await db.places.get(copy!.placeId);
    expect(copiedPlace!.id).not.toBe(place.id);
    expect(copiedPlace!.orderId).toBe(copy!.id);
    expect((await db.places.get(place.id))!.orderId).toBe(order.id);
  });
  it("skips a second legacy import even when timestamps were absent", async () => {
    const input = {
      lg_warm_profiles_v1: [{ id: "old", name: "妈妈", city: "上海" }],
    };
    expect((await importBackup(readLegacy(input), db)).imported).toBe(1);
    expect((await importBackup(readLegacy(input), db)).duplicates).toBe(1);
    expect(() => readLegacy({ lg_warm_unknown_v1: [] })).toThrow();
  });
  it("fails atomically if a child references a missing map", async () => {
    const { map } = await fixture();
    const bundle = await readBackup(
      new File([await exportBackup(db)], "backup.zip"),
    );
    bundle.records.places[0].mapId = "missing";
    bundle.records.maps[0].title = "新副本";
    const before = await db.maps.count();
    await expect(importBackup(bundle, db)).rejects.toThrow("所属地图");
    expect(await db.maps.count()).toBe(before);
    expect((await db.maps.get(map.id))?.title).toBe("一起探索");
  });
  it("validates legacy data rather than silently dropping corrupted records", () => {
    const legacy = readLegacy({
      lg_warm_profiles_v1: JSON.stringify([
        { id: "old", name: "妈妈", city: "上海", createdAt: 1, updatedAt: 2 },
      ]),
      lg_warm_city_v1: "上海",
    });
    expect(legacy.records.profiles[0].name).toBe("妈妈");
    expect(legacy.settings?.city).toBe("上海");
    expect(() => readLegacy({ lg_warm_profiles_v1: "{broken" })).toThrow();
  });
});
