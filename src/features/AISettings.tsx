import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  CreditCard,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  aiTaskIds,
  aiTaskLabels,
  type AIConnectionInput,
  type AIProviderId,
  type AIState,
  type AITaskId,
  type AITaskRoute,
} from "../domain";
import { services } from "../services/api";
import { platform } from "../platform";
import { storageMessage } from "../storage/db";
import { Badge, Field, Form, Modal, useAction, useNotice } from "../components/ui";

const providers: {
  id: AIProviderId;
  name: string;
  methods: ("api-key" | "oauth" | "local")[];
  description: string;
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    methods: ["api-key"],
    description: "使用你自己的 OpenAI API 资源。",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    methods: ["api-key"],
    description: "使用 Anthropic API Key。",
  },
  {
    id: "google",
    name: "Google Gemini",
    methods: ["api-key"],
    description: "使用 Gemini API Key。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    methods: ["api-key"],
    description: "使用 DeepSeek 开放平台凭证。",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    methods: ["oauth", "api-key"],
    description: "官方 OAuth 会在服务端安全保存用户授权。",
  },
  {
    id: "moonshotai",
    name: "Moonshot / Kimi",
    methods: ["api-key"],
    description: "Moonshot 国际区开放平台。",
  },
  {
    id: "moonshotai-cn",
    name: "Moonshot 中国区",
    methods: ["api-key"],
    description: "Moonshot 中国区开放平台。",
  },
  {
    id: "minimax",
    name: "MiniMax",
    methods: ["api-key"],
    description: "MiniMax 国际区开放平台。",
  },
  {
    id: "minimax-cn",
    name: "MiniMax 中国区",
    methods: ["api-key"],
    description: "MiniMax 中国区开放平台。",
  },
  {
    id: "custom",
    name: "Ollama / LM Studio",
    methods: ["local", "api-key"],
    description: "OpenAI-compatible 私有端点，仅由服务端管理员启用。",
  },
];

const methodLabels = {
  "api-key": "API Key",
  oauth: "账号 OAuth",
  local: "本地模型",
};

