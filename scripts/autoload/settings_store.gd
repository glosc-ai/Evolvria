extends Node

signal settings_changed(settings: Dictionary)

const SETTINGS_PATH := "user://settings.json"

const DEFAULT_SETTINGS := {
	"theme": "dark",
	"font_size": "medium",
	"fullscreen": false,
	"context_panel_width": 320,
	"glosc_provider": "Glosc AI",
	"glosc_base_url": "https://one.gloscai.com",
	"glosc_token": "",
	"model": "alibaba/qwen3.6-flash",
	"timeout_seconds": 45,
	"auto_retry": true,
	"confirm_ai_calls": true,
	"show_usage_estimate": true,
	"auto_save_enabled": true,
	"debug_logs": true,
	"log_level": "debug",
	"developer_mode": false,
	"content_preferences": "",
	"local_token_risk_acknowledged": false,
	"onboarding_completed": false
}

var settings: Dictionary = DEFAULT_SETTINGS.duplicate(true)

func _ready() -> void:
	load_settings()

func load_settings() -> void:
	if not FileAccess.file_exists(SETTINGS_PATH):
		return
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed is Dictionary:
		for key in parsed.keys():
			settings[key] = parsed[key]
		if str(settings.get("model", "")) == "glosc-one-default":
			settings["model"] = str(DEFAULT_SETTINGS.get("model", "alibaba/qwen3.6-flash"))
		if not parsed.has("onboarding_completed") and is_glosc_configured():
			settings["onboarding_completed"] = true
		settings_changed.emit(settings.duplicate(true))

func save_settings() -> void:
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if file == null:
		AppState.set_error("无法写入设置文件。")
		return
	file.store_string(JSON.stringify(settings, "\t"))
	file.close()
	settings_changed.emit(settings.duplicate(true))

func set_value(key: String, value: Variant) -> void:
	settings[key] = value
	save_settings()

func reset_settings() -> void:
	settings = DEFAULT_SETTINGS.duplicate(true)
	save_settings()

func get_value(key: String, fallback: Variant = null) -> Variant:
	return settings.get(key, fallback)

func is_glosc_configured() -> bool:
	return not str(settings.get("glosc_base_url", "")).is_empty() and not str(settings.get("glosc_token", "")).is_empty()

func is_onboarding_required() -> bool:
	return not bool(settings.get("onboarding_completed", false)) and not is_glosc_configured()

func can_store_glosc_token(token: String, acknowledged: bool) -> bool:
	return token.strip_edges().is_empty() or acknowledged

func local_token_risk_text() -> String:
	return "当前版本会把访问令牌保存在本机 user://settings.json；请只在可信设备上保存，并避免把设置文件上传或分享。"
