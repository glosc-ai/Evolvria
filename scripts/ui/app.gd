extends Control

const BG := Color("#171820")
const BG_ALT := Color("#20222d")
const SURFACE := Color("#272934")
const SURFACE_ALT := Color("#303342")
const FG := Color("#f0eadf")
const MUTED := Color("#aaa194")
const BORDER := Color("#464250")
const ACCENT := Color("#d89a42")
const ACCENT_DIM := Color("#b8782f")
const SUCCESS := Color("#58b986")
const DANGER := Color("#cf5b55")
const INFO := Color("#6093d8")
const WARN := Color("#d9ba55")
const UI_FONT_PATH := "res://assets/fonts/NotoSansCJKsc-Regular.otf"
const DEFAULT_GLOSC_PROVIDER := "Glosc AI"
const DEFAULT_GLOSC_BASE_URL := "https://one.gloscai.com"
const DEFAULT_GLOSC_MODEL := "alibaba/qwen3.6-flash"
const GLOSC_KEYS_URL := "https://one.gloscai.com/keys"
const TIMELINE_PAGE_SIZE := 30
const AI_LOG_PAGE_SIZE := 8
const MAP_LONG_PRESS_MS := 550
const NEW_WORLD_TOTAL_STEPS := 5

var _root: Control
var _ui_font: Font
var _busy: bool = false
var _active_operation: StringName = &""
var _last_failed_operation: StringName = &""
var _last_world_seed: Dictionary = {}
var _last_player_action: String = ""
var _action_draft: String = ""
var _suggested_action_index: int = 0
var _ai_confirm_waiting: bool = false
var _ai_confirm_request_id: String = ""
var _ai_confirm_purpose: String = ""
var _ai_confirm_summary: String = ""
var _ai_confirm_estimate: Dictionary = {}
var _glosc_status: Dictionary = {}
var _glosc_testing: bool = false
var _clear_ai_logs_confirming: bool = false
var _delete_world_confirming: bool = false
var _reset_settings_confirming: bool = false
var _route_before_settings: StringName = &"main_menu"
var _map_zoom: float = 1.0
var _map_pan: Vector2 = Vector2.ZERO
var _map_dragging: bool = false
var _map_drag_start: Vector2 = Vector2.ZERO
var _map_drag_last: Vector2 = Vector2.ZERO
var _map_drag_moved: bool = false
var _location_marker_drag_id: String = ""
var _location_marker_drag_moved: bool = false
var _map_reveal_unknown_locations: bool = false
var _map_focus_mode: bool = false
var _touch_points: Dictionary = {}
var _map_touch_started_at_msec: int = 0
var _last_pinch_distance: float = 0.0

var _world_name_input: LineEdit
var _genre_input: OptionButton
var _tone_input: OptionButton
var _hero_name_input: LineEdit
var _hero_identity_input: LineEdit
var _hero_goal_input: LineEdit
var _hero_ability_input: LineEdit
var _hero_weakness_input: LineEdit
var _key_characters_input: TextEdit
var _limits_input: TextEdit
var _narrative_detail_input: OptionButton
var _npc_frequency_input: OptionButton
var _action_input: LineEdit
var _settings_base_url: LineEdit
var _settings_token: LineEdit
var _settings_model: LineEdit
var _settings_timeout: SpinBox
var _settings_quota_units: SpinBox
var _settings_fullscreen: CheckBox
var _settings_context_width: SpinBox
var _settings_token_ack: CheckBox
var _settings_confirm: CheckBox
var _settings_usage_estimate: CheckBox
var _settings_auto_save: CheckBox
var _settings_retry: CheckBox
var _settings_debug: CheckBox
var _settings_developer_mode: CheckBox
var _settings_log_level: OptionButton
var _settings_content_preferences: TextEdit
var _onboarding_base_url: LineEdit
var _onboarding_token: LineEdit
var _onboarding_token_ack: CheckBox
var _onboarding_model: LineEdit
var _map_location_name: LineEdit
var _map_location_type: LineEdit
var _map_location_desc: TextEdit
var _map_location_x: SpinBox
var _map_location_y: SpinBox
var _map_image_path: LineEdit
var _settings_import_zip: LineEdit
var _timeline_type_filter: String = ""
var _timeline_character_filter: String = ""
var _timeline_location_filter: String = ""
var _character_filter: String = "全部"
var _focused_character_id: String = ""
var _focused_location_id: String = ""
var _map_editing_location_id: String = ""
var _timeline_visible_count: int = TIMELINE_PAGE_SIZE
var _ai_log_visible_count: int = AI_LOG_PAGE_SIZE
var _new_world_step: int = 1
var _new_world_draft: Dictionary = {}
var _last_consistency_check: Dictionary = {}
var _last_memory_extract: Dictionary = {}
var _last_summary_update: Dictionary = {}

func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_ui_theme()
	_ensure_input_actions()
	_apply_window_mode_from_settings()
	AppState.route_changed.connect(_on_route_changed)
	WorldStore.world_updated.connect(_on_world_updated)
	AIService.ai_request_started.connect(_on_ai_started)
	AIService.ai_request_finished.connect(_on_ai_finished)
	AIService.ai_request_failed.connect(_on_ai_failed)
	AIService.ai_confirmation_requested.connect(_on_ai_confirmation_requested)
	get_window().files_dropped.connect(_on_files_dropped)
	_maybe_start_onboarding()
	_render()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		_render()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("cancel_ai_request"):
		_handle_cancel_or_back()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("toggle_fullscreen"):
		_toggle_fullscreen()
		get_viewport().set_input_as_handled()
		return
	if _handle_suggested_action_shortcut(event):
		get_viewport().set_input_as_handled()
		return
	if _text_input_has_focus():
		if event.is_action_pressed("submit_action") and AppState.current_route == &"exploration":
			_submit_action()
			get_viewport().set_input_as_handled()
		return
	if _handle_map_keyboard_pan(event):
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("submit_action") and AppState.current_route == &"exploration":
		_submit_action()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("open_map") and WorldStore.has_world():
		AppState.navigate(&"map")
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("open_journal") and WorldStore.has_world():
		AppState.navigate(&"timeline")
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("zoom_map_in") and AppState.current_route == &"map":
		_set_map_zoom(_map_zoom + 0.15)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("zoom_map_out") and AppState.current_route == &"map":
		_set_map_zoom(_map_zoom - 0.15)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("place_marker") and AppState.current_route == &"map":
		_fill_location_coordinates(_map_view_size() * 0.5)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("toggle_map_focus") and AppState.current_route == &"map":
		_toggle_map_focus_mode()
		get_viewport().set_input_as_handled()

func _on_route_changed(_route: StringName) -> void:
	_reset_transient_route_state()
	_render()

func _reset_transient_route_state() -> void:
	# Per-screen inline confirmations and pagination should not leak across routes.
	# Error/notice banners are cleared by AppState.navigate(); use
	# AppState.navigate_with_notice() when a message should follow to the destination.
	_clear_ai_logs_confirming = false
	_delete_world_confirming = false
	_reset_settings_confirming = false
	_timeline_visible_count = TIMELINE_PAGE_SIZE
	_ai_log_visible_count = AI_LOG_PAGE_SIZE

func _on_world_updated(_change_set: Dictionary) -> void:
	_render()

func _on_ai_started(_request_id: String, _purpose: String) -> void:
	_busy = true
	_ai_confirm_waiting = false
	_ai_confirm_estimate = {}
	_render()

func _on_ai_finished(_request_id: String, _result: Dictionary) -> void:
	_busy = false
	_active_operation = &""
	_last_failed_operation = &""
	_ai_confirm_waiting = false
	_ai_confirm_estimate = {}
	_render()

func _on_ai_failed(_request_id: String, error: String) -> void:
	_busy = false
	if not error.contains("已取消"):
		_last_failed_operation = _active_operation
	_active_operation = &""
	_ai_confirm_waiting = false
	_ai_confirm_estimate = {}
	AppState.set_error(error)
	_render()

func _on_ai_confirmation_requested(request_id: String, purpose: String, summary: String) -> void:
	_ai_confirm_waiting = true
	_ai_confirm_request_id = request_id
	_ai_confirm_purpose = purpose
	_ai_confirm_summary = summary
	_ai_confirm_estimate = AIService.get_pending_confirmation_estimate()
	_busy = false
	_render()

func _on_files_dropped(files: PackedStringArray) -> void:
	if files.is_empty():
		return
	var path := files[0]
	var extension := path.get_extension().to_lower()
	if extension == "zip":
		if WorldStore.load_imported_world(path):
			AppState.navigate_with_notice(&"exploration", "已导入：%s" % WorldStore.world.get("name", "未命名世界"))
		else:
			_render()
		return
	if extension in ["png", "jpg", "jpeg", "webp"] and WorldStore.has_world():
		if WorldStore.import_map_image(path, "拖入地图"):
			AppState.set_notice("地图图片已导入。")
		else:
			AppState.set_error("地图图片导入失败。")
		_render()

func _ensure_input_actions() -> void:
	_register_key_action("submit_action", [KEY_ENTER, KEY_KP_ENTER])
	_register_key_action("open_map", [KEY_M])
	_register_key_action("open_journal", [KEY_J])
	_register_key_action("select_suggested_action", [KEY_TAB])
	_register_key_action("toggle_fullscreen", [KEY_F11])
	_register_key_action("zoom_map_in", [KEY_EQUAL, KEY_PLUS])
	_register_key_action("zoom_map_out", [KEY_MINUS])
	_register_key_action("pan_map", [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_A, KEY_D, KEY_W, KEY_S])
	_register_key_action("place_marker", [KEY_P])
	_register_key_action("toggle_map_focus", [KEY_F])
	_register_key_action("cancel_ai_request", [KEY_ESCAPE])
	_register_joypad_button_action("submit_action", [JOY_BUTTON_A])
	_register_joypad_button_action("cancel_ai_request", [JOY_BUTTON_B])
	_register_joypad_button_action("open_journal", [JOY_BUTTON_X])
	_register_joypad_button_action("open_map", [JOY_BUTTON_Y])
	_register_joypad_button_action("select_suggested_action", [JOY_BUTTON_RIGHT_SHOULDER])
	_register_joypad_button_action("zoom_map_in", [JOY_BUTTON_RIGHT_SHOULDER])
	_register_joypad_button_action("zoom_map_out", [JOY_BUTTON_LEFT_SHOULDER])
	_register_joypad_button_action("pan_map", [JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_DOWN])
	_register_joypad_button_action("place_marker", [JOY_BUTTON_LEFT_STICK])
	_register_joypad_button_action("toggle_map_focus", [JOY_BUTTON_RIGHT_STICK])

func _register_key_action(action_name: StringName, keycodes: Array[int]) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)
	for keycode in keycodes:
		if _action_has_key(action_name, keycode):
			continue
		var event := InputEventKey.new()
		event.keycode = keycode
		InputMap.action_add_event(action_name, event)

func _action_has_key(action_name: StringName, keycode: int) -> bool:
	for event in InputMap.action_get_events(action_name):
		if event is InputEventKey and (event as InputEventKey).keycode == keycode:
			return true
	return false

func _register_joypad_button_action(action_name: StringName, buttons: Array[int]) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)
	for button in buttons:
		if _action_has_joypad_button(action_name, button):
			continue
		var event := InputEventJoypadButton.new()
		event.button_index = button
		InputMap.action_add_event(action_name, event)

func _action_has_joypad_button(action_name: StringName, button: int) -> bool:
	for event in InputMap.action_get_events(action_name):
		if event is InputEventJoypadButton and (event as InputEventJoypadButton).button_index == button:
			return true
	return false

func _apply_window_mode_from_settings() -> void:
	_set_fullscreen(bool(SettingsStore.get_value("fullscreen", false)), false)

func _toggle_fullscreen() -> void:
	var enabled := not _is_fullscreen()
	_set_fullscreen(enabled, true)
	AppState.set_notice("已切换到%s。" % ("全屏模式" if enabled else "窗口模式"))
	_render()

func _set_fullscreen(enabled: bool, persist: bool = true) -> void:
	var target_mode := DisplayServer.WINDOW_MODE_FULLSCREEN if enabled else DisplayServer.WINDOW_MODE_WINDOWED
	if DisplayServer.window_get_mode() != target_mode:
		DisplayServer.window_set_mode(target_mode)
	if persist:
		SettingsStore.set_value("fullscreen", enabled)

func _apply_ui_theme() -> void:
	if _ui_font == null:
		var font_resource := ResourceLoader.load(UI_FONT_PATH)
		if font_resource is Font:
			_ui_font = font_resource
		else:
			var font_file := FontFile.new()
			var load_error := font_file.load_dynamic_font(UI_FONT_PATH)
			if load_error == OK:
				_ui_font = font_file
	var ui_theme := Theme.new()
	if _ui_font != null:
		ui_theme.default_font = _ui_font
	ui_theme.default_font_size = _scaled_font(16)
	theme = ui_theme

func _is_fullscreen() -> bool:
	return DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN

func _maybe_start_onboarding() -> void:
	if AppState.current_route == &"main_menu" and SettingsStore.is_onboarding_required():
		AppState.navigate(&"onboarding")

func _text_input_has_focus() -> bool:
	var focus := get_viewport().gui_get_focus_owner()
	return focus is LineEdit or focus is TextEdit or focus is SpinBox

func _handle_cancel_or_back() -> void:
	if AIService.has_active_request():
		_cancel_active_ai()
		return
	if AIService.has_pending_confirmation():
		AIService.cancel_pending_request()
		_ai_confirm_waiting = false
		_busy = false
		_render()
		return
	if AppState.current_route == &"main_menu" or AppState.current_route == &"onboarding":
		return
	if WorldStore.has_world():
		AppState.navigate(&"exploration")
	else:
		AppState.navigate(&"main_menu")

func _render() -> void:
	_apply_ui_theme()
	for child in get_children():
		child.queue_free()

	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var bg := ColorRect.new()
	bg.color = BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(bg)

	match AppState.current_route:
		&"onboarding":
			_render_onboarding()
		&"new_world":
			_render_new_world()
		&"exploration":
			_render_exploration()
		&"map":
			_render_map()
		&"locations":
			_render_locations()
		&"characters":
			_render_characters()
		&"timeline":
			_render_timeline()
		&"threads":
			_render_threads()
		&"world_lore":
			_render_world_lore()
		&"saves":
			_render_saves()
		&"settings":
			_render_settings()
		_:
			_render_main_menu()

