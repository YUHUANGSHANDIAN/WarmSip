# WarmSip AI 架构与安全

WarmSip 0.2.0-beta.4 固定使用 MIT 许可的 `@earendil-works/pi-ai@1.5.0`。pi SDK 只在 Node/Fastify 服务中运行，不进入 Web/PWA 或原生 WebView 客户端包。服务提供统一模型目录、显式任务路由、流式生成、取消、Token 与费用报告和标准错误。

## 连接方式

| 方式                              | 本版状态                                                                | 凭证位置             |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| API Key / BYOK                    | 支持 OpenAI、Anthropic、Google、DeepSeek、OpenRouter、Moonshot、MiniMax | 单租户服务加密文件   |
| DeepSeek 服务端环境               | `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 同时配置时启用                  | 仅服务端进程内存     |
| OpenRouter OAuth                  | 支持，需服务商允许并完成浏览器授权                                      | 单租户服务加密文件   |
| 其他 OAuth                        | 本版隐藏或标记不可用                                                    | 不使用               |
| Ollama / LM Studio / 私有兼容服务 | 支持，需服务端显式允许一个精确端点                                      | 服务端配置与加密文件 |

pi 支持某种 OAuth Provider，不代表任意第三方应用获准复用该订阅。WarmSip 不会读取 Codex、pi、ChatGPT、Claude、浏览器或其他应用的登录缓存，也不会把订阅宣传为 API 免费额度。

## 服务启动

```sh
cp .env.example .env
# 基础服务至少设置随机 SERVICE_ACCESS_TOKEN
# 需要运行时多 Provider 凭证时再设置 AI_CREDENTIAL_ENCRYPTION_KEY
npm run server:dev
```

两个值都不应发送到聊天、提交到 Git 或打入客户端。远程服务必须通过 HTTPS 反向代理。需要运行时凭证持久保存时，Docker 部署必须给 `/app/data/ai-store.json` 使用持久卷。

单 Provider 的最小 DeepSeek 配置是：

```dotenv
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_API_KEY=由用户在本机或 Render Secret 中填写
```

三项必须同时存在。`AI_MODEL` 只接受 pi-ai 1.5.0 内置的 `deepseek-flash` 与 `deepseek-v4-pro`；旧 `deepseek-chat`、`deepseek-reasoner` 会阻止启动，不做静默映射。默认连接 ID 为 `deepseek-env`，在客户端显示为服务端环境管理、不可编辑或删除。`deepseek-v4-pro` 只有在用户显式设置 `AI_MODEL` 时启用。

本地模型默认关闭。只有同时设置 `ALLOW_LOCAL_AI_ENDPOINTS=true` 和精确的 `AI_ALLOWED_LOCAL_ENDPOINTS` 才可连接。远程自定义地址会解析 DNS 并拒绝私网、回环、链路本地、云元数据和非 HTTPS 地址。

## 安全边界

服务是单实例、单可信管理域，不提供多用户账号隔离。持有服务访问令牌的人可以管理模型连接。公开部署前应使用随机长令牌、HTTPS、反向代理来源限制和独立加密密钥。

Render Free 的容器文件系统是临时的。环境变量静态连接的 DeepSeek 可以在重启后恢复，但 `/app/data/ai-store.json` 中的运行时模型连接、加密凭证、诊断时间和用量会随休眠重启或重新部署丢失。零付费部署不配置 `AI_CREDENTIAL_ENCRYPTION_KEY`；不要把临时磁盘当作持久凭证库。静态模式的 usage 是进程内软账目，不是 DeepSeek 官方账单。

凭证以 AES-256-GCM 保存，每个 Provider 使用独立随机 nonce 和 Provider ID 作为 AAD。文件写入采用串行读改写、同步写入与原子替换。API 响应只返回尾号掩码；连接列表不解析为明文；错误、日志和备份不包含凭证。删除连接会同时移除该连接的密文和任务路由。

客户端只持久化 AI 总开关、任务模型 ID、预算与非敏感隐私偏好。模型连接、密钥、Token 和原始用量由服务端管理。所有客户端请求都要经过服务令牌与来源检查；生产配置禁止无令牌网络监听。

## 数据最小化

- AI 选礼默认发送场景、关系、城市和预算；偏好、过敏、饮食需求分别要求开关。
- 暖心文案只发送用户主动选择的一段文字、场景和语气。
- 地图意图只发送搜索描述、城市与可选视野中心；AI 输出经过 Schema 校验后才能查询 POI。
- 城市导览只发送城市与兴趣词，输出不得冒充实时商家、价格、评分或营业信息。
- 足迹故事只发送地点名称、状态、心情和经授权备注；照片与精确坐标默认排除。
- 结构化输出必须在服务端重新校验。取消生成或结构校验失败不会写入业务记录。

## 任务与错误

任务包括 `gift`、`copywriting`、`map-intent`、`city-guide`、`story` 和预留的 `vision`。环境变量连接会作为六个任务的只读默认路由；存在运行时显式路由时优先生效。所选路由失败时直接返回错误，不跨供应商重试。

服务区分未配置、无路由、模型不存在、无效凭证、余额或额度不足、限流、超时、上游错误、结构错误、取消和软预算超限。用量记录包括状态、Token、费用来源和耗时，不保存 Prompt 或生成正文。每个任务的输出上限分别为：选礼 700、文案 320、地图意图 240、城市导览 600、故事与视觉 900 Token。

## 验证边界

自动化使用 faux Provider 和静态目录验证路由，不伪造生产联调结果。只有真实 `/api/v1/ai/stream` 调用返回结构化结果、模型 ID 与 usage 后，才可以把 DeepSeek 标记为“真实推理通过”。连接测试会发送一次极小请求，可能产生服务商费用；实际联调脚本默认只发起一次业务流式请求，取消探测必须显式开启。
