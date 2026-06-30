# 开发路线图

## 当前状态：0.1 MVP 基线

已完成：

- Tauri 2 + Vue 3 + Vue Router + Pinia + Tailwind 基础结构。
- 12 个主要页面和响应式导航。
- 新建世界五步流程。
- schema v1 `SavePayload`。
- 本地初始世界、角色、地点、势力、地图、开局事件、记忆、线索。
- 玩家行动、推荐行动、时间线、记忆写入、关系变化、线索进度。
- 本地 mock fallback。
- Glosc One 调用基础封装。
- Tauri active 存档、备份、AI checkpoint、zip 导出。
- 浏览器 localStorage fallback。
- 地图结构化显示、手动地点和路线。
- Vitest、Playwright 和 Rust 单测基础。

## Phase 1：MVP 收口

目标：让当前本地优先闭环更稳定、更可验证。

- 修正自动保存设置与实际保存行为的关系。
- 为设置页接入 Glosc 连接测试。
- 完善 AI 调用前确认流程。
- 增加删除/清空世界、清空 AI 日志入口。
- 增加恢复 backup/checkpoint 的 UI。
- 增加存档导出前隐私提示。

验收：

- 未配置 Glosc One 时普通玩家可完整游玩 10 轮。
- Glosc 配置错误时不会破坏存档。
- 用户能恢复最近备份或 AI checkpoint。

## Phase 2：远端 AI 契约强化

目标：让远端输出真正参与结构化世界更新。

- 定义严格 JSON schema。
- 为 `world_expand` 接入结构化返回解析。
- 为 `player_action` 增加响应修复/重试。
- 增加更多 patch 操作或收窄 schema。
- 增加 fixture 覆盖远端异常。
- 让 `auto_retry` 设置生效。

验收：

- 远端返回缺字段、非 JSON、冲突 patch 时不会修改世界。
- 正常远端返回可稳定应用到角色、地点、关系、记忆和线索。

## Phase 3：存档与文件 UI

目标：补齐 native 文件能力到 Vue UI。

- 文件选择导入 zip。
- 从 zip 恢复 `payload.json`。
- reveal/share 导出路径。
- 备份列表恢复/删除。
- 大存档加载和损坏文件提示。

验收：

- 桌面端可导入导出 zip。
- 浏览器 fallback 可导入导出 JSON。
- 损坏导入不会覆盖 active 世界。

## Phase 4：地图图片与空间玩法

目标：让地图从 SVG 原型升级为可导入/生成底图。

- 接入 `import_map_image`。
- 接入 `generate_fantasy_map`。
- 接入 `generate_map_from_reference`。
- 使用 `map_image.image_path` 渲染底图。
- 支持拖动地点坐标、编辑/删除标记。
- 显示角色当前位置。
- 将路线和附近地点加入 AI 上下文。

验收：

- 导入地图图片后重进仍可显示。
- 标注、路线和移动影响 AI 上下文。
- 桌面和平板地图交互可用。

## Phase 5：记忆、摘要与一致性

目标：减少长线游玩时的遗忘和冲突。

- 自动阶段摘要。
- 角色/地点摘要。
- tag 或 embedding 检索。
- 更完整的冲突检查。
- “角色未知秘密不可泄露”上下文过滤。
- 一致性问题 UI 提示和修复建议。

验收：

- 30 分钟游玩后 AI 能引用早期关键事件。
- 冲突 patch 被拒绝或安全修复。

## Phase 6：跨平台发布准备

目标：达到公开测试质量。

- Android/iOS Tauri mobile 初始化和打包验证。
- 移动软键盘、底部导航、分享导入导出。
- 平板横竖屏和分屏验收。
- Keychain/Keystore 安全存储。
- 性能优化和隐私清理。

验收：

- 桌面、手机、平板均能完成创建、探索、保存、重进、导入导出。
- 发布包不包含测试 Key 或敏感日志。