export function AISettings({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<AIState>();
  const [tab, setTab] = useState<"connections" | "routes" | "usage">("connections");
  const [adding, setAdding] = useState(false);
  const [providerId, setProviderId] = useState<AIProviderId>("openrouter");
  const [authType, setAuthType] = useState<AIConnectionInput["authType"]>("oauth");
  const [label, setLabel] = useState("OpenRouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelIds, setModelIds] = useState("");
  const [routes, setRoutes] = useState<AITaskRoute[]>([]);
  const { busy, run } = useAction();
  const notice = useNotice();
  const oauthTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!enabled) return;
    setState(await services.aiState());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load().catch((error) =>
      notice({ text: storageMessage(error), error: true }),
    );
    return () => {
      if (oauthTimer.current) window.clearTimeout(oauthTimer.current);
    };
  }, [enabled, load, notice]);

  useEffect(() => {
    setRoutes(state?.routes || []);
  }, [state]);

  const provider = providers.find((item) => item.id === providerId)!;
  const save = async () => {
    await services.saveAIConnection({
      providerId,
      label,
      authType,
      apiKey,
      baseUrl,
      modelIds:
        providerId === "custom"
          ? modelIds
              .split(/[,，]/)
              .map((value) => value.trim())
              .filter(Boolean)
          : [],
    });
    setAdding(false);
    setApiKey("");
    await load();
    notice({ text: "AI 连接已安全保存到单租户服务" });
  };

  const startOAuth = () =>
    run(async () => {
      const flow = await services.startOpenRouterOAuth();
      let opened = false;
      const poll = async () => {
        const result = await services.openRouterOAuthStatus(flow.flowId);
        if (result.url && !opened) {
          opened = true;
          await platform.openExternal(result.url);
          notice({ text: "已在系统浏览器打开 OpenRouter 授权" });
        }
        if (result.status === "complete") {
          setAdding(false);
          await load();
          notice({ text: "OpenRouter 账号已连接" });
          return;
        }
        if (result.status === "failed" || result.status === "cancelled") {
          throw new Error("OpenRouter 授权未完成，请重试");
        }
        oauthTimer.current = window.setTimeout(() => {
          void poll().catch((error) =>
            notice({ text: storageMessage(error), error: true }),
          );
        }, 1500);
      };
      await poll();
    });

  const saveRoutes = () =>
    run(async () => {
      await services.setAITaskRoutes(routes);
      await load();
      notice({ text: "任务模型路由已保存" });
    });

  return (
    <section className="settings-card ai-settings" aria-labelledby="ai-settings-title">
      <div className="section-heading">
        <div>
          <h2 id="ai-settings-title">
            <Bot size={21} />
            AI 模型与连接
          </h2>
          <p className="muted">
            {state?.persistence === "process-memory"
              ? "当前连接由服务端环境变量提供，密钥不进入客户端；诊断与用量仅在本次服务进程内保留。"
              : "凭证由单租户服务加密保管，当前客户端不会持久化模型密钥。"}
          </p>
        </div>
        <Badge tone={state?.available ? "sage" : "neutral"}>
          {state?.available ? "可用" : enabled ? "待配置" : "需先连接服务"}
        </Badge>
      </div>
      <div className="subnav ai-subnav" role="tablist" aria-label="AI 设置分区">
        {(
          [
            ["connections", "连接与模型"],
            ["routes", "任务路由"],
            ["usage", "用量与预算"],
          ] as const
        ).map(([key, text]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {text}
          </button>
        ))}
      </div>
      {!enabled ? (
        <div className="info-panel">
          <strong>先配置并检查在线服务</strong>
          <p>保存服务地址和访问令牌后，这里会读取真实连接状态。</p>
        </div>
      ) : !state ? (
        <div className="loading-state" role="status">
          正在读取 AI 连接…
        </div>
      ) : tab === "connections" ? (
        <>
          <div className="ai-connection-grid">
            {state.connections.length ? (
              state.connections.map((connection) => (
                <article className="ai-connection-card" key={connection.id}>
                  <div>
                    <Badge
                      tone={
                        connection.status === "connected"
                          ? "sage"
                          : connection.status === "error"
                            ? "warm"
                            : "neutral"
                      }
                    >
                      {connection.status === "connected" ? <Check size={12} /> : null}
                      {connection.status}
                    </Badge>
                    <h3>{connection.label}</h3>
                    <p>
                      {connection.origin === "environment"
                        ? "服务端环境 · 只读"
                        : methodLabels[connection.authType]}{" "}
                      · {connection.maskedCredential}
                    </p>
                    <small>{connection.modelCount} 个可用模型</small>
                    {connection.lastError && (
                      <p className="field-error">{connection.lastError}</p>
                    )}
                  </div>
                  <div className="connection-actions">
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await services.testAIConnection(connection.id);
                          await load();
                          notice({ text: "连接测试成功" });
                        })
                      }
                    >
                      <Link2 size={15} />测试（少量用量）
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`刷新${connection.label}模型`}
                      disabled={busy || connection.origin === "environment"}
                      onClick={() =>
                        void run(async () => {
                          await services.refreshAIModels(connection.id);
                          await load();
                          notice({ text: "模型目录已刷新" });
                        })
                      }
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`移除${connection.label}连接`}
                      disabled={busy || connection.managedByService}
                      onClick={() =>
                        void run(async () => {
                          await services.removeAIConnection(connection.id);
                          await load();
                          notice({ text: "连接已移除，其他连接不受影响" });
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">还没有模型连接。添加后先测试，再为任务选择模型。</p>
            )}
          </div>
          {state.credentialManagementReady ? (
            <button className="button secondary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              添加模型连接
            </button>
          ) : (
            <div className="info-panel">
              <LockKeyhole size={18} />
              <p>
                Render Free 使用临时文件系统，本版只开放服务端环境变量管理的
                DeepSeek 连接，不支持从客户端写入会在重启后丢失的模型凭证。
              </p>
            </div>
          )}
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <strong>单可信管理域</strong>
              <p>
                本版不提供多用户账号隔离。拥有服务访问令牌的人可以管理此服务的连接。
              </p>
            </div>
          </div>
        </>
      ) : tab === "routes" ? (
        <>
          <p className="muted">
            每个任务显式选择模型；失败不会静默跨供应商重试，也不会改变数据目的地。
          </p>
          <div className="ai-route-list">
            {aiTaskIds.map((taskId) => {
              const route = routes.find((item) => item.taskId === taskId);
              const choices = state.models.filter(
                (model) =>
                  state.connections.find(
                    (connection) =>
                      (connection.providerId === "custom"
                        ? connection.id
                        : connection.providerId) === model.providerId &&
                      connection.enabled &&
                      (connection.origin === "environment" ||
                        connection.status === "connected"),
                  ),
              );
              return (
                <div className="ai-route-row" key={taskId}>
                  <div>
                    <strong>{aiTaskLabels[taskId]}</strong>
                    <small>只在用户触发对应功能时调用</small>
                  </div>
                  <select
                    aria-label={`${aiTaskLabels[taskId]}默认模型`}
                    disabled={!state.credentialManagementReady}
                    value={route ? `${route.connectionId}|${route.modelId}` : ""}
                    onChange={(event) => {
                      const [connectionId, modelId] = event.target.value.split("|");
                      setRoutes((current) => [
                        ...current.filter((item) => item.taskId !== taskId),
                        ...(connectionId && modelId
                          ? [{ taskId, connectionId, modelId }]
                          : []),
                      ]);
                    }}
                  >
                    <option value="">未配置</option>
                    {choices.map((model) => {
                      const connection = state.connections.find(
                        (item) =>
                          (item.providerId === "custom"
                            ? item.id
                            : item.providerId) === model.providerId,
                      );
                      return (
                        <option
                          key={`${model.providerId}:${model.id}`}
                          value={`${connection?.id || model.providerId}|${model.id}`}
                        >
                          {model.name} · {connection?.label || model.providerId}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
          <button
            className="button primary"
            disabled={busy || !state.credentialManagementReady}
            onClick={saveRoutes}
          >
            保存任务路由
          </button>
        </>
      ) : (
        <>
          <div className="ai-usage-grid">
            <div>
              <strong>{state.usage.todayCalls}</strong>
              <span>今日调用</span>
            </div>
            <div>
              <strong>{state.usage.monthCalls}</strong>
              <span>本月调用</span>
            </div>
            <div>
              <strong>${state.usage.todayCostUsd.toFixed(4)}</strong>
              <span>今日估算 / 报告费用</span>
            </div>
            <div>
              <strong>${state.usage.monthCostUsd.toFixed(4)}</strong>
              <span>本月估算 / 报告费用</span>
            </div>
          </div>
          <div className="info-panel">
            <CreditCard size={18} />
            <p>
              费用仅是服务商报告值或模型目录估算，不等同于官方账单。预算上限在本地设置中配置。
              {state.persistence === "process-memory"
                ? " 当前运行在临时服务实例上，重启后用量记录会清空。"
                : ""}
            </p>
          </div>
          <div className="usage-list">
            {state.usage.recent.map((record) => (
              <div key={record.id}>
                <span>{aiTaskLabels[record.taskId as AITaskId] || record.taskId}</span>
                <strong>{record.modelId}</strong>
                <small>
                  {record.status} · {record.inputTokens + record.outputTokens} tokens
                </small>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button
              className="button ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await load();
                  notice({ text: "用量状态已刷新" });
                })
              }
            >
              <RefreshCw size={16} />刷新
            </button>
            <button
              className="button ghost danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await services.clearAIUsage();
                  await load();
                  notice({ text: "AI 用量记录已清空" });
                })
              }
            >
              清空用量记录
            </button>
          </div>
        </>
      )}
      {adding && (
        <Modal title="添加 AI 模型连接" onClose={() => setAdding(false)}>
          <Form
            onSubmit={() => {
              if (authType === "oauth") void startOAuth();
              else void run(save);
            }}
          >
            <Field label="提供商">
              <select
                value={providerId}
                onChange={(event) => {
                  const next = event.target.value as AIProviderId;
                  const item = providers.find((candidate) => candidate.id === next)!;
                  setProviderId(next);
                  setLabel(item.name);
                  setAuthType(item.methods[0]);
                  setBaseUrl("");
                  setModelIds("");
                  setApiKey("");
                }}
              >
                {providers.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted">{provider.description}</p>
            <Field label="连接方式">
              <select
                value={authType}
                onChange={(event) =>
                  setAuthType(event.target.value as AIConnectionInput["authType"])
                }
              >
                {provider.methods.map((method) => (
                  <option value={method} key={method}>
                    {methodLabels[method]}
                    {method === "oauth" && provider.id !== "openrouter"
                      ? "（本版不可用）"
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="显示名称">
              <input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
            </Field>
            {authType === "api-key" && (
              <Field label="API Key" hint="仅提交到受令牌保护的 WarmSip 服务，不写入本机存储。">
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </Field>
            )}
            {providerId === "custom" && (
              <>
                <Field
                  label="OpenAI-compatible 地址"
                  hint="远程地址必须使用 HTTPS；本地端点需要服务端显式允许。"
                >
                  <input
                    type="url"
                    value={baseUrl}
                    placeholder="http://127.0.0.1:11434/v1"
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </Field>
                <Field label="模型 ID" hint="多个模型用逗号分开。">
                  <input
                    value={modelIds}
                    placeholder="例如：llama3.1:8b, qwen3:8b"
                    onChange={(event) => setModelIds(event.target.value)}
                  />
                </Field>
              </>
            )}
            <div className="privacy-note">
              <LockKeyhole size={18} />
              <p>
                OAuth 使用系统浏览器。API Key 不会回显，也不会进入备份、日志或客户端包。
              </p>
            </div>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
              {authType === "oauth" ? "在系统浏览器授权" : "安全保存连接"}
            </button>
          </Form>
        </Modal>
      )}
    </section>
  );
}
