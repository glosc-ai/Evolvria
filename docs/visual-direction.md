# 视觉设计方向

本文档记录当前 Vue/Tailwind 客户端的视觉实现。权威样式位于 `src/styles.css` 和各 `src/views/*.vue`。旧版 Godot/GDScript 视觉说明已废弃。

## 风格定位

当前界面是深色、克制、偏工具化的叙事世界管理体验：强调长文本可读性、状态扫描、地图/人物/时间线之间的快速切换，以及 AI 调用状态的明确反馈。

主视觉关键词：

- 深色本地控制台。
- 低饱和背景。
- Emerald 作为主行动和当前状态强调。
- 面板透明分层，避免厚重装饰。
- 中文长文本优先可读。

## 全局基础

定义于 `src/styles.css`：

```css
:root {
  color-scheme: dark;
  font-family: "Noto Sans CJK SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #101615;
  color: #eef3ef;
}
```

背景使用深绿色黑底叠加轻微径向暖色光，不作为独立装饰元素。

## 字体

- 正文：Noto Sans CJK SC，来自 `public/assets/fonts/NotoSansCJKsc-Regular.otf`。
- 备用：系统 sans-serif。
- 项目中也包含 Noto Serif CJK SC 文件，但当前 CSS 未启用标题衬线。
- 字号通过 Tailwind utility 控制；设置中的 `font_size` 已进入数据模型，当前还未全局联动 CSS。

## 组件 token

通用 class：

- `.e-btn`：圆角 6px、半透明白色背景、白色文字、hover 提亮、禁用态降低不透明度。
- `.e-btn-primary`：emerald 边框和背景，用于主要行动。
- `.e-btn-danger`：red 边框和背景，用于重置等危险动作。
- `.e-field`：暗色输入框，focus 使用 emerald 边框。
- `.e-panel`：圆角 8px、白色 10% 边框、半透明浅色背景。
- `.e-muted`：白色 58% 次级文字。

## 布局

- 桌面 `lg` 以上使用固定左侧导航，主内容区从 `lg:ml-64` 开始。
- 移动端使用顶部栏、抽屉导航和底部 5 项导航。
- 页面内容主要由 `e-panel`、grid 和 responsive column 组成。
- `safe-top` 和 `safe-bottom` 使用 safe-area inset 适配移动设备刘海/底部手势区。

## 当前页面视觉

- 首页：左侧品牌/主行动，右侧当前世界状态面板。
- 新建世界：分步表单 + 预览侧栏。
- 探索：主叙事区、推荐行动、输入框、右侧当前地点/最近事件/同行角色。
- 地图：SVG 地形、地区色块、路线线段、地点点位、右侧地点详情和创世锁定状态。
- 存档：条目卡片展示 kind、路径、事件数量和 schema 状态。
- 设置：分组面板管理 Glosc One、行为、日志、字体和内容偏好。

## 调色参考

当前主要颜色来自 CSS/Tailwind：

- 页面底：`#101615`
- 侧栏：`#111817`
- 移动顶栏：`#101615`
- 地图底：`#18201e`
- 地图渐变：`#264b45`、`#5f6942`、`#2e5867`
- 主强调：Tailwind emerald 系列。
- 危险：Tailwind red 系列。
- 警告：Tailwind amber 系列。

## 设计约束

- 新 UI 应优先复用 `.e-btn`、`.e-field`、`.e-panel`、`.e-muted`。
- 不把复杂说明文案塞进游戏主流程；功能入口应靠控件和状态表达。
- 长文本区域应限制行宽和行距，避免整屏满宽阅读。
- 移动端底部导航最多保留高频入口；其他入口放在抽屉或首页。
- 新增主题、字体缩放或浅色模式时，需要同步 `Settings` 字段、CSS 和本文件。
