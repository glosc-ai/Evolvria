extends Node

signal world_loaded(world_id: String)
signal world_updated(change_set: Dictionary)
signal event_added(event_id: String)
signal time_advanced(new_time: Dictionary)

const SCHEMA_VERSION := 1
const SUMMARY_EVENT_THRESHOLD := 20
const SUMMARY_WINDOW_LIMIT := 30

var world: Dictionary = {}
var characters: Array[Dictionary] = []
var locations: Array[Dictionary] = []
var factions: Array[Dictionary] = []
var timeline: Array[Dictionary] = []
var memories: Array[Dictionary] = []
var ai_logs: Array[Dictionary] = []
var suggested_actions: Array[String] = []

var _event_counter: int = 0
var _memory_counter: int = 0
var _location_counter: int = 100

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
		"suggested_actions": suggested_actions.duplicate(),
		"current_location": get_current_location(),
		"ai_context": build_ai_context("")
	}

func create_world(seed: Dictionary) -> void:
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
		"content_limits": [str(seed.get("limits", ""))],
		"map_image": {},
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
		locations.append(loc)

	characters = _build_characters(seed)
	factions = _build_factions(seed)
	_sync_location_control_from_factions()
	timeline.clear()
	memories.clear()
	ai_logs.clear()
	_event_counter = 0
	_memory_counter = 0
	_location_counter = 100
	record_ai_log("world_expand", ai_result, "初始世界扩写：%s" % seed.get("world_name", "未命名世界"))

	var opening := ai_result.get("opening_event", {}) as Dictionary
	suggested_actions = []
	for item in opening.get("suggested_actions", []):
		suggested_actions.append(str(item))
	add_event("world_event", str(opening.get("title", "开局事件")), str(opening.get("description", "")), ["char_hero"], "loc_start", 0.9)
	add_memory("world", world_id, world.get("summary", ""), timeline.back().get("id", ""), 0.8, ["world", "opening"])
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
	suggested_actions = _to_string_array(payload.get("suggested_actions", []))
	_event_counter = int(payload.get("event_counter", timeline.size()))
	_memory_counter = int(payload.get("memory_counter", memories.size()))
	_location_counter = int(payload.get("location_counter", 100))
	if factions.is_empty() and not world.is_empty():
		factions = _build_factions({"world_name": world.get("name", "世界"), "genre": world.get("genre", "奇幻")})
		_sync_location_control_from_factions()
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
		"suggested_actions": suggested_actions,
		"event_counter": _event_counter,
		"memory_counter": _memory_counter,
		"location_counter": _location_counter,
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
	var target_path := "%s/map_001.%s" % [maps_dir, extension]
	var bytes := FileAccess.get_file_as_bytes(normalized_source)
	if bytes.is_empty():
		AppState.set_error("地图图片为空或无法读取。")
		return false
	var output := FileAccess.open(target_path, FileAccess.WRITE)
	if output == null:
		AppState.set_error("无法写入地图图片。")
		return false
	output.store_buffer(bytes)
	output.close()
	var location_ids: Array[String] = []
	for location in locations:
		location_ids.append(str(location.get("id", "")))
	world["map_image"] = {
		"id": "map_001",
		"name": display_name,
		"image_path": target_path,
		"width": image.get_width(),
		"height": image.get_height(),
		"scale_label": "未设置比例尺",
		"locations": location_ids,
		"routes": []
	}
	var event_id := add_event("world_event", "导入地图：%s" % display_name, "你导入了一张自定义地图图片，后续地点标注会叠加在这张地图上。", ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.45)
	add_memory("world", str(world.get("id", "")), "玩家导入地图图片：%s" % display_name, event_id, 0.45, ["map", "import"])
	_auto_save()
	world_updated.emit({"type": "map_image_imported", "image_path": target_path})
	return true

func submit_player_action(action: String) -> void:
	if action.strip_edges().is_empty() or world.is_empty():
		return
	var before_snapshot := get_snapshot()
	_auto_save()
	var result := await AIService.resolve_player_action(action.strip_edges(), before_snapshot)
	record_ai_log("player_action", result, "玩家行动：%s" % action.strip_edges())
	if not _validate_player_action_result(result):
		world_updated.emit({"type": "ai_response_rejected", "reason": "invalid_player_action_result"})
		_auto_save()
		return
	advance_time(int(result.get("time_delta_hours", 1)))
	var patches := _to_dict_array(result.get("patches", []))
	if not patches.is_empty() and not apply_state_patches(patches):
		record_ai_log("player_action_rejected", {"status": "error", "error": "invalid_state_patch", "request_id": result.get("request_id", "")}, "状态变更校验失败")
		_auto_save()
		return
	var event_id := add_event(
		str(result.get("event_type", "player_action")),
		str(result.get("event_title", "行动结果")),
		str(result.get("narrative", "")),
		["char_hero"],
		str(get_current_location().get("id", "loc_start")),
		float(result.get("importance", 0.6))
	)
	add_memory("character", "char_hero", str(result.get("memory_text", action)), event_id, 0.7, ["player_action"])
	suggested_actions = _to_string_array(result.get("suggested_actions", []))
	await run_npc_tick()
	run_faction_tick(false)
	refresh_summaries(false)
	_auto_save()
	world_updated.emit({"type": "player_action", "event_id": event_id})

func run_npc_tick() -> void:
	if world.is_empty():
		return
	var generated := await SimulationEngine.advance_world(get_snapshot(), 2)
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

