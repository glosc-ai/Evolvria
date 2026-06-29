extends Node

const APP_SCENE := preload("res://scenes/app.tscn")
const OUTPUT_DIR := "res://output/visual_screenshots/latest"

var _previous_confirm_ai_calls: bool = true
var _previous_show_usage_estimate: bool = true
var _previous_developer_mode: bool = false
var _previous_glosc_base_url: String = ""
var _previous_glosc_token: String = ""
var _app: Control
var _captures_by_size: Dictionary = {}

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_confirm_ai_calls = bool(SettingsStore.get_value("confirm_ai_calls", true))
	_previous_show_usage_estimate = bool(SettingsStore.get_value("show_usage_estimate", true))
	_previous_developer_mode = bool(SettingsStore.get_value("developer_mode", false))
	_previous_glosc_base_url = str(SettingsStore.get_value("glosc_base_url", ""))
	_previous_glosc_token = str(SettingsStore.get_value("glosc_token", ""))
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["show_usage_estimate"] = true
	SettingsStore.settings["developer_mode"] = true
	SettingsStore.settings["glosc_base_url"] = ""
	SettingsStore.settings["glosc_token"] = ""
	_clean_output_dir()
	await _prepare_world()
	_app = APP_SCENE.instantiate() as Control
	add_child(_app)
	await _settle()

	var sizes: Array[Dictionary] = [
		{"name": "desktop_large", "size": Vector2i(2920, 1528)},
		{"name": "desktop_wide", "size": Vector2i(1440, 900)},
		{"name": "desktop_narrow", "size": Vector2i(820, 900)},
		{"name": "phone_portrait", "size": Vector2i(390, 844)},
		{"name": "phone_landscape", "size": Vector2i(844, 390)},
		{"name": "tablet_landscape", "size": Vector2i(1180, 820)},
		{"name": "tablet_split", "size": Vector2i(700, 900)}
	]
	var routes: Array[StringName] = [&"main_menu", &"onboarding", &"new_world", &"exploration", &"map", &"locations", &"characters", &"timeline", &"threads", &"world_lore", &"saves", &"settings"]

	for size_data in sizes:
		var size_name := str(size_data.get("name", "size"))
		var size := size_data.get("size", Vector2i(1024, 768)) as Vector2i
		get_window().size = size
		await _settle()
		_captures_by_size[size_name] = []
		for route in routes:
			await _capture_route(size_name, route)
		for step in range(1, 6):
			_app.set("_new_world_step", step)
			AppState.navigate(&"new_world")
			_app.call("_render")
			await _capture_current(size_name, "new_world_step_%d" % step)
		AppState.navigate(&"map")
		_app.set("_map_focus_mode", true)
		_app.call("_render")
		await _capture_current(size_name, "map_focus")
		_app.set("_map_focus_mode", false)
	_make_contact_sheets()

	print("Evolvria visual screenshots written to %s" % ProjectSettings.globalize_path(OUTPUT_DIR))
	_restore()
	get_tree().quit()

func _prepare_world() -> void:
	var seed := {
		"world_name": "视觉烟测世界",
		"genre": "奇幻",
		"tone": "冒险",
		"limits": "保持清晰、低剧透。",
		"hero": {
			"name": "视觉测试者",
			"description": "截图验收员",
			"goal": "确认所有主要页面可在多尺寸渲染",
			"ability": "观察,记录",
			"weakness": "不会跳过边界条件"
		},
		"key_characters": [
			{"name": "诺拉", "role": "向导", "relationship": "同行", "description": "熟悉地点的人"},
			{"name": "岚", "role": "对手", "relationship": "竞争", "description": "制造压力的人"}
		]
	}
	await WorldStore.create_world(seed)
	_seed_long_lists()

