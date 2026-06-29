extends Node

var _previous_confirm_ai_calls: bool = true
var _previous_content_preferences: String = ""
var _previous_log_level: String = "debug"
var _previous_model: String = "alibaba/qwen3.6-flash"

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_confirm_ai_calls = bool(SettingsStore.get_value("confirm_ai_calls", true))
	_previous_content_preferences = str(SettingsStore.get_value("content_preferences", ""))
	_previous_log_level = str(SettingsStore.get_value("log_level", "debug"))
	_previous_model = str(SettingsStore.get_value("model", "alibaba/qwen3.6-flash"))
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["content_preferences"] = "测试 fixture：避免依赖真实 AI 服务。"
	SettingsStore.settings["log_level"] = "debug"
	SettingsStore.settings["model"] = "alibaba/qwen3.6-flash"

	var seed := {
		"world_name": "Fixture世界",
		"genre": "奇幻",
		"tone": "悬疑",
		"limits": "保持清晰。",
		"hero": {
			"name": "校验者",
			"description": "响应契约测试员",
			"goal": "证明 AI 响应必须可校验",
			"ability": "构造 fixture",
			"weakness": "讨厌隐式状态"
		},
		"key_characters": [
			{"name": "伊芙", "role": "向导", "relationship": "同行", "description": "知道地图的人"},
			{"name": "柯林", "role": "竞争者", "relationship": "竞争", "description": "制造压力的人"}
		]
	}
	await WorldStore.create_world(seed)
	_assert(WorldStore.has_world(), "fixture world should exist")

	_verify_normal_world_expand_fixture()
	_verify_normal_player_action_fixture()
	_verify_normal_npc_fixture()
	_verify_missing_fields_fixture()
	_verify_conflict_fixture()
	_verify_non_json_fixture()
	_verify_oversized_fixture()
	_verify_glosc_status_fixture()
	_verify_openai_compatible_fixture()

	print("Evolvria AI response fixture test passed")
	_restore_settings()
	WorldStore.reset_world()
	get_tree().quit()

func _verify_normal_world_expand_fixture() -> void:
	var fixture := {
		"request_id": "fixture_world_expand",
		"status": "ok",
		"summary": "一个用于测试响应契约的世界。",
		"rules": ["玩家设定优先", "所有变更必须可校验"],
		"themes": ["fixture", "contract"],
		"locations": [
			{"id": "loc_fixture_gate", "name": "校验门", "type": "gate", "description": "刻着 schema 的门。", "position": {"x": 0.5, "y": 0.5}}
		],
		"opening_event": {
			"title": "测试开始",
			"description": "校验者打开第一份固定响应。",
			"suggested_actions": ["继续测试"]
		}
	}
	_assert(WorldStore.validate_world_expand_result(fixture), "normal world_expand fixture should validate")

func _verify_normal_player_action_fixture() -> void:
	var current_location := WorldStore.get_current_location()
	var wrapper := {
		"request_id": "fixture_player_action",
		"status": "ok",
		"usage": {"input_tokens": 10, "output_tokens": 20, "cost": null},
		"content": {
			"narrative": "玩家检查固定响应，发现所有字段都能被解析。",
			"time_delta_hours": 1,
			"event_title": "固定响应通过",
			"event_type": "player_action",
			"suggested_actions": ["记录结果", "继续验证"],
			"memory_text": "固定玩家行动响应通过校验。",
			"patches": [
				{
					"target_type": "location",
					"target_id": str(current_location.get("id", "")),
					"op": "append",
					"path": "state_tags",
					"value": "fixture_verified"
				}
			]
		}
	}
	var parsed := AIService.parse_response_body(JSON.stringify(wrapper).to_utf8_buffer(), "fallback_req", "player_action", 2)
	_assert(str(parsed.get("request_id", "")) == "fixture_player_action", "wrapped response should preserve request id")
	_assert(str(parsed.get("purpose", "")) == "player_action", "wrapped response should preserve purpose")
	_assert(int(parsed.get("attempt", 0)) == 2, "wrapped response should preserve attempt")
	_assert(WorldStore.validate_player_action_result(parsed), "normal player_action fixture should validate")
	_assert(WorldStore.apply_state_patches(_to_dict_array(parsed.get("patches", []))), "normal player_action patches should apply")
	_assert("fixture_verified" in (WorldStore.get_current_location().get("state_tags", []) as Array), "normal player_action patch should mutate state")

func _verify_normal_npc_fixture() -> void:
	var npc_id := "char_001"
	var location_id := str(WorldStore.locations[0].get("id", ""))
	var fixture := {
		"request_id": "fixture_npc",
		"status": "ok",
		"type": "npc_action",
		"title": "伊芙检查线索",
		"description": "伊芙前往已知地点检查线索，事件保持简短。",
		"character_id": npc_id,
		"new_location_id": location_id,
		"importance": 0.35
	}
	_assert(WorldStore.validate_npc_event_result(fixture), "normal npc fixture should validate")

func _verify_missing_fields_fixture() -> void:
	var missing_world := {
		"request_id": "fixture_missing_world",
		"status": "ok",
		"summary": "缺少 opening_event。",
		"rules": [],
		"locations": [
			{"id": "loc_missing_fixture", "name": "缺字段地点", "position": {"x": 0.2, "y": 0.3}}
		]
	}
	_assert(not WorldStore.validate_world_expand_result(missing_world), "missing world_expand fields should be rejected")
	var missing_player := {
		"request_id": "fixture_missing_player",
		"status": "ok",
		"time_delta_hours": 1,
		"suggested_actions": []
	}
	_assert(not WorldStore.validate_player_action_result(missing_player), "missing player_action fields should be rejected")

