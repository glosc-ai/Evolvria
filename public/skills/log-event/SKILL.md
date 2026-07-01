---
name: log-event
title: 记录日志
description: 记录一次 AI/skill 调用日志，只保存摘要和脱敏 raw_response。
runtime_context: 可使用当前 SavePayload
---

# 记录日志

记录 AI 调用或 skill 执行结果，供调试、费用估算和回放使用。

使用规则：

- `summary` 写简洁中文摘要。
- `status` 只能是 `ok` 或 `error`。
- `usage` 记录 input/output/total tokens；未知时使用 0。
- 不得记录 Glosc token、Authorization header、完整私密提示词或其它敏感字段。
- `raw` 只在必要时保存，程序会做脱敏。

输出是更新后的 `SavePayload`。