func _render_main_menu() -> void:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.add_theme_constant_override("margin_left", 24)
	center.add_theme_constant_override("margin_right", 24)
	_root.add_child(center)

	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(430, 0)
	stack.add_theme_constant_override("separation", 14)
	center.add_child(stack)

	var mark := Label.new()
	mark.text = "E"
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mark.custom_minimum_size = Vector2(72, 72)
	mark.add_theme_font_size_override("font_size", 34)
	mark.add_theme_color_override("font_color", Color.WHITE)
	mark.add_theme_stylebox_override("normal", _style(ACCENT, ACCENT, 36))
	stack.add_child(_centered(mark))

	var title := _label("Evolvria", 56, FG, HORIZONTAL_ALIGNMENT_CENTER)
	stack.add_child(title)
	stack.add_child(_label("AI 驱动的开放世界叙事模拟", 15, MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	stack.add_child(_spacer(18))

	var continue_btn := _button("继续游戏", func() -> void:
		if WorldStore.has_world() or WorldStore.load_active_world():
			AppState.navigate(&"exploration")
	, true)
	continue_btn.disabled = not SaveManager.has_save() and not WorldStore.has_world()
	stack.add_child(continue_btn)

	stack.add_child(_button("新建世界", func() -> void:
		AppState.navigate(&"new_world")
	, false))
	stack.add_child(_separator("其他"))
	stack.add_child(_button("存档列表", func() -> void:
		AppState.navigate(&"saves")
	, false))
	stack.add_child(_button("设置", func() -> void:
		_route_before_settings = AppState.current_route
		AppState.navigate(&"settings")
	, false))

	var footer := _label("Evolvria · 本地 MVP", 12, MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	footer.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	footer.offset_top = -36
	footer.offset_bottom = -10
	_root.add_child(footer)

func _render_onboarding() -> void:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.add_theme_constant_override("margin_left", 20)
	center.add_theme_constant_override("margin_right", 20)
	_root.add_child(center)

	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(520 if _wide() else 0, 0)
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 14)
	center.add_child(stack)

	stack.add_child(_label("初始化配置", 38 if _wide() else 30, FG, HORIZONTAL_ALIGNMENT_CENTER))
	stack.add_child(_label("连接默认渠道商 Glosc AI 后，Evolvria 就能调用远端 AI 生成世界与推进叙事。", 14, MUTED, HORIZONTAL_ALIGNMENT_CENTER))

	var form := VBoxContainer.new()
	form.add_theme_constant_override("separation", 12)
	form.add_child(_status_box("默认渠道商：%s" % DEFAULT_GLOSC_PROVIDER, INFO))
	_onboarding_base_url = _line_edit(str(SettingsStore.get_value("glosc_base_url", DEFAULT_GLOSC_BASE_URL)))
	if _onboarding_base_url.text.strip_edges().is_empty():
		_onboarding_base_url.text = DEFAULT_GLOSC_BASE_URL
	form.add_child(_field("服务地址", _onboarding_base_url))
	_onboarding_token = _line_edit("输入 Glosc AI Key")
	_onboarding_token.secret = true
	form.add_child(_field("访问 Key", _onboarding_token))
	var key_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	key_row.add_theme_constant_override("separation", 8)
	key_row.add_child(_button("获取 Glosc AI Key", func() -> void:
		_open_glosc_keys_page()
	, false, INFO))
	var onboarding_key_help := _label("会打开 Glosc AI 控制台的 Keys 页面。", 12, MUTED)
	onboarding_key_help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	key_row.add_child(onboarding_key_help)
	form.add_child(key_row)
	form.add_child(_label(SettingsStore.local_token_risk_text(), 12, WARN))
	_onboarding_token_ack = _check("我理解 Key 会保存在本机设置文件中", bool(SettingsStore.get_value("local_token_risk_acknowledged", false)))
	form.add_child(_onboarding_token_ack)
	_onboarding_model = _line_edit(str(SettingsStore.get_value("model", DEFAULT_GLOSC_MODEL)))
	form.add_child(_field("默认模型", _onboarding_model))

	var actions: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	actions.add_child(_button("保存并开始", func() -> void:
		_complete_onboarding(false)
	, true))
	actions.add_child(_button("稍后配置，进入本地模式", func() -> void:
		_complete_onboarding(true)
	, false))
	form.add_child(actions)
	stack.add_child(_panel(form, 14))

	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
	if not AppState.last_notice.is_empty():
		stack.add_child(_status_box(AppState.last_notice, SUCCESS))

func _render_new_world() -> void:
	_ensure_new_world_draft()
	_new_world_step = clampi(_new_world_step, 1, NEW_WORLD_TOTAL_STEPS)
	var page := _page()
	page.add_child(_top_bar("新建世界", "返回主菜单", func() -> void: AppState.navigate(&"main_menu")))

	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(720)
	scroll.add_child(stack)

	stack.add_child(_new_world_step_indicator())
	stack.add_child(_new_world_step_content())
	stack.add_child(_new_world_step_footer())
	if _ai_confirm_waiting:
		stack.add_child(_ai_confirmation_panel())
	if _busy:
		stack.add_child(_ai_busy_panel("AI 正在补全世界观、地点、角色行动倾向和开局事件。"))
	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
		if _last_failed_operation != &"":
			stack.add_child(_retry_ai_panel())

func _new_world_step_content() -> Control:
	match _new_world_step:
		1:
			return _new_world_world_step()
		2:
			return _new_world_hero_step()
		3:
			return _new_world_characters_step()
		4:
			return _new_world_preferences_step()
		_:
			return _new_world_confirm_step()

func _new_world_world_step() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(_section_title("1. 世界基调", "输入基础设定，系统会补全世界规则、地点、冲突和开局事件。"))
	var world_grid := GridContainer.new()
	world_grid.columns = 2 if _wide() else 1
	world_grid.add_theme_constant_override("h_separation", 14)
	world_grid.add_theme_constant_override("v_separation", 14)
	box.add_child(_panel(world_grid))

	_world_name_input = _line_edit(str(_new_world_draft.get("world_name", "苍星纪元")))
	world_grid.add_child(_field("世界名称", _world_name_input))
	_genre_input = _options(["奇幻", "现代", "科幻", "末世", "校园", "武侠", "自定义"])
	_select_option_value(_genre_input, str(_new_world_draft.get("genre", "奇幻")))
	world_grid.add_child(_field("世界类型", _genre_input))
	_tone_input = _options(["冒险", "严肃", "黑暗", "浪漫", "政治", "悬疑", "轻松"])
	_select_option_value(_tone_input, str(_new_world_draft.get("tone", "冒险")))
	world_grid.add_child(_field("世界基调", _tone_input))
	return box

func _new_world_hero_step() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(_section_title("2. 主角", "主角设定会作为 AI 生成和事件判定的最高优先级事实。"))
	var hero_grid := GridContainer.new()
	hero_grid.columns = 2 if _wide() else 1
	hero_grid.add_theme_constant_override("h_separation", 14)
	hero_grid.add_theme_constant_override("v_separation", 14)
	box.add_child(_panel(hero_grid))

	_hero_name_input = _line_edit(str(_new_world_draft.get("hero_name", "艾林·星语")))
	hero_grid.add_child(_field("姓名", _hero_name_input))
	_hero_identity_input = _line_edit(str(_new_world_draft.get("hero_identity", "流浪剑客")))
	hero_grid.add_child(_field("身份", _hero_identity_input))
	_hero_goal_input = _line_edit(str(_new_world_draft.get("hero_goal", "寻找旧王朝失落档案")))
	hero_grid.add_child(_field("目标", _hero_goal_input))
	_hero_ability_input = _line_edit(str(_new_world_draft.get("hero_ability", "剑术,古文字,快速适应")))
	hero_grid.add_child(_field("能力/特质", _hero_ability_input))
	_hero_weakness_input = _line_edit(str(_new_world_draft.get("hero_weakness", "容易相信熟悉的人")))
	hero_grid.add_child(_field("弱点", _hero_weakness_input))
	return box

func _new_world_characters_step() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(_section_title("3. 关键角色", "每行一个角色：姓名 | 身份/定位 | 关系 | 性格关键词 | 秘密/目标 | 行动倾向 | 简述。可覆盖女主、女二、女三、男二等核心角色。"))
	_key_characters_input = _text_edit(str(_new_world_draft.get("key_characters", "")), 204)
	box.add_child(_panel(_field("角色列表", _key_characters_input)))
	box.add_child(_button("+ 添加角色模板", func() -> void:
		_append_key_character_template()
	, false))
	box.add_child(_button("+ 添加主线角色模板（女主/女二/女三/男二）", func() -> void:
		_append_main_cast_templates()
	, false))
	return box

func _new_world_preferences_step() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(_section_title("4. 内容与 AI 偏好", "告诉 AI 你希望包含和避免的内容，并控制叙事密度和 NPC 自主行动节奏。"))
	_limits_input = _text_edit(str(_new_world_draft.get("limits", "")), 96)
	box.add_child(_panel(_field("内容偏好/禁用内容", _limits_input)))
	var ai_grid := GridContainer.new()
	ai_grid.columns = 2 if _wide() else 1
	ai_grid.add_theme_constant_override("h_separation", 14)
	ai_grid.add_theme_constant_override("v_separation", 14)
	_narrative_detail_input = _options(["简洁", "适中", "详细"])
	_select_option_value(_narrative_detail_input, str(_new_world_draft.get("narrative_detail", "适中")))
	ai_grid.add_child(_field("叙事详细程度", _narrative_detail_input))
	_npc_frequency_input = _options(["低频", "中频", "高频"])
	_select_option_value(_npc_frequency_input, str(_new_world_draft.get("npc_autonomy_frequency", "中频")))
	ai_grid.add_child(_field("NPC 自主行动频率", _npc_frequency_input))
	box.add_child(_panel(ai_grid))
	return box

func _new_world_confirm_step() -> Control:
	_sync_new_world_draft_from_form()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(_section_title("5. 确认世界设定", "以下是你的世界概要。确认后即可进入探索，也可以返回任一步骤修改。"))
	var seed_preview := _build_world_seed_from_form()
	var world_estimate := AIService.estimate_usage("world_expand", {"seed": seed_preview})
	box.add_child(_usage_estimate_panel(world_estimate, "生成前预估"))
	box.add_child(_new_world_preview_panel(seed_preview, world_estimate))
	return box

func _render_exploration() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return

	var layout := HBoxContainer.new()
	layout.set_anchors_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation", 0)
	_root.add_child(layout)

	if _wide():
		layout.add_child(_nav_panel())

	var main := VBoxContainer.new()
	main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	main.size_flags_vertical = Control.SIZE_EXPAND_FILL
	layout.add_child(main)

	var loc := WorldStore.get_current_location()
	var time := WorldStore.world.get("current_time", {}) as Dictionary
	main.add_child(_screen_header(str(loc.get("name", "未知地点")), "第%s日 %02d:00 · %s" % [time.get("day", 1), int(time.get("hour", 8)), WorldStore.world.get("name", "")]))

	var scroll := _scroll()
	main.add_child(scroll)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 16)
	scroll.add_child(stack)
	stack.add_child(_narrative_block(str(WorldStore.world.get("summary", "")), "WORLD"))

	var recent := WorldStore.timeline.slice(maxi(0, WorldStore.timeline.size() - 8), WorldStore.timeline.size())
	for event in recent:
		var data := event as Dictionary
		var kind := "ACTION" if str(data.get("type", "")).contains("player") else "WORLD"
		stack.add_child(_narrative_block(str(data.get("description", "")), kind, str(data.get("title", "")), data))
	if _busy:
		stack.add_child(_ai_busy_panel("AI 正在生成结果，期间你仍可查看地图、人物和时间线。"))
	if _ai_confirm_waiting:
		stack.add_child(_ai_confirmation_panel())
	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
		if _last_failed_operation != &"":
			stack.add_child(_retry_ai_panel())
	if not _wide():
		stack.add_child(_context_panel())

	var input_panel := VBoxContainer.new()
	input_panel.add_theme_constant_override("separation", 10)
	input_panel.add_theme_stylebox_override("panel", _style(BG, BORDER, 0))
	input_panel.custom_minimum_size = Vector2(0, 126)
	input_panel.add_child(_suggested_actions_bar())
	var action_estimate := AIService.estimate_usage("player_action", {
		"action": _last_player_action if not _last_player_action.is_empty() else "下一次玩家行动",
		"context": WorldStore.build_ai_context("")
	})
	input_panel.add_child(_usage_estimate_panel(action_estimate, "发送前预估", false))
	var world_tools := HFlowContainer.new()
	world_tools.add_theme_constant_override("h_separation", 8)
	world_tools.add_theme_constant_override("v_separation", 8)
	var advance_day_btn := _button("推进一天", func() -> void:
		_advance_day()
	, false)
	advance_day_btn.disabled = _busy
	world_tools.add_child(advance_day_btn)
	world_tools.add_child(_button("复制当前叙事", func() -> void:
		_copy_current_narrative()
	, false))
	input_panel.add_child(world_tools)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_action_input = _line_edit("输入你的行动...")
	_action_input.text = _action_draft
	_action_input.caret_column = _action_draft.length()
	_action_input.text_changed.connect(func(text: String) -> void:
		_action_draft = text
	)
	_action_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_action_input)
	var send := _button("发送", func() -> void:
		_submit_action()
	, true)
	send.disabled = _busy
	row.add_child(send)
	input_panel.add_child(row)
	main.add_child(_padded(input_panel, 18))

	if _wide():
		layout.add_child(_context_panel())
	else:
		_add_mobile_bottom_nav(main)

func _render_map() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	var map_title := "地图主视图" if _map_focus_mode else "地图"
	page.add_child(_top_bar(map_title, "返回探索", func() -> void: AppState.navigate(&"exploration")))

	var body: BoxContainer = VBoxContainer.new() if _map_focus_mode else (HBoxContainer.new() if _wide() else VBoxContainer.new())
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 16)
	if _wide():
		page.add_child(_padded(body, 18))
	else:
		var body_scroll := _scroll()
		page.add_child(body_scroll)
		body_scroll.add_child(_padded(body, 18))

	var canvas := PanelContainer.new()
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	canvas.custom_minimum_size = _map_view_size()
	canvas.add_theme_stylebox_override("panel", _style(BG_ALT, BORDER, 10))
	body.add_child(canvas)
	var map_view := Control.new()
	map_view.clip_contents = true
	map_view.mouse_filter = Control.MOUSE_FILTER_STOP
	map_view.custom_minimum_size = _map_view_size()
	map_view.gui_input.connect(_on_map_view_gui_input.bind(map_view))
	canvas.add_child(map_view)
	var map_area := Control.new()
	map_area.clip_contents = true
	map_area.mouse_filter = Control.MOUSE_FILTER_PASS
	map_area.custom_minimum_size = _map_canvas_size()
	map_area.position = _clamped_map_pan()
	map_view.add_child(map_area)
	_add_map_image(map_area)
	_add_map_grid(map_area)
	_add_map_routes(map_area, _map_reveal_unknown_locations)

	for location in WorldStore.get_visible_locations(_map_reveal_unknown_locations):
		var loc := location as Dictionary
		var marker := _map_marker(loc)
		map_area.add_child(marker)

	for character in WorldStore.characters:
		var data := character as Dictionary
		if str(data.get("role", "")) == "player":
			continue
		var loc := WorldStore.get_location(str(data.get("current_location_id", "")))
		if loc.is_empty() or (not _map_reveal_unknown_locations and not WorldStore.is_location_known(loc)):
			continue
		var marker := _npc_marker(data, loc)
		map_area.add_child(marker)

	if _map_focus_mode:
		body.add_child(_map_focus_panel())
	else:
		body.add_child(_map_sidebar())
	_add_mobile_bottom_nav(page)

