class_name FantasyMapGenerator
extends RefCounted

const SOURCE_PROJECT_URL := "https://github.com/Azgaar/Fantasy-Map-Generator"
const SOURCE_LICENSE_URL := "https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE"
const WATER_LEVEL := 20.0
const DEFAULT_SIZE := Vector2i(960, 640)
const MIN_LOCATION_DISTANCE := 0.095

var _size := DEFAULT_SIZE
var _seed_int := 1
var _height_noise: FastNoiseLite
var _detail_noise: FastNoiseLite
var _moisture_noise: FastNoiseLite
var _temperature_noise: FastNoiseLite
var _rng := RandomNumberGenerator.new()
var _heights := PackedFloat32Array()
var _moistures := PackedFloat32Array()
var _temperatures := PackedFloat32Array()

func generate(seed: Dictionary, source_locations: Array[Dictionary], factions: Array[Dictionary], target_path: String, requested_size: Vector2i = DEFAULT_SIZE) -> Dictionary:
	_size = Vector2i(maxi(320, requested_size.x), maxi(240, requested_size.y))
	_seed_int = _hash_seed(_seed_text(seed))
	_rng.seed = _seed_int
	_configure_noise()
	_compute_fields()
	var image := Image.create_empty(_size.x, _size.y, false, Image.FORMAT_RGBA8)
	_paint_terrain(image, str(seed.get("genre", "奇幻")), str(seed.get("tone", "冒险")))
	var rivers := _draw_rivers(image)
	var placement := _place_locations(source_locations)
	var location_updates: Array[Dictionary] = placement.get("locations", [])
	var location_positions: Dictionary = placement.get("positions", {})
	var routes := _build_routes(source_locations, location_positions)
	_draw_routes(image, routes, location_positions)
	_draw_burgs(image, source_locations, location_positions)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target_path.get_base_dir()))
	var err := image.save_png(target_path)
	if err != OK:
		return {"status": "error", "error": "无法写入生成地图：%s" % error_string(err)}
	return {
		"status": "ok",
		"image_path": target_path,
		"width": _size.x,
		"height": _size.y,
		"location_updates": location_updates,
		"routes": routes,
		"generator": {
			"id": "azgaar_fmg_godot_adapter",
			"name": "Azgaar FMG-style local generator",
			"mode": "procedural",
			"source_project": "Azgaar/Fantasy-Map-Generator",
			"source_url": SOURCE_PROJECT_URL,
			"source_license": "MIT",
			"source_license_url": SOURCE_LICENSE_URL,
			"seed": _seed_int,
			"terrain": {
				"height_scale": "0..100",
				"water_level": WATER_LEVEL,
				"land_threshold": WATER_LEVEL,
				"biomes": ["ocean", "coast", "mountain", "tundra", "forest", "dryland", "grassland"]
			},
			"coastlines": {
				"generated": true,
				"source": "heightmap land-water adjacency",
				"style": "shoreline pixels"
			},
			"rivers": {
				"generated": true,
				"count": rivers,
				"source": "downhill highland tracing"
			},
			"model": {
				"cells": _size.x * _size.y,
				"height_scale": "0..100, land >= 20",
				"biomes": "temperature + moisture + height",
				"burgs": location_updates.size(),
				"states": factions.size(),
				"routes": routes.size()
			},
			"generated_at": Time.get_datetime_string_from_system(true)
		}
	}

