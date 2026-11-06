# Render Free 零付费部署

本说明对应 WarmSip `0.2.0-beta.2` 与 `https://github.com/YUHUANGSHANDIAN/WarmSip`。目标是用现有 Fastify Docker 服务获得一个公网 HTTPS 地址，不购买服务器、域名、数据库、Persistent Disk 或付费实例。

## 部署前边界

- Render Free 在无请求后休眠，下一次请求可能需要约一分钟唤醒。不会常驻秒级响应。
- 免费容器文件系统是临时的。基础 URL、环境变量和镜像可恢复，但运行中写入 `/app/data` 的 AI 连接、凭证和用量不保证跨重启保留。
- 首阶段只验证基础服务：不配置 AI、高德、天气凭证，也不配置 `AI_CREDENTIAL_ENCRYPTION_KEY`。
- 服务端自身不产生本阶段 Render 实例费用；AI、高德和天气供应商可能独立计费。任何免费额度都以其当前官方政策为准。
- 仓库仍为私有。Render 需要获得读取 `YUHUANGSHANDIAN/WarmSip` 的 GitHub 权限。

## 1. 创建免费 Web Service

1. 打开 [Render Dashboard](https://dashboard.render.com/)，使用 GitHub 登录。
2. 只授权 `YUHUANGSHANDIAN/WarmSip`，不要授予无关仓库权限。
3. 选择 **New → Web Service**，连接 `YUHUANGSHANDIAN/WarmSip`。
4. 按以下字段填写。

| Render 字段 | 填写值 |
| --- | --- |
| Name | `warmsip-api`，如名称占用可加个人后缀 |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Root Directory | 留空 |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | 仓库根目录 |
| Instance Type | **Free**，确认显示 `$0/月` |
| Region | 优先 **Singapore**；若免费列表没有该区域，选择 Dashboard 提供的最接近区域 |
| Health Check Path | `/healthz` |
| Persistent Disk | 不添加 |
| Auto-Deploy | **Off**，首阶段只手动部署已通过 CI 的 `main` |
| Build Command | 留空，Dockerfile 内执行 `npm run server:build` |
| Start Command | 留空，Dockerfile 使用 `node dist-server/server/index.js` |

`Dockerfile` 已监听 `HOST=0.0.0.0`。Render 会自动设置 `PORT`，应用通过 `process.env.PORT` 使用该值。不要自行填写 `PORT`。

## 2. 生成访问令牌

在 Windows PowerShell 中本地生成 64 位随机十六进制令牌：

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[System.BitConverter]::ToString($bytes).Replace("-","").ToLowerInvariant()
```

将结果保存到自己的密码管理器。不要把真实值发送到聊天、写入 Git、截图或日志。Render 和 WarmSip 设置必须填写同一个值。

## 3. 环境变量

在 Render 的 **Environment** 中设置：

| 名称 | 值 |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `SERVICE_ACCESS_TOKEN` | 上一步的随机令牌，选择 Secret |
| `ALLOWED_ORIGINS` | `http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost,https://localhost` |
| `ALLOW_LOCAL_AI_ENDPOINTS` | `false` |

首阶段不要设置：

- `AMAP_WEB_SERVICE_KEY`
- `AMAP_JS_KEY`
- `AMAP_SECURITY_CODE`
- `AI_BASE_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `AI_CREDENTIAL_ENCRYPTION_KEY`
- `AI_DATA_FILE`
- `AI_DATA_DIR`

以后添加 Web/PWA 公网来源时，把完整 Origin 追加到 `ALLOWED_ORIGINS`，例如 `https://warmsip.example.com`。只填写协议、域名和必要端口，不要加路径或通配符。

## 4. 首次部署

1. 保存环境变量，选择 **Manual Deploy → Deploy latest commit**。
2. 确认实例类型仍是 **Free**，没有添加 Disk、数据库或付费升级。
3. 等日志出现 `WarmSip service ready` 且状态为 **Live**。
4. 从服务页顶部复制实际 HTTPS 地址，例如 `https://warmsip-api-xxxx.onrender.com`。

日志只应出现启动信息。如果出现访问令牌、AI Key 或请求正文，立即停止部署并删除日志来源，不要继续公开。

## 5. HTTPS 验收

以下命令只验证公开健康状态，不发送令牌：

```powershell
Invoke-RestMethod https://warmsip-api-xxxx.onrender.com/healthz
```

预期结果：

```json
{
  "ok": true,
  "version": "0.2.0-beta.2"
}
```

访问令牌保留在本机环境变量中，不粘贴到终端历史：

```powershell
$headers = @{ Authorization = "Bearer $env:WARMSIP_ACCESS_TOKEN" }
Invoke-RestMethod https://warmsip-api-xxxx.onrender.com/api/v1/capabilities -Headers $headers
```

基础服务预期返回 `ai`、`places`、`weather`、`map` 全为 `false`。这表示服务端在线，但 AI、高德或天气尚未配置。未携带令牌访问该接口应返回 401。

## 6. WarmSip 设置

打开 **我的 → 在线服务**：

- 服务地址只填 `https://warmsip-api-xxxx.onrender.com`。
- 不要附加 `/api/v1`、查询参数或末尾路径。
- 服务访问令牌填写 Render 中同一个随机令牌。
- 点击 **保存并检查连接**。

客户端先调用公开 `/healthz`，最多等待 90 秒，再携带令牌调用 `/api/v1/capabilities`。成功时显示基础服务已连接，并明确列出未配置的外部能力。失败时不会写入“连接成功”结果。

## 7. 冷启动验收

1. 完成首次连接。
2. 静置超过 15 分钟。
3. 再点击一次“保存并检查连接”。
4. 客户端应显示“正在唤醒免费服务”；约一分钟后应成功。
5. 在 Render Logs 中确认实例重启，但服务 URL 和 `SERVICE_ACCESS_TOKEN` 仍有效。

基础服务跨冷启动可用，不代表运行时 AI 凭证仍在。任何保存在 `/app/data` 的 AI 连接和用量都属于临时状态。

## 8. 常见错误

| 状态 | 含义与处理 |
| --- | --- |
| 唤醒超时 | Render 冷启动超过 90 秒；查看 Render Logs，稍后重试 |
| 401 | Render 的 `SERVICE_ACCESS_TOKEN` 与客户端输入不一致 |
| 403 | 客户端 Origin 不在 `ALLOWED_ORIGINS`，添加精确 Origin |
| 502/503 | 服务正在启动、崩溃或上游未配置 |
| 健康检查失败但业务 401 | `/healthz` 不应鉴权，检查反向代理路径 |
| AI 设置待配置 | 基础部署的正常状态；外部 AI 尚未启用 |
| AI 连接重启后消失 | Render Free 使用临时文件系统，零付费阶段预期行为 |

## 9. 后续启用外部服务

地图和天气可以先把 `AMAP_WEB_SERVICE_KEY`、`AMAP_JS_KEY`、`AMAP_SECURITY_CODE` 作为 Render Secret 配置，再重新部署。必须先确认高德账号的免费额度和计费政策。

单 Provider 无状态 AI 可以使用服务端 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 配置。多 Provider 的管理、OAuth、任务路由和用量若要求跨实例重启持久保存，需要另行设计安全的外部持久存储或付费 Persistent Disk；本零付费阶段不添加。

## 10. 完成标记

Render Free 只有在以下证据全部实际取得后，才能标记为“已联调”：

- Render 实例为 Free 且状态 `Live`
- 公网 `/healthz` 返回 200
- 无令牌能力查询返回 401
- 带令牌能力查询返回 200 且外部能力为 false
- WarmSip 设置页连接成功
- 冷启动后再次连接成功
- Render 日志不含令牌或请求正文
- GitHub 仓库可见性未改变，没有付费资源或健康检查路由