func _render_locations() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("地点", "返回探索", func() -> void: AppState.navigate(&"exploration")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(880)
	scroll.add_child(stack)
	stack.add_child(_section_title("地点档案", "地点状态、路线、当前角色和玩家备注会进入世界长期状态。"))
	var current_location_id := str(WorldStore.get_current_location().get("id", ""))
	var focused_id := _focused_location_id if not _focused_location_id.is_empty() else current_location_id
	if not focused_id.is_empty():
		var focused_location := WorldStore.get_location(focused_id)
		if not focused_location.is_empty():
			stack.add_child(_location_card(focused_location, true))
	for location in WorldStore.locations:
		if str(location.get("id", "")) == focused_id:
			continue
		stack.add_child(_location_card(location))
	_add_mobile_bottom_nav(page)

func _render_characters() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("人物名册", "返回探索", func() -> void: AppState.navigate(&"exploration")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(860)
	scroll.add_child(stack)
	var filtered_characters := WorldStore.get_characters_filtered(_character_filter)
	stack.add_child(_character_filter_controls())
	stack.add_child(_label("显示 %d / %d 位已知角色" % [filtered_characters.size(), WorldStore.characters.size()], 12, MUTED))
	if not _focused_character_id.is_empty():
		var focused_character := WorldStore.get_character(_focused_character_id)
		if not focused_character.is_empty() and not _character_id_in_list(str(focused_character.get("id", "")), filtered_characters):
			stack.add_child(_character_card(focused_character, true))
	if filtered_characters.is_empty():
		stack.add_child(_status_box("没有符合筛选条件的人物。", MUTED))
	for character in filtered_characters:
		if str(character.get("id", "")) == _focused_character_id:
			stack.add_child(_character_card(character, true))
		else:
			stack.add_child(_character_card(character))
	_add_mobile_bottom_nav(page)

func _character_filter_controls() -> Control:
	var panel := VBoxContainer.new()
	panel.add_theme_constant_override("separation", 8)
	panel.add_child(_label("筛选人物", 15, FG))
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	for filter in ["全部", "同行", "敌对", "已遇见", "仅听闻"]:
		var value := str(filter)
		row.add_child(_button(value, func(selected := value) -> void:
			_character_filter = selected
			_focused_character_id = ""
			_render()
		, value == _character_filter))
	panel.add_child(row)
	return _panel(panel, 12, Color(INFO, 0.06), BORDER)

func _character_id_in_list(character_id: String, list: Array[Dictionary]) -> bool:
	for character in list:
		if str(character.get("id", "")) == character_id:
			return true
	return false

func _render_timeline() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("时间线", "返回探索", func() -> void: AppState.navigate(&"exploration")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(900)
	scroll.add_child(stack)
	stack.add_child(_timeline_filters())
	var filtered_events := WorldStore.get_timeline_filtered(_timeline_type_filter, _timeline_character_filter, _timeline_location_filter)
	var visible_count := mini(_timeline_visible_count, filtered_events.size())
	stack.add_child(_label("显示最近 %d / %d 条筛选事件 · 全部 %d 条" % [visible_count, filtered_events.size(), WorldStore.timeline.size()], 12, MUTED))
	if filtered_events.is_empty():
		stack.add_child(_status_box("没有符合筛选条件的事件。"))
	else:
		for i in range(filtered_events.size() - 1, filtered_events.size() - visible_count - 1, -1):
			stack.add_child(_timeline_card(filtered_events[i]))
		if visible_count < filtered_events.size():
			stack.add_child(_button("加载更多事件", func() -> void:
				_timeline_visible_count = mini(_timeline_visible_count + TIMELINE_PAGE_SIZE, filtered_events.size())
				_render()
			, false))
	_add_mobile_bottom_nav(page)

func _render_threads() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("线索与目标", "返回探索", func() -> void: AppState.navigate(&"exploration")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(860)
	scroll.add_child(stack)
	stack.add_child(_section_title("进行中", "主线目标、未解决线索和系统自动整理出的下一步。"))
	var active_threads := WorldStore.get_active_threads()
	if active_threads.is_empty():
		stack.add_child(_status_box("当前没有未解决线索。"))
	else:
		for thread in active_threads:
			stack.add_child(_thread_card(thread))
	var resolved_count := 0
	for thread in WorldStore.threads:
		var data := thread as Dictionary
		if str(data.get("status", "open")) == "resolved":
			if resolved_count == 0:
				stack.add_child(_section_title("已解决", "这些线索会保留为历史记录。"))
			stack.add_child(_thread_card(data))
			resolved_count += 1
	_add_mobile_bottom_nav(page)

func _render_world_lore() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("世界观", "返回探索", func() -> void: AppState.navigate(&"exploration")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(880)
	scroll.add_child(stack)

	stack.add_child(_section_title(str(WorldStore.world.get("name", "未命名世界")), "结构化世界状态会进入每次 AI 调用的上下文，而不是只保存在聊天记录里。"))
	stack.add_child(_narrative_block(str(WorldStore.world.get("summary", "")), "SUMMARY"))

	var rules := VBoxContainer.new()
	rules.add_theme_constant_override("separation", 8)
	rules.add_child(_label("世界规则", 18, FG))
	for rule in WorldStore.world.get("rules", []):
		rules.add_child(_label("• %s" % rule, 14, FG))
	stack.add_child(_panel(rules))

	var current_context := WorldStore.build_ai_context("")
	var context_box := VBoxContainer.new()
	context_box.add_theme_constant_override("separation", 8)
	context_box.add_child(_label("下一次 AI 调用会携带的上下文摘要", 18, FG))
	context_box.add_child(_label("当前地点：%s" % WorldStore.get_current_location().get("name", "未知地点"), 14, FG))
	context_box.add_child(_label("最近事件：%d 条" % (current_context.get("recent_events", []) as Array).size(), 14, MUTED))
	context_box.add_child(_label("相关记忆：%d 条" % (current_context.get("relevant_memories", []) as Array).size(), 14, MUTED))
	var limits: Array = WorldStore.world.get("content_limits", [])
	if not limits.is_empty():
		context_box.add_child(_label("内容边界：%s" % ", ".join(limits), 14, WARN))
	stack.add_child(_panel(context_box))

	stack.add_child(_consistency_panel())

	stack.add_child(_summary_status_panel())

	if bool(SettingsStore.get_value("developer_mode", false)):
		stack.add_child(_developer_tools_panel())

	stack.add_child(_section_title("势力", "势力会在时间推进中行动，并可能影响地点控制权。"))
	if WorldStore.factions.is_empty():
		stack.add_child(_status_box("当前世界还没有势力数据。"))
	else:
		for faction in WorldStore.factions:
			stack.add_child(_faction_card(faction))

	stack.add_child(_section_title("地点", "地点坐标使用归一化值，参与地图、移动和 NPC 行动。"))
	for location in WorldStore.locations:
		var loc := location as Dictionary
		var position := loc.get("position", {}) as Dictionary
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 6)
		box.add_child(_label("%s · %s" % [loc.get("name", ""), loc.get("type", "")], 17, FG))
		box.add_child(_label(str(loc.get("description", "")), 14, FG))
		box.add_child(_label("控制势力：%s" % WorldStore.faction_name(str(loc.get("controlling_faction_id", ""))), 12, INFO))
		box.add_child(_label("坐标 %.2f, %.2f · 标签 %s" % [float(position.get("x", 0.0)), float(position.get("y", 0.0)), ", ".join(loc.get("state_tags", []))], 12, MUTED))
		if not str(loc.get("memory_summary", "")).is_empty():
			box.add_child(_label("地点记忆：%s" % loc.get("memory_summary", ""), 12, INFO))
		stack.add_child(_panel(box))

	stack.add_child(_section_title("AI 调用日志", "默认只保留摘要和用量，不保存密钥。"))
	if WorldStore.ai_logs.is_empty():
		stack.add_child(_status_box("还没有 AI 调用日志。"))
	else:
		stack.add_child(_ai_usage_panel())
		stack.add_child(_ai_log_tools())
		var visible_logs := mini(_ai_log_visible_count, WorldStore.ai_logs.size())
		stack.add_child(_label("显示最近 %d / %d 条日志" % [visible_logs, WorldStore.ai_logs.size()], 12, MUTED))
		for i in range(WorldStore.ai_logs.size() - 1, WorldStore.ai_logs.size() - visible_logs - 1, -1):
			stack.add_child(_ai_log_card(WorldStore.ai_logs[i]))
		if visible_logs < WorldStore.ai_logs.size():
			stack.add_child(_button("加载更多日志", func() -> void:
				_ai_log_visible_count = mini(_ai_log_visible_count + AI_LOG_PAGE_SIZE, WorldStore.ai_logs.size())
				_render()
			, false))
	_add_mobile_bottom_nav(page)

func _render_saves() -> void:
	var page := _page()
	page.add_child(_top_bar("存档列表", "返回主菜单", func() -> void: AppState.navigate(&"main_menu")))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(760)
	scroll.add_child(stack)

	stack.add_child(_section_title("当前世界", "从这里继续、保存、导出或检查本地存档状态。"))
	var active_entry := SaveManager.get_active_save_entry()
	if active_entry.is_empty():
		stack.add_child(_status_box("还没有本地世界存档。可以先新建世界，或导入一个 ZIP。", WARN))
	else:
		stack.add_child(_save_entry_card(active_entry, true))

	var action_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	var save_btn := _button("立即保存", func() -> void:
		if WorldStore.has_world():
			SaveManager.save_game(WorldStore.export_payload())
			AppState.set_notice("当前世界已保存。")
		else:
			AppState.set_error("需要先载入或创建世界。")
		_render()
	, false)
	save_btn.disabled = not WorldStore.has_world()
	action_row.add_child(save_btn)
	var export_btn := _button("导出世界 ZIP", func() -> void:
		_export_world_zip()
	, false)
	export_btn.disabled = active_entry.is_empty() and not WorldStore.has_world()
	action_row.add_child(export_btn)
	if SaveManager.can_reveal_directories():
		action_row.add_child(_button("打开导出目录", func() -> void:
			if SaveManager.reveal_export_dir():
				AppState.set_notice("已打开导出目录。")
			_render()
		, false))
	stack.add_child(_panel(action_row, 12))
	stack.add_child(_last_export_tools())

	stack.add_child(_section_title("导入", "导入 ZIP 会校验结构和 schema，若世界 ID 冲突会保留两个副本。"))
	var import_box := VBoxContainer.new()
	import_box.add_theme_constant_override("separation", 8)
	_settings_import_zip = _line_edit("user://exports/world.zip")
	import_box.add_child(_field("ZIP 路径", _settings_import_zip))
	var import_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	import_row.add_theme_constant_override("separation", 8)
	import_row.add_child(_button("选择 ZIP 文件", func() -> void: _open_zip_file_dialog(), false))
	import_row.add_child(_button("导入世界 ZIP", func() -> void:
		if WorldStore.load_imported_world(_settings_import_zip.text.strip_edges()):
			AppState.navigate_with_notice(&"exploration", "已导入：%s" % WorldStore.world.get("name", "未命名世界"))
		else:
			_render()
	, false))
	import_box.add_child(import_row)
	stack.add_child(_panel(import_box, 12))

	stack.add_child(_section_title("自动备份", "系统保留最近 5 次自动保存，便于误操作后恢复。"))
	var backup_entries := SaveManager.list_backup_entries()
	if backup_entries.is_empty():
		stack.add_child(_status_box("暂无自动备份。"))
	else:
		for entry in backup_entries:
			stack.add_child(_save_entry_card(entry, false))

	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
	if not AppState.last_notice.is_empty():
		stack.add_child(_status_box(AppState.last_notice, SUCCESS))

func _render_settings() -> void:
	var page := _page()
	page.add_child(_top_bar("设置", "返回", func() -> void: AppState.navigate(_route_before_settings)))
	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(760)
	scroll.add_child(stack)

	stack.add_child(_section_title("Glosc One", "当前版本会在未配置服务时使用本地叙事生成器。真实调用入口已通过 AIService 隔离。"))
	var api := VBoxContainer.new()
	api.add_theme_constant_override("separation", 12)
	api.add_child(_glosc_status_panel())
	_settings_base_url = _line_edit(str(SettingsStore.get_value("glosc_base_url", "")))
	api.add_child(_field("服务地址", _settings_base_url))
	var stored_token := str(SettingsStore.get_value("glosc_token", ""))
	_settings_token = _line_edit(stored_token if not stored_token.is_empty() else "输入 Glosc AI Key")
	_settings_token.secret = true
	api.add_child(_field("访问令牌", _settings_token))
	var key_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	key_row.add_theme_constant_override("separation", 8)
	key_row.add_child(_button("获取 Glosc AI Key", func() -> void:
		_open_glosc_keys_page()
	, false, INFO))
	var settings_key_help := _label("默认渠道商：Glosc AI", 12, MUTED)
	settings_key_help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	key_row.add_child(settings_key_help)
	api.add_child(key_row)
	api.add_child(_label(SettingsStore.local_token_risk_text(), 12, WARN))
	_settings_token_ack = _check("我理解访问令牌会保存在本机设置文件中", bool(SettingsStore.get_value("local_token_risk_acknowledged", false)))
	api.add_child(_settings_token_ack)
	_settings_model = _line_edit(str(SettingsStore.get_value("model", DEFAULT_GLOSC_MODEL)))
	api.add_child(_field("默认模型", _settings_model))
	_settings_timeout = SpinBox.new()
	_settings_timeout.min_value = 5
	_settings_timeout.max_value = 180
	_settings_timeout.value = float(SettingsStore.get_value("timeout_seconds", 45))
	api.add_child(_field("请求超时（秒）", _settings_timeout))
	_settings_quota_units = _spin(float(SettingsStore.get_value("glosc_quota_units", 5000)), 0, 999999, 100)
	api.add_child(_field("本月额度/预算单位", _settings_quota_units))
	_settings_confirm = _check("每次 AI 调用前确认", bool(SettingsStore.get_value("confirm_ai_calls", true)))
	api.add_child(_settings_confirm)
	_settings_usage_estimate = _check("显示消耗预估", bool(SettingsStore.get_value("show_usage_estimate", true)))
	api.add_child(_settings_usage_estimate)
	_settings_auto_save = _check("AI 响应后自动保存", bool(SettingsStore.get_value("auto_save_enabled", true)))
	api.add_child(_settings_auto_save)
	api.add_child(_label("AI 请求开始前仍会保留最近 1 次请求前状态，便于失败或误操作后恢复。", 12, MUTED))
	_settings_retry = _check("允许自动重试", bool(SettingsStore.get_value("auto_retry", true)))
	api.add_child(_settings_retry)
	_settings_debug = _check("保存调试日志", bool(SettingsStore.get_value("debug_logs", true)))
	api.add_child(_settings_debug)
	_settings_developer_mode = _check("开发者模式", bool(SettingsStore.get_value("developer_mode", false)))
	api.add_child(_settings_developer_mode)
	api.add_child(_label("开发者模式会显示世界状态查看器与调试事件编辑器；发布游玩默认关闭。", 12, MUTED))
	_settings_log_level = _options(["default", "debug", "deep"])
	_select_option_value(_settings_log_level, _current_log_level())
	api.add_child(_field("日志级别", _settings_log_level))
	api.add_child(_label("default 只记录 ID/类型/状态/用量；debug 增加摘要；deep 保存脱敏原始响应，导出前请确认可能包含隐私。", 12, MUTED))
	api.add_child(_button("保存 AI 设置", func() -> void: _save_settings(), true))
	stack.add_child(_panel(api))

	if WorldStore.has_world():
		stack.add_child(_section_title("用量", "统计当前世界最近保留的 AI 调用日志。"))
		stack.add_child(_ai_usage_panel())

	stack.add_child(_section_title("内容偏好", "这些偏好会进入新世界设定和后续 AI 上下文。"))
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 10)
	_settings_content_preferences = _text_edit(str(SettingsStore.get_value("content_preferences", "")), 96)
	content.add_child(_field("偏好风格与禁用内容", _settings_content_preferences))
	content.add_child(_label("示例：已禁用成人内容、极端血腥、酷刑描写；偏好严肃、冒险、低剧透叙事。", 12, MUTED))
	content.add_child(_button("保存内容偏好", func() -> void: _save_settings(), false))
	stack.add_child(_panel(content))

	stack.add_child(_section_title("显示", "字号设置会影响后续 UI 文本密度。"))
	var display := VBoxContainer.new()
	display.add_theme_constant_override("separation", 10)
	var font_row := HBoxContainer.new()
	font_row.add_theme_constant_override("separation", 10)
	for size_name in ["small", "medium", "large"]:
		var captured_size := str(size_name)
		var btn := _button(captured_size, func() -> void:
			SettingsStore.set_value("font_size", captured_size)
			_render()
		, str(SettingsStore.get_value("font_size", "medium")) == captured_size)
		font_row.add_child(btn)
	display.add_child(_field("字号", font_row))
	_settings_context_width = _spin(float(_context_panel_width()), 260, 520, 10)
	display.add_child(_field("上下文面板宽度", _settings_context_width))
	display.add_child(_button("应用布局设置", func() -> void:
		SettingsStore.set_value("context_panel_width", int(_settings_context_width.value))
		AppState.set_notice("布局设置已应用。")
		_render()
	, false))
	_settings_fullscreen = _check("全屏模式", bool(SettingsStore.get_value("fullscreen", false)) or _is_fullscreen())
	display.add_child(_settings_fullscreen)
	var window_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	window_row.add_theme_constant_override("separation", 8)
	window_row.add_child(_button("应用窗口设置", func() -> void:
		_set_fullscreen(_settings_fullscreen.button_pressed, true)
		AppState.set_notice("窗口显示设置已应用。")
		_render()
	, false))
	window_row.add_child(_button("切换全屏（F11）", func() -> void:
		_toggle_fullscreen()
	, false))
	display.add_child(_field("窗口", window_row))
	stack.add_child(_panel(display))

	stack.add_child(_section_title("数据管理", "本地存档保存到 Godot 的 user://saves 目录。"))
	var data_tools := VBoxContainer.new()
	data_tools.add_theme_constant_override("separation", 10)
	data_tools.add_child(_button("立即保存", func() -> void:
		if WorldStore.has_world():
			SaveManager.save_game(WorldStore.export_payload())
	, false))
	if SaveManager.can_reveal_directories():
		var directory_row: BoxContainer
		if _wide():
			directory_row = HBoxContainer.new()
		else:
			directory_row = VBoxContainer.new()
		directory_row.add_theme_constant_override("separation", 8)
		directory_row.add_child(_button("打开导出目录", func() -> void:
			if SaveManager.reveal_export_dir():
				AppState.set_notice("已打开导出目录：%s" % SaveManager.get_export_dir_path())
			_render()
		, false))
		directory_row.add_child(_button("打开备份目录", func() -> void:
			if SaveManager.reveal_backup_dir():
				AppState.set_notice("已打开备份目录：%s" % SaveManager.get_backup_dir_path())
			_render()
		, false))
		data_tools.add_child(directory_row)
	else:
		data_tools.add_child(_label("当前平台会通过 ZIP 导入导出保留一致格式；移动和平板端后续接系统分享面板。", 12, MUTED))
	data_tools.add_child(_button("恢复最近备份", func() -> void:
		var payload := SaveManager.restore_latest_backup()
		if not payload.is_empty():
			WorldStore.load_active_world()
			AppState.navigate_with_notice(&"exploration", "已恢复最近备份。")
		else:
			_render()
	, false))
	var checkpoint_entry := SaveManager.get_ai_checkpoint_entry()
	if checkpoint_entry.is_empty():
		data_tools.add_child(_label("暂无 AI 请求前状态。提交玩家行动前会自动保留最近 1 次。", 12, MUTED))
	else:
		data_tools.add_child(_label("最近 AI 请求前状态：第 %d 天 · %d 事件 · %s" % [
			int(checkpoint_entry.get("world_day", 0)),
			int(checkpoint_entry.get("event_count", 0)),
			checkpoint_entry.get("updated_at", "")
		], 12, INFO))
		data_tools.add_child(_button("恢复 AI 请求前状态", func() -> void:
			var payload := SaveManager.restore_ai_checkpoint()
			if not payload.is_empty():
				WorldStore.load_active_world()
				AppState.navigate_with_notice(&"exploration", "已恢复到最近 AI 请求前状态。")
			else:
				_render()
		, false))
	var backup_entries := SaveManager.list_backup_entries()
	if backup_entries.is_empty():
		data_tools.add_child(_label("暂无可恢复备份。连续游玩后会保留最近 5 次自动保存。", 12, MUTED))
	else:
		var backup_options := OptionButton.new()
		backup_options.custom_minimum_size = Vector2(0, 40)
		backup_options.add_theme_stylebox_override("normal", _style(SURFACE, BORDER, 8))
		backup_options.add_theme_color_override("font_color", FG)
		for entry in backup_entries:
			backup_options.add_item(_backup_option_label(entry))
			backup_options.set_item_metadata(backup_options.item_count - 1, entry)
		data_tools.add_child(_field("选择备份", backup_options))
		data_tools.add_child(_button("恢复选中备份", func() -> void:
			var selected_entry := backup_options.get_item_metadata(backup_options.selected) as Dictionary
			if selected_entry.is_empty():
				AppState.set_error("没有选中的备份。")
				_render()
				return
			_restore_backup_from_settings(str(selected_entry.get("path", "")))
		, false))
	data_tools.add_child(_button("导出世界 ZIP", func() -> void:
		_export_world_zip()
	, false))
	data_tools.add_child(_last_export_tools())
	_settings_import_zip = _line_edit("user://exports/world.zip")
	data_tools.add_child(_field("导入 ZIP 路径", _settings_import_zip))
	data_tools.add_child(_button("选择 ZIP 文件", func() -> void:
		_open_zip_file_dialog()
	, false))
	data_tools.add_child(_button("导入世界 ZIP", func() -> void:
		if WorldStore.load_imported_world(_settings_import_zip.text.strip_edges()):
			AppState.navigate_with_notice(&"exploration", "已导入：%s" % WorldStore.world.get("name", "未命名世界"))
		else:
			_render()
	, false))
	if _clear_ai_logs_confirming:
		var clear_box := VBoxContainer.new()
		clear_box.add_theme_constant_override("separation", 8)
		clear_box.add_child(_label("确认清除 AI 日志？", 15, WARN))
		clear_box.add_child(_label("这会从当前世界存档中移除 AI 调用记录和用量明细；已导出的 JSONL 不会受影响。", 12, MUTED))
		var clear_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
		clear_row.add_theme_constant_override("separation", 8)
		clear_row.add_child(_button("确认清除 AI 日志", func() -> void:
			if WorldStore.has_world():
				WorldStore.clear_ai_logs()
				AppState.set_notice("AI 日志已清除。")
			_clear_ai_logs_confirming = false
			_render()
		, false, WARN))
		clear_row.add_child(_button("取消清除日志", func() -> void:
			_clear_ai_logs_confirming = false
			_render()
		, false))
		clear_box.add_child(clear_row)
		data_tools.add_child(_panel(clear_box, 12, Color(WARN, 0.08), WARN))
	else:
		var clear_logs_btn := _button("清除 AI 日志", func() -> void:
			if not WorldStore.has_world() or WorldStore.ai_logs.is_empty():
				AppState.set_error("没有可清除的 AI 日志。")
				_render()
				return
			_clear_ai_logs_confirming = true
			AppState.clear_error()
			_render()
		, false, WARN)
		clear_logs_btn.disabled = not WorldStore.has_world() or WorldStore.ai_logs.is_empty()
		data_tools.add_child(clear_logs_btn)
	if _delete_world_confirming:
		var delete_box := VBoxContainer.new()
		delete_box.add_theme_constant_override("separation", 8)
		delete_box.add_child(_label("确认删除当前世界？", 15, DANGER))
		delete_box.add_child(_label("这会删除当前存档和最近 AI 请求前状态；导出的 ZIP 不会受影响。", 12, WARN))
		var delete_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
		delete_row.add_theme_constant_override("separation", 8)
		delete_row.add_child(_button("确认永久删除", func() -> void:
			WorldStore.reset_world()
			_delete_world_confirming = false
			AppState.navigate_with_notice(&"main_menu", "当前世界已删除。")
		, false, DANGER))
		delete_row.add_child(_button("取消删除", func() -> void:
			_delete_world_confirming = false
			_render()
		, false))
		delete_box.add_child(delete_row)
		data_tools.add_child(_panel(delete_box, 12, Color(DANGER, 0.08), DANGER))
	else:
		data_tools.add_child(_button("删除当前世界", func() -> void:
			if not WorldStore.has_world() and not SaveManager.has_save():
				AppState.set_error("没有可删除的世界。")
				_render()
				return
			_delete_world_confirming = true
			AppState.clear_error()
			_render()
		, false, DANGER))
	if _reset_settings_confirming:
		var reset_box := VBoxContainer.new()
		reset_box.add_theme_constant_override("separation", 8)
		reset_box.add_child(_label("确认重置所有设置？", 15, WARN))
		reset_box.add_child(_label("这会恢复 Glosc One、显示、日志和内容偏好的默认值；不会删除当前世界或备份。", 12, MUTED))
		var reset_row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
		reset_row.add_theme_constant_override("separation", 8)
		reset_row.add_child(_button("确认重置设置", func() -> void:
			SettingsStore.reset_settings()
			_reset_settings_confirming = false
			AppState.set_notice("设置已恢复默认值。")
			_render()
		, false, WARN))
		reset_row.add_child(_button("取消重置设置", func() -> void:
			_reset_settings_confirming = false
			_render()
		, false))
		reset_box.add_child(reset_row)
		data_tools.add_child(_panel(reset_box, 12, Color(WARN, 0.08), WARN))
	else:
		data_tools.add_child(_button("重置所有设置", func() -> void:
			_reset_settings_confirming = true
			AppState.clear_error()
			_render()
		, false, WARN))
	stack.add_child(_panel(data_tools))

	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
	if not AppState.last_notice.is_empty():
		stack.add_child(_status_box(AppState.last_notice, SUCCESS))
	_add_mobile_bottom_nav(page)

func _render_empty_world() -> void:
	var page := _page()
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	page.add_child(center)
	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(420, 0)
	stack.add_theme_constant_override("separation", 14)
	center.add_child(stack)
	stack.add_child(_label("还没有世界", 32, FG, HORIZONTAL_ALIGNMENT_CENTER))
	stack.add_child(_label("先创建一个世界，或读取已有本地存档。", 15, MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	stack.add_child(_button("新建世界", func() -> void: AppState.navigate(&"new_world"), true))
	stack.add_child(_button("返回主菜单", func() -> void: AppState.navigate(&"main_menu"), false))

func _create_world_from_form() -> void:
	var seed := _build_world_seed_from_form()
	if str(seed["world_name"]).is_empty():
		AppState.set_error("世界名称不能为空。")
		_render()
		return
	AppState.clear_error()
	_last_world_seed = seed.duplicate(true)
	_active_operation = &"world_expand"
	_busy = true
	_render()
	await WorldStore.create_world(seed)
	_busy = false
	if WorldStore.has_world():
		_last_failed_operation = &""
		AppState.navigate(&"exploration")
	else:
		_last_failed_operation = &"world_expand"
		AppState.set_error("世界生成失败，请检查 Glosc One 配置或稍后重试。")
		_render()

func _export_world_zip() -> void:
	if not WorldStore.has_world() and not WorldStore.load_active_world():
		AppState.set_error("没有可导出的世界。")
		_render()
		return
	var export_path := SaveManager.export_world(WorldStore.export_payload(), true)
	if not export_path.is_empty():
		AppState.set_notice("已导出：%s" % SaveManager.get_shareable_file_path(export_path))
	_render()

func _last_export_tools() -> Control:
	var path := SaveManager.get_last_world_export_path()
	if path.is_empty() or not FileAccess.file_exists(path):
		var hint := VBoxContainer.new()
		hint.add_theme_constant_override("separation", 6)
		hint.add_child(_label("导出后可在这里复制 ZIP 路径或交给系统打开/分享。", 12, MUTED))
		hint.add_child(_label("移动和平板端使用同一 ZIP 格式，适合系统文件选择器、分享面板或应用沙盒导入。", 11, INFO))
		return _panel(hint, 10, Color(INFO, 0.04), BORDER)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label("最近导出 ZIP", 14, FG))
	box.add_child(_label(SaveManager.get_shareable_file_path(path), 11, MUTED))
	box.add_child(_label("包含世界状态、时间线、记忆、AI 日志和地图图片；分享前请确认其中含有玩家生成内容。", 11, WARN))
	var row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_button("打开/分享最近导出 ZIP", func() -> void:
		if SaveManager.open_or_share_export_file(path):
			AppState.set_notice("已交给系统处理最近导出 ZIP。")
		_render()
	, false))
	row.add_child(_button("复制导出 ZIP 路径", func() -> void:
		DisplayServer.clipboard_set(SaveManager.get_shareable_file_path(path))
		AppState.set_notice("导出 ZIP 路径已复制。")
		_render()
	, false))
	box.add_child(row)
	return _panel(box, 10, Color(INFO, 0.06), INFO)

func _handle_suggested_action_shortcut(event: InputEvent) -> bool:
	if AppState.current_route != &"exploration" or not WorldStore.has_world() or WorldStore.suggested_actions.is_empty():
		return false
	if event.is_action_pressed("select_suggested_action"):
		_select_suggested_action(_suggested_action_index + 1)
		return true
	if _text_input_has_focus():
		return false
	if event is InputEventKey:
		var key_event := event as InputEventKey
		if not key_event.pressed or key_event.echo:
			return false
		var shortcut_index := _suggested_index_for_key(key_event.keycode)
		if shortcut_index >= 0 and shortcut_index < WorldStore.suggested_actions.size():
			_select_suggested_action(shortcut_index)
			return true
	return false

func _handle_map_keyboard_pan(event: InputEvent) -> bool:
	if AppState.current_route != &"map":
		return false
	var step := 48.0
	if event is InputEventKey:
		var key_event := event as InputEventKey
		if not key_event.pressed or key_event.echo:
			return false
		match key_event.keycode:
			KEY_LEFT, KEY_A:
				_pan_map_by(Vector2(step, 0))
			KEY_RIGHT, KEY_D:
				_pan_map_by(Vector2(-step, 0))
			KEY_UP, KEY_W:
				_pan_map_by(Vector2(0, step))
			KEY_DOWN, KEY_S:
				_pan_map_by(Vector2(0, -step))
			_:
				return false
		return true
	if event is InputEventJoypadButton:
		var joy_event := event as InputEventJoypadButton
		if not joy_event.pressed:
			return false
		match joy_event.button_index:
			JOY_BUTTON_DPAD_LEFT:
				_pan_map_by(Vector2(step, 0))
			JOY_BUTTON_DPAD_RIGHT:
				_pan_map_by(Vector2(-step, 0))
			JOY_BUTTON_DPAD_UP:
				_pan_map_by(Vector2(0, step))
			JOY_BUTTON_DPAD_DOWN:
				_pan_map_by(Vector2(0, -step))
			_:
				return false
		return true
	return false

func _suggested_index_for_key(keycode: Key) -> int:
	match keycode:
		KEY_1, KEY_KP_1:
			return 0
		KEY_2, KEY_KP_2:
			return 1
		KEY_3, KEY_KP_3:
			return 2
		KEY_4, KEY_KP_4:
			return 3
		KEY_5, KEY_KP_5:
			return 4
		KEY_6, KEY_KP_6:
			return 5
		KEY_7, KEY_KP_7:
			return 6
		KEY_8, KEY_KP_8:
			return 7
		KEY_9, KEY_KP_9:
			return 8
		_:
			return -1

func _select_suggested_action(index: int) -> bool:
	if WorldStore.suggested_actions.is_empty():
		return false
	_suggested_action_index = posmod(index, WorldStore.suggested_actions.size())
	_action_draft = str(WorldStore.suggested_actions[_suggested_action_index])
	if _action_input != null:
		_action_input.text = _action_draft
		_action_input.caret_column = _action_draft.length()
	_render()
	return true

func _submit_action() -> void:
	if _action_input == null or _busy:
		return
	var action := _action_input.text.strip_edges()
	if action.is_empty():
		return
	AppState.clear_error()
	_last_player_action = action
	_action_draft = ""
	_active_operation = &"player_action"
	_busy = true
	_render()
	await WorldStore.submit_player_action(action)
	_busy = false
	# If the action was blocked or rejected, restore the draft so the player can
	# revise it instead of having to retype, and offer a retry affordance.
	if not AppState.last_error.is_empty():
		_action_draft = action
		_last_failed_operation = &"player_action"
	else:
		_last_failed_operation = &""
	_render()

func _advance_day() -> void:
	if _busy or not WorldStore.has_world():
		return
	AppState.clear_error()
	_busy = true
	_render()
	var result := await WorldStore.advance_day()
	_busy = false
	if result.is_empty():
		AppState.set_error("无法推进世界时间。")
	else:
		AppState.set_notice("已推进一天，记录 %d 条世界变化。" % int(result.get("generated_events", 0)))
	_render()

func _copy_current_narrative() -> void:
	var text := _current_narrative_text()
	if text.strip_edges().is_empty():
		AppState.set_error("当前没有可复制的叙事文本。")
	else:
		DisplayServer.clipboard_set(text)
		AppState.set_notice("当前叙事已复制。")
	_render()

func _current_narrative_text() -> String:
	if not WorldStore.has_world():
		return ""
	var lines: Array[String] = []
	var current_time := WorldStore.world.get("current_time", {}) as Dictionary
	lines.append("%s · 第 %d 天 %02d:00 · %s" % [
		WorldStore.world.get("name", "未命名世界"),
		int(current_time.get("day", 1)),
		int(current_time.get("hour", 0)),
		WorldStore.get_current_location().get("name", "未知地点")
	])
	var summary := str(WorldStore.world.get("summary", "")).strip_edges()
	if not summary.is_empty():
		lines.append("")
		lines.append(summary)
	var recent := WorldStore.timeline.slice(maxi(0, WorldStore.timeline.size() - 8), WorldStore.timeline.size())
	if not recent.is_empty():
		lines.append("")
		lines.append("最近叙事")
		for event in recent:
			var data := event as Dictionary
			var event_time := data.get("world_time", {}) as Dictionary
			lines.append("第 %d 天 %02d:00 · %s" % [
				int(event_time.get("day", 1)),
				int(event_time.get("hour", 0)),
				data.get("title", "事件")
			])
			lines.append(str(data.get("description", "")).strip_edges())
	return "\n".join(lines)

func _save_settings() -> void:
	var token := _settings_token.text.strip_edges()
	var token_acknowledged := _settings_token_ack != null and _settings_token_ack.button_pressed
	if not SettingsStore.can_store_glosc_token(token, token_acknowledged):
		AppState.set_error("保存访问令牌前需要确认本地保存风险。")
		AppState.clear_notice()
		_render()
		return
	SettingsStore.settings["glosc_provider"] = DEFAULT_GLOSC_PROVIDER
	SettingsStore.settings["glosc_base_url"] = _settings_base_url.text.strip_edges()
	SettingsStore.settings["glosc_token"] = token
	SettingsStore.settings["model"] = _settings_model.text.strip_edges()
	SettingsStore.settings["timeout_seconds"] = int(_settings_timeout.value)
	if _settings_quota_units != null:
		SettingsStore.settings["glosc_quota_units"] = int(_settings_quota_units.value)
	SettingsStore.settings["local_token_risk_acknowledged"] = token_acknowledged
	SettingsStore.settings["confirm_ai_calls"] = _settings_confirm.button_pressed
	if _settings_usage_estimate != null:
		SettingsStore.settings["show_usage_estimate"] = _settings_usage_estimate.button_pressed
	if _settings_auto_save != null:
		SettingsStore.settings["auto_save_enabled"] = _settings_auto_save.button_pressed
	SettingsStore.settings["auto_retry"] = _settings_retry.button_pressed
	SettingsStore.settings["debug_logs"] = _settings_debug.button_pressed
	if _settings_developer_mode != null:
		SettingsStore.settings["developer_mode"] = _settings_developer_mode.button_pressed
	if _settings_log_level != null:
		SettingsStore.settings["log_level"] = _settings_log_level.get_item_text(_settings_log_level.selected)
	if _settings_content_preferences != null:
		SettingsStore.settings["content_preferences"] = _settings_content_preferences.text.strip_edges()
	if not token.is_empty():
		SettingsStore.settings["onboarding_completed"] = true
	SettingsStore.save_settings()
	AppState.clear_error()
	AppState.clear_notice()
	_render()

func _complete_onboarding(skip_remote: bool) -> void:
	var base_url := DEFAULT_GLOSC_BASE_URL
	if _onboarding_base_url != null and not _onboarding_base_url.text.strip_edges().is_empty():
		base_url = _onboarding_base_url.text.strip_edges()
	var token := ""
	if _onboarding_token != null:
		token = _onboarding_token.text.strip_edges()
	if not skip_remote and token.is_empty():
		AppState.set_error("请输入 Glosc AI Key；如果暂时没有，可以点击“获取 Glosc AI Key”。")
		AppState.clear_notice()
		_render()
		return
	var token_acknowledged := _onboarding_token_ack != null and _onboarding_token_ack.button_pressed
	if not SettingsStore.can_store_glosc_token(token, token_acknowledged):
		AppState.set_error("保存 Key 前需要确认本地保存风险。")
		AppState.clear_notice()
		_render()
		return
	SettingsStore.settings["glosc_provider"] = DEFAULT_GLOSC_PROVIDER
	SettingsStore.settings["glosc_base_url"] = base_url
	if not skip_remote:
		SettingsStore.settings["glosc_token"] = token
	if _onboarding_model != null and not _onboarding_model.text.strip_edges().is_empty():
		SettingsStore.settings["model"] = _onboarding_model.text.strip_edges()
	SettingsStore.settings["local_token_risk_acknowledged"] = token_acknowledged
	SettingsStore.settings["onboarding_completed"] = true
	SettingsStore.save_settings()
	AppState.clear_error()
	AppState.navigate_with_notice(&"main_menu", "初始化配置已完成。")

func _open_glosc_keys_page() -> void:
	var err := OS.shell_open(GLOSC_KEYS_URL)
	if err == OK:
		AppState.set_notice("已打开 Glosc AI Keys 页面。")
	else:
		DisplayServer.clipboard_set(GLOSC_KEYS_URL)
		AppState.set_error("无法打开浏览器，已复制链接：%s" % GLOSC_KEYS_URL)
	_render()

func _add_map_location_from_form() -> void:
	if _map_location_name == null:
		return
	var location_id := WorldStore.add_custom_location(
		_map_location_name.text,
		_map_location_type.text,
		_map_location_desc.text,
		Vector2(float(_map_location_x.value), float(_map_location_y.value))
	)
	if location_id.is_empty():
		AppState.set_error("地点名称不能为空。")
	else:
		_focused_location_id = location_id
		_map_editing_location_id = location_id
	_render()

func _import_map_image_from_form() -> void:
	if _map_image_path == null:
		return
	if WorldStore.import_map_image(_map_image_path.text.strip_edges(), "玩家地图"):
		AppState.set_notice("地图图片已导入。")
	else:
		AppState.set_error("地图图片导入失败。")
	_render()

func _generate_fantasy_map_from_sidebar() -> void:
	if WorldStore.generate_fantasy_map("Azgaar 风格大陆地图"):
		AppState.set_notice("幻想地图已生成。")
		_map_pan = Vector2.ZERO
		_map_zoom = 1.0
	else:
		AppState.set_error("幻想地图生成失败。")
	_render()

func _generate_fantasy_map_from_reference_form() -> void:
	if _map_image_path == null:
		return
	var path := _map_image_path.text.strip_edges()
	if path.is_empty():
		AppState.set_error("请先选择或输入参考图路径。")
		_render()
		return
	if WorldStore.generate_fantasy_map_from_reference(path, "参考图生成地图"):
		AppState.set_notice("已根据参考图生成地图。")
		_map_pan = Vector2.ZERO
		_map_zoom = 1.0
	else:
		AppState.set_error("参考图生成地图失败。")
	_render()

func _map_image_status_text(map_image: Dictionary) -> String:
	var width := int(map_image.get("width", 0))
	var height := int(map_image.get("height", 0))
	var generator := map_image.get("generator", {}) as Dictionary
	var generator_text := ""
	if not generator.is_empty():
		var mode_text := "参考图" if str(generator.get("mode", "")) == "reference_image" else str(generator.get("source_project", "FMG"))
		generator_text = " · %s · seed %d" % [mode_text, int(generator.get("seed", 0))]
	if bool(map_image.get("resized_for_device", false)):
		return "已优化为 %d x %d；原图 %d x %d%s。" % [
			width,
			height,
			int(map_image.get("original_width", width)),
			int(map_image.get("original_height", height)),
			generator_text
		]
	return "当前图片 %d x %d%s。" % [width, height, generator_text]

func _open_map_file_dialog() -> void:
	var dialog := FileDialog.new()
	dialog.title = "选择地图图片"
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.filters = PackedStringArray(["*.png, *.jpg, *.jpeg, *.webp ; Map Images"])
	dialog.size = Vector2i(900, 620)
	dialog.file_selected.connect(func(path: String) -> void:
		if _map_image_path:
			_map_image_path.text = path
		if WorldStore.import_map_image(path, "玩家地图"):
			AppState.set_notice("地图图片已导入。")
		else:
			AppState.set_error("地图图片导入失败。")
		_render()
	)
	_root.add_child(dialog)
	dialog.popup_centered()

func _open_zip_file_dialog() -> void:
	var dialog := FileDialog.new()
	dialog.title = "选择世界存档 ZIP"
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.filters = PackedStringArray(["*.zip ; Evolvria Save Archive"])
	dialog.size = Vector2i(900, 620)
	dialog.file_selected.connect(func(path: String) -> void:
		if _settings_import_zip:
			_settings_import_zip.text = path
		if WorldStore.load_imported_world(path):
			AppState.navigate_with_notice(&"exploration", "已导入：%s" % WorldStore.world.get("name", "未命名世界"))
		else:
			_render()
	)
	_root.add_child(dialog)
	dialog.popup_centered()

func _restore_backup_from_settings(backup_path: String) -> void:
	var payload := SaveManager.restore_backup(backup_path)
	if payload.is_empty():
		_render()
		return
	WorldStore.load_active_world()
	AppState.navigate_with_notice(&"exploration", "已恢复备份：%s" % backup_path.get_file())

func _backup_option_label(entry: Dictionary) -> String:
	var name := str(entry.get("world_name", "未知世界"))
	var day := int(entry.get("world_day", 0))
	var events := int(entry.get("event_count", 0))
	var size_kb := maxf(1.0, ceil(float(entry.get("size_bytes", 0)) / 1024.0))
	var validity := "" if bool(entry.get("schema_valid", false)) else " · 需检查"
	return "%s · 第 %d 天 · %d 事件 · %.0f KB%s" % [name, day, events, size_kb, validity]

func _update_map_location_from_form(location_id: String) -> void:
	if _map_location_name == null:
		return
	if not WorldStore.update_location(
		location_id,
		_map_location_name.text,
		_map_location_type.text,
		_map_location_desc.text,
		Vector2(float(_map_location_x.value), float(_map_location_y.value))
	):
		AppState.set_error("无法更新地点：%s" % location_id)
	else:
		_focused_location_id = location_id
		_map_editing_location_id = location_id
	_render()

func _fill_location_form(location: Dictionary) -> void:
	if _map_location_name == null:
		return
	_map_location_name.text = str(location.get("name", ""))
	_map_location_type.text = str(location.get("type", ""))
	_map_location_desc.text = str(location.get("description", ""))
	var position := location.get("position", {}) as Dictionary
	_map_location_x.value = float(position.get("x", 0.5))
	_map_location_y.value = float(position.get("y", 0.5))

func _build_world_seed_from_form() -> Dictionary:
	_sync_new_world_draft_from_form()
	return {
		"world_name": str(_new_world_draft.get("world_name", "")).strip_edges(),
		"genre": str(_new_world_draft.get("genre", "奇幻")),
		"tone": str(_new_world_draft.get("tone", "冒险")),
		"limits": str(_new_world_draft.get("limits", "")).strip_edges(),
		"hero": {
			"name": str(_new_world_draft.get("hero_name", "")).strip_edges(),
			"description": str(_new_world_draft.get("hero_identity", "")).strip_edges(),
			"goal": str(_new_world_draft.get("hero_goal", "")).strip_edges(),
			"ability": str(_new_world_draft.get("hero_ability", "")).strip_edges(),
			"weakness": str(_new_world_draft.get("hero_weakness", "")).strip_edges()
		},
		"key_characters": _parse_key_characters(str(_new_world_draft.get("key_characters", ""))),
		"narrative_detail": str(_new_world_draft.get("narrative_detail", "适中")),
		"npc_autonomy_frequency": str(_new_world_draft.get("npc_autonomy_frequency", "中频"))
	}

func _ensure_new_world_draft() -> void:
	if not _new_world_draft.is_empty():
		return
	var default_limits := str(SettingsStore.get_value("content_preferences", "")).strip_edges()
	if default_limits.is_empty():
		default_limits = "避免过度血腥；强调角色选择带来的长期后果。"
	_new_world_draft = {
		"world_name": "苍星纪元",
		"genre": "奇幻",
		"tone": "冒险",
		"hero_name": "艾林·星语",
		"hero_identity": "流浪剑客",
		"hero_goal": "寻找旧王朝失落档案",
		"hero_ability": "剑术,古文字,快速适应",
		"hero_weakness": "容易相信熟悉的人",
		"key_characters": "璃安 | 女主 | 同行 | 温和,谨慎 | 追查旧徽记来源 | 保护主角并暗中确认线索 | 温和但隐藏重要秘密\n赛拉 | 女二 | 竞争 | 果断,好胜 | 抢先找到灰烬档案 | 主动追踪遗迹并试探玩家 | 追求同一份档案\n诺维 | 女三 | 未知 | 圆滑,敏锐 | 掌握边境势力债务 | 收集情报后出售给最有利一方 | 熟悉边境势力\n维克托 | 男二 | 紧张 | 守序,固执 | 证明秩序比自由可靠 | 调动守望者封锁危险地点 | 相信秩序高于自由",
		"limits": default_limits,
		"narrative_detail": "适中",
		"npc_autonomy_frequency": "中频"
	}

func _sync_new_world_draft_from_form() -> void:
	_ensure_new_world_draft()
	if is_instance_valid(_world_name_input):
		_new_world_draft["world_name"] = _world_name_input.text.strip_edges()
	if is_instance_valid(_genre_input) and _genre_input.selected >= 0:
		_new_world_draft["genre"] = _genre_input.get_item_text(_genre_input.selected)
	if is_instance_valid(_tone_input) and _tone_input.selected >= 0:
		_new_world_draft["tone"] = _tone_input.get_item_text(_tone_input.selected)
	if is_instance_valid(_hero_name_input):
		_new_world_draft["hero_name"] = _hero_name_input.text.strip_edges()
	if is_instance_valid(_hero_identity_input):
		_new_world_draft["hero_identity"] = _hero_identity_input.text.strip_edges()
	if is_instance_valid(_hero_goal_input):
		_new_world_draft["hero_goal"] = _hero_goal_input.text.strip_edges()
	if is_instance_valid(_hero_ability_input):
		_new_world_draft["hero_ability"] = _hero_ability_input.text.strip_edges()
	if is_instance_valid(_hero_weakness_input):
		_new_world_draft["hero_weakness"] = _hero_weakness_input.text.strip_edges()
	if is_instance_valid(_key_characters_input):
		_new_world_draft["key_characters"] = _key_characters_input.text.strip_edges()
	if is_instance_valid(_limits_input):
		_new_world_draft["limits"] = _limits_input.text.strip_edges()
	if is_instance_valid(_narrative_detail_input) and _narrative_detail_input.selected >= 0:
		_new_world_draft["narrative_detail"] = _narrative_detail_input.get_item_text(_narrative_detail_input.selected)
	if is_instance_valid(_npc_frequency_input) and _npc_frequency_input.selected >= 0:
		_new_world_draft["npc_autonomy_frequency"] = _npc_frequency_input.get_item_text(_npc_frequency_input.selected)

func _new_world_step_indicator() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	var steps: Array[String] = ["世界设定", "主角", "关键角色", "偏好", "确认"]
	for index in range(steps.size()):
		var step_number := index + 1
		var selected := step_number == _new_world_step
		var done := step_number < _new_world_step
		var button_label := "%d %s" % [step_number, steps[index]]
		row.add_child(_button(button_label, func(target_step := step_number) -> void:
			_set_new_world_step(target_step)
		, selected, SUCCESS if done else Color.TRANSPARENT))
	box.add_child(row)
	box.add_child(_label("步骤 %d / %d · 可点击任一步骤返回修改" % [_new_world_step, NEW_WORLD_TOTAL_STEPS], 12, MUTED))
	return _panel(box, 10, Color(INFO, 0.04), BORDER)

func _new_world_step_footer() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var previous := _button("上一步", func() -> void:
		_set_new_world_step(_new_world_step - 1)
	, false)
	previous.disabled = _new_world_step <= 1 or _busy
	row.add_child(previous)
	var hint := _label("步骤 %d / %d" % [_new_world_step, NEW_WORLD_TOTAL_STEPS], 13, MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(hint)
	var next_label := "确认并开始扩写" if _new_world_step == NEW_WORLD_TOTAL_STEPS else "下一步"
	var next := _button(next_label, func() -> void:
		if _new_world_step >= NEW_WORLD_TOTAL_STEPS:
			_create_world_from_form()
		else:
			_set_new_world_step(_new_world_step + 1)
	, true)
	next.disabled = _busy
	row.add_child(next)
	return _panel(row, 10, BG_ALT, BORDER)

func _set_new_world_step(step: int) -> void:
	_sync_new_world_draft_from_form()
	_new_world_step = clampi(step, 1, NEW_WORLD_TOTAL_STEPS)
	_render()

func _new_world_preview_panel(seed: Dictionary, estimate: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label("确认世界设定", 18, FG))
	box.add_child(_label("AI 将基于这份概要扩写世界观、势力、地点和开局事件。", 12, MUTED))
	box.add_child(_preview_row("世界名称", str(seed.get("world_name", "未命名世界"))))
	box.add_child(_preview_row("类型", "%s · %s" % [seed.get("genre", ""), seed.get("tone", "")]))
	var hero := seed.get("hero", {}) as Dictionary
	box.add_child(_preview_row("主角", "%s — %s" % [hero.get("name", "主角"), hero.get("description", "身份未定")]))
	box.add_child(_preview_row("主角目标", str(hero.get("goal", "尚未设定"))))
	var character_names: Array[String] = []
	for character in seed.get("key_characters", []):
		var data := character as Dictionary
		var name := str(data.get("name", "")).strip_edges()
		if not name.is_empty():
			character_names.append(name)
	box.add_child(_preview_row("关键角色", ", ".join(character_names) if not character_names.is_empty() else "暂无关键角色"))
	box.add_child(_preview_row("AI 行为", "%s · NPC %s" % [seed.get("narrative_detail", "适中"), seed.get("npc_autonomy_frequency", "中频")]))
	box.add_child(_preview_row("预计 AI 调用", AIService.estimate_usage_text(estimate)))
	box.add_child(_label("确认后会按设置触发 Glosc One 或本地回退；取消/失败不会覆盖当前世界状态。", 11, INFO))
	return _panel(box, 14, Color(INFO, 0.06), INFO)

func _preview_row(title: String, value: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var title_label := _label(title, 12, MUTED)
	title_label.custom_minimum_size = Vector2(92, 0)
	row.add_child(title_label)
	var value_label := _label(value, 12, FG)
	value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(value_label)
	return row

func _parse_key_characters(text: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for line in text.split("\n", false):
		var parts := line.split("|", false)
		if parts.is_empty():
			continue
		var character := {
			"name": parts[0].strip_edges(),
			"role": parts[1].strip_edges() if parts.size() > 1 else "关键角色",
			"relationship": parts[2].strip_edges() if parts.size() > 2 else "未知",
			"description": "仍有许多未知之处。"
		}
		if parts.size() >= 7:
			character["personality"] = parts[3].strip_edges()
			character["goal"] = parts[4].strip_edges()
			character["secret"] = parts[4].strip_edges()
			character["action_tendency"] = parts[5].strip_edges()
			character["description"] = parts[6].strip_edges()
		elif parts.size() > 3:
			character["description"] = parts[3].strip_edges()
		result.append(character)
	return result

func _append_key_character_template() -> void:
	if _key_characters_input == null:
		return
	var next_index := _key_characters_input.text.split("\n", false).size() + 1
	var line := "新角色%d | 关键角色 | 未知 | 谨慎,执着 | 尚未公开的目标 | 观察局势后行动 | 仍有许多未知之处。" % next_index
	if not _key_characters_input.text.strip_edges().is_empty():
		_key_characters_input.text += "\n"
	_key_characters_input.text += line
	_key_characters_input.grab_focus()

func _append_main_cast_templates() -> void:
	if _key_characters_input == null:
		return
	var templates: Array[String] = [
		"新女主 | 女主 | 同行 | 温柔,坚韧 | 守护某个未公开承诺 | 在危险时优先保护主角 | 与主角的命运线紧密相连",
		"新女二 | 女二 | 竞争 | 锋利,独立 | 证明自己不需要被任何阵营定义 | 主动争夺关键线索 | 和主角既竞争又互相吸引",
		"新女三 | 女三 | 未知 | 灵动,敏锐 | 隐瞒自己真正的归属 | 收集情报并交换利益 | 常在关键时刻带来新情报",
		"新男二 | 男二 | 紧张 | 守序,执着 | 维护一个逐渐失效的旧秩序 | 组织人手封锁危险地点 | 既可能成为对手也可能成为盟友"
	]
	for line in templates:
		if not _key_characters_input.text.strip_edges().is_empty():
			_key_characters_input.text += "\n"
		_key_characters_input.text += line
	_key_characters_input.grab_focus()

func _page() -> VBoxContainer:
	var page := VBoxContainer.new()
	page.set_anchors_preset(Control.PRESET_FULL_RECT)
	page.add_theme_constant_override("separation", 0)
	_root.add_child(page)
	return page

func _top_bar(title: String, back_text: String, callback: Callable) -> Control:
	var bar := HBoxContainer.new()
	bar.custom_minimum_size = Vector2(0, 58)
	bar.add_theme_constant_override("separation", 12)
	bar.add_theme_stylebox_override("panel", _style(BG, BORDER, 0))
	var title_label := _label(title, 22, FG)
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(title_label)
	bar.add_child(_button(back_text, callback, false))
	return _padded(bar, 14)

func _screen_header(title: String, subtitle: String) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_label(title, 22, FG))
	left.add_child(_label(subtitle, 13, MUTED))
	box.add_child(left)
	var shortcuts := HFlowContainer.new()
	shortcuts.add_theme_constant_override("h_separation", 8)
	shortcuts.add_theme_constant_override("v_separation", 8)
	shortcuts.add_child(_button("地图", func() -> void: AppState.navigate(&"map"), false, Color.TRANSPARENT, true))
	shortcuts.add_child(_button("地点", func() -> void: AppState.navigate(&"locations"), false, Color.TRANSPARENT, true))
	shortcuts.add_child(_button("人物", func() -> void: AppState.navigate(&"characters"), false, Color.TRANSPARENT, true))
	shortcuts.add_child(_button("时间线", func() -> void: AppState.navigate(&"timeline"), false, Color.TRANSPARENT, true))
	shortcuts.add_child(_button("线索", func() -> void: AppState.navigate(&"threads"), false, Color.TRANSPARENT, true))
	shortcuts.add_child(_button("世界观", func() -> void: AppState.navigate(&"world_lore"), false, Color.TRANSPARENT, true))
	box.add_child(shortcuts)
	return _padded(box, 14)

func _nav_panel() -> Control:
	var nav := VBoxContainer.new()
	nav.custom_minimum_size = Vector2(196, 0)
	nav.size_flags_vertical = Control.SIZE_EXPAND_FILL
	nav.add_theme_constant_override("separation", 8)
	nav.add_theme_stylebox_override("panel", _style(BG_ALT, BORDER, 0))
	nav.add_child(_label("Evolvria", 24, FG, HORIZONTAL_ALIGNMENT_CENTER))
	nav.add_child(_label(str(WorldStore.world.get("name", "")), 12, MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	nav.add_child(_separator(""))
	var routes := [
		["探索", &"exploration"],
		["地图", &"map"],
		["地点", &"locations"],
		["人物", &"characters"],
		["时间线", &"timeline"],
		["线索", &"threads"],
		["世界观", &"world_lore"],
		["设置", &"settings"]
	]
	for item in routes:
		var route := item[1] as StringName
		nav.add_child(_button(str(item[0]), func(r := route) -> void:
			if r == &"settings":
				_route_before_settings = AppState.current_route
			AppState.navigate(r)
		, AppState.current_route == route))
	return _padded(nav, 14)

func _context_panel() -> Control:
	var panel := VBoxContainer.new()
	panel.custom_minimum_size = Vector2(_context_panel_width(), 0)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_constant_override("separation", 14)
	panel.add_child(_section_title("同行角色", "同行会随你移动，并进入下一次 AI 上下文。"))
	var companions := WorldStore.get_companions()
	if companions.is_empty():
		panel.add_child(_label("暂无同行角色。可在人物名册中邀请角色同行。", 12, MUTED))
	else:
		for companion in companions:
			panel.add_child(_mini_character(companion))
	panel.add_child(_section_title("当前可见", "同地点但未同行的角色。"))
	var visible_count := 0
	for character in WorldStore.characters:
		var data := character as Dictionary
		if str(data.get("id", "")) == "char_hero" or bool(data.get("is_companion", false)):
			continue
		if str(data.get("current_location_id", "")) == str(WorldStore.get_current_location().get("id", "")):
			panel.add_child(_mini_character(data))
			visible_count += 1
	if visible_count == 0:
		panel.add_child(_label("没有其他可见角色。", 12, MUTED))
	panel.add_child(_section_title("附近地点", "按预计移动时间排序，路线会进入下一次 AI 上下文。"))
	var nearby := WorldStore.get_nearby_locations(str(WorldStore.get_current_location().get("id", "")), 4)
	if nearby.is_empty():
		panel.add_child(_label("暂无可达地点。", 12, MUTED))
	else:
		for location in nearby:
			panel.add_child(_nearby_location_line(location))
	panel.add_child(_section_title("近期事件", "最近三条写入时间线的记录。"))
	var recent := WorldStore.timeline.slice(maxi(0, WorldStore.timeline.size() - 3), WorldStore.timeline.size())
	for event in recent:
		var data := event as Dictionary
		panel.add_child(_label("• %s" % data.get("title", ""), 13, MUTED))
	return _padded(panel, 16)

func _nearby_location_line(location: Dictionary) -> Control:
	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 2)
	var route_text := " · %s" % location.get("route_name", "") if bool(location.get("has_route", false)) else " · 直线估算"
	row.add_child(_label("%s · 约 %d 小时%s" % [
		location.get("name", "未知地点"),
		int(location.get("travel_hours", 0)),
		route_text
	], 13, FG))
	var tags: Array = location.get("state_tags", [])
	row.add_child(_label("%s · 控制：%s%s" % [
		location.get("type", "unknown"),
		WorldStore.faction_name(str(location.get("controlling_faction_id", ""))),
		" · 标签 %s" % ", ".join(tags) if not tags.is_empty() else ""
	], 11, MUTED))
	return _panel(row, 8, Color(INFO, 0.05), BORDER)

func _bottom_nav() -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 56)
	row.add_theme_constant_override("separation", 8)
	for item in [["探索", &"exploration"], ["地图", &"map"], ["地点", &"locations"], ["人物", &"characters"], ["时间线", &"timeline"], ["设置", &"settings"]]:
		var route := item[1] as StringName
		var btn := _button(str(item[0]), func(r := route) -> void:
			if r == &"settings":
				_route_before_settings = AppState.current_route
			AppState.navigate(r)
		, AppState.current_route == route, Color.TRANSPARENT, true)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(btn)
	return _padded(row, 8)

func _add_mobile_bottom_nav(parent: Node) -> void:
	if _wide() or not WorldStore.has_world():
		return
	parent.add_child(_bottom_nav())

func _suggested_actions_bar() -> Control:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	if WorldStore.suggested_actions.is_empty():
		return row
	_suggested_action_index = clampi(_suggested_action_index, 0, WorldStore.suggested_actions.size() - 1)
	for index in range(WorldStore.suggested_actions.size()):
		var action := str(WorldStore.suggested_actions[index])
		var btn := _button(action, func(action_index := index) -> void:
			_select_suggested_action(action_index)
		, index == _suggested_action_index)
		btn.tooltip_text = "Tab 循环选择，数字键 1-9 可直接选择。"
		row.add_child(btn)
	return row

func _map_sidebar() -> Control:
	var sidebar := VBoxContainer.new()
	sidebar.custom_minimum_size = Vector2(340, 0) if _wide() else Vector2(0, 360)
	sidebar.add_theme_constant_override("separation", 10)
	sidebar.add_child(_section_title("地图图片", "输入 PNG/JPG/WebP 路径作为底图；导出 ZIP 时会一并打包。"))
	sidebar.add_child(_button("进入地图主视图", func() -> void:
		_toggle_map_focus_mode()
	, false, INFO))
	var current_map := WorldStore.world.get("map_image", {}) as Dictionary
	_map_image_path = _line_edit(str(current_map.get("image_path", "user://my_map.png")))
	sidebar.add_child(_field("图片路径", _map_image_path))
	if not current_map.is_empty():
		sidebar.add_child(_label(_map_image_status_text(current_map), 12, INFO if bool(current_map.get("resized_for_device", false)) else MUTED))
	sidebar.add_child(_button("选择地图图片", func() -> void:
		_open_map_file_dialog()
	, false))
	sidebar.add_child(_button("导入地图图片", func() -> void:
		_import_map_image_from_form()
	, false))
	sidebar.add_child(_button("生成幻想地图", func() -> void:
		_generate_fantasy_map_from_sidebar()
	, false, SUCCESS))
	sidebar.add_child(_button("从参考图生成地图", func() -> void:
		_generate_fantasy_map_from_reference_form()
	, false, INFO))
	var zoom_row := HBoxContainer.new()
	zoom_row.add_theme_constant_override("separation", 6)
	zoom_row.add_child(_button("缩小", func() -> void: _set_map_zoom(_map_zoom - 0.15), false))
	zoom_row.add_child(_button("重置", func() -> void: _set_map_zoom(1.0), false))
	zoom_row.add_child(_button("放大", func() -> void: _set_map_zoom(_map_zoom + 0.15), false))
	sidebar.add_child(_field("缩放 %.0f%%" % (_map_zoom * 100.0), zoom_row))
	var pan_row := HBoxContainer.new()
	pan_row.add_theme_constant_override("separation", 6)
	pan_row.add_child(_button("←", func() -> void: _pan_map_by(Vector2(48, 0)), false))
	pan_row.add_child(_button("↑", func() -> void: _pan_map_by(Vector2(0, 48)), false))
	pan_row.add_child(_button("↓", func() -> void: _pan_map_by(Vector2(0, -48)), false))
	pan_row.add_child(_button("→", func() -> void: _pan_map_by(Vector2(-48, 0)), false))
	pan_row.add_child(_button("居中", func() -> void:
		_map_pan = Vector2.ZERO
		_render()
	, false))
	sidebar.add_child(_field("平移（方向键/WASD）", pan_row))
	sidebar.add_child(_label("手柄十字键也可平移地图；肩键缩放，左右摇杆按钮分别添加标记/切换主视图。", 11, MUTED))
	var unknown_count := WorldStore.locations.size() - WorldStore.get_visible_locations(false).size()
	var reveal_text := "隐藏未知地点" if _map_reveal_unknown_locations else "显示未知地点"
	sidebar.add_child(_button("%s（%d）" % [reveal_text, unknown_count], func() -> void:
		_map_reveal_unknown_locations = not _map_reveal_unknown_locations
		_render()
	, false, WARN if _map_reveal_unknown_locations else Color.TRANSPARENT))
	var focused_location := _map_focused_location(_map_reveal_unknown_locations)
	if not focused_location.is_empty():
		sidebar.add_child(_section_title("地点详情", "点击地图标记或地点列表先查看详情，再决定是否移动。"))
		sidebar.add_child(_location_card(focused_location, true))
	sidebar.add_child(_map_routes_panel())
	sidebar.add_child(_section_title("已知地点", "点击地点查看详情；移动按钮会推进世界时间。"))
	for location in WorldStore.get_visible_locations(_map_reveal_unknown_locations):
		var loc := location as Dictionary
		var loc_id := str(loc.get("id", ""))
		var hidden_badge := " · 未知" if not WorldStore.is_location_known(loc) else ""
		var btn := _button("%s · %s" % [loc.get("name", ""), loc.get("type", "")], func(id := str(loc.get("id", ""))) -> void:
			_focus_map_location(id)
		, loc_id == str(focused_location.get("id", "")))
		sidebar.add_child(btn)
		sidebar.add_child(_label("控制：%s%s" % [WorldStore.faction_name(str(loc.get("controlling_faction_id", ""))), hidden_badge], 11, MUTED))
		var actions := HBoxContainer.new()
		actions.add_theme_constant_override("separation", 6)
		actions.add_child(_button("载入表单", func(id := loc_id) -> void:
			_map_editing_location_id = id
			_focus_map_location(id)
		, false))
		actions.add_child(_button("更新", func(id := str(loc.get("id", ""))) -> void:
			_update_map_location_from_form(id)
		, false))
		actions.add_child(_button("删除", func(id := str(loc.get("id", ""))) -> void:
			if not WorldStore.delete_location(id):
				AppState.set_error("无法删除当前地点、起点或有角色停留的地点。")
			_render()
		, false, DANGER))
		sidebar.add_child(actions)
	var editing_location := WorldStore.get_location(_map_editing_location_id)
	var form_title := "编辑标记" if not editing_location.is_empty() else "添加标记"
	var form_hint := "右键地图标记或点击载入表单可编辑已有地点；点击空白地图或移动端长按地图可填入归一化坐标。"
	sidebar.add_child(_section_title(form_title, form_hint))
	_map_location_name = _line_edit(str(editing_location.get("name", "风铃渡口")))
	sidebar.add_child(_field("地点名称", _map_location_name))
	_map_location_type = _line_edit(str(editing_location.get("type", "town / ruin / forest / danger")))
	sidebar.add_child(_field("类型", _map_location_type))
	_map_location_desc = _text_edit(str(editing_location.get("description", "这里需要玩家或 AI 进一步补全背景。")), 70)
	sidebar.add_child(_field("描述", _map_location_desc))
	var coordinate_row := HBoxContainer.new()
	coordinate_row.add_theme_constant_override("separation", 8)
	var editing_position: Dictionary = editing_location.get("position", {}) if editing_location.get("position", {}) is Dictionary else {}
	_map_location_x = _spin(float(editing_position.get("x", 0.5)), 0.05, 0.95, 0.01)
	coordinate_row.add_child(_field("X", _map_location_x))
	_map_location_y = _spin(float(editing_position.get("y", 0.5)), 0.05, 0.95, 0.01)
	coordinate_row.add_child(_field("Y", _map_location_y))
	sidebar.add_child(coordinate_row)
	var form_actions := HBoxContainer.new()
	form_actions.add_theme_constant_override("separation", 6)
	if editing_location.is_empty():
		form_actions.add_child(_button("添加地点标记", func() -> void:
			_add_map_location_from_form()
		, true))
	else:
		form_actions.add_child(_button("更新地点标记", func(id := str(editing_location.get("id", ""))) -> void:
			_update_map_location_from_form(id)
		, true))
		form_actions.add_child(_button("新建标记", func() -> void:
			_map_editing_location_id = ""
			_render()
		, false))
	sidebar.add_child(form_actions)
	return sidebar

func _map_focus_panel() -> Control:
	var panel := VBoxContainer.new()
	panel.add_theme_constant_override("separation", 10)
	var title := "地图主视图"
	var hint := "地图已独立作为主视图；F 可切换，滚轮/双指缩放，方向键/WASD 平移，P 在中心填入标记坐标。"
	panel.add_child(_section_title(title, hint))
	var controls := HFlowContainer.new()
	controls.add_theme_constant_override("h_separation", 8)
	controls.add_theme_constant_override("v_separation", 8)
	controls.add_child(_button("退出主视图", func() -> void:
		_toggle_map_focus_mode()
	, true))
	controls.add_child(_button("缩小", func() -> void: _set_map_zoom(_map_zoom - 0.15), false))
	controls.add_child(_button("重置", func() -> void: _set_map_zoom(1.0), false))
	controls.add_child(_button("放大", func() -> void: _set_map_zoom(_map_zoom + 0.15), false))
	controls.add_child(_button("居中", func() -> void:
		_map_pan = Vector2.ZERO
		_render()
	, false))
	controls.add_child(_button("显示未知地点（%d）" % (WorldStore.locations.size() - WorldStore.get_visible_locations(false).size()), func() -> void:
		_map_reveal_unknown_locations = not _map_reveal_unknown_locations
		_render()
	, _map_reveal_unknown_locations))
	panel.add_child(controls)
	var focused_location := _map_focused_location(_map_reveal_unknown_locations)
	if not focused_location.is_empty():
		panel.add_child(_label("当前详情：%s · %s" % [focused_location.get("name", ""), focused_location.get("type", "")], 13, FG))
		panel.add_child(_label(str(focused_location.get("description", "")), 12, MUTED))
	return _panel(panel, 12, Color(INFO, 0.06), BORDER)

func _map_focused_location(include_unknown: bool = false) -> Dictionary:
	var location_id := _focused_location_id
	if location_id.is_empty():
		location_id = str(WorldStore.get_current_location().get("id", ""))
	var location := WorldStore.get_location(location_id)
	if not location.is_empty() and (include_unknown or WorldStore.is_location_known(location)):
		return location
	var visible_locations := WorldStore.get_visible_locations(include_unknown)
	if visible_locations.is_empty():
		return {}
	return visible_locations[0]

func _focus_map_location(location_id: String) -> void:
	if WorldStore.get_location(location_id).is_empty():
		return
	_focused_location_id = location_id
	_render()

func _map_marker(location: Dictionary) -> Control:
	var position := location.get("position", {}) as Dictionary
	var location_id := str(location.get("id", ""))
	var selected := location_id == str(WorldStore.get_current_location().get("id", "")) or location_id == _focused_location_id
	var known := WorldStore.is_location_known(location)
	var marker := PanelContainer.new()
	marker.name = "MapMarker_%s" % location_id
	marker.mouse_filter = Control.MOUSE_FILTER_STOP
	marker.tooltip_text = "单击查看详情，拖动调整标记坐标，右键载入编辑表单"
	marker.custom_minimum_size = Vector2(128, 34) if _wide() else Vector2(96, 34)
	marker.size = marker.custom_minimum_size
	var marker_fill := ACCENT if selected else (SURFACE if known else Color(BORDER, 0.35))
	var marker_border := ACCENT if selected else (BORDER if known else WARN)
	marker.add_theme_stylebox_override("panel", _style(marker_fill, marker_border, 8, 8))
	var label_text := str(location.get("name", "")) if known else "未知地点"
	var label := _label(label_text, 12, Color.WHITE if selected else (FG if known else WARN), HORIZONTAL_ALIGNMENT_CENTER)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.custom_minimum_size = marker.custom_minimum_size - Vector2(16, 0)
	marker.add_child(label)
	var map_size := _map_canvas_size()
	marker.position = Vector2(float(position.get("x", 0.5)) * map_size.x, float(position.get("y", 0.5)) * map_size.y)
	marker.z_index = 5 if selected else 3
	marker.gui_input.connect(_on_location_marker_gui_input.bind(location_id, marker))
	return marker

func _on_location_marker_gui_input(event: InputEvent, location_id: String, marker: Control) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_RIGHT and mouse_event.pressed:
			_focused_location_id = location_id
			_map_editing_location_id = location_id
			_render()
			marker.accept_event()
			return
		if mouse_event.button_index != MOUSE_BUTTON_LEFT:
			return
		if mouse_event.pressed:
			_begin_location_marker_drag(location_id)
			marker.accept_event()
		else:
			_finish_location_marker_drag(location_id, marker)
			marker.accept_event()
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if _location_marker_drag_id == location_id:
			_move_location_marker(marker, motion.relative)
			marker.accept_event()
	elif event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_begin_location_marker_drag(location_id)
			marker.accept_event()
		else:
			_finish_location_marker_drag(location_id, marker)
			marker.accept_event()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _location_marker_drag_id == location_id:
			_move_location_marker(marker, drag.relative)
			marker.accept_event()

func _begin_location_marker_drag(location_id: String) -> void:
	_location_marker_drag_id = location_id
	_location_marker_drag_moved = false
	_map_dragging = false

func _move_location_marker(marker: Control, delta: Vector2) -> void:
	if delta.length() > 1.5:
		_location_marker_drag_moved = true
	var map_size := _map_canvas_size()
	marker.position = Vector2(
		clampf(marker.position.x + delta.x, map_size.x * 0.05, map_size.x * 0.95),
		clampf(marker.position.y + delta.y, map_size.y * 0.05, map_size.y * 0.95)
	)

func _finish_location_marker_drag(location_id: String, marker: Control) -> void:
	if _location_marker_drag_id != location_id:
		return
	_location_marker_drag_id = ""
	if _location_marker_drag_moved:
		var map_size := _map_canvas_size()
		var normalized := Vector2(
			clampf(marker.position.x / maxf(map_size.x, 1.0), 0.05, 0.95),
			clampf(marker.position.y / maxf(map_size.y, 1.0), 0.05, 0.95)
		)
		if not WorldStore.update_location_position(location_id, normalized):
			AppState.set_error("无法移动地点标记：%s" % location_id)
		_render()
	else:
		_focused_location_id = location_id
		_render()

func _map_routes_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_section_title("路线", "路线会影响移动耗时，危险路线会增加时间。"))
	var routes := WorldStore.get_map_routes()
	if routes.is_empty():
		box.add_child(_label("还没有路线。可从当前位置向其他地点快速添加。", 12, MUTED))
	else:
		for route in routes:
			box.add_child(_map_route_row(route))
	var current_location_id := str(WorldStore.get_current_location().get("id", ""))
	var add_row := HFlowContainer.new()
	add_row.add_theme_constant_override("h_separation", 6)
	add_row.add_theme_constant_override("v_separation", 6)
	for location in WorldStore.get_visible_locations(_map_reveal_unknown_locations):
		var location_id := str(location.get("id", ""))
		if location_id == current_location_id or not WorldStore.get_route_between(current_location_id, location_id).is_empty():
			continue
		add_row.add_child(_button("连到%s" % location.get("name", "地点"), func(target_id := location_id) -> void:
			if not WorldStore.add_map_route(current_location_id, target_id):
				AppState.set_error("无法添加路线。")
			_render()
		, false))
	box.add_child(add_row)
	return _panel(box, 12, Color(INFO, 0.05), BORDER)

func _map_route_row(route: Dictionary) -> Control:
	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 5)
	var from_name := _location_name(str(route.get("from_location_id", "")))
	var to_name := _location_name(str(route.get("to_location_id", "")))
	row.add_child(_label("%s · %s -> %s" % [route.get("name", "路线"), from_name, to_name], 13, FG))
	row.add_child(_label("%s · 危险 %.0f%%" % [route.get("type", "road"), float(route.get("danger", 0.0)) * 100.0], 11, MUTED))
	row.add_child(_button("删除路线", func(id := str(route.get("id", ""))) -> void:
		if not WorldStore.delete_map_route(id):
			AppState.set_error("无法删除路线。")
		_render()
	, false, DANGER))
	return row

func _npc_marker(character: Dictionary, location: Dictionary) -> Label:
	var position := location.get("position", {}) as Dictionary
	var label := _label("◆ %s" % character.get("name", ""), 12, INFO)
	var map_size := _map_canvas_size()
	label.position = Vector2(float(position.get("x", 0.5)) * map_size.x + 18.0, float(position.get("y", 0.5)) * map_size.y + 38.0)
	return label

func _add_map_image(parent: Control) -> void:
	var map_image := WorldStore.world.get("map_image", {}) as Dictionary
	var image_path := str(map_image.get("image_path", ""))
	if image_path.is_empty() or not FileAccess.file_exists(image_path):
		return
	var image := Image.new()
	if image.load(image_path) != OK:
		return
	var texture := ImageTexture.create_from_image(image)
	var texture_rect := TextureRect.new()
	texture_rect.texture = texture
	texture_rect.stretch_mode = TextureRect.STRETCH_SCALE
	texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	texture_rect.modulate = Color(1, 1, 1, 0.78)
	texture_rect.position = Vector2.ZERO
	texture_rect.size = _map_canvas_size()
	parent.add_child(texture_rect)

func _add_map_grid(parent: Control) -> void:
	var map_size := _map_canvas_size()
	for x in range(0, int(map_size.x) + 60, 60):
		var line := ColorRect.new()
		line.color = Color(BORDER, 0.3)
		line.position = Vector2(x, 0)
		line.size = Vector2(1, map_size.y)
		parent.add_child(line)
	for y in range(0, int(map_size.y) + 60, 60):
		var line := ColorRect.new()
		line.color = Color(BORDER, 0.3)
		line.position = Vector2(0, y)
		line.size = Vector2(map_size.x, 1)
		parent.add_child(line)
	var label := _label("回声林 / 灰烬档案馆 / 白塔城", 12, Color(MUTED, 0.55))
	label.position = Vector2(24, 24)
	parent.add_child(label)

func _add_map_routes(parent: Control, include_unknown: bool = false) -> void:
	var map_size := _map_canvas_size()
	for route in WorldStore.get_map_routes():
		var from_location := WorldStore.get_location(str(route.get("from_location_id", "")))
		var to_location := WorldStore.get_location(str(route.get("to_location_id", "")))
		if from_location.is_empty() or to_location.is_empty():
			continue
		if not include_unknown and (not WorldStore.is_location_known(from_location) or not WorldStore.is_location_known(to_location)):
			continue
		var from_position := from_location.get("position", {}) as Dictionary
		var to_position := to_location.get("position", {}) as Dictionary
		var start := Vector2(float(from_position.get("x", 0.5)) * map_size.x, float(from_position.get("y", 0.5)) * map_size.y)
		var end := Vector2(float(to_position.get("x", 0.5)) * map_size.x, float(to_position.get("y", 0.5)) * map_size.y)
		var line := Line2D.new()
		line.points = PackedVector2Array([start, end])
		line.width = 4.0
		line.default_color = Color(ACCENT, 0.62) if float(route.get("danger", 0.0)) < 0.5 else Color(WARN, 0.72)
		line.z_index = 1
		parent.add_child(line)

func _on_map_view_gui_input(event: InputEvent, map_view: Control) -> void:
	if event is InputEventMouseButton:
		_handle_map_mouse_button(event as InputEventMouseButton)
	elif event is InputEventMouseMotion:
		_handle_map_mouse_motion(event as InputEventMouseMotion)
	elif event is InputEventScreenTouch:
		_handle_map_touch(event as InputEventScreenTouch)
	elif event is InputEventScreenDrag:
		_handle_map_drag(event as InputEventScreenDrag)

func _handle_map_mouse_button(event: InputEventMouseButton) -> void:
	if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
		_zoom_map_around(event.position, _map_zoom + 0.1)
		return
	if event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
		_zoom_map_around(event.position, _map_zoom - 0.1)
		return
	if event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_map_dragging = true
		_map_drag_start = event.position
		_map_drag_last = event.position
		_map_drag_moved = false
	else:
		if _map_dragging and not _map_drag_moved:
			_fill_location_coordinates(event.position)
		_map_dragging = false

func _handle_map_mouse_motion(event: InputEventMouseMotion) -> void:
	if not _map_dragging:
		return
	var delta := event.position - _map_drag_last
	if delta.length() > 1.5:
		_map_drag_moved = true
	_map_drag_last = event.position
	_map_pan += delta
	_map_pan = _clamped_map_pan()
	_render()

func _handle_map_touch(event: InputEventScreenTouch) -> void:
	if event.pressed:
		_touch_points[event.index] = event.position
		if _touch_points.size() == 1:
			_map_dragging = true
			_map_drag_start = event.position
			_map_drag_last = event.position
			_map_drag_moved = false
			_map_touch_started_at_msec = Time.get_ticks_msec()
		elif _touch_points.size() == 2:
			_map_touch_started_at_msec = 0
			_last_pinch_distance = _current_pinch_distance()
	else:
		var press_duration := Time.get_ticks_msec() - _map_touch_started_at_msec if _map_touch_started_at_msec > 0 else 0
		if _touch_points.has(event.index):
			_touch_points.erase(event.index)
		if _touch_points.is_empty():
			if _map_dragging and not _map_drag_moved:
				if press_duration >= MAP_LONG_PRESS_MS:
					_prepare_new_location_marker_from_map(event.position)
				else:
					_fill_location_coordinates(event.position)
			_map_dragging = false
			_map_touch_started_at_msec = 0
			_last_pinch_distance = 0.0

func _handle_map_drag(event: InputEventScreenDrag) -> void:
	_touch_points[event.index] = event.position
	if _touch_points.size() >= 2:
		var distance := _current_pinch_distance()
		if _last_pinch_distance > 1.0 and distance > 1.0:
			var center := _current_pinch_center()
			_zoom_map_around(center, _map_zoom * (distance / _last_pinch_distance))
		_last_pinch_distance = distance
		return
	var delta := event.relative
	if delta.length() > 1.5:
		_map_drag_moved = true
	_map_pan += delta
	_map_pan = _clamped_map_pan()
	_render()

func _fill_location_coordinates(view_position: Vector2) -> void:
	if _map_location_x == null or _map_location_y == null:
		return
	var map_position := view_position - _map_pan
	var size := _map_canvas_size()
	_map_location_x.value = clampf(map_position.x / maxf(size.x, 1.0), 0.05, 0.95)
	_map_location_y.value = clampf(map_position.y / maxf(size.y, 1.0), 0.05, 0.95)

func _prepare_new_location_marker_from_map(view_position: Vector2) -> void:
	_map_editing_location_id = ""
	_fill_location_coordinates(view_position)
	if _map_location_name != null:
		_map_location_name.grab_focus()
	AppState.set_notice("已通过长按定位新标记坐标。")

func _toggle_map_focus_mode() -> void:
	_map_focus_mode = not _map_focus_mode
	_map_pan = _clamped_map_pan()
	AppState.set_notice("已%s地图主视图。" % ("进入" if _map_focus_mode else "退出"))
	_render()

func _set_map_zoom(value: float) -> void:
	_map_zoom = clampf(value, 0.65, 1.75)
	_map_pan = _clamped_map_pan()
	_render()

func _pan_map_by(delta: Vector2) -> void:
	_map_pan += delta
	_map_pan = _clamped_map_pan()
	_render()

func _zoom_map_around(view_position: Vector2, new_zoom: float) -> void:
	var old_zoom := _map_zoom
	var clamped_zoom := clampf(new_zoom, 0.65, 1.75)
	if is_equal_approx(old_zoom, clamped_zoom):
		return
	var map_point := (view_position - _map_pan) / maxf(old_zoom, 0.01)
	_map_zoom = clamped_zoom
	_map_pan = view_position - map_point * _map_zoom
	_map_pan = _clamped_map_pan()
	_render()

func _map_canvas_size() -> Vector2:
	if _map_focus_mode:
		var focus_size := _map_focus_view_size()
		return Vector2(maxf(focus_size.x, 920.0), maxf(focus_size.y, 620.0)) * _map_zoom
	var base := Vector2(640, 500) if _wide() else Vector2(320, 380)
	return base * _map_zoom

func _map_view_size() -> Vector2:
	if _map_focus_mode:
		return _map_focus_view_size()
	return Vector2(520, 480) if _wide() else Vector2(300, 420)

func _map_focus_view_size() -> Vector2:
	var window_size := get_window().size
	var width := maxf(300.0, float(window_size.x) - 64.0)
	var reserved_height := 190.0 if _wide() else 250.0
	var height := maxf(360.0, float(window_size.y) - reserved_height)
	return Vector2(width, height)

func _clamped_map_pan() -> Vector2:
	var view_size := _map_view_size()
	var canvas_size := _map_canvas_size()
	var min_x := minf(0.0, view_size.x - canvas_size.x)
	var min_y := minf(0.0, view_size.y - canvas_size.y)
	return Vector2(clampf(_map_pan.x, min_x, 0.0), clampf(_map_pan.y, min_y, 0.0))

func _current_pinch_distance() -> float:
	if _touch_points.size() < 2:
		return 0.0
	var points := _touch_points.values()
	return (points[0] as Vector2).distance_to(points[1] as Vector2)

func _current_pinch_center() -> Vector2:
	var points := _touch_points.values()
	if points.size() < 2:
		return Vector2.ZERO
	return ((points[0] as Vector2) + (points[1] as Vector2)) * 0.5

func _summary_status_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var summaries: Array = WorldStore.world.get("phase_summaries", [])
	var cursor := int(WorldStore.world.get("summary_event_cursor", 0))
	var pending := maxi(0, WorldStore.timeline.size() - cursor)
	box.add_child(_label("阶段摘要与长期记忆", 18, FG))
	box.add_child(_label("已整理 %d / %d 条事件；待整理 %d 条。" % [cursor, WorldStore.timeline.size(), pending], 13, MUTED))
	if summaries.is_empty():
		box.add_child(_label("还没有阶段摘要。事件足够多时会自动整理，也可以手动整理当前阶段。", 13, MUTED))
	else:
		var start := maxi(0, summaries.size() - 3)
		for item in summaries.slice(start, summaries.size()):
			var summary := item as Dictionary
			box.add_child(_label(str(summary.get("text", "")), 13, FG))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var summarize_btn := _button("整理阶段摘要", func() -> void:
		if WorldStore.refresh_summaries(true):
			AppState.set_notice("阶段摘要已更新。")
		else:
			AppState.set_notice("当前没有新的事件需要整理。")
		_render()
	, true)
	summarize_btn.disabled = WorldStore.timeline.is_empty()
	row.add_child(summarize_btn)
	var ai_summary_btn := _button("AI 整理阶段摘要", func() -> void:
		_run_summary_update_from_ui()
	, false)
	ai_summary_btn.disabled = WorldStore.timeline.is_empty()
	row.add_child(ai_summary_btn)
	var extract_btn := _button("抽取最近事件记忆", func() -> void:
		_run_memory_extract_from_ui()
	, false)
	extract_btn.disabled = WorldStore.timeline.is_empty()
	row.add_child(extract_btn)
	box.add_child(row)
	if not _last_memory_extract.is_empty():
		box.add_child(_label("最近 memory_extract：写入 %d 条记忆 · facts %d · threads %d" % [
			int(_last_memory_extract.get("written_memories", 0)),
			(_last_memory_extract.get("facts", []) as Array).size(),
			(_last_memory_extract.get("unresolved_threads", []) as Array).size()
		], 12, INFO))
	if not _last_summary_update.is_empty():
		var phase_summary := _last_summary_update.get("phase_summary", {}) as Dictionary
		box.add_child(_label("最近 summary_update：%s · cursor %d" % [
			phase_summary.get("id", _last_summary_update.get("request_id", "")),
			int(_last_summary_update.get("summary_event_cursor", 0))
		], 12, INFO))
	return _panel(box, 12, Color(INFO, 0.08), INFO)

func _run_summary_update_from_ui() -> void:
	_last_summary_update = await WorldStore.run_summary_update(true)
	if _last_summary_update.is_empty():
		AppState.set_notice("当前没有新的事件需要整理。")
	else:
		AppState.set_notice("AI 阶段摘要已更新。")
	_render()

func _run_memory_extract_from_ui() -> void:
	_last_memory_extract = await WorldStore.run_memory_extract()
	if _last_memory_extract.is_empty():
		AppState.set_error("没有可抽取的事件记忆。")
	else:
		AppState.set_notice("记忆抽取完成：写入 %d 条。" % int(_last_memory_extract.get("written_memories", 0)))
	_render()

func _faction_card(faction: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_label(str(faction.get("name", "未知势力")), 17, FG))
	left.add_child(_label("%s · %s" % [faction.get("ideology", "未知理念"), faction.get("status", "active")], 12, MUTED))
	header.add_child(left)
	header.add_child(_label("资源 %d / 影响 %d" % [int(faction.get("resources", 0)), int(faction.get("influence", 0))], 12, ACCENT, HORIZONTAL_ALIGNMENT_RIGHT))
	box.add_child(header)
	box.add_child(_label(str(faction.get("description", "")), 13, FG))
	box.add_child(_label("目标：%s" % faction.get("current_goal", ""), 13, MUTED))
	box.add_child(_label("行动：%s" % faction.get("current_action", ""), 13, INFO))
	var controlled_names: Array[String] = []
	for location_id in faction.get("controlled_location_ids", []):
		var loc := WorldStore.get_location(str(location_id))
		if not loc.is_empty():
			controlled_names.append(str(loc.get("name", "")))
	box.add_child(_label("控制地点：%s" % (", ".join(controlled_names) if not controlled_names.is_empty() else "无"), 12, MUTED))
	return _panel(box, 12)

func _character_card(character: Dictionary, highlighted: bool = false) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	var avatar := _label(str(character.get("name", "?")).left(1), 24, ACCENT, HORIZONTAL_ALIGNMENT_CENTER)
	avatar.custom_minimum_size = Vector2(56, 56)
	avatar.add_theme_stylebox_override("normal", _style(SURFACE_ALT, ACCENT if str(character.get("role", "")) == "player" else BORDER, 28))
	header.add_child(avatar)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(_label(str(character.get("name", "")), 19, FG))
	var companion_badge := " · 同行" if bool(character.get("is_companion", false)) else ""
	info.add_child(_label("%s · %s%s · %s" % [character.get("role", ""), character.get("relationship", "未知"), companion_badge, _location_name(str(character.get("current_location_id", "")))], 13, MUTED))
	header.add_child(info)
	box.add_child(header)
	box.add_child(_label(str(character.get("description", "")), 14, FG))
	box.add_child(_label("目标：%s" % ", ".join(character.get("goals", [])), 13, MUTED))
	var tendency := str(character.get("action_tendency", ""))
	if not tendency.is_empty():
		box.add_child(_label("行动倾向：%s" % tendency, 13, MUTED))
	var secrets: Array = character.get("secrets", [])
	if not secrets.is_empty() and str(secrets[0]) != "未知":
		box.add_child(_label("隐藏动机：已记录，等待事件自然揭露。", 12, INFO))
	box.add_child(_companion_actions(character))
	box.add_child(_relationship_summary(character))
	box.add_child(_label("记忆：%s" % character.get("memory_summary", "未知"), 13, MUTED))
	box.add_child(_character_recent_events(str(character.get("id", ""))))
	box.add_child(_character_note_editor(character))
	box.add_child(_tag_row(character.get("personality", []), ""))
	return _panel(box, 18, SURFACE, ACCENT if highlighted else BORDER)

func _character_recent_events(character_id: String) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 5)
	box.add_child(_label("最近相关事件", 13, MUTED))
	var events := WorldStore.get_character_recent_events(character_id, 3)
	if events.is_empty():
		box.add_child(_label("暂无最近相关事件", 12, MUTED))
		return box
	for event in events:
		var time := event.get("world_time", {}) as Dictionary
		box.add_child(_label("第%d日 %02d:00 · %s" % [
			int(time.get("day", 1)),
			int(time.get("hour", 0)),
			event.get("title", "")
		], 12, INFO))
		var description := str(event.get("description", ""))
		if not description.is_empty():
			box.add_child(_label(description.left(120), 11, MUTED))
	return box

func _companion_actions(character: Dictionary) -> Control:
	var character_id := str(character.get("id", ""))
	if character_id == "char_hero":
		var note := _label("主角始终由玩家控制。", 12, MUTED)
		note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		return note
	var box := HFlowContainer.new()
	box.add_theme_constant_override("h_separation", 8)
	box.add_theme_constant_override("v_separation", 8)
	if bool(character.get("is_companion", false)):
		box.add_child(_button("离开同行", func(id := character_id) -> void:
			if not WorldStore.set_character_companion(id, false):
				AppState.set_error("无法让该角色离队。")
			_render()
		, false, WARN))
	else:
		var join := _button("邀请同行", func(id := character_id) -> void:
			if not WorldStore.set_character_companion(id, true):
				AppState.set_error("该角色当前无法同行。")
			_render()
		, true)
		join.disabled = not WorldStore.can_join_companion(character_id)
		box.add_child(join)
	return box

func _location_card(location: Dictionary, highlighted: bool = false) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var location_id := str(location.get("id", ""))
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(_label(str(location.get("name", "未知地点")), 18, FG))
	info.add_child(_label("%s · 控制：%s" % [location.get("type", "unknown"), WorldStore.faction_name(str(location.get("controlling_faction_id", "")))], 12, MUTED))
	header.add_child(info)
	var travel_hours := WorldStore.estimate_travel_hours(str(WorldStore.get_current_location().get("id", "")), location_id)
	header.add_child(_label("约 %d 小时" % travel_hours if travel_hours > 0 else "当前位置", 12, ACCENT, HORIZONTAL_ALIGNMENT_RIGHT))
	box.add_child(header)
	box.add_child(_label(str(location.get("description", "")), 13, FG))
	if not str(location.get("memory_summary", "")).is_empty():
		box.add_child(_label("地点记忆：%s" % location.get("memory_summary", ""), 12, INFO))
	box.add_child(_label("标签：%s" % (", ".join(location.get("state_tags", [])) if not (location.get("state_tags", []) as Array).is_empty() else "无"), 12, MUTED))
	var present_names: Array[String] = []
	for character in WorldStore.characters:
		if str(character.get("current_location_id", "")) == location_id:
			present_names.append(str(character.get("name", "未知角色")))
	box.add_child(_label("当前角色：%s" % (", ".join(present_names) if not present_names.is_empty() else "无可见角色"), 12, MUTED))
	var route_names: Array[String] = []
	for route in WorldStore.get_map_routes():
		if str(route.get("from_location_id", "")) == location_id or str(route.get("to_location_id", "")) == location_id:
			route_names.append(str(route.get("name", "路线")))
	box.add_child(_label("路线：%s" % (", ".join(route_names) if not route_names.is_empty() else "暂无路线"), 12, MUTED))
	var recent_titles: Array[String] = []
	for index in range(WorldStore.timeline.size() - 1, -1, -1):
		var event := WorldStore.timeline[index]
		if str(event.get("location_id", "")) != location_id:
			continue
		recent_titles.append(str(event.get("title", "")))
		if recent_titles.size() >= 3:
			break
	box.add_child(_label("近期事件：%s" % (" / ".join(recent_titles) if not recent_titles.is_empty() else "暂无"), 12, MUTED))
	box.add_child(_location_note_editor(location))
	var actions := HFlowContainer.new()
	actions.add_theme_constant_override("h_separation", 8)
	actions.add_theme_constant_override("v_separation", 8)
	actions.add_child(_button("查看地图", func(id := location_id) -> void:
		_focused_location_id = id
		AppState.navigate(&"map")
	, false))
	if location_id != str(WorldStore.get_current_location().get("id", "")):
		actions.add_child(_button("移动到此处", func(id := location_id) -> void:
			WorldStore.move_player_to(id)
			AppState.navigate(&"exploration")
		, true))
	box.add_child(actions)
	return _panel(box, 14, SURFACE, ACCENT if highlighted else BORDER)

func _location_note_editor(location: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	box.add_child(_label("玩家备注", 13, MUTED))
	var note_input := _text_edit(str(location.get("player_notes", "")), 58)
	box.add_child(note_input)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var location_id := str(location.get("id", ""))
	row.add_child(_button("保存备注", func(id := location_id, input := note_input) -> void:
		if WorldStore.update_location_note(id, input.text):
			AppState.set_notice("地点备注已保存。")
		else:
			AppState.set_error("无法保存地点备注。")
		_render()
	, false))
	var updated_at := str(location.get("player_notes_updated_at", ""))
	if not updated_at.is_empty():
		row.add_child(_label("更新于 %s" % updated_at, 11, MUTED))
	box.add_child(row)
	return box

func _character_note_editor(character: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	box.add_child(_label("玩家备注", 13, MUTED))
	var note_input := _text_edit(str(character.get("player_notes", "")), 64)
	box.add_child(note_input)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var character_id := str(character.get("id", ""))
	row.add_child(_button("保存备注", func(id := character_id, input := note_input) -> void:
		if WorldStore.update_character_note(id, input.text):
			AppState.set_notice("人物备注已保存。")
		else:
			AppState.set_error("无法保存人物备注。")
		_render()
	, false))
	var updated_at := str(character.get("player_notes_updated_at", ""))
	if not updated_at.is_empty():
		row.add_child(_label("更新于 %s" % updated_at, 11, MUTED))
	box.add_child(row)
	return box

func _relationship_summary(character: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	var character_id := str(character.get("id", ""))
	if character_id == "char_hero":
		box.add_child(_label("主要关系", 13, MUTED))
		var count := 0
		for other in WorldStore.characters:
			var other_id := str(other.get("id", ""))
			if other_id == "char_hero":
				continue
			var relationship := WorldStore.get_relationship("char_hero", other_id)
			if relationship.is_empty():
				continue
			box.add_child(_relationship_line(str(other.get("name", other_id)), relationship))
			count += 1
			if count >= 3:
				break
		if count == 0:
			box.add_child(_label("尚未建立稳定关系。", 12, MUTED))
	else:
		var relationship_to_hero := WorldStore.get_relationship(character_id, "char_hero")
		box.add_child(_label("对玩家关系", 13, MUTED))
		if relationship_to_hero.is_empty():
			box.add_child(_label("尚未建立稳定关系。", 12, MUTED))
		else:
			box.add_child(_relationship_line("玩家", relationship_to_hero))
	return box

func _relationship_line(name: String, relationship: Dictionary) -> Control:
	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 2)
	row.add_child(_label("%s · %s · 信任 %.0f%% / 好感 %.0f%% / 紧张 %.0f%%" % [
		name,
		relationship.get("type", "neutral"),
		float(relationship.get("trust", 0.0)) * 100.0,
		float(relationship.get("affection", 0.0)) * 100.0,
		float(relationship.get("tension", 0.0)) * 100.0
	], 12, INFO))
	var notes := str(relationship.get("notes", ""))
	if not notes.is_empty():
		row.add_child(_label(notes, 11, MUTED))
	return row

func _timeline_card(event: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var time := event.get("world_time", {}) as Dictionary
	var event_type := str(event.get("type", ""))
	var location_id := str(event.get("location_id", ""))
	box.add_child(_label("第%s日 %02d:00 · %s" % [time.get("day", 1), int(time.get("hour", 0)), event.get("type", "")], 12, MUTED))
	box.add_child(_label(str(event.get("title", "")), 18, FG))
	box.add_child(_label(str(event.get("description", "")), 14, FG))
	var resolution := _event_resolution_text(event)
	if not resolution.is_empty():
		box.add_child(_label(resolution, 12, _event_outcome_color(str(event.get("outcome", "")))))
	box.add_child(_label("地点：%s" % _location_name(location_id), 12, MUTED))
	var participant_names := _timeline_participant_names(event)
	if not participant_names.is_empty():
		box.add_child(_label("参与：%s" % ", ".join(participant_names), 12, MUTED))
	var actions := HFlowContainer.new()
	actions.add_theme_constant_override("h_separation", 8)
	actions.add_theme_constant_override("v_separation", 8)
	actions.add_child(_button("筛选此类", func(value := event_type) -> void:
		_timeline_type_filter = value
		_timeline_visible_count = TIMELINE_PAGE_SIZE
		_render()
	, false))
	if not location_id.is_empty():
		actions.add_child(_button("查看地点", func(id := location_id) -> void:
			_focused_location_id = id
			_timeline_location_filter = id
			_timeline_visible_count = TIMELINE_PAGE_SIZE
			AppState.navigate(&"locations")
		, false))
	for participant_id in _timeline_participant_ids(event):
		var character := WorldStore.get_character(participant_id)
		if character.is_empty():
			continue
		actions.add_child(_button("查看%s" % character.get("name", "角色"), func(id := participant_id) -> void:
			_focused_character_id = id
			_character_filter = "全部"
			_timeline_character_filter = id
			_timeline_visible_count = TIMELINE_PAGE_SIZE
			AppState.navigate(&"characters")
		, false))
	box.add_child(actions)
	return _panel(box)

func _timeline_filters() -> Control:
	var panel := VBoxContainer.new()
	panel.add_theme_constant_override("separation", 8)
	panel.add_child(_label("筛选", 15, FG))
	var row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_field("事件类型", _timeline_type_options()))
	row.add_child(_field("角色", _timeline_character_options()))
	row.add_child(_field("地点", _timeline_location_options()))
	panel.add_child(row)
	panel.add_child(_button("清除筛选", func() -> void:
		_timeline_type_filter = ""
		_timeline_character_filter = ""
		_timeline_location_filter = ""
		_focused_character_id = ""
		_focused_location_id = ""
		_timeline_visible_count = TIMELINE_PAGE_SIZE
		_render()
	, false))
	return _panel(panel, 12, Color(INFO, 0.06), BORDER)

func _timeline_participant_ids(event: Dictionary) -> Array[String]:
	var ids: Array[String] = []
	for participant_id in event.get("participant_ids", []):
		var normalized := str(participant_id)
		if normalized.is_empty() or normalized in ids:
			continue
		ids.append(normalized)
	return ids

func _timeline_participant_names(event: Dictionary) -> Array[String]:
	var names: Array[String] = []
	for participant_id in _timeline_participant_ids(event):
		var character := WorldStore.get_character(participant_id)
		if character.is_empty():
			continue
		names.append(str(character.get("name", participant_id)))
	return names

func _timeline_type_options() -> OptionButton:
	var items: Array[Dictionary] = [{"label": "全部", "value": ""}]
	var seen: Dictionary = {}
	for event in WorldStore.timeline:
		var event_type := str((event as Dictionary).get("type", ""))
		if event_type.is_empty() or seen.has(event_type):
			continue
		seen[event_type] = true
		items.append({"label": event_type, "value": event_type})
	return _filter_options(items, _timeline_type_filter, func(value: String) -> void:
		_timeline_type_filter = value
		_timeline_visible_count = TIMELINE_PAGE_SIZE
		_render()
	)

func _timeline_character_options() -> OptionButton:
	var items: Array[Dictionary] = [{"label": "全部", "value": ""}]
	for character in WorldStore.characters:
		items.append({"label": str(character.get("name", "")), "value": str(character.get("id", ""))})
	return _filter_options(items, _timeline_character_filter, func(value: String) -> void:
		_timeline_character_filter = value
		_timeline_visible_count = TIMELINE_PAGE_SIZE
		_render()
	)

func _timeline_location_options() -> OptionButton:
	var items: Array[Dictionary] = [{"label": "全部", "value": ""}]
	for location in WorldStore.locations:
		items.append({"label": str(location.get("name", "")), "value": str(location.get("id", ""))})
	return _filter_options(items, _timeline_location_filter, func(value: String) -> void:
		_timeline_location_filter = value
		_timeline_visible_count = TIMELINE_PAGE_SIZE
		_render()
	)

func _filter_options(items: Array[Dictionary], current_value: String, callback: Callable) -> OptionButton:
	var options := OptionButton.new()
	options.custom_minimum_size = Vector2(0, 40)
	options.add_theme_stylebox_override("normal", _style(SURFACE, BORDER, 8))
	options.add_theme_color_override("font_color", FG)
	for index in range(items.size()):
		var item := items[index] as Dictionary
		options.add_item(str(item.get("label", "")))
		options.set_item_metadata(index, str(item.get("value", "")))
		if str(item.get("value", "")) == current_value:
			options.select(index)
	options.item_selected.connect(func(index: int) -> void:
		callback.call(str(options.get_item_metadata(index)))
	)
	return options

func _thread_card(thread: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_label(str(thread.get("title", "未命名线索")), 17, FG))
	left.add_child(_label("%s · %s · 优先级 %.0f%%" % [thread.get("kind", "clue"), thread.get("status", "open"), float(thread.get("priority", 0.5)) * 100.0], 12, MUTED))
	header.add_child(left)
	if str(thread.get("status", "open")) != "resolved":
		header.add_child(_button("标记解决", func(id := str(thread.get("id", ""))) -> void:
			WorldStore.resolve_thread(id)
			_render()
		, false))
	box.add_child(header)
	box.add_child(_label(str(thread.get("description", "")), 13, FG))
	var progress: Array = thread.get("progress", [])
	if not progress.is_empty():
		box.add_child(_label("最近进展", 13, MUTED))
		for item in progress.slice(maxi(0, progress.size() - 3), progress.size()):
			var progress_item := item as Dictionary
			box.add_child(_label("• %s" % progress_item.get("text", ""), 12, INFO))
	var event_ids: Array = thread.get("event_ids", [])
	box.add_child(_label("关联事件：%d 条 · 标签 %s" % [event_ids.size(), ", ".join(thread.get("tags", []))], 11, MUTED))
	return _panel(box, 12)

func _save_entry_card(entry: Dictionary, active: bool) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_label(str(entry.get("world_name", "未知世界")), 18, FG))
	left.add_child(_label("%s · 第 %d 天 · %d 事件 · %d 记忆" % [
		"当前存档" if active else "自动备份",
		int(entry.get("world_day", 0)),
		int(entry.get("event_count", 0)),
		int(entry.get("memory_count", 0))
	], 12, MUTED))
	header.add_child(left)
	header.add_child(_label(_format_bytes(int(entry.get("size_bytes", 0))), 12, ACCENT, HORIZONTAL_ALIGNMENT_RIGHT))
	box.add_child(header)
	box.add_child(_label("%s · %s" % [entry.get("created_at", ""), entry.get("file_name", "")], 11, MUTED))
	if not bool(entry.get("schema_valid", false)):
		box.add_child(_label("此存档未通过 schema 校验，不能直接载入。", 12, WARN))
	var row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	if active:
		var continue_btn := _button("继续", func() -> void:
			if WorldStore.has_world() or WorldStore.load_active_world():
				AppState.navigate(&"exploration")
			else:
				AppState.set_error("当前存档无法读取。")
				_render()
		, true)
		continue_btn.disabled = not bool(entry.get("schema_valid", false))
		row.add_child(continue_btn)
	else:
		var restore_btn := _button("恢复此备份", func(path := str(entry.get("path", ""))) -> void:
			_restore_backup_from_settings(path)
		, false)
		restore_btn.disabled = not bool(entry.get("schema_valid", false))
		row.add_child(restore_btn)
	box.add_child(row)
	return _panel(box, 12, SURFACE, SUCCESS if active else BORDER)

func _format_bytes(bytes: int) -> String:
	if bytes >= 1024 * 1024:
		return "%.1f MB" % (float(bytes) / 1048576.0)
	if bytes >= 1024:
		return "%.1f KB" % (float(bytes) / 1024.0)
	return "%d B" % bytes

func _glosc_status_panel() -> Control:
	var summary := AIService.glosc_status_summary(_glosc_status)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var status_color := SUCCESS if str(summary.get("label", "")).contains("已连接") else WARN if bool(summary.get("configured", false)) else MUTED
	left.add_child(_label("连接状态：%s" % summary.get("label", ""), 14, status_color))
	left.add_child(_label(str(summary.get("detail", "")), 12, MUTED))
	var endpoint := str(summary.get("endpoint", ""))
	if not endpoint.is_empty():
		left.add_child(_label("端点：%s" % endpoint, 11, MUTED))
	header.add_child(left)
	var test_btn := _button("测试连接", func() -> void:
		_test_glosc_connection()
	, false)
	test_btn.disabled = _glosc_testing
	header.add_child(test_btn)
	box.add_child(header)
	var quota_units := int(summary.get("quota_units", 0))
	var used_units := int(summary.get("used_units", 0))
	var percent := float(summary.get("percent", 0.0))
	box.add_child(_label("本月用量：%d / %d · %.1f%%" % [used_units, quota_units, percent * 100.0], 12, FG))
	var progress := ProgressBar.new()
	progress.min_value = 0.0
	progress.max_value = 1.0
	progress.value = percent
	progress.show_percentage = false
	progress.custom_minimum_size = Vector2(0, 12)
	box.add_child(progress)
	var balance_value: Variant = summary.get("balance_units", null)
	var balance_text := "余额：远端未返回，当前显示本地日志用量。"
	if balance_value is int or balance_value is float:
		balance_text = "余额/剩余额度：%d" % int(balance_value)
	box.add_child(_label(balance_text, 11, INFO))
	if not str(summary.get("checked_at", "")).is_empty():
		box.add_child(_label("上次检查：%s" % summary.get("checked_at", ""), 11, MUTED))
	if _glosc_testing:
		box.add_child(_label("正在测试 Glosc One 连接...", 12, ACCENT))
	return _panel(box, 12, Color(INFO, 0.06), BORDER)

func _usage_estimate_panel(estimate: Dictionary, title: String = "AI 消耗预估", wrap_panel: bool = true) -> Control:
	if not bool(SettingsStore.get_value("show_usage_estimate", true)):
		var empty := Control.new()
		empty.custom_minimum_size = Vector2.ZERO
		return empty
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 5)
	box.add_child(_label(title, 13, WARN))
	box.add_child(_label(AIService.estimate_usage_text(estimate), 12, MUTED))
	box.add_child(_label("%s · %s" % [estimate.get("billing_note", ""), estimate.get("retry_note", "")], 11, INFO if bool(estimate.get("remote_enabled", false)) else SUCCESS))
	if wrap_panel:
		return _panel(box, 12, Color(WARN, 0.08), WARN)
	return box

func _ai_usage_panel() -> Control:
	var summary := WorldStore.get_ai_usage_summary()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	box.add_child(_label("本地记录：%d 次调用 · 成功 %d · 失败 %d" % [
		int(summary.get("calls", 0)),
		int(summary.get("success_count", 0)),
		int(summary.get("failed_count", 0))
	], 13, FG))
	box.add_child(_label("Token：输入 %d / 输出 %d / 合计 %d" % [
		int(summary.get("input_tokens", 0)),
		int(summary.get("output_tokens", 0)),
		int(summary.get("total_tokens", 0))
	], 12, MUTED))
	if bool(summary.get("has_cost", false)):
		box.add_child(_label("估算费用：%.4f" % float(summary.get("estimated_cost", 0.0)), 12, WARN))
	else:
		box.add_child(_label("费用：远端未返回 cost 字段；当前只展示 token 或计费单位。", 12, MUTED))
	var by_purpose := summary.get("by_purpose", {}) as Dictionary
	if not by_purpose.is_empty():
		var lines: Array[String] = []
		for purpose in by_purpose.keys():
			var data := by_purpose[purpose] as Dictionary
			lines.append("%s %d 次" % [purpose, int(data.get("calls", 0))])
		box.add_child(_label("类型：%s" % " · ".join(lines), 11, INFO))
	return _panel(box, 12, Color(INFO, 0.08), INFO)

func _ai_log_tools() -> Control:
	var row: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_button("复制日志摘要", func() -> void:
		DisplayServer.clipboard_set(WorldStore.ai_logs_summary_text(8))
		AppState.set_notice("AI 日志摘要已复制。")
		_render()
	, false))
	row.add_child(_button("导出 AI 日志 JSONL", func() -> void:
		var path := WorldStore.export_ai_logs()
		if not path.is_empty():
			AppState.set_notice("AI 日志已导出：%s" % ProjectSettings.globalize_path(path))
		_render()
	, false))
	return _panel(row, 10, Color(INFO, 0.05), BORDER)

func _consistency_panel() -> Control:
	var issues := WorldStore.validate_world_consistency()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	if issues.is_empty():
		box.add_child(_label("世界一致性：通过", 14, SUCCESS))
		box.add_child(_label("时间线顺序、角色位置、事件/记忆/线索引用都能互相解析。", 12, MUTED))
	else:
		box.add_child(_label("世界一致性：发现 %d 个问题" % issues.size(), 14, WARN))
		for issue in issues.slice(0, mini(5, issues.size())):
			var data := issue as Dictionary
			box.add_child(_label("%s · %s" % [data.get("code", ""), data.get("message", "")], 12, WARN))
	if not _last_consistency_check.is_empty():
		var contradictions: Array = _last_consistency_check.get("contradictions", [])
		box.add_child(_label("最近 consistency_check：%d 个冲突/引用问题 · %s" % [contradictions.size(), _last_consistency_check.get("request_id", "")], 12, INFO if contradictions.is_empty() else WARN))
		for contradiction in contradictions.slice(0, mini(3, contradictions.size())):
			var data := contradiction as Dictionary
			box.add_child(_label("%s · %s" % [data.get("code", ""), data.get("message", "")], 11, WARN))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_button("运行一致性检查", func() -> void:
		_run_consistency_check_from_ui()
	, false))
	box.add_child(row)
	return _panel(box, 12, Color(SUCCESS, 0.08) if issues.is_empty() else Color(WARN, 0.08), SUCCESS if issues.is_empty() else WARN)

