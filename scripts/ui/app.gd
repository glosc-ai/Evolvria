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

var _root: Control
var _busy: bool = false
var _active_operation: StringName = &""
var _last_failed_operation: StringName = &""
var _last_world_seed: Dictionary = {}
var _last_player_action: String = ""
var _ai_confirm_waiting: bool = false
var _ai_confirm_request_id: String = ""
var _ai_confirm_purpose: String = ""
var _ai_confirm_summary: String = ""
var _route_before_settings: StringName = &"main_menu"
var _map_zoom: float = 1.0
var _map_pan: Vector2 = Vector2.ZERO
var _map_dragging: bool = false
var _map_drag_start: Vector2 = Vector2.ZERO
var _map_drag_last: Vector2 = Vector2.ZERO
var _map_drag_moved: bool = false
var _touch_points: Dictionary = {}
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
var _action_input: LineEdit
var _settings_base_url: LineEdit
var _settings_token: LineEdit
var _settings_model: LineEdit
var _settings_timeout: SpinBox
var _settings_confirm: CheckBox
var _settings_retry: CheckBox
var _settings_debug: CheckBox
var _map_location_name: LineEdit
var _map_location_type: LineEdit
var _map_location_desc: TextEdit
var _map_location_x: SpinBox
var _map_location_y: SpinBox
var _map_image_path: LineEdit
var _settings_import_zip: LineEdit

func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	AppState.route_changed.connect(_on_route_changed)
	WorldStore.world_updated.connect(_on_world_updated)
	AIService.ai_request_started.connect(_on_ai_started)
	AIService.ai_request_finished.connect(_on_ai_finished)
	AIService.ai_request_failed.connect(_on_ai_failed)
	AIService.ai_confirmation_requested.connect(_on_ai_confirmation_requested)
	get_window().files_dropped.connect(_on_files_dropped)
	_render()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		_render()

func _on_route_changed(_route: StringName) -> void:
	_render()

func _on_world_updated(_change_set: Dictionary) -> void:
	_render()

func _on_ai_started(_request_id: String, _purpose: String) -> void:
	_busy = true
	_ai_confirm_waiting = false
	_render()

func _on_ai_finished(_request_id: String, _result: Dictionary) -> void:
	_busy = false
	_active_operation = &""
	_last_failed_operation = &""
	_ai_confirm_waiting = false
	_render()

func _on_ai_failed(_request_id: String, error: String) -> void:
	_busy = false
	if not error.contains("已取消"):
		_last_failed_operation = _active_operation
	_active_operation = &""
	_ai_confirm_waiting = false
	AppState.set_error(error)
	_render()

func _on_ai_confirmation_requested(request_id: String, purpose: String, summary: String) -> void:
	_ai_confirm_waiting = true
	_ai_confirm_request_id = request_id
	_ai_confirm_purpose = purpose
	_ai_confirm_summary = summary
	_busy = false
	_render()

func _on_files_dropped(files: PackedStringArray) -> void:
	if files.is_empty():
		return
	var path := files[0]
	var extension := path.get_extension().to_lower()
	if extension == "zip":
		if WorldStore.load_imported_world(path):
			AppState.set_notice("已导入：%s" % WorldStore.world.get("name", "未命名世界"))
			AppState.navigate(&"exploration")
		else:
			_render()
		return
	if extension in ["png", "jpg", "jpeg", "webp"] and WorldStore.has_world():
		if WorldStore.import_map_image(path, "拖入地图"):
			AppState.set_notice("地图图片已导入。")
		else:
			AppState.set_error("地图图片导入失败。")
		_render()

func _render() -> void:
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
		&"new_world":
			_render_new_world()
		&"exploration":
			_render_exploration()
		&"map":
			_render_map()
		&"characters":
			_render_characters()
		&"timeline":
			_render_timeline()
		&"world_lore":
			_render_world_lore()
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
	title.add_theme_font_override("font", ThemeDB.fallback_font)
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
		if WorldStore.has_world() or WorldStore.load_active_world():
			AppState.navigate(&"timeline")
		else:
			AppState.set_error("当前没有可读取的本地存档。")
			_render()
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

