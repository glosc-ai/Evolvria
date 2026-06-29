extends Node

signal world_loaded(world_id: String)
signal world_updated(change_set: Dictionary)
signal event_added(event_id: String)
signal time_advanced(new_time: Dictionary)

const SCHEMA_VERSION := 1
const SUMMARY_EVENT_THRESHOLD := 20
const SUMMARY_WINDOW_LIMIT := 30
const MAX_MAP_IMAGE_DIMENSION := 2048
const GENERATED_MAP_SOURCE := "azgaar_fmg"
const FANTASY_MAP_GENERATOR_SCRIPT := preload("res://scripts/generation/fantasy_map_generator.gd")

var world: Dictionary = {}
var characters: Array[Dictionary] = []
var locations: Array[Dictionary] = []
var factions: Array[Dictionary] = []
var timeline: Array[Dictionary] = []
var memories: Array[Dictionary] = []
var ai_logs: Array[Dictionary] = []
var threads: Array[Dictionary] = []
var suggested_actions: Array[String] = []

var _event_counter: int = 0
var _memory_counter: int = 0
var _location_counter: int = 100
var _thread_counter: int = 0

func _ready() -> void:
	randomize()
	if SaveManager.has_save():
		load_active_world()

func has_world() -> bool:
	return not world.is_empty()

func get_snapshot() -> Dictionary:
	return {
		"world": world.duplicate(true),
		"characters": characters.duplicate(true),
		"locations": locations.duplicate(true),
		"factions": factions.duplicate(true),
		"timeline": timeline.duplicate(true),
		"memories": memories.duplicate(true),
		"threads": threads.duplicate(true),
		"suggested_actions": suggested_actions.duplicate(),
		"current_location": get_current_location(),
		"ai_context": build_ai_context("")
	}

func create_world(seed: Dictionary) -> void:
	var normalized_seed := seed.duplicate(true)
	normalized_seed["limits"] = _content_limits_from_seed(seed)
	seed = normalized_seed
	var ai_result := await AIService.generate_world(seed)
	if str(ai_result.get("status", "ok")) != "ok":
		record_ai_log("world_expand", ai_result, "初始世界扩写失败：%s" % seed.get("world_name", "未命名世界"))
		world_updated.emit({"type": "ai_response_rejected", "reason": "world_expand_failed"})
		return
	if not validate_world_expand_result(ai_result):
		record_ai_log("world_expand_rejected", {"status": "error", "error": "invalid_world_expand", "request_id": ai_result.get("request_id", "")}, "世界扩写响应缺少必要字段")
		world_updated.emit({"type": "ai_response_rejected", "reason": "invalid_world_expand"})
		return
	var now := Time.get_datetime_string_from_system(true)
	var world_id := "world_%d" % Time.get_unix_time_from_system()
	world = {
		"id": world_id,
		"name": str(seed.get("world_name", "未命名世界")),
		"genre": str(seed.get("genre", "奇幻")),
		"tone": [str(seed.get("tone", "冒险"))],
		"current_time": {"day": 1, "hour": 8, "calendar_label": "第一纪元 1001 年 春"},
		"summary": str(ai_result.get("summary", "")),
		"rules": ai_result.get("rules", []),
		"themes": ai_result.get("themes", []),
		"content_limits": _content_limits_from_seed(seed),
		"narrative_detail": str(seed.get("narrative_detail", "适中")),
		"npc_autonomy_frequency": str(seed.get("npc_autonomy_frequency", "中频")),
		"map_image": {},
		"map_routes": [],
		"phase_summaries": [],
		"summary_event_cursor": 0,
		"created_at": now,
		"schema_version": SCHEMA_VERSION
	}

	locations.clear()
	for location in ai_result.get("locations", []):
		var loc := location as Dictionary
		loc["connected_location_ids"] = _default_connections(str(loc.get("id", "")))
		loc["event_ids"] = []
		loc["player_notes"] = ""
		loc["player_notes_updated_at"] = ""
		loc["known_to_player"] = true
		loc["visibility"] = "known_to_player"
		locations.append(loc)

	characters = _build_characters(seed)
	_ensure_relationships()
	factions = _build_factions(seed)
	_sync_location_control_from_factions()
	timeline.clear()
	memories.clear()
	ai_logs.clear()
	threads.clear()
	_event_counter = 0
	_memory_counter = 0
	_location_counter = 100
	_thread_counter = 0
	_generate_fantasy_map_for_seed(seed, "Azgaar 风格大陆地图", false)
	record_ai_log("world_expand", ai_result, "初始世界扩写：%s" % seed.get("world_name", "未命名世界"))

	var opening := ai_result.get("opening_event", {}) as Dictionary
	suggested_actions = []
	for item in opening.get("suggested_actions", []):
		suggested_actions.append(str(item))
	add_event("world_event", str(opening.get("title", "开局事件")), str(opening.get("description", "")), ["char_hero"], "loc_start", 0.9)
	add_memory("world", world_id, world.get("summary", ""), timeline.back().get("id", ""), 0.8, ["world", "opening"])
	_create_initial_threads(seed, timeline.back() as Dictionary)
	AppState.set_current_world(world_id)
	_auto_save()
	world_loaded.emit(world_id)
	world_updated.emit({"type": "world_created"})

func load_active_world() -> bool:
	var payload := SaveManager.load_game()
	if payload.is_empty():
		return false
	_load_payload(payload)
	return true

func load_imported_world(zip_path: String) -> bool:
	var payload := SaveManager.import_world(zip_path)
	if payload.is_empty():
		return false
	_load_payload(payload)
	world_updated.emit({"type": "world_imported", "world_id": world.get("id", "")})
	return true

func _load_payload(payload: Dictionary) -> void:
	world = payload.get("world", {})
	characters = _to_dict_array(payload.get("characters", []))
	locations = _to_dict_array(payload.get("locations", []))
	factions = _to_dict_array(payload.get("factions", []))
	timeline = _to_dict_array(payload.get("timeline", []))
	memories = _to_dict_array(payload.get("memories", []))
	ai_logs = _to_dict_array(payload.get("ai_logs", []))
	threads = _to_dict_array(payload.get("threads", []))
	suggested_actions = _to_string_array(payload.get("suggested_actions", []))
	_event_counter = int(payload.get("event_counter", timeline.size()))
	_memory_counter = int(payload.get("memory_counter", memories.size()))
	_location_counter = int(payload.get("location_counter", 100))
	_thread_counter = int(payload.get("thread_counter", _count_thread_ids(threads)))
	if factions.is_empty() and not world.is_empty():
		factions = _build_factions({"world_name": world.get("name", "世界"), "genre": world.get("genre", "奇幻")})
		_sync_location_control_from_factions()
	_ensure_relationships()
	_ensure_character_notes()
	_ensure_location_notes()
	_ensure_location_visibility()
	AppState.set_current_world(str(world.get("id", "")))
	world_loaded.emit(str(world.get("id", "")))
	world_updated.emit({"type": "world_loaded"})

func export_payload() -> Dictionary:
	return {
		"schema_version": SCHEMA_VERSION,
		"world": world,
		"characters": characters,
		"locations": locations,
		"factions": factions,
		"timeline": timeline,
		"memories": memories,
		"ai_logs": ai_logs,
		"threads": threads,
		"suggested_actions": suggested_actions,
		"event_counter": _event_counter,
		"memory_counter": _memory_counter,
		"location_counter": _location_counter,
		"thread_counter": _thread_counter,
		"updated_at": Time.get_datetime_string_from_system(true)
	}

func import_map_image(source_path: String, display_name: String = "大陆地图") -> bool:
	if world.is_empty() or source_path.strip_edges().is_empty():
		return false
	var normalized_source := source_path.strip_edges()
	if not FileAccess.file_exists(normalized_source):
		AppState.set_error("地图图片不存在：%s" % normalized_source)
		return false
	var extension := normalized_source.get_extension().to_lower()
	if not extension in ["png", "jpg", "jpeg", "webp"]:
		AppState.set_error("不支持的地图格式：%s" % extension)
		return false
	var image := Image.new()
	var image_error := image.load(normalized_source)
	if image_error != OK:
		AppState.set_error("无法读取地图图片：%s" % error_string(image_error))
		return false
	var maps_dir := "user://saves/maps"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(maps_dir))
	var original_size := Vector2i(image.get_width(), image.get_height())
	var resized := _resize_map_image_if_needed(image)
	var target_extension := "png" if resized else extension
	var target_path := "%s/map_001.%s" % [maps_dir, target_extension]
	if not _write_imported_map_image(normalized_source, target_path, image, resized):
		return false
	var location_ids: Array[String] = []
	for location in locations:
		location_ids.append(str(location.get("id", "")))
	world.erase("map_generator")
	world["map_image"] = {
		"id": "map_001",
		"name": display_name,
		"image_path": target_path,
		"width": image.get_width(),
		"height": image.get_height(),
		"original_width": original_size.x,
		"original_height": original_size.y,
		"max_dimension": MAX_MAP_IMAGE_DIMENSION,
		"resized_for_device": resized,
		"scale_label": "未设置比例尺",
		"locations": location_ids,
		"routes": get_map_routes(),
		"generator": {}
	}
	var event_id := add_event("world_event", "导入地图：%s" % display_name, "你导入了一张自定义地图图片，后续地点标注会叠加在这张地图上。", ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.45)
	add_memory("world", str(world.get("id", "")), "玩家导入地图图片：%s" % display_name, event_id, 0.45, ["map", "import"])
	_auto_save()
	world_updated.emit({"type": "map_image_imported", "image_path": target_path})
	return true

func generate_fantasy_map(display_name: String = "Azgaar 风格大陆地图") -> bool:
	if world.is_empty():
		return false
	var seed := _current_map_seed()
	return _generate_fantasy_map_for_seed(seed, display_name, true)

func generate_fantasy_map_from_reference(source_path: String, display_name: String = "参考图生成地图") -> bool:
	if world.is_empty() or source_path.strip_edges().is_empty():
		return false
	var seed := _current_map_seed()
	return _generate_fantasy_map_from_reference_for_seed(source_path.strip_edges(), seed, display_name, true)

func _generate_fantasy_map_for_seed(seed: Dictionary, display_name: String, record_event: bool) -> bool:
	if world.is_empty():
		return false
	var maps_dir := "user://saves/maps"
	var target_path := "%s/map_001.png" % maps_dir
	var generator = FANTASY_MAP_GENERATOR_SCRIPT.new()
	var result: Dictionary = generator.generate(seed, locations.duplicate(true), factions.duplicate(true), target_path)
	if str(result.get("status", "error")) != "ok":
		AppState.set_error(str(result.get("error", "地图生成失败。")))
		return false
	_apply_generated_map_result(result, display_name)
	if record_event:
		var event_id := add_event(
			"world_event",
			"生成地图：%s" % display_name,
			"系统根据当前世界地点、势力和种子生成了一张 Azgaar 风格的幻想地图。",
			["char_hero"],
			str(get_current_location().get("id", "loc_start")),
			0.42
		)
		add_memory("world", str(world.get("id", "")), "生成幻想地图：%s" % display_name, event_id, 0.4, ["map", "generation", GENERATED_MAP_SOURCE])
		_auto_save()
		world_updated.emit({"type": "fantasy_map_generated", "image_path": result.get("image_path", "")})
	return true

func _generate_fantasy_map_from_reference_for_seed(source_path: String, seed: Dictionary, display_name: String, record_event: bool) -> bool:
	if world.is_empty():
		return false
	var maps_dir := "user://saves/maps"
	var target_path := "%s/map_001.png" % maps_dir
	var generator = FANTASY_MAP_GENERATOR_SCRIPT.new()
	var result: Dictionary = generator.generate_from_reference_image(source_path, seed, locations.duplicate(true), factions.duplicate(true), target_path)
	if str(result.get("status", "error")) != "ok":
		AppState.set_error(str(result.get("error", "参考图生成地图失败。")))
		return false
	_apply_generated_map_result(result, display_name)
	if record_event:
		var event_id := add_event(
			"world_event",
			"参考图生成地图：%s" % display_name,
			"系统读取参考图的海岸、地形颜色和红色边界，生成了一张可标注、可进入 AI 上下文的地图。",
			["char_hero"],
			str(get_current_location().get("id", "loc_start")),
			0.43
		)
		add_memory("world", str(world.get("id", "")), "根据参考图生成地图：%s" % display_name, event_id, 0.42, ["map", "generation", "reference_image"])
		_auto_save()
		world_updated.emit({"type": "fantasy_map_generated_from_reference", "image_path": result.get("image_path", ""), "source_path": source_path})
	return true

func _apply_generated_map_result(result: Dictionary, display_name: String) -> void:
	var updates: Array[Dictionary] = _to_dict_array(result.get("location_updates", []))
	for update in updates:
		var location_id := str(update.get("id", ""))
		for index in range(locations.size()):
			if str(locations[index].get("id", "")) != location_id:
				continue
			locations[index]["map_id"] = str(update.get("map_id", "map_001"))
			locations[index]["position"] = (update.get("position", {}) as Dictionary).duplicate(true)
			locations[index]["azgaar_burg"] = (update.get("azgaar_burg", {}) as Dictionary).duplicate(true)
			locations[index]["biome"] = str(update.get("biome", ""))
			locations[index]["height"] = int(update.get("height", 0))
			break
	var generated_routes := _to_dict_array(result.get("routes", []))
	world["map_routes"] = _merge_generated_map_routes(generated_routes)
	var location_ids: Array[String] = []
	for location in locations:
		location_ids.append(str(location.get("id", "")))
	var generator_meta := result.get("generator", {}) as Dictionary
	world["map_generator"] = generator_meta.duplicate(true)
	world["map_image"] = {
		"id": "map_001",
		"name": display_name,
		"image_path": str(result.get("image_path", "")),
		"width": int(result.get("width", 0)),
		"height": int(result.get("height", 0)),
		"original_width": int(result.get("width", 0)),
		"original_height": int(result.get("height", 0)),
		"max_dimension": MAX_MAP_IMAGE_DIMENSION,
		"resized_for_device": false,
		"scale_label": "生成地图：归一化坐标",
		"locations": location_ids,
		"routes": get_map_routes(),
		"generator": generator_meta
	}

