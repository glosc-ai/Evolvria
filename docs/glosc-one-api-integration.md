# Glosc One API 集成

## 目标

Evolvria 客户端免费，AI 能力通过 Glosc One 付费使用。客户端需要提供可靠、可解释、可恢复的 AI 调用体验。

## 配置项

设置页至少包含：

- Glosc One 服务地址。
- 用户凭据或访问令牌。
- 默认模型。
- 请求超时时间。
- 是否允许自动重试。
- 每次调用前是否确认。

敏感信息必须保存到平台安全存储；如果暂时只能保存在本地文件，需要明确标记风险并避免上传。

## 请求类型

- `world_expand`：初始世界扩写。
- `player_action`：玩家行动结果。
- `npc_simulation`：NPC 自主事件。
- `memory_extract`：从叙事中抽取事实和记忆。
- `summary_update`：阶段摘要更新。
- `consistency_check`：冲突检查。

## 通用请求结构

```json
{
  "request_id": "ai_req_001",
  "purpose": "player_action",
  "model": "deepseek/deepseek-v4-pro",
  "messages": [],
  "response_format": "json",
  "metadata": {
    "world_id": "world_001",
    "schema_version": 1
  }
}
```

## 通用响应结构

```json
{
  "request_id": "ai_req_001",
  "status": "ok",
  "content": {},
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cost": null
  }
}
```

## 错误处理

必须覆盖：

- 网络不可用。
- 超时。
- 认证失败。
- 余额不足。
- 限流。
- 服务端错误。
- 响应不是合法 JSON。
- 内容安全拦截。

错误后策略：

- 不修改世界状态。
- 保存失败日志。
- 允许玩家重试。
- 对可能重复提交的请求使用 `request_id` 去重。

## 用量展示

每次 AI 调用后记录：

- 请求类型。
- 时间。
- 模型。
- token 或计费单位。
- 估算费用。
- 是否成功。

UI 应提供最近调用记录和本次操作消耗提示。

## 本地降级

AI 不可用时允许：

- 查看历史。
- 查看地图。
- 编辑角色备注。
- 管理存档。

不允许：

- 生成新剧情。
- 推进需要 AI 判断的关键事件。
- 覆盖世界观。
