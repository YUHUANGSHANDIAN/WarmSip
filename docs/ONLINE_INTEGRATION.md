# 在线服务真实联调

WarmSip 0.2.0-beta.4 把 DeepSeek、高德 Web 服务与高德 JS API 分成独立能力。配置存在只表示服务端可尝试调用；只有真实请求返回验证过的数据后才能标记为“联调成功”。

## 能力矩阵

| 能力                | 环境变量                                | 客户端可见数据                           | 真实成功标准                                                 |
| ------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| DeepSeek 选礼与文案 | `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` | Provider、模型、流事件、usage、软预算    | `/api/v1/ai/stream` 返回 start、结构化 result、usage 和 done |
| 高德 POI            | `AMAP_WEB_SERVICE_KEY`                  | POI ID、名称、地址、城市、GCJ-02 坐标    | `status=1` 且返回非空地点                                    |
| 高德地理编码        | `AMAP_WEB_SERVICE_KEY`                  | 地址、城市和坐标                         | `status=1` 且坐标有效                                        |
| 高德实时天气        | `AMAP_WEB_SERVICE_KEY`                  | adcode、天气、温度、reporttime、缓存状态 | `status=1` 且天气数组非空                                    |
| 高德交互底图        | `AMAP_JS_KEY`、`AMAP_SECURITY_CODE`     | JS Key 与签名代理地址                    | JS SDK 加载、地图瓦片/代理请求成功                           |

Web 服务 Key 不能代替 JS API Key。JS Key 可以在限制来源后下发；安全密钥只留在服务端代理。评分、价格、营业状态和距离只在提供方实际返回时展示。

## 环境配置

```dotenv
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_API_KEY=仅由用户填写
AMAP_WEB_SERVICE_KEY=仅由用户填写
AMAP_JS_KEY=按来源限制配置
AMAP_SECURITY_CODE=仅由用户填写
```

DeepSeek 密钥只进入服务端进程内存。Render Free 重启后会重新从环境变量读取；不会从客户端、备份或日志恢复。`AI_MODEL` 只能是 `deepseek-flash` 或 `deepseek-v4-pro`，前者是默认低成本选择。

## 受控联调

用户在本机安全设置：

```powershell
$env:WARMSIP_BASE_URL = "https://实际服务地址"
$env:WARMSIP_ACCESS_TOKEN = "与 Render 一致的服务访问令牌"
npm run live:check -- --confirm-live
```

默认只发起一次 DeepSeek 业务流请求，并执行北京、上海 POI、详情、正/逆地理编码和一次天气查询。需要验证取消体验时，用户明确添加 `--cancel-check`；这会多一次可能计费的短 AI 请求。证据写入 `artifacts/live-validation-*.json`，不包含 Key、完整 Prompt 或生成正文。

## 错误状态

- `INVALID_CREDENTIAL`：DeepSeek 认证失败。
- `INSUFFICIENT_BALANCE`：DeepSeek 余额或额度不足，不自动重试。
- `RATE_LIMITED` / `AI_CONCURRENCY_LIMITED`：上游限流或同时有两个 AI 请求。
- `UPSTREAM_TIMEOUT`：生成超过服务端等待上限。
- `AMAP_INVALID_KEY`、`AMAP_QUOTA_EXCEEDED`、`AMAP_RATE_LIMITED`：高德 Key、配额或频率问题。
- `AMAP_CITY_NOT_FOUND`、`AMAP_WEATHER_EMPTY`：城市或天气没有结果。
- `NOT_CONFIGURED`：对应提供方尚未配置。

地图 SDK 或网络失败时，私人地图、照片、地点编辑、列表和已保存快照继续可用。
