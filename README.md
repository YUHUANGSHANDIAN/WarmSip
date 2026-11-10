# WarmSip · 给 TA 点一杯温暖

![WarmSip 原创品牌](assets/brand/exports/readme-banner.png)

WarmSip 0.2.0-beta.5 是无需注册的本地关怀记录应用：保存收礼人档案、选礼灵感、心意清单和时间胶囊，在「暖迹地图」中留下想去、去过、想送与已送的地点。记录与照片保存在本机；AI、高德地点、底图与天气通过可配置的 Fastify 服务连接。

**预发布状态：** 本地业务、暖纸手帐设计系统、pi AI 1.5.0 多模型服务、流式选礼、文案、地图灵感、城市导览和足迹故事均已实现。缺少生产凭证时，真实在线服务仍会明确显示“未联调”。HarmonyOS 暂无可安装 HAP。

[发布状态](https://github.com/YUHUANGSHANDIAN/WarmSip/releases) · [CI](https://github.com/YUHUANGSHANDIAN/WarmSip/actions) · [变更记录](docs/CHANGELOG.md) · [构建发布](docs/RELEASE.md) · [平台与存储策略](docs/PLATFORM_POLICY.md) · [Render 免费部署](docs/RENDER_FREE_DEPLOY.md) · [在线联调](docs/ONLINE_INTEGRATION.md)

[桌面首页](docs/screenshots/home-desktop.png) · [移动深色主题](docs/screenshots/home-mobile-dark.png) · [移动暖迹地图](docs/screenshots/map-mobile.png) · [AI 连接中心](docs/screenshots/ai-settings-mobile.png) · [beta.3 Android 地图](docs/screenshots/android-beta3-map.png) · [beta.3 重启恢复](docs/screenshots/android-beta3-restart.png)

## 在本地运行

使用 Node **24.22.2 LTS** 和 npm。依赖版本由 `package-lock.json` 锁定。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。首次使用可直接建立档案、地图、手动地点和胶囊；未连接地图服务时，地点列表、照片、编辑及 ZIP 备份继续可用。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run server:build
npx playwright install chromium
npm run test:e2e
```

## 在线服务

将 `.env.example` 复制为 `.env`，至少生成随机 `SERVICE_ACCESS_TOKEN`。单 Provider DeepSeek 需要同时设置 `AI_BASE_URL=https://api.deepseek.com`、`AI_MODEL=deepseek-flash` 和 `AI_API_KEY`；三者不能只配置一部分。需要从应用配置多 Provider 时再生成 `AI_CREDENTIAL_ENCRYPTION_KEY`，然后运行 `npm run server:dev`。也可使用 Docker，通过 HTTPS 反向代理访问 `127.0.0.1:8787`。文件式 AI 配置需要持久卷。

Render Free 可以通过静态环境变量启用 DeepSeek、高德 POI/地理编码/天气和 JS 底图，不挂载 Persistent Disk。实例休眠重启后环境变量仍存在；运行时模型连接、诊断时间和用量会清空。完整步骤见 [Render Free 部署](docs/RENDER_FREE_DEPLOY.md)。

在应用「我的 → 在线服务」填写 HTTPS 服务地址和访问令牌，点击连接检查，再进入「AI 模型与连接」添加 OpenAI、Anthropic、Google、DeepSeek、OpenRouter、Moonshot、MiniMax 或 OpenAI-compatible 模型。OpenRouter 支持官方 OAuth；其他 OAuth 入口本版不提供。

模型密钥只保存在受令牌保护的单租户服务中，不写入浏览器、IndexedDB、备份或客户端包。服务只能单实例运行，不支持多用户隔离或匿名公网代理。环境变量连接的 DeepSeek 默认使用 `deepseek-flash`，`deepseek-v4-pro` 必须显式选择；失败不会静默跨供应商重试。真实地点必须来自高德 POI，AI 只生成建议和经过校验的查询条件。

## 数据与隐私

- 支持多张私人地图、照片压缩去除位置元数据、地点与心意/胶囊关联、回收站恢复、即时撤销。
- 分享先预览，默认排除照片、精确坐标、私人备注和收礼人。完整 ZIP 备份包含私人数据，请妥善保管。
- ZIP 导入先校验和预览，再通过事务提交；旧版五个 `lg_warm_*_v1` 键的 JSON 导入见 [迁移说明](docs/MIGRATION.md)。
- 时间胶囊按指定 IANA 时区的开启日零点开放。它是本地纪念功能，不提供防篡改加密锁定。
- 过敏、忌口、私人备注和照片分别授权；每次 AI 任务发送前显示字段范围、模型与费用边界。
- AI 用量只保存任务、模型、Token、费用来源和状态，不保存原始提示词或生成正文。
- 本轮不包含支付、配送、公开社交、云同步、多人协作或 iOS。

## 平台与工程

| 目标              | 实现与产物                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| Windows x64       | Tauri 2，`windows-2025` 构建 NSIS EXE；未配置 Authenticode                    |
| Linux x64         | Tauri 2，`ubuntu-24.04` 构建 AppImage / DEB 并启动冒烟                        |
| macOS arm64 / x64 | 两个独立标准 Runner 构建 DMG；ad-hoc 测试签名，无公证                         |
| Android           | Capacitor 8，API 24+，CI 构建 debug APK 并运行模拟器流程；正式签名未配置      |
| Web / PWA         | CI 生成生产静态 ZIP；应用壳离线缓存，不缓存地图资源                           |
| HarmonyOS         | ArkWeb 适配原型，需官方模板、SDK、原生桥和签名后完成 HAP 验证；当前不交付 HAP |

`src/` 为 React 业务、`shared/` 为领域校验、`server/` 为 Fastify 服务、`src-tauri/` 与 `android/` 为原生工程。参考附件保留在开发目录并从版本控制排除；源码和杯子/爱心蒸汽/定位品牌均重新编写绘制。

Windows 是本机唯一保留的安装、运行与原生验收平台；Linux、macOS、Android、Web 和 HarmonyOS 的构建统一使用 GitHub Public 仓库的标准 hosted runner。工作流不使用 Larger runner、付费存储或外部收费云构建。

[AI 架构与安全](docs/AI.md) · [地图技术说明](docs/MAP_TECHNICAL.md) · [品牌规范](docs/BRAND.md) · [平台与存储策略](docs/PLATFORM_POLICY.md) · [HarmonyOS 阻塞与接入](harmony/README.md)

许可证：[MIT](LICENSE)。
