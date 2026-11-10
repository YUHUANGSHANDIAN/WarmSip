# 0.2.0-beta.5 发布说明与证据清单

`v0.2.0-beta.3` 与 `v0.2.0-beta.4` 的 Android 模拟器门禁均失败，对应 Tag 与失败 Draft 保留且不可移动；修复 `/places/new` 路由误匹配后，以新的 PR、主分支门禁和同一提交创建 `v0.2.0-beta.5`。不得覆盖任何已有标签与资产。

`v0.2.0-beta.5` 已作为公开预发布完成。六平台构建均来自提交 `396551d73995a9c641c80d380a0097ce5cbbdc09`；21 个 Release 资产经统一 SHA256 清单下载回验后公开。

每个平台单独记录：配置、编译、签名、安装启动、核心流程验证和上传。GitHub Actions 的平台矩阵使用 `fail-fast: false`，一个平台失败不会掩盖其他平台的结果。发布资产必须带 `SHA256SUMS`，并在上传前执行校验。

当前门禁包括 ESLint、TypeScript、48 项 Vitest、16 项 Playwright 运行、服务端和 Web/PWA 生产构建、生产依赖审计、客户端包边界检查、Docker 健康与鉴权、Tauri、Capacitor 和 ArkWeb 配置。高德、天气、AI 真实推理、签名、公证和 HarmonyOS HAP 必须依据实际凭证与设备日志填写；模拟测试不得写成已联调。

## 工具链与目录

Node 24.22.2、Rust 1.99.0、Gradle 8.14.3、Android Java 21 / compile SDK 36 / min SDK 24。npm 依赖和 Rust crates 分别由 package-lock.json 和 Cargo.lock 固定。CI 为 Ubuntu 24.04、Windows 2025、macOS 15 arm64 与 Intel 的独立任务。

Windows 开发目录、项目缓存和验证安装目录均位于本机项目专属位置，公开文档不记录个人绝对路径。Tauri 使用 `useLocalToolsDir`，将 NSIS 等工具放在项目构建缓存中。不要批量删除目录；需干净构建时把已有生成目录改名归档后再构建。

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run server:build
npm run test:e2e
npm run check:bundle
npm run audit:prod
npx tauri build --ci --bundles nsis
# Linux: --bundles appimage,deb；macOS: --target <架构>-apple-darwin --bundles dmg
npm run android:sync
# Windows 用 android\gradlew.bat；其他系统：
bash android/gradlew -p android assembleDebug --no-daemon
node scripts/package.mjs web
node scripts/checksums.mjs --out=artifacts/web/SHA256SUMS-web artifacts/web
node scripts/checksums.mjs --verify --out=artifacts/web/SHA256SUMS-web
```

Linux 需要 WebKitGTK 4.1、GTK3、libappindicator3、librsvg、patchelf；AppImage 另依赖系统的 AppImage/FUSE 支持（或解包运行）。macOS 最低系统配置为 12.0，实际可用版本以各架构运行验证为准。Windows 需要 WebView2；安装包按当前用户安装。未配置发行证书的产物仅用于预发布测试。

发布工作流先调用核心质量工作流，再独立编译全部平台。标签必须指向 `main` 历史中的版本匹配提交。工作流只创建或复用 Draft 预发布；任一平台失败或资产缺失都会阻止上传、汇总与公开。只有发布准备、上传和汇总任务拥有最小必要写权限，构建任务只有读取权限。每个平台的打包脚本核实真实文件数量后生成版本化文件名、提交 SHA 与元数据；上传前再次校验 SHA256，汇总任务下载全部资产后再次校验统一清单。维护者在完成本机 Windows 安装验收后，才可手工把 Draft 改为公开预发布。

AI 服务需要单独的安全配置。`SERVICE_ACCESS_TOKEN` 和 `AI_CREDENTIAL_ENCRYPTION_KEY` 不得写入构建产物；Docker 部署挂载持久化数据卷。没有真实服务商凭证或部署环境时，发布资产仍可包含完整服务端，但 AI/地图/天气在线状态必须标为“未联调”。

Android 模拟器脚本安装 debug APK，创建地图、地点和照片，强制停止后核验照片和故事恢复，再通过系统 Back 返回地图详情，保存 UI 截图和设备信息。脚本同时要求原生窗口焦点；已知 Quickstep 系统弹窗恢复会留证，应用自身异常不会被忽略。Linux 的安装与进程存活、macOS 的签名与进程存活检查只属于启动冒烟验证，不代替原生文件/定位/分享的核心流程验证。