func _verify_conflict_fixture() -> void:
	var current_location := WorldStore.get_current_location()
	var location_id := str(current_location.get("id", ""))
	var description_before := str(current_location.get("description", ""))
	var conflict_patches: Array[Dictionary] = [
		{
			"target_type": "location",
			"target_id": location_id,
			"op": "set",
			"path": "description",
			"value": "AI fixture 试图覆盖已确认地点描述。"
		}
	]
	_assert(not WorldStore.apply_state_patches(conflict_patches), "conflicting fixture patch should be rejected")
	_assert(str(WorldStore.get_current_location().get("description", "")) == description_before, "conflicting fixture patch should not mutate state")

func _verify_non_json_fixture() -> void:
	var timeline_before := WorldStore.timeline.size()
	var parsed := AIService.parse_response_body("not json".to_utf8_buffer(), "fixture_bad_json", "player_action")
	_assert(str(parsed.get("status", "")) == "error", "non JSON response should return error")
	_assert(str(parsed.get("error", "")).contains("合法 JSON"), "non JSON response should explain parse failure")
	_assert(WorldStore.timeline.size() == timeline_before, "non JSON response should not mutate timeline")

func _verify_oversized_fixture() -> void:
	var oversized := PackedByteArray()
	oversized.resize(AIService.MAX_RESPONSE_BYTES + 1)
	var parsed := AIService.parse_response_body(oversized, "fixture_oversized", "player_action")
	_assert(str(parsed.get("status", "")) == "error", "oversized response should return error")
	_assert(str(parsed.get("error", "")).contains("超过客户端限制"), "oversized response should explain size limit")
	_assert(not bool(parsed.get("retryable", true)), "oversized response should not be retryable without changing input")

func _verify_glosc_status_fixture() -> void:
	var wrapper := {
		"usage": {
			"used_units": 1247,
			"quota_units": 5000,
			"balance_units": 3753
		},
		"billing": {"currency": "credits"}
	}
	var parsed := AIService.parse_status_body(JSON.stringify(wrapper).to_utf8_buffer())
	_assert(int(parsed.get("used_units", 0)) == 1247, "status parser should read used units")
	_assert(int(parsed.get("quota_units", 0)) == 5000, "status parser should read quota units")
	_assert(int(parsed.get("balance_units", 0)) == 3753, "status parser should read balance units")
	_assert(str(parsed.get("currency", "")) == "credits", "status parser should preserve currency")
	var summary := AIService.glosc_status_summary({"ok": true, "message": "fixture connected", "used_units": 12, "quota_units": 24, "balance_units": 12})
	_assert(str(summary.get("label", "")) == "已连接", "connected status summary should label connection")
	_assert(float(summary.get("percent", 0.0)) == 0.5, "status summary should calculate usage percentage")

func _verify_openai_compatible_fixture() -> void:
	var models_body := JSON.stringify({
		"data": [
			{"id": "alibaba/qwen3.6-flash", "object": "model"},
			{"id": "other-model", "object": "model"}
		]
	}).to_utf8_buffer()
	var models := AIService.parse_models_body(models_body)
	_assert(int(models.get("model_count", 0)) == 2, "models parser should count OpenAI-compatible model lists")
	_assert(bool(models.get("configured_model_available", false)), "models parser should detect configured model availability")
	var openai_response := {
		"id": "chatcmpl_fixture",
		"object": "chat.completion",
		"choices": [
			{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": JSON.stringify({
						"status": "ok",
						"narrative": "OpenAI-compatible 响应被解析。",
						"time_delta_hours": 1,
						"event_title": "OpenAI 解析通过",
						"event_type": "player_action",
						"suggested_actions": ["继续"],
						"memory_text": "解析通过。"
					})
				},
				"finish_reason": "stop"
			}
		],
		"usage": {"prompt_tokens": 7, "completion_tokens": 9, "total_tokens": 16}
	}
	var parsed := AIService.parse_response_body(JSON.stringify(openai_response).to_utf8_buffer(), "fixture_openai", "player_action")
	_assert(str(parsed.get("status", "")) == "ok", "OpenAI-compatible response should parse as ok")
	_assert(str(parsed.get("request_id", "")) == "fixture_openai", "OpenAI-compatible response should preserve request id fallback")
	_assert(WorldStore.validate_player_action_result(parsed), "OpenAI-compatible player_action fixture should validate")
	var usage := parsed.get("usage", {}) as Dictionary
	_assert(int(usage.get("input_tokens", 0)) == 7, "OpenAI usage prompt tokens should map to input tokens")
	_assert(int(usage.get("output_tokens", 0)) == 9, "OpenAI usage completion tokens should map to output tokens")
	var html_parse := AIService.parse_models_body("<!doctype html>".to_utf8_buffer())
	_assert(html_parse.is_empty(), "HTML root responses should not pass model-list parsing")

func _to_dict_array(value: Variant) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not value is Array:
		return result
	for item in value:
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result

func _assert(condition: bool, message: String) -> void:
	if condition:
		return
	_restore_settings()
	push_error(message)
	WorldStore.reset_world()
	get_tree().quit(1)

func _restore_settings() -> void:
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["content_preferences"] = _previous_content_preferences
	SettingsStore.settings["log_level"] = _previous_log_level
	SettingsStore.settings["model"] = _previous_model
