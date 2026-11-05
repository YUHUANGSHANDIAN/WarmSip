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