func _render_new_world() -> void:
	var page := _page()
	page.add_child(_top_bar("新建世界", "返回主菜单", func() -> void: AppState.navigate(&"main_menu")))

	var scroll := _scroll()
	page.add_child(scroll)
	var stack := _content_stack(720)
	scroll.add_child(stack)

	stack.add_child(_section_title("1. 世界基调", "输入基础设定，系统会补全世界规则、地点、冲突和开局事件。"))
	var world_grid := GridContainer.new()
	world_grid.columns = 2 if _wide() else 1
	world_grid.add_theme_constant_override("h_separation", 14)
	world_grid.add_theme_constant_override("v_separation", 14)
	stack.add_child(_panel(world_grid))

	_world_name_input = _line_edit("苍星纪元")
	world_grid.add_child(_field("世界名称", _world_name_input))
	_genre_input = _options(["奇幻", "现代", "科幻", "末世", "校园", "武侠", "自定义"])
	world_grid.add_child(_field("世界类型", _genre_input))
	_tone_input = _options(["冒险", "严肃", "黑暗", "浪漫", "政治", "悬疑", "轻松"])
	world_grid.add_child(_field("世界基调", _tone_input))
	_limits_input = _text_edit("避免过度血腥；强调角色选择带来的长期后果。", 78)
	world_grid.add_child(_field("内容偏好/禁用内容", _limits_input))

	stack.add_child(_section_title("2. 主角", "主角设定会作为 AI 生成和事件判定的最高优先级事实。"))
	var hero_grid := GridContainer.new()
	hero_grid.columns = 2 if _wide() else 1
	hero_grid.add_theme_constant_override("h_separation", 14)
	hero_grid.add_theme_constant_override("v_separation", 14)
	stack.add_child(_panel(hero_grid))

	_hero_name_input = _line_edit("艾林·星语")
	hero_grid.add_child(_field("姓名", _hero_name_input))
	_hero_identity_input = _line_edit("流浪剑客")
	hero_grid.add_child(_field("身份", _hero_identity_input))
	_hero_goal_input = _line_edit("寻找旧王朝失落档案")
	hero_grid.add_child(_field("目标", _hero_goal_input))
	_hero_ability_input = _line_edit("剑术,古文字,快速适应")
	hero_grid.add_child(_field("能力/特质", _hero_ability_input))
	_hero_weakness_input = _line_edit("容易相信熟悉的人")
	hero_grid.add_child(_field("弱点", _hero_weakness_input))

	stack.add_child(_section_title("3. 关键角色", "每行一个角色：姓名 | 身份 | 关系 | 简述。可随时改名，不固定性别或模板。"))
	_key_characters_input = _text_edit("璃安 | 旧友 | 同行 | 温和但隐藏重要秘密\n赛拉 | 遗迹猎人 | 竞争 | 追求同一份档案\n诺维 | 情报贩子 | 未知 | 熟悉边境势力\n维克托 | 白塔骑士 | 紧张 | 相信秩序高于自由", 150)
	stack.add_child(_panel(_field("角色列表", _key_characters_input)))

	var create_btn := _button("生成世界并开始探索", func() -> void:
		_create_world_from_form()
	, true)
	create_btn.disabled = _busy
	stack.add_child(create_btn)
	if _ai_confirm_waiting:
		stack.add_child(_ai_confirmation_panel())
	if _busy:
		stack.add_child(_ai_busy_panel("AI 正在补全世界观、地点、角色行动倾向和开局事件。"))
	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
		stack.add_child(_retry_ai_panel())

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
	var stack := _content_stack(860)
	scroll.add_child(stack)
	stack.add_child(_narrative_block(str(WorldStore.world.get("summary", "")), "WORLD"))

	var recent := WorldStore.timeline.slice(maxi(0, WorldStore.timeline.size() - 8), WorldStore.timeline.size())
	for event in recent:
		var data := event as Dictionary
		var kind := "ACTION" if str(data.get("type", "")).contains("player") else "WORLD"
		stack.add_child(_narrative_block(str(data.get("description", "")), kind, str(data.get("title", ""))))
	if _busy:
		stack.add_child(_ai_busy_panel("AI 正在生成结果，期间你仍可查看地图、人物和时间线。"))
	if _ai_confirm_waiting:
		stack.add_child(_ai_confirmation_panel())
	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
		stack.add_child(_retry_ai_panel())

	var input_panel := VBoxContainer.new()
	input_panel.add_theme_constant_override("separation", 10)
	input_panel.add_theme_stylebox_override("panel", _style(BG, BORDER, 0))
	input_panel.custom_minimum_size = Vector2(0, 126)
	input_panel.add_child(_suggested_actions_bar())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_action_input = _line_edit("输入你的行动...")
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
		main.add_child(_bottom_nav())

