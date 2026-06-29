# Godot 客户端架构

## 目标

Godot 客户端需要支撑桌面端、移动端和平板端体验，同时提供本地存档、AI 等待态、地图展示和长期世界状态。结构应保持简单，避免在早期把叙事、模拟和 UI 混在同一个场景脚本里。

## 推荐目录

```text
res://
  scenes/
    boot/
    main_menu/
    world_create/
    game/
    map/
    journal/
    settings/
  scripts/
    autoload/
    ai/
    models/
    platform/
    simulation/
    memory/
    save/
    ui/
  resources/
    themes/
    templates/
  assets/
    icons/
    maps/
```

## Autoload

建议的 Autoload：

- `AppState`：当前页面、当前世界 ID、全局错误。
- `WorldStore`：角色、地点、事件、时间线和世界观状态。
- `SaveManager`：读写、备份、迁移。
- `AIService`：请求队列、重试、取消、响应解析。
- `PlatformService`：平台识别、窗口尺寸、文件选择、安全存储能力。
- `InputRouter`：键盘、鼠标、触控和外接输入统一映射。
- `SettingsStore`：Glosc One 配置、语言、显示设置。

Autoload 不应直接控制复杂 UI。UI 通过信号订阅状态变化。

## 主要场景

- `BootScene`：加载设置和最后存档。
- `MainMenuScene`：新建、继续、设置。
- `WorldCreateScene`：创建世界和角色。
- `GameScene`：探索主界面。
- `MapScene`：地图导入、地点标注、移动。
- `JournalScene`：角色、地点、事件历史、记忆摘要。
- `SettingsScene`：Glosc One、数据管理、内容偏好。

## 信号建议

- `world_loaded(world_id)`
- `world_updated(change_set)`
- `ai_request_started(request_id)`
- `ai_request_finished(request_id, result)`
- `ai_request_failed(request_id, error)`
- `event_added(event_id)`
- `time_advanced(new_time)`
- `save_completed(world_id)`

## UI 状态

AI 调用期间必须展示：

- 正在处理的动作。
- 取消或返回按钮。
- 超时后的重试入口。
- 失败原因。

不要在请求期间冻结整个应用。玩家应仍可查看角色、地图和历史。

## 跨平台布局

- 小屏使用单栏布局，底部导航切换探索、地图、人物、时间线和设置。
- 中屏使用双栏布局，主叙事和上下文面板并列。
- 大屏使用三栏布局，导航、主叙事和上下文面板同时可见。
- 窗口尺寸变化时根据宽度切换布局，而不是只根据设备类型切换。

## 平台约束

桌面端：

- 键盘鼠标是主要输入。
- 支持窗口化、全屏和宽屏布局。
- 地图缩放支持滚轮和快捷按钮。
- 可提供更完整的调试日志和文件导入导出入口。

移动端：

- 文本输入要适配软键盘。
- 推荐行动按钮需要适合触控。
- 长文本叙事需要滚动和字号设置。
- 地图缩放、拖动和标注要支持双指触控。
- AI 响应较长时应分段展示，避免单屏信息过载。

平板端：

- 横屏优先使用多栏布局。
- 竖屏可使用两栏或单栏布局。
- 支持触控、外接键盘和鼠标。
- 地图和详情面板应能并列查看。

## 代码原则

- UI 脚本只做展示和用户输入转发。
- 世界状态修改必须通过 `WorldStore` 或明确的领域服务。
- AI 原始响应必须保存到调试日志，但不要直接作为唯一游戏状态。
- 存档写入应在每次重要状态变更后自动触发。
