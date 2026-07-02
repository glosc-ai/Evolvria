# 平台发布

## 目标

定义 Evolvria 使用 Tauri 2 发布到 macOS、Windows、Linux，并预留 iOS/Android 的要求、差异、签名、更新和发布检查清单。

## 范围

- 桌面 MVP：macOS、Windows，Linux Beta。
- 移动预留：iOS、Android。
- 构建、签名、自动更新、应用数据目录、权限、验收。
- 不包含应用商店文案和截图制作。

## 发布阶段

| 阶段 | 平台 | 目标 |
| --- | --- | --- |
| Dev Preview | macOS | 本机开发、快速验证 |
| MVP Alpha | macOS + Windows | 核心流程验收 |
| MVP Beta | macOS + Windows + Linux | 安装包、导入导出、基本稳定性 |
| Release | macOS + Windows | 签名、公证、自动更新 |
| Mobile Beta | iOS + Android | Tauri mobile 验证 |

## macOS

要求：

- Apple Developer ID 签名。
- 公证。
- Keychain 存储 API key。
- 应用数据目录使用系统标准路径。
- 检查 Gatekeeper、首次启动和更新。

注意：

- 如果开启 App Sandbox，需要评估文件导入导出、外部编辑器和 asset protocol。
- Apple Silicon 和 Intel 构建可单独发布或 universal。
- 自动更新签名密钥必须离线保护。

验收：

- DMG 安装后首次启动成功。
- 导入/导出 zip 可选择路径。
- Keychain 保存/读取 provider key。
- 断网启动可使用 mock。

## Windows

要求：

- WebView2 runtime 检查。
- 代码签名证书。
- NSIS/MSI 安装包。
- Windows Defender 误报检查。
- 路径长度和非 ASCII 用户名测试。

注意：

- API key 走 Windows Credential Manager 或安全存储方案。
- 文件路径分隔符统一通过 Rust `PathBuf`。
- 导出 zip 不应使用保留文件名。

验收：

- 新装机器启动成功。
- 默认数据目录可写。
- 导入导出中文路径成功。
- 卸载不误删用户 workspace，除非用户明确选择。

## Linux

要求：

- AppImage/deb/rpm 视发行策略选择。
- WebKitGTK 依赖说明。
- 文件选择器差异测试。
- 桌面入口和图标。

注意：

- 不同发行版依赖差异大，Linux 先作为 Beta。
- secret storage 可能不可用，需要 fallback 和提示。

验收：

- Ubuntu LTS 通过核心流程。
- 无 secret storage 时 provider key fallback 行为清晰。
- 文件权限错误可解释。

## iOS

移动阶段要求：

- Tauri mobile 项目配置。
- Apple Developer 证书、Provisioning Profile。
- Keychain。
- 文件导入通过系统 Document Picker 或 Share Sheet。
- App Store 审核：UGC、成人内容、AI 内容、用户举报、屏蔽和隐私政策。

注意：

- 本地文件系统受限，workspace 导入导出流程要移动端重设计。
- 成人内容和 UGC 如果启用，需要严格审核和屏蔽机制。

## Android

移动阶段要求：

- Android signing key。
- Keystore 存储 provider key。
- Storage Access Framework。
- WebView 差异测试。
- Google Play 政策：UGC、AI、成人内容、数据安全表单。

注意：

- 大型媒体包导入导出需要进度和取消。
- 后台任务和网络限制与桌面不同。

## 自动更新

桌面 Release 使用 Tauri updater：

- 更新 manifest 使用 HTTPS。
- 更新包签名。
- 灰度发布。
- 回滚策略。
- 更新前自动备份 workspace schema。

移动端走应用商店更新，不使用桌面 updater。

## 版本策略

- App version：semver。
- Schema version：独立 semver。
- Content package version：每个 Storyline 自有版本。
- AI prompt contract version：用于调试和回放。

发布前必须检查 app version 与 schema migration 是否匹配。

## 发布清单

- 构建通过：typecheck、unit、Rust tests、Playwright smoke。
- 权限审查：capabilities、CSP、插件。
- 安全：密钥不进入日志和导出包。
- 数据：旧 schema 可迁移，新建 workspace 可保存。
- UI：桌面和移动宽度无明显重叠。
- 离线：mock provider 可用。
- 安装包：签名、公证或安装器签名。
- 更新：从上一版本更新并保留数据。
- 法务：隐私、Terms、第三方 license。

## 关键决策

- macOS 是首要开发平台，Windows 是 MVP 必测平台，Linux 后置 Beta。
- iOS/Android 不阻塞 MVP，但数据模型和 UI 不做移动端死路。
- 自动更新只在桌面 Release 后启用。
- 用户数据目录和安装目录严格分离。

## 验收标准

- macOS 和 Windows 安装包能启动、聊天、保存、导入导出。
- 更新不会破坏 workspace，并能在失败时恢复。
- 平台差异有明确 fallback。
- 发布包不包含开发密钥、测试内容或竞品素材。
