WarmSip 0.2.0-beta.3 预发布：在同一 pi-ai 执行链中接通服务端环境 DeepSeek，完善高德 POI 2.0、地理编码、天气缓存、目标城市和 JS 底图配置；增加真实取消、可核对来源与有限次数真实联调工具。

在线 AI 使用 pi AI 1.5.0 的可配置单租户服务，支持服务端环境 DeepSeek、加密运行时 BYOK、OpenRouter OAuth 和私有兼容端点；凭证不会进入客户端包或备份。Render Free 的静态 DeepSeek 在休眠重启后仍可从环境变量恢复，进程内用量与诊断时间不会持久保存。

下载需要此私有仓库权限。Windows 包未做 Authenticode 签名；macOS 为 ad-hoc 测试签名且未公证；Android 为 debug 签名。HarmonyOS 工具链与签名缺失，没有 HAP。各平台资产独立生成，未出现的资产表示对应构建尚未成功，不代表已发布。

下载后请核验 `SHA256SUMS`。每个平台附构建提交与状态 JSON；安装/启动和核心流程证据见同标签的 Actions 日志及 `docs/VALIDATION.md`。真实 DeepSeek、高德和天气只有在脱敏联调记录通过后才能标记完成；模拟 Provider 测试不能替代真实服务。
