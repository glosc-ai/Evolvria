# Tauri 2 技术架构

## 目标

定义 Evolvria 的跨平台技术架构：Vue 前端负责交互、状态和 AI 编排，Rust/Tauri 负责本地文件、媒体、系统能力、权限和安全边界。目标是先交付本地优先 MVP，再平滑演进到 SQLite、移动端和云同步。

## 范围

- Tauri 2 桌面与移动架构，参考 <https://v2.tauri.app/>。
- Vue 3 + Vite + TypeScript + Pinia + Tailwind/shadcn-vue。
- 本地 JSON workspace、媒体资产、导入导出、备份和 AI provider 配置。
- Rust commands、capabilities、插件、平台差异。
- 不定义业务 schema 细节，见 [数据模型](06-data-model.md)。

## 技术栈

| 层           | 选择                                       | 原因                                         |
| ------------ | ------------------------------------------ | -------------------------------------------- |
| App shell    | Tauri 2                                    | 小体积、Rust native commands、桌面和移动路线 |
| Frontend     | Vue 3 + Vite + TypeScript                  | 开发速度、组件化、类型约束                   |
| State        | Pinia                                      | 简洁、适合本地优先 store                     |
| UI           | Tailwind CSS + shadcn-vue/reka-ui + lucide | 可访问基础组件和可定制 token                 |
| Domain       | TypeScript pure modules                    | 便于 Vitest 和前端复用                       |
| Native       | Rust commands                              | 文件、压缩、图片、密钥、路径校验             |
| Storage MVP  | JSON workspace + asset files               | 易调试、可导出、适合早期 schema              |
| Storage Beta | SQLite + asset files                       | 大型内容库和搜索性能                         |
| Tests        | Vitest + Playwright + Rust tests           | 覆盖 domain、UI、command                     |

## 模块结构

```text
src/
  main.ts
  App.vue
  router/
  styles.css
  views/
    HomeView.vue
    LibraryView.vue
    StorylineDetailView.vue
    StartStoryView.vue
    ChatView.vue
    CreatorStudioView.vue
    SavesView.vue
    SettingsView.vue
  components/
    app/
    library/
    chat/
    creator/
    scene/
    ui/
  stores/
    app.ts
    library.ts
    chat.ts
    creator.ts
    settings.ts
  services/
    repositories/
    ai/
    tauri.ts
    media.ts
    sync.ts
  domain/
    ids.ts
    chat-reducer.ts
    summary.ts
    fate-engine.ts
    moderation.ts
  types/
    domain.ts
    dto.ts
src-tauri/
  src/
    lib.rs
    main.rs
    commands/
      workspace.rs
      media.rs
      secrets.rs
      logs.rs
    storage/
    security/
    errors.rs
  capabilities/
    default.json
  tauri.conf.json
```

## 数据流

```text
Vue View
  -> Pinia Action
  -> Service / Repository
  -> Domain reducer
  -> Tauri invoke when native capability is needed
  -> Rust command
  -> Filesystem / OS / Media processing
  -> Structured result
  -> Store update
  -> Autosave checkpoint
```

规则：

- 组件不直接调用 `invoke`，统一通过 `services/tauri.ts` 和 repository。
- 纯业务逻辑放在 `domain/`，保证无 DOM、无 Tauri、无网络依赖。
- Store 保存 UI 状态和已加载实体；持久化由 repository 负责。
- 所有异步操作返回 typed result，不抛出裸字符串。

## Tauri Commands

MVP commands：

| Command                | 输入                         | 输出                 | 说明                                                              |
| ---------------------- | ---------------------------- | -------------------- | ----------------------------------------------------------------- |
| `workspace_list`       | none                         | `WorkspaceMeta[]`    | 列出本地工作区                                                    |
| `workspace_create`     | `CreateWorkspaceInput`       | `WorkspaceMeta`      | 创建 workspace 与初始 `save.json`                                 |
| `workspace_read`       | `workspaceId`                | `SaveEnvelope`       | 读取并校验存档                                                    |
| `workspace_write`      | `workspaceId, envelope`      | `WorkspaceMeta`      | 原子写入存档                                                      |
| `workspace_backup`     | `workspaceId, reason`        | `BackupMeta`         | 创建备份                                                          |
| `workspace_list_backups` | `workspaceId`              | `BackupMeta[]`       | 列出可恢复备份，供 Saves 页面展示                                 |
| `workspace_restore_backup` | `workspaceId, backupId`   | `SaveEnvelope`       | 恢复指定备份，恢复前自动创建 `pre_restore` 备份                    |
| `workspace_export_zip` | `workspaceId, targetPath?`   | `ExportResult`       | 导出 zip                                                          |
| `workspace_import_zip` | `sourcePath`                 | `WorkspaceMeta`      | 导入 zip                                                          |
| `media_import`         | `path, purpose`              | `MediaAsset`         | 复制到 asset 目录并生成 metadata                                  |
| `media_thumbnail`      | `workspaceId, assetId, size` | `MediaVariant`       | 从 workspace 内图片资产生成 `assets/images/variants/*.png` 缩略图 |
| `secret_set`           | `key, value`                 | `SecretWriteResult`  | 优先保存 provider key 到系统 Keychain                             |
| `secret_get`           | `key`                        | `string?`            | 读取 provider key                                                 |
| `secret_delete`        | `key`                        | `SecretDeleteResult` | 清除 Keychain、显式 fallback 文件和旧版迁移文件中的 provider key  |
| `log_export`           | none                         | `ExportResult`       | 导出诊断日志                                                      |

Beta commands：

