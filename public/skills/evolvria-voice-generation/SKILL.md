---
name: evolvria-voice-generation
description: Evolvria 内置中文语音与 TTS 工作流，面向 alibaba/qwen3-tts-instruct-flash。用于把对白、旁白或 SceneHint 语音 cue 转为安全的中文语音指令，禁止模仿真人或未授权声音。
---

# Evolvria 中文语音生成

## Overview

使用此 skill 为场景播放准备中文 TTS 输入。语音模型通过 Glosc One 调用 `alibaba/qwen3-tts-instruct-flash`。

## Workflow

1. 读取说话人、文本、语言、语气、节奏和角色语音设定。
2. 默认输出简体中文普通话；除非故事明确指定其他语言，否则把语音文本和指令都保持为中文。
3. 在不改变含义的前提下，缩短或拆分过长文本。
4. 生成关于情绪、语速、音量、停顿和中文读音的语音指令。
5. 拒绝或改写模仿真人、名人、私人个体或未授权参考声音的请求。

## Output Contract

```json
{
  "text": "可直接用于 TTS 的中文台词",
  "voice": "原创角色语音标签",
  "instructions": "中文说明：情绪、语速、停顿、音量和必要的读音提示",
  "language": "zh-CN",
  "speed": 1,
  "licenseNote": "仅使用自有或已授权的参考声音。",
  "safetyFlags": ["none"]
}
```