func generate_from_reference_image(source_path: String, seed: Dictionary, source_locations: Array[Dictionary], factions: Array[Dictionary], target_path: String, requested_size: Vector2i = DEFAULT_SIZE) -> Dictionary:
	var normalized_source := source_path.strip_edges()
	if normalized_source.is_empty() or not FileAccess.file_exists(normalized_source):
		return {"status": "error", "error": "参考图不存在：%s" % normalized_source}
	var reference := Image.new()
	var load_error := reference.load(normalized_source)
	if load_error != OK:
		return {"status": "error", "error": "无法读取参考图：%s" % error_string(load_error)}
	var original_size := Vector2i(reference.get_width(), reference.get_height())
	_size = _reference_target_size(original_size, requested_size)
	reference.resize(_size.x, _size.y, Image.INTERPOLATE_LANCZOS)
	_seed_int = _hash_seed("%s|%s|reference" % [_seed_text(seed), normalized_source.get_file()])
	_rng.seed = _seed_int
	_configure_noise()
	var reference_features := _compute_fields_from_reference(reference)
	var image := Image.create_empty(_size.x, _size.y, false, Image.FORMAT_RGBA8)
	_paint_terrain(image, str(seed.get("genre", "奇幻")), str(seed.get("tone", "冒险")))
	var rivers := _draw_rivers(image)
	var region_border_pixels := _draw_reference_region_borders(image, reference)
	reference_features["region_border_pixels"] = region_border_pixels
	var placement := _place_locations(source_locations)
	var location_updates: Array[Dictionary] = placement.get("locations", [])
	var location_positions: Dictionary = placement.get("positions", {})
	var routes := _build_routes(source_locations, location_positions)
	_draw_routes(image, routes, location_positions)
	_draw_burgs(image, source_locations, location_positions)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target_path.get_base_dir()))
	var save_error := image.save_png(target_path)
	if save_error != OK:
		return {"status": "error", "error": "无法写入参考生成地图：%s" % error_string(save_error)}
	return {
		"status": "ok",
		"image_path": target_path,
		"width": _size.x,
		"height": _size.y,
		"location_updates": location_updates,
		"routes": routes,
		"generator": {
			"id": "azgaar_fmg_reference_adapter",
			"name": "Azgaar FMG-style reference image generator",
			"mode": "reference_image",
			"source_project": "Azgaar/Fantasy-Map-Generator",
			"source_url": SOURCE_PROJECT_URL,
			"source_license": "MIT",
			"source_license_url": SOURCE_LICENSE_URL,
			"seed": _seed_int,
			"reference_image": {
				"source_path": normalized_source,
				"source_name": normalized_source.get_file(),
				"original_width": original_size.x,
				"original_height": original_size.y,
				"processed_width": _size.x,
				"processed_height": _size.y
			},
			"reference_features": reference_features,
			"terrain": {
				"height_scale": "0..100",
				"water_level": WATER_LEVEL,
				"land_threshold": WATER_LEVEL,
				"biomes": ["ocean", "coast", "mountain", "tundra", "forest", "dryland", "grassland"],
				"source": "reference image color classification"
			},
			"coastlines": {
				"generated": true,
				"source": "reference-derived land-water adjacency",
				"style": "shoreline pixels",
				"pixels": int(reference_features.get("coastline_pixels", 0))
			},
			"rivers": {
				"generated": true,
				"count": rivers,
				"source": "downhill tracing over reference-derived heightmap"
			},
			"region_borders": {
				"generated": region_border_pixels > 0,
				"source": "red line detection",
				"pixels": region_border_pixels
			},
			"model": {
				"cells": _size.x * _size.y,
				"height_scale": "0..100, land >= 20",
				"biomes": "reference colors + temperature/moisture inference",
				"burgs": location_updates.size(),
				"states": factions.size(),
				"routes": routes.size()
			},
			"generated_at": Time.get_datetime_string_from_system(true)
		}
	}

func _configure_noise() -> void:
	_height_noise = _noise(_seed_int, 0.0055, 5, 0.52)
	_detail_noise = _noise(_seed_int + 1013, 0.021, 3, 0.48)
	_moisture_noise = _noise(_seed_int + 2027, 0.011, 4, 0.55)
	_temperature_noise = _noise(_seed_int + 3049, 0.008, 3, 0.5)

func _noise(seed_value: int, frequency: float, octaves: int, gain: float) -> FastNoiseLite:
	var noise := FastNoiseLite.new()
	noise.seed = seed_value
	noise.frequency = frequency
	noise.fractal_octaves = octaves
	noise.fractal_gain = gain
	return noise