func _render_map() -> void:
	if not WorldStore.has_world():
		_render_empty_world()
		return
	var page := _page()
	page.add_child(_top_bar("地图", "返回探索", func() -> void: AppState.navigate(&"exploration")))

	var body: BoxContainer = HBoxContainer.new() if _wide() else VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 16)
	page.add_child(_padded(body, 18))

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

	for location in WorldStore.locations:
		var loc := location as Dictionary
		var marker := _map_marker(loc)
		map_area.add_child(marker)

	for character in WorldStore.characters:
		var data := character as Dictionary
		if str(data.get("role", "")) == "player":
			continue
		var loc := WorldStore.get_location(str(data.get("current_location_id", "")))
		if loc.is_empty():
			continue
		var marker := _npc_marker(data, loc)
		map_area.add_child(marker)

	body.add_child(_map_sidebar())

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
	stack.add_child(_tag_row(["全部", "同行", "敌对", "已遇见", "仅听闻"], "全部"))
	for character in WorldStore.characters:
		stack.add_child(_character_card(character))

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
	stack.add_child(_tag_row(["全部", "玩家行动", "NPC", "世界事件", "发现", "冲突"], "全部"))
	for i in range(WorldStore.timeline.size() - 1, -1, -1):
		stack.add_child(_timeline_card(WorldStore.timeline[i]))

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

	stack.add_child(_summary_status_panel())

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
		for i in range(WorldStore.ai_logs.size() - 1, maxi(-1, WorldStore.ai_logs.size() - 8), -1):
			stack.add_child(_ai_log_card(WorldStore.ai_logs[i]))

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
	_settings_base_url = _line_edit(str(SettingsStore.get_value("glosc_base_url", "")))
	api.add_child(_field("服务地址", _settings_base_url))
	_settings_token = _line_edit(str(SettingsStore.get_value("glosc_token", "")))
	_settings_token.secret = true
	api.add_child(_field("访问令牌", _settings_token))
	_settings_model = _line_edit(str(SettingsStore.get_value("model", "glosc-one-default")))
	api.add_child(_field("默认模型", _settings_model))
	_settings_timeout = SpinBox.new()
	_settings_timeout.min_value = 5
	_settings_timeout.max_value = 180
	_settings_timeout.value = float(SettingsStore.get_value("timeout_seconds", 45))
	api.add_child(_field("请求超时（秒）", _settings_timeout))
	_settings_confirm = _check("每次 AI 调用前确认", bool(SettingsStore.get_value("confirm_ai_calls", true)))
	api.add_child(_settings_confirm)
	_settings_retry = _check("允许自动重试", bool(SettingsStore.get_value("auto_retry", true)))
	api.add_child(_settings_retry)
	_settings_debug = _check("保存调试日志", bool(SettingsStore.get_value("debug_logs", true)))
	api.add_child(_settings_debug)
	api.add_child(_button("保存 AI 设置", func() -> void: _save_settings(), true))
	stack.add_child(_panel(api))

	stack.add_child(_section_title("显示", "字号设置会影响后续 UI 文本密度。"))
	var display := HBoxContainer.new()
	display.add_theme_constant_override("separation", 10)
	for size_name in ["small", "medium", "large"]:
		var captured_size := str(size_name)
		var btn := _button(captured_size, func() -> void:
			SettingsStore.set_value("font_size", captured_size)
			_render()
		, str(SettingsStore.get_value("font_size", "medium")) == captured_size)
		display.add_child(btn)
	stack.add_child(_panel(display))

	stack.add_child(_section_title("数据管理", "本地存档保存到 Godot 的 user://saves 目录。"))
	var data_tools := VBoxContainer.new()
	data_tools.add_theme_constant_override("separation", 10)
	data_tools.add_child(_button("立即保存", func() -> void:
		if WorldStore.has_world():
			SaveManager.save_game(WorldStore.export_payload())
	, false))
	data_tools.add_child(_button("导出世界 ZIP", func() -> void:
		if WorldStore.has_world():
			var export_path := SaveManager.export_world(WorldStore.export_payload(), true)
			if not export_path.is_empty():
				AppState.set_notice("已导出：%s" % ProjectSettings.globalize_path(export_path))
				_render()
	, false))
	_settings_import_zip = _line_edit("user://exports/world.zip")
	data_tools.add_child(_field("导入 ZIP 路径", _settings_import_zip))
	data_tools.add_child(_button("选择 ZIP 文件", func() -> void:
		_open_zip_file_dialog()
	, false))
	data_tools.add_child(_button("导入世界 ZIP", func() -> void:
		if WorldStore.load_imported_world(_settings_import_zip.text.strip_edges()):
			AppState.set_notice("已导入：%s" % WorldStore.world.get("name", "未命名世界"))
			AppState.navigate(&"exploration")
		else:
			_render()
	, false))
	data_tools.add_child(_button("清除 AI 日志", func() -> void:
		if WorldStore.has_world():
			WorldStore.clear_ai_logs()
	, false))
	data_tools.add_child(_button("删除当前世界", func() -> void:
		WorldStore.reset_world()
		AppState.navigate(&"main_menu")
	, false, DANGER))
	stack.add_child(_panel(data_tools))

	if not AppState.last_error.is_empty():
		stack.add_child(_status_box(AppState.last_error, DANGER))
	if not AppState.last_notice.is_empty():
		stack.add_child(_status_box(AppState.last_notice, SUCCESS))

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
	var seed := {
		"world_name": _world_name_input.text.strip_edges(),
		"genre": _genre_input.get_item_text(_genre_input.selected),
		"tone": _tone_input.get_item_text(_tone_input.selected),
		"limits": _limits_input.text.strip_edges(),
		"hero": {
			"name": _hero_name_input.text.strip_edges(),
			"description": _hero_identity_input.text.strip_edges(),
			"goal": _hero_goal_input.text.strip_edges(),
			"ability": _hero_ability_input.text.strip_edges(),
			"weakness": _hero_weakness_input.text.strip_edges()
		},
		"key_characters": _parse_key_characters(_key_characters_input.text)
	}
	if str(seed["world_name"]).is_empty():
		AppState.set_error("世界名称不能为空。")
		_render()
		return
	_last_world_seed = seed.duplicate(true)
	_active_operation = &"world_expand"
	_busy = true
	_render()
	await WorldStore.create_world(seed)
	_busy = false
	if WorldStore.has_world():
		AppState.navigate(&"exploration")
	else:
		AppState.set_error("世界生成失败，请检查 Glosc One 配置或稍后重试。")
		_render()