func _run_consistency_check_from_ui() -> void:
	_last_consistency_check = await WorldStore.run_consistency_check()
	if _last_consistency_check.is_empty():
		AppState.set_error("一致性检查未能运行。")
	else:
		var contradictions: Array = _last_consistency_check.get("contradictions", [])
		AppState.set_notice("一致性检查完成：%d 个问题。" % contradictions.size())
	_render()

func _developer_tools_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	box.add_child(_label("开发者状态查看器", 18, WARN))
	box.add_child(_label("世界 %s · 角色 %d · 地点 %d · 事件 %d · 记忆 %d · 线索 %d" % [
		WorldStore.world.get("id", ""),
		WorldStore.characters.size(),
		WorldStore.locations.size(),
		WorldStore.timeline.size(),
		WorldStore.memories.size(),
		WorldStore.threads.size()
	], 12, MUTED))
	var world_time := WorldStore.world.get("current_time", {}) as Dictionary
	box.add_child(_label("当前时间：第 %d 天 %02d:00 · 当前地点：%s" % [
		int(world_time.get("day", 1)),
		int(world_time.get("hour", 0)),
		WorldStore.get_current_location().get("name", "未知地点")
	], 12, INFO))
	var actions: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	actions.add_child(_button("复制状态 JSON", func() -> void:
		DisplayServer.clipboard_set(JSON.stringify(WorldStore.export_payload(), "\t"))
		AppState.set_notice("世界状态 JSON 已复制。")
		_render()
	, false))
	actions.add_child(_button("复制 AI 上下文 JSON", func() -> void:
		DisplayServer.clipboard_set(JSON.stringify(WorldStore.build_ai_context("开发者检查"), "\t"))
		AppState.set_notice("AI 上下文 JSON 已复制。")
		_render()
	, false))
	box.add_child(actions)
	box.add_child(_label("调试事件编辑器", 15, FG))
	var event_grid := GridContainer.new()
	event_grid.columns = 2 if _wide() else 1
	event_grid.add_theme_constant_override("h_separation", 8)
	event_grid.add_theme_constant_override("v_separation", 8)
	var event_type := _line_edit("developer_note")
	var event_title := _line_edit("开发者调试事件")
	event_grid.add_child(_field("事件类型", event_type))
	event_grid.add_child(_field("标题", event_title))
	box.add_child(event_grid)
	var event_description := _text_edit("用于手动验证世界状态、时间线和存档。", 72)
	box.add_child(_field("描述", event_description))
	box.add_child(_button("添加调试事件", func(type_input := event_type, title_input := event_title, desc_input := event_description) -> void:
		var event_id := WorldStore.add_developer_event(title_input.text, desc_input.text, type_input.text)
		if event_id.is_empty():
			AppState.set_error("无法添加调试事件，请确认开发者模式已开启且标题不为空。")
		else:
			AppState.set_notice("已添加调试事件：%s" % event_id)
		_render()
	, false, WARN))
	return _panel(box, 12, Color(WARN, 0.08), WARN)