func _compute_fields() -> void:
	var total := _size.x * _size.y
	_heights.resize(total)
	_moistures.resize(total)
	_temperatures.resize(total)
	for y in range(_size.y):
		for x in range(_size.x):
			var idx := _index(x, y)
			var nx := (float(x) / maxf(float(_size.x - 1), 1.0) - 0.5) * 2.0
			var ny := (float(y) / maxf(float(_size.y - 1), 1.0) - 0.5) * 2.0
			var distance := Vector2(nx, ny * 1.12).length()
			var island_falloff := clampf((distance - 0.34) / 0.72, 0.0, 1.0)
			var base := _normalized_noise(_height_noise, x, y)
			var detail := _normalized_noise(_detail_noise, x, y)
			var ridge := 1.0 - absf(_detail_noise.get_noise_2d(float(x) * 0.54, float(y) * 0.54))
			var height := clampf(base * 70.0 + detail * 20.0 + ridge * 12.0 + 16.0 - island_falloff * 68.0, 0.0, 100.0)
			var latitude_temp := 1.0 - float(y) / maxf(float(_size.y - 1), 1.0)
			var temp := clampf(latitude_temp * 0.82 + _normalized_noise(_temperature_noise, x, y) * 0.24 - height / 180.0, 0.0, 1.0)
			var moisture := clampf(_normalized_noise(_moisture_noise, x, y) * 0.82 + (1.0 - island_falloff) * 0.12 - maxf(0.0, height - 62.0) / 180.0, 0.0, 1.0)
			_heights[idx] = height
			_temperatures[idx] = temp
			_moistures[idx] = moisture

func _compute_fields_from_reference(reference: Image) -> Dictionary:
	var total := _size.x * _size.y
	_heights.resize(total)
	_moistures.resize(total)
	_temperatures.resize(total)
	var water_pixels := 0
	var land_pixels := 0
	var mountain_pixels := 0
	var dry_pixels := 0
	var forest_pixels := 0
	var red_pixels := 0
	for y in range(_size.y):
		for x in range(_size.x):
			var raw := reference.get_pixel(x, y)
			if _is_reference_region_border(raw):
				red_pixels += 1
			var color := _reference_base_color(reference, x, y)
			var water := _is_reference_water(color)
			var idx := _index(x, y)
			var height := _reference_height(color, water, x, y)
			var temp := _reference_temperature(color, height, y)
			var moisture := _reference_moisture(color, water)
			_heights[idx] = height
			_temperatures[idx] = temp
			_moistures[idx] = moisture
			if water:
				water_pixels += 1
			else:
				land_pixels += 1
				if _is_reference_mountain(color):
					mountain_pixels += 1
				elif _is_reference_dry(color):
					dry_pixels += 1
				elif _is_reference_forest(color):
					forest_pixels += 1
	var coastline_pixels := _count_coastline_pixels()
	return {
		"land_pixels": land_pixels,
		"water_pixels": water_pixels,
		"land_ratio": float(land_pixels) / maxf(float(total), 1.0),
		"water_ratio": float(water_pixels) / maxf(float(total), 1.0),
		"coastline_pixels": coastline_pixels,
		"mountain_pixels": mountain_pixels,
		"dry_pixels": dry_pixels,
		"forest_pixels": forest_pixels,
		"detected_red_pixels": red_pixels
	}

func _reference_target_size(original_size: Vector2i, requested_size: Vector2i) -> Vector2i:
	var max_width := maxi(320, requested_size.x)
	var max_height := maxi(240, requested_size.y)
	var scale := minf(float(max_width) / maxf(float(original_size.x), 1.0), float(max_height) / maxf(float(original_size.y), 1.0))
	scale = minf(scale, 1.0)
	return Vector2i(maxi(320, int(round(float(original_size.x) * scale))), maxi(240, int(round(float(original_size.y) * scale))))

func _reference_base_color(reference: Image, x: int, y: int) -> Color:
	var color := reference.get_pixel(x, y)
	if not _is_reference_annotation(color):
		return color
	for radius in range(1, 9):
		for dy in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				if abs(dx) != radius and abs(dy) != radius:
					continue
				var px := x + dx
				var py := y + dy
				if px < 0 or py < 0 or px >= _size.x or py >= _size.y:
					continue
				var candidate := reference.get_pixel(px, py)
				if not _is_reference_annotation(candidate):
					return candidate
	return color

