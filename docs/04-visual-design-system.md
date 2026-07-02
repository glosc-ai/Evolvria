# 视觉设计系统

## 目标

建立 Evolvria 自有视觉语言：暗色、沉浸、动漫媒体卡片、可扫描的创作工具，同时避免像素级复刻 ISEKAI ZERO。本文为 Vue/Tailwind/shadcn-vue 实现提供 token、组件和响应式规则。

## 范围

- 色彩、字体、间距、布局、媒体比例、卡片、标签、按钮、图标、动效。
- 桌面、平板、手机布局规则。
- 不定义品牌 Logo 成稿和具体插画资产，资产制作另行立项。

## 品牌方向

Evolvria 的气质是“星图、档案、舞台、命运裁定”。界面应有叙事感，但主界面仍是高频工具，不能做成营销页。视觉上避免复制竞品的蓝紫暗色组合，可使用深海黑、靛蓝、翡翠、琥珀和玫瑰作为多点语义色，让页面不是单一紫蓝。

关键词：

- 沉浸：聊天和 Scene Mode 要让内容占主导。
- 清晰：内容库和创作工具要高密度、可扫描。
- 安全：分级、成本、provider 状态要可见。
- 原创：封面、角色、UI token 全部自有。

## 色彩 Tokens

| Token | Hex | 用途 |
| --- | --- | --- |
| `--bg-base` | `#080A12` | 应用背景 |
| `--bg-elevated` | `#111624` | 面板、侧栏 |
| `--bg-surface` | `#171D2B` | 卡片、输入框 |
| `--border-muted` | `#293044` | 默认边框 |
| `--text-primary` | `#F2F5FA` | 主文本 |
| `--text-secondary` | `#AAB4C5` | 辅助文本 |
| `--text-muted` | `#727E92` | 弱化文本 |
| `--accent-cyan` | `#5BC7D8` | 主动作、链接、Chat 模式 |
| `--accent-emerald` | `#65D6A4` | 安全、成功、SFW |
| `--accent-amber` | `#F3B562` | 成本、警告、M17 |
| `--accent-rose` | `#E66B8A` | 危险、Rejected、错误 |
| `--accent-violet` | `#9B8CFF` | Arc、魔法、稀有状态 |

使用规则：

- 页面大面积背景只使用 `bg-base`、`bg-elevated`、`bg-surface`，不要大面积渐变。
- 强调色最多同时出现 2 到 3 种，且必须有语义。
- 禁止装饰性渐变球、散景 blob、与功能无关的发光背景。
- 所有文本对比度达到 WCAG AA；分级和错误不能只靠颜色表达。

## 字体与排版

- UI 字体：系统 sans，中文优先适配 `PingFang SC`、`Microsoft YaHei`、`Noto Sans CJK SC`。
- 叙事正文：可选 serif 风格，但默认仍使用 sans，避免跨平台字体缺失。
- 字号：
  - 页面标题：24-32px。
  - 面板标题：16-20px。
  - 卡片标题：15-17px。
  - 正文消息：15-16px，行高 1.65。
  - 元信息：12-13px。
- 不使用 viewport width 缩放字体，不使用负 letter spacing。
- 按钮和卡片内文本必须换行或截断，不能溢出。

## 布局系统

桌面：

- Shell：左侧 rail 72px，主内容自适应，右侧 inspector 320-380px 可折叠。
- 最大内容宽度：阅读/聊天 1280px，内容库 1440px，创作表单 1180px。
- 网格：内容卡片 `minmax(220px, 1fr)`，故事详情媒体区 16:9 或 3:2。
- 卡片圆角不超过 8px；工具面板和页面 section 不做卡片套卡片。

平板：

- rail 变窄或折叠，右侧 inspector 变为 sheet。
- 内容库卡片 2 到 3 列。
- 聊天保持消息区优先，角色/Arc 信息收纳到 tabs。

手机：

- 底部导航 5 项以内。
- 详情页媒体在上，CTA sticky bottom。
- 聊天输入固定底部，工具按钮用图标 + tooltip 或 bottom sheet。
- 卡片最小触控目标 44px。

## 组件规范

### App Shell

- 左侧 rail 使用 lucide 图标：Home、Search、BookOpen、PenTool、Save、Settings。
- 当前路由使用左侧高亮条和文字提示，不只靠颜色。
- 顶部栏显示当前 workspace、provider、预算和同步状态。

### Media Card

- 用于故事线、角色、Scenario。
- 固定比例，封面不可改变卡片高度。
- 底部显示标题、两行摘要、标签、分级。
- hover 只改变边框、阴影和轻微 translate，不改变布局尺寸。

### Tags 与 Badges

- 内容标签使用低饱和背景 + 文字。
- 分级 badge 固定语义：SFW 绿色、M17 琥珀、AdultLocked 玫瑰、Rejected 红色。
- 模式 badge：Chat、Scene、Fate、Voice、Image。
- 标签数量超过 4 个时折叠为 `+N`。

### Buttons

- 清晰命令可用文字按钮：Start、Resume、Create、Export。
- 工具动作优先图标按钮：Undo、Redo、Retry、Save、Search、Settings、Download。
- 使用 lucide icons，不手绘常见图标。
- 危险操作使用 rose 色并需要确认。

### Chat UI

- 玩家消息靠右或带 `You` 标记，角色消息靠左，旁白/系统裁定居中或全宽弱化。
- 每条 AI 消息提供 retry、copy、bookmark、branch controls。
- 输入框支持 mode segmented control：Say、Act、Ask、OOC。
- 长消息先保证阅读，不压缩成过窄气泡；桌面消息最大宽度 760px。

### Scene Mode

- 全屏或准全屏，不放入装饰卡片。
- 背景 16:9，立绘层、字幕层、选择层分离。
- 字幕区域不遮挡角色脸部；移动端可折叠历史。
- 所有媒体缺失时显示占位，不出现空白黑屏。

### Creator Studio

- 表单密度高但不拥挤，左侧字段，右侧预览/校验。
- 字段错误紧贴字段，不集中到顶部。
- JSON 或 prompt 高级编辑放在 collapsible 区域。
- 保存状态显式：未保存、保存中、已保存、保存失败。

## 媒体资产规则

- MVP 示例图使用原创生成或自绘占位，不能抓取竞品资产。
- 封面比例：Storyline 16:9，Character 1:1，Scenario 3:2。
- 资产必须有 alt text、来源、版权状态和用途。
- 缩略图由 Rust command 生成，前端使用 asset id，不直接保存绝对路径。

## 动效

- 只在状态变化时使用：页面进入、卡片 hover、消息生成、保存成功、错误提示。
- 默认 120-180ms，Scene Mode 转场可到 240ms。
- 尊重 `prefers-reduced-motion`。
- AI 正在生成时用 subtle typing indicator，不使用大面积闪烁。

## 关键决策

- 暗色沉浸是方向，但色彩必须多语义，避免单一紫蓝主题。
- 工具界面追求扫描效率，聊天/Scene 才追求沉浸。
- 使用 shadcn-vue/reka-ui 的可访问基础组件，视觉 token 自定义。
- 常见工具动作使用 lucide 图标并提供 tooltip。

## 验收标准

- 首页、内容库、详情、聊天、创作页在桌面和 390px 宽度下无文本重叠。
- UI 不使用 ISEKAI ZERO 品牌、图片、Logo、截图或像素级布局。
- 每个交互控件有 hover/focus/disabled/loading/error 状态。
- 卡片、工具栏、输入框有稳定尺寸，动态文本不会推挤布局。
