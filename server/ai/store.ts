import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { z } from "zod";
import {
  aiConnectionSchema,
  aiTaskRouteSchema,
  aiUsageRecordSchema,
  type AIConnection,
  type AITaskRoute,
  type AIUsageRecord,
} from "../../shared/ai.js";

const envelopeSchema = z.object({
  version: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});
type Envelope = z.infer<typeof envelopeSchema>;

const diskSchema = z.object({
  version: z.literal(1),
  connections: z.array(aiConnectionSchema).default([]),
  credentials: z.record(z.string(), envelopeSchema).default({}),
  routes: z.array(aiTaskRouteSchema).default([]),
  usage: z.array(aiUsageRecordSchema).default([]),
});
type DiskState = z.infer<typeof diskSchema>;

const emptyState = (): DiskState => ({
  version: 1,
  connections: [],
  credentials: {},
  routes: [],
  usage: [],
});

export class AIStoreError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AIStoreError";
  }
}

function keyFromSecret(secret: string) {
  if (secret.length < 24)
    throw new AIStoreError(
      "WEAK_ENCRYPTION_KEY",
      "AI_CREDENTIAL_ENCRYPTION_KEY 至少需要 24 个字符",
    );
  return createHash("sha256").update(secret, "utf8").digest();
}

export class FileCredentialStore implements CredentialStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly key: Buffer;

  constructor(
    private readonly file: string,
    encryptionSecret: string,
    private readonly now: () => number = Date.now,
  ) {
    this.key = keyFromSecret(encryptionSecret);
  }

  private locked<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async load(): Promise<DiskState> {
    try {
      const raw = await readFile(this.file, "utf8");
      if (raw.length > 5 * 1024 * 1024)
        throw new AIStoreError("STORE_TOO_LARGE", "AI 配置存储超过限制");
      return diskSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyState();
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        throw new AIStoreError(
          "STORE_CORRUPT",
          "AI 配置存储损坏，原文件已保留，请从备份恢复",
        );
      throw error;
    }
  }

  private async write(state: DiskState) {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(diskSchema.parse(state)));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.file);
  }

  private encrypt(providerId: string, credential: Credential): Envelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`warmsip-ai:${providerId}`, "utf8"));
    const plaintext = Buffer.from(JSON.stringify(credential), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      version: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    };
  }

  private decrypt(providerId: string, envelope: Envelope): Credential {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(envelope.iv, "base64url"),
      );
      decipher.setAAD(Buffer.from(`warmsip-ai:${providerId}`, "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8")) as Credential;
    } catch {
      throw new AIStoreError(
        "CREDENTIAL_DECRYPT_FAILED",
        "凭证无法解密，请重新配置该连接",
      );
    }
  }

  async read(
    providerId: string,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    const state = await this.load();
    const envelope = state.credentials[providerId];
    return envelope ? this.decrypt(providerId, envelope) : undefined;
  }

  async list(
    options?: AuthOperationOptions,
  ): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    const state = await this.load();
    return Object.entries(state.credentials).map(([providerId, envelope]) => ({
      providerId,
      type: this.decrypt(providerId, envelope).type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.locked(async () => {
      options?.signal?.throwIfAborted();
      const state = await this.load();
      const current = state.credentials[providerId]
        ? this.decrypt(providerId, state.credentials[providerId])
        : undefined;
      const next = await fn(current);
      options?.signal?.throwIfAborted();
      if (next) state.credentials[providerId] = this.encrypt(providerId, next);
      else if (next === undefined && !current) return undefined;
      await this.write(state);
      return next ?? current;
    });
  }

  async delete(providerId: string, options?: AuthOperationOptions) {
    await this.locked(async () => {
      options?.signal?.throwIfAborted();
      const state = await this.load();
      delete state.credentials[providerId];
      await this.write(state);
    });
  }

  async connections() {
    return (await this.load()).connections;
  }

  async upsertConnection(connection: AIConnection, credential?: Credential) {
    return this.locked(async () => {
      const state = await this.load();
      const index = state.connections.findIndex((x) => x.id === connection.id);
      if (index >= 0) state.connections[index] = connection;
      else state.connections.push(connection);
      if (credential) state.credentials[connection.id] = this.encrypt(connection.id, credential);
      await this.write(state);
      return connection;
    });
  }

  async removeConnection(id: string) {
    return this.locked(async () => {
      const state = await this.load();
      state.connections = state.connections.filter((x) => x.id !== id);
      state.routes = state.routes.filter((x) => x.connectionId !== id);
      delete state.credentials[id];
      await this.write(state);
    });
  }

  async updateConnection(
    id: string,
    change: Partial<AIConnection>,
  ): Promise<AIConnection> {
    return this.locked(async () => {
      const state = await this.load();
      const current = state.connections.find((x) => x.id === id);
      if (!current) throw new AIStoreError("NOT_FOUND", "AI 连接不存在");
      Object.assign(current, change, {
        id,
        updatedAt: this.now(),
      });
      await this.write(state);
      return current;
    });
  }

  async routes() {
    return (await this.load()).routes;
  }

  async setRoutes(routes: AITaskRoute[]) {
    return this.locked(async () => {
      const state = await this.load();
      state.routes = routes.map((route) => aiTaskRouteSchema.parse(route));
      await this.write(state);
      return state.routes;
    });
  }

  async usage() {
    return (await this.load()).usage;
  }

  async addUsage(record: AIUsageRecord) {
    return this.locked(async () => {
      const state = await this.load();
      state.usage.push(aiUsageRecordSchema.parse(record));
      state.usage = state.usage.slice(-1000);
      await this.write(state);
      return record;
    });
  }

  async clearUsage() {
    return this.locked(async () => {
      const state = await this.load();
      state.usage = [];
      await this.write(state);
    });
  }
}

export function newAIUsageId() {
  return randomUUID();
}