func _reference_height(color: Color, water: bool, x: int, y: int) -> float:
	if water:
		return clampf(6.0 + _brightness(color) * 10.0, 0.0, WATER_LEVEL - 2.0)
	var height := 32.0 + (_brightness(color) - 0.35) * 24.0
	if _is_reference_mountain(color):
		height = 76.0 + _brightness(color) * 18.0
	elif _is_reference_dry(color):
		height += 12.0
	elif _is_reference_forest(color):
		height += 4.0
	height += _normalized_noise(_detail_noise, x, y) * 8.0 - 3.0
	return clampf(height, WATER_LEVEL + 2.0, 98.0)

func _reference_temperature(color: Color, height: float, y: int) -> float:
	var latitude_temp := 1.0 - float(y) / maxf(float(_size.y - 1), 1.0)
	return clampf(latitude_temp * 0.76 + color.r * 0.16 - height / 210.0, 0.0, 1.0)

func _reference_moisture(color: Color, water: bool) -> float:
	if water:
		return 1.0
	if _is_reference_forest(color):
		return 0.72
	if _is_reference_dry(color):
		return 0.18
	if _is_reference_mountain(color):
		return 0.36
	return clampf(color.g * 0.74 + color.b * 0.18, 0.1, 0.78)

func _is_reference_annotation(color: Color) -> bool:
	return _is_reference_region_border(color) or _is_reference_black_mark(color)

func _is_reference_region_border(color: Color) -> bool:
	return color.r > 0.58 and color.r > color.g * 1.7 and color.r > color.b * 1.7 and color.g < 0.35 and color.b < 0.35

func _is_reference_black_mark(color: Color) -> bool:
	return _brightness(color) < 0.09 and color.b < 0.16

func _is_reference_water(color: Color) -> bool:
	return color.b > 0.18 and color.b > color.g * 1.05 and color.b > color.r * 1.16 and color.r < 0.42

func _is_reference_mountain(color: Color) -> bool:
	var max_channel := maxf(color.r, maxf(color.g, color.b))
	var min_channel := minf(color.r, minf(color.g, color.b))
	return _brightness(color) > 0.56 and max_channel - min_channel < 0.22 and color.b > 0.42

func _is_reference_dry(color: Color) -> bool:
	return color.r > 0.38 and color.g > 0.28 and color.r > color.b * 1.16 and color.g > color.b * 1.08 and color.r >= color.g * 0.86

func _is_reference_forest(color: Color) -> bool:
	return color.g > 0.25 and color.g >= color.r * 0.82 and color.g > color.b * 0.92

func _brightness(color: Color) -> float:
	return (color.r + color.g + color.b) / 3.0

func _count_coastline_pixels() -> int:
	var count := 0
	for y in range(1, _size.y - 1):
		for x in range(1, _size.x - 1):
			if not _is_land_xy(x, y):
				continue
			if not _is_land_xy(x - 1, y) or not _is_land_xy(x + 1, y) or not _is_land_xy(x, y - 1) or not _is_land_xy(x, y + 1):
				count += 1
	return count

func _paint_terrain(image: Image, genre: String, tone: String) -> void:
	for y in range(_size.y):
		for x in range(_size.x):
			var height := _height_at_xy(x, y)
			var color := _terrain_color(x, y, height, genre, tone)
			image.set_pixel(x, y, color)
	_paint_coastlines(image)

func _terrain_color(x: int, y: int, height: float, genre: String, tone: String) -> Color:
	var idx := _index(x, y)
	var moisture := _moistures[idx]
	var temp := _temperatures[idx]
	if height < WATER_LEVEL:
		var water_depth := clampf(height / WATER_LEVEL, 0.0, 1.0)
		return Color("#263b6f").lerp(Color("#5a86a6"), water_depth)
	if height < WATER_LEVEL + 3.5:
		return Color("#c9bc86")
	if height > 86.0:
		return Color("#d8dce2") if temp < 0.62 else Color("#9a9388")
	if height > 72.0:
		return Color("#7d7464")
	if temp < 0.18:
		return Color("#b6bdad")
	if moisture < 0.22:
		return Color("#c7ae67") if genre != "末世" else Color("#9b856a")
	if moisture > 0.72:
		return Color("#2f6d4f") if tone != "黑暗" else Color("#285442")
	if moisture > 0.54:
		return Color("#568a53")
	return Color("#8aa55f")