func _ai_log_card(log_entry: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var usage := log_entry.get("usage", {}) as Dictionary
	box.add_child(_label("%s · %s · %s · %s" % [log_entry.get("id", ""), log_entry.get("purpose", ""), log_entry.get("status", ""), log_entry.get("log_level", "debug")], 13, ACCENT))
	var response_summary := str(log_entry.get("response_summary", ""))
	if not response_summary.is_empty():
		box.add_child(_label(response_summary, 13, FG))
	box.add_child(_label("模型 %s · in %d / out %d" % [log_entry.get("model", ""), int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))], 12, MUTED))
	if str(log_entry.get("log_level", "")) == "deep":
		box.add_child(_label("深度调试已保存脱敏原始响应；导出日志前请确认隐私风险。", 11, WARN))
	return _panel(box, 12)

func _ai_confirmation_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label("AI 调用确认", 18, WARN))
	box.add_child(_label("%s · %s" % [_ai_confirm_request_id, _ai_confirm_purpose], 12, MUTED))
	box.add_child(_label(_ai_confirm_summary, 14, FG))
	if not _ai_confirm_estimate.is_empty():
		box.add_child(_usage_estimate_panel(_ai_confirm_estimate, "确认前预估", false))
	box.add_child(_label("确认前当前世界状态已保持不变；取消不会写入时间线、记忆或地点状态。", 12, MUTED))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_button("确认调用", func() -> void:
		AIService.confirm_pending_request()
		_ai_confirm_waiting = false
		_busy = true
		_render()
	, true))
	row.add_child(_button("取消", func() -> void:
		AIService.cancel_pending_request()
		_ai_confirm_waiting = false
		_busy = false
		_render()
	, false, DANGER))
	box.add_child(row)
	return _panel(box, 14, Color(WARN, 0.10), WARN)

