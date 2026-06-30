extends Node

var _previous_settings: Dictionary = {}
var _failed := false

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_settings = SettingsStore.settings.duplicate(true)
	var token := OS.get_environment("EVOLVRIA_TEST_KEY").strip_edges()
	if token.is_empty():
		push_error("remote Glosc smoke requires EVOLVRIA_TEST_KEY")
		get_tree().quit(1)
		return
	SettingsStore.settings["glosc_base_url"] = "https://one.gloscai.com"
	SettingsStore.settings["glosc_token"] = token
	SettingsStore.settings["model"] = "deepseek/deepseek-v4-pro"
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["auto_retry"] = false
	SettingsStore.settings["timeout_seconds"] = 20
	SettingsStore.settings["log_level"] = "debug"
	SettingsStore.settings["content_preferences"] = "远端烟测：保持简短，避免敏感内容。"

	var status := await AIService.check_glosc_connection()
	if not _assert(bool(status.get("ok", false)), "Glosc connection should succeed with test key: %s" % str(status.get("error", ""))):
		return
	if not _assert(int(status.get("model_count", 0)) > 0, "Glosc connection should return available models"):
		return
	if not _assert(bool(status.get("configured_model_available", false)), "configured smoke model should be available"):
		return
	if not _assert(bool(status.get("chat_ok", false)), "Glosc connection should verify chat/completions"):
		return

	var consistency := await AIService.check_consistency({
		"issues": [],
		"context": {
			"world_summary": "远端烟测世界只用于验证 JSON 调用链路。",
			"content_limits": ["保持简短、安全、可校验。"]
		}
	})
	if not _assert(str(consistency.get("status", "")) == "ok", "remote consistency_check should return ok: %s" % str(consistency.get("error", ""))):
		return
	if not _assert(consistency.get("contradictions", []) is Array, "remote consistency_check should return contradictions array"):
		return

	var world_expand := await AIService.generate_world({
		"world_name": "远端烟测世界",
		"genre": "奇幻",
		"tone": "冒险",
		"limits": ["保持简短、安全、可校验。"],
		"hero": {
			"name": "烟测旅人",
			"description": "用于验证远端世界扩写的临时角色。",
			"goal": "确认世界扩写链路可用。"
		},
		"key_characters": []
	})
	if not _assert(str(world_expand.get("status", "")) == "ok", "remote world_expand should return ok: %s" % str(world_expand.get("error", ""))):
		return
	if not _assert(WorldStore.validate_world_expand_result(world_expand), "remote world_expand should satisfy response contract: %s" % WorldStore.describe_world_expand_validation_error(world_expand)):
		return
	print("Evolvria remote Glosc smoke passed")
	_restore()
	get_tree().quit()

func _assert(condition: bool, message: String) -> bool:
	if condition:
		return true
	if _failed:
		return false
	_failed = true
	push_error(message)
	_restore()
	get_tree().quit(1)
	return false

func _restore() -> void:
	SettingsStore.settings = _previous_settings.duplicate(true)
