# 平台构建与存储策略

WarmSip 的长期策略是：Windows x64 是本机唯一保留安装、运行与原生开发，以及最终人工升级验收的平台；其他平台统一由 GitHub 标准公共仓库 runner 构建、测试和发布。非 Windows 工具链不因“过去用于验证”而继续保留在本机。

| 平台              | 构建与验证                                                            | 本机长期策略                                                          |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Windows x64       | `windows-2025` 标准 runner 生成 NSIS；Release 包下载后在本机安装验收  | 保留 Node、Rust、Visual C++ Build Tools、WebView2 与 Windows 打包工具 |
| Linux x64         | `ubuntu-24.04` 标准 runner 生成 AppImage/DEB，并执行安装与启动冒烟    | 不保留 WSL Ubuntu、Linux Node、Linux Rust target 或预构建发行包       |
| macOS arm64/x64   | 两个标准 macOS runner 分架构生成 DMG，执行挂载、签名和启动检查        | 不安装 macOS 工具链，不长期保留 DMG                                   |
| Android           | `ubuntu-24.04` 标准 runner 生成 debug APK，并在官方模拟器执行核心流程 | 不保留 Android SDK、AVD、Gradle Home 或 JDK 21 专用工具链             |
| Web/PWA 与 Server | `ubuntu-24.04` 标准 runner 构建 ZIP、测试 Docker 鉴权与健康检查       | 不长期保留发布 ZIP、Docker 镜像或 Linux 服务运行环境                  |
| HarmonyOS         | 只有官方 SDK、工具链、签名和可验证 runner 齐全时才生成 HAP            | 不安装专用工具链；未构建时明确标记“未交付”                            |

GitHub-hosted 标准 runner 对 Public 仓库的计算通常免费，但 Larger runner、超出额度的 Artifact/Cache 存储以及账户结算限制可能产生费用或导致任务不启动。工作流只使用标准 runner，临时 Artifact 保留 2 天，长期安装包放入 GitHub Releases。启用任何收费 runner、存储扩容或套餐升级都必须另行明确授权。

发布标签不可移动。Tag、平台构建、Draft Release 和公开预发布必须指向同一已合并提交；任何缺失平台、私有凭证、未脱敏证据或安全审计失败都会阻止公开。