func _ai_busy_panel(message: String) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label(message, 14, ACCENT))
	var detail := "远端调用可取消；取消后不会应用世界状态变更。"
	if not AIService.has_active_request():
		detail = "正在等待本地叙事模拟或请求确认。"
	box.add_child(_label(detail, 12, MUTED))
	if AIService.has_active_request():
		box.add_child(_button("取消本次 AI 调用", func() -> void:
			_cancel_active_ai()
		, false, DANGER))
	return _panel(box, 12, Color(ACCENT, 0.12), ACCENT)

func _retry_ai_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var retry_text := "重试上次 AI 调用"
	if _last_failed_operation == &"world_expand":
		retry_text = "重试世界生成"
	elif _last_failed_operation == &"player_action":
		retry_text = "重试玩家行动"
	var retry := _button(retry_text, func() -> void:
		_retry_last_ai_request()
	, true)
	retry.disabled = _last_failed_operation == &"" or _busy
	box.add_child(retry)
	box.add_child(_label("重试会复用上次提交的世界种子或玩家行动；成功前不会修改世界状态。", 12, MUTED))
	return _panel(box, 12, Color(INFO, 0.10), INFO)

func _cancel_active_ai() -> void:
	AIService.cancel_active_requests()
	AppState.set_notice("正在取消 AI 调用。")
	_render()

