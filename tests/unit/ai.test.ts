import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { AIService } from "../../server/ai/service";
import { FileCredentialStore } from "../../server/ai/store";
import type { AIConnection, AIStreamEvent } from "../../shared/ai";

const files: string[] = [];
afterEach(async () => {
  for (const file of files.splice(0))
    await unlink(file).catch(() => undefined);
});

function dataFile() {
  const file = join(tmpdir(), `warmsip-ai-${randomUUID()}.json`);
  files.push(file);
  return file;
}

function connection(id: string): AIConnection {
  const now = Date.now();
  return {
    id,
    providerId: "custom",
    label: id,
    authType: "local",
    baseUrl: "",
    enabled: true,
    status: "connected",
    maskedCredential: "无密钥",
    modelCount: 1,
    modelIds: ["model"],
    lastCheckedAt: now,
    lastError: "",
    createdAt: now,
    updatedAt: now,
  };
}

describe("AI credential and provider boundary", () => {
  it("encrypts provider credentials, keeps metadata non-secret and detects tampering", async () => {
    const file = dataFile();
    const store = new FileCredentialStore(
      file,
      "this-is-a-long-test-encryption-secret",
    );
    await store.modify("openai", async () => ({
      type: "api_key",
      key: "sk-test-secret-value",
    }));
    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain("sk-test-secret-value");
    expect(await store.list()).toEqual([{ providerId: "openai", type: "api_key" }]);
    expect(await store.read("openai")).toMatchObject({
      type: "api_key",
      key: "sk-test-secret-value",
    });

    const modified = JSON.parse(raw) as {
      credentials: Record<string, { tag: string }>;
    };
    modified.credentials.openai.tag = "invalid";
    await writeFile(file, JSON.stringify(modified));
    await expect(store.read("openai")).rejects.toMatchObject({
      code: "CREDENTIAL_DECRYPT_FAILED",
    });
  });

  it("rejects loopback endpoints unless explicitly enabled", async () => {
    const service = new AIService({
      dataFile: dataFile(),
      encryptionSecret: "this-is-a-long-test-encryption-secret",
      allowLocalEndpoints: false,
    });
    await expect(
      service.saveConnection({
        providerId: "custom",
        label: "本机模型",
        authType: "local",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "",
        modelIds: ["default"],
      }),
    ).rejects.toMatchObject({ code: "LOCAL_ENDPOINT_DENIED" });
  });

  it("allows only an explicitly listed local model origin", async () => {
    const service = new AIService({
      dataFile: dataFile(),
      encryptionSecret: "this-is-a-long-test-encryption-secret",
      allowLocalEndpoints: true,
      allowedLocalEndpoints: ["http://127.0.0.1:11434/v1"],
    });
    await expect(
      service.saveConnection({
        providerId: "custom",
        label: "本机模型",
        authType: "local",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "",
        modelIds: ["llama3"],
      }),
    ).resolves.toMatchObject({ providerId: "custom" });
  });

  it("routes a task to the explicitly selected faux provider without fallback", async () => {
    const first = fauxProvider({
      provider: "faux-a",
      models: [{ id: "model", name: "Faux A" }],
    });
    const second = fauxProvider({
      provider: "faux-b",
      models: [{ id: "model", name: "Faux B" }],
    });
    const result = {
      summary: "A warm suggestion",
      items: [
        {
          name: "手写卡",
          category: "心意",
          price: "自行安排",
          store: "",
          reason: "表达具体关心",
        },
      ],
      healthTips: ["核实真实商家信息"],
      blessing: "愿今天被温柔记住。",
    };
    first.setResponses([fauxAssistantMessage(JSON.stringify(result))]);
    second.setResponses([fauxAssistantMessage(JSON.stringify(result))]);
    const service = new AIService({
      dataFile: dataFile(),
      encryptionSecret: "this-is-a-long-test-encryption-secret",
      allowLocalEndpoints: false,
      extraProviders: [first.provider, second.provider],
    });
    await service.store!.upsertConnection(connection("faux-a"));
    await service.store!.upsertConnection(connection("faux-b"));
    await service.store!.setRoutes([
      { taskId: "gift", connectionId: "faux-a", modelId: "model" },
    ]);

    const run = async () => {
      const events: AIStreamEvent[] = [];
      for await (const event of service.stream(
        {
          taskId: "gift",
          payload: { scene: "日常关心", budget: 50 },
          consent: {
            taskId: "gift",
            fields: ["场景", "预算"],
            includesSensitive: false,
            includesPhotos: false,
          },
          budget: { dailyUsd: 0, monthlyUsd: 0 },
        },
        new AbortController().signal,
      ))
        events.push(event);
      return events;
    };
    expect((await run()).find((event) => event.type === "start")).toMatchObject({
      providerId: "faux-a",
    });
    await service.store!.setRoutes([
      { taskId: "gift", connectionId: "faux-b", modelId: "model" },
    ]);
    expect((await run()).find((event) => event.type === "start")).toMatchObject({
      providerId: "faux-b",
    });
    expect(first.state.callCount).toBe(1);
    expect(second.state.callCount).toBe(1);
  });

  it("blocks a task before dispatch when the daily soft budget is reached", async () => {
    const faux = fauxProvider({
      provider: "faux-budget",
      models: [{ id: "model", name: "Budget Faux" }],
    });
    const service = new AIService({
      dataFile: dataFile(),
      encryptionSecret: "this-is-a-long-test-encryption-secret",
      allowLocalEndpoints: false,
      extraProviders: [faux.provider],
    });
    await service.store!.upsertConnection(connection("faux-budget"));
    await service.store!.setRoutes([
      { taskId: "gift", connectionId: "faux-budget", modelId: "model" },
    ]);
    await service.store!.addUsage({
      id: "used-budget",
      taskId: "gift",
      providerId: "faux-budget",
      connectionId: "faux-budget",
      modelId: "model",
      status: "completed",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.5,
      costSource: "estimated",
      durationMs: 1,
      errorCode: "",
      startedAt: Date.now(),
      finishedAt: Date.now(),
    });
    await expect(
      (async () => {
        for await (const _event of service.stream(
          {
            taskId: "gift",
            payload: {},
            consent: {
              taskId: "gift",
              fields: ["场景"],
              includesSensitive: false,
              includesPhotos: false,
            },
            budget: { dailyUsd: 0.5, monthlyUsd: 0 },
          },
          new AbortController().signal,
        )) {
          // The generator must fail before yielding a start event.
        }
      })(),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(faux.state.callCount).toBe(0);
  });
});