func _merge_generated_map_routes(generated_routes: Array[Dictionary]) -> Array[Dictionary]:
	var merged: Array[Dictionary] = []
	var seen_pairs: Dictionary = {}
	for route in get_map_routes():
		var data := route as Dictionary
		if str(data.get("source", "")) == GENERATED_MAP_SOURCE:
			continue
		var from_id := str(data.get("from_location_id", ""))
		var to_id := str(data.get("to_location_id", ""))
		if from_id.is_empty() or to_id.is_empty():
			continue
		seen_pairs[_map_route_pair_key(from_id, to_id)] = true
		merged.append(data.duplicate(true))
	var generated_index := 1
	for route in generated_routes:
		var data := route.duplicate(true)
		var from_id := str(data.get("from_location_id", ""))
		var to_id := str(data.get("to_location_id", ""))
		if from_id.is_empty() or to_id.is_empty():
			continue
		var key := _map_route_pair_key(from_id, to_id)
		if seen_pairs.has(key):
			continue
		seen_pairs[key] = true
		data["id"] = "route_fmg_%04d" % generated_index
		data["source"] = GENERATED_MAP_SOURCE
		generated_index += 1
		merged.append(data)
	return merged

func _map_route_pair_key(from_location_id: String, to_location_id: String) -> String:
	return "%s::%s" % [from_location_id, to_location_id] if from_location_id < to_location_id else "%s::%s" % [to_location_id, from_location_id]

func _current_map_seed() -> Dictionary:
	var hero := get_character("char_hero")
	return {
		"world_name": str(world.get("name", "未命名世界")),
		"genre": str(world.get("genre", "奇幻")),
		"tone": ",".join(_to_string_array(world.get("tone", []))),
		"limits": ",".join(_to_string_array(world.get("content_limits", []))),
		"hero": {
			"name": str(hero.get("name", "主角")),
			"description": str(hero.get("description", "")),
			"goal": str(hero.get("goals", []))
		}
	}

func _resize_map_image_if_needed(image: Image) -> bool:
	var width := image.get_width()
	var height := image.get_height()
	var longest := maxi(width, height)
	if longest <= MAX_MAP_IMAGE_DIMENSION:
		return false
	var scale := float(MAX_MAP_IMAGE_DIMENSION) / float(longest)
	var target_width := maxi(1, int(round(float(width) * scale)))
	var target_height := maxi(1, int(round(float(height) * scale)))
	image.resize(target_width, target_height, Image.INTERPOLATE_LANCZOS)
	return true

func _write_imported_map_image(source_path: String, target_path: String, image: Image, resized: bool) -> bool:
	if resized:
		var save_error := image.save_png(target_path)
		if save_error != OK:
			AppState.set_error("无法写入缩放后的地图图片：%s" % error_string(save_error))
			return false
		return true
	var bytes := FileAccess.get_file_as_bytes(source_path)
	if bytes.is_empty():
		AppState.set_error("地图图片为空或无法读取。")
		return false
	var output := FileAccess.open(target_path, FileAccess.WRITE)
	if output == null:
		AppState.set_error("无法写入地图图片。")
		return false
	output.store_buffer(bytes)
	output.close()
	return true

func _sync_map_image_routes() -> void:
	var map_image := world.get("map_image", {}) as Dictionary
	if map_image.is_empty():
		return
	map_image["routes"] = get_map_routes()
	world["map_image"] = map_image

func _remove_routes_for_location(location_id: String) -> void:
	var kept: Array[Dictionary] = []
	for route in get_map_routes():
		if str(route.get("from_location_id", "")) == location_id or str(route.get("to_location_id", "")) == location_id:
			continue
		kept.append(route)
	world["map_routes"] = kept
	_sync_map_image_routes()

func _location_distance(from_location: Dictionary, to_location: Dictionary) -> float:
	var from_position := from_location.get("position", {}) as Dictionary
	var to_position := to_location.get("position", {}) as Dictionary
	var from_point := Vector2(float(from_position.get("x", 0.5)), float(from_position.get("y", 0.5)))
	var to_point := Vector2(float(to_position.get("x", 0.5)), float(to_position.get("y", 0.5)))
	return from_point.distance_to(to_point)

func submit_player_action(action: String) -> void:
	if action.strip_edges().is_empty() or world.is_empty():
		return
	var content_boundary := evaluate_content_boundary(action)
	if bool(content_boundary.get("blocked", false)):
		_apply_content_boundary_block(action.strip_edges(), content_boundary)
		return
	var before_snapshot := get_snapshot()
	_save_ai_checkpoint()
	_auto_save()
	var result := await AIService.resolve_player_action(action.strip_edges(), before_snapshot)
	record_ai_log("player_action", result, "玩家行动：%s" % action.strip_edges())
	if not validate_player_action_result(result):
		AppState.set_error("AI 返回的行动结果不完整，已忽略本次结果，世界状态未改变。")
		world_updated.emit({"type": "ai_response_rejected", "reason": "invalid_player_action_result"})
		_auto_save()
		return
	advance_time(int(result.get("time_delta_hours", 1)))
	var patches := _to_dict_array(result.get("patches", []))
	if not patches.is_empty() and not apply_state_patches(patches):
		AppState.set_error("AI 返回的状态变更未通过校验，已拒绝应用以保护世界一致性。")
		record_ai_log("player_action_rejected", {"status": "error", "error": "invalid_state_patch", "request_id": result.get("request_id", "")}, "状态变更校验失败")
		_auto_save()
		return
	var event_id := add_event(
		str(result.get("event_type", "player_action")),
		str(result.get("event_title", "行动结果")),
		str(result.get("narrative", "")),
		["char_hero"],
		str(get_current_location().get("id", "loc_start")),
		float(result.get("importance", 0.6)),
		_action_resolution_from_result(result)
	)
	add_memory("character", "char_hero", str(result.get("memory_text", action)), event_id, 0.7, ["player_action"])
	_update_relationships_from_player_action(action, result, event_id)
	_update_threads_from_event(action, result, event_id)
	suggested_actions = _to_string_array(result.get("suggested_actions", []))
	await run_npc_tick()
	run_faction_tick(false)
	refresh_summaries(false)
	_auto_save()
	world_updated.emit({"type": "player_action", "event_id": event_id})

func evaluate_content_boundary(text: String) -> Dictionary:
	var matched_terms: Array[String] = []
	var normalized_text := _normalize_policy_text(text)
	for term in _content_block_terms():
		var normalized_term := _normalize_policy_text(term)
		if normalized_term.is_empty():
			continue
		if normalized_text.contains(normalized_term):
			_append_unique_string(matched_terms, term)
	if matched_terms.is_empty():
		return {"blocked": false, "matched_terms": []}
	return {
		"blocked": true,
		"matched_terms": matched_terms,
		"reason": "命中禁用内容：%s" % "、".join(matched_terms),
		"consequence": "未向 AI 发送请求，也不会生成被禁用的细节；请改用淡出、概述或替代目标。"
	}

func _apply_content_boundary_block(action: String, boundary: Dictionary) -> void:
	var location_id := str(get_current_location().get("id", "loc_start"))
	var reason := str(boundary.get("reason", "命中内容边界。"))
	var consequence := str(boundary.get("consequence", "未向 AI 发送请求。"))
	var event_id := add_event(
		"player_action",
		"内容边界：行动受阻",
		"该行动触及当前内容边界，系统已在本地拦截：%s" % action.left(120),
		["char_hero"],
		location_id,
		0.32,
		{"outcome": "blocked", "outcome_reason": reason, "consequence": consequence}
	)
	add_memory("character", "char_hero", "内容边界拦截了玩家行动：%s" % action.left(80), event_id, 0.35, ["content_safety", "player_action"])
	suggested_actions = ["改用淡出处理", "询问安全替代线索", "调整内容偏好", "选择其他行动"]
	# Use a notice (not an error) so the UI doesn't offer a "retry" affordance —
	# resubmitting the same blocked text would just be blocked again. The reason
	# is also captured in the timeline event above.
	AppState.set_notice(reason)
	_auto_save()
	world_updated.emit({"type": "content_boundary_blocked", "event_id": event_id})

func run_npc_tick() -> void:
	if world.is_empty():
		return
	var generated := await SimulationEngine.advance_world(get_snapshot(), _npc_events_per_tick())
	for event in generated:
		var data := event as Dictionary
		record_ai_log("npc_simulation", data, "NPC 自主行动")
		if not validate_npc_event_result(data):
			record_ai_log("npc_simulation_rejected", {"status": "error", "error": "invalid_npc_event", "request_id": data.get("request_id", "")}, "NPC 事件响应缺少必要字段或引用无效")
			continue
		var character_id := str(data.get("character_id", ""))
		var new_location_id := str(data.get("new_location_id", ""))
		if not character_id.is_empty() and not new_location_id.is_empty():
			_update_character_location(character_id, new_location_id)
		var event_id := add_event(
			str(data.get("type", "npc_action")),
			str(data.get("title", "NPC 行动")),
			str(data.get("description", "")),
			[character_id],
			new_location_id,
			float(data.get("importance", 0.35))
		)
		add_memory("character", character_id, str(data.get("description", "")), event_id, 0.45, ["npc", "simulation"])

func _npc_events_per_tick() -> int:
	match str(world.get("npc_autonomy_frequency", "中频")):
		"低频":
			return 1
		"高频":
			return 3
		_:
			return 2

func run_faction_tick(force: bool = false) -> bool:
	if world.is_empty() or factions.is_empty() or locations.is_empty():
		return false
	var current_hour := _absolute_world_hour(world.get("current_time", {}) as Dictionary)
	var last_tick_hour := int(world.get("last_faction_tick_hour", current_hour))
	if not force and current_hour - last_tick_hour < 6:
		return false
	world["last_faction_tick_hour"] = current_hour
	var faction_index: int = absi(current_hour + timeline.size()) % factions.size()
	var faction := factions[faction_index] as Dictionary
	if str(faction.get("status", "active")) != "active":
		return false
	var target_location := _select_faction_target(faction)
	if target_location.is_empty():
		return false
	var faction_id := str(faction.get("id", ""))
	var previous_controller := str(target_location.get("controlling_faction_id", ""))
	var pressure := int(faction.get("influence", 50)) + int(faction.get("resources", 50)) / 2
	var title := "%s推进势力目标" % faction.get("name", "某个势力")
	var description := "%s围绕%s展开行动，目标是%s。" % [
		faction.get("name", "某个势力"),
		target_location.get("name", "未知地点"),
		faction.get("current_goal", "扩大影响")
	]
	var changed_control := false
	if previous_controller != faction_id and pressure >= 78:
		_set_location_controller(str(target_location.get("id", "")), faction_id)
		_add_controlled_location(faction_id, str(target_location.get("id", "")))
		if not previous_controller.is_empty():
			_remove_controlled_location(previous_controller, str(target_location.get("id", "")))
		description += "当地控制权转向%s。" % faction.get("name", "该势力")
		changed_control = true
	else:
		_append_location_tag(str(target_location.get("id", "")), "faction_pressure")
		description += "控制权暂未改变，但该地点出现了新的势力压力。"
	for index in range(factions.size()):
		if str(factions[index].get("id", "")) == faction_id:
			factions[index]["current_action"] = description
			factions[index]["resources"] = maxi(0, int(factions[index].get("resources", 50)) - (8 if changed_control else 4))
			factions[index]["influence"] = mini(100, int(factions[index].get("influence", 50)) + (6 if changed_control else 2))
			factions[index]["last_action_world_time"] = world.get("current_time", {}).duplicate(true)
			break
	var event_id := add_event("faction_action", title, description, [], str(target_location.get("id", "")), 0.58 if changed_control else 0.42)
	add_memory("faction", faction_id, description, event_id, 0.55 if changed_control else 0.4, ["faction", "control" if changed_control else "pressure"])
	world_updated.emit({"type": "faction_tick", "event_id": event_id, "faction_id": faction_id, "changed_control": changed_control})
	return true

func advance_day() -> Dictionary:
	if world.is_empty():
		return {}
	var start_event_count := timeline.size()
	var start_day := int((world.get("current_time", {}) as Dictionary).get("day", 1))
	var start_hour := int((world.get("current_time", {}) as Dictionary).get("hour", 8))
	advance_time(24)
	for i in range(3):
		await run_npc_tick()
		run_faction_tick(true)
	var generated_count := timeline.size() - start_event_count
	var recent_events := timeline.slice(start_event_count, timeline.size())
	var highlights: Array[String] = []
	for item in recent_events:
		var event := item as Dictionary
		if str(event.get("type", "")) == "day_advance":
			continue
		highlights.append(str(event.get("title", "事件")))
	var summary_text := "你休整并观察了一整天。世界时间从第%d日%02d:00 推进到第%s日%02d:00，期间记录了 %d 条世界变化。" % [
		start_day,
		start_hour,
		(world.get("current_time", {}) as Dictionary).get("day", 1),
		int((world.get("current_time", {}) as Dictionary).get("hour", 8)),
		generated_count
	]
	if not highlights.is_empty():
		summary_text += " 关键变化：%s。" % "、".join(highlights.slice(0, mini(6, highlights.size())))
	var event_id := add_event("day_advance", "推进一天", summary_text, ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.62)
	add_memory("world", str(world.get("id", "")), summary_text, event_id, 0.62, ["day_advance", "offline_progress"])
	_update_threads_from_event("推进一天", {"narrative": summary_text, "suggested_actions": suggested_actions}, event_id)
	suggested_actions = ["查看一天内的变化", "询问附近角色", "检查势力控制", "继续探索"]
	refresh_summaries(false)
	_auto_save()
	var result := {"event_id": event_id, "generated_events": generated_count, "summary": summary_text}
	world_updated.emit({"type": "day_advanced", "event_id": event_id, "generated_events": generated_count})
	return result

