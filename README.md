# WarmSip · 给 TA 点一杯温暖

![WarmSip 原创品牌](assets/brand/exports/readme-banner.png)

WarmSip 0.1.0 是无需注册的本地关怀记录应用：保存收礼人档案、选礼灵感、心意清单和时间胶囊，在「暖迹地图」中留下想去、去过、想送与已送的地点。记录与照片保存在本机；AI、高德地点、底图与天气需要自行配置服务端。

**预发布状态：** 本地业务可用；真实在线服务尚未联调。各系统的编译、签名、安装和核心功能验证分开记录，详见 [验收记录](docs/VALIDATION.md)。HarmonyOS 暂无可安装 HAP。私有仓库的源码及 Release 下载均需要仓库权限。

[预发布下载](https://github.com/YUHUANGSHANDIAN/WarmSip/releases/tag/v0.1.0) · [CI](https://github.com/YUHUANGSHANDIAN/WarmSip/actions) · [变更记录](docs/CHANGELOG.md) · [构建发布](docs/RELEASE.md)

[桌面首页截图](docs/screenshots/home-desktop.png) · [移动深色主题](docs/screenshots/home-mobile-dark.png) · [移动暖迹地图](docs/screenshots/map-mobile.png)

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

将 `.env.example` 复制为 `.env`，填写访问令牌、允许的客户端来源及需要启用的提供方配置，然后运行 `npm run server:dev`。也可使用 `docker compose up -d --build`，通过 HTTPS 反向代理访问 `127.0.0.1:8787`。服务端监听网络接口时要求至少 24 字符的访问令牌。

在应用「我的 → 在线服务」填写 HTTPS 服务地址和访问令牌，点击连接检查。访问令牌仅保留在当前会话，重启后需重新填写；上游 AI/高德密钥只放服务端。AI 建议中的商家信息不能代替 POI；真实地点从高德服务查询，不编造价格、评分或营业状态。

## 数据与隐私

- 支持多张私人地图、照片压缩去除位置元数据、地点与心意/胶囊关联、回收站恢复、即时撤销。
- 分享先预览，默认排除照片、精确坐标、私人备注和收礼人。完整 ZIP 备份包含私人数据，请妥善保管。
- ZIP 导入先校验和预览，再通过事务提交；旧版五个 `lg_warm_*_v1` 键的 JSON 导入见 [迁移说明](docs/MIGRATION.md)。
- 时间胶囊按指定 IANA 时区的开启日零点开放。它是本地纪念功能，不提供防篡改加密锁定。
- 本轮不包含支付、配送、公开社交、云同步、多人协作或 iOS。

## 平台与工程

| 目标 | 实现与产物 |
| --- | --- |
| Windows x64 | Tauri 2，NSIS EXE，未配置 Authenticode |
| Linux x64 | Tauri 2，Ubuntu 24.04 构建 AppImage / DEB |
| macOS arm64 / x64 | 两个独立 Runner，DMG，ad-hoc 测试签名，无公证 |
| Android | Capacitor 8，API 24+，debug APK；正式签名未配置 |
| Web / PWA | 生产静态 ZIP；应用壳离线缓存，不缓存地图资源 |
| HarmonyOS | ArkWeb 适配原型，需官方模板、SDK、原生桥和签名后完成 HAP 验证 |

`src/` 为 React 业务、`shared/` 为领域校验、`server/` 为 Fastify 服务、`src-tauri/` 与 `android/` 为原生工程。参考附件保留在开发目录并从版本控制排除；源码和杯子/爱心蒸汽/定位品牌均重新编写绘制。

[地图技术说明](docs/MAP_TECHNICAL.md) · [品牌规范](docs/BRAND.md) · [HarmonyOS 阻塞与接入](harmony/README.md)

许可证：[MIT](LICENSE)。
