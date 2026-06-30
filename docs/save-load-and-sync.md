# 存档与同步

## 目标

存档必须可靠、可恢复、可导出，并在桌面、移动和平板共享同一 `SavePayload` schema v1。当前 MVP 只实现本地存档；云同步保留接口和文档规划。

当前存档采用 OpenClaw workspace 风格：一个世界是一整个文件夹，`AGENTS.md` 是入口说明，其他记忆、设定、地图、角色故事、历史事件和地点文档按需加载。完整机器状态仍保存在 `state/payload.json`，用于校验、导入和兼容现有 domain 逻辑。

## 当前存档结构

Tauri 桌面端应用数据目录：

```text
app_data_dir/
  settings.json
  saves/
    active_world/
      AGENTS.md
      manifest.json
      state/
        payload.json
      world/
        OVERVIEW.md
        RULES.md
      memory/
        MEMORY.md
      maps/
        MAP.md
        map_001.png
      characters/
        char_hero.md
        char_001.md
      locations/
        loc_start.md
      history/
        TIMELINE.md
      threads/
        THREADS.md
    backups/
      active_world_YYYYMMDD_HHMMSSmmm/
        AGENTS.md
        state/payload.json
        ...
      ai_before_request/
        AGENTS.md
        state/payload.json
        ...
  exports/
    world_id_YYYYMMDD_HHMMSS.zip
```

浏览器开发环境使用 `localStorage`：

```text
evolvria.settings
evolvria.active_world
evolvria.active_workspace
evolvria.backups
evolvria.ai_checkpoint
evolvria.ai_checkpoint_workspace
```

浏览器 fallback 不能直接写文件夹，因此 `evolvria.active_workspace` 保存 `{ workspace_format, files: [{ path, content }] }` 的虚拟工作区包，同时保留 `evolvria.active_world` 作为快速加载兼容。

## 写入策略

- `saveWorld` 会先校验 `schema_version = 1` 和必要数组字段。
- Tauri 端保存 active 世界前，如果已有 active 工作区，会创建最多 5 个滚动备份。
- Tauri 端 `state/payload.json`、`AGENTS.md` 和 Markdown 文档写入使用临时文件和原子替换；整个工作区不是单事务，但 `state/payload.json` 始终是权威机器状态。
- 玩家行动调用 AI 前会保存一次 `backups/ai_before_request/` checkpoint 工作区。
- AI 响应应用成功后会保存新的 active 世界。
- 旧版 `saves/active_world.json` 和 `backups/*.json` 仍可读取；下一次保存会迁移为文件夹工作区。
- 浏览器 fallback 保存前也保留最近 5 个 JSON 备份，并写入虚拟工作区包。

## 工作区文件

`AGENTS.md` 每次作为世界程序的入口说明使用，负责声明加载顺序、固定规则、上下文预算策略和文件索引。AI 请求不会默认塞入整个 `state/payload.json`；探索行动只加载 `AGENTS.md`、世界/规则摘要、长期记忆、地图索引、当前地点、参与角色、开放线索和历史索引。

标准文件：

- `AGENTS.md`：入口说明和按需加载策略。
- `manifest.json`：工作区格式、schema、世界名、文件映射。
- `state/payload.json`：完整 `SavePayload`，导入、校验、恢复的权威数据。
- `world/OVERVIEW.md`、`world/RULES.md`：世界设定和规则。
- `memory/MEMORY.md`：长期记忆和重要事实。
- `maps/MAP.md`：地图、路线、地点入口。
- `characters/*.md`：角色故事、目标、关系、笔记。
- `locations/*.md`：地图地点、状态、连接、事件。
- `history/TIMELINE.md`：历史事件。
- `threads/THREADS.md`：开放线索和任务。

## 存档条目

`listSaveEntries` 返回：

```json
{
  "kind": "active",
  "path": "app_data_dir/saves/active_world",
  "absolute_path": "app_data_dir/saves/active_world",
  "world_name": "苍星纪元",
  "event_count": 2,
  "schema_valid": true,
  "created_at": "2026-06-30T00:00:00.000Z"
}
```

`kind` 支持 `active`、`backup`、`ai_checkpoint`。`path` 可以是新工作区目录，也可以是兼容读取的旧 JSON 文件。

## 删除

Tauri `delete_save_entry` 只允许删除应用存档目录内的 active 工作区、AI checkpoint 工作区、备份工作区或旧版备份 JSON。浏览器 fallback 删除对应 `localStorage` 条目。删除 active 存档后，当前内存世界会清空并刷新列表。

## 导出

Tauri `export_world` 会先打开系统保存面板，由用户选择保存位置，然后生成 zip：

```text
manifest.json
AGENTS.md
state/payload.json
world/OVERVIEW.md
world/RULES.md
memory/MEMORY.md
maps/MAP.md
characters/*.md
locations/*.md
history/TIMELINE.md
threads/THREADS.md
```

`manifest.json` 示例：

```json
{
  "schema_version": 1,
  "world_id": "world_001",
  "display_name": "苍星纪元",
  "exported_at": "2026-06-30T00:00:00Z",
  "files": {
    "instructions": "AGENTS.md",
    "payload": "state/payload.json"
  }
}
```

浏览器 fallback 优先使用浏览器保存面板写出工作区 JSON bundle；不支持时退回下载 JSON bundle，不生成 zip。

## 导入

当前 UI 支持从 JSON 文本导入 `SavePayload` 或浏览器工作区 JSON bundle：

1. 用户在存档页粘贴 JSON。
2. `importWorldFromText` 解析 JSON。
3. 校验 schema v1。
4. 保存为 active 世界。

Tauri native 已实现 `import_world(source_path)`，优先读取 zip 中的 `state/payload.json`，并兼容旧版 `payload.json`，再保存 active 世界；当前 Vue UI 尚未接入文件选择入口。

## 版本迁移

当前只支持 schema v1，没有迁移器。未来 schema 变更必须：

1. 新增 `SCHEMA_VERSION`。
2. 在 TypeScript 和 Rust 两侧实现迁移或兼容加载。
3. 在迁移前保留备份。
4. 更新 `docs/data-model.md`、测试 fixture 和导入校验。

## 跨平台文件处理

当前 `get_platform_capabilities` 返回：

- `os`
- `mobile`
- `can_reveal_directories`
- `can_share_files`
- `can_use_file_picker`
- `app_data_dir`

桌面端可 reveal path；移动端后续应使用系统分享面板。无论平台文件 API 如何变化，`SavePayload` schema v1 必须保持一致。

## 云同步预留

未来云同步需要新增：

- 用户账号。
- 存档版本号或 revision。
- 最后修改时间。
- 设备 ID。
- 冲突副本策略。

默认冲突策略应保留两个副本，不自动合并时间线。