func advance_time(hours: int) -> void:
	var current := world.get("current_time", {}) as Dictionary
	var day := int(current.get("day", 1))
	var hour := int(current.get("hour", 8)) + maxi(hours, 0)
	while hour >= 24:
		day += 1
		hour -= 24
	current["day"] = day
	current["hour"] = hour
	world["current_time"] = current
	time_advanced.emit(current.duplicate(true))

func add_event(type: String, title: String, description: String, participants: Array, location_id: String, importance: float, metadata: Dictionary = {}) -> String:
	_event_counter += 1
	var event_id := "evt_%04d" % _event_counter
	var event := {
		"id": event_id,
		"type": type,
		"title": title,
		"description": description,
		"world_time": world.get("current_time", {}).duplicate(true),
		"location_id": location_id,
		"participant_ids": participants,
		"effects": [],
		"importance": importance,
		"visibility": "known_to_player"
	}
	if not metadata.is_empty():
		event["metadata"] = metadata
		if metadata.has("outcome"):
			event["outcome"] = str(metadata.get("outcome", ""))
		if metadata.has("outcome_reason"):
			event["outcome_reason"] = str(metadata.get("outcome_reason", ""))
		if metadata.has("consequence"):
			event["consequence"] = str(metadata.get("consequence", ""))
	timeline.append(event)
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) == location_id:
			var event_ids: Array = locations[index].get("event_ids", [])
			event_ids.append(event_id)
			locations[index]["event_ids"] = event_ids
	for participant_id in participants:
		var character_id := str(participant_id)
		for index in range(characters.size()):
			if str(characters[index].get("id", "")) != character_id:
				continue
			var known_event_ids: Array = characters[index].get("known_event_ids", [])
			if not event_id in known_event_ids:
				known_event_ids.append(event_id)
			characters[index]["known_event_ids"] = known_event_ids
			break
	event_added.emit(event_id)
	return event_id

func add_memory(scope: String, owner_id: String, text: String, event_id: String, importance: float, tags: Array, facts: Array = [], confidence: float = 1.0) -> String:
	_memory_counter += 1
	var memory_id := "mem_%04d" % _memory_counter
	var memory := {
		"id": memory_id,
		"scope": scope,
		"owner_id": owner_id,
		"text": text,
		"event_id": event_id,
		"importance": importance,
		"confidence": confidence,
		"tags": tags,
		"created_world_time": world.get("current_time", {}).duplicate(true)
	}
	if not facts.is_empty():
		memory["facts"] = facts
	memories.append(memory)
	return memory_id

func record_ai_log(purpose: String, result: Dictionary, prompt_summary: String = "") -> void:
	var usage := result.get("usage", {}) as Dictionary
	var log_level := _current_log_level()
	var log_entry := {
		"id": str(result.get("request_id", "local_%04d" % (ai_logs.size() + 1))),
		"world_id": str(world.get("id", "")),
		"purpose": purpose,
		"model": str(SettingsStore.get_value("model", "local-simulator")),
		"log_level": log_level,
		"started_at": Time.get_datetime_string_from_system(true),
		"finished_at": Time.get_datetime_string_from_system(true),
		"status": str(result.get("status", "ok")),
		"error": str(result.get("error", "")),
		"usage": {
			"input_tokens": int(usage.get("input_tokens", 0)),
			"output_tokens": int(usage.get("output_tokens", 0)),
			"cost_estimate": usage.get("cost", null)
		}
	}
	if log_level in ["debug", "deep"]:
		log_entry["prompt_summary"] = _redact_sensitive(prompt_summary)
		log_entry["response_summary"] = _redact_sensitive(_summarize_ai_result(result))
	else:
		log_entry["prompt_summary"] = ""
		log_entry["response_summary"] = ""
	if log_level == "deep":
		log_entry["raw_response"] = _redact_sensitive(JSON.stringify(result))
	ai_logs.append(log_entry)
	if ai_logs.size() > 80:
		ai_logs = ai_logs.slice(ai_logs.size() - 80, ai_logs.size())

func get_ai_usage_summary() -> Dictionary:
	var by_purpose: Dictionary = {}
	var total_input_tokens := 0
	var total_output_tokens := 0
	var total_cost := 0.0
	var has_cost := false
	var success_count := 0
	var failed_count := 0
	for log_entry in ai_logs:
		var data := log_entry as Dictionary
		var purpose := str(data.get("purpose", "unknown"))
		var usage := data.get("usage", {}) as Dictionary
		var input_tokens := int(usage.get("input_tokens", 0))
		var output_tokens := int(usage.get("output_tokens", 0))
		total_input_tokens += input_tokens
		total_output_tokens += output_tokens
		if str(data.get("status", "ok")) == "ok":
			success_count += 1
		else:
			failed_count += 1
		var purpose_data: Dictionary = by_purpose.get(purpose, {"calls": 0, "input_tokens": 0, "output_tokens": 0})
		purpose_data["calls"] = int(purpose_data.get("calls", 0)) + 1
		purpose_data["input_tokens"] = int(purpose_data.get("input_tokens", 0)) + input_tokens
		purpose_data["output_tokens"] = int(purpose_data.get("output_tokens", 0)) + output_tokens
		by_purpose[purpose] = purpose_data
		var cost_value: Variant = usage.get("cost_estimate", null)
		if cost_value is int or cost_value is float:
			total_cost += float(cost_value)
			has_cost = true
	return {
		"calls": ai_logs.size(),
		"success_count": success_count,
		"failed_count": failed_count,
		"input_tokens": total_input_tokens,
		"output_tokens": total_output_tokens,
		"total_tokens": total_input_tokens + total_output_tokens,
		"estimated_cost": total_cost,
		"has_cost": has_cost,
		"by_purpose": by_purpose
	}

func export_ai_logs() -> String:
	return SaveManager.export_ai_logs(str(world.get("id", "")), ai_logs)

func ai_logs_summary_text(limit: int = 8) -> String:
	var lines: Array[String] = []
	lines.append("Evolvria AI 日志摘要")
	lines.append("世界：%s" % str(world.get("name", "未命名世界")))
	var summary := get_ai_usage_summary()
	lines.append("调用：%d 次 · 成功 %d · 失败 %d · Token %d" % [
		int(summary.get("calls", 0)),
		int(summary.get("success_count", 0)),
		int(summary.get("failed_count", 0)),
		int(summary.get("total_tokens", 0))
	])
	var start := maxi(0, ai_logs.size() - limit)
	for index in range(ai_logs.size() - 1, start - 1, -1):
		var log_entry := ai_logs[index]
		var usage := log_entry.get("usage", {}) as Dictionary
		var response_summary := str(log_entry.get("response_summary", ""))
		if response_summary.is_empty():
			response_summary = str(log_entry.get("error", ""))
		lines.append("%s · %s · %s · in %d / out %d" % [
			log_entry.get("id", ""),
			log_entry.get("purpose", ""),
			log_entry.get("status", ""),
			int(usage.get("input_tokens", 0)),
			int(usage.get("output_tokens", 0))
		])
		if not response_summary.is_empty():
			lines.append(response_summary.left(220))
	return "\n".join(lines)

func validate_world_consistency() -> Array[Dictionary]:
	var issues: Array[Dictionary] = []
	var location_ids := _id_set(locations)
	var character_ids := _id_set(characters)
	var event_ids := _id_set(timeline)
	var last_time_score := -1
	for character in characters:
		var character_id := str(character.get("id", ""))
		var location_id := str(character.get("current_location_id", ""))
		if not location_id.is_empty() and not location_ids.has(location_id):
			issues.append(_consistency_issue("character_location_missing", character_id, "Character references an unknown location: %s" % location_id))
		var relationships: Dictionary = character.get("relationships", {}) if character.get("relationships", {}) is Dictionary else {}
		for target_id in relationships.keys():
			if not character_ids.has(str(target_id)):
				issues.append(_consistency_issue("relationship_target_missing", character_id, "Relationship target is missing: %s" % target_id))
	for event in timeline:
		var event_id := str(event.get("id", ""))
		if event_id.is_empty():
			issues.append(_consistency_issue("event_id_missing", "", "Timeline event is missing an id."))
		var time := event.get("world_time", {}) as Dictionary
		var time_score := int(time.get("day", 0)) * 24 + int(time.get("hour", 0))
		if time_score < last_time_score:
			issues.append(_consistency_issue("timeline_out_of_order", event_id, "Timeline event is earlier than the previous event."))
		last_time_score = maxi(last_time_score, time_score)
		var location_id := str(event.get("location_id", ""))
		if not location_id.is_empty() and not location_ids.has(location_id):
			issues.append(_consistency_issue("event_location_missing", event_id, "Event references an unknown location: %s" % location_id))
		for participant_id in event.get("participant_ids", []):
			if not character_ids.has(str(participant_id)):
				issues.append(_consistency_issue("event_participant_missing", event_id, "Event references an unknown participant: %s" % participant_id))
	for memory in memories:
		var memory_id := str(memory.get("id", ""))
		var event_id := str(memory.get("event_id", ""))
		if not event_id.is_empty() and not event_ids.has(event_id):
			issues.append(_consistency_issue("memory_event_missing", memory_id, "Memory references an unknown event: %s" % event_id))
	for location in locations:
		var location_id := str(location.get("id", ""))
		for event_id in location.get("event_ids", []):
			if not event_ids.has(str(event_id)):
				issues.append(_consistency_issue("location_event_missing", location_id, "Location references an unknown event: %s" % event_id))
	for faction in factions:
		var faction_id := str(faction.get("id", ""))
		for location_id in faction.get("controlled_location_ids", []):
			if not location_ids.has(str(location_id)):
				issues.append(_consistency_issue("faction_location_missing", faction_id, "Faction controls an unknown location: %s" % location_id))
	for route in get_map_routes():
		var route_id := str(route.get("id", ""))
		var from_location_id := str(route.get("from_location_id", ""))
		var to_location_id := str(route.get("to_location_id", ""))
		if not location_ids.has(from_location_id):
			issues.append(_consistency_issue("route_location_missing", route_id, "Route starts at an unknown location: %s" % from_location_id))
		if not location_ids.has(to_location_id):
			issues.append(_consistency_issue("route_location_missing", route_id, "Route ends at an unknown location: %s" % to_location_id))
	for thread in threads:
		var thread_id := str(thread.get("id", ""))
		for event_id in thread.get("event_ids", []):
			if not event_ids.has(str(event_id)):
				issues.append(_consistency_issue("thread_event_missing", thread_id, "Thread references an unknown event: %s" % event_id))
		for character_id in thread.get("related_character_ids", []):
			if not character_ids.has(str(character_id)):
				issues.append(_consistency_issue("thread_character_missing", thread_id, "Thread references an unknown character: %s" % character_id))
		for location_id in thread.get("related_location_ids", []):
			if not location_ids.has(str(location_id)):
				issues.append(_consistency_issue("thread_location_missing", thread_id, "Thread references an unknown location: %s" % location_id))
	return issues

func run_consistency_check() -> Dictionary:
	if world.is_empty():
		return {}
	var issues := validate_world_consistency()
	var snapshot := {
		"context": build_ai_context("consistency_check"),
		"issues": issues,
		"counts": {
			"characters": characters.size(),
			"locations": locations.size(),
			"events": timeline.size(),
			"memories": memories.size(),
			"threads": threads.size(),
			"routes": get_map_routes().size()
		}
	}
	var result := await AIService.check_consistency(snapshot)
	record_ai_log("consistency_check", result, "检查世界引用、时间线顺序、记忆、路线和线索一致性。")
	_auto_save()
	world_updated.emit({"type": "consistency_checked", "issue_count": issues.size()})
	return result

func run_memory_extract(event_id: String = "") -> Dictionary:
	if world.is_empty() or timeline.is_empty():
		return {}
	var event := _event_by_id(event_id)
	if event.is_empty():
		event = (timeline.back() as Dictionary).duplicate(true)
	var snapshot := {
		"world_id": str(world.get("id", "")),
		"context": build_ai_context("memory_extract"),
		"event": event
	}
	var result := await AIService.extract_memory(snapshot)
	if str(result.get("status", "")) != "ok":
		record_ai_log("memory_extract", result, "从事件 %s 抽取记忆。失败或取消。" % event.get("id", ""))
		return result
	var written_count := 0
	for item in result.get("memories", []):
		var memory := item as Dictionary
		var text := str(memory.get("text", "")).strip_edges()
		var owner_id := str(memory.get("owner_id", ""))
		if text.is_empty() or owner_id.is_empty():
			continue
		add_memory(
			str(memory.get("scope", "world")),
			owner_id,
			text,
			str(memory.get("event_id", event.get("id", ""))),
			float(memory.get("importance", 0.45)),
			memory.get("tags", ["memory_extract"]) as Array,
			memory.get("facts", []) as Array,
			float(memory.get("confidence", 1.0))
		)
		written_count += 1
	result["written_memories"] = written_count
	record_ai_log("memory_extract", result, "从事件 %s 抽取事实、记忆和未解决线索。" % event.get("id", ""))
	_auto_save()
	world_updated.emit({"type": "memory_extract", "event_id": event.get("id", ""), "written_memories": written_count})
	return result

