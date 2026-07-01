---
name: log-event
description: "记录一次 AI 或 skill 调用日志，只保存摘要、状态、token 用量和脱敏 raw_response。用于调试、费用估算、回放和错误追踪。"
---

# 记录日志

记录 AI 调用或 skill 执行结果，供调试、费用估算和回放使用。调用上下文已经绑定 payload 时，调用 tool 可以不传 payload。

## 记录规则

- `purpose` 使用当前请求类型或明确的内部任务名。
- `summary` 写简洁中文摘要，说明调用做了什么和结果如何。
- `status` 只能是 `ok` 或 `error`。
- `usage` 记录 input、output 和 total tokens；未知时使用 0。
- `raw` 只在排障必要时保存，且程序会继续脱敏。

## 隐私边界

- 不得记录 Glosc token、Authorization header、完整私密提示词、用户密钥或系统路径。
- 不要把完整 `workspace_context`、完整 `state/payload.json` 或大段原始响应塞进摘要。
- 错误日志描述原因即可，避免泄露敏感输入。

输出是更新后的 `SavePayload`。

## 执行方法

AI SDK tool 入参：

```json
{
  "purpose": "player_action",
  "status": "ok",
  "summary": "已解析玩家调查公告板徽记的行动，并写入一条线索事件。",
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 420
  },
  "raw": ""
}
```

若状态是 `error`，`summary` 写错误类别和恢复动作，不写密钥、完整 prompt 或完整 payload。
