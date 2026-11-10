import { describe, it, expect, vi } from "vitest";
import { createServer, type ServerConfig } from "../../server/app";
const config: ServerConfig = {
  host: "127.0.0.1",
  token: "test-access-token-1234567890",
  origins: ["http://localhost:1420"],
  amapKey: "",
  amapJsKey: "",
  amapSecurityCode: "",
  aiBase: "",
  aiKey: "",
  aiModel: "",
};
const headers = {
  authorization: `Bearer ${config.token}`,
  origin: "http://localhost:1420",
};
describe("service authorization and upstream boundaries", () => {
  it("exposes only health without authentication and protects AI state", async () => {
    const app = createServer(config);
    try {
      expect((await app.inject("/healthz")).statusCode).toBe(200);
      expect((await app.inject("/api/v1/ai/state")).statusCode).toBe(401);
      const state = await app.inject({
        url: "/api/v1/ai/state",
        headers,
      });
      expect(state.statusCode).toBe(200);
      expect(state.json()).toMatchObject({
        credentialManagementReady: false,
        connections: [],
      });
    } finally {
      await app.close();
    }
  });
  it("treats malformed upstream coordinates as an upstream failure", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        status: "1",
        pois: [{ id: "B1", name: "bad", location: "nan,999" }],
      }),
    );
    const app = createServer({ ...config, amapKey: "secret" }, fetcher);
    try {
      const response = await app.inject({
        url: "/api/v1/places/search?city=杭州",
        headers,
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().code).toBe("INVALID_RESPONSE");
    } finally {
      await app.close();
    }
  });
  it("handles a non-ASCII unauthorized token without leaking or throwing", async () => {
    const app = createServer(config);
    try {
      const response = await app.inject({
        url: "/api/v1/capabilities",
        headers: { authorization: "中".repeat(33) },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("enforces the upstream byte limit before buffering an entire response", async () => {
    const app = createServer(
      { ...config, amapKey: "secret" },
      vi.fn(async () => new Response("x".repeat(2_000_001))),
    );
    try {
      const response = await app.inject({
        url: "/api/v1/places/search?city=杭州",
        headers,
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().code).toBe("INVALID_RESPONSE");
    } finally {
      await app.close();
    }
  });
  it("refuses network binding without an access token", () => {
    expect(() =>
      createServer({ ...config, host: "0.0.0.0", token: "" }),
    ).toThrow("访问令牌");
  });
  it("rejects unauthorized requests and disallowed origins", async () => {
    const app = createServer(config);
    try {
      expect((await app.inject("/api/v1/capabilities")).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            url: "/api/v1/capabilities",
            headers: { ...headers, origin: "https://untrusted.example" },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
  it("allows the CORS methods used by AI connection management", async () => {
    const app = createServer(config);
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/ai/task-routes",
        headers: {
          origin: "http://localhost:1420",
          "access-control-request-method": "PUT",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-methods"]).toContain("PUT");
      expect(response.headers["access-control-allow-methods"]).toContain(
        "DELETE",
      );
    } finally {
      await app.close();
    }
  });
  it("reports missing services honestly and does not return mock data", async () => {
    const upstream = vi.fn();
    const app = createServer(config, upstream);
    try {
      const c = await app.inject({ url: "/api/v1/capabilities", headers });
      expect(c.json()).toMatchObject({
        ai: false,
        places: false,
        weather: false,
        map: false,
      });
      const response = await app.inject({
        url: "/api/v1/places/search?city=天津",
        headers,
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe("NOT_CONFIGURED");
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("validates the current DeepSeek model names and reports configured capabilities", async () => {
    expect(() =>
      createServer({
        ...config,
        aiBase: "https://api.deepseek.com",
        aiKey: "server-only-key",
        aiModel: "deepseek-chat",
      }),
    ).toThrow("旧模型名已停用");
    const app = createServer({
      ...config,
      aiBase: "https://api.deepseek.com",
      aiKey: "server-only-key",
      aiModel: "deepseek-flash",
    });
    try {
      const response = await app.inject({
        url: "/api/v1/capabilities",
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ai: true,
        details: {
          ai: {
            configured: true,
            source: "DeepSeek · 服务端环境",
          },
        },
      });
      expect(response.body).not.toContain("server-only-key");
      expect(response.body).not.toContain("sk-");
    } finally {
      await app.close();
    }
  });
  it("rejects coordinates outside their valid range", async () => {
    const app = createServer(config);
    try {
      const r = await app.inject({
        url: "/api/v1/places/search?longitude=200&latitude=39",
        headers,
      });
      expect(r.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
  it("normalizes real provider results without fabricating commercial fields", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "1",
            pois: [
              {
                id: "B123",
                name: "测试适配器地点",
                address: "测试地址",
                cityname: "天津",
                location: "117.2,39.1",
                type: "餐饮;咖啡馆",
              },
            ],
          }),
        ),
    );
    const app = createServer({ ...config, amapKey: "server-secret" }, upstream);
    try {
      const response = await app.inject({
        url: "/api/v1/places/search?city=天津&keyword=咖啡",
        headers,
      });
      expect(response.statusCode).toBe(200);
      const p = response.json()[0];
      expect(p.coordinate.crs).toBe("GCJ02");
      expect(p).not.toHaveProperty("rating");
      expect(p).not.toHaveProperty("price");
      expect(response.body).not.toContain("server-secret");
    } finally {
      await app.close();
    }
  });

  it("uses AMap POI 2.0 paths and reports provider infocodes safely", async () => {
    const invalid = vi.fn(
      async (_input: URL | Request | string) =>
        new Response(
          JSON.stringify({
            status: "0",
            info: "INVALID_USER_KEY",
            infocode: "10001",
          }),
        ),
    );
    const app = createServer(
      { ...config, amapKey: "server-secret" },
      invalid,
    );
    try {
      const response = await app.inject({
        url: "/api/v1/places/search?city=北京&keyword=咖啡",
        headers,
      });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        code: "AMAP_INVALID_KEY",
      });
      expect(String(invalid.mock.calls[0][0])).toContain("/v5/place/text");
      expect(response.body).not.toContain("server-secret");
    } finally {
      await app.close();
    }
  });

  it("returns weather provenance and serves a short-lived cache", async () => {
    const upstream = vi.fn(async (input: URL | Request | string) => {
      const url = String(input);
      if (url.includes("/geocode/geo"))
        return Response.json({
          status: "1",
          infocode: "10000",
          geocodes: [{ adcode: "110000" }],
        });
      return Response.json({
        status: "1",
        infocode: "10000",
        lives: [
          {
            city: "北京市",
            weather: "晴",
            temperature: "18",
            reporttime: "2026-11-07 10:00:00",
          },
        ],
      });
    });
    const app = createServer(
      { ...config, amapKey: "server-secret" },
      upstream,
    );
    try {
      const first = await app.inject({
        url: "/api/v1/weather?city=北京",
        headers,
      });
      const second = await app.inject({
        url: "/api/v1/weather?city=北京",
        headers,
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        adcode: "110000",
        city: "北京市",
        cacheStatus: "fresh",
        source: "高德地图",
      });
      expect(first.json().fetchedAt).toEqual(expect.any(Number));
      expect(second.json()).toMatchObject({ cacheStatus: "cached" });
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
  it("does not expose provider credentials in failure responses", async () => {
    const upstream = vi.fn(async () => {
      throw new Error("secret-amap-key should never leak");
    });
    const app = createServer(
      { ...config, amapKey: "secret-amap-key" },
      upstream,
    );
    try {
      const r = await app.inject({ url: "/api/v1/weather?city=天津", headers });
      expect(r.statusCode).toBe(502);
      expect(r.body).not.toContain("secret-amap-key");
    } finally {
      await app.close();
    }
  });
  it("rejects arbitrary map proxy paths and unsigned sessions", async () => {
    const app = createServer({
      ...config,
      amapJsKey: "public",
      amapSecurityCode: "private",
    });
    try {
      const r = await app.inject({
        url: "/api/v1/map-proxy/9999999999999.bad/v3/test",
        headers,
      });
      expect(r.statusCode).toBe(401);
      expect(r.body).not.toContain("private");
    } finally {
      await app.close();
    }
  });
});