func clear_ai_logs() -> void:
	ai_logs.clear()
	_auto_save()
	world_updated.emit({"type": "ai_logs_cleared"})

func add_developer_event(title: String, description: String, event_type: String = "developer_note") -> String:
	if not bool(SettingsStore.get_value("developer_mode", false)):
		return ""
	if world.is_empty() or title.strip_edges().is_empty():
		return ""
	var normalized_type := event_type.strip_edges()
	if normalized_type.is_empty():
		normalized_type = "developer_note"
	var event_id := add_event(
		normalized_type,
		title.strip_edges(),
		description.strip_edges() if not description.strip_edges().is_empty() else "开发者手动记录。",
		["char_hero"],
		str(get_current_location().get("id", "loc_start")),
		0.25,
		{"outcome": "quiet", "outcome_reason": "开发者模式手动记录。", "consequence": "用于调试世界状态，不代表 AI 自动生成。"}
	)
	add_memory("world", str(world.get("id", "")), "开发者事件：%s" % title.strip_edges(), event_id, 0.25, ["developer", "manual"])
	_auto_save()
	world_updated.emit({"type": "developer_event_added", "event_id": event_id})
	return event_id

func run_summary_update(force: bool = false) -> Dictionary:
	if world.is_empty() or timeline.is_empty():
		return {}
	var cursor := int(world.get("summary_event_cursor", 0))
	cursor = clampi(cursor, 0, timeline.size())
	var pending_count := timeline.size() - cursor
	if pending_count <= 0:
		return {}
	if not force and pending_count < SUMMARY_EVENT_THRESHOLD:
		return {}
	var end_index := mini(timeline.size(), cursor + SUMMARY_WINDOW_LIMIT)
	var events := timeline.slice(cursor, end_index)
	if events.is_empty():
		return {}
	var phase_index := (world.get("phase_summaries", []) as Array).size() + 1
	var draft_summary := _build_phase_summary(events, phase_index)
	var snapshot := {
		"context": build_ai_context("summary_update"),
		"draft_summary": draft_summary,
		"event_count": events.size(),
		"events": events,
		"character_summary_hints": _summary_hints_for_characters(events),
		"location_summary_hints": _summary_hints_for_locations(events)
	}
	var result := await AIService.update_summary(snapshot)
	if str(result.get("status", "")) != "ok":
		record_ai_log("summary_update", result, "更新阶段 %d 摘要失败或取消。" % phase_index)
		return result
	var applied_summary := draft_summary.duplicate(true)
	var ai_text := str(result.get("world_phase_summary", "")).strip_edges()
	if not ai_text.is_empty():
		applied_summary["text"] = ai_text.left(1200)
	var unresolved: Variant = result.get("unresolved_threads", applied_summary.get("unresolved_threads", []))
	if unresolved is Array:
		applied_summary["unresolved_threads"] = unresolved
	_apply_phase_summary(applied_summary, events, end_index)
	result["phase_summary"] = applied_summary
	result["summary_event_cursor"] = end_index
	record_ai_log("summary_update", result, "压缩 %d 条事件，更新世界/角色/地点摘要。" % events.size())
	return result

func refresh_summaries(force: bool = false) -> bool:
	if world.is_empty() or timeline.is_empty():
		return false
	var cursor := int(world.get("summary_event_cursor", 0))
	cursor = clampi(cursor, 0, timeline.size())
	var pending_count := timeline.size() - cursor
	if pending_count <= 0:
		return false
	if not force and pending_count < SUMMARY_EVENT_THRESHOLD:
		return false
	var end_index := mini(timeline.size(), cursor + SUMMARY_WINDOW_LIMIT)
	var events := timeline.slice(cursor, end_index)
	if events.is_empty():
		return false
	var phase_index := (world.get("phase_summaries", []) as Array).size() + 1
	var summary := _build_phase_summary(events, phase_index)
	_apply_phase_summary(summary, events, end_index)
	return true

func _apply_phase_summary(summary: Dictionary, events: Array, end_index: int) -> void:
	var phase_index := int(summary.get("phase_index", (world.get("phase_summaries", []) as Array).size() + 1))
	var phase_summaries: Array = world.get("phase_summaries", [])
	phase_summaries.append(summary)
	world["phase_summaries"] = phase_summaries
	world["summary_event_cursor"] = end_index
	world["summary"] = _merge_world_summary(str(world.get("summary", "")), summary)
	_update_character_summaries(events)
	_update_location_summaries(events)
	add_memory(
		"summary",
		str(world.get("id", "")),
		str(summary.get("text", "")),
		str((events.back() as Dictionary).get("id", "")),
		0.82,
		["summary", "phase_%02d" % phase_index]
	)
	_auto_save()
	world_updated.emit({"type": "summaries_refreshed", "phase_index": phase_index, "event_count": events.size()})

func build_ai_context(user_action: String) -> Dictionary:
	var current_location := get_current_location()
	var participant_ids: Array[String] = ["char_hero"]
	var companion_ids := get_companion_ids()
	for companion_id in companion_ids:
		_append_unique_string(participant_ids, companion_id)
	for character in characters:
		var data := character as Dictionary
		if str(data.get("current_location_id", "")) == str(current_location.get("id", "")):
			_append_unique_string(participant_ids, str(data.get("id", "")))
	return {
		"world_summary": world.get("summary", ""),
		"phase_summaries": _recent_phase_summaries(3),
		"world_rules": world.get("rules", []),
		"factions": factions.duplicate(true),
		"relationships": get_relationship_context(participant_ids),
		"current_time": world.get("current_time", {}),
		"map_state": build_map_ai_context(),
		"scene_state": {
			"location": current_location,
			"present_character_ids": participant_ids,
			"companion_character_ids": companion_ids,
			"nearby_locations": get_nearby_locations(str(current_location.get("id", "")), 5),
			"routes": _routes_for_location(str(current_location.get("id", ""))),
			"user_action": user_action
		},
		"recent_events": get_recent_events(8),
		"relevant_memories": retrieve_memories(user_action, str(current_location.get("id", "")), participant_ids, 8),
		"simulation_preferences": {
			"narrative_detail": str(world.get("narrative_detail", "适中")),
			"npc_autonomy_frequency": str(world.get("npc_autonomy_frequency", "中频"))
		},
		"content_limits": _active_content_limits()
	}

func build_map_ai_context() -> Dictionary:
	var map_image: Dictionary = world.get("map_image", {}) if world.get("map_image", {}) is Dictionary else {}
	var generator := _map_generator_metadata(map_image)
	var terrain := _map_terrain_context(generator)
	var coastlines := _map_coastline_context(generator)
	var rivers := _map_river_context(generator)
	return {
		"image": {
			"id": str(map_image.get("id", "map_001")),
			"name": str(map_image.get("name", "大陆地图")),
			"image_path": str(map_image.get("image_path", "")),
			"width": int(map_image.get("width", 0)),
			"height": int(map_image.get("height", 0)),
			"scale_label": str(map_image.get("scale_label", "归一化坐标"))
		},
		"source": {
			"project": str(generator.get("source_project", "")),
			"url": str(generator.get("source_url", "")),
			"license": str(generator.get("source_license", "")),
			"seed": int(generator.get("seed", 0)),
			"mode": str(generator.get("mode", ""))
		},
		"terrain": terrain,
		"coastlines": coastlines,
		"rivers": rivers,
		"region_borders": _map_region_border_context(generator),
		"locations": _map_locations_for_ai(),
		"routes": get_map_routes()
	}

func _map_generator_metadata(map_image: Dictionary) -> Dictionary:
	var world_generator: Variant = world.get("map_generator", {})
	if world_generator is Dictionary and not (world_generator as Dictionary).is_empty():
		return (world_generator as Dictionary).duplicate(true)
	var image_generator: Variant = map_image.get("generator", {})
	if image_generator is Dictionary:
		return (image_generator as Dictionary).duplicate(true)
	return {}

func _map_terrain_context(generator: Dictionary) -> Dictionary:
	var terrain_value: Variant = generator.get("terrain", {})
	if terrain_value is Dictionary and not (terrain_value as Dictionary).is_empty():
		return (terrain_value as Dictionary).duplicate(true)
	var model: Dictionary = generator.get("model", {}) if generator.get("model", {}) is Dictionary else {}
	return {
		"height_scale": str(model.get("height_scale", "0..100, land >= 20")),
		"water_level": 20,
		"land_threshold": 20,
		"biomes": str(model.get("biomes", "temperature + moisture + height"))
	}

func _map_coastline_context(generator: Dictionary) -> Dictionary:
	var coastlines_value: Variant = generator.get("coastlines", {})
	if coastlines_value is Dictionary and not (coastlines_value as Dictionary).is_empty():
		return (coastlines_value as Dictionary).duplicate(true)
	return {
		"generated": not generator.is_empty(),
		"source": "heightmap land-water adjacency",
		"style": "shoreline pixels"
	}

func _map_river_context(generator: Dictionary) -> Dictionary:
	var rivers_value: Variant = generator.get("rivers", {})
	if rivers_value is Dictionary and not (rivers_value as Dictionary).is_empty():
		return (rivers_value as Dictionary).duplicate(true)
	var river_count := 0
	if rivers_value is int or rivers_value is float:
		river_count = int(rivers_value)
	return {
		"generated": river_count > 0,
		"count": river_count,
		"source": "downhill highland tracing"
	}

func _map_region_border_context(generator: Dictionary) -> Dictionary:
	var borders_value: Variant = generator.get("region_borders", {})
	if borders_value is Dictionary and not (borders_value as Dictionary).is_empty():
		return (borders_value as Dictionary).duplicate(true)
	return {
		"generated": false,
		"source": "",
		"pixels": 0
	}

func _map_locations_for_ai() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for location in locations:
		var data := location as Dictionary
		var position: Dictionary = data.get("position", {}) if data.get("position", {}) is Dictionary else {}
		var burg: Dictionary = data.get("azgaar_burg", {}) if data.get("azgaar_burg", {}) is Dictionary else {}
		result.append({
			"id": str(data.get("id", "")),
			"name": str(data.get("name", "")),
			"type": str(data.get("type", "")),
			"description": str(data.get("description", "")).left(160),
			"position": position.duplicate(true),
			"biome": str(data.get("biome", "")),
			"height": int(data.get("height", 0)),
			"azgaar_burg": burg.duplicate(true),
			"controlling_faction_id": str(data.get("controlling_faction_id", "")),
			"known_to_player": is_location_known(data),
			"visibility": str(data.get("visibility", "known_to_player"))
		})
	return result

func get_recent_events(limit: int = 8) -> Array[Dictionary]:
	var start := maxi(0, timeline.size() - limit)
	return timeline.slice(start, timeline.size())

func get_timeline_filtered(type_filter: String = "", character_id: String = "", location_id: String = "") -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for event in timeline:
		var data := event as Dictionary
		if not type_filter.is_empty() and str(data.get("type", "")) != type_filter:
			continue
		if not location_id.is_empty() and str(data.get("location_id", "")) != location_id:
			continue
		if not character_id.is_empty() and not character_id in _to_string_array(data.get("participant_ids", [])):
			continue
		result.append(data)
	return result

func get_character_recent_events(character_id: String, limit: int = 3) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if character_id.is_empty() or limit <= 0:
		return result
	for index in range(timeline.size() - 1, -1, -1):
		var event := timeline[index] as Dictionary
		if not character_id in _to_string_array(event.get("participant_ids", [])):
			continue
		result.append(event)
		if result.size() >= limit:
			break
	return result

func get_characters_filtered(filter: String = "全部") -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for character in characters:
		var data := character as Dictionary
		if _character_matches_filter(data, filter):
			result.append(data)
	return result

func retrieve_memories(query: String, location_id: String, participant_ids: Array[String], limit: int = 8) -> Array[Dictionary]:
	var scored: Array[Dictionary] = []
	var terms := _tokenize(query + " " + _location_name_for_id(location_id))
	for memory in memories:
		var item := memory as Dictionary
		var score := float(item.get("importance", 0.0))
		if str(item.get("owner_id", "")) in participant_ids:
			score += 1.5
		for term in terms:
			if term.length() >= 2 and str(item.get("text", "")).contains(term):
				score += 0.7
		if score > 0.2:
			var copy := item.duplicate(true)
			copy["_score"] = score
			scored.append(copy)
	scored.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a.get("_score", 0.0)) > float(b.get("_score", 0.0))
	)
	var result: Array[Dictionary] = []
	for item in scored.slice(0, mini(limit, scored.size())):
		var copy := item as Dictionary
		copy.erase("_score")
		result.append(copy)
	return result

func add_custom_location(name: String, type: String, description: String, position: Vector2) -> String:
	if world.is_empty() or name.strip_edges().is_empty():
		return ""
	_location_counter += 1
	var location_id := "loc_custom_%03d" % _location_counter
	var clamped := Vector2(clampf(position.x, 0.05, 0.95), clampf(position.y, 0.05, 0.95))
	var location := {
		"id": location_id,
		"name": name.strip_edges(),
		"type": type.strip_edges() if not type.strip_edges().is_empty() else "custom",
		"description": description.strip_edges(),
		"map_id": "map_001",
		"position": {"x": clamped.x, "y": clamped.y},
		"connected_location_ids": [str(get_current_location().get("id", "loc_start"))],
		"controlling_faction_id": null,
		"state_tags": ["player_marked"],
		"known_to_player": true,
		"visibility": "known_to_player",
		"player_notes": "",
		"player_notes_updated_at": "",
		"event_ids": []
	}
	locations.append(location)
	var event_id := add_event("discovery", "标注地点：%s" % location.get("name", ""), "你在地图上标注了%s：%s" % [location.get("name", ""), location.get("description", "")], ["char_hero"], location_id, 0.5)
	add_memory("location", location_id, "玩家标注地点：%s" % location.get("name", ""), event_id, 0.5, ["map", "annotation"])
	_auto_save()
	world_updated.emit({"type": "location_added", "location_id": location_id})
	return location_id