func _paint_coastlines(image: Image) -> void:
	for y in range(1, _size.y - 1):
		for x in range(1, _size.x - 1):
			if not _is_land_xy(x, y):
				continue
			if not _is_land_xy(x - 1, y) or not _is_land_xy(x + 1, y) or not _is_land_xy(x, y - 1) or not _is_land_xy(x, y + 1):
				image.set_pixel(x, y, Color("#ead99a"))

func _draw_reference_region_borders(image: Image, reference: Image) -> int:
	var count := 0
	for y in range(_size.y):
		for x in range(_size.x):
			if not _is_reference_region_border(reference.get_pixel(x, y)):
				continue
			count += 1
			_paint_disc(image, Vector2(x, y), 1, Color(0.88, 0.08, 0.06, 0.82))
	return count

func _draw_rivers(image: Image) -> int:
	var count := clampi(int(_size.x / 180), 4, 8)
	var drawn := 0
	for i in range(count):
		var source := _pick_high_land_point()
		if source.x < 0:
			continue
		var points: Array[Vector2] = []
		var p := source
		for step in range(170):
			points.append(p)
			if _height_at_pixel(p) <= WATER_LEVEL + 1.5:
				break
			var next := _lowest_neighbor(p, 9.0)
			if next.distance_to(p) < 0.5:
				break
			p = next
		if points.size() < 8:
			continue
		for j in range(points.size() - 1):
			_draw_line(image, points[j], points[j + 1], Color("#5f91b6"), 2)
		drawn += 1
	return drawn

func _pick_high_land_point() -> Vector2:
	var best := Vector2(-1, -1)
	var best_score := -1000.0
	for attempt in range(420):
		var x := _rng.randi_range(int(_size.x * 0.14), int(_size.x * 0.86))
		var y := _rng.randi_range(int(_size.y * 0.14), int(_size.y * 0.86))
		var height := _height_at_xy(x, y)
		if height < 55.0:
			continue
		var score := height + _rng.randf_range(-8.0, 8.0)
		if score > best_score:
			best_score = score
			best = Vector2(x, y)
	return best

func _lowest_neighbor(p: Vector2, radius: float) -> Vector2:
	var best := p
	var best_score := _height_at_pixel(p)
	var dirs := [
		Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1),
		Vector2(1, 1), Vector2(1, -1), Vector2(-1, 1), Vector2(-1, -1)
	]
	for dir in dirs:
		var candidate := Vector2(clampf(p.x + dir.x * radius, 1.0, float(_size.x - 2)), clampf(p.y + dir.y * radius, 1.0, float(_size.y - 2)))
		var edge_pull := Vector2(_size.x * 0.5, _size.y * 0.5).distance_to(candidate) / maxf(float(_size.x), 1.0)
		var score := _height_at_pixel(candidate) - edge_pull * 2.5 + _rng.randf_range(-1.6, 1.6)
		if score < best_score:
			best_score = score
			best = candidate
	if best == p:
		var drift := (p - Vector2(_size.x * 0.5, _size.y * 0.5)).normalized()
		best = Vector2(clampf(p.x + drift.x * radius, 1.0, float(_size.x - 2)), clampf(p.y + drift.y * radius, 1.0, float(_size.y - 2)))
	return best

func _place_locations(source_locations: Array[Dictionary]) -> Dictionary:
	var location_updates: Array[Dictionary] = []
	var positions := {}
	var taken: Array[Vector2] = []
	for index in range(source_locations.size()):
		var location := source_locations[index] as Dictionary
		var location_id := str(location.get("id", ""))
		if location_id.is_empty():
			continue
		var normalized := _source_or_generated_position(location, index, source_locations.size())
		normalized = _nearest_land_normalized(normalized)
		normalized = _avoid_location_overlap(normalized, taken)
		taken.append(normalized)
		var position := {"x": normalized.x, "y": normalized.y}
		positions[location_id] = position
		location_updates.append({
			"id": location_id,
			"position": position,
			"map_id": "map_001",
			"azgaar_burg": {
				"id": index + 1,
				"name": str(location.get("name", "地点%d" % (index + 1))),
				"type": _burg_type(location),
				"cell": _index_for_normalized(normalized),
				"state": _state_id_for_location(location)
			},
			"biome": _biome_at_normalized(normalized),
			"height": int(round(_height_at_normalized(normalized)))
		})
	return {"locations": location_updates, "positions": positions}

