import { z } from "zod";
import {
  recommendationResultSchema,
  poiSchema,
  weatherSchema,
  type RecommendationRequest,
  type Capabilities,
} from "../domain";
import { getSettings } from "../storage/db";
let accessToken = "";
export function setAccessToken(token: string) {
  accessToken = token.trim();
}
export class ServiceError extends Error {
  constructor(
    message: string,
    public code = "UNAVAILABLE",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export function validateServiceUrl(value: string) {
  if (!value.trim()) return "";
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("服务地址不能包含凭证、查询参数或片段");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("远程服务必须使用 HTTPS");
  return url.href.replace(/\/$/, "");
}
export async function apiRequest(
  path: string,
  init: RequestInit = {},
  timeout = 15000,
): Promise<unknown> {
  const settings = await getSettings();
  const base = validateServiceUrl(settings.serviceUrl);
  if (!base)
    throw new ServiceError(
      "尚未配置在线服务，可继续使用本地功能",
      "NOT_CONFIGURED",
    );
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("服务请求超时", "TimeoutError")),
    timeout,
  );
  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw new ServiceError(
        typeof data?.message === "string" ? data.message : "在线服务暂不可用",
        data?.code || String(response.status),
      );
    return data;
  } catch (e) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw e;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
const capabilitiesSchema = z.object({
  ai: z.boolean(),
  places: z.boolean(),
  weather: z.boolean(),
  map: z.boolean(),
  mapJsKey: z.string(),
  mapProxyUrl: z.string(),
});
export interface AIProvider {
  recommend: (
    input: RecommendationRequest,
    signal: AbortSignal,
  ) => Promise<z.infer<typeof recommendationResultSchema>>;
}
export interface WeatherProvider {
  get: (
    city: string,
    signal: AbortSignal,
  ) => Promise<z.infer<typeof weatherSchema>>;
}
export const services = {
  capabilities: async (signal?: AbortSignal): Promise<Capabilities> =>
    capabilitiesSchema.parse(await apiRequest("/capabilities", { signal })),
  recommend: async (input: RecommendationRequest, signal: AbortSignal) =>
    recommendationResultSchema.parse(
      await apiRequest(
        "/recommendations",
        { method: "POST", body: JSON.stringify(input), signal },
        60000,
      ),
    ),
  weather: async (city: string, signal: AbortSignal) =>
    weatherSchema.parse(
      await apiRequest(`/weather?city=${encodeURIComponent(city)}`, { signal }),
    ),
  search: async (
    query: {
      keyword: string;
      city: string;
      category?: string;
      longitude?: number;
      latitude?: number;
      radius?: number;
      page?: number;
    },
    signal: AbortSignal,
  ) =>
    z.array(poiSchema).parse(
      await apiRequest(
        `/places/search?${new URLSearchParams(
          Object.entries(query)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )}`,
        { signal },
      ),
    ),
  detail: async (id: string, signal: AbortSignal) =>
    poiSchema.parse(
      await apiRequest(`/places/${encodeURIComponent(id)}`, { signal }),
    ),
  geocode: async (address: string, city: string, signal: AbortSignal) =>
    z.array(poiSchema).parse(
      await apiRequest(`/geocode?${new URLSearchParams({ address, city })}`, {
        signal,
      }),
    ),
  reverse: async (longitude: number, latitude: number, signal: AbortSignal) =>
    z
      .object({ city: z.string(), address: z.string() })
      .parse(
        await apiRequest(
          `/reverse-geocode?longitude=${longitude}&latitude=${latitude}`,
          { signal },
        ),
      ),
};
export class LatestRequest {
  private current?: AbortController;
  private sequence = 0;
  cancel() {
    this.sequence++;
    this.current?.abort(new DOMException("已取消", "AbortError"));
  }
  async run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.current = controller;
    let onAbort!: () => void;
    const canceled = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const value = await Promise.race([work(controller.signal), canceled]);
      if (sequence !== this.sequence || controller.signal.aborted)
        throw new DOMException("旧请求已取消", "AbortError");
      return value;
    } finally {
      controller.signal.removeEventListener("abort", onAbort);
      if (this.current === controller) this.current = undefined;
    }
  }
}