func update_location(location_id: String, name: String, type: String, description: String, position: Vector2) -> bool:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		var clamped := Vector2(clampf(position.x, 0.05, 0.95), clampf(position.y, 0.05, 0.95))
		locations[index]["name"] = name.strip_edges() if not name.strip_edges().is_empty() else locations[index].get("name", "")
		locations[index]["type"] = type.strip_edges() if not type.strip_edges().is_empty() else locations[index].get("type", "custom")
		locations[index]["description"] = description.strip_edges()
		locations[index]["position"] = {"x": clamped.x, "y": clamped.y}
		var event_id := add_event("location_change", "更新地点：%s" % locations[index].get("name", ""), "你更新了地图地点%s的资料。" % locations[index].get("name", ""), ["char_hero"], location_id, 0.35)
		add_memory("location", location_id, "地点资料被玩家更新。", event_id, 0.35, ["map", "annotation"])
		_auto_save()
		world_updated.emit({"type": "location_updated", "location_id": location_id})
		return true
	return false

func update_location_position(location_id: String, position: Vector2) -> bool:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		var clamped := Vector2(clampf(position.x, 0.05, 0.95), clampf(position.y, 0.05, 0.95))
		locations[index]["position"] = {"x": clamped.x, "y": clamped.y}
		var location_name := str(locations[index].get("name", "未知地点"))
		var event_id := add_event("location_change", "移动地点标记：%s" % location_name, "你把%s的地图标记移动到了新的坐标。" % location_name, ["char_hero"], location_id, 0.28)
		add_memory("location", location_id, "玩家调整了地点地图坐标。", event_id, 0.28, ["map", "annotation"])
		_auto_save()
		world_updated.emit({"type": "location_position_updated", "location_id": location_id})
		return true
	return false

func set_location_known(location_id: String, known: bool) -> bool:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		locations[index]["known_to_player"] = known
		locations[index]["visibility"] = "known_to_player" if known else "unknown"
		_auto_save()
		world_updated.emit({"type": "location_visibility_updated", "location_id": location_id, "known": known})
		return true
	return false

func update_location_note(location_id: String, note: String) -> bool:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		locations[index]["player_notes"] = note.strip_edges()
		locations[index]["player_notes_updated_at"] = Time.get_datetime_string_from_system(true)
		_auto_save()
		world_updated.emit({"type": "location_note_updated", "location_id": location_id})
		return true
	return false

func delete_location(location_id: String) -> bool:
	if location_id == "loc_start" or location_id == str(get_current_location().get("id", "")):
		return false
	for character in characters:
		if str(character.get("current_location_id", "")) == location_id:
			return false
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		var location_name := str(locations[index].get("name", "未知地点"))
		locations.remove_at(index)
		_remove_routes_for_location(location_id)
		add_event("location_change", "删除地点：%s" % location_name, "你从地图标注中移除了%s。历史事件仍保留原始记录。" % location_name, ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.25)
		_auto_save()
		world_updated.emit({"type": "location_deleted", "location_id": location_id})
		return true
	return false

func get_map_routes() -> Array[Dictionary]:
	return _to_dict_array(world.get("map_routes", []))

func add_map_route(from_location_id: String, to_location_id: String, route_name: String = "", route_type: String = "road", danger: float = 0.0) -> bool:
	if from_location_id == to_location_id:
		return false
	var from_location := get_location(from_location_id)
	var to_location := get_location(to_location_id)
	if from_location.is_empty() or to_location.is_empty():
		return false
	if not get_route_between(from_location_id, to_location_id).is_empty():
		return false
	var routes := get_map_routes()
	var route_id := "route_%04d" % (routes.size() + 1)
	var name := route_name.strip_edges()
	if name.is_empty():
		name = "%s - %s" % [from_location.get("name", "地点"), to_location.get("name", "地点")]
	routes.append({
		"id": route_id,
		"name": name,
		"type": route_type.strip_edges() if not route_type.strip_edges().is_empty() else "road",
		"from_location_id": from_location_id,
		"to_location_id": to_location_id,
		"danger": clampf(danger, 0.0, 1.0)
	})
	world["map_routes"] = routes
	_sync_map_image_routes()
	var event_id := add_event("location_change", "新增路线：%s" % name, "你在地图上标注了一条连接%s与%s的路线。" % [from_location.get("name", "地点"), to_location.get("name", "地点")], ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.3)
	add_memory("world", str(world.get("id", "")), "地图新增路线：%s" % name, event_id, 0.35, ["map", "route"])
	_auto_save()
	world_updated.emit({"type": "map_route_added", "route_id": route_id})
	return true

func delete_map_route(route_id: String) -> bool:
	var routes := get_map_routes()
	for index in range(routes.size()):
		if str(routes[index].get("id", "")) != route_id:
			continue
		var route_name := str(routes[index].get("name", route_id))
		routes.remove_at(index)
		world["map_routes"] = routes
		_sync_map_image_routes()
		add_event("location_change", "删除路线：%s" % route_name, "你从地图上移除了一条路线标注。", ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.2)
		_auto_save()
		world_updated.emit({"type": "map_route_deleted", "route_id": route_id})
		return true
	return false

func get_route_between(from_location_id: String, to_location_id: String) -> Dictionary:
	for route in get_map_routes():
		var from_id := str(route.get("from_location_id", ""))
		var to_id := str(route.get("to_location_id", ""))
		if (from_id == from_location_id and to_id == to_location_id) or (from_id == to_location_id and to_id == from_location_id):
			return route
	return {}

func _routes_for_location(location_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for route in get_map_routes():
		if str(route.get("from_location_id", "")) == location_id or str(route.get("to_location_id", "")) == location_id:
			result.append(route.duplicate(true))
	return result

func get_nearby_locations(location_id: String, limit: int = 5) -> Array[Dictionary]:
	var origin := get_location(location_id)
	var result: Array[Dictionary] = []
	if origin.is_empty() or limit <= 0:
		return result
	for location in locations:
		var data := location as Dictionary
		var target_id := str(data.get("id", ""))
		if target_id.is_empty() or target_id == location_id:
			continue
		if not is_location_known(data):
			continue
		var route := get_route_between(location_id, target_id)
		result.append({
			"id": target_id,
			"name": str(data.get("name", "")),
			"type": str(data.get("type", "")),
			"description": str(data.get("description", "")).left(120),
			"biome": str(data.get("biome", "")),
			"height": int(data.get("height", 0)),
			"controlling_faction_id": str(data.get("controlling_faction_id", "")),
			"travel_hours": estimate_travel_hours(location_id, target_id),
			"has_route": not route.is_empty(),
			"route_name": str(route.get("name", "")) if not route.is_empty() else "",
			"route_danger": float(route.get("danger", 0.0)) if not route.is_empty() else 0.0,
			"state_tags": (data.get("state_tags", []) as Array).duplicate()
		})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a.get("travel_hours", 0)) == int(b.get("travel_hours", 0)):
			return str(a.get("name", "")) < str(b.get("name", ""))
		return int(a.get("travel_hours", 0)) < int(b.get("travel_hours", 0))
	)
	return result.slice(0, mini(limit, result.size()))

func estimate_travel_hours(from_location_id: String, to_location_id: String) -> int:
	var from_location := get_location(from_location_id)
	var to_location := get_location(to_location_id)
	if from_location.is_empty() or to_location.is_empty() or from_location_id == to_location_id:
		return 0
	var distance := _location_distance(from_location, to_location)
	var route := get_route_between(from_location_id, to_location_id)
	var hours := 1 + int(ceil(distance * 8.0))
	if not route.is_empty():
		hours = maxi(1, int(ceil(float(hours) * 0.65)))
		hours += int(round(float(route.get("danger", 0.0)) * 2.0))
	return clampi(hours, 1, 12)

func apply_state_patches(patches: Array[Dictionary]) -> bool:
	for patch in patches:
		if not _validate_patch(patch):
			return false
	for patch in patches:
		_apply_patch_unchecked(patch)
	return true

func validate_world_expand_result(result: Dictionary) -> bool:
	if str(result.get("status", "ok")) != "ok":
		return false
	if str(result.get("summary", "")).strip_edges().is_empty():
		return false
	if not result.get("rules", []) is Array:
		return false
	if not result.get("locations", []) is Array:
		return false
	var seen_ids: Dictionary = {}
	for location in result.get("locations", []):
		if not location is Dictionary:
			return false
		var loc := location as Dictionary
		var location_id := str(loc.get("id", ""))
		if location_id.is_empty() or seen_ids.has(location_id):
			return false
		seen_ids[location_id] = true
		if str(loc.get("name", "")).strip_edges().is_empty():
			return false
		var position: Variant = loc.get("position", {})
		if not position is Dictionary:
			return false
		if not (position as Dictionary).has("x") or not (position as Dictionary).has("y"):
			return false
	var opening: Variant = result.get("opening_event", {})
	if not opening is Dictionary:
		return false
	if str((opening as Dictionary).get("description", "")).strip_edges().is_empty():
		return false
	if not (opening as Dictionary).get("suggested_actions", []) is Array:
		return false
	return true

func validate_npc_event_result(result: Dictionary) -> bool:
	if str(result.get("status", "ok")) != "ok":
		return false
	if str(result.get("title", "")).strip_edges().is_empty():
		return false
	if str(result.get("description", "")).strip_edges().is_empty():
		return false
	var character_id := str(result.get("character_id", ""))
	var new_location_id := str(result.get("new_location_id", ""))
	if character_id.is_empty() or get_character(character_id).is_empty():
		return false
	if new_location_id.is_empty() or get_location(new_location_id).is_empty():
		return false
	return true

func get_current_location() -> Dictionary:
	var hero := get_character("char_hero")
	var location_id := str(hero.get("current_location_id", "loc_start"))
	for location in locations:
		if str(location.get("id", "")) == location_id:
			return location
	return locations[0] if not locations.is_empty() else {}

func get_character(character_id: String) -> Dictionary:
	for character in characters:
		if str(character.get("id", "")) == character_id:
			return character
	return {}

func get_relationship(from_character_id: String, to_character_id: String) -> Dictionary:
	var character := get_character(from_character_id)
	if character.is_empty():
		return {}
	var relationships := character.get("relationships", {}) as Dictionary
	var relationship: Variant = relationships.get(to_character_id, {})
	return relationship as Dictionary if relationship is Dictionary else {}

func _character_matches_filter(character: Dictionary, filter: String) -> bool:
	var character_id := str(character.get("id", ""))
	match filter:
		"", "全部":
			return true
		"同行":
			return bool(character.get("is_companion", false))
		"敌对":
			return _is_hostile_or_rival_character(character)
		"已遇见":
			return _has_met_character(character)
		"仅听闻":
			return character_id != "char_hero" and not _has_met_character(character)
		_:
			return true

func _has_met_character(character: Dictionary) -> bool:
	var character_id := str(character.get("id", ""))
	if character_id == "char_hero" or bool(character.get("is_companion", false)):
		return true
	if str(character.get("current_location_id", "")) == str(get_current_location().get("id", "")):
		return true
	if not get_character_recent_events(character_id, 1).is_empty():
		return true
	return not (character.get("known_event_ids", []) as Array).is_empty()

func _is_hostile_or_rival_character(character: Dictionary) -> bool:
	var relationship_label := str(character.get("relationship", "")).to_lower()
	if relationship_label.contains("敌") or relationship_label.contains("竞争") or relationship_label.contains("紧张") or relationship_label.contains("对手") or relationship_label.contains("enemy") or relationship_label.contains("rival"):
		return true
	var relationship_to_hero := get_relationship(str(character.get("id", "")), "char_hero")
	var relationship_type := str(relationship_to_hero.get("type", "")).to_lower()
	return relationship_type == "enemy" or relationship_type == "rival"

