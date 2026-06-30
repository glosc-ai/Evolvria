# Glosc One API 集成

## 目标

Evolvria 客户端本地优先运行；AI 能力可通过 Glosc One 远端模型增强。未配置 Glosc One 时，游戏仍可用本地 mock 完成创建世界和探索闭环，不消耗远端额度。

## 配置项

设置页当前包含：

- 服务地址，默认 `https://one.gloscai.com`
- 模型，默认 `deepseek/deepseek-v4-pro`
- 访问 Key
- 超时秒数，默认 45 秒
- AI 调用前确认
- 显示用量估算
- 自动保存
- 失败自动重试
- 日志级别：`default`、`debug`、`deep`
- 字体大小
- 内容偏好
- 本机保存 Key 风险确认

保存非空 Key 前必须勾选风险确认。

## 配置判断

`isGloscConfigured(settings)` 要求：

- `glosc_base_url.trim()` 非空。
- `glosc_token.trim()` 非空。

只配置 base URL 不会触发远端调用。

## 调用入口

TypeScript：

- `generateWorld(seed, settings)`
- `resolvePlayerAction(action, context, settings)`
- `estimateUsage(purpose, input, settings)`
- `callAiSdkJson(options)`：使用 AI SDK 调用 OpenAI-compatible Chat Completions，并要求返回 JSON

Tauri：

- `call_glosc(request)`
- `check_glosc_connection(base_url, token, model)`

远端主路径优先使用 AI SDK；如果 AI SDK 直连失败且当前在 Tauri 环境中，会降级到 `call_glosc` 原生命令以保留桌面端可用性。

## HTTP 形态

`base_url` 会转换为 OpenAI-compatible base URL，供 AI SDK 的 OpenAI provider 自动调用聊天接口：

- `https://one.gloscai.com` -> `https://one.gloscai.com/v1`
- `https://one.gloscai.com/v1` -> `https://one.gloscai.com/v1`
- 已以 `/v1/chat/completions` 结尾则回退为 `.../v1`

AI SDK 请求使用 bearer token。Tauri 原生 fallback 仍使用 `User-Agent: Evolvria/0.1 Tauri/2`。

## 用量估算

`estimateUsage` 当前按输入 JSON 字符长度粗估：

- 输入 token：`max(120, ceil(json.length / 2.6))`
- `world_expand` 输出 token：1200
- `player_action` 输出 token：600
- 其他类型输出 token：360

返回字段包括 purpose label、是否启用远端、输入/输出/总 token、费用占位、计费提示、风险等级、风险原因和重试说明。

## 日志记录

每次世界扩写、玩家行动和本地 NPC tick 都会写入 `AIRequestLog`：

- purpose
- prompt hash
- model
- started/finished time
- status
- error
- usage
- summary
- 可选 raw_response

`glosc_token` 不得写入日志。`raw_response` 写入前必须经过脱敏。

## 错误与降级

当前策略：

- 未配置 Glosc One：世界扩写和玩家行动都使用本地 mock。
- 远端 `generateWorld` 失败：使用本地扩写摘要，并在摘要中说明失败原因。
- 远端 `resolvePlayerAction` 响应不可用：使用本地 mock，并附加 warning。
- AI 请求前保存 checkpoint，降低半途失败导致状态丢失的风险。

后续可补齐：

- 自动重试实现。
- 余额不足/限流的专门文案。
- 连接测试 UI。
- 请求取消。
- 更细粒度的内容安全拦截。

## 安全要求

- 不在仓库或源码中硬编码用户 Key。
- 不在日志记录 Authorization、token、cookie。
- 只发送当前场景、近期事件和相关记忆，不发送完整历史。
- 导出存档时提醒 payload 中可能包含玩家生成内容和 AI 日志。