func _seed_long_lists() -> void:
	var current_location_id := str(WorldStore.get_current_location().get("id", "loc_start"))
	for index in range(36):
		WorldStore.add_event(
			"world_event",
			"截图事件 %03d" % index,
			"用于验证长页面在截图尺寸下不会出现明显布局问题。",
			["char_hero"],
			current_location_id,
			0.2
		)
	WorldStore.add_event(
		"player_action",
		"行动结果可解释",
		"用于验证行动结果原因和后果会显示在界面中。",
		["char_hero"],
		current_location_id,
		0.5,
		{"outcome": "cost", "outcome_label": "代价成功", "outcome_reason": "截图测试原因", "consequence": "截图测试后果"}
	)
	for index in range(10):
		WorldStore.record_ai_log("visual_fixture", {
			"request_id": "visual_ai_%03d" % index,
			"status": "ok",
			"summary": "视觉分页 fixture",
			"usage": {"input_tokens": 1, "output_tokens": 1, "cost": null}
		}, "视觉分页 fixture")

func _capture_route(size_name: String, route: StringName) -> void:
	AppState.navigate(route)
	if route == &"settings":
		_app.set("_route_before_settings", &"exploration")
	_app.call("_render")
	await _capture_current(size_name, str(route))

func _capture_current(size_name: String, capture_name: String) -> void:
	await _settle()
	var image := get_viewport().get_texture().get_image()
	if image == null or image.is_empty():
		push_error("Viewport screenshot is empty; run this scene with a real display driver, not --headless.")
		return
	var file_name := "%s_%s.png" % [size_name, capture_name]
	var path := "%s/%s" % [OUTPUT_DIR, file_name]
	var err := image.save_png(path)
	if err != OK:
		push_error("Unable to save screenshot %s: %s" % [path, error_string(err)])
		return
	(_captures_by_size[size_name] as Array).append(path)
	print("screenshot %s" % ProjectSettings.globalize_path(path))

func _make_contact_sheets() -> void:
	for size_name in _captures_by_size.keys():
		var paths := _captures_by_size[size_name] as Array
		if paths.is_empty():
			continue
		var first := Image.load_from_file(str(paths[0]))
		if first == null or first.is_empty():
			continue
		var tile_width := mini(360, first.get_width())
		var tile_height := maxi(1, int(round(float(first.get_height()) * float(tile_width) / float(first.get_width()))))
		var columns := 3
		var rows := int(ceil(float(paths.size()) / float(columns)))
		var gap := 12
		var sheet := Image.create_empty(columns * tile_width + (columns + 1) * gap, rows * tile_height + (rows + 1) * gap, false, Image.FORMAT_RGBA8)
		sheet.fill(Color("#171820"))
		for index in range(paths.size()):
			var screenshot := Image.load_from_file(str(paths[index]))
			if screenshot == null or screenshot.is_empty():
				continue
			if screenshot.get_format() != Image.FORMAT_RGBA8:
				screenshot.convert(Image.FORMAT_RGBA8)
			screenshot.resize(tile_width, tile_height, Image.INTERPOLATE_LANCZOS)
			var column := index % columns
			var row := index / columns
			var target := Vector2i(gap + column * (tile_width + gap), gap + row * (tile_height + gap))
			sheet.blit_rect(screenshot, Rect2i(Vector2i.ZERO, Vector2i(tile_width, tile_height)), target)
		var path := "%s/contact_%s.png" % [OUTPUT_DIR, size_name]
		var err := sheet.save_png(path)
		if err != OK:
			push_error("Unable to save contact sheet %s: %s" % [path, error_string(err)])
			continue
		print("contact %s" % ProjectSettings.globalize_path(path))

func _settle() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

func _clean_output_dir() -> void:
	var absolute_dir := ProjectSettings.globalize_path(OUTPUT_DIR)
	if DirAccess.dir_exists_absolute(absolute_dir):
		var dir := DirAccess.open(absolute_dir)
		if dir != null:
			for file_name in dir.get_files():
				DirAccess.remove_absolute(absolute_dir.path_join(file_name))
	else:
		DirAccess.make_dir_recursive_absolute(absolute_dir)

func _restore() -> void:
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
	SettingsStore.settings["glosc_base_url"] = _previous_glosc_base_url
	SettingsStore.settings["glosc_token"] = _previous_glosc_token
	WorldStore.reset_world()
