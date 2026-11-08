import { mkdir, writeFile } from "node:fs/promises";

const base = (process.env.WARMSIP_BASE_URL || "").replace(/\/$/, "");
const token = process.env.WARMSIP_ACCESS_TOKEN || "";
if (!base || !token)
  throw new Error(
    "请仅在本地环境变量中设置 WARMSIP_BASE_URL 和 WARMSIP_ACCESS_TOKEN",
  );
if (!process.argv.includes("--confirm-live"))
  throw new Error(
    "真实联调可能消耗 DeepSeek 余额和高德配额；确认后添加 --confirm-live",
  );

const headers = {
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
};
const startedAt = new Date().toISOString();
const checks = [];

async function call(path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (!response.ok)
    throw new Error(
      `${path} 返回 ${response.status}: ${body?.code || "INVALID_RESPONSE"}`,
    );
  return {
    body,
    durationMs: Math.round(performance.now() - started),
  };
}

async function aiStream(payload, signal) {
  const started = performance.now();
  const response = await fetch(`${base}/api/v1/ai/stream`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(`AI 流式请求返回 ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let start;
  let result;
  let usage;
  let error;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data);
      if (event.type === "start") start = event;
      if (event.type === "delta") text += event.delta;
      if (event.type === "result") result = event.payload;
      if (event.type === "usage") usage = event;
      if (event.type === "error") error = event;
    }
  }
  if (error) throw new Error(`AI ${error.code}: ${error.message}`);
  if (!start || !result)
    throw new Error("AI 流式请求没有返回完整的开始与结构化结果");
  return {
    durationMs: Math.round(performance.now() - started),
    providerId: start.providerId,
    modelId: start.modelId,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    costSource: usage?.costSource || "unknown",
    textBytes: Buffer.byteLength(text),
  };
}

const health = await call("/healthz");
checks.push({ name: "healthz", durationMs: health.durationMs });

const capabilities = await call("/api/v1/capabilities");
if (!capabilities.body.ai || !capabilities.body.places || !capabilities.body.weather)
  throw new Error("AI、地点或天气能力尚未配置");
checks.push({
  name: "capabilities",
  durationMs: capabilities.durationMs,
  map: Boolean(capabilities.body.map),
});

const ai = await aiStream({
  taskId: "gift",
  payload: {
    relation: "朋友",
    likes: "热饮",
    allergies: "",
    diet: "",
    city: "北京",
    scene: "日常关心",
    budget: 50,
    kind: "normal",
  },
  consent: {
    taskId: "gift",
    fields: ["关系", "偏好", "城市", "场景", "预算"],
    includesSensitive: false,
    includesPhotos: false,
  },
  budget: { dailyUsd: 0.05, monthlyUsd: 0.2 },
});
checks.push({ name: "deepseek-stream-gift", ...ai });

const search = async (city, keyword) => {
  const result = await call(
    `/api/v1/places/search?${new URLSearchParams({ city, keyword })}`,
  );
  if (!Array.isArray(result.body) || !result.body[0])
    throw new Error(`${city} POI 搜索没有返回地点`);
  return { ...result, poi: result.body[0] };
};
const beijing = await search("北京", "咖啡馆");
const shanghai = await search("上海", "甜品");
checks.push({
  name: "amap-poi-beijing",
  durationMs: beijing.durationMs,
  count: beijing.body.length,
});
checks.push({
  name: "amap-poi-shanghai",
  durationMs: shanghai.durationMs,
  count: shanghai.body.length,
});

const detail = await call(
  `/api/v1/places/${encodeURIComponent(beijing.poi.id)}`,
);
checks.push({ name: "amap-poi-detail", durationMs: detail.durationMs });

const geocode = await call(
  `/api/v1/geocode?${new URLSearchParams({ address: "北京市天安门", city: "北京" })}`,
);
if (!geocode.body[0]) throw new Error("正地理编码没有返回坐标");
checks.push({
  name: "amap-geocode",
  durationMs: geocode.durationMs,
  count: geocode.body.length,
});

const reverse = await call(
  `/api/v1/reverse-geocode?longitude=${beijing.poi.coordinate.longitude}&latitude=${beijing.poi.coordinate.latitude}`,
);
checks.push({ name: "amap-reverse-geocode", durationMs: reverse.durationMs });

const weather = await call(
  `/api/v1/weather?${new URLSearchParams({ city: "北京" })}`,
);
if (!weather.body.reportedAt || !weather.body.adcode)
  throw new Error("天气响应缺少 reporttime 或 adcode");
checks.push({
  name: "amap-weather",
  durationMs: weather.durationMs,
  cacheStatus: weather.body.cacheStatus,
});

if (process.argv.includes("--cancel-check")) {
  const controller = new AbortController();
  const pending = aiStream(
    {
      taskId: "copywriting",
      payload: {
        text: "今天辛苦了。",
        scene: "日常关心",
        tone: "温柔",
        length: "短",
      },
      consent: {
        taskId: "copywriting",
        fields: ["测试文案", "场景", "语气"],
        includesSensitive: false,
        includesPhotos: false,
      },
      budget: { dailyUsd: 0.05, monthlyUsd: 0.2 },
    },
    controller.signal,
  ).then(
    () => false,
    (error) => error?.name === "AbortError",
  );
  setTimeout(() => controller.abort(), 250);
  checks.push({ name: "deepseek-cancel", aborted: await pending });
}

const evidence = {
  version: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  baseOrigin: new URL(base).origin,
  checks,
  notes: [
    "不包含服务令牌、上游密钥、完整 Prompt 或生成正文。",
    "费用字段来自 provider 报告、模型目录估算或 unknown，不等同于官方账单。",
  ],
};
await mkdir("artifacts", { recursive: true });
const output = `artifacts/live-validation-${Date.now()}.json`;
await writeFile(output, JSON.stringify(evidence, null, 2));
console.info(`真实联调检查通过；脱敏证据已写入 ${output}`);
