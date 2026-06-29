extends Node

var _previous_confirm_ai_calls: bool = true
var _previous_show_usage_estimate: bool = true
var _previous_auto_save_enabled: bool = true
var _previous_content_preferences: String = ""
var _previous_log_level: String = "debug"
var _previous_developer_mode: bool = false
var _cancelled_ai_result: Dictionary = {}

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_confirm_ai_calls = bool(SettingsStore.get_value("confirm_ai_calls", true))
	_previous_show_usage_estimate = bool(SettingsStore.get_value("show_usage_estimate", true))
	_previous_auto_save_enabled = bool(SettingsStore.get_value("auto_save_enabled", true))
	_previous_content_preferences = str(SettingsStore.get_value("content_preferences", ""))
	_previous_log_level = str(SettingsStore.get_value("log_level", "debug"))
	_previous_developer_mode = bool(SettingsStore.get_value("developer_mode", false))
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["show_usage_estimate"] = true
	SettingsStore.settings["auto_save_enabled"] = true
	SettingsStore.settings["content_preferences"] = "已禁用：极端血腥、酷刑描写；偏好：严肃冒险、低剧透。"
	SettingsStore.settings["log_level"] = "debug"
	SettingsStore.settings["developer_mode"] = false
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
			{"name": "璃安", "role": "旧友", "relationship": "同行", "personality": "温和,谨慎", "goal": "查清徽记来源", "secret": "知道徽记与旧档案有关", "action_tendency": "保护主角并暗中确认线索", "description": "提供线索的人"},
			{"name": "赛拉", "role": "竞争者", "relationship": "竞争", "personality": "果断,好胜", "goal": "抢先得到档案", "secret": "曾为边境守望工作", "action_tendency": "主动追踪遗迹并试探玩家", "description": "推动冲突的人"}
		],
		"narrative_detail": "详细",
		"npc_autonomy_frequency": "高频"
	}

	var world_estimate := AIService.estimate_usage("world_expand", {"seed": seed})
	_assert(str(world_estimate.get("purpose_label", "")) == "世界扩写", "world estimate should label the request purpose")
	_assert(int(world_estimate.get("total_tokens", 0)) > int(world_estimate.get("output_tokens", 0)), "world estimate should include input and output tokens")
	_assert(str(world_estimate.get("risk_level", "")) == "高", "world expansion estimate should disclose high risk")
	_assert(AIService.estimate_usage_text(world_estimate).contains("预计 Token"), "estimate text should be user readable")
	_assert(not SettingsStore.can_store_glosc_token("smoke-token", false), "token storage should require local risk acknowledgement")
	_assert(SettingsStore.can_store_glosc_token("smoke-token", true), "acknowledged token storage should be allowed")
	_assert(SettingsStore.can_store_glosc_token("", false), "empty token should not require acknowledgement")
	_assert(SettingsStore.local_token_risk_text().contains("settings.json"), "token risk text should name the local settings file")

	await WorldStore.create_world(seed)
	_assert(WorldStore.has_world(), "world should exist")
	_assert(WorldStore.characters.size() >= 3, "characters should be created")
	_assert(WorldStore.locations.size() >= 4, "locations should be created")
	_assert(WorldStore.factions.size() >= 3, "factions should be created")
	_assert(not str(WorldStore.get_location("loc_start").get("controlling_faction_id", "")).is_empty(), "starting location should have faction control")
	_assert(not WorldStore.get_relationship("char_hero", "char_001").is_empty(), "hero relationships should be initialized")
	_assert(WorldStore.threads.size() >= 2, "initial threads should be created")
	_assert(str(WorldStore.world.get("narrative_detail", "")) == "详细", "world should preserve narrative detail preference")
	_assert(str(WorldStore.world.get("npc_autonomy_frequency", "")) == "高频", "world should preserve NPC autonomy preference")
	var generated_map := WorldStore.world.get("map_image", {}) as Dictionary
	_assert(not generated_map.is_empty(), "world creation should generate a fantasy map image")
	_assert(FileAccess.file_exists(str(generated_map.get("image_path", ""))), "generated fantasy map image should exist")
	var generated_meta := generated_map.get("generator", {}) as Dictionary
	_assert(str(generated_meta.get("source_project", "")) == "Azgaar/Fantasy-Map-Generator", "generated map should preserve Azgaar source attribution")
	_assert(str(generated_meta.get("source_license", "")) == "MIT", "generated map should preserve source license metadata")
	_assert(not WorldStore.get_map_routes().is_empty(), "generated map should create initial map routes")
	_assert(not str(WorldStore.get_location("loc_start").get("biome", "")).is_empty(), "generated map should annotate locations with biomes")
	_verify_ai_can_parse_map_context()
	var reference_map_path := "user://reference_map_fixture.png"
	_assert(_create_reference_map_fixture(reference_map_path), "reference map fixture should be created")
	_assert(WorldStore.generate_fantasy_map_from_reference(reference_map_path, "参考图烟测地图"), "reference image should generate a structured map")
	var reference_map := WorldStore.world.get("map_image", {}) as Dictionary
	var reference_meta := reference_map.get("generator", {}) as Dictionary
	_assert(str(reference_meta.get("mode", "")) == "reference_image", "reference-generated map should store generator mode")
	var reference_features := reference_meta.get("reference_features", {}) as Dictionary
	_assert(float(reference_features.get("land_ratio", 0.0)) > 0.2, "reference generation should detect land")
	_assert(float(reference_features.get("water_ratio", 0.0)) > 0.1, "reference generation should detect water")
	_assert(int(reference_features.get("region_border_pixels", 0)) > 0, "reference generation should detect red region borders")
	var reference_context := WorldStore.build_map_ai_context()
	var reference_borders := reference_context.get("region_borders", {}) as Dictionary
	_assert(bool(reference_borders.get("generated", false)), "AI map context should expose reference region borders")
	_verify_ai_can_parse_map_context()
	_assert("char_001" in WorldStore.get_companion_ids(), "initial companion relationship should create a companion")
	_assert(str(WorldStore.get_character("char_001").get("current_location_id", "")) == str(WorldStore.get_current_location().get("id", "")), "companions should start with the player")
	_assert(str(WorldStore.get_character("char_001").get("action_tendency", "")).contains("保护主角"), "key character action tendency should be stored")
	_assert("查清徽记来源" in (WorldStore.get_character("char_001").get("goals", []) as Array), "key character goal should be parsed from structured creation data")
	_assert("char_002" in _character_ids(WorldStore.get_characters_filtered("仅听闻")), "fresh roster should separate only-heard characters before events involve them")
	var npc_fixture := await AIService.create_npc_event(WorldStore.get_character("char_002"), WorldStore.get_snapshot())
	_assert(str(npc_fixture.get("description", "")).contains("主动追踪遗迹"), "NPC local simulation should use character action tendency")
	_assert(not WorldStore.can_join_companion("char_hero"), "hero should not be joinable as a companion")
	var content_limits: Array = WorldStore.world.get("content_limits", [])
	_assert("保持可读性" in content_limits, "world should preserve seed content limits")
	_assert("已禁用：极端血腥、酷刑描写" in content_limits, "world should include global content restrictions")
	_assert("偏好：严肃冒险、低剧透。" in content_limits, "world should include global style preferences")
	var initial_thread_id := str(WorldStore.threads[0].get("id", ""))
	_assert(str(WorldStore.get_character("char_001").get("player_notes", "")) == "", "character notes should default empty")
	_assert(WorldStore.update_character_note("char_001", "怀疑她知道徽记来源。"), "character notes should be editable")
	_assert(str(WorldStore.get_character("char_001").get("player_notes", "")) == "怀疑她知道徽记来源。", "character notes should persist in memory")
	var trust_before_action := float(WorldStore.get_relationship("char_001", "char_hero").get("trust", 0.0))
	_assert(not WorldStore.validate_world_expand_result({"status": "ok", "summary": "", "locations": []}), "invalid world expansion should be rejected")
	_assert(WorldStore.ai_logs.size() >= 1, "world generation should create an AI log")
	_verify_ai_log_levels()
	var events_after_create := WorldStore.timeline.size()
	await WorldStore.submit_player_action("调查驿站公告上的徽记")
	_assert(SaveManager.has_ai_checkpoint(), "AI request should keep a pre-request checkpoint")
	var ai_checkpoint := SaveManager.get_ai_checkpoint_entry()
	_assert(bool(ai_checkpoint.get("schema_valid", false)), "AI pre-request checkpoint should validate schema")
	_assert(int(ai_checkpoint.get("event_count", -1)) == events_after_create, "AI pre-request checkpoint should capture state before action result")
	_assert(WorldStore.timeline.size() > events_after_create, "player action should add events")
	var backup_files := SaveManager.list_backup_files()
	_assert(not backup_files.is_empty(), "auto-save should create recovery backups")
	_assert(backup_files.size() <= 5, "auto-save should keep only recent backups")
	var active_save_entry := SaveManager.get_active_save_entry()
	_assert(not active_save_entry.is_empty(), "active save should expose metadata")
	_assert(bool(active_save_entry.get("schema_valid", false)), "active save metadata should validate schema")
	_assert(str(active_save_entry.get("world_name", "")) == "烟测世界", "active save metadata should include world name")
	var backup_entries := SaveManager.list_backup_entries()
	_assert(backup_entries.size() == backup_files.size(), "backup entries should mirror backup files")
	_assert(str(backup_entries[0].get("path", "")) == backup_files.back(), "backup entries should list newest backup first")
	_assert(bool(backup_entries[0].get("schema_valid", false)), "backup metadata should validate schema")
	_assert(str(backup_entries[0].get("world_name", "")) == "烟测世界", "backup metadata should include world name")
	_assert(int(backup_entries[0].get("event_count", 0)) >= 1, "backup metadata should include event count")
	_assert(DirAccess.dir_exists_absolute(SaveManager.get_export_dir_path()), "export directory should exist")
	_assert(DirAccess.dir_exists_absolute(SaveManager.get_backup_dir_path()), "backup directory should exist")
	_assert(SaveManager.can_reveal_directories(), "desktop smoke test should support opening save directories")
	var restored_selected_backup := SaveManager.restore_backup(str(backup_entries[0].get("path", "")))
	_assert(not restored_selected_backup.is_empty(), "selected backup should be restorable")
	var restored_backup := SaveManager.restore_latest_backup()
	_assert(not restored_backup.is_empty(), "latest backup should be restorable")
	_assert(SaveManager.validate_payload_schema(restored_backup), "restored backup should satisfy save schema")
	SaveManager.save_game(WorldStore.export_payload())
	var backup_files_before_disabled_save := SaveManager.list_backup_files()
	SettingsStore.settings["auto_save_enabled"] = false
	_assert(WorldStore.update_location_note(str(WorldStore.get_current_location().get("id", "")), "自动保存关闭时的临时备注。"), "location note should still edit while auto-save is disabled")
	_assert(SaveManager.list_backup_files() == backup_files_before_disabled_save, "disabled auto-save should not create a normal backup")
	SettingsStore.settings["auto_save_enabled"] = true
	_assert(WorldStore.update_location_note(str(WorldStore.get_current_location().get("id", "")), ""), "temporary location note should be clearable")
	_assert(not WorldStore.suggested_actions.is_empty(), "suggested actions should update")
	_assert(int(WorldStore.world.get("current_time", {}).get("hour", 0)) >= 9, "time should advance")
	_assert(WorldStore.ai_logs.size() >= 2, "player action should create AI logs")
	var usage_summary := WorldStore.get_ai_usage_summary()
	_assert(int(usage_summary.get("calls", 0)) == WorldStore.ai_logs.size(), "usage summary should count AI calls")
	_assert(int(usage_summary.get("success_count", 0)) >= 2, "usage summary should count successful calls")
	_assert(int(usage_summary.get("total_tokens", 0)) > 0, "usage summary should aggregate tokens")
	var ai_log_summary_text := WorldStore.ai_logs_summary_text()
	_assert(ai_log_summary_text.contains("Evolvria AI 日志摘要"), "AI log summary text should have a heading")
	_assert(ai_log_summary_text.contains("world_expand"), "AI log summary should include request purposes")
	var ai_log_export_path := WorldStore.export_ai_logs()
	_assert(not ai_log_export_path.is_empty(), "AI logs should export as JSONL")
	_assert(FileAccess.file_exists(ai_log_export_path), "AI log export file should exist")
	_assert(WorldStore.validate_world_consistency().is_empty(), "world consistency check should pass after player action")
	var consistency_result := await WorldStore.run_consistency_check()
	_assert(str(consistency_result.get("status", "")) == "ok", "AI consistency check should return ok status")
	_assert((consistency_result.get("contradictions", []) as Array).is_empty(), "AI consistency check should report no contradictions for valid world")
	_assert(str(WorldStore.ai_logs.back().get("purpose", "")) == "consistency_check", "AI consistency check should be recorded in logs")
	WorldStore.timeline.append({
		"id": "evt_bad_consistency",
		"type": "world_event",
		"title": "坏引用",
		"description": "用于验证一致性检查。",
		"world_time": {"day": 0, "hour": 0},
		"location_id": "loc_missing",
		"participant_ids": ["char_missing"]
	})
	var consistency_issues := WorldStore.validate_world_consistency()
	_assert(not consistency_issues.is_empty(), "world consistency check should detect broken references")
	var broken_consistency_result := await AIService.check_consistency({"issues": consistency_issues, "context": {}})
	_assert(not (broken_consistency_result.get("contradictions", []) as Array).is_empty(), "AI consistency check should expose contradictions for broken references")
	WorldStore.timeline.pop_back()
	var trust_after_action := float(WorldStore.get_relationship("char_001", "char_hero").get("trust", 0.0))
	_assert(trust_after_action > trust_before_action, "player action should update relationship trust")
	_assert(not WorldStore.get_active_threads().is_empty(), "active threads should be queryable")
	var progressed := false
	for thread in WorldStore.threads:
		if not (thread.get("progress", []) as Array).is_empty():
			progressed = true
	_assert(progressed, "player action should append thread progress")
	_assert(WorldStore.resolve_thread(initial_thread_id), "threads should be manually resolvable")
	_assert(str(WorldStore.threads[0].get("status", "")) == "resolved", "resolved thread should update status")
	var relationship_memory_count := 0
	for memory in WorldStore.memories:
		if "relationship" in (memory.get("tags", []) as Array):
			relationship_memory_count += 1
	_assert(relationship_memory_count >= 1, "relationship changes should write character memories")
	WorldStore.move_player_to("loc_forest")
	_assert(str(WorldStore.get_character("char_001").get("current_location_id", "")) == "loc_forest", "companions should follow player movement")
	var companion_context := WorldStore.build_ai_context("查看同行")
	var companion_scene := companion_context.get("scene_state", {}) as Dictionary
	_assert("char_001" in (companion_scene.get("companion_character_ids", []) as Array), "AI context should include companion ids")
	_assert(WorldStore.set_character_companion("char_001", false), "companions should be able to leave party")
	WorldStore.move_player_to("loc_start")
	_assert(str(WorldStore.get_character("char_001").get("current_location_id", "")) == "loc_forest", "former companion should stop following movement")
	var after_leave_context := WorldStore.build_ai_context("查看离队角色")
	var after_leave_scene := after_leave_context.get("scene_state", {}) as Dictionary
	_assert(not "char_001" in (after_leave_scene.get("companion_character_ids", []) as Array), "former companion should leave AI companion context")
	_assert(WorldStore.set_character_companion("char_001", true), "companions should be able to rejoin")
	_assert(str(WorldStore.get_character("char_001").get("current_location_id", "")) == str(WorldStore.get_current_location().get("id", "")), "rejoining companion should move to player location")
	_assert(WorldStore.apply_state_patches([{"target_type": "character", "target_id": "char_002", "op": "set", "path": "status", "value": "left"}]), "test fixture should mark character left")
	_assert(not WorldStore.can_join_companion("char_002"), "left characters should not be able to join companions")
	var current_location := WorldStore.get_current_location()
	var current_location_id := str(current_location.get("id", ""))
	_assert(str(current_location.get("player_notes", "")) == "", "location notes should default empty")
	_assert(WorldStore.update_location_note(current_location_id, "这里的公告板反复出现徽记。"), "location notes should be editable")
	_assert(str(WorldStore.get_current_location().get("player_notes", "")) == "这里的公告板反复出现徽记。", "location notes should persist in memory")
	var player_action_events := WorldStore.get_timeline_filtered("player_action", "", "")
	_assert(not player_action_events.is_empty(), "timeline should filter by event type")
	var resolved_player_action := _find_event_with_outcome(player_action_events, "success")
	_assert(not resolved_player_action.is_empty(), "player action event should store outcome metadata")
	_assert(str(resolved_player_action.get("outcome_reason", "")).contains("场景"), "player action outcome should explain reason")
	_assert(str(resolved_player_action.get("consequence", "")).contains("线索"), "player action outcome should explain consequence")
	for entry in player_action_events:
		_assert(str(entry.get("type", "")) == "player_action", "type-filtered timeline should only include matching events")
	var hero_events := WorldStore.get_timeline_filtered("", "char_hero", "")
	_assert(not hero_events.is_empty(), "timeline should filter by character")
	for entry in hero_events:
		_assert("char_hero" in (entry.get("participant_ids", []) as Array), "character-filtered timeline should only include matching participants")
	var location_events := WorldStore.get_timeline_filtered("", "", current_location_id)
	_assert(not location_events.is_empty(), "timeline should filter by location")
	for entry in location_events:
		_assert(str(entry.get("location_id", "")) == current_location_id, "location-filtered timeline should only include matching locations")
	var combined_events := WorldStore.get_timeline_filtered("player_action", "char_hero", current_location_id)
	_assert(not combined_events.is_empty(), "timeline should combine type, character, and location filters")
	for entry in combined_events:
		_assert(str(entry.get("type", "")) == "player_action", "combined timeline filter should match type")
		_assert("char_hero" in (entry.get("participant_ids", []) as Array), "combined timeline filter should match character")
		_assert(str(entry.get("location_id", "")) == current_location_id, "combined timeline filter should match location")
	var companion_roster_ids := _character_ids(WorldStore.get_characters_filtered("同行"))
	_assert("char_001" in companion_roster_ids, "character roster should filter companions")
	var hostile_roster_ids := _character_ids(WorldStore.get_characters_filtered("敌对"))
	_assert("char_002" in hostile_roster_ids, "character roster should filter rivals and hostile relationships")
	var met_roster_ids := _character_ids(WorldStore.get_characters_filtered("已遇见"))
	_assert("char_hero" in met_roster_ids and "char_001" in met_roster_ids, "character roster should filter met characters")
	var heard_roster_ids := _character_ids(WorldStore.get_characters_filtered("仅听闻"))
	_assert(not "char_hero" in heard_roster_ids and not "char_001" in heard_roster_ids, "only-heard roster should exclude the hero and companions")
	var companion_recent_events := WorldStore.get_character_recent_events("char_001", 3)
	_assert(not companion_recent_events.is_empty(), "character roster should expose recent related events")
	for entry in companion_recent_events:
		_assert("char_001" in (entry.get("participant_ids", []) as Array), "recent character events should match the requested character")
	_assert("success" in (current_location.get("state_tags", []) as Array), "AI state patch should apply to current location")
	_assert(not WorldStore.apply_state_patches([{"target_type": "character", "target_id": "char_hero", "op": "set", "path": "name", "value": "非法改名"}]), "locked character fields should reject patches")
	var location_description_before := str(WorldStore.get_current_location().get("description", ""))
	_assert(not WorldStore.apply_state_patches([{"target_type": "location", "target_id": current_location_id, "op": "set", "path": "description", "value": "AI 试图覆盖已确认地点描述。"}]), "confirmed location descriptions should reject conflicting patches")
	_assert(str(WorldStore.get_current_location().get("description", "")) == location_description_before, "rejected conflicting patch should not mutate location")
	_assert(WorldStore.apply_state_patches([{"target_type": "character", "target_id": "char_hero", "op": "set", "path": "status", "value": "focused"}]), "valid character patch should apply")
	_assert(str(WorldStore.get_character("char_hero").get("status", "")) == "focused", "valid patch should change character status")
	_assert(not WorldStore.validate_npc_event_result({"status": "ok", "title": "坏事件", "description": "缺少有效角色和地点", "character_id": "missing", "new_location_id": "missing"}), "invalid NPC event should be rejected")
	var context := WorldStore.build_ai_context("调查徽记")
	_assert(not (context.get("recent_events", []) as Array).is_empty(), "AI context should include recent events")
	_assert(not (context.get("relevant_memories", []) as Array).is_empty(), "AI context should retrieve memories")
	_assert(not (context.get("factions", []) as Array).is_empty(), "AI context should include factions")
	_assert(not (context.get("relationships", []) as Array).is_empty(), "AI context should include relationships")
	_assert("已禁用：极端血腥、酷刑描写" in (context.get("content_limits", []) as Array), "AI context should include content preferences")
	var action_estimate := AIService.estimate_usage("player_action", {"action": "调查徽记", "context": context})
	_assert(str(action_estimate.get("purpose_label", "")) == "玩家行动判定", "player action estimate should label the request purpose")
	_assert(int(action_estimate.get("total_tokens", 0)) >= 500, "player action estimate should account for context size")
	_assert(str(action_estimate.get("billing_note", "")).contains("本地模拟"), "local estimate should disclose no remote billing")
	await WorldStore.submit_player_action("飞到月亮并直接通关")
	var blocked_events := WorldStore.get_timeline_filtered("player_action", "", "")
	var blocked_event := _find_event_with_outcome(blocked_events, "blocked")
	_assert(str(blocked_event.get("outcome", "")) == "blocked", "impossible action should be marked blocked")
	_assert(str(blocked_event.get("outcome_reason", "")).contains("缺少"), "blocked action should explain missing conditions")
	_assert(str(blocked_event.get("consequence", "")).contains("受阻"), "blocked action should explain consequence")
	var safety_check := WorldStore.evaluate_content_boundary("详细描写酷刑过程")
	_assert(bool(safety_check.get("blocked", false)), "content boundary should detect disabled content")
	var ai_logs_before_safety_block := WorldStore.ai_logs.size()
	var timeline_before_safety_block := WorldStore.timeline.size()
	await WorldStore.submit_player_action("详细描写酷刑过程")
	_assert(WorldStore.timeline.size() == timeline_before_safety_block + 1, "content boundary block should add an explainable timeline event")
	_assert(WorldStore.ai_logs.size() == ai_logs_before_safety_block, "content boundary block should not send an AI request")
	var safety_blocked_event := _find_event_with_outcome(WorldStore.get_timeline_filtered("player_action", "", ""), "blocked")
	_assert(str(safety_blocked_event.get("outcome_reason", "")).contains("禁用内容"), "content boundary block should name the policy reason")
	_assert(str(safety_blocked_event.get("consequence", "")).contains("未向 AI 发送请求"), "content boundary block should explain no remote request happened")
	var developer_event_before := WorldStore.timeline.size()
	_assert(WorldStore.add_developer_event("未开启调试", "不应写入。").is_empty(), "developer events should require developer mode")
	_assert(WorldStore.timeline.size() == developer_event_before, "developer event should not mutate timeline while disabled")
	SettingsStore.settings["developer_mode"] = true
	var developer_event_id := WorldStore.add_developer_event("烟测调试事件", "用于验证开发者事件编辑器。")
	_assert(not developer_event_id.is_empty(), "developer mode should allow manual debug events")
	_assert(WorldStore.timeline.size() == developer_event_before + 1, "developer event should append to timeline")
	_assert(str(WorldStore.timeline.back().get("type", "")) == "developer_note", "developer event should use default developer event type")
	SettingsStore.settings["developer_mode"] = false
	var events_before_faction_tick := WorldStore.timeline.size()
	_assert(WorldStore.run_faction_tick(true), "forced faction tick should run")
	_assert(WorldStore.timeline.size() == events_before_faction_tick + 1, "faction tick should add one event")
	_assert(str(WorldStore.timeline.back().get("type", "")) == "faction_action", "faction tick should create faction events")
	var faction_memory_count := 0
	for memory in WorldStore.memories:
		if str(memory.get("scope", "")) == "faction":
			faction_memory_count += 1
	_assert(faction_memory_count >= 1, "faction tick should write faction memory")
	var summary_update_result := await WorldStore.run_summary_update(true)
	_assert(str(summary_update_result.get("status", "")) == "ok", "summary_update should return ok status")
	_assert(not str(summary_update_result.get("world_phase_summary", "")).is_empty(), "summary_update should return world phase summary text")
	var phase_summaries: Array = WorldStore.world.get("phase_summaries", [])
	_assert(not phase_summaries.is_empty(), "phase summaries should be stored in world state")
	_assert(int(WorldStore.world.get("summary_event_cursor", 0)) == WorldStore.timeline.size(), "summary cursor should catch up to timeline")
	_assert(str(WorldStore.get_character("char_hero").get("memory_summary", "")).contains("阶段记忆"), "character memory summary should update")
	_assert(str(WorldStore.ai_logs.back().get("purpose", "")) == "summary_update", "summary_update should be recorded in AI logs")
	var summary_context := WorldStore.build_ai_context("继续调查")
	_assert(not (summary_context.get("phase_summaries", []) as Array).is_empty(), "AI context should include recent phase summaries")
	var summary_memories := 0
	for memory in WorldStore.memories:
		if str(memory.get("scope", "")) == "summary":
			summary_memories += 1
	_assert(summary_memories >= 1, "summary refresh should write summary memories")
	var memories_before_extract := WorldStore.memories.size()
	var memory_extract_result := await WorldStore.run_memory_extract()
	_assert(str(memory_extract_result.get("status", "")) == "ok", "memory_extract should return ok status")
	_assert(not (memory_extract_result.get("facts", []) as Array).is_empty(), "memory_extract should return extracted facts")
	_assert(int(memory_extract_result.get("written_memories", 0)) >= 1, "memory_extract should write at least one memory")
	_assert(WorldStore.memories.size() > memories_before_extract, "memory_extract should append memories to world state")
	_assert(str(WorldStore.ai_logs.back().get("purpose", "")) == "memory_extract", "memory_extract should be recorded in AI logs")
	var day_before_advance := int(WorldStore.world.get("current_time", {}).get("day", 1))
	var events_before_day_advance := WorldStore.timeline.size()
	var day_result := await WorldStore.advance_day()
	_assert(not day_result.is_empty(), "advance day should return a result")
	_assert(int(WorldStore.world.get("current_time", {}).get("day", 1)) >= day_before_advance + 1, "advance day should move world by at least one day")
	_assert(WorldStore.timeline.size() > events_before_day_advance, "advance day should add events")
	_assert(str(WorldStore.timeline.back().get("type", "")) == "day_advance", "advance day should finish with a day_advance event")
	_assert(not WorldStore.suggested_actions.is_empty(), "advance day should update suggested actions")
	var day_memory_count := 0
	for memory in WorldStore.memories:
		if "day_advance" in (memory.get("tags", []) as Array):
			day_memory_count += 1
	_assert(day_memory_count >= 1, "advance day should write world memory")
	var location_id := WorldStore.add_custom_location("烟测渡口", "town", "用于验证地图标注。", Vector2(0.33, 0.44))
	_assert(not location_id.is_empty(), "custom location should be created")
	_assert(not WorldStore.get_location(location_id).is_empty(), "custom location should be retrievable")
	_assert(WorldStore.update_location(location_id, "烟测新渡口", "ruin", "用于验证地图标注更新。", Vector2(0.36, 0.47)), "custom location should be editable")
	_assert(str(WorldStore.get_location(location_id).get("name", "")) == "烟测新渡口", "updated location should persist")
	_assert(WorldStore.update_location_position(location_id, Vector2(0.91, 0.08)), "custom location marker should be draggable/editable by position")
	var dragged_position := WorldStore.get_location(location_id).get("position", {}) as Dictionary
	_assert(is_equal_approx(float(dragged_position.get("x", 0.0)), 0.91), "dragged location x position should persist")
	_assert(is_equal_approx(float(dragged_position.get("y", 0.0)), 0.08), "dragged location y position should persist")
	_assert(WorldStore.set_location_known(location_id, false), "custom location should support hidden visibility")
	var hidden_visible_count := WorldStore.get_visible_locations(false).size()
	_assert(WorldStore.get_visible_locations(true).size() > hidden_visible_count, "hidden location should be omitted unless unknowns are revealed")
	_assert(WorldStore.set_location_known(location_id, true), "custom location should support rediscovery")
	var current_location_for_route := str(WorldStore.get_current_location().get("id", "loc_start"))
	var direct_hours := WorldStore.estimate_travel_hours(current_location_for_route, location_id)
	_assert(WorldStore.add_map_route(current_location_for_route, location_id, "烟测路线", "road", 0.0), "map route should be created")
	_assert(not WorldStore.add_map_route(location_id, current_location_for_route, "重复路线", "road", 0.0), "duplicate map route should be rejected")
	_assert(not WorldStore.get_route_between(current_location_for_route, location_id).is_empty(), "map route should be queryable")
	_assert(WorldStore.estimate_travel_hours(current_location_for_route, location_id) <= direct_hours, "map route should reduce or match direct travel estimate")
	var route_context := WorldStore.build_ai_context("查看路线")
	var route_scene := route_context.get("scene_state", {}) as Dictionary
	_assert(not (route_scene.get("routes", []) as Array).is_empty(), "AI context should include routes from current location")
	var nearby_locations: Array = route_scene.get("nearby_locations", [])
	_assert(not nearby_locations.is_empty(), "AI context should include nearby locations from current location")
	var nearby_route_match := false
	for nearby in nearby_locations:
		var data := nearby as Dictionary
		if str(data.get("id", "")) == location_id:
			nearby_route_match = bool(data.get("has_route", false)) and str(data.get("route_name", "")) == "烟测路线"
	_assert(nearby_route_match, "nearby location context should include route metadata")
	_assert(WorldStore.delete_location(location_id), "custom location should be deletable")
	_assert(WorldStore.get_location(location_id).is_empty(), "deleted location should be gone")
	_assert(WorldStore.get_route_between(current_location_for_route, location_id).is_empty(), "deleting a location should remove related routes")
	_assert(not WorldStore.get_map_routes().is_empty(), "deleting a custom location should preserve generated base routes")
	var smoke_map_path := "user://smoke_map.png"
	var image := Image.create_empty(32, 24, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.22, 0.18, 0.12, 1.0))
	_assert(image.save_png(smoke_map_path) == OK, "smoke map image should be created")
	_assert(WorldStore.import_map_image(smoke_map_path, "烟测地图"), "map image should import")
	var small_map := WorldStore.world.get("map_image", {}) as Dictionary
	_assert(not small_map.is_empty(), "map image metadata should be stored")
	_assert(int(small_map.get("width", 0)) == 32 and int(small_map.get("height", 0)) == 24, "small map image dimensions should be preserved")
	_assert(not bool(small_map.get("resized_for_device", true)), "small map image should not be resized")
	var large_map_path := "user://smoke_large_map.png"
	var large_image := Image.create_empty(WorldStore.MAX_MAP_IMAGE_DIMENSION + 512, 512, false, Image.FORMAT_RGBA8)
	large_image.fill(Color(0.12, 0.22, 0.18, 1.0))
	_assert(large_image.save_png(large_map_path) == OK, "large smoke map image should be created")
	_assert(WorldStore.import_map_image(large_map_path, "烟测大地图"), "large map image should import")
	var large_map := WorldStore.world.get("map_image", {}) as Dictionary
	_assert(bool(large_map.get("resized_for_device", false)), "large map image should be resized for device safety")
	_assert(int(large_map.get("original_width", 0)) == WorldStore.MAX_MAP_IMAGE_DIMENSION + 512, "large map metadata should keep original width")
	_assert(maxi(int(large_map.get("width", 0)), int(large_map.get("height", 0))) <= WorldStore.MAX_MAP_IMAGE_DIMENSION, "large map image should respect max dimension")
	_assert(str(large_map.get("image_path", "")).get_extension().to_lower() == "png", "resized map should be stored as png")
	var valid_payload := WorldStore.export_payload()
	_assert(SaveManager.validate_payload_schema(valid_payload), "export payload should satisfy save schema")
	var invalid_payload := valid_payload.duplicate(true)
	invalid_payload["characters"] = []
	_assert(not SaveManager.validate_payload_schema(invalid_payload), "save schema should reject missing characters")
	var invalid_version_payload := valid_payload.duplicate(true)
	invalid_version_payload["schema_version"] = 999
	_assert(not SaveManager.validate_payload_schema(invalid_version_payload), "save schema should reject unsupported versions")
	var export_path := SaveManager.export_world(WorldStore.export_payload(), true)
	_assert(not export_path.is_empty(), "world export should return a path")
	_assert(FileAccess.file_exists(export_path), "world export zip should exist")
	_assert(SaveManager.get_last_world_export_path() == export_path, "world export should remember the latest ZIP path for platform handoff")
	_assert(not SaveManager.get_shareable_file_path(export_path).is_empty(), "world export should expose a shareable platform file path")
	var exported_world_name := str(WorldStore.world.get("name", ""))
	var exported_world_id := str(WorldStore.world.get("id", ""))
	var conflict_import := SaveManager.import_world(export_path)
	_assert(not conflict_import.is_empty(), "same-id import should return a payload")
	var conflict_world := conflict_import.get("world", {}) as Dictionary
	_assert(str(conflict_world.get("imported_from_world_id", "")) == exported_world_id, "same-id import should preserve original world id")
	_assert(str(conflict_world.get("id", "")) != exported_world_id, "same-id import should generate a replacement world id")
	var broken_zip_path := "user://exports/broken_import.zip"
	_assert(_create_broken_import_zip(broken_zip_path), "broken import fixture should be created")
	_assert(SaveManager.import_world(broken_zip_path).is_empty(), "missing manifest import should be rejected")
	_write_invalid_active_save()
	_assert(SaveManager.load_game().is_empty(), "invalid active save should be rejected")
	WorldStore.reset_world()
	_assert(WorldStore.load_imported_world(export_path), "exported world should import")
	_assert(str(WorldStore.world.get("name", "")) == exported_world_name, "imported world should preserve world name")
	_assert(WorldStore.factions.size() >= 3, "imported world should preserve factions")
	_assert(not WorldStore.threads.is_empty(), "imported world should preserve threads")
	_assert(str(WorldStore.get_character("char_001").get("player_notes", "")) == "怀疑她知道徽记来源。", "imported world should preserve character notes")
	_assert(str(WorldStore.get_current_location().get("player_notes", "")) == "这里的公告板反复出现徽记。", "imported world should preserve location notes")
	_assert(not WorldStore.get_timeline_filtered("player_action", "char_hero", str(WorldStore.get_current_location().get("id", ""))).is_empty(), "imported world should preserve filterable timeline links")
	var imported_map := WorldStore.world.get("map_image", {}) as Dictionary
	_assert(FileAccess.file_exists(str(imported_map.get("image_path", ""))), "imported map image should be restored")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(export_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ai_log_export_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(broken_zip_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(smoke_map_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(large_map_path))
	WorldStore.clear_ai_logs()
	_assert(WorldStore.ai_logs.is_empty(), "AI logs should be clearable")
	_assert(int(WorldStore.get_ai_usage_summary().get("calls", -1)) == 0, "clearing AI logs should reset usage summary")
	var settings_before_reset := SettingsStore.settings.duplicate(true)
	SettingsStore.settings["font_size"] = "large"
	SettingsStore.settings["glosc_token"] = "reset-token"
	SettingsStore.reset_settings()
	_assert(str(SettingsStore.get_value("font_size", "")) == "medium", "reset settings should restore default font size")
	_assert(str(SettingsStore.get_value("glosc_token", "")) == "", "reset settings should clear stored Glosc token")
	_assert(WorldStore.has_world(), "reset settings should not delete the current world")
	SettingsStore.settings = settings_before_reset
	SettingsStore.save_settings()
	var previous_base_url := str(SettingsStore.get_value("glosc_base_url", ""))
	var previous_token := str(SettingsStore.get_value("glosc_token", ""))
	var previous_auto_retry := bool(SettingsStore.get_value("auto_retry", true))
	var previous_timeout := int(SettingsStore.get_value("timeout_seconds", 45))
	var previous_quota_units := int(SettingsStore.get_value("glosc_quota_units", 5000))
	SettingsStore.settings["glosc_base_url"] = "http://"
	SettingsStore.settings["glosc_token"] = "smoke-token"
	SettingsStore.settings["auto_retry"] = true
	SettingsStore.settings["timeout_seconds"] = 1
	SettingsStore.settings["glosc_quota_units"] = 5000
	var invalid_status := await AIService.check_glosc_connection()
	_assert(not bool(invalid_status.get("ok", true)), "invalid Glosc config should fail connection test")
	_assert(str(invalid_status.get("error", "")).contains("服务地址"), "invalid Glosc status should explain endpoint problem")
	var status_summary := AIService.glosc_status_summary(invalid_status)
	_assert(str(status_summary.get("label", "")) == "连接异常", "failed Glosc status should be visible in summary")
	var timeline_before_failed_remote := WorldStore.timeline.size()
	await WorldStore.submit_player_action("验证无效远端配置不会推进世界")
	_assert(WorldStore.timeline.size() == timeline_before_failed_remote, "failed remote AI call should not mutate timeline")
	_assert(not WorldStore.ai_logs.is_empty(), "failed remote AI call should create an AI log")
	_assert(str(WorldStore.ai_logs.back().get("status", "")) != "ok", "failed remote AI log should not be ok")
	_assert(int(WorldStore.get_ai_usage_summary().get("failed_count", 0)) >= 1, "usage summary should count failed calls")
	SettingsStore.settings["glosc_base_url"] = previous_base_url
	SettingsStore.settings["glosc_token"] = previous_token
	SettingsStore.settings["auto_retry"] = previous_auto_retry
	SettingsStore.settings["timeout_seconds"] = previous_timeout
	SettingsStore.settings["glosc_quota_units"] = previous_quota_units
	WorldStore.clear_ai_logs()
	SettingsStore.settings["confirm_ai_calls"] = true
	_cancelled_ai_result = {}
	call_deferred("_start_cancelled_ai_request", seed)
	await get_tree().process_frame
	_assert(AIService.has_pending_confirmation(), "AI confirmation should be pending when enabled")
	var pending_estimate := AIService.get_pending_confirmation_estimate()
	_assert(str(pending_estimate.get("purpose", "")) == "world_expand", "pending confirmation should expose usage estimate")
	_assert(int(pending_estimate.get("total_tokens", 0)) > 0, "pending confirmation estimate should include tokens")
	AIService.cancel_pending_request()
	while _cancelled_ai_result.is_empty():
		await get_tree().process_frame
	_assert(str(_cancelled_ai_result.get("status", "")) == "cancelled", "cancelled AI request should return cancelled status")
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["auto_save_enabled"] = _previous_auto_save_enabled
	SettingsStore.settings["content_preferences"] = _previous_content_preferences
	SettingsStore.settings["log_level"] = _previous_log_level
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
	print("Evolvria smoke test passed: %d events, %d memories" % [WorldStore.timeline.size(), WorldStore.memories.size()])
	WorldStore.reset_world()
	get_tree().quit()

func _create_reference_map_fixture(path: String) -> bool:
	var image := Image.create_empty(192, 128, false, Image.FORMAT_RGBA8)
	image.fill(Color("#1c376a"))
	var center := Vector2(92, 64)
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var p := Vector2(x, y)
			var normalized := Vector2((p.x - center.x) / 74.0, (p.y - center.y) / 48.0)
			var wobble := sin(float(y) * 0.18) * 0.1 + cos(float(x) * 0.12) * 0.08
			if normalized.length() < 1.0 + wobble:
				var color := Color("#537e4f")
				if x > 72 and x < 132 and y > 30 and y < 82:
					color = Color("#b49a6f")
				if abs(x - 70) < 5 and y > 20 and y < 106:
					color = Color("#d6d8d3")
				image.set_pixel(x, y, color)
	_draw_fixture_line(image, Vector2(30, 48), Vector2(146, 36), Color("#ff1414"), 2)
	_draw_fixture_line(image, Vector2(52, 28), Vector2(70, 106), Color("#ff1414"), 2)
	_draw_fixture_line(image, Vector2(82, 84), Vector2(152, 94), Color("#ff1414"), 2)
	_paint_fixture_disc(image, Vector2(120, 48), 4, Color("#101010"))
	return image.save_png(path) == OK

func _draw_fixture_line(image: Image, start: Vector2, end: Vector2, color: Color, width: int) -> void:
	var delta := end - start
	var steps := int(maxf(absf(delta.x), absf(delta.y)))
	for step in range(steps + 1):
		var t := float(step) / maxf(float(steps), 1.0)
		_paint_fixture_disc(image, start.lerp(end, t), width, color)

func _paint_fixture_disc(image: Image, center: Vector2, radius: int, color: Color) -> void:
	var min_x := clampi(int(floor(center.x)) - radius, 0, image.get_width() - 1)
	var max_x := clampi(int(ceil(center.x)) + radius, 0, image.get_width() - 1)
	var min_y := clampi(int(floor(center.y)) - radius, 0, image.get_height() - 1)
	var max_y := clampi(int(ceil(center.y)) + radius, 0, image.get_height() - 1)
	for y in range(min_y, max_y + 1):
		for x in range(min_x, max_x + 1):
			if Vector2(x, y).distance_to(center) <= float(radius):
				image.set_pixel(x, y, color)

func _verify_ai_can_parse_map_context() -> void:
	var context := WorldStore.build_ai_context("解析地形、海岸、河流、地点和路线")
	var map_state := context.get("map_state", {}) as Dictionary
	_assert(not map_state.is_empty(), "AI context should include map_state")
	var serialized := JSON.stringify({"context": context})
	for key in ["terrain", "coastlines", "rivers", "locations", "routes"]:
		_assert(serialized.contains("\"%s\"" % key), "serialized AI payload should include map key: %s" % key)
	var parser := JSON.new()
	_assert(parser.parse(serialized) == OK, "serialized AI map payload should parse as JSON")
	var parsed_payload := parser.data as Dictionary
	var parsed_context := parsed_payload.get("context", {}) as Dictionary
	var parsed_map := parsed_context.get("map_state", {}) as Dictionary
	var terrain := parsed_map.get("terrain", {}) as Dictionary
	var coastlines := parsed_map.get("coastlines", {}) as Dictionary
	var rivers := parsed_map.get("rivers", {}) as Dictionary
	var parsed_locations: Array = parsed_map.get("locations", [])
	var parsed_routes: Array = parsed_map.get("routes", [])
	_assert(not terrain.is_empty() and terrain.has("height_scale") and terrain.has("biomes"), "AI should parse terrain metadata")
	_assert(bool(coastlines.get("generated", false)) and not str(coastlines.get("source", "")).is_empty(), "AI should parse coastline metadata")
	_assert(bool(rivers.get("generated", false)) and int(rivers.get("count", 0)) > 0, "AI should parse river metadata")
	_assert(not parsed_locations.is_empty(), "AI should parse map locations")
	var first_location := parsed_locations[0] as Dictionary
	_assert((first_location.get("position", {}) as Dictionary).has("x"), "AI parsed locations should include normalized x coordinate")
	_assert((first_location.get("position", {}) as Dictionary).has("y"), "AI parsed locations should include normalized y coordinate")
	_assert(not str(first_location.get("biome", "")).is_empty(), "AI parsed locations should include biome")
	_assert(first_location.has("height"), "AI parsed locations should include height")
	_assert(not parsed_routes.is_empty(), "AI should parse map routes")
	var first_route := parsed_routes[0] as Dictionary
	_assert(not str(first_route.get("from_location_id", "")).is_empty() and not str(first_route.get("to_location_id", "")).is_empty(), "AI parsed routes should include endpoints")
	var estimate := AIService.estimate_usage("player_action", {"action": "解析地图", "context": context})
	_assert(int(estimate.get("total_tokens", 0)) > 0, "AI usage estimator should accept map-aware context")

func _assert(condition: bool, message: String) -> void:
	if condition:
		return
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["auto_save_enabled"] = _previous_auto_save_enabled
	SettingsStore.settings["content_preferences"] = _previous_content_preferences
	SettingsStore.settings["log_level"] = _previous_log_level
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
	push_error(message)
	WorldStore.reset_world()
	get_tree().quit(1)

func _start_cancelled_ai_request(seed: Dictionary) -> void:
	_cancelled_ai_result = await AIService.generate_world(seed)

func _find_event_with_outcome(events: Array[Dictionary], outcome: String) -> Dictionary:
	for index in range(events.size() - 1, -1, -1):
		var event := events[index] as Dictionary
		if str(event.get("outcome", "")) == outcome:
			return event
	return {}

func _character_ids(characters: Array[Dictionary]) -> Array[String]:
	var ids: Array[String] = []
	for character in characters:
		ids.append(str(character.get("id", "")))
	return ids

func _verify_ai_log_levels() -> void:
	var original_size := WorldStore.ai_logs.size()
	var sample := {
		"request_id": "ai_log_level_test",
		"status": "ok",
		"summary": "Authorization token should be hidden",
		"usage": {"input_tokens": 1, "output_tokens": 2, "cost": null}
	}
	SettingsStore.settings["log_level"] = "default"
	WorldStore.record_ai_log("log_level_default", sample, "token prompt")
	var default_log := WorldStore.ai_logs.back() as Dictionary
	_assert(str(default_log.get("prompt_summary", "")) == "", "default log level should omit prompt summary")
	_assert(str(default_log.get("response_summary", "")) == "", "default log level should omit response summary")
	_assert(not default_log.has("raw_response"), "default log level should omit raw response")
	SettingsStore.settings["log_level"] = "debug"
	WorldStore.record_ai_log("log_level_debug", sample, "普通摘要")
	var debug_log := WorldStore.ai_logs.back() as Dictionary
	_assert(not str(debug_log.get("prompt_summary", "")).is_empty(), "debug log level should keep prompt summary")
	_assert(not str(debug_log.get("response_summary", "")).is_empty(), "debug log level should keep response summary")
	_assert(not debug_log.has("raw_response"), "debug log level should omit raw response")
	SettingsStore.settings["log_level"] = "deep"
	WorldStore.record_ai_log("log_level_deep", sample, "deep prompt")
	var deep_log := WorldStore.ai_logs.back() as Dictionary
	_assert(deep_log.has("raw_response"), "deep log level should keep redacted raw response")
	_assert(str(deep_log.get("raw_response", "")) == "[已脱敏]", "deep log level should redact sensitive raw response")
	while WorldStore.ai_logs.size() > original_size:
		WorldStore.ai_logs.pop_back()
	SettingsStore.settings["log_level"] = "debug"

func _create_broken_import_zip(path: String) -> bool:
	var absolute_path := ProjectSettings.globalize_path(path)
	var packer := ZIPPacker.new()
	if packer.open(absolute_path) != OK:
		return false
	if packer.start_file("world.json") != OK:
		packer.close()
		return false
	packer.write_file(JSON.stringify({"id": "broken_world"}).to_utf8_buffer())
	packer.close_file()
	packer.close()
	return true

func _write_invalid_active_save() -> void:
	var file := FileAccess.open(SaveManager.ACTIVE_SAVE, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"schema_version": 1, "world": {"id": "bad", "name": "坏存档"}}))
	file.close()
