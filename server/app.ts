import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import {
  recommendationRequestSchema,
  recommendationResultSchema,
  poiSchema,
  type Poi,
} from "../shared/domain.js";
import { VERSION } from "../shared/domain.js";
import { aiConnectionInputSchema } from "../shared/ai.js";
import { AIService } from "./ai/service.js";
import { AIStoreError } from "./ai/store.js";

export interface ServerConfig {
  host: string;
  token: string;
  origins: string[];
  amapKey: string;
  amapJsKey: string;
  amapSecurityCode: string;
  aiBase: string;
  aiKey: string;
  aiModel: string;
  aiDataFile?: string;
  aiEncryptionKey?: string;
  allowLocalAIEndpoints?: boolean;
  allowedLocalAIEndpoints?: string[];
}

const deepseekModels = new Set(["deepseek-flash", "deepseek-v4-pro"]);
export function configFromEnv(): ServerConfig {
  const aiKey = (process.env.AI_API_KEY || "").trim();
  const aiBase = (
    process.env.AI_BASE_URL ||
    (aiKey ? "https://api.deepseek.com" : "")
  )
    .trim()
    .replace(/\/$/, "");
  const aiModel =
    (process.env.AI_MODEL || "").trim() ||
    (aiKey ? "deepseek-flash" : "");
  return {
    host: process.env.HOST || "127.0.0.1",
    token: process.env.SERVICE_ACCESS_TOKEN || "",
    origins: (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost,https://localhost"
    )
      .split(",")
      .map((x) => x.trim()),
    amapKey: process.env.AMAP_WEB_SERVICE_KEY || "",
    amapJsKey: process.env.AMAP_JS_KEY || "",
    amapSecurityCode: process.env.AMAP_SECURITY_CODE || "",
    aiBase,
    aiKey,
    aiModel,
    aiDataFile:
      process.env.AI_DATA_FILE ||
      resolve(process.env.AI_DATA_DIR || "data", "ai-store.json"),
    aiEncryptionKey: process.env.AI_CREDENTIAL_ENCRYPTION_KEY || "",
    allowLocalAIEndpoints: process.env.ALLOW_LOCAL_AI_ENDPOINTS === "true",
    allowedLocalAIEndpoints: (process.env.AI_ALLOWED_LOCAL_ENDPOINTS || "")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  };
}
const same = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
function providerData<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new UpstreamError("INVALID_RESPONSE", 502, "上游响应格式不正确");
  return result.data;
}
const poiRaw = z
  .object({
    id: z.string(),
    name: z.string(),
    address: z.union([z.string(), z.array(z.unknown())]).optional(),
    cityname: z.union([z.string(), z.array(z.unknown())]).optional(),
    type: z.string().optional(),
    location: z.string(),
  })
  .passthrough();
