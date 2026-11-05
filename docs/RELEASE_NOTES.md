WarmSip 0.2.0-beta.1 预发布：暖纸手帐设计升级、收礼人档案、AI 选礼 2.0、暖心文案、暖迹地图灵感、城市导览、足迹故事、扩展心意状态、时间胶囊照片和私人暖迹地图。

在线 AI 使用 pi AI 1.5.0 的可配置单租户服务，支持加密 BYOK、OpenRouter OAuth 和私有兼容端点；凭证不会进入客户端包或备份。默认数据仅在本机，分享默认排除私人字段。

下载需要此私有仓库权限。Windows 包未做 Authenticode 签名；macOS 为 ad-hoc 测试签名且未公证；Android 为 debug 签名。HarmonyOS 工具链与签名缺失，没有 HAP。各平台资产独立生成，未出现的资产表示对应构建尚未成功，不代表已发布。

下载后请核验 `SHA256SUMS`。每个平台附构建提交与状态 JSON；安装/启动和核心流程证据见同标签的 Actions 日志及 `docs/VALIDATION.md`。没有生产凭证时，AI、高德、天气真实在线均未联调；模拟 Provider 测试不能替代真实服务。
