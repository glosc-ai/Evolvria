extends Node

var _previous_confirm_ai_calls: bool = true
var _cancelled_ai_result: Dictionary = {}

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_confirm_ai_calls = bool(SettingsStore.get_value("confirm_ai_calls", true))
	SettingsStore.settings["confirm_ai_calls"] = false
	var seed := {
		"world_name": "烟测世界",
		"genre": "奇幻",
		"tone": "冒险",
		"limits": "保持可读性",
		"hero": {
			"name": "测试者",
			"description": "记录员",
			"goal": "验证世界循环",
			"ability": "观察,推理",
			"weakness": "过度谨慎"
		},
		"key_characters": [
			{"name": "璃安", "role": "旧友", "relationship": "同行", "description": "提供线索的人"},
			{"name": "赛拉", "role": "竞争者", "relationship": "竞争", "description": "推动冲突的人"}
		]
	}

	await WorldStore.create_world(seed)
	_assert(WorldStore.has_world(), "world should exist")
	_assert(WorldStore.characters.size() >= 3, "characters should be created")
	_assert(WorldStore.locations.size() >= 4, "locations should be created")
	_assert(WorldStore.factions.size() >= 3, "factions should be created")
	_assert(not str(WorldStore.get_location("loc_start").get("controlling_faction_id", "")).is_empty(), "starting location should have faction control")
	_assert(not WorldStore.validate_world_expand_result({"status": "ok", "summary": "", "locations": []}), "invalid world expansion should be rejected")
	_assert(WorldStore.ai_logs.size() >= 1, "world generation should create an AI log")
	var events_after_create := WorldStore.timeline.size()
	await WorldStore.submit_player_action("调查驿站公告上的徽记")
	_assert(WorldStore.timeline.size() > events_after_create, "player action should add events")
	_assert(not WorldStore.suggested_actions.is_empty(), "suggested actions should update")
	_assert(int(WorldStore.world.get("current_time", {}).get("hour", 0)) >= 9, "time should advance")
	_assert(WorldStore.ai_logs.size() >= 2, "player action should create AI logs")
	var current_location := WorldStore.get_current_location()
	_assert("success" in (current_location.get("state_tags", []) as Array), "AI state patch should apply to current location")
	_assert(not WorldStore.apply_state_patches([{"target_type": "character", "target_id": "char_hero", "op": "set", "path": "name", "value": "非法改名"}]), "locked character fields should reject patches")
	_assert(WorldStore.apply_state_patches([{"target_type": "character", "target_id": "char_hero", "op": "set", "path": "status", "value": "focused"}]), "valid character patch should apply")
	_assert(str(WorldStore.get_character("char_hero").get("status", "")) == "focused", "valid patch should change character status")
	_assert(not WorldStore.validate_npc_event_result({"status": "ok", "title": "坏事件", "description": "缺少有效角色和地点", "character_id": "missing", "new_location_id": "missing"}), "invalid NPC event should be rejected")
	var context := WorldStore.build_ai_context("调查徽记")
	_assert(not (context.get("recent_events", []) as Array).is_empty(), "AI context should include recent events")
	_assert(not (context.get("relevant_memories", []) as Array).is_empty(), "AI context should retrieve memories")
	_assert(not (context.get("factions", []) as Array).is_empty(), "AI context should include factions")
	var events_before_faction_tick := WorldStore.timeline.size()
	_assert(WorldStore.run_faction_tick(true), "forced faction tick should run")
	_assert(WorldStore.timeline.size() == events_before_faction_tick + 1, "faction tick should add one event")
	_assert(str(WorldStore.timeline.back().get("type", "")) == "faction_action", "faction tick should create faction events")
	var faction_memory_count := 0
	for memory in WorldStore.memories:
		if str(memory.get("scope", "")) == "faction":
			faction_memory_count += 1
	_assert(faction_memory_count >= 1, "faction tick should write faction memory")
	_assert(WorldStore.refresh_summaries(true), "manual summary refresh should create a phase summary")
	var phase_summaries: Array = WorldStore.world.get("phase_summaries", [])
	_assert(not phase_summaries.is_empty(), "phase summaries should be stored in world state")
	_assert(int(WorldStore.world.get("summary_event_cursor", 0)) == WorldStore.timeline.size(), "summary cursor should catch up to timeline")
	_assert(str(WorldStore.get_character("char_hero").get("memory_summary", "")).contains("阶段记忆"), "character memory summary should update")
	var summary_context := WorldStore.build_ai_context("继续调查")
	_assert(not (summary_context.get("phase_summaries", []) as Array).is_empty(), "AI context should include recent phase summaries")
	var summary_memories := 0
	for memory in WorldStore.memories:
		if str(memory.get("scope", "")) == "summary":
			summary_memories += 1
	_assert(summary_memories >= 1, "summary refresh should write summary memories")
	var location_id := WorldStore.add_custom_location("烟测渡口", "town", "用于验证地图标注。", Vector2(0.33, 0.44))
	_assert(not location_id.is_empty(), "custom location should be created")
	_assert(not WorldStore.get_location(location_id).is_empty(), "custom location should be retrievable")
	_assert(WorldStore.update_location(location_id, "烟测新渡口", "ruin", "用于验证地图标注更新。", Vector2(0.36, 0.47)), "custom location should be editable")
	_assert(str(WorldStore.get_location(location_id).get("name", "")) == "烟测新渡口", "updated location should persist")
	_assert(WorldStore.delete_location(location_id), "custom location should be deletable")
	_assert(WorldStore.get_location(location_id).is_empty(), "deleted location should be gone")
	var smoke_map_path := "user://smoke_map.png"
	var image := Image.create_empty(32, 24, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.22, 0.18, 0.12, 1.0))
	_assert(image.save_png(smoke_map_path) == OK, "smoke map image should be created")
	_assert(WorldStore.import_map_image(smoke_map_path, "烟测地图"), "map image should import")
	_assert(not (WorldStore.world.get("map_image", {}) as Dictionary).is_empty(), "map image metadata should be stored")
	var export_path := SaveManager.export_world(WorldStore.export_payload(), true)
	_assert(not export_path.is_empty(), "world export should return a path")
	_assert(FileAccess.file_exists(export_path), "world export zip should exist")
	var exported_world_name := str(WorldStore.world.get("name", ""))
	WorldStore.reset_world()
	_assert(WorldStore.load_imported_world(export_path), "exported world should import")
	_assert(str(WorldStore.world.get("name", "")) == exported_world_name, "imported world should preserve world name")
	_assert(WorldStore.factions.size() >= 3, "imported world should preserve factions")
	var imported_map := WorldStore.world.get("map_image", {}) as Dictionary
	_assert(FileAccess.file_exists(str(imported_map.get("image_path", ""))), "imported map image should be restored")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(export_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(smoke_map_path))
	WorldStore.clear_ai_logs()
	_assert(WorldStore.ai_logs.is_empty(), "AI logs should be clearable")
	var previous_base_url := str(SettingsStore.get_value("glosc_base_url", ""))
	var previous_token := str(SettingsStore.get_value("glosc_token", ""))
	var previous_auto_retry := bool(SettingsStore.get_value("auto_retry", true))
	var previous_timeout := int(SettingsStore.get_value("timeout_seconds", 45))
	SettingsStore.settings["glosc_base_url"] = "http://"
	SettingsStore.settings["glosc_token"] = "smoke-token"
	SettingsStore.settings["auto_retry"] = true
	SettingsStore.settings["timeout_seconds"] = 1
	var timeline_before_failed_remote := WorldStore.timeline.size()
	await WorldStore.submit_player_action("验证无效远端配置不会推进世界")
	_assert(WorldStore.timeline.size() == timeline_before_failed_remote, "failed remote AI call should not mutate timeline")
	_assert(not WorldStore.ai_logs.is_empty(), "failed remote AI call should create an AI log")
	_assert(str(WorldStore.ai_logs.back().get("status", "")) != "ok", "failed remote AI log should not be ok")
	SettingsStore.settings["glosc_base_url"] = previous_base_url
	SettingsStore.settings["glosc_token"] = previous_token
	SettingsStore.settings["auto_retry"] = previous_auto_retry
	SettingsStore.settings["timeout_seconds"] = previous_timeout
	WorldStore.clear_ai_logs()
	SettingsStore.settings["confirm_ai_calls"] = true
	_cancelled_ai_result = {}
	call_deferred("_start_cancelled_ai_request", seed)
	await get_tree().process_frame
	_assert(AIService.has_pending_confirmation(), "AI confirmation should be pending when enabled")
	AIService.cancel_pending_request()
	while _cancelled_ai_result.is_empty():
		await get_tree().process_frame
	_assert(str(_cancelled_ai_result.get("status", "")) == "cancelled", "cancelled AI request should return cancelled status")
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	print("Evolvria smoke test passed: %d events, %d memories" % [WorldStore.timeline.size(), WorldStore.memories.size()])
	WorldStore.reset_world()
	get_tree().quit()

func _assert(condition: bool, message: String) -> void:
	if condition:
		return
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	push_error(message)
	WorldStore.reset_world()
	get_tree().quit(1)

func _start_cancelled_ai_request(seed: Dictionary) -> void:
	_cancelled_ai_result = await AIService.generate_world(seed)
