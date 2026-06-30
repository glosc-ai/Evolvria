# AI 记忆系统

## 目标

Evolvria 不能把聊天上下文当作唯一记忆。当前实现会把事件、记忆、线索进度和世界摘要结构化保存在 `SavePayload` 中，并在玩家行动前检索相关内容给 AI 或本地 mock 使用。

## 当前已实现

- 初始世界创建时写入一条世界级 opening memory。
- 玩家行动成功后，根据 AI/mock 返回的 `memory_writes` 写入 `mem_*`。
- 每次玩家行动会推进最多两个 open thread 的进度。
- `retrieveMemories` 使用关键词、地点 ID、参与角色 ID 和重要度加权，默认取前 8 条。
- `buildAiContext` 会传入当前世界、当前地点、同行角色、附近地点、最近 8 个事件和检索记忆。
- `validatePatch` 防止 AI 覆盖角色名、已知地点描述/坐标和世界当前时间。

## 记忆类型

当前 schema 支持：

- `scope = world`：世界设定、阶段状态、全局事件。
- `scope = character`：角色亲历事件、关系印象、秘密相关事实。
- `scope = location`：地点状态、地点历史、控制势力变化。
- `scope = thread` 或其他字符串：后续可用于线索、任务和系统摘要。

`owner_id` 指向对应世界、角色、地点或线程。

## 记忆字段

```json
{
  "id": "mem_002",
  "scope": "character",
  "owner_id": "char_001",
  "text": "璃安记得主角发现徽记线索。",
  "facts": ["徽记与白塔遗迹残墙符号吻合"],
  "event_id": "evt_002",
  "importance": 0.7,
  "confidence": 1,
  "tags": ["relationship", "clue"],
  "created_world_time": {
    "day": 1,
    "hour": 8
  }
}
```

当前没有 `last_used_at` 字段；如需加入必须升级 schema 或提供兼容默认值。

## 写入原则

AI 或 mock 返回后可以写入：

- 新事实。
- 状态变化。
- 关系变化。
- 重要承诺。
- 未解决悬念。
- 玩家明确表达的偏好。

不应写入：

- 无意义寒暄。
- 重复描述。
- 未确认的猜测，除非标注为传闻、怀疑或角色主观看法。

## 检索策略

当前检索逻辑：

1. 将玩家行动按逗号、空格等拆成关键词。
2. 合并当前地点 ID 与参与角色 ID。
3. 以 `importance` 为基础分。
4. 如果 memory text 或 facts 命中关键词，每次命中加权。
5. 按分数排序并取前 N 条。

后续可扩展：

- tag 索引。
- 每个角色/地点独立摘要。
- embedding 向量检索。
- token budget 感知的上下文裁剪。

## 摘要策略

当前 `World` 已有 `phase_summaries` 和 `summary_event_cursor` 字段，但尚未实现自动摘要任务。

后续摘要触发建议：

- 每 20 到 30 个事件生成世界阶段摘要。
- 角色和地点可在重要事件后更新局部摘要。
- 摘要只概括已有事件，不能引入新事实。
- 原始 timeline 和 memories 不删除，摘要只用于降低 AI 上下文长度。

## 冲突处理

冲突优先级：

1. 玩家明确设定。
2. 结构化世界规则。
3. 已确认事件历史。
4. 角色和地点记忆。
5. AI 新生成内容。

当前自动防护范围：

- 角色 `name` 不能被 patch。
- 已知地点 `description` 和 `position` 不能被 patch。
- 世界 `current_time` 不能被 patch。
- 事件引用不存在的角色/地点会出现在一致性检查中。

后续需要补齐：

- AI 修复重试。
- 记忆冲突标注。
- 对“角色不知道未公开秘密”的上下文过滤。