| Command                   | 说明                            |
| ------------------------- | ------------------------------- |
| `sqlite_migrate`          | 从 JSON workspace 迁移到 SQLite |
| `scene_render_snapshot`   | Scene Mode 预览图导出           |
| `media_transcode_preview` | 视频封面、音频波形、语音预览    |
| `sync_pull` / `sync_push` | 云端同步                        |
| `content_package_verify`  | 云端发布前打包校验              |

## Command 错误模型

Rust command 统一返回：

```ts
type CommandError = {
  code:
    | "not_found"
    | "invalid_input"
    | "schema_mismatch"
    | "io"
    | "permission_denied"
    | "path_traversal"
    | "zip_invalid"
    | "secret_unavailable"
    | "unknown";
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
};
```

前端只展示本地化 message，不暴露绝对路径和密钥。日志可包含路径哈希和 request id，便于诊断。

## 存储策略

MVP 目录：

```text
app-data/
  workspaces/
    {workspaceId}/
      save.json
      manifest.json
      backups/
        2026-07-02T10-20-30Z_before-ai.zip
      assets/
        images/
        audio/
        video/
      logs/
```

写入规则：

- `workspace_write` 先写临时文件，再 `rename` 原子替换。
- 每次 AI 请求前创建轻量 checkpoint；每 N 次或关键操作创建 zip 备份。
- 导入 zip 必须检查 schema version、路径穿越、资产 MIME、文件大小和重复 ID。
- `save.json` 只存 metadata 和相对 asset path，不存绝对路径。

SQLite 迁移条件：

- 单个 workspace 超过 10k message 或 2k entity。
- 搜索和筛选出现明显卡顿。
- 需要全文检索、关系查询或同步冲突字段级合并。

迁移原则：资产仍在文件系统，SQLite 只存结构化 metadata；迁移前自动备份，失败回滚。

## 前端架构规则

- `views/` 负责页面布局和路由参数。
- `components/` 只接收 props/emit，不直接读写持久化。
- `stores/` 封装用户动作，如 `sendMessage`、`retryLast`、`saveDraft`。
- `services/ai/` 封装 provider：`mock`、`openaiCompatible`、`cloudProxy`。
- `domain/chat-reducer.ts` 负责把 AI response 合并为 `Message`、`Event`、`RelationshipDelta`。
- 所有 long-running 操作都有 abort/cancel 和 loading state。

## AI 网关

Provider 类型：

| Provider            | 阶段  | 说明                                               |
| ------------------- | ----- | -------------------------------------------------- |
| `mock`              | MVP   | 本地 deterministic response，用于无 key 演示和测试 |
| `openai-compatible` | MVP   | 用户提供 base URL、API key、model                  |
| `local-http`        | Beta  | 本机 Ollama/LM Studio 等 OpenAI-compatible 端点    |
| `cloud-proxy`       | Cloud | Evolvria 服务端代理、计费、审核、限流              |

请求流程：

1. 组装 `NarrativeRequest`。
2. 执行内容安全预检查。
3. 估算 token 和成本，检查预算上限。
4. 调用 provider。
5. 校验结构化响应。
6. 写入临时 result。
7. reducer 合并并 autosave。

## Tauri 权限与安全

依据 Tauri 2 capabilities / permissions 模型：

- 默认 capability 只开放必要 commands。
- 不开放任意 shell、任意 fs、任意 HTTP 给前端。
- 文件选择器只能返回用户选择路径，Rust 端仍需验证。
- CSP 禁止未知脚本，远端媒体域名必须 allowlist。
- 开发模式和生产模式使用不同 allowlist。
- API key 优先走系统 Keychain/Keystore；读取时支持显式环境变量。Keychain 不可用时默认拒绝保存，只有设置 `EVOLVRIA_ALLOW_INSECURE_SECRET_FILE=1` 才允许 `secrets.insecure.json` 文件 fallback，并在 UI 中显示风险。设置页必须提供清除按钮，调用 `secret_delete` 同时删除 Keychain、显式 fallback 和旧迁移文件；若环境变量仍存在，UI 要提示它仍会覆盖保存的 key。

建议插件：

| 插件                   | 用途                   | 阶段    |
| ---------------------- | ---------------------- | ------- |
| `tauri-plugin-dialog`  | 文件选择、导入导出路径 | MVP     |
| `tauri-plugin-fs`      | 受控文件访问           | MVP     |
| `tauri-plugin-opener`  | 打开外部链接           | MVP     |
| `tauri-plugin-store`   | 小型设置缓存           | MVP     |
| `tauri-plugin-sql`     | SQLite                 | Beta    |
| `tauri-plugin-updater` | 桌面自动更新           | Release |

## 平台边界

| 平台    | MVP 状态     | 注意事项                                       |
| ------- | ------------ | ---------------------------------------------- |
| macOS   | 主开发和首发 | 签名、公证、Keychain、App Sandbox 评估         |
| Windows | MVP 验收     | WebView2、路径长度、安装器签名                 |
| Linux   | Beta 验收    | WebKitGTK 依赖、文件选择器差异                 |
| iOS     | 架构预留     | Tauri mobile、Keychain、审核政策、文件导入限制 |
| Android | 架构预留     | Keystore、存储权限、分享导入、WebView 差异     |

## 关键决策

- MVP 不需要云端即可完整运行。
- 前端不处理绝对路径，统一使用 asset id 和 Tauri asset protocol。
- 业务 reducer 可测试，native command 可测试，UI 流程可 Playwright 验收。
- Command 权限最小化，capability 文件必须随功能审查。

## 验收标准

- `yarn test` 覆盖 domain、repository fallback、AI mock。
- Rust command 有读写、导入、恶意 zip、路径校验测试。
- Playwright 跑通首页到第一轮聊天、保存、重进。
- `src-tauri/capabilities/default.json` 没有开放不必要权限。
- 断网、无 API key、provider 超时都能降级到可解释状态。