func _source_or_generated_position(location: Dictionary, index: int, total: int) -> Vector2:
	var source_position: Dictionary = location.get("position", {}) if location.get("position", {}) is Dictionary else {}
	if source_position.has("x") and source_position.has("y"):
		return Vector2(clampf(float(source_position.get("x", 0.5)), 0.06, 0.94), clampf(float(source_position.get("y", 0.5)), 0.06, 0.94))
	var angle := TAU * float(index) / maxf(float(total), 1.0) + _rng.randf_range(-0.36, 0.36)
	var radius := _rng.randf_range(0.18, 0.34)
	var candidate := Vector2(0.5 + cos(angle) * radius, 0.5 + sin(angle) * radius)
	return _best_land_near(candidate, str(location.get("type", "")))

func _best_land_near(center: Vector2, location_type: String) -> Vector2:
	var best := center
	var best_score := -10000.0
	for attempt in range(320):
		var candidate := Vector2(clampf(center.x + _rng.randf_range(-0.22, 0.22), 0.06, 0.94), clampf(center.y + _rng.randf_range(-0.2, 0.2), 0.06, 0.94))
		if _height_at_normalized(candidate) < WATER_LEVEL + 3.0:
			continue
		var idx := _index_for_normalized(candidate)
		var height := _heights[idx]
		var moisture := _moistures[idx]
		var score := 80.0 - absf(height - 42.0)
		if location_type.to_lower().contains("forest"):
			score += moisture * 35.0
		elif location_type.to_lower().contains("ruin") or location_type.to_lower().contains("archive"):
			score += height * 0.35
		elif location_type.to_lower().contains("city") or location_type.to_lower().contains("town"):
			score -= absf(height - 32.0) * 0.7
		score -= center.distance_to(candidate) * 120.0
		if score > best_score:
			best_score = score
			best = candidate
	return best

func _nearest_land_normalized(position: Vector2) -> Vector2:
	if _height_at_normalized(position) >= WATER_LEVEL + 2.5:
		return position
	var origin := _pixel_for_normalized(position)
	for radius in range(4, 220, 4):
		var steps := maxi(12, int(radius / 2))
		for step in range(steps):
			var angle := TAU * float(step) / float(steps)
			var p := Vector2(origin.x + cos(angle) * radius, origin.y + sin(angle) * radius)
			if p.x < 2.0 or p.y < 2.0 or p.x > float(_size.x - 3) or p.y > float(_size.y - 3):
				continue
			if _height_at_pixel(p) >= WATER_LEVEL + 2.5:
				return _normalized_for_pixel(p)
	return Vector2(0.5, 0.5)

func _avoid_location_overlap(position: Vector2, taken: Array[Vector2]) -> Vector2:
	var result := position
	for attempt in range(24):
		var too_close := false
		for other in taken:
			if result.distance_to(other) < MIN_LOCATION_DISTANCE:
				too_close = true
				var direction := (result - other).normalized()
				if direction.length() < 0.01:
					direction = Vector2.from_angle(_rng.randf_range(0.0, TAU))
				result = _nearest_land_normalized(Vector2(clampf(result.x + direction.x * 0.045, 0.06, 0.94), clampf(result.y + direction.y * 0.045, 0.06, 0.94)))
				break
		if not too_close:
			break
	return result