func _submit_action() -> void:
	if _action_input == null:
		return
	var action := _action_input.text.strip_edges()
	if action.is_empty():
		return
	_last_player_action = action
	_active_operation = &"player_action"
	_busy = true
	_render()
	await WorldStore.submit_player_action(action)
	_busy = false
	_render()

func _save_settings() -> void:
	SettingsStore.set_value("glosc_base_url", _settings_base_url.text.strip_edges())
	SettingsStore.set_value("glosc_token", _settings_token.text.strip_edges())
	SettingsStore.set_value("model", _settings_model.text.strip_edges())
	SettingsStore.set_value("timeout_seconds", int(_settings_timeout.value))
	SettingsStore.set_value("confirm_ai_calls", _settings_confirm.button_pressed)
	SettingsStore.set_value("auto_retry", _settings_retry.button_pressed)
	SettingsStore.set_value("debug_logs", _settings_debug.button_pressed)
	AppState.clear_error()
	AppState.clear_notice()
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
	_render()

func _import_map_image_from_form() -> void:
	if _map_image_path == null:
		return
	if WorldStore.import_map_image(_map_image_path.text.strip_edges(), "玩家地图"):
		AppState.set_notice("地图图片已导入。")
	else:
		AppState.set_error("地图图片导入失败。")
	_render()

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
			AppState.set_notice("已导入：%s" % WorldStore.world.get("name", "未命名世界"))
			AppState.navigate(&"exploration")
		else:
			_render()
	)
	_root.add_child(dialog)
	dialog.popup_centered()

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