func get_relationship_context(participant_ids: Array[String]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var seen: Dictionary = {}
	var ids: Array[String] = []
	for participant_id in participant_ids:
		_append_unique_string(ids, participant_id)
	if ids.size() <= 1:
		for character in characters:
			var character_id := str(character.get("id", ""))
			_append_unique_string(ids, character_id)
			if ids.size() >= 5:
				break
	for source_id in ids:
		for target_id in ids:
			if source_id == target_id:
				continue
			var key := "%s>%s" % [source_id, target_id]
			if seen.has(key):
				continue
			seen[key] = true
			var relationship := get_relationship(source_id, target_id)
			if relationship.is_empty():
				continue
			result.append({
				"from": source_id,
				"to": target_id,
				"from_name": str(get_character(source_id).get("name", source_id)),
				"to_name": str(get_character(target_id).get("name", target_id)),
				"type": relationship.get("type", "neutral"),
				"trust": relationship.get("trust", 0.5),
				"affection": relationship.get("affection", 0.3),
				"tension": relationship.get("tension", 0.2),
				"notes": relationship.get("notes", "")
			})
	return result

func update_character_note(character_id: String, note: String) -> bool:
	for index in range(characters.size()):
		if str(characters[index].get("id", "")) != character_id:
			continue
		characters[index]["player_notes"] = note.strip_edges()
		characters[index]["player_notes_updated_at"] = Time.get_datetime_string_from_system(true)
		_auto_save()
		world_updated.emit({"type": "character_note_updated", "character_id": character_id})
		return true
	return false

func get_companions() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for character in characters:
		var data := character as Dictionary
		if bool(data.get("is_companion", false)):
			result.append(data)
	return result

func get_companion_ids() -> Array[String]:
	var result: Array[String] = []
	for companion in get_companions():
		result.append(str(companion.get("id", "")))
	return result

func can_join_companion(character_id: String) -> bool:
	var character := get_character(character_id)
	if character.is_empty() or character_id == "char_hero":
		return false
	var status := str(character.get("status", "active"))
	if status in ["dead", "left", "missing", "inactive"]:
		return false
	return true

func set_character_companion(character_id: String, enabled: bool) -> bool:
	if enabled and not can_join_companion(character_id):
		return false
	for index in range(characters.size()):
		if str(characters[index].get("id", "")) != character_id:
			continue
		if bool(characters[index].get("is_companion", false)) == enabled:
			return true
		characters[index]["is_companion"] = enabled
		if enabled:
			characters[index]["current_location_id"] = str(get_current_location().get("id", "loc_start"))
			characters[index]["relationship"] = "同行"
		var title := "加入同行：%s" % characters[index].get("name", "角色") if enabled else "离开同行：%s" % characters[index].get("name", "角色")
		var description := "%s现在会随你移动并进入 AI 上下文。" % characters[index].get("name", "角色") if enabled else "%s暂时离队，后续会按 NPC 规则自主行动。" % characters[index].get("name", "角色")
		add_event("relationship_change", title, description, ["char_hero", character_id], str(get_current_location().get("id", "loc_start")), 0.35)
		_auto_save()
		world_updated.emit({"type": "companion_changed", "character_id": character_id, "is_companion": enabled})
		return true
	return false

func move_player_to(location_id: String) -> void:
	var location := get_location(location_id)
	if location.is_empty():
		return
	if not is_location_known(location):
		set_location_known(location_id, true)
	var previous_location_id := str(get_current_location().get("id", "loc_start"))
	var travel_hours := estimate_travel_hours(previous_location_id, location_id)
	if travel_hours <= 0:
		travel_hours = 1
	var companion_ids := get_companion_ids()
	_update_character_location("char_hero", location_id)
	for companion_id in companion_ids:
		_update_character_location(companion_id, location_id)
	advance_time(travel_hours)
	var route := get_route_between(previous_location_id, location_id)
	var route_text := "沿直线估算路线"
	if not route.is_empty():
		route_text = "沿%s" % route.get("name", "已标注路线")
	var participants: Array[String] = ["char_hero"]
	for companion_id in companion_ids:
		_append_unique_string(participants, companion_id)
	var companion_text := ""
	if not companion_ids.is_empty():
		companion_text = " 同行角色与你一同抵达。"
	var event_id := add_event("player_action", "移动到%s" % location.get("name", "未知地点"), "你%s抵达%s，旅程耗时约%d小时。%s" % [route_text, location.get("name", "未知地点"), travel_hours, companion_text], participants, location_id, 0.45)
	add_memory("character", "char_hero", "玩家移动到%s" % location.get("name", "未知地点"), event_id, 0.4, ["movement"])
	suggested_actions = ["观察周围", "寻找当地消息", "联系同行角色", "查看时间线"]
	run_faction_tick(false)
	refresh_summaries(false)
	_auto_save()
	world_updated.emit({"type": "player_moved", "location_id": location_id})

func get_location(location_id: String) -> Dictionary:
	for location in locations:
		if str(location.get("id", "")) == location_id:
			return location
	return {}

func is_location_known(location: Dictionary) -> bool:
	if location.has("known_to_player"):
		return bool(location.get("known_to_player", true))
	return str(location.get("visibility", "known_to_player")) != "unknown"

func get_visible_locations(include_unknown: bool = false) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for location in locations:
		var data := location as Dictionary
		if include_unknown or is_location_known(data):
			result.append(data)
	return result

func get_faction(faction_id: String) -> Dictionary:
	for faction in factions:
		if str(faction.get("id", "")) == faction_id:
			return faction
	return {}

func faction_name(faction_id: String) -> String:
	var faction := get_faction(faction_id)
	return str(faction.get("name", "无控制势力")) if not faction.is_empty() else "无控制势力"

func get_active_threads() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for thread in threads:
		if str(thread.get("status", "open")) != "resolved":
			result.append(thread.duplicate(true))
	return result

func resolve_thread(thread_id: String) -> bool:
	for index in range(threads.size()):
		if str(threads[index].get("id", "")) != thread_id:
			continue
		threads[index]["status"] = "resolved"
		threads[index]["resolved_world_time"] = world.get("current_time", {}).duplicate(true)
		_auto_save()
		world_updated.emit({"type": "thread_resolved", "thread_id": thread_id})
		return true
	return false

func reset_world() -> void:
	world.clear()
	characters.clear()
	locations.clear()
	factions.clear()
	timeline.clear()
	memories.clear()
	ai_logs.clear()
	threads.clear()
	suggested_actions.clear()
	SaveManager.delete_save()
	AppState.set_current_world("")
	world_updated.emit({"type": "world_reset"})

func validate_player_action_result(result: Dictionary) -> bool:
	if str(result.get("status", "ok")) != "ok":
		return false
	if not result.has("narrative") or str(result.get("narrative", "")).strip_edges().is_empty():
		return false
	if int(result.get("time_delta_hours", 0)) < 0:
		return false
	if not result.get("suggested_actions", []) is Array:
		return false
	if result.has("patches") and not result.get("patches", []) is Array:
		return false
	return true

func _validate_patch(patch: Dictionary) -> bool:
	var target_type := str(patch.get("target_type", ""))
	var target_id := str(patch.get("target_id", ""))
	var op := str(patch.get("op", ""))
	var path := str(patch.get("path", ""))
	if not op in ["set", "append"]:
		return false
	if path.is_empty() or path.contains("/") or path.begins_with("_"):
		return false
	match target_type:
		"character":
			if get_character(target_id).is_empty():
				return false
			if path in ["id", "name", "role"]:
				return false
			if path == "current_location_id" and get_location(str(patch.get("value", ""))).is_empty():
				return false
		"location":
			if get_location(target_id).is_empty():
				return false
			if path in ["id", "position"]:
				return false
		"world":
			if target_id != str(world.get("id", "")):
				return false
			if path in ["id", "created_at", "schema_version"]:
				return false
		_:
			return false
	if _patch_conflicts_with_confirmed_state(patch):
		return false
	return true

func _patch_conflicts_with_confirmed_state(patch: Dictionary) -> bool:
	if str(patch.get("op", "")) != "set":
		return false
	var target_type := str(patch.get("target_type", ""))
	var path := str(patch.get("path", ""))
	if not path in _confirmed_patch_fields(target_type):
		return false
	var target := _patch_target_data(target_type, str(patch.get("target_id", "")))
	if target.is_empty() or not target.has(path):
		return false
	var current: Variant = target.get(path)
	var proposed: Variant = patch.get("value", null)
	if _is_empty_confirmed_value(current):
		return false
	return _variant_signature(current) != _variant_signature(proposed)

func _confirmed_patch_fields(target_type: String) -> Array[String]:
	match target_type:
		"character":
			return ["name", "role", "description", "goals", "traits", "personality", "relationship", "secrets", "action_tendency"]
		"location":
			return ["name", "type", "description", "position"]
		"world":
			return ["name", "genre", "summary", "rules", "themes", "content_limits", "narrative_detail", "npc_autonomy_frequency"]
		_:
			return []

func _patch_target_data(target_type: String, target_id: String) -> Dictionary:
	match target_type:
		"character":
			return get_character(target_id)
		"location":
			return get_location(target_id)
		"world":
			return world if target_id == str(world.get("id", "")) else {}
		_:
			return {}

func _is_empty_confirmed_value(value: Variant) -> bool:
	if value == null:
		return true
	if value is String:
		return str(value).strip_edges().is_empty()
	if value is Array or value is Dictionary:
		return value.is_empty()
	return false

func _variant_signature(value: Variant) -> String:
	if value is Array or value is Dictionary:
		return JSON.stringify(value)
	return str(value)

func _current_log_level() -> String:
	var level := str(SettingsStore.get_value("log_level", "debug"))
	if level in ["default", "debug", "deep"]:
		return level
	return "debug" if bool(SettingsStore.get_value("debug_logs", true)) else "default"

func _apply_patch_unchecked(patch: Dictionary) -> void:
	var target_type := str(patch.get("target_type", ""))
	var target_id := str(patch.get("target_id", ""))
	var op := str(patch.get("op", ""))
	var path := str(patch.get("path", ""))
	var value: Variant = patch.get("value", null)
	match target_type:
		"character":
			for index in range(characters.size()):
				if str(characters[index].get("id", "")) == target_id:
					_apply_dict_patch(characters[index], op, path, value)
					return
		"location":
			for index in range(locations.size()):
				if str(locations[index].get("id", "")) == target_id:
					_apply_dict_patch(locations[index], op, path, value)
					return
		"world":
			_apply_dict_patch(world, op, path, value)

func _apply_dict_patch(target: Dictionary, op: String, path: String, value: Variant) -> void:
	if op == "set":
		target[path] = value
	elif op == "append":
		var array_value: Array = target.get(path, [])
		if not value in array_value:
			array_value.append(value)
		target[path] = array_value

func _build_phase_summary(events: Array, phase_index: int) -> Dictionary:
	var event_ids: Array[String] = []
	var important_lines: Array[String] = []
	var participant_names: Array[String] = []
	var location_names: Array[String] = []
	var unresolved: Array[String] = []
	for item in events:
		var event := item as Dictionary
		event_ids.append(str(event.get("id", "")))
		var title := str(event.get("title", "事件"))
		var location_name := _location_name_for_id(str(event.get("location_id", "")))
		if not location_name.is_empty():
			_append_unique_string(location_names, location_name)
		for participant_id in event.get("participant_ids", []):
			var character := get_character(str(participant_id))
			if not character.is_empty():
				_append_unique_string(participant_names, str(character.get("name", "")))
		if float(event.get("importance", 0.0)) >= 0.45 or important_lines.size() < 6:
			important_lines.append("%s：%s" % [title, str(event.get("description", "")).left(92)])
		var description := str(event.get("description", ""))
		if description.contains("秘密") or description.contains("未知") or description.contains("传闻") or description.contains("重新评估"):
			unresolved.append(title)
	var first_time := (events.front() as Dictionary).get("world_time", {}) as Dictionary
	var last_time := (events.back() as Dictionary).get("world_time", {}) as Dictionary
	var text := "阶段 %d 覆盖第%s日%02d:00 到第%s日%02d:00。关键角色：%s。关键地点：%s。主要事件：%s" % [
		phase_index,
		first_time.get("day", 1),
		int(first_time.get("hour", 0)),
		last_time.get("day", 1),
		int(last_time.get("hour", 0)),
		", ".join(participant_names) if not participant_names.is_empty() else "无",
		", ".join(location_names) if not location_names.is_empty() else "无",
		"；".join(important_lines)
	]
	if not unresolved.is_empty():
		text += "。未解决线索：%s" % "、".join(unresolved.slice(0, mini(5, unresolved.size())))
	return {
		"id": "summary_%04d" % phase_index,
		"phase_index": phase_index,
		"event_ids": event_ids,
		"event_count": events.size(),
		"start_world_time": first_time.duplicate(true),
		"end_world_time": last_time.duplicate(true),
		"participants": participant_names,
		"locations": location_names,
		"unresolved_threads": unresolved.slice(0, mini(8, unresolved.size())),
		"text": text.left(1200),
		"created_at": Time.get_datetime_string_from_system(true)
	}

func _summary_hints_for_characters(events: Array) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for character in characters:
		var data := character as Dictionary
		var character_id := str(data.get("id", ""))
		var titles: Array[String] = []
		for item in events:
			var event := item as Dictionary
			if character_id in (event.get("participant_ids", []) as Array):
				titles.append(str(event.get("title", "事件")))
		if not titles.is_empty():
			result.append({
				"character_id": character_id,
				"name": str(data.get("name", "")),
				"events": titles.slice(0, mini(6, titles.size())),
				"previous_summary": str(data.get("memory_summary", ""))
			})
	return result

func _summary_hints_for_locations(events: Array) -> Array[Dictionary]:
	var by_location: Dictionary = {}
	for item in events:
		var event := item as Dictionary
		var location_id := str(event.get("location_id", ""))
		if location_id.is_empty():
			continue
		var titles: Array = by_location.get(location_id, [])
		titles.append(str(event.get("title", "事件")))
		by_location[location_id] = titles
	var result: Array[Dictionary] = []
	for location_id in by_location.keys():
		var location := get_location(str(location_id))
		if location.is_empty():
			continue
		var titles := by_location[location_id] as Array
		result.append({
			"location_id": str(location_id),
			"name": str(location.get("name", "")),
			"events": titles.slice(0, mini(6, titles.size())),
			"previous_summary": str(location.get("memory_summary", ""))
		})
	return result

func _merge_world_summary(current_summary: String, phase_summary: Dictionary) -> String:
	if not world.has("initial_summary"):
		world["initial_summary"] = current_summary
	var sections: Array[String] = []
	var initial := str(world.get("initial_summary", current_summary)).strip_edges()
	if not initial.is_empty():
		sections.append("初始概况：%s" % initial.left(520))
	for item in _recent_phase_summaries(3):
		var summary := item as Dictionary
		sections.append(str(summary.get("text", "")).left(420))
	if sections.is_empty():
		return str(phase_summary.get("text", current_summary)).left(1600)
	return "\n\n".join(sections).left(1600)

func _update_character_summaries(events: Array) -> void:
	for index in range(characters.size()):
		var character_id := str(characters[index].get("id", ""))
		var relevant: Array[String] = []
		for item in events:
			var event := item as Dictionary
			if character_id in _to_string_array(event.get("participant_ids", [])):
				relevant.append(str(event.get("title", "")))
		if relevant.is_empty():
			continue
		var previous := str(characters[index].get("memory_summary", ""))
		var update := "阶段记忆：%s" % "、".join(relevant.slice(0, mini(5, relevant.size())))
		characters[index]["memory_summary"] = _compact_summary_text(previous, update, 360)
		characters[index]["last_summary_event_id"] = str((events.back() as Dictionary).get("id", ""))

func _update_location_summaries(events: Array) -> void:
	for index in range(locations.size()):
		var location_id := str(locations[index].get("id", ""))
		var relevant: Array[String] = []
		for item in events:
			var event := item as Dictionary
			if str(event.get("location_id", "")) == location_id:
				relevant.append(str(event.get("title", "")))
		if relevant.is_empty():
			continue
		var previous := str(locations[index].get("memory_summary", ""))
		var update := "阶段变化：%s" % "、".join(relevant.slice(0, mini(5, relevant.size())))
		locations[index]["memory_summary"] = _compact_summary_text(previous, update, 320)
		locations[index]["last_summary_event_id"] = str((events.back() as Dictionary).get("id", ""))

func _compact_summary_text(previous: String, update: String, limit: int) -> String:
	var parts: Array[String] = []
	if not previous.strip_edges().is_empty() and previous != "故事刚刚开始。" and previous != "尚未形成稳定记忆。":
		parts.append(previous.strip_edges())
	parts.append(update)
	var combined := " / ".join(parts)
	if combined.length() <= limit:
		return combined
	return combined.substr(combined.length() - limit, limit)

func _recent_phase_summaries(limit: int) -> Array[Dictionary]:
	var summaries: Array = world.get("phase_summaries", [])
	var start := maxi(0, summaries.size() - limit)
	var result: Array[Dictionary] = []
	for item in summaries.slice(start, summaries.size()):
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result

func _append_unique_string(items: Array[String], value: String) -> void:
	var normalized := value.strip_edges()
	if normalized.is_empty() or normalized in items:
		return
	items.append(normalized)

func _id_set(items: Array[Dictionary]) -> Dictionary:
	var result: Dictionary = {}
	for item in items:
		var item_id := str(item.get("id", ""))
		if not item_id.is_empty():
			result[item_id] = true
	return result

func _event_by_id(event_id: String) -> Dictionary:
	if event_id.strip_edges().is_empty():
		return {}
	for event in timeline:
		var data := event as Dictionary
		if str(data.get("id", "")) == event_id:
			return data.duplicate(true)
	return {}

func _consistency_issue(code: String, subject_id: String, message: String) -> Dictionary:
	return {
		"code": code,
		"subject_id": subject_id,
		"message": message
	}

func _content_limits_from_seed(seed: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var seed_limits: Variant = seed.get("limits", "")
	if seed_limits is Array:
		for item in seed_limits:
			_append_unique_string(result, str(item))
	else:
		for item in _split_content_preferences(str(seed_limits)):
			_append_unique_string(result, item)
	for item in _split_content_preferences(str(SettingsStore.get_value("content_preferences", ""))):
		_append_unique_string(result, item)
	return result

func _active_content_limits() -> Array[String]:
	var result: Array[String] = []
	for item in world.get("content_limits", []):
		_append_unique_string(result, str(item))
	for item in _split_content_preferences(str(SettingsStore.get_value("content_preferences", ""))):
		_append_unique_string(result, item)
	return result

func _split_content_preferences(text: String) -> Array[String]:
	var result: Array[String] = []
	var normalized := text.replace("\r", "\n").replace("；", "\n").replace(";", "\n")
	for line in normalized.split("\n", false):
		var item := str(line).strip_edges()
		if item.is_empty():
			continue
		result.append(item)
	return result

func _content_block_terms() -> Array[String]:
	var result: Array[String] = []
	for item in _active_content_limits():
		var preference := str(item).strip_edges()
		var normalized := _normalize_policy_text(preference)
		var is_blocking := normalized.contains("禁用") or normalized.contains("禁止") or normalized.contains("避免") or normalized.contains("不生成") or normalized.contains("不包含") or normalized.contains("不要")
		if not is_blocking:
			continue
		var candidate_text := preference
		var colon_index := maxi(preference.find("："), preference.find(":"))
		if colon_index >= 0 and colon_index < preference.length() - 1:
			candidate_text = preference.substr(colon_index + 1)
		candidate_text = candidate_text.replace("及", "、").replace("和", "、").replace("与", "、")
		candidate_text = candidate_text.replace("，", "、").replace(",", "、").replace("/", "、")
		for raw_term in candidate_text.split("、", false):
			var term := _clean_content_block_term(str(raw_term))
			if term.length() >= 2:
				_append_unique_string(result, term)
	return result

func _clean_content_block_term(term: String) -> String:
	var cleaned := term.strip_edges()
	for marker in ["已禁用", "禁用", "禁止", "避免", "不要", "不生成", "不包含", "内容", "描写"]:
		cleaned = cleaned.replace(marker, "")
	return cleaned.strip_edges()

func _normalize_policy_text(text: String) -> String:
	return text.to_lower().replace(" ", "").replace("\t", "").replace("\n", "")

func _create_initial_threads(seed: Dictionary, opening_event: Dictionary) -> void:
	var hero := seed.get("hero", {}) as Dictionary
	var hero_goal := str(hero.get("goal", "寻找故事的下一步")).strip_edges()
	_add_thread(
		"主线目标",
		hero_goal if not hero_goal.is_empty() else "确认这个世界的核心冲突",
		"main",
		str(opening_event.get("id", "")),
		0.9,
		["main", "hero_goal"]
	)
	var opening_description := str(opening_event.get("description", ""))
	if not opening_description.is_empty():
		_add_thread("开局线索", opening_description.left(120), "clue", str(opening_event.get("id", "")), 0.7, ["opening", "clue"])

func _add_thread(title: String, description: String, kind: String, event_id: String, priority: float, tags: Array) -> String:
	_thread_counter += 1
	var thread_id := "thread_%04d" % _thread_counter
	threads.append({
		"id": thread_id,
		"title": title.strip_edges() if not title.strip_edges().is_empty() else "未命名线索",
		"description": description.strip_edges(),
		"kind": kind,
		"status": "open",
		"priority": clampf(priority, 0.0, 1.0),
		"event_ids": [event_id] if not event_id.is_empty() else [],
		"related_character_ids": [],
		"related_location_ids": [],
		"tags": tags,
		"created_world_time": world.get("current_time", {}).duplicate(true),
		"updated_world_time": world.get("current_time", {}).duplicate(true),
		"progress": []
	})
	return thread_id

func _update_threads_from_event(action: String, result: Dictionary, event_id: String) -> void:
	if threads.is_empty():
		_add_thread("当前目标", action.left(80), "main", event_id, 0.55, ["auto"])
	var text := "%s\n%s\n%s" % [action, result.get("narrative", ""), result.get("memory_text", "")]
	var open_indices := _open_thread_indices()
	for index in open_indices.slice(0, mini(2, open_indices.size())):
		_append_thread_progress(index, event_id, _thread_progress_text(action, result), 0.04)
	if _looks_like_new_clue(text):
		_add_thread(_clue_title_from_text(text), text.left(160), "clue", event_id, 0.62, ["clue", "auto"])

func _open_thread_indices() -> Array[int]:
	var result: Array[int] = []
	for index in range(threads.size()):
		if str(threads[index].get("status", "open")) == "open":
			result.append(index)
	return result

func _append_thread_progress(index: int, event_id: String, text: String, priority_delta: float) -> void:
	var progress: Array = threads[index].get("progress", [])
	progress.append({
		"event_id": event_id,
		"text": text.left(180),
		"world_time": world.get("current_time", {}).duplicate(true)
	})
	if progress.size() > 12:
		progress = progress.slice(progress.size() - 12, progress.size())
	var event_ids: Array = threads[index].get("event_ids", [])
	if not event_id in event_ids:
		event_ids.append(event_id)
	threads[index]["event_ids"] = event_ids
	threads[index]["progress"] = progress
	threads[index]["priority"] = clampf(float(threads[index].get("priority", 0.5)) + priority_delta, 0.0, 1.0)
	threads[index]["updated_world_time"] = world.get("current_time", {}).duplicate(true)

func _thread_progress_text(action: String, result: Dictionary) -> String:
	var narrative := str(result.get("narrative", result.get("summary", "")))
	if narrative.is_empty():
		narrative = action
	return "行动推进：%s -> %s" % [action.left(48), narrative.left(96)]

func _action_resolution_from_result(result: Dictionary) -> Dictionary:
	var outcome := str(result.get("outcome", ""))
	if outcome.is_empty():
		outcome = _infer_outcome_from_result(result)
	var reason := str(result.get("outcome_reason", ""))
	if reason.is_empty():
		reason = _default_outcome_reason(outcome)
	var consequence := str(result.get("consequence", ""))
	if consequence.is_empty():
		consequence = _default_outcome_consequence(outcome)
	return {
		"outcome": outcome,
		"outcome_label": _outcome_label(outcome),
		"outcome_reason": reason,
		"consequence": consequence
	}

func _infer_outcome_from_result(result: Dictionary) -> String:
	var text := ("%s %s" % [result.get("narrative", ""), result.get("memory_text", "")]).to_lower()
	for outcome in ["blocked", "cost", "partial", "quiet", "success"]:
		if text.contains(outcome):
			return outcome
	if str(result.get("status", "ok")) != "ok":
		return "blocked"
	return "partial"

func _outcome_label(outcome: String) -> String:
	match outcome:
		"success":
			return "确定成功"
		"cost":
			return "代价成功"
		"partial":
			return "部分成功"
		"blocked":
			return "行动受阻"
		"quiet":
			return "低风险推进"
		_:
			return "结果未定"

func _default_outcome_reason(outcome: String) -> String:
	match outcome:
		"success":
			return "行动符合当前能力和场景条件。"
		"cost":
			return "行动能达成目标，但会引入副作用。"
		"blocked":
			return "缺少完成行动所需的条件。"
		"quiet":
			return "行动主要消耗时间，直接风险较低。"
		_:
			return "行动推进了局势，但结果仍不完整。"

func _default_outcome_consequence(outcome: String) -> String:
	match outcome:
		"success":
			return "可靠进展已写入时间线。"
		"cost":
			return "进展会伴随关系、地点或风险变化。"
		"blocked":
			return "不会假装成功，改为提供可执行的下一步。"
		"quiet":
			return "世界时间继续流动。"
		_:
			return "获得部分信息，并开启后续选择。"

func _looks_like_new_clue(text: String) -> bool:
	for marker in ["线索", "秘密", "未知", "传闻", "徽记", "档案", "钥匙", "遗迹", "目标"]:
		if text.contains(marker):
			return true
	return false

func _clue_title_from_text(text: String) -> String:
	for marker in ["徽记", "档案", "钥匙", "遗迹", "传闻", "秘密"]:
		if text.contains(marker):
			return "线索：%s" % marker
	return "新线索"

func _ensure_relationships() -> void:
	for index in range(characters.size()):
		var character_id := str(characters[index].get("id", ""))
		var relationships: Dictionary = characters[index].get("relationships", {}) if characters[index].get("relationships", {}) is Dictionary else {}
		for other in characters:
			var other_id := str(other.get("id", ""))
			if other_id == character_id:
				continue
			if relationships.has(other_id) and relationships[other_id] is Dictionary:
				continue
			relationships[other_id] = _initial_relationship_for(characters[index], other)
		characters[index]["relationships"] = relationships

func _ensure_character_notes() -> void:
	for index in range(characters.size()):
		if not characters[index].has("player_notes"):
			characters[index]["player_notes"] = ""
		if not characters[index].has("player_notes_updated_at"):
			characters[index]["player_notes_updated_at"] = ""
		if not characters[index].has("is_companion"):
			var relationship := str(characters[index].get("relationship", ""))
			characters[index]["is_companion"] = str(characters[index].get("id", "")) != "char_hero" and _is_companion_label(relationship)
		if bool(characters[index].get("is_companion", false)):
			characters[index]["current_location_id"] = str(get_current_location().get("id", "loc_start"))

func _ensure_location_notes() -> void:
	for index in range(locations.size()):
		if not locations[index].has("player_notes"):
			locations[index]["player_notes"] = ""
		if not locations[index].has("player_notes_updated_at"):
			locations[index]["player_notes_updated_at"] = ""

func _ensure_location_visibility() -> void:
	for index in range(locations.size()):
		if not locations[index].has("known_to_player"):
			locations[index]["known_to_player"] = str(locations[index].get("visibility", "known_to_player")) != "unknown"
		if not locations[index].has("visibility"):
			locations[index]["visibility"] = "known_to_player" if bool(locations[index].get("known_to_player", true)) else "unknown"

func _initial_relationship_for(source: Dictionary, target: Dictionary) -> Dictionary:
	var source_role := str(source.get("role", ""))
	var target_label := str(target.get("relationship", "未知"))
	if source_role != "player":
		target_label = str(source.get("relationship", "未知")) if str(target.get("role", "")) == "player" else "未知"
	var profile := _relationship_profile_from_label(target_label)
	profile["notes"] = "初始关系：%s" % target_label
	return profile

func _relationship_profile_from_label(label: String) -> Dictionary:
	var normalized := label.to_lower()
	if normalized.contains("你"):
		return {"type": "self", "trust": 1.0, "affection": 1.0, "tension": 0.0}
	if normalized.contains("同行") or normalized.contains("旧友") or normalized.contains("友") or normalized.contains("ally"):
		return {"type": "ally", "trust": 0.68, "affection": 0.58, "tension": 0.16}
	if normalized.contains("竞争") or normalized.contains("紧张") or normalized.contains("rival"):
		return {"type": "rival", "trust": 0.36, "affection": 0.28, "tension": 0.56}
	if normalized.contains("敌") or normalized.contains("enemy"):
		return {"type": "enemy", "trust": 0.18, "affection": 0.12, "tension": 0.78}
	return {"type": "unknown", "trust": 0.46, "affection": 0.34, "tension": 0.34}

func _update_relationships_from_player_action(action: String, result: Dictionary, event_id: String) -> void:
	if characters.size() <= 1:
		return
	var delta := _relationship_delta_for_action(action, result)
	var touched: Array[String] = []
	for character in characters:
		var character_id := str(character.get("id", ""))
		if character_id == "char_hero":
			continue
		_apply_relationship_delta("char_hero", character_id, delta, "玩家行动：%s" % action.left(40))
		_apply_relationship_delta(character_id, "char_hero", delta, "目睹或听闻玩家行动：%s" % action.left(40))
		touched.append(character_id)
	for character_id in touched.slice(0, mini(3, touched.size())):
		var relationship := get_relationship(character_id, "char_hero")
		add_memory(
			"character",
			character_id,
			"对玩家的关系变化：信任 %.2f，好感 %.2f，紧张 %.2f。" % [
				float(relationship.get("trust", 0.0)),
				float(relationship.get("affection", 0.0)),
				float(relationship.get("tension", 0.0))
			],
			event_id,
			0.42,
			["relationship", "player_action"]
		)

func _relationship_delta_for_action(action: String, result: Dictionary) -> Dictionary:
	var lowered := action.to_lower()
	var outcome := str(result.get("status", "ok"))
	var trust_delta := 0.02
	var affection_delta := 0.01
	var tension_delta := 0.0
	if lowered.contains("帮助") or lowered.contains("保护") or lowered.contains("承诺") or lowered.contains("交谈") or lowered.contains("询问"):
		trust_delta = 0.05
		affection_delta = 0.04
		tension_delta = -0.03
	elif lowered.contains("攻击") or lowered.contains("威胁") or lowered.contains("强行") or lowered.contains("欺骗"):
		trust_delta = -0.06
		affection_delta = -0.04
		tension_delta = 0.09
	elif lowered.contains("调查") or lowered.contains("查看") or lowered.contains("追踪"):
		trust_delta = 0.03
		affection_delta = 0.0
		tension_delta = 0.02
	if outcome != "ok":
		trust_delta *= 0.5
		affection_delta *= 0.5
	return {"trust": trust_delta, "affection": affection_delta, "tension": tension_delta}

func _apply_relationship_delta(source_id: String, target_id: String, delta: Dictionary, note: String) -> void:
	for index in range(characters.size()):
		if str(characters[index].get("id", "")) != source_id:
			continue
		var relationships: Dictionary = characters[index].get("relationships", {}) if characters[index].get("relationships", {}) is Dictionary else {}
		var current: Dictionary = relationships.get(target_id, _relationship_profile_from_label("未知")) as Dictionary
		current["trust"] = clampf(float(current.get("trust", 0.5)) + float(delta.get("trust", 0.0)), 0.0, 1.0)
		current["affection"] = clampf(float(current.get("affection", 0.3)) + float(delta.get("affection", 0.0)), 0.0, 1.0)
		current["tension"] = clampf(float(current.get("tension", 0.2)) + float(delta.get("tension", 0.0)), 0.0, 1.0)
		current["type"] = _relationship_type_from_scores(current)
		current["notes"] = note
		current["updated_world_time"] = world.get("current_time", {}).duplicate(true)
		relationships[target_id] = current
		characters[index]["relationships"] = relationships
		return

func _relationship_type_from_scores(relationship: Dictionary) -> String:
	var trust := float(relationship.get("trust", 0.5))
	var affection := float(relationship.get("affection", 0.3))
	var tension := float(relationship.get("tension", 0.2))
	if tension >= 0.72 and trust <= 0.32:
		return "enemy"
	if tension >= 0.5:
		return "rival"
	if trust >= 0.64 and affection >= 0.45:
		return "ally"
	if trust <= 0.28:
		return "wary"
	return "neutral"

func _auto_save() -> void:
	if not world.is_empty() and bool(SettingsStore.get_value("auto_save_enabled", true)):
		SaveManager.save_game(export_payload())

func _save_ai_checkpoint() -> void:
	if not world.is_empty():
		SaveManager.save_ai_checkpoint(export_payload())

func _build_characters(seed: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var hero := seed.get("hero", {}) as Dictionary
	result.append({
		"id": "char_hero",
		"name": str(hero.get("name", "主角")),
		"role": "player",
		"description": str(hero.get("description", "由玩家创造的主角。")),
		"personality": _split_tags(str(hero.get("personality", "坚韧,好奇"))),
		"goals": _split_tags(str(hero.get("goal", "寻找自己的道路"))),
		"secrets": [],
		"current_location_id": "loc_start",
		"status": "active",
		"traits": _split_tags(str(hero.get("ability", "适应力"))),
			"relationship": "你",
			"is_companion": false,
			"memory_summary": "故事刚刚开始。",
		"player_notes": "",
		"player_notes_updated_at": "",
		"known_event_ids": []
	})

	var source_roles: Array = seed.get("key_characters", [])
	var fallback := [
		{"name": "璃安", "role": "关键角色", "description": "温和但隐藏重要秘密的旅伴。", "relationship": "同行"},
		{"name": "赛拉", "role": "竞争者", "description": "追求同一目标的强势行动者。", "relationship": "竞争"},
		{"name": "诺维", "role": "情报贩子", "description": "擅长在多个势力之间保持平衡。", "relationship": "未知"},
		{"name": "维克托", "role": "男二", "description": "相信秩序高于自由的旧友。", "relationship": "紧张"}
	]
	if source_roles.is_empty():
		source_roles = fallback
	var index := 1
	for item in source_roles:
		var data := item as Dictionary
		var relationship_label := str(data.get("relationship", "未知"))
		var starts_as_companion := _is_companion_label(relationship_label)
		result.append({
			"id": "char_%03d" % index,
			"name": str(data.get("name", "角色%d" % index)),
			"role": str(data.get("role", "关键角色")),
			"description": str(data.get("description", "仍有许多未知之处。")),
			"personality": _split_tags(str(data.get("personality", "谨慎,执着"))),
			"goals": _split_tags(str(data.get("goal", "推进自己的计划"))),
			"secrets": _split_tags(str(data.get("secret", data.get("goal", "未知")))),
			"current_location_id": "loc_start" if starts_as_companion else ["loc_start", "loc_archive", "loc_forest", "loc_citadel"][index % 4],
			"status": "active",
			"traits": _split_tags(str(data.get("traits", "关键角色"))),
			"action_tendency": str(data.get("action_tendency", "按目标寻找机会行动")),
			"relationship": relationship_label,
			"is_companion": starts_as_companion,
			"memory_summary": "尚未形成稳定记忆。",
			"player_notes": "",
			"player_notes_updated_at": "",
			"known_event_ids": []
		})
		index += 1
	return result

func _is_companion_label(label: String) -> bool:
	var normalized := label.to_lower()
	return normalized.contains("同行") or normalized.contains("同伴") or normalized.contains("旅伴") or normalized.contains("companion") or normalized.contains("ally")

func _build_factions(seed: Dictionary) -> Array[Dictionary]:
	var world_name := str(seed.get("world_name", "世界"))
	var genre := str(seed.get("genre", "奇幻"))
	return [
		{
			"id": "fac_001",
			"name": "%s边境守望" % world_name.left(2),
			"description": "维护交通、税收和边境秩序的地方势力。",
			"ideology": "秩序与安全",
			"current_goal": "稳住起点城镇与主干道路",
			"resources": 72,
			"influence": 68,
			"status": "active",
			"controlled_location_ids": ["loc_start", "loc_citadel"],
			"allies": [],
			"rivals": ["fac_002"],
			"current_action": "监控边境传闻",
			"tags": ["order", genre]
		},
		{
			"id": "fac_002",
			"name": "灰烬档案会",
			"description": "追逐旧时代文献、遗迹和禁忌知识的秘密组织。",
			"ideology": "知识优先",
			"current_goal": "重新打开灰烬档案馆的深层封存",
			"resources": 64,
			"influence": 58,
			"status": "active",
			"controlled_location_ids": ["loc_archive"],
			"allies": [],
			"rivals": ["fac_001", "fac_003"],
			"current_action": "寻找可利用的钥匙与证人",
			"tags": ["archive", "secret"]
		},
		{
			"id": "fac_003",
			"name": "自由商队同盟",
			"description": "由商队、向导和消息贩子组成的松散联盟。",
			"ideology": "流通与自由",
			"current_goal": "保持回声林与边境市场的安全通路",
			"resources": 55,
			"influence": 52,
			"status": "active",
			"controlled_location_ids": ["loc_forest"],
			"allies": [],
			"rivals": ["fac_002"],
			"current_action": "交换路线消息",
			"tags": ["trade", "rumor"]
		}
	]

func _default_connections(location_id: String) -> Array[String]:
	match location_id:
		"loc_start":
			return ["loc_forest", "loc_citadel"]
		"loc_forest":
			return ["loc_start", "loc_archive"]
		"loc_archive":
			return ["loc_forest", "loc_citadel"]
		"loc_citadel":
			return ["loc_start", "loc_archive"]
		_:
			return ["loc_start"]

func _update_character_location(character_id: String, location_id: String) -> void:
	for index in range(characters.size()):
		if str(characters[index].get("id", "")) == character_id:
			characters[index]["current_location_id"] = location_id
			return

func _sync_location_control_from_factions() -> void:
	for index in range(locations.size()):
		locations[index]["controlling_faction_id"] = null
	for faction in factions:
		var data := faction as Dictionary
		for location_id in data.get("controlled_location_ids", []):
			_set_location_controller(str(location_id), str(data.get("id", "")))

func _set_location_controller(location_id: String, faction_id: String) -> void:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) == location_id:
			locations[index]["controlling_faction_id"] = faction_id
			return

func _append_location_tag(location_id: String, tag: String) -> void:
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) != location_id:
			continue
		var tags: Array = locations[index].get("state_tags", [])
		if not tag in tags:
			tags.append(tag)
		locations[index]["state_tags"] = tags
		return

func _add_controlled_location(faction_id: String, location_id: String) -> void:
	for index in range(factions.size()):
		if str(factions[index].get("id", "")) != faction_id:
			continue
		var controlled: Array = factions[index].get("controlled_location_ids", [])
		if not location_id in controlled:
			controlled.append(location_id)
		factions[index]["controlled_location_ids"] = controlled
		return

func _remove_controlled_location(faction_id: String, location_id: String) -> void:
	for index in range(factions.size()):
		if str(factions[index].get("id", "")) != faction_id:
			continue
		var controlled: Array = factions[index].get("controlled_location_ids", [])
		controlled.erase(location_id)
		factions[index]["controlled_location_ids"] = controlled
		return

func _select_faction_target(faction: Dictionary) -> Dictionary:
	var controlled: Array = faction.get("controlled_location_ids", [])
	for location in locations:
		var loc := location as Dictionary
		var location_id := str(loc.get("id", ""))
		if not location_id in controlled:
			return loc
	if not controlled.is_empty():
		return get_location(str(controlled[0]))
	return locations[0] if not locations.is_empty() else {}

func _absolute_world_hour(time: Dictionary) -> int:
	return maxi(0, int(time.get("day", 1)) - 1) * 24 + int(time.get("hour", 0))

func _summarize_ai_result(result: Dictionary) -> String:
	if result.has("narrative"):
		return str(result.get("narrative", "")).left(180)
	if result.has("summary"):
		return str(result.get("summary", "")).left(180)
	if result.has("description"):
		return str(result.get("description", "")).left(180)
	return JSON.stringify(result).left(180)

func _redact_sensitive(text: String) -> String:
	var redacted := text
	for marker in ["Authorization", "token", "cookie", "secret", "令牌"]:
		if redacted.to_lower().contains(marker.to_lower()):
			redacted = "[已脱敏]"
	return redacted

func _tokenize(text: String) -> Array[String]:
	var normalized := text.replace("，", " ").replace("。", " ").replace(",", " ").replace(".", " ").replace("：", " ").replace(":", " ")
	var result: Array[String] = []
	for part in normalized.split(" ", false):
		var value := part.strip_edges()
		if not value.is_empty():
			result.append(value)
	return result

func _location_name_for_id(location_id: String) -> String:
	for location in locations:
		if str(location.get("id", "")) == location_id:
			return str(location.get("name", ""))
	return ""

func _split_tags(text: String) -> Array[String]:
	var result: Array[String] = []
	for part in text.replace("，", ",").split(",", false):
		var value := part.strip_edges()
		if not value.is_empty():
			result.append(value)
	return result

func _count_thread_ids(items: Array[Dictionary]) -> int:
	var highest := 0
	for item in items:
		var id := str(item.get("id", ""))
		if id.begins_with("thread_"):
			highest = maxi(highest, int(id.trim_prefix("thread_")))
	return highest

func _to_dict_array(value: Variant) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item)
	return result

func _to_string_array(value: Variant) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			result.append(str(item))
	return result