function normalizePoi(raw: unknown): Poi {
  const p = providerData(poiRaw, raw);
  if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(p.location))
    throw new UpstreamError("INVALID_RESPONSE", 502, "地点坐标格式无效");
  const [longitude, latitude] = p.location.split(",").map(Number);
  return providerData(poiSchema, {
    id: p.id,
    provider: "amap",
    name: p.name,
    address: typeof p.address === "string" ? p.address : "",
    city: typeof p.cityname === "string" ? p.cityname : "",
    category: p.type?.split(";").pop() || "地点",
    coordinate: { latitude, longitude, crs: "GCJ02" },
    source: "高德地图",
  });
}
class UpstreamError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public providerCode = "",
  ) {
    super(message);
  }
}
async function readLimited(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new UpstreamError("INVALID_RESPONSE", 502, "上游响应为空");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new UpstreamError("INVALID_RESPONSE", 502, "上游响应超出限制");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
export function createServer(
  config: ServerConfig,
  fetcher: typeof fetch = fetch,
) {
  if (
    !["127.0.0.1", "localhost", "::1"].includes(config.host) &&
    config.token.length < 24
  )
    throw new Error("监听网络接口时必须配置至少 24 字符的访问令牌");
  if (config.aiBase && new URL(config.aiBase).protocol !== "https:")
    throw new Error("AI 上游必须使用 HTTPS");
  const aiConfigured = [config.aiBase, config.aiKey, config.aiModel].filter(
    Boolean,
  ).length;
  if (aiConfigured !== 0 && aiConfigured !== 3)
    throw new Error(
      "AI_BASE_URL、AI_MODEL、AI_API_KEY 必须同时配置或同时留空",
    );
  if (config.aiBase) {
    if (config.aiBase !== "https://api.deepseek.com")
      throw new Error("当前静态 AI 配置仅支持 https://api.deepseek.com");
    if (!deepseekModels.has(config.aiModel))
      throw new Error(
        "AI_MODEL 必须为 deepseek-flash 或 deepseek-v4-pro；旧模型名已停用",
      );
  }
  if (config.aiEncryptionKey && !config.token)
    throw new Error("启用 AI 凭证管理时必须配置服务访问令牌");
  const app = Fastify({ logger: false, bodyLimit: 32768, trustProxy: false });
  const ai = new AIService({
    dataFile:
      config.aiDataFile || resolve(process.cwd(), "data", "ai-store.json"),
    encryptionSecret: config.aiEncryptionKey || "",
    allowLocalEndpoints: Boolean(config.allowLocalAIEndpoints),
    allowedLocalEndpoints: config.allowedLocalAIEndpoints || [],
    staticConnection: config.aiBase
      ? {
          apiKey: config.aiKey,
          baseUrl: config.aiBase,
          modelId: config.aiModel,
        }
      : undefined,
  });
  const providerStatus = {
    ai: {
      configured: Boolean(config.aiBase),
      source: config.aiBase ? "DeepSeek · 服务端环境" : "",
      lastSuccessAt: null as number | null,
      lastCheckedAt: null as number | null,
      lastErrorCode: "",
    },
    places: {
      configured: Boolean(config.amapKey),
      source: config.amapKey ? "高德 Web 服务" : "",
      lastSuccessAt: null as number | null,
      lastCheckedAt: null as number | null,
      lastErrorCode: "",
    },
    weather: {
      configured: Boolean(config.amapKey),
      source: config.amapKey ? "高德天气" : "",
      lastSuccessAt: null as number | null,
      lastCheckedAt: null as number | null,
      lastErrorCode: "",
    },
    map: {
      configured: Boolean(config.amapJsKey && config.amapSecurityCode),
      source:
        config.amapJsKey && config.amapSecurityCode
          ? "高德 JS API"
          : "",
      lastSuccessAt: null as number | null,
      lastCheckedAt: null as number | null,
      lastErrorCode: "",
    },
  };
  const weatherCache = new Map<
    string,
    {
      data: {
        city: string;
        adcode: string;
        condition: string;
        temperature: string;
        reportedAt: string;
        fetchedAt: number;
        cacheStatus: "fresh" | "cached" | "stale";
        source: "高德地图";
      };
      expiresAt: number;
      staleUntil: number;
    }
  >();
  let activeAIStreams = 0;
  const markProviderSuccess = (
    service: keyof typeof providerStatus,
    checkedAt = Date.now(),
  ) => {
    providerStatus[service].lastCheckedAt = checkedAt;
    providerStatus[service].lastSuccessAt = checkedAt;
    providerStatus[service].lastErrorCode = "";
  };
  const markProviderFailure = (
    service: keyof typeof providerStatus,
    code: string,
  ) => {
    providerStatus[service].lastCheckedAt = Date.now();
    providerStatus[service].lastErrorCode = code.slice(0, 80);
  };
  const ticketSecret =
    config.token || config.amapSecurityCode || "local-unconfigured";
  const sign = (expires: string) =>
    createHmac("sha256", ticketSecret).update(`map:${expires}`).digest("hex");
  app.register(cors, {
    origin: (origin, done) =>
      done(null, !origin || config.origins.includes(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;
    if (req.url === "/healthz") return;
    const origin = req.headers.origin;
    if (origin && !config.origins.includes(origin))
      return reply
        .code(403)
        .send({ code: "ORIGIN_DENIED", message: "此来源未获授权" });
    if (req.url.startsWith("/api/v1/map-proxy/")) return;
    if (
      config.token &&
      !same(req.headers.authorization || "", `Bearer ${config.token}`)
    )
      return reply
        .code(401)
        .send({ code: "UNAUTHORIZED", message: "请配置有效的服务访问令牌" });
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ code: "INVALID_INPUT", message: "请求数据格式不正确" });
    if (error instanceof UpstreamError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429)
      return reply
        .code(429)
        .send({ code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" });
    if (status && status >= 400 && status < 500)
      return reply
        .code(status)
        .send({ code: "INVALID_REQUEST", message: "请求无效或超过大小限制" });
    return reply.code(502).send({
      code: "UPSTREAM_UNAVAILABLE",
      message: "上游服务暂不可用，请稍后重试",
    });
  });
  app.get("/healthz", async () => ({
    ok: true,
    version: VERSION,
    timestamp: new Date().toISOString(),
  }));
  const upstream = async (
    url: URL | string,
    signal: AbortSignal,
    init: RequestInit = {},
  ) => {
    const response = await fetcher(url, { ...init, signal });
    if (!response.ok)
      throw new UpstreamError(
        response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
        response.status === 429 ? 429 : 502,
        "上游服务暂不可用",
      );
    const bytes = await readLimited(response, 2_000_000);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new UpstreamError("INVALID_RESPONSE", 502, "上游响应不是有效 JSON");
    }
  };
  const amap = async (
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
    service: "places" | "weather" = "places",
  ) => {
    if (!config.amapKey)
      throw new UpstreamError("NOT_CONFIGURED", 503, "地点与天气服务尚未配置");
    const url = new URL(`https://restapi.amap.com${path}`);
    url.search = new URLSearchParams({
      ...params,
      key: config.amapKey,
    }).toString();
    try {
      const data = await upstream(url, signal);
      if (data.status !== "1") {
        const infocode =
          typeof data.infocode === "string" ? data.infocode : "UNKNOWN";
        const code =
          infocode === "10001" || infocode === "10009"
            ? "AMAP_INVALID_KEY"
            : infocode === "10003"
              ? "AMAP_QUOTA_EXCEEDED"
              : infocode === "10021"
                ? "AMAP_RATE_LIMITED"
                : "AMAP_PROVIDER_ERROR";
        markProviderFailure(service, code);
        throw new UpstreamError(
          code,
          infocode === "10021" ? 429 : 502,
          "高德服务返回错误，请检查 Key 权限、配额或请求条件",
          infocode,
        );
      }
      markProviderSuccess(service);
      return data;
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      markProviderFailure(service, "AMAP_NETWORK_ERROR");
      throw new UpstreamError(
        "AMAP_UNAVAILABLE",
        502,
        "高德服务暂不可用，请稍后重试",
      );
    }
  };
  const bounded =
    (handler: (req: FastifyRequest, signal: AbortSignal) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const abort = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      req.raw.once("aborted", abort);
      reply.raw.once("close", abort);
      try {
        return await handler(req, controller.signal);
      } finally {
        clearTimeout(timer);
        req.raw.off("aborted", abort);
        reply.raw.off("close", abort);
      }
    };
  app.get("/api/v1/capabilities", async () => {
    const expires = String(Date.now() + 2 * 60 * 60 * 1000);
    const map = Boolean(config.amapJsKey && config.amapSecurityCode);
    const aiState = await ai.state();
    const staticAI = aiState.connections.find(
      (connection) => connection.origin === "environment",
    );
    return {
      ai: aiState.available,
      places: Boolean(config.amapKey),
      weather: Boolean(config.amapKey),
      map,
      mapJsKey: map ? config.amapJsKey : "",
      mapProxyUrl: map ? `/api/v1/map-proxy/${expires}.${sign(expires)}` : "",
      details: {
        ai: {
          ...providerStatus.ai,
          configured: Boolean(staticAI),
          source: staticAI?.label || providerStatus.ai.source,
          lastSuccessAt:
            staticAI?.status === "connected"
              ? staticAI.lastCheckedAt
              : providerStatus.ai.lastSuccessAt,
          lastCheckedAt: staticAI?.lastCheckedAt || providerStatus.ai.lastCheckedAt,
          lastErrorCode: staticAI?.lastError || providerStatus.ai.lastErrorCode,
        },
        places: providerStatus.places,
        weather: providerStatus.weather,
        map: providerStatus.map,
      },
    };
  });
  app.get("/api/v1/ai/state", bounded(async () => ai.state()));
  app.post(
    "/api/v1/ai/connections",
    bounded(async (req) => {
      const input = aiConnectionInputSchema.parse(req.body);
      const connection = await ai.saveConnection(input);
      return { connection };
    }),
  );
  app.post(
    "/api/v1/ai/connections/:id/test",
    bounded(async (req) => {
      const { id } = z.object({ id: z.string().min(1).max(120) }).parse(req.params);
      return ai.testConnection(id);
    }),
  );
  app.post(
    "/api/v1/ai/connections/:id/refresh-models",
    bounded(async (req) => {
      const { id } = z.object({ id: z.string().min(1).max(120) }).parse(req.params);
      return ai.refreshModels(id);
    }),
  );
  app.delete(
    "/api/v1/ai/connections/:id",
    bounded(async (req) => {
      const { id } = z.object({ id: z.string().min(1).max(120) }).parse(req.params);
      await ai.removeConnection(id);
      return { removed: true };
    }),
  );
  app.put(
    "/api/v1/ai/task-routes",
    bounded(async (req) => ({ routes: await ai.setRoutes(req.body) })),
  );
  app.delete(
    "/api/v1/ai/usage",
    bounded(async () => {
      await ai.clearUsage();
      return { cleared: true };
    }),
  );
  app.delete(
    "/api/v1/ai/state",
    bounded(async () => {
      await ai.clearAll();
      return { cleared: true };
    }),
  );
  app.post(
    "/api/v1/ai/oauth/openrouter/start",
    bounded(async () => ai.startOpenRouterOAuth()),
  );
  app.get(
    "/api/v1/ai/oauth/:flowId",
    bounded(async (req) => {
      const { flowId } = z
        .object({ flowId: z.string().uuid() })
        .parse(req.params);
      return ai.openRouterOAuthStatus(flowId);
    }),
  );
  app.post(
    "/api/v1/ai/stream",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
    if (activeAIStreams >= 2)
      return reply.code(429).send({
        code: "AI_CONCURRENCY_LIMITED",
        message: "同时最多进行两个 AI 请求，请等待当前生成完成",
      });
    activeAIStreams++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const abort = () => controller.abort();
    req.raw.once("aborted", abort);
    reply.raw.once("close", abort);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.hijack();
    const send = (event: unknown) =>
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    let failed = false;
    try {
      for await (const event of ai.stream(req.body, controller.signal)) {
        if (reply.raw.destroyed) {
          controller.abort();
          break;
        }
        if (event.type === "error" && event.code !== "CANCELLED") {
          failed = true;
          markProviderFailure("ai", event.code);
        }
        send(event);
      }
      if (!failed && !controller.signal.aborted) markProviderSuccess("ai");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI 服务暂不可用";
      send({
        type: "error",
        code:
          error instanceof AIStoreError ? error.code : "AI_REQUEST_FAILED",
        message: message.slice(0, 240),
      });
      send({ type: "done" });
      if (!controller.signal.aborted)
        markProviderFailure(
          "ai",
          error instanceof AIStoreError ? error.code : "AI_REQUEST_FAILED",
        );
    } finally {
      activeAIStreams--;
      clearTimeout(timer);
      req.raw.off("aborted", abort);
      reply.raw.off("close", abort);
      if (!reply.raw.writableEnded) reply.raw.end();
    }
    },
  );
  app.get(
    "/api/v1/places/search",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    bounded(async (req, signal) => {
      const q = z
        .object({
          keyword: z.string().max(100).default(""),
          city: z.string().max(100).default(""),
          category: z.string().max(100).optional(),
          longitude: z.coerce.number().min(-180).max(180).optional(),
          latitude: z.coerce.number().min(-90).max(90).optional(),
          radius: z.coerce.number().int().min(100).max(50000).default(3000),
          page: z.coerce.number().int().min(1).max(20).default(1),
        })
        .parse(req.query);
      if ((q.longitude === undefined) !== (q.latitude === undefined))
        throw new UpstreamError("INVALID_INPUT", 400, "经纬度必须同时提供");
      if (q.longitude === undefined && !q.city)
        throw new UpstreamError("INVALID_INPUT", 400, "请先选择城市或地图区域");
      const around = q.longitude !== undefined;
      const params: Record<string, string> = {
        keywords: q.keyword,
        city: q.city,
        citylimit: "true",
        offset: "20",
        page: String(q.page),
        extensions: "base",
      };
      if (q.category)
        params.keywords = [q.keyword, q.category].filter(Boolean).join(" ");
      if (around) {
        params.location = `${q.longitude},${q.latitude}`;
        params.radius = String(q.radius);
      }
      const data = await amap(
        `/v5/place/${around ? "around" : "text"}`,
        params,
        signal,
      );
      return providerData(z.array(poiRaw), data.pois).map(normalizePoi);
    }),
  );
  app.get(
    "/api/v1/places/:id",
    bounded(async (req, signal) => {
      const { id } = z
        .object({ id: z.string().regex(/^[A-Za-z0-9]{1,100}$/) })
        .parse(req.params);
      const data = await amap(
        "/v5/place/detail",
        { id, extensions: "base" },
        signal,
      );
      const items = providerData(z.array(poiRaw), data.pois);
      if (!items[0]) throw new UpstreamError("NOT_FOUND", 404, "未找到此地点");
      return normalizePoi(items[0]);
    }),
  );
  app.get(
    "/api/v1/geocode",
    bounded(async (req, signal) => {
      const q = z
        .object({
          address: z.string().trim().min(1).max(300),
          city: z.string().max(100).default(""),
        })
        .parse(req.query);
      const data = await amap("/v3/geocode/geo", q, signal);
      return providerData(
        z.array(
          z.object({
            formatted_address: z.string(),
            city: z.union([z.string(), z.array(z.unknown())]),
            location: z.string(),
          }),
        ),
        data.geocodes,
      ).map((p, i) =>
        normalizePoi({
          id: `geocode-${i}`,
          name: q.address,
          address: p.formatted_address,
          cityname: p.city,
          location: p.location,
          type: "地址",
        }),
      );
    }),
  );
  app.get(
    "/api/v1/reverse-geocode",
    bounded(async (req, signal) => {
      const q = z
        .object({
          longitude: z.coerce.number().min(-180).max(180),
          latitude: z.coerce.number().min(-90).max(90),
        })
        .parse(req.query);
      const data = await amap(
        "/v3/geocode/regeo",
        { location: `${q.longitude},${q.latitude}`, extensions: "base" },
        signal,
      );
      const result = providerData(
        z.object({
          formatted_address: z.string(),
          addressComponent: z.object({
            city: z.union([z.string(), z.array(z.unknown())]),
            province: z.string(),
          }),
        }),
        data.regeocode,
      );
      return {
        city:
          typeof result.addressComponent.city === "string"
            ? result.addressComponent.city
            : result.addressComponent.province,
        address: result.formatted_address,
      };
    }),
  );
  app.get(
    "/api/v1/weather",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    bounded(async (req, signal) => {
      const { city } = z
        .object({ city: z.string().trim().min(1).max(100) })
        .parse(req.query);
      const cacheKey = city.toLocaleLowerCase("zh-CN");
      const cached = weatherCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now())
        return { ...cached.data, cacheStatus: "cached" as const };
      try {
        const geo = await amap(
          "/v3/geocode/geo",
          { address: city, city },
          signal,
          "weather",
        );
        const codes = providerData(
          z.array(z.object({ adcode: z.string() })),
          geo.geocodes,
        );
        if (!codes[0])
          throw new UpstreamError(
            "AMAP_CITY_NOT_FOUND",
            404,
            "未找到此城市",
            "NO_GEOCODE",
          );
        const data = await amap(
          "/v3/weather/weatherInfo",
          { city: codes[0].adcode, extensions: "base" },
          signal,
          "weather",
        );
        const lives = providerData(
          z.array(
            z.object({
              city: z.string(),
              weather: z.string(),
              temperature: z.string(),
              reporttime: z.string(),
            }),
          ),
          data.lives,
        );
        if (!lives[0])
          throw new UpstreamError(
            "AMAP_WEATHER_EMPTY",
            404,
            "暂无天气数据",
            "EMPTY_WEATHER",
          );
        const w = lives[0];
        const fetchedAt = Date.now();
        const result = {
          city: w.city,
          adcode: codes[0].adcode,
          condition: w.weather,
          temperature: w.temperature,
          reportedAt: w.reporttime,
          fetchedAt,
          cacheStatus: "fresh" as const,
          source: "高德地图" as const,
        };
        weatherCache.set(cacheKey, {
          data: result,
          expiresAt: fetchedAt + 10 * 60 * 1000,
          staleUntil: fetchedAt + 24 * 60 * 60 * 1000,
        });
        markProviderSuccess("weather", fetchedAt);
        return result;
      } catch (error) {
        if (cached && cached.staleUntil > Date.now())
          return { ...cached.data, cacheStatus: "stale" as const };
        markProviderFailure(
          "weather",
          error instanceof UpstreamError ? error.code : "AMAP_NETWORK_ERROR",
        );
        throw error;
      }
    }),
  );
  app.post(
    "/api/v1/recommendations",
    bounded(async (req, signal) => {
      const input = recommendationRequestSchema.parse(req.body);
      let recommendation: unknown;
      let streamError: { code: string; message: string } | undefined;
      for await (const event of ai.stream(
        {
          taskId: "gift",
          payload: input,
          consent: {
            taskId: "gift",
            fields: ["关系", "城市", "场景", "预算"],
            includesSensitive: false,
            includesPhotos: false,
          },
          budget: { dailyUsd: 0, monthlyUsd: 0 },
        },
        signal,
      )) {
        if (event.type === "result") recommendation = event.payload;
        if (event.type === "error")
          streamError = { code: event.code, message: event.message };
      }
      if (streamError)
        throw new UpstreamError(
          streamError.code,
          streamError.code === "RATE_LIMITED" ? 429 : 502,
          streamError.message,
        );
      if (!recommendation)
        throw new UpstreamError(
          "INVALID_RESPONSE",
          502,
          "AI 没有返回可用的建议",
        );
      markProviderSuccess("ai");
      return providerData(recommendationResultSchema, recommendation);
    }),
  );
  app.get("/api/v1/map-proxy/:ticket/*", async (req, reply) => {
    const params = z
      .object({ ticket: z.string(), "*": z.string() })
      .parse(req.params);
    const [expires, signature] = params.ticket.split(".");
    if (
      !expires ||
      !signature ||
      Number(expires) < Date.now() ||
      !same(signature, sign(expires))
    )
      return reply.code(401).send({
        code: "EXPIRED_MAP_SESSION",
        message: "地图会话已过期，请重新打开地图",
      });
    if (
      !config.amapSecurityCode ||
      !/^v[345]\/[a-zA-Z0-9/_-]+$/.test(params["*"])
    )
      return reply
        .code(400)
        .send({ code: "INVALID_PATH", message: "地图请求路径无效" });
    const url = new URL(`https://restapi.amap.com/${params["*"]}`);
    const query = z.record(z.string(), z.string()).parse(req.query);
    url.search = new URLSearchParams({
      ...query,
      key: config.amapJsKey,
      jscode: config.amapSecurityCode,
    }).toString();
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      const bytes = await readLimited(response, 8_000_000);
      if (response.ok) markProviderSuccess("map");
      else markProviderFailure("map", `AMAP_MAP_HTTP_${response.status}`);
      return reply
        .code(response.status)
        .type(response.headers.get("content-type") || "application/octet-stream")
        .header("Cache-Control", "no-store")
        .send(Buffer.from(bytes));
    } catch {
      markProviderFailure("map", "AMAP_MAP_PROXY_ERROR");
      return reply.code(502).send({
        code: "AMAP_MAP_PROXY_ERROR",
        message: "地图底图暂不可用，本地地点不受影响",
      });
    }
  });
  return app;
}
