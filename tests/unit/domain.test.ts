import { describe, it, expect, vi } from "vitest";
import {
  coordinateSchema,
  profileSchema,
  dateOnly,
  newEntity,
  mapSchema,
  placeSchema,
} from "../../shared/domain";
import { canOpen, capsuleOpenInstant } from "../../src/services/time";
import { resolveLocation, localInspiration } from "../../src/services/context";
import { mapSummary, privateShareDefaults } from "../../src/services/sharing";
import {
  LatestRequest,
  probeService,
  ServiceError,
  validateServiceUrl,
} from "../../src/services/api";

describe("dates, geography and privacy", () => {
  it("rejects impossible calendar dates and invalid coordinates", () => {
    expect(dateOnly.safeParse("2026-02-29").success).toBe(false);
    expect(dateOnly.parse("2028-02-29")).toBe("2028-02-29");
    expect(
      coordinateSchema.safeParse({ latitude: 91, longitude: 1, crs: "WGS84" })
        .success,
    ).toBe(false);
    expect(
      coordinateSchema.safeParse({ latitude: 0, longitude: 0, crs: "unknown" })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...newEntity(), name: "   " }).success,
    ).toBe(false);
  });
  it("opens on the selected timezone midnight, including year boundaries", () => {
    const capsule = { openDate: "2027-01-01", timeZone: "Asia/Shanghai" };
    const start = Date.parse("2026-12-31T16:00:00Z");
    expect(canOpen(capsule, start - 1)).toBe(false);
    expect(canOpen(capsule, start)).toBe(true);
  });
  it("uses actual local midnight across daylight-saving changes", () => {
    expect(capsuleOpenInstant("2026-03-08", "America/New_York")).toBe(
      Date.parse("2026-03-08T05:00:00Z"),
    );
    expect(capsuleOpenInstant("2026-03-09", "America/New_York")).toBe(
      Date.parse("2026-03-09T04:00:00Z"),
    );
    expect(capsuleOpenInstant("2026-11-02", "America/New_York")).toBe(
      Date.parse("2026-11-02T05:00:00Z"),
    );
  });
  it("does not overwrite the recipient city with device location", () => {
    const device = {
      city: "北京",
      coordinate: { latitude: 39.9, longitude: 116.4, crs: "WGS84" as const },
    };
    expect(resolveLocation("", { city: "杭州" }, device)).toMatchObject({
      city: "杭州",
      kind: "recipient-city",
      coordinate: null,
    });
    expect(resolveLocation("成都", { city: "杭州" }, device)).toMatchObject({
      city: "成都",
      kind: "manual-city",
    });
  });
  it("excludes exact locations, private notes, description and recipient from default sharing", () => {
    const map = mapSchema.parse({
      ...newEntity(),
      title: "我们的暖迹",
      description: "私密地图介绍",
    });
    const place = placeSchema.parse({
      ...newEntity(),
      mapId: map.id,
      name: "街角咖啡",
      city: "杭州",
      address: "精确门牌地址",
      note: "秘密备注",
      coordinate: { latitude: 30.123456, longitude: 120.234567, crs: "GCJ02" },
    });
    const summary = mapSummary(map, [place], privateShareDefaults, "私人称呼");
    for (const secret of [
      "精确门牌",
      "秘密备注",
      "30.123456",
      "私人称呼",
      "私密地图介绍",
    ])
      expect(summary).not.toContain(secret);
    expect(
      mapSummary(
        map,
        [place],
        { ...privateShareDefaults, notes: true, coordinates: true },
        "",
      ),
    ).toContain("30.123456");
  });
  it("offers non-food local suggestions for explicit dietary constraints", () => {
    const result = localInspiration({
      relation: "家人",
      likes: "奶茶",
      allergies: "牛奶",
      diet: "",
      city: "天津",
      scene: "生日",
      budget: 30,
      kind: "normal",
    });
    expect(result.items.every((i) => i.category !== "饮品")).toBe(true);
    expect(result.healthTips.join("")).toContain("不是实时 AI");
  });
  it("rejects credentials in a service URL and insecure remote endpoints", () => {
    for (const url of [
      "http://example.com",
      "https://secret@example.com",
      "https://example.com?key=secret",
      "javascript:alert(1)",
    ])
      expect(() => validateServiceUrl(url)).toThrow();
    expect(validateServiceUrl("http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787",
    );
  });
});
describe("request cancellation", () => {
  it("aborts a superseded request and rejects its late result", async () => {
    const latest = new LatestRequest();
    let oldSignal: AbortSignal | undefined;
    let resolveOld!: (v: string) => void;
    const first = latest.run((signal) => {
      oldSignal = signal;
      return new Promise<string>((resolve) => {
        resolveOld = resolve;
      });
    });
    const rejection = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(await latest.run(async () => "new")).toBe("new");
    expect(oldSignal?.aborted).toBe(true);
    resolveOld("old");
    await rejection;
  });
  it("cancels immediately even when the upstream ignores abort and never finishes", async () => {
    const latest = new LatestRequest();
    let finish!: (v: string) => void;
    const pending = latest.run(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    latest.cancel();
    await rejection;
    expect(await latest.run(async () => "retry")).toBe("retry");
    finish("ignored");
  });
});
describe("Render Free connection wake-up", () => {
  it("probes the public health endpoint before checking authenticated capabilities", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, version: "0.2.0-beta.4" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await probeService("https://warmsip-api.onrender.com");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://warmsip-api.onrender.com/healthz",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports a waking free instance instead of treating 503 as a valid connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    try {
      await expect(
        probeService("https://warmsip-api.onrender.com"),
      ).rejects.toMatchObject({
        name: "ServiceError",
        code: "HEALTH_503",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("turns a cold-start timeout into an actionable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      ),
    );
    try {
      await expect(
        probeService("https://warmsip-api.onrender.com", undefined, 5),
      ).rejects.toBeInstanceOf(ServiceError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
