extends Node

signal settings_changed(settings: Dictionary)

const SETTINGS_PATH := "user://settings.json"

var settings: Dictionary = {
	"theme": "dark",
	"font_size": "medium",
	"glosc_base_url": "",
	"glosc_token": "",
	"model": "glosc-one-default",
	"timeout_seconds": 45,
	"auto_retry": true,
	"confirm_ai_calls": true,
	"debug_logs": true,
	"content_preferences": "",
	"local_token_risk_acknowledged": false
}

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

func get_value(key: String, fallback: Variant = null) -> Variant:
	return settings.get(key, fallback)

func is_glosc_configured() -> bool:
	return not str(settings.get("glosc_base_url", "")).is_empty() and not str(settings.get("glosc_token", "")).is_empty()
