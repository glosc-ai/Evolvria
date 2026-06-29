# 技术架构

## 总体架构

MVP 采用本地优先架构：

- Godot 跨平台客户端负责 UI、输入、地图、存档、状态展示和本地模拟。
- AI 编排层负责构造 Prompt、调用 Glosc One、解析响应和错误处理。
- 世界状态层负责结构化保存角色、地点、事件、记忆和时间线。
- 可选后端在后续阶段提供账号、云同步、计费查询和内容审核。

## 模块划分

```text
Godot Client
  UI Layer
  Platform Adapter
  Input Action Layer
  Game Flow Controller
  World State Store
  Simulation Engine
  Memory Engine
  AI Orchestrator
  Save Manager
  Glosc One Client
```

## 数据流

玩家行动：

1. UI 收集玩家输入。
2. Game Flow Controller 创建行动请求。
3. Memory Engine 检索相关记忆。
4. AI Orchestrator 拼装上下文。
5. Glosc One Client 发送请求。
6. AI Orchestrator 校验并解析响应。
7. World State Store 应用状态变更。
8. Save Manager 写入存档。
9. UI 展示叙事、选项和状态变化。

时间推进：

1. Simulation Engine 找到需要行动的 NPC。
2. 根据性格、目标、位置生成候选行动。
3. 对重要行动调用 AI 生成事件。
4. 将结果写入时间线和角色记忆。

## 客户端优先原则

MVP 不应依赖自建服务器才能启动游戏。必须支持：

- 本地新建世界。
- 本地保存与读取。
- 离线查看历史和角色资料。
- 网络不可用时继续查看已有内容。
- 桌面端、移动端、平板端使用同一套存档结构。

需要 AI 的动作在离线时进入阻塞或降级状态。

## 平台适配原则

平台差异应集中在 UI、输入、文件选择和安全存储层，不应影响世界模拟和 AI 编排逻辑。

- 桌面端：键盘鼠标、窗口缩放、文件夹导入导出、调试日志查看。
- 移动端：触控、软键盘、系统分享、应用沙盒、低内存约束。
- 平板端：触控加可选键鼠、横竖屏、多栏布局、分屏窗口。

业务层只处理统一动作，例如提交行动、打开地图、缩放地图、添加标记和取消 AI 请求。

## AI 响应格式

AI 结果必须要求返回可解析 JSON。自然语言正文也放入 JSON 字段。

示例：

```json
{
  "narrative": "玩家看到城门外聚集着焦急的人群。",
  "time_delta_minutes": 30,
  "location_updates": [],
  "character_updates": [],
  "relationship_updates": [],
  "new_events": [],
  "memory_writes": [],
  "suggested_actions": []
}
```

客户端必须处理：

- JSON 解析失败。
- 字段缺失。
- 内容与现有状态冲突。
- 请求超时。
- 余额不足。

## 本地持久化

推荐使用 Godot 的 `user://` 目录保存 JSON 或 SQLite。MVP 可先使用 JSON 文件，数据量增长后迁移 SQLite。

文件建议：

- `world.json`
- `characters.json`
- `locations.json`
- `timeline.jsonl`
- `memories.jsonl`
- `settings.json`

## 扩展后端

未来后端可提供：

- 账号系统。
- 云存档。
- Glosc One 余额查询代理。
- 模型调用代理。
- 内容安全审计。
- 共享世界模板。

后端加入前，客户端接口应保留可替换边界。
