# 技术架构

## 总体架构

Evolvria 当前是本地优先客户端：

- Vue 3 负责 UI、路由、响应式布局和交互。
- Pinia store 负责连接 UI、设置、平台能力、AI、存档和世界状态。
- `src/domain/world.ts` 负责纯世界状态转换，不直接调用网络或文件系统。
- `src/services/*` 负责 Tauri invoke 包装、AI、存档、设置和通用文本/ID 工具。
- `src-tauri/src/lib.rs` 负责应用数据目录、原子写入、备份、zip 导出/导入、地图图片处理、平台能力和 Glosc One HTTP 调用。

MVP 不依赖自建后端。配置 Glosc One 后可调用远端模型；未配置时使用本地 deterministic mock。

## 目录职责

```text
src/types/domain.ts       schema v1 类型定义
src/domain/world.ts       世界创建、patch 校验、行动应用、地图标注、记忆检索、一致性检查
src/domain/fixtures.ts    默认 seed、mock 地点/势力、mock 玩家行动
src/services/ai.ts        用量估算、Glosc 配置判断、世界扩写、玩家行动解析
src/services/save.ts      active 存档、备份、AI checkpoint、导入导出 browser fallback
src/services/settings.ts  默认设置、本机 token 风险确认、设置读写
src/services/tauri.ts     Tauri runtime 判断和 safeInvoke
src/stores/world.ts       主世界 store，编排 AI、domain transition 和持久化
src/stores/settings.ts    设置 store
src/stores/platform.ts    平台能力 store
src/views/*.vue           页面级 UI
src-tauri/src/lib.rs      native 命令
tests/                    Vitest 和 Playwright 测试
```

## 页面路由

当前路由使用 hash history：

- `/` 首页
- `/onboarding` 引导
- `/new-world` 新建世界
- `/exploration` 探索
- `/map` 地图
- `/locations` 地点
- `/characters` 人物
- `/timeline` 时间线
- `/threads` 线索
- `/world-lore` 世界观
- `/saves` 存档
- `/settings` 设置

## 玩家行动数据流

1. `ExplorationView` 提交自由输入或推荐行动。
2. `worldStore.submitPlayerAction` 在 AI 请求前调用 `saveAiCheckpoint`。
3. `buildAiContext` 组装当前世界、当前地点、同行角色、附近地点、相关记忆和最近 8 个事件。
4. `resolvePlayerAction` 调用 Glosc One；未配置或远端响应不可用时返回本地 mock。
5. `applyPlayerAction` 创建时间线事件，推进世界时间，应用 state patch、关系变化和记忆写入。
6. `recordAiLog` 写入用量与摘要。
7. `saveWorld` 持久化 active 存档并刷新存档列表。

## 世界创建数据流

1. `NewWorldView` 收集 `WorldSeed`。
2. `estimateUsage` 生成用量和风险提示。
3. `generateWorld` 调用 Glosc One 或本地扩写摘要。
4. `createInitialPayload` 生成 schema v1 世界、角色、地点、势力、地图、开局事件、初始记忆、初始线索和推荐行动。
5. `recordAiLog` 记录 `world_expand`。
6. 持久化后进入探索页。

注意：当前远端 `world_expand` 的自然语言 summary 不会直接反向解析成完整结构化世界；结构化初始世界由本地域逻辑生成。

## Tauri native 命令

当前注册命令：

- `get_platform_capabilities`
- `load_settings`
- `save_settings`
- `load_active_world`
- `save_world`
- `save_ai_checkpoint`
- `list_save_entries`
- `export_world`
- `import_world`
- `import_map_image`
- `generate_fantasy_map`
- `generate_map_from_reference`
- `call_glosc`
- `check_glosc_connection`
- `reveal_or_share_path`

并非所有 native 命令都有 Vue UI 入口。地图图片导入/生成和连接测试命令属于已实现 native 能力，仍需接入 UI。

## 存储策略

桌面 Tauri：

- 设置：`app_data_dir/settings.json`
- active 世界：`app_data_dir/saves/active_world.json`
- 备份：`app_data_dir/saves/backups/active_world_*.json`
- AI checkpoint：`app_data_dir/saves/backups/ai_before_request.json`
- 导出：系统保存面板选择的 `*.zip`，默认目录为 `app_data_dir/exports/`
- 地图图片：`app_data_dir/saves/maps/map_001.png`

浏览器开发环境：

- 设置：`localStorage.evolvria.settings`
- active 世界：`localStorage.evolvria.active_world`
- 备份：`localStorage.evolvria.backups`
- AI checkpoint：`localStorage.evolvria.ai_checkpoint`
- 导出：浏览器保存面板写出 JSON；不支持时触发 JSON 下载

## 状态不变量

- AI 请求必须有本地 fallback 或优雅降级。
- AI 响应必须是可解析 JSON，状态修改必须先校验。
- patch 不得覆盖角色名、已知地点描述/坐标、世界当前时间。
- save payload 必须保持 schema v1，变更时需要迁移方案。
- Glosc token 不得进入日志。
- 桌面和移动共享同一存档 schema；平台差异只存在于 native 命令和 UI 适配。

## 扩展后端

后续后端可提供账号、云同步、余额查询代理、模型代理、内容安全审计和共享世界模板。加入后端前，客户端仍必须能离线启动并查看已有世界。
