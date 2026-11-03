# 0.1.0 验收记录

本记录区分实际执行、提供方模拟和未验证项。源码配置存在不等于相应平台已发布。

## 已执行

2026-11-03，Windows 开发机、Chromium 桌面 1440×1000 / Pixel 7 移动视口：

- 33 项 Vitest 领域、事务存储、服务和地图适配测试通过。覆盖城市优先级、请求取消/旧响应、跨年与夏令时胶囊、地图隔离和回收站、配额写失败/回滚、重复与循环关联冲突导入、媒体 ZIP、路径限制、未授权/来源拒绝、上游响应校验、隐私分享和坐标转换失败。
- 12 项 Playwright 流程通过：档案→选礼→心意保存重启、多地图与照片、分享隐私、删除撤销、跨浏览器存储照片 ZIP 恢复、重复导入、胶囊开启、PWA 离线编辑重启、五个主要页面明暗主题 axe WCAG A/AA 与横向溢出检查。修复后的生产包已在 Node 24.22.2 下复验，12 项用时 36.1 秒；发布前由 CI 再验提交本身。
- TypeScript、Web/PWA 与 Fastify 构建已执行。生产依赖审计为 0 个已报告漏洞；开发工具依赖审计单独记录，不使用强制跨主版本升级。

地图测试使用隔离的模拟提供方，只证明适配器行为。移动视口测试不是 Android 真机测试；PWA 离线缓存验证不代表地图可离线加载。

## 发布流水线的证据

CI 重新执行类型、lint、Vitest、构建与 Playwright。平台构建从同一标签提交执行，产物附 `build-<platform>.json` 和 SHA256 清单。Actions 中的执行结果、原生截图与设备信息优先于下表的配置说明。

| 平台 | 配置 | 编译 | 签名 | 安装启动 | 核心功能 | 上传 |
| --- | --- | --- | --- | --- | --- | --- |
| Windows x64 | 已配置 | 本机及 CI 的 Rust release 和 NSIS 已生成 | 未签名 | 已安装至 D:\WarmSip 并启动 WebView2 | 已在安装版创建地图、导入照片，关闭进程后重启恢复；通过系统保存对话框导出 ZIP 并重新导入校验重复跳过 | 预检资产已上传 Actions，等待标签 Release |
| Linux x64 | 已配置 | AppImage、DEB 已编译 | 无发行签名 | Ubuntu 24.04 DEB 安装及 Xvfb 进程存活检查已通过 | 原生交互未验 | 预检资产已上传 Actions，等待标签 Release |
| macOS arm64/x64 | 两架构已配置 | 两架构 DMG 已编译 | ad-hoc 验证通过，无 Developer ID/公证 | DMG 挂载、应用复制安装、签名与进程存活检查均通过 | 原生交互未验 | 预检资产已上传 Actions，等待标签 Release |
| Android | 官方 Capacitor 工程已生成 | debug APK 已编译 | debug | Android 15 x86_64 模拟器已安装启动 | 实际 WebView 创建地图、地点和照片；强制停止后恢复照片/故事；系统 Back 返回地图详情通过 | 预检资产已上传 Actions，等待标签 Release |
| Web/PWA | 已配置 | 已编译 | 不适用 | Chromium 已启动 | 上述 12 项通过 | 待发布 |
| HarmonyOS | 仅 ArkWeb 原型 | 阻塞 | 阻塞 | 未验证 | 未验证 | 无 HAP |

## 尚待联调与人工设备验证

高德 JS/Web 服务标识和安全配置、AI HTTPS 上游/模型/密钥、部署服务地址与访问令牌未提供，真实 POI/地理编码/逆编码、地图 SDK、天气、AI 全部 **未联调**。真实拒绝定位、系统文件选择/分享、返回键的更多设备与场景、键盘安全区、不同系统大字体、实体设备和高密度真实地图性能需按设备继续验收。发布不将模拟测试标为在线测试。

HarmonyOS 缺 DevEco 官方稳定模板、SDK/OHPM/Hvigor 和签名。未伪造版本锁或 HAP。详见相应目录的阻塞清单。

桌面预检：[Actions 41604576830](https://github.com/YUHUANGSHANDIAN/WarmSip/actions/runs/41604576830)，构建提交 `dfc78079b1daae026908a54f7783f3c00d62db1d`，全部四个桌面目标通过。预检不是标签发布；最终下载以 `v0.1.0` Release 的产物和校验清单为准。

Android 预检：[Actions 41624712153](https://github.com/YUHUANGSHANDIAN/WarmSip/actions/runs/41624712153)，构建提交 `cbabc349f6731fe99d15f9b93ef683eea29bd589`，完整门禁和原生步骤通过。设备为 Android 15 x86_64、Pixel 6 模拟器配置、WebView Chrome 124.0.6367.219。系统 Back 由 ADB 发送，原生事件计数从 0 变为 1，路由从地点编辑页返回地图详情，历史索引从 3 变为 2。照片通过真实 WebView 的 file input 注入，未验收系统相册选择器。原始结果见 [android-native.json](android-native.json)，返回后的真实截图见 [android-native.png](screenshots/android-native.png)。

此前模拟器出现 Quickstep 无响应弹窗，CDP 操作仍能在后台继续，导致系统 Back 未到达应用。脚本现同时校验 Android 原生窗口焦点，遇到应用自身异常直接失败；仅能恢复明确识别的 Quickstep 异常并留证。上述成功运行没有触发任何 Quickstep 恢复。Android 清单已显式启用系统返回回调。最终标签构建将重新执行同一原生流程。

Windows 原生验收使用安装后的 `D:\WarmSip\warmsip.exe` 和 WebView2 本机调试连接，操作真实应用 UI、IndexedDB 和系统保存对话框。原生地图截图见 [windows-native.png](screenshots/windows-native.png)。调试端口只在验收启动环境中启用，未写入产品配置。

Windows 外部导航：点击项目链接后原生页面保留，`plugin:opener|open_url` 实际调用成功。文件读取使用原生 WebView 的 file input 验证，未将自动化选文件等同于所有系统文件选择器交互已覆盖。

## 本地规模性能

Windows 10.0.26300，AMD Ryzen 7 4800H，16 逻辑处理器，约 15 GiB 系统识别内存，Chromium 156，生产 Web 构建。通过 ZIP 导入 1 张地图、1,000 个合成地点（四种状态各 250 条，无照片）。单次观测含自动化操作耗时：

| 视口 | 事务导入 | 地点列表就绪 | 状态筛选 |
| --- | ---: | ---: | ---: |
| 桌面 1440×1000 | 320 ms | 943 ms | 393 ms |
| Pixel 7 412px 移动视口 | 228 ms | 914 ms | 381 ms |

两种视口均无横向溢出。原始数据见 `docs/performance.json`。未加载高德 SDK/底图，这些数字仅描述本地列表，不代表真实地图聚合性能或 Android 设备性能。
