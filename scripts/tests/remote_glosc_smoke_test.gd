extends Node

var _previous_settings: Dictionary = {}

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_settings = SettingsStore.settings.duplicate(true)
	var token := OS.get_environment("EVOLVRIA_TEST_KEY").strip_edges()
	if token.is_empty():
		push_error("remote Glosc smoke requires EVOLVRIA_TEST_KEY")
		get_tree().quit(1)
		return
	WorldStore.reset_world()
	SettingsStore.settings["glosc_base_url"] = "https://one.gloscai.com"
	SettingsStore.settings["glosc_token"] = token
	SettingsStore.settings["model"] = "alibaba/qwen3.6-flash"
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["auto_retry"] = false
	SettingsStore.settings["timeout_seconds"] = 20
	SettingsStore.settings["log_level"] = "debug"
	SettingsStore.settings["content_preferences"] = "远端烟测：保持简短，避免敏感内容。"

	var status := await AIService.check_glosc_connection()
	_assert(bool(status.get("ok", false)), "Glosc connection should succeed with test key: %s" % str(status.get("error", "")))
	_assert(int(status.get("model_count", 0)) > 0, "Glosc connection should return available models")
	_assert(bool(status.get("configured_model_available", false)), "configured smoke model should be available")

	var consistency := await AIService.check_consistency({
		"issues": [],
		"context": {
			"world_summary": "远端烟测世界只用于验证 JSON 调用链路。",
			"content_limits": ["保持简短、安全、可校验。"]
		}
	})
	_assert(str(consistency.get("status", "")) == "ok", "remote consistency_check should return ok")
	_assert(consistency.get("contradictions", []) is Array, "remote consistency_check should return contradictions array")
	print("Evolvria remote Glosc smoke passed")
	_restore()
	get_tree().quit()

func _assert(condition: bool, message: String) -> void:
	if condition:
		return
	push_error(message)
	_restore()
	get_tree().quit(1)

func _restore() -> void:
	SettingsStore.settings = _previous_settings.duplicate(true)
	WorldStore.reset_world()