func _test_glosc_connection() -> void:
	if _settings_base_url != null:
		SettingsStore.settings["glosc_base_url"] = _settings_base_url.text.strip_edges()
	if _settings_token != null:
		SettingsStore.settings["glosc_token"] = _settings_token.text.strip_edges()
	if _settings_model != null:
		SettingsStore.settings["model"] = _settings_model.text.strip_edges()
	if _settings_timeout != null:
		SettingsStore.settings["timeout_seconds"] = int(_settings_timeout.value)
	_glosc_testing = true
	_render()
	_glosc_status = await AIService.check_glosc_connection()
	_glosc_testing = false
	if bool(_glosc_status.get("ok", false)):
		AppState.set_notice(str(_glosc_status.get("message", "Glosc One 连接测试通过。")))
	else:
		AppState.set_error(str(_glosc_status.get("error", "Glosc One 连接测试失败。")))
	_render()

func _retry_last_ai_request() -> void:
	if _busy:
		return
	AppState.clear_error()
	match _last_failed_operation:
		&"world_expand":
			if _last_world_seed.is_empty():
				AppState.set_error("没有可重试的世界生成参数。")
				_render()
				return
			_active_operation = &"world_expand"
			_busy = true
			_render()
			await WorldStore.create_world(_last_world_seed.duplicate(true))
			_busy = false
			if WorldStore.has_world():
				_last_failed_operation = &""
				AppState.navigate(&"exploration")
			else:
				_last_failed_operation = &"world_expand"
				if AppState.last_error.is_empty():
					AppState.set_error("世界生成重试失败，请检查 Glosc One 配置或稍后再试。")
				_render()
		&"player_action":
			if _last_player_action.strip_edges().is_empty():
				AppState.set_error("没有可重试的玩家行动。")
				_render()
				return
			_active_operation = &"player_action"
			_busy = true
			_render()
			await WorldStore.submit_player_action(_last_player_action)
			_busy = false
			if AppState.last_error.is_empty():
				_last_failed_operation = &""
			else:
				_last_failed_operation = &"player_action"
			_render()
		_:
			AppState.set_error("没有可重试的 AI 调用。")
			_render()

