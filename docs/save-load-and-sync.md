# 存档与同步

## 目标

存档必须可靠、可恢复、可导出，并在桌面、移动和平板共享同一 `SavePayload` schema v1。当前 MVP 只实现本地存档；云同步保留接口和文档规划。

## 当前存档结构

Tauri 桌面端应用数据目录：

```text
app_data_dir/
  settings.json
  saves/
    active_world.json
    backups/
      active_world_YYYYMMDD_HHMMSSmmm.json
      ai_before_request.json
    maps/
      map_001.png
  exports/
    world_id_YYYYMMDD_HHMMSS.zip
```

浏览器开发环境使用 `localStorage`：

```text
evolvria.settings
evolvria.active_world
evolvria.backups
evolvria.ai_checkpoint
```

## 写入策略

- `saveWorld` 会先校验 `schema_version = 1` 和必要数组字段。
- Tauri 端保存 active 世界前，如果已有 active 文件，会创建最多 5 个滚动备份。
- Tauri 端写入使用临时文件和原子替换。
- 玩家行动调用 AI 前会保存一次 `ai_before_request.json`。
- AI 响应应用成功后会保存新的 active 世界。
- 浏览器 fallback 保存前也保留最近 5 个 JSON 备份。

## 存档条目

`listSaveEntries` 返回：

```json
{
  "kind": "active",
  "path": "app_data_dir/saves/active_world.json",
  "absolute_path": "app_data_dir/saves/active_world.json",
  "world_name": "苍星纪元",
  "event_count": 2,
  "schema_valid": true,
  "created_at": "2026-06-30T00:00:00.000Z"
}
```

`kind` 支持 `active`、`backup`、`ai_checkpoint`。

## 删除

Tauri `delete_save_entry` 只允许删除应用存档目录内的 active 存档、AI checkpoint 或备份 JSON。浏览器 fallback 删除对应 `localStorage` 条目。删除 active 存档后，当前内存世界会清空并刷新列表。

## 导出

Tauri `export_world` 会先打开系统保存面板，由用户选择保存位置，然后生成 zip：

```text
manifest.json
payload.json
```

`manifest.json` 示例：

```json
{
  "schema_version": 1,
  "world_id": "world_001",
  "display_name": "苍星纪元",
  "exported_at": "2026-06-30T00:00:00Z",
  "files": {
    "payload": "payload.json"
  }
}
```

浏览器 fallback 优先使用浏览器保存面板写出 JSON；不支持时退回下载 JSON，不生成 zip。

## 导入

当前 UI 支持从 JSON 文本导入 `SavePayload`：

1. 用户在存档页粘贴 JSON。
2. `importWorldFromText` 解析 JSON。
3. 校验 schema v1。
4. 保存为 active 世界。

Tauri native 已实现 `import_world(source_path)`，可读取 zip 中的 `payload.json` 并保存 active 世界；当前 Vue UI 尚未接入文件选择入口。

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

桌面端可 reveal path；移动端后续应使用系统分享面板。无论平台文件 API 如何变化，`payload.json` 结构必须保持一致。

## 云同步预留

未来云同步需要新增：

- 用户账号。
- 存档版本号或 revision。
- 最后修改时间。
- 设备 ID。
- 冲突副本策略。

默认冲突策略应保留两个副本，不自动合并时间线。
