# Render Free 零付费部署

本说明对应 WarmSip `0.2.0-beta.4` 与 `https://github.com/YUHUANGSHANDIAN/WarmSip`。目标是用现有 Fastify Docker 服务获得一个公网 HTTPS 地址，不购买服务器、域名、数据库、Persistent Disk 或付费实例。

## 部署前边界

- Render Free 在无请求后休眠，下一次请求可能需要约一分钟唤醒。不会常驻秒级响应。
- 免费容器文件系统是临时的。基础 URL、环境变量和镜像可恢复，但运行中写入 `/app/data` 的 AI 连接、凭证和用量不保证跨重启保留。
- DeepSeek、高德 Web 服务与 JS 底图凭证通过 Render 环境变量在进程启动时读取，可以在休眠重启后恢复。
- 服务端自身不产生本阶段 Render 实例费用；AI、高德和天气供应商可能独立计费。任何免费额度都以其当前官方政策为准。
- 仓库已公开。Render 应只获得部署所需的只读仓库权限，不配置收费实例或 Persistent Disk。

## 1. 创建免费 Web Service

1. 打开 [Render Dashboard](https://dashboard.render.com/)，使用 GitHub 登录。
2. 只授权 `YUHUANGSHANDIAN/WarmSip`，不要授予无关仓库权限。
3. 选择 **New → Web Service**，连接 `YUHUANGSHANDIAN/WarmSip`。
4. 按以下字段填写。

| Render 字段          | 填写值                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| Name                 | `warmsip-api`，如名称占用可加个人后缀                                     |
| Language / Runtime   | **Docker**                                                                |
| Branch               | `main`                                                                    |
| Root Directory       | 留空                                                                      |
| Dockerfile Path      | `./Dockerfile`                                                            |
| Docker Build Context | 仓库根目录                                                                |
| Instance Type        | **Free**，确认显示 `$0/月`                                                |
| Region               | 优先 **Singapore**；若免费列表没有该区域，选择 Dashboard 提供的最接近区域 |
| Health Check Path    | `/healthz`                                                                |
| Persistent Disk      | 不添加                                                                    |
| Auto-Deploy          | **Off**，首阶段只手动部署已通过 CI 的 `main`                              |
| Build Command        | 留空，Dockerfile 内执行 `npm run server:build`                            |
| Start Command        | 留空，Dockerfile 使用 `node dist-server/server/index.js`                  |

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

| 名称                       | 值                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `HOST`                     | `0.0.0.0`                                                                                                |
| `SERVICE_ACCESS_TOKEN`     | 上一步的随机令牌，选择 Secret                                                                            |
| `ALLOWED_ORIGINS`          | `http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost,https://localhost` |
| `ALLOW_LOCAL_AI_ENDPOINTS` | `false`                                                                                                  |
| `AI_BASE_URL`              | `https://api.deepseek.com`                                                                               |
| `AI_MODEL`                 | `deepseek-flash`；只有明确需要时才改为 `deepseek-v4-pro`                                                 |
| `AI_API_KEY`               | 用户自己的 DeepSeek Key，选择 Secret                                                                     |
| `AMAP_WEB_SERVICE_KEY`     | 高德 Web 服务 Key，选择 Secret                                                                           |
| `AMAP_JS_KEY`              | 高德 Web 端（JS API）Key                                                                                 |
| `AMAP_SECURITY_CODE`       | 与 JS API Key 配套的安全密钥，选择 Secret                                                                |

`AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 必须三项同时填写。不要设置 `AI_CREDENTIAL_ENCRYPTION_KEY`、`AI_DATA_FILE` 或 `AI_DATA_DIR` 来模拟持久化；Render Free 没有持久文件系统。

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
  "version": "0.2.0-beta.4"
}
```

访问令牌保留在本机环境变量中，不粘贴到终端历史：

```powershell
$headers = @{ Authorization = "Bearer $env:WARMSIP_ACCESS_TOKEN" }
Invoke-RestMethod https://warmsip-api-xxxx.onrender.com/api/v1/capabilities -Headers $headers
```

配置全部提供方后预期 `ai`、`places`、`weather`、`map` 为 `true`。`details` 中 `lastSuccessAt` 为 `null` 表示只是配置存在，尚没有真实成功调用。未携带令牌访问该接口应返回 401。

## 6. WarmSip 设置

打开 **我的 → 在线服务**：

- 服务地址只填 `https://warmsip-api-xxxx.onrender.com`。
- 不要附加 `/api/v1`、查询参数或末尾路径。
- 服务访问令牌填写 Render 中同一个随机令牌。
- 点击 **保存并检查连接**。

客户端先调用公开 `/healthz`，最多等待 90 秒，再携带令牌调用 `/api/v1/capabilities`。成功时分别显示 DeepSeek、地点、天气和底图的配置及最近真实调用状态。失败时不会写入“连接成功”结果。

## 7. 冷启动验收

1. 完成首次连接。
2. 静置超过 15 分钟。
3. 再点击一次“保存并检查连接”。
4. 客户端应显示“正在唤醒免费服务”；约一分钟后应成功。
5. 在 Render Logs 中确认实例重启，但服务 URL 和 `SERVICE_ACCESS_TOKEN` 仍有效。

环境变量中的 DeepSeek 与高德 Key 会在冷启动后重新读取。进程内 usage、最近诊断时间和地图代理状态仍会清空；它们不是持久账目。

## 8. 常见错误

| 状态                     | 含义与处理                                               |
| ------------------------ | -------------------------------------------------------- |
| 唤醒超时                 | Render 冷启动超过 90 秒；查看 Render Logs，稍后重试      |
| 401                      | Render 的 `SERVICE_ACCESS_TOKEN` 与客户端输入不一致      |
| 403                      | 客户端 Origin 不在 `ALLOWED_ORIGINS`，添加精确 Origin    |
| 502/503                  | 服务正在启动、崩溃或上游未配置                           |
| 健康检查失败但业务 401   | `/healthz` 不应鉴权，检查反向代理路径                    |
| AI 设置待配置            | 基础部署的正常状态；外部 AI 尚未启用                     |
| 运行时 AI 连接重启后消失 | Render Free 使用临时文件系统；请使用静态 `AI_*` 环境变量 |

## 9. 真实联调

在用户本地终端设置 `WARMSIP_BASE_URL` 与 `WARMSIP_ACCESS_TOKEN` 环境变量，然后运行：

```powershell
npm run live:check -- --confirm-live
```

该脚本只使用假资料，执行一次 DeepSeek 选礼流、北京/上海 POI、地点详情、地理编码、逆地理编码与天气，并把不含 Key、Prompt 或生成正文的脱敏证据写入 `artifacts/`。只有显式添加 `--cancel-check` 才会发起第二次可能计费的短 AI 请求。高德调用会消耗相应账号配额。

多 Provider 运行时管理、OAuth 和持久用量若要跨 Render 重启保存，仍需要另行设计安全外部存储；本零付费阶段不添加。

## 10. 完成标记

Render Free 只有在以下证据全部实际取得后，才能标记为“已联调”：

- Render 实例为 Free 且状态 `Live`
- 公网 `/healthz` 返回 200
- 无令牌能力查询返回 401
- 带令牌能力查询返回 200，配置状态与真实调用状态区分正确
- WarmSip 设置页连接成功
- 冷启动后再次连接成功，环境变量中的 AI/高德能力仍可用
- Render 日志不含令牌或请求正文
- GitHub 仓库可见性未改变，没有付费资源或健康检查路由