func _mini_character(character: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_label(str(character.get("name", "?")).left(1), 18, ACCENT, HORIZONTAL_ALIGNMENT_CENTER))
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_child(_label(str(character.get("name", "")), 14, FG))
	var status := "同行" if bool(character.get("is_companion", false)) else str(character.get("relationship", "未知"))
	stack.add_child(_label("%s · %s" % [status, _location_name(str(character.get("current_location_id", "")))], 12, MUTED))
	row.add_child(stack)
	return _panel(row, 10)

func _location_name(location_id: String) -> String:
	var loc := WorldStore.get_location(location_id)
	return str(loc.get("name", "未知地点"))

func _section_title(title: String, subtitle: String = "") -> Control:
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 4)
	stack.add_child(_label(title, 16, FG))
	if not subtitle.is_empty():
		stack.add_child(_label(subtitle, 13, MUTED))
	return stack

func _narrative_block(text: String, kind: String = "WORLD", title: String = "", event: Dictionary = {}) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	if not title.is_empty():
		box.add_child(_label("%s · %s" % [kind, title], 11, ACCENT))
	box.add_child(_label(text, 16, FG))
	var resolution := _event_resolution_text(event)
	if not resolution.is_empty():
		box.add_child(_label(resolution, 12, _event_outcome_color(str(event.get("outcome", "")))))
	return _panel(box)

func _event_resolution_text(event: Dictionary) -> String:
	if event.is_empty() or not event.has("outcome"):
		return ""
	var metadata: Dictionary = event.get("metadata", {}) if event.get("metadata", {}) is Dictionary else {}
	var label := str(metadata.get("outcome_label", _outcome_label_for_ui(str(event.get("outcome", "")))))
	var reason := str(event.get("outcome_reason", metadata.get("outcome_reason", "")))
	var consequence := str(event.get("consequence", metadata.get("consequence", "")))
	var parts: Array[String] = [label]
	if not reason.is_empty():
		parts.append("原因：%s" % reason)
	if not consequence.is_empty():
		parts.append("后果：%s" % consequence)
	return " · ".join(parts)

func _outcome_label_for_ui(outcome: String) -> String:
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

func _event_outcome_color(outcome: String) -> Color:
	match outcome:
		"success":
			return SUCCESS
		"cost":
			return WARN
		"blocked":
			return DANGER
		"quiet":
			return INFO
		_:
			return ACCENT

func _status_box(text: String, color: Color = ACCENT) -> Control:
	var label := _label(text, 14, color)
	return _panel(label, 12, Color(color, 0.12), color)

func _tag_row(tags: Array, active: String) -> Control:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	for tag in tags:
		var selected := active == str(tag)
		var label := _label(str(tag), 12, ACCENT if selected else MUTED, HORIZONTAL_ALIGNMENT_CENTER)
		label.add_theme_stylebox_override("normal", _style(Color(ACCENT, 0.14) if selected else Color.TRANSPARENT, ACCENT if selected else BORDER, 999))
		label.custom_minimum_size = Vector2(72, 24)
		row.add_child(label)
	return row

func _field(title: String, control: Control) -> Control:
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 6)
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	stack.add_child(_label(title, 13, MUTED))
	stack.add_child(control)
	return stack

func _line_edit(placeholder: String) -> LineEdit:
	var input := LineEdit.new()
	input.text = "" if placeholder.contains("输入") else placeholder
	input.placeholder_text = placeholder
	input.custom_minimum_size = Vector2(0, 40)
	input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	input.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	input.add_theme_stylebox_override("normal", _style(SURFACE, BORDER, 8))
	input.add_theme_stylebox_override("focus", _style(SURFACE, ACCENT, 8))
	input.add_theme_color_override("font_color", FG)
	input.add_theme_color_override("font_placeholder_color", MUTED)
	return input

func _text_edit(text: String, height: int) -> TextEdit:
	var input := TextEdit.new()
	input.text = text
	input.custom_minimum_size = Vector2(0, height)
	input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	input.add_theme_stylebox_override("normal", _style(SURFACE, BORDER, 8))
	input.add_theme_stylebox_override("focus", _style(SURFACE, ACCENT, 8))
	input.add_theme_color_override("font_color", FG)
	return input

func _options(values: Array[String]) -> OptionButton:
	var options := OptionButton.new()
	for value in values:
		options.add_item(value)
	options.custom_minimum_size = Vector2(0, 40)
	options.add_theme_stylebox_override("normal", _style(SURFACE, BORDER, 8))
	options.add_theme_color_override("font_color", FG)
	return options

func _select_option_value(options: OptionButton, value: String) -> void:
	for index in range(options.item_count):
		if options.get_item_text(index) == value:
			options.select(index)
			return

func _current_log_level() -> String:
	var level := str(SettingsStore.get_value("log_level", "debug"))
	if not level in ["default", "debug", "deep"]:
		level = "debug" if bool(SettingsStore.get_value("debug_logs", true)) else "default"
	return level

func _spin(value: float, minimum: float, maximum: float, step: float) -> SpinBox:
	var input := SpinBox.new()
	input.min_value = minimum
	input.max_value = maximum
	input.step = step
	input.value = value
	input.custom_minimum_size = Vector2(0, 40)
	input.add_theme_color_override("font_color", FG)
	return input

func _check(text: String, pressed: bool) -> CheckBox:
	var check := CheckBox.new()
	check.text = text
	check.button_pressed = pressed
	check.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	check.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	check.add_theme_color_override("font_color", FG)
	return check

func _button(text: String, callback: Callable, primary: bool = false, override_color: Color = Color.TRANSPARENT, compact: bool = false) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 40 if compact else 44)
	btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	btn.pressed.connect(callback)
	var fill := ACCENT if primary else SURFACE
	var border := ACCENT if primary else BORDER
	var font := Color.WHITE if primary else FG
	if override_color != Color.TRANSPARENT:
		fill = Color.TRANSPARENT
		border = override_color
		font = override_color
	var padding := 7 if compact else 14
	btn.add_theme_stylebox_override("normal", _style(fill, border, 8, padding))
	btn.add_theme_stylebox_override("hover", _style(ACCENT_DIM if primary else SURFACE_ALT, ACCENT if primary else ACCENT, 8, padding))
	btn.add_theme_stylebox_override("pressed", _style(ACCENT_DIM, ACCENT_DIM, 8, padding))
	btn.add_theme_stylebox_override("disabled", _style(Color(BORDER, 0.5), BORDER, 8, padding))
	btn.add_theme_color_override("font_color", font)
	btn.add_theme_color_override("font_disabled_color", MUTED)
	return btn

func _label(text: String, font_size: int, color: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = align
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	label.add_theme_font_size_override("font_size", _scaled_font(font_size))
	label.add_theme_color_override("font_color", color)
	return label

func _scaled_font(size: int) -> int:
	match str(SettingsStore.get_value("font_size", "medium")):
		"small":
			return maxi(10, size - 2)
		"large":
			return size + 3
		_:
			return size

func _scroll() -> ScrollContainer:
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return scroll

func _content_stack(width: int) -> VBoxContainer:
	var stack := VBoxContainer.new()
	stack.custom_minimum_size = Vector2(width if _wide() else 0, 0)
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 16)
	return stack

func _panel(child: Control, padding: int = 18, fill: Color = SURFACE, border: Color = BORDER) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _style(fill, border, 10, padding))
	panel.add_child(child)
	return panel

func _padded(child: Control, padding: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.size_flags_vertical = child.size_flags_vertical
	margin.add_theme_constant_override("margin_left", padding)
	margin.add_theme_constant_override("margin_right", padding)
	margin.add_theme_constant_override("margin_top", padding)
	margin.add_theme_constant_override("margin_bottom", padding)
	margin.add_child(child)
	return margin

func _centered(child: Control) -> CenterContainer:
	var center := CenterContainer.new()
	center.add_child(child)
	return center

func _separator(text: String) -> Control:
	var label := _label(text, 12, MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	label.custom_minimum_size = Vector2(0, 28)
	return label

func _spacer(height: int) -> Control:
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, height)
	return spacer

func _style(fill: Color, border: Color, radius: int, padding: int = 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	return style

func _wide() -> bool:
	var viewport_width := get_viewport_rect().size.x
	var window_width := float(get_window().size.x)
	var effective_width := window_width if window_width > 0.0 else viewport_width
	return effective_width >= 900.0

func _context_panel_width() -> int:
	return clampi(int(SettingsStore.get_value("context_panel_width", 320)), 260, 520)
