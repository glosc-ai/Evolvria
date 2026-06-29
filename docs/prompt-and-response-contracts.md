# Prompt 与响应契约

## 目标

所有 AI 调用必须有明确目的、固定上下文结构和可校验响应。客户端不能依赖自由文本猜测状态变化。

## 通用 Prompt 结构

```text
SYSTEM
- 你是 Evolvria 的叙事与世界模拟引擎。
- 必须遵守已确认世界状态。
- 不得覆盖玩家明确设定。
- 必须返回合法 JSON。
- 不要输出 JSON 以外的内容。

WORLD_STATE
- 世界摘要
- 世界规则
- 当前时间

SCENE_STATE
- 当前地点
- 当前角色
- 当前冲突

MEMORY_CONTEXT
- 最近事件
- 相关长期记忆
- 相关角色摘要
- 相关地点摘要

USER_ACTION
- 玩家输入或系统模拟目标

OUTPUT_SCHEMA
- 本次请求必须返回的 JSON schema 说明
```

## 通用响应字段

所有响应至少包含：

```json
{
  "narrative": "",
  "time_delta_minutes": 0,
  "events": [],
  "character_updates": [],
  "location_updates": [],
  "relationship_updates": [],
  "memory_writes": [],
  "suggested_actions": [],
  "warnings": []
}
```

## world_expand

用途：根据玩家初始设定扩写世界。

必须返回：

- 世界规则。
- 势力。
- 地点。
- 关键角色补全。
- 初始事件。
- 开局地点。
- 初始可选行动。

禁止：

- 改名或删除玩家已创建角色。
- 改变玩家明确设定的性格、身份和关系。
- 生成与内容偏好冲突的核心设定。

## player_action

用途：处理玩家行动。

必须返回：

- 行动结果叙事。
- 时间推进。
- 角色状态变化。
- 地点状态变化。
- 新事件。
- 可选行动。

如果玩家行动不合理，AI 应给出受阻结果，而不是假装成功。

## npc_simulation

用途：在玩家视野外推进 NPC 行动。

必须返回：

- 简短事件描述。
- 参与角色。
- 发生地点。
- 是否玩家已知。
- 重要度。
- 对角色、关系、地点的影响。

低重要度事件可以没有长叙事。

## memory_extract

用途：从叙事和状态变更中抽取记忆。

必须返回：

```json
{
  "facts": [],
  "memories": [],
  "unresolved_threads": [],
  "contradictions": []
}
```

记忆必须标注 owner、importance、confidence 和 tags。

## summary_update

用途：压缩长时间线。

必须返回：

- 世界阶段摘要。
- 每个关键角色摘要。
- 每个重要地点摘要。
- 未解决悬念。
- 后续应继续保持的一致性约束。

摘要不能引入新事实，只能概括已有事件。

## 校验规则

客户端在应用响应前必须校验：

- JSON 可解析。
- 必要字段存在。
- ID 引用有效。
- 时间推进非负。
- 角色位置不冲突。
- 更新不覆盖玩家锁定字段。
- 事件参与者和地点存在。

校验失败时：

- 不应用状态变更。
- 保存原始响应到失败日志。
- 提示玩家重试。
- 可附加“修复 JSON”请求，但仍需再次校验。

## 状态变更格式

建议使用显式 patch：

```json
{
  "target_type": "character",
  "target_id": "char_001",
  "op": "set",
  "path": "current_location_id",
  "value": "loc_002",
  "reason": "角色离开黑石镇前往旧矿道"
}
```

支持操作：

- `set`
- `append`
- `remove`
- `increment`
- `link`
- `unlink`

MVP 可先只实现 `set` 和 `append`。

