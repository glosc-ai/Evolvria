# 地图导入与标注

## 目标

地图用于连接地点、移动、路线、NPC 位置和事件生成。当前 UI 已支持结构化地点/路线标注；图片导入和程序化地图生成已有 Tauri native 命令，但尚未接入 Vue 地图页。

## 当前已实现 UI

地图页当前能力：

- 显示 960 x 640 的 SVG 地形底图。
- 依据 `world.world.map_routes` 绘制路线。
- 依据地点 `position.x/y` 绘制地点点位和名称。
- 当前地点使用绿色标记。
- 可缩放地图，范围 0.7 到 1.8。
- 可显示/隐藏未知地点。
- 点击地点查看描述。
- 可移动到选中地点。
- 可从当前位置到选中地点添加一条自定义路线。
- 可手动添加地点，坐标限制在 0.05 到 0.95。

当前没有实现：

- 图片文件选择入口。
- 拖拽上传。
- 双指缩放。
- 编辑或删除已有地点。
- 显示 NPC 点位。
- 地图图片作为底图渲染。

## 当前数据结构

地点坐标使用归一化坐标：

```json
{
  "position": {
    "x": 0.42,
    "y": 0.58
  }
}
```

路线：

```json
{
  "id": "route_001",
  "from_location_id": "loc_start",
  "to_location_id": "loc_forest",
  "name": "雾林旧道",
  "type": "road",
  "danger": 0.28
}
```

`MapImage` 可记录图片路径、尺寸、原始尺寸、缩放状态、比例尺、地点、路线和生成器元数据。

## 内置生成

初始世界会写入一个 `generated://map_001` 的 map image 元数据，并记录：

```json
{
  "source_project": "Azgaar/Fantasy-Map-Generator",
  "source_license": "MIT",
  "source_url": "https://github.com/Azgaar/Fantasy-Map-Generator",
  "mode": "procedural",
  "attribution_required": true
}
```

Tauri native `generate_fantasy_map` 当前会生成一张 960 x 640 PNG，并返回路径、尺寸、地点和生成器信息。它是轻量 procedural map，不嵌入完整 Azgaar Web 应用。

## 图片导入 native 能力

`import_map_image(source_path)`：

- 读取本地图片。
- 缩略到最大 2048 x 2048。
- 保存到 `saves/active_world/maps/map_001.png`。
- 返回 `image_path`、`width`、`height`、`original_width`、`original_height`、`resized_for_device`。

`generate_map_from_reference(source_path, seed, locations)`：

- 如果 source_path 存在，缩略到 960 x 640 保存为 `map_001.png`。
- 如果 source_path 不存在，退回 procedural map。
- 返回 reference_image 模式的生成器元数据。

这些命令仍需 UI 接入和路径选择。

## 地图与 AI

AI 上下文不发送完整大图。当前玩家行动上下文发送：

- 当前地点。
- 同行角色。
- 附近地点列表。
- 最近事件。
- 相关记忆。

后续可加入：

- 可达路线列表。
- 路线危险度。
- 当前位置所属区域。
- NPC 当前地点。

## NPC 移动

当前玩家移动由 `movePlayerTo` 直接设置主角和 active companion 的 `current_location_id`，并将目标地点标记为已知。

后续 NPC 移动规则：

- 有路线时优先沿路线。
- 无路线时按地点直线距离估算。
- 危险度影响事件概率和耗时。
- 重要移动写入 timeline 和 memory。

## 后续 UI 优先级

1. 在地图页接入文件选择并调用 `import_map_image`。
2. 使用 `map_image.image_path` 作为底图，保留 SVG fallback。
3. 支持地点编辑、删除和拖动坐标。
4. 显示角色当前位置。
5. 支持桌面滚轮缩放、移动端双指缩放和平板拖拽。
6. 接入 `generate_fantasy_map` 和 `generate_map_from_reference`。