func _parse_key_characters(text: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for line in text.split("\n", false):
		var parts := line.split("|", false)
		if parts.is_empty():
			continue
		result.append({
			"name": parts[0].strip_edges(),
			"role": parts[1].strip_edges() if parts.size() > 1 else "关键角色",
			"relationship": parts[2].strip_edges() if parts.size() > 2 else "未知",
			"description": parts[3].strip_edges() if parts.size() > 3 else "仍有许多未知之处。"
		})
	return result

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
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 62)
	row.add_theme_constant_override("separation", 12)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_label(title, 22, FG))
	left.add_child(_label(subtitle, 13, MUTED))
	row.add_child(left)
	row.add_child(_button("地图", func() -> void: AppState.navigate(&"map"), false))
	row.add_child(_button("人物", func() -> void: AppState.navigate(&"characters"), false))
	row.add_child(_button("时间线", func() -> void: AppState.navigate(&"timeline"), false))
	row.add_child(_button("世界观", func() -> void: AppState.navigate(&"world_lore"), false))
	return _padded(row, 14)

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
		["人物", &"characters"],
		["时间线", &"timeline"],
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
	panel.custom_minimum_size = Vector2(320, 0)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_constant_override("separation", 14)
	panel.add_child(_section_title("同行与状态", "当前可见角色和最近变化。"))
	for character in WorldStore.characters:
		var data := character as Dictionary
		if str(data.get("current_location_id", "")) == str(WorldStore.get_current_location().get("id", "")):
			panel.add_child(_mini_character(data))
	panel.add_child(_section_title("近期事件", "最近三条写入时间线的记录。"))
	var recent := WorldStore.timeline.slice(maxi(0, WorldStore.timeline.size() - 3), WorldStore.timeline.size())
	for event in recent:
		var data := event as Dictionary
		panel.add_child(_label("• %s" % data.get("title", ""), 13, MUTED))
	return _padded(panel, 16)

func _bottom_nav() -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 56)
	row.add_theme_constant_override("separation", 8)
	for item in [["探索", &"exploration"], ["地图", &"map"], ["人物", &"characters"], ["时间线", &"timeline"], ["世界观", &"world_lore"]]:
		var route := item[1] as StringName
		var btn := _button(str(item[0]), func(r := route) -> void: AppState.navigate(r), AppState.current_route == route)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(btn)
	return _padded(row, 8)

func _suggested_actions_bar() -> Control:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	for action in WorldStore.suggested_actions:
		row.add_child(_button(action, func(text := action) -> void:
			if _action_input:
				_action_input.text = text
		, false))
	return row