func _build_routes(source_locations: Array[Dictionary], location_positions: Dictionary) -> Array[Dictionary]:
	var routes: Array[Dictionary] = []
	var seen := {}
	for location in source_locations:
		var from_id := str((location as Dictionary).get("id", ""))
		for target_id in (location as Dictionary).get("connected_location_ids", []):
			var to_id := str(target_id)
			if from_id.is_empty() or to_id.is_empty() or from_id == to_id:
				continue
			if not location_positions.has(from_id) or not location_positions.has(to_id):
				continue
			var key := _route_key(from_id, to_id)
			if seen.has(key):
				continue
			seen[key] = true
			routes.append(_route_data(routes.size() + 1, from_id, to_id, _name_for_location(source_locations, from_id), _name_for_location(source_locations, to_id), location_positions))
	if routes.is_empty() and source_locations.size() > 1:
		var current_id := str(source_locations[0].get("id", ""))
		for i in range(1, source_locations.size()):
			var to_id := str(source_locations[i].get("id", ""))
			if location_positions.has(current_id) and location_positions.has(to_id):
				routes.append(_route_data(routes.size() + 1, current_id, to_id, _name_for_location(source_locations, current_id), _name_for_location(source_locations, to_id), location_positions))
			current_id = to_id
	return routes

func _route_data(index: int, from_id: String, to_id: String, from_name: String, to_name: String, location_positions: Dictionary) -> Dictionary:
	var danger := _route_danger(location_positions.get(from_id, {}) as Dictionary, location_positions.get(to_id, {}) as Dictionary)
	return {
		"id": "route_fmg_%04d" % index,
		"name": "%s - %s" % [from_name, to_name],
		"type": "road" if danger < 0.45 else "trail",
		"from_location_id": from_id,
		"to_location_id": to_id,
		"danger": danger,
		"source": "azgaar_fmg"
	}

func _route_danger(from_position: Dictionary, to_position: Dictionary) -> float:
	var start := Vector2(float(from_position.get("x", 0.5)), float(from_position.get("y", 0.5)))
	var end := Vector2(float(to_position.get("x", 0.5)), float(to_position.get("y", 0.5)))
	var samples := 12
	var risk := 0.0
	for i in range(samples + 1):
		var t := float(i) / float(samples)
		var p := start.lerp(end, t)
		var height := _height_at_normalized(p)
		var moisture := _moistures[_index_for_normalized(p)]
		if height < WATER_LEVEL + 1.0:
			risk += 0.18
		if height > 66.0:
			risk += 0.08
		if moisture > 0.76:
			risk += 0.04
	return clampf(risk / float(samples + 1), 0.0, 0.92)

func _draw_routes(image: Image, routes: Array[Dictionary], location_positions: Dictionary) -> void:
	for route in routes:
		var from_position := location_positions.get(str(route.get("from_location_id", "")), {}) as Dictionary
		var to_position := location_positions.get(str(route.get("to_location_id", "")), {}) as Dictionary
		if from_position.is_empty() or to_position.is_empty():
			continue
		var start := _pixel_for_normalized(Vector2(float(from_position.get("x", 0.5)), float(from_position.get("y", 0.5))))
		var end := _pixel_for_normalized(Vector2(float(to_position.get("x", 0.5)), float(to_position.get("y", 0.5))))
		_draw_line(image, start, end, Color(0.42, 0.30, 0.16, 0.55), 2)

func _draw_burgs(image: Image, source_locations: Array[Dictionary], location_positions: Dictionary) -> void:
	for location in source_locations:
		var data := location as Dictionary
		var location_id := str(data.get("id", ""))
		var position := location_positions.get(location_id, {}) as Dictionary
		if position.is_empty():
			continue
		var p := _pixel_for_normalized(Vector2(float(position.get("x", 0.5)), float(position.get("y", 0.5))))
		var radius := 5 if _burg_type(data) == "city" else 4
		_paint_disc(image, p, radius + 1, Color(0.1, 0.08, 0.06, 0.78))
		_paint_disc(image, p, radius, Color("#f1d589"))

func _draw_line(image: Image, start: Vector2, end: Vector2, color: Color, width: int = 1) -> void:
	var delta := end - start
	var steps := int(maxf(absf(delta.x), absf(delta.y)))
	if steps <= 0:
		_paint_disc(image, start, width, color)
		return
	for i in range(steps + 1):
		var t := float(i) / float(steps)
		_paint_disc(image, start.lerp(end, t), width, color)