func add_event(type: String, title: String, description: String, participants: Array, location_id: String, importance: float) -> String:
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
	timeline.append(event)
	for index in range(locations.size()):
		if str(locations[index].get("id", "")) == location_id:
			var event_ids: Array = locations[index].get("event_ids", [])
			event_ids.append(event_id)
			locations[index]["event_ids"] = event_ids
	event_added.emit(event_id)
	return event_id

func add_memory(scope: String, owner_id: String, text: String, event_id: String, importance: float, tags: Array) -> String:
	_memory_counter += 1
	var memory_id := "mem_%04d" % _memory_counter
	memories.append({
		"id": memory_id,
		"scope": scope,
		"owner_id": owner_id,
		"text": text,
		"event_id": event_id,
		"importance": importance,
		"confidence": 1.0,
		"tags": tags,
		"created_world_time": world.get("current_time", {}).duplicate(true)
	})
	return memory_id

func record_ai_log(purpose: String, result: Dictionary, prompt_summary: String = "") -> void:
	var usage := result.get("usage", {}) as Dictionary
	ai_logs.append({
		"id": str(result.get("request_id", "local_%04d" % (ai_logs.size() + 1))),
		"world_id": str(world.get("id", "")),
		"purpose": purpose,
		"model": str(SettingsStore.get_value("model", "local-simulator")),
		"started_at": Time.get_datetime_string_from_system(true),
		"finished_at": Time.get_datetime_string_from_system(true),
		"status": str(result.get("status", "ok")),
		"error": str(result.get("error", "")),
		"usage": {
			"input_tokens": int(usage.get("input_tokens", 0)),
			"output_tokens": int(usage.get("output_tokens", 0)),
			"cost_estimate": usage.get("cost", null)
		},
		"prompt_summary": _redact_sensitive(prompt_summary),
		"response_summary": _summarize_ai_result(result)
	})
	if ai_logs.size() > 80:
		ai_logs = ai_logs.slice(ai_logs.size() - 80, ai_logs.size())

func clear_ai_logs() -> void:
	ai_logs.clear()
	_auto_save()
	world_updated.emit({"type": "ai_logs_cleared"})

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
	return true

func build_ai_context(user_action: String) -> Dictionary:
	var current_location := get_current_location()
	var participant_ids: Array[String] = ["char_hero"]
	for character in characters:
		var data := character as Dictionary
		if str(data.get("current_location_id", "")) == str(current_location.get("id", "")):
			participant_ids.append(str(data.get("id", "")))
	return {
		"world_summary": world.get("summary", ""),
		"phase_summaries": _recent_phase_summaries(3),
		"world_rules": world.get("rules", []),
		"factions": factions.duplicate(true),
		"current_time": world.get("current_time", {}),
		"scene_state": {
			"location": current_location,
			"present_character_ids": participant_ids,
			"user_action": user_action
		},
		"recent_events": get_recent_events(8),
		"relevant_memories": retrieve_memories(user_action, str(current_location.get("id", "")), participant_ids, 8),
		"content_limits": world.get("content_limits", [])
	}

func get_recent_events(limit: int = 8) -> Array[Dictionary]:
	var start := maxi(0, timeline.size() - limit)
	return timeline.slice(start, timeline.size())

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
		add_event("location_change", "删除地点：%s" % location_name, "你从地图标注中移除了%s。历史事件仍保留原始记录。" % location_name, ["char_hero"], str(get_current_location().get("id", "loc_start")), 0.25)
		_auto_save()
		world_updated.emit({"type": "location_deleted", "location_id": location_id})
		return true
	return false

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

func move_player_to(location_id: String) -> void:
	var location := get_location(location_id)
	if location.is_empty():
		return
	_update_character_location("char_hero", location_id)
	advance_time(2)
	var event_id := add_event("player_action", "移动到%s" % location.get("name", "未知地点"), "你沿着已知路线抵达%s。途中世界时间继续推进。" % location.get("name", "未知地点"), ["char_hero"], location_id, 0.45)
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

func get_faction(faction_id: String) -> Dictionary:
	for faction in factions:
		if str(faction.get("id", "")) == faction_id:
			return faction
	return {}

func faction_name(faction_id: String) -> String:
	var faction := get_faction(faction_id)
	return str(faction.get("name", "无控制势力")) if not faction.is_empty() else "无控制势力"

func reset_world() -> void:
	world.clear()
	characters.clear()
	locations.clear()
	factions.clear()
	timeline.clear()
	memories.clear()
	ai_logs.clear()
	suggested_actions.clear()
	SaveManager.delete_save()
	AppState.set_current_world("")
	world_updated.emit({"type": "world_reset"})

func _validate_player_action_result(result: Dictionary) -> bool:
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
	return true

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

func _auto_save() -> void:
	if not world.is_empty():
		SaveManager.save_game(export_payload())

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
		"memory_summary": "故事刚刚开始。",
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
		result.append({
			"id": "char_%03d" % index,
			"name": str(data.get("name", "角色%d" % index)),
			"role": str(data.get("role", "关键角色")),
			"description": str(data.get("description", "仍有许多未知之处。")),
			"personality": _split_tags(str(data.get("personality", "谨慎,执着"))),
			"goals": _split_tags(str(data.get("goal", "推进自己的计划"))),
			"secrets": ["未知"],
			"current_location_id": ["loc_start", "loc_archive", "loc_forest", "loc_citadel"][index % 4],
			"status": "active",
			"traits": _split_tags(str(data.get("traits", "关键角色"))),
			"relationship": str(data.get("relationship", "未知")),
			"memory_summary": "尚未形成稳定记忆。",
			"known_event_ids": []
		})
		index += 1
	return result

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
