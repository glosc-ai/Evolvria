# 视觉设计方向（Visual Direction）

本文档记录 Evolvria 客户端的视觉风格与设计 token。视觉实现集中在 `scripts/ui/app.gd` 顶部的颜色常量与控件工厂函数（`_style`/`_button`/`_label`/`_panel` 等），本文件是其设计意图的权威说明。修改视觉风格时请同步本文件。

## 风格定位

**奇幻羊皮纸 / 古籍感**。温暖的旧羊皮纸底色、墨褐文字、衬线标题、铜金/赭色强调，营造「世界之书 / 史诗卷轴」的氛围，契合 AI 驱动的开放世界叙事/世界模拟玩法。整体偏暖、书卷、沉浸，强调长文本可读性与中文排版。

当前仅提供**单一主题**（不区分明暗模式）。

## 调色板（设计 token）

语义常量定义于 `scripts/ui/app.gd`（L3–15）。修改请改这些常量，全局生效。

| 常量 | 值 | 用途 |
|------|------|------|
| `BG` | `#e8dcc0` | 主背景 - 旧羊皮纸 |
| `BG_ALT` | `#ddcfa8` | 侧栏 / 导航 - 略深羊皮纸 |
| `SURFACE` | `#f4ecd8` | 卡片 / 输入框 - 浅羊皮纸（比底色亮，纸面感）；亦用作赭底上的浅字色 |
| `SURFACE_ALT` | `#ece0c4` | hover 态 - 介于 BG 与 SURFACE 之间 |
| `FG` | `#2b2118` | 主文字 - 墨褐 |
| `MUTED` | `#6f5d45` | 次文字 / 说明 - 淡墨 |
| `BORDER` | `#b9a47e` | 边框 - 浅褐 |
| `ACCENT` | `#8a5a2b` | 主强调 / primary 按钮 - 铜金 / 赭 |
| `ACCENT_DIM` | `#6f461f` | pressed 态 - 暗赭 |
| `SUCCESS` | `#5a7d3c` | 成功 - 苔绿 |
| `DANGER` | `#a33b2e` | 危险 - 朱砂 |
| `INFO` | `#3f6079` | 信息 - 靛蓝 |
| `WARN` | `#9a6b1f` | 警告 - 琥珀 |

**对比度约定**：背景为浅色，因此赭色 primary 按钮、地图选中标记等「深底」元素的文字使用浅羊皮纸色 `SURFACE`（而非纯白），保证可读且不刺眼。

## 字体

- **正文**：Noto Sans CJK SC（`assets/fonts/NotoSansCJKsc-Regular.otf`），作为全局 `Theme.default_font`，16px 基准。
- **标题**：Noto Serif CJK SC（`assets/fonts/NotoSerifCJKsc-Regular.otf`），衬线，用于游戏标题、分节标题、屏幕头部、导航品牌名。通过 `_label(..., heading = true)` 启用 —— 仅对该 Label 覆盖 `font`，正文不受影响。
- 两者同属 Noto CJK 家族，OFL 许可，风格协调，均覆盖简体中文。
- 字号分三级缩放（`_scaled_font()`，跟随设置 `font_size` = small/medium/large）。

## 形态与质感

- **圆角**：输入框 / 按钮 8，卡片 / 面板 10，对话框 12–14，标签 999（胶囊）。
- **边框**：统一 1px，`BORDER` 浅褐描边。
- **纸面分层**：卡片用 `SURFACE`（比 `BG` 亮）+ 浅褐描边，自然形成「纸张贴在桌面」的层次。
- **纸张投影**：`_panel()` 为卡片加一道极淡阴影（`shadow_color ≈ 黑 10% alpha`，`shadow_size = 3`，`shadow_offset = (0,2)`），模拟古籍纸张投影。
- **地图**：底图叠加略偏暖的 `modulate`，网格线用半透明 `BORDER`，呈现旧地图质感。

## 布局与响应式（沿用，不随本次改版变动）

- 单一断点 `_wide()` = 视口宽 ≥ 900px。
- ≥900px：左侧固定导航（196px）+ 主内容 + 上下文面板（260–520px 可调）。
- <900px：单栏 + 底部固定导航（56px）。
- 详见 `docs/ui-ux-flows.md`、`docs/godot-client-architecture.md`。
