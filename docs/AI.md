# WarmSip AI 架构与安全

WarmSip 0.2.0-beta.1 固定使用 MIT 许可的 `@earendil-works/pi-ai@1.5.0`。pi SDK 只在 Node/Fastify 服务中运行，不进入 Web/PWA 或原生 WebView 客户端包。服务提供统一模型目录、显式任务路由、流式生成、取消、Token 与费用报告和标准错误。

## 连接方式

| 方式 | 本版状态 | 凭证位置 |
| --- | --- | --- |
| API Key / BYOK | 支持 OpenAI、Anthropic、Google、DeepSeek、OpenRouter、Moonshot、MiniMax | 单租户服务加密文件 |
| OpenRouter OAuth | 支持，需服务商允许并完成浏览器授权 | 单租户服务加密文件 |
| 其他 OAuth | 本版隐藏或标记不可用 | 不使用 |
| Ollama / LM Studio / 私有兼容服务 | 支持，需服务端显式允许一个精确端点 | 服务端配置与加密文件 |

pi 支持某种 OAuth Provider，不代表任意第三方应用获准复用该订阅。WarmSip 不会读取 Codex、pi、ChatGPT、Claude、浏览器或其他应用的登录缓存，也不会把订阅宣传为 API 免费额度。

## 服务启动

```sh
cp .env.example .env
# 在 .env 中设置随机 SERVICE_ACCESS_TOKEN 与 AI_CREDENTIAL_ENCRYPTION_KEY
npm run server:dev
```

两个值都不应发送到聊天、提交到 Git 或打入客户端。远程服务必须通过 HTTPS 反向代理。Docker 部署使用 `warmsip-data` 卷保存 `/app/data/ai-store.json`，容器文件系统可保持只读。

本地模型默认关闭。只有同时设置 `ALLOW_LOCAL_AI_ENDPOINTS=true` 和精确的 `AI_ALLOWED_LOCAL_ENDPOINTS` 才可连接。远程自定义地址会解析 DNS 并拒绝私网、回环、链路本地、云元数据和非 HTTPS 地址。

## 安全边界

服务是单实例、单可信管理域，不提供多用户账号隔离。持有服务访问令牌的人可以管理模型连接。公开部署前应使用随机长令牌、HTTPS、反向代理来源限制和独立加密密钥。

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

任务包括 `gift`、`copywriting`、`map-intent`、`city-guide`、`story` 和预留的 `vision`。每个任务显式绑定 Connection/Model；无法配置时不调用其他供应商。自动跨供应商回退默认关闭。

服务区分未配置、无路由、模型不存在、同源/令牌拒绝、限流、超时、上游错误、结构错误、取消和软预算超限。用量记录包括状态、Token、费用来源和耗时，不保存 Prompt 或生成正文。

## 验证边界

自动化使用两个独立 faux Provider 验证真实路由，不伪造生产联调结果。只有用户在设置中配置有效凭证并成功完成测试后，才可以把对应提供商标记为“真实推理通过”。测试连接会发送一次极小请求，可能产生服务商费用。