func _paint_disc(image: Image, center: Vector2, radius: int, color: Color) -> void:
	var min_x := clampi(int(floor(center.x)) - radius, 0, _size.x - 1)
	var max_x := clampi(int(ceil(center.x)) + radius, 0, _size.x - 1)
	var min_y := clampi(int(floor(center.y)) - radius, 0, _size.y - 1)
	var max_y := clampi(int(ceil(center.y)) + radius, 0, _size.y - 1)
	for y in range(min_y, max_y + 1):
		for x in range(min_x, max_x + 1):
			if Vector2(x, y).distance_to(center) <= float(radius):
				var base := image.get_pixel(x, y)
				image.set_pixel(x, y, base.lerp(color, color.a))

func _burg_type(location: Dictionary) -> String:
	var type := str(location.get("type", "")).to_lower()
	if type.contains("city") or type.contains("城"):
		return "city"
	if type.contains("town") or type.contains("驿") or type.contains("镇"):
		return "town"
	if type.contains("ruin") or type.contains("archive") or type.contains("遗"):
		return "ruin"
	if type.contains("forest") or type.contains("林"):
		return "wild"
	return "site"

func _state_id_for_location(location: Dictionary) -> String:
	var faction_id := str(location.get("controlling_faction_id", ""))
	return faction_id if not faction_id.is_empty() and faction_id != "<null>" else "neutral"

func _biome_at_normalized(position: Vector2) -> String:
	var idx := _index_for_normalized(position)
	var height := _heights[idx]
	var temp := _temperatures[idx]
	var moisture := _moistures[idx]
	if height < WATER_LEVEL:
		return "ocean"
	if height < WATER_LEVEL + 3.5:
		return "coast"
	if height > 78.0:
		return "mountain"
	if temp < 0.2:
		return "tundra"
	if moisture > 0.7:
		return "forest"
	if moisture < 0.25:
		return "dryland"
	return "grassland"

func _seed_text(seed: Dictionary) -> String:
	var hero := seed.get("hero", {}) as Dictionary
	return "%s|%s|%s|%s|%s" % [
		seed.get("world_name", "world"),
		seed.get("genre", "fantasy"),
		seed.get("tone", "adventure"),
		hero.get("name", "hero"),
		seed.get("limits", "")
	]

func _hash_seed(text: String) -> int:
	var value := 2166136261
	for i in range(text.length()):
		value = int((value ^ text.unicode_at(i)) * 16777619) & 0x7fffffff
	if value == 0:
		value = 1
	return value

func _normalized_noise(noise: FastNoiseLite, x: int, y: int) -> float:
	return clampf((noise.get_noise_2d(float(x), float(y)) + 1.0) * 0.5, 0.0, 1.0)

func _index(x: int, y: int) -> int:
	return clampi(y, 0, _size.y - 1) * _size.x + clampi(x, 0, _size.x - 1)

func _index_for_normalized(position: Vector2) -> int:
	var pixel := _pixel_for_normalized(position)
	return _index(int(round(pixel.x)), int(round(pixel.y)))

func _pixel_for_normalized(position: Vector2) -> Vector2:
	return Vector2(clampf(position.x, 0.0, 1.0) * float(_size.x - 1), clampf(position.y, 0.0, 1.0) * float(_size.y - 1))

func _normalized_for_pixel(pixel: Vector2) -> Vector2:
	return Vector2(clampf(pixel.x / maxf(float(_size.x - 1), 1.0), 0.0, 1.0), clampf(pixel.y / maxf(float(_size.y - 1), 1.0), 0.0, 1.0))

func _height_at_xy(x: int, y: int) -> float:
	return _heights[_index(x, y)]

func _height_at_pixel(pixel: Vector2) -> float:
	return _height_at_xy(int(round(pixel.x)), int(round(pixel.y)))

func _height_at_normalized(position: Vector2) -> float:
	return _heights[_index_for_normalized(position)]

func _is_land_xy(x: int, y: int) -> bool:
	return _height_at_xy(x, y) >= WATER_LEVEL

func _route_key(a: String, b: String) -> String:
	return "%s::%s" % [a, b] if a < b else "%s::%s" % [b, a]

func _name_for_location(locations: Array[Dictionary], location_id: String) -> String:
	for location in locations:
		if str((location as Dictionary).get("id", "")) == location_id:
			return str((location as Dictionary).get("name", location_id))
	return location_id