func _map_sidebar() -> Control:
	var sidebar := VBoxContainer.new()
	sidebar.custom_minimum_size = Vector2(340, 0) if _wide() else Vector2(0, 360)
	sidebar.add_theme_constant_override("separation", 10)
	sidebar.add_child(_section_title("地图图片", "输入 PNG/JPG/WebP 路径作为底图；导出 ZIP 时会一并打包。"))
	var current_map := WorldStore.world.get("map_image", {}) as Dictionary
	_map_image_path = _line_edit(str(current_map.get("image_path", "user://my_map.png")))
	sidebar.add_child(_field("图片路径", _map_image_path))
	sidebar.add_child(_button("选择地图图片", func() -> void:
		_open_map_file_dialog()
	, false))
	sidebar.add_child(_button("导入地图图片", func() -> void:
		_import_map_image_from_form()
	, false))
	var zoom_row := HBoxContainer.new()
	zoom_row.add_theme_constant_override("separation", 6)
	zoom_row.add_child(_button("缩小", func() -> void: _set_map_zoom(_map_zoom - 0.15), false))
	zoom_row.add_child(_button("重置", func() -> void: _set_map_zoom(1.0), false))
	zoom_row.add_child(_button("放大", func() -> void: _set_map_zoom(_map_zoom + 0.15), false))
	sidebar.add_child(_field("缩放 %.0f%%" % (_map_zoom * 100.0), zoom_row))
	var pan_row := HBoxContainer.new()
	pan_row.add_theme_constant_override("separation", 6)
	pan_row.add_child(_button("居中", func() -> void:
		_map_pan = Vector2.ZERO
		_render()
	, false))
	sidebar.add_child(_field("拖拽地图可平移", pan_row))
	sidebar.add_child(_section_title("已知地点", "点击地点可移动，移动会推进世界时间。"))
	for location in WorldStore.locations:
		var loc := location as Dictionary
		var btn := _button("%s · %s" % [loc.get("name", ""), loc.get("type", "")], func(id := str(loc.get("id", ""))) -> void:
			WorldStore.move_player_to(id)
			AppState.navigate(&"exploration")
		, str(loc.get("id", "")) == str(WorldStore.get_current_location().get("id", "")))
		sidebar.add_child(btn)
		sidebar.add_child(_label("控制：%s" % WorldStore.faction_name(str(loc.get("controlling_faction_id", ""))), 11, MUTED))
		var actions := HBoxContainer.new()
		actions.add_theme_constant_override("separation", 6)
		actions.add_child(_button("载入表单", func(data := loc.duplicate(true)) -> void:
			_fill_location_form(data)
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
	sidebar.add_child(_section_title("添加标记", "点击地图可自动填入归一化坐标。"))
	_map_location_name = _line_edit("风铃渡口")
	sidebar.add_child(_field("地点名称", _map_location_name))
	_map_location_type = _line_edit("town / ruin / forest / danger")
	sidebar.add_child(_field("类型", _map_location_type))
	_map_location_desc = _text_edit("这里需要玩家或 AI 进一步补全背景。", 70)
	sidebar.add_child(_field("描述", _map_location_desc))
	var coordinate_row := HBoxContainer.new()
	coordinate_row.add_theme_constant_override("separation", 8)
	_map_location_x = _spin(0.5, 0.05, 0.95, 0.01)
	coordinate_row.add_child(_field("X", _map_location_x))
	_map_location_y = _spin(0.5, 0.05, 0.95, 0.01)
	coordinate_row.add_child(_field("Y", _map_location_y))
	sidebar.add_child(coordinate_row)
	sidebar.add_child(_button("添加地点标记", func() -> void:
		_add_map_location_from_form()
	, true))
	return sidebar

func _map_marker(location: Dictionary) -> Button:
	var position := location.get("position", {}) as Dictionary
	var button := _button(str(location.get("name", "")), func(id := str(location.get("id", ""))) -> void:
		WorldStore.move_player_to(id)
		AppState.navigate(&"exploration")
	, str(location.get("id", "")) == str(WorldStore.get_current_location().get("id", "")))
	var map_size := _map_canvas_size()
	button.position = Vector2(float(position.get("x", 0.5)) * map_size.x, float(position.get("y", 0.5)) * map_size.y)
	button.custom_minimum_size = Vector2(128, 34) if _wide() else Vector2(96, 34)
	return button

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
		elif _touch_points.size() == 2:
			_last_pinch_distance = _current_pinch_distance()
	else:
		if _touch_points.has(event.index):
			_touch_points.erase(event.index)
		if _touch_points.is_empty():
			if _map_dragging and not _map_drag_moved:
				_fill_location_coordinates(event.position)
			_map_dragging = false
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

func _set_map_zoom(value: float) -> void:
	_map_zoom = clampf(value, 0.65, 1.75)
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
	var base := Vector2(640, 500) if _wide() else Vector2(320, 380)
	return base * _map_zoom

func _map_view_size() -> Vector2:
	return Vector2(520, 480) if _wide() else Vector2(300, 420)

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
	box.add_child(row)
	return _panel(box, 12, Color(INFO, 0.08), INFO)

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

func _character_card(character: Dictionary) -> Control:
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
	info.add_child(_label("%s · %s · %s" % [character.get("role", ""), character.get("relationship", "未知"), _location_name(str(character.get("current_location_id", "")))], 13, MUTED))
	header.add_child(info)
	box.add_child(header)
	box.add_child(_label(str(character.get("description", "")), 14, FG))
	box.add_child(_label("目标：%s" % ", ".join(character.get("goals", [])), 13, MUTED))
	box.add_child(_label("记忆：%s" % character.get("memory_summary", "未知"), 13, MUTED))
	box.add_child(_tag_row(character.get("personality", []), ""))
	return _panel(box)

func _timeline_card(event: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var time := event.get("world_time", {}) as Dictionary
	box.add_child(_label("第%s日 %02d:00 · %s" % [time.get("day", 1), int(time.get("hour", 0)), event.get("type", "")], 12, MUTED))
	box.add_child(_label(str(event.get("title", "")), 18, FG))
	box.add_child(_label(str(event.get("description", "")), 14, FG))
	box.add_child(_label("地点：%s" % _location_name(str(event.get("location_id", ""))), 12, MUTED))
	return _panel(box)

func _ai_log_card(log_entry: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var usage := log_entry.get("usage", {}) as Dictionary
	box.add_child(_label("%s · %s · %s" % [log_entry.get("id", ""), log_entry.get("purpose", ""), log_entry.get("status", "")], 13, ACCENT))
	box.add_child(_label(str(log_entry.get("response_summary", "")), 13, FG))
	box.add_child(_label("模型 %s · in %d / out %d" % [log_entry.get("model", ""), int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))], 12, MUTED))
	return _panel(box, 12)

func _ai_confirmation_panel() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label("AI 调用确认", 18, WARN))
	box.add_child(_label("%s · %s" % [_ai_confirm_request_id, _ai_confirm_purpose], 12, MUTED))
	box.add_child(_label(_ai_confirm_summary, 14, FG))
	box.add_child(_label("此操作可能消耗 Glosc One 额度；确认前当前世界状态已保持不变。", 12, MUTED))
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
				AppState.navigate(&"exploration")
			else:
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
	stack.add_child(_label(str(character.get("relationship", "未知")), 12, MUTED))
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

func _narrative_block(text: String, kind: String = "WORLD", title: String = "") -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	if not title.is_empty():
		box.add_child(_label("%s · %s" % [kind, title], 11, ACCENT))
	box.add_child(_label(text, 16, FG))
	return _panel(box)

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
	stack.add_child(_label(title, 13, MUTED))
	stack.add_child(control)
	return stack

func _line_edit(placeholder: String) -> LineEdit:
	var input := LineEdit.new()
	input.text = "" if placeholder.contains("输入") else placeholder
	input.placeholder_text = placeholder
	input.custom_minimum_size = Vector2(0, 40)
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
	check.add_theme_color_override("font_color", FG)
	return check

func _button(text: String, callback: Callable, primary: bool = false, override_color: Color = Color.TRANSPARENT) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 42)
	btn.pressed.connect(callback)
	var fill := ACCENT if primary else SURFACE
	var border := ACCENT if primary else BORDER
	var font := Color.WHITE if primary else FG
	if override_color != Color.TRANSPARENT:
		fill = Color.TRANSPARENT
		border = override_color
		font = override_color
	btn.add_theme_stylebox_override("normal", _style(fill, border, 8))
	btn.add_theme_stylebox_override("hover", _style(ACCENT_DIM if primary else SURFACE_ALT, ACCENT if primary else ACCENT, 8))
	btn.add_theme_stylebox_override("pressed", _style(ACCENT_DIM, ACCENT_DIM, 8))
	btn.add_theme_stylebox_override("disabled", _style(Color(BORDER, 0.5), BORDER, 8))
	btn.add_theme_color_override("font_color", font)
	btn.add_theme_color_override("font_disabled_color", MUTED)
	return btn

func _label(text: String, font_size: int, color: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = align
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
	return get_viewport_rect().size.x >= 900.0
