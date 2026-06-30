extends Node

const APP_SCENE := preload("res://scenes/app.tscn")

var _previous_confirm_ai_calls: bool = true
var _previous_show_usage_estimate: bool = true
var _previous_developer_mode: bool = false
var _previous_glosc_base_url: String = ""
var _previous_glosc_token: String = ""
var _app: Control

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
	var seed := {
		"world_name": "布局烟测",
		"genre": "奇幻",
		"tone": "冒险",
		"limits": "保持清晰、低剧透。",
		"hero": {
			"name": "断点测试者",
			"description": "界面验收员",
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
	_assert(WorldStore.has_world(), "UI breakpoint test world should exist")
	_seed_long_lists()
	_app = APP_SCENE.instantiate() as Control
	add_child(_app)
	await get_tree().process_frame
	await get_tree().process_frame
	for action_name in ["submit_action", "select_suggested_action", "toggle_fullscreen", "open_map", "open_journal", "zoom_map_in", "zoom_map_out", "pan_map", "place_marker", "toggle_map_focus", "cancel_ai_request"]:
		_assert(InputMap.has_action(action_name), "input action should be registered: %s" % action_name)
	for action_name in ["submit_action", "select_suggested_action", "open_map", "open_journal", "zoom_map_in", "zoom_map_out", "pan_map", "place_marker", "toggle_map_focus", "cancel_ai_request"]:
		_assert(_has_joypad_button_event(action_name), "core input action should have a joypad mapping: %s" % action_name)
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
		var size_name := str(size_data.get("name", ""))
		var size := size_data.get("size", Vector2i(1024, 768)) as Vector2i
		get_window().size = size
		await _settle()
		for route in routes:
			if route == &"new_world":
				_app.set("_new_world_step", 1)
			if route == &"map":
				_app.set("_map_focus_mode", false)
			AppState.navigate(route)
			await _settle()
			_assert_layout_health("%s %s" % [size_name, route], 8 if route == &"main_menu" else 12)
			if size.x < 900 and route in [&"exploration", &"map", &"locations", &"characters", &"timeline", &"threads", &"world_lore", &"settings"]:
				for nav_label in ["探索", "地图", "地点", "人物", "时间线", "设置"]:
					_assert(_has_button_text(_app, nav_label), "%s %s should expose mobile bottom nav: %s" % [size_name, route, nav_label])
			if route == &"main_menu":
				_assert(_count_labels_containing(_app, "Evolvria") >= 1, "%s main menu should render the game title" % size_name)
				_assert(_has_button_text(_app, "新建世界"), "%s main menu should expose new world action" % size_name)
			elif route == &"onboarding":
				_assert(_count_labels_containing(_app, "初始化配置") >= 1, "%s onboarding should render first-run setup" % size_name)
				_assert(_count_labels_containing(_app, "默认渠道商：Glosc AI") == 0, "%s onboarding should not show default-provider prompt" % size_name)
				_assert(_has_line_edit_placeholder(_app, "搜索或选择模型"), "%s onboarding should expose combined model search/select" % size_name)
				_assert(_has_button_text(_app, "获取 Glosc AI Key"), "%s onboarding should expose Glosc AI key acquisition link" % size_name)
				_assert(_has_button_text(_app, "保存并开始"), "%s onboarding should expose setup completion" % size_name)
			elif route == &"new_world":
				_assert(_count_labels_containing(_app, "步骤 1 / 5") >= 1, "%s new world should render a five-step wizard" % size_name)
				_assert(_has_button_text(_app, "下一步"), "%s new world should expose next-step navigation" % size_name)
				_assert(_count_labels_containing(_app, "世界基调") >= 1, "%s new world should start at world setup" % size_name)
			elif route == &"timeline":
				_assert(_count_labels_containing(_app, "长列表事件") <= 30, "%s timeline should paginate long event lists" % size_name)
				_assert(_has_button_text(_app, "加载更多事件"), "%s timeline should expose load-more control" % size_name)
				_assert(_count_labels_containing(_app, "原因：测试原因") >= 1, "%s timeline should show action outcome reasons" % size_name)
			elif route == &"world_lore":
				_assert(_count_labels_containing(_app, "ai_perf_") <= 8, "%s world lore should paginate AI logs" % size_name)
				_assert(_has_button_text(_app, "加载更多日志"), "%s world lore should expose AI log load-more control" % size_name)
				_assert(_has_button_text(_app, "运行一致性检查"), "%s world lore should expose an explicit consistency_check action" % size_name)
				_assert(_has_button_text(_app, "抽取最近事件记忆"), "%s world lore should expose an explicit memory_extract action" % size_name)
				_assert(_has_button_text(_app, "AI 整理阶段摘要"), "%s world lore should expose an explicit summary_update action" % size_name)
				_assert(_count_labels_containing(_app, "开发者状态查看器") >= 1, "%s world lore should expose developer state viewer when enabled" % size_name)
				_assert(_has_button_text(_app, "复制状态 JSON"), "%s world lore should allow copying state JSON" % size_name)
				_assert(_has_button_text(_app, "添加调试事件"), "%s world lore should expose debug event editor" % size_name)
			elif route == &"exploration":
				_assert(_count_labels_containing(_app, "同行角色") >= 1, "%s exploration should show companions panel" % size_name)
				_assert(_count_labels_containing(_app, "附近地点") >= 1, "%s exploration should show nearby locations panel" % size_name)
				_assert(_count_labels_containing(_app, "后果：测试后果") >= 1, "%s exploration should show action outcome consequences" % size_name)
				_assert(_count_labels_containing(_app, "发送前预估") >= 1, "%s exploration should show AI usage estimate" % size_name)
				_assert(_has_button_text(_app, "复制当前叙事"), "%s exploration should allow copying narrative text" % size_name)
			elif route == &"map":
				_assert(_count_labels_containing(_app, "地点详情") >= 1, "%s map should show selected location details beside the map" % size_name)
				_assert(_has_button_text(_app, "显示未知地点（0）"), "%s map should expose unknown location visibility toggle" % size_name)
				_assert(_has_button_text(_app, "进入地图主视图"), "%s map should expose a map-as-main-view toggle" % size_name)
				_assert(_has_button_text(_app, "生成幻想地图"), "%s map should expose local fantasy map generation" % size_name)
				_assert(_has_button_text(_app, "从参考图生成地图"), "%s map should expose reference-image map generation" % size_name)
				_assert(_count_labels_containing(_app, "平移（方向键/WASD）") >= 1, "%s map should expose keyboard-accessible pan controls" % size_name)
				_assert(_count_labels_containing(_app, "手柄十字键") >= 1, "%s map should expose controller-accessible pan guidance" % size_name)
				_assert(_count_labels_containing(_app, "长按地图") >= 1, "%s map should expose mobile long-press marker placement guidance" % size_name)
				_assert(_count_labels_containing(_app, "点击地点查看详情") >= 1, "%s map should make location selection before movement explicit" % size_name)
			elif route == &"characters":
				_assert(_has_button_text(_app, "离开同行"), "%s characters should allow companions to leave" % size_name)
				_assert(_has_button_text(_app, "邀请同行"), "%s characters should allow inviting companions" % size_name)
				for filter_label in ["全部", "同行", "敌对", "已遇见", "仅听闻"]:
					_assert(_has_button_text(_app, filter_label), "%s characters should expose filter: %s" % [size_name, filter_label])
				_assert(_count_labels_containing(_app, "最近相关事件") >= 1, "%s characters should show recent related events" % size_name)
			elif route == &"saves":
				_assert(_count_labels_containing(_app, "系统文件选择器、分享面板") >= 1, "%s saves should explain cross-platform ZIP handoff" % size_name)
				_assert(_count_labels_containing(_app, "导出后可在这里复制 ZIP 路径") >= 1, "%s saves should expose last-export affordance placeholder" % size_name)
			elif route == &"settings":
				_assert(_has_check_text(_app, "显示消耗预估"), "%s settings should expose usage estimate toggle" % size_name)
				_assert(_has_check_text(_app, "AI 响应后自动保存"), "%s settings should expose auto-save toggle" % size_name)
				_assert(_has_check_text(_app, "开发者模式"), "%s settings should expose developer mode toggle" % size_name)
				_assert(_has_check_text(_app, "全屏模式"), "%s settings should expose fullscreen window mode toggle" % size_name)
				_assert(_count_labels_containing(_app, "上下文面板宽度") >= 1, "%s settings should expose adjustable context panel width" % size_name)
				_assert(_has_button_text(_app, "应用布局设置"), "%s settings should allow applying layout width settings" % size_name)
				_assert(_has_check_text(_app, "允许本机保存访问令牌"), "%s settings should expose local token risk acknowledgement" % size_name)
				_assert(_count_labels_containing(_app, "连接状态") >= 1, "%s settings should show Glosc connection status" % size_name)
				_assert(_count_labels_containing(_app, "AI 请求前状态") >= 1, "%s settings should describe AI pre-request recovery" % size_name)
				_assert(_count_labels_containing(_app, "settings.json") >= 1, "%s settings should explain local token storage risk" % size_name)
				_assert(_count_labels_containing(_app, "默认渠道商：Glosc AI") == 0, "%s settings should not show default-provider prompt" % size_name)
				_assert(_has_line_edit_placeholder(_app, "搜索或选择模型"), "%s settings should expose combined model search/select" % size_name)
				_assert(_has_button_text(_app, "获取 Glosc AI Key"), "%s settings should expose Glosc AI key acquisition link" % size_name)
				_assert(_has_button_text(_app, "测试连接"), "%s settings should expose Glosc connection test" % size_name)
				_assert(_has_button_text(_app, "清除 AI 日志"), "%s settings should expose AI log clearing" % size_name)
				_assert(_has_button_text(_app, "重置所有设置"), "%s settings should expose settings reset" % size_name)
		for step in range(1, 6):
			_app.set("_new_world_step", step)
			AppState.navigate(&"new_world")
			_app.call("_render")
			await _settle()
			_assert_layout_health("%s new_world_step_%d" % [size_name, step])
			_assert(_count_labels_containing(_app, "步骤 %d / 5" % step) >= 1, "%s new world step %d should render its progress label" % [size_name, step])
			if step == 3:
				_assert(_count_labels_containing(_app, "解析预览") >= 1, "%s new world step 3 should preview parsed key characters" % size_name)
			elif step == 5:
				_assert(_count_labels_containing(_app, "关键角色解析") >= 1, "%s new world step 5 should show parsed key character fields" % size_name)
				_assert(_count_labels_containing(_app, "内容偏好/禁用") >= 1, "%s new world step 5 should show content preferences" % size_name)
				_assert(_count_labels_containing(_app, "主角能力/弱点") >= 1, "%s new world step 5 should show hero ability and weakness" % size_name)
				_assert(_count_labels_containing(_app, "行动倾向") >= 1, "%s new world step 5 should show key character action tendency" % size_name)
				_assert(_is_button_inside_viewport(_app, "确认并开始扩写"), "%s new world final action should stay visible without scrolling" % size_name)
				_assert(not _button_has_scroll_ancestor(_app, "确认并开始扩写"), "%s new world final action should be fixed outside the scrollable content" % size_name)
		AppState.navigate(&"map")
		_app.set("_map_focus_mode", true)
		_app.call("_render")
		await _settle()
		_assert_layout_health("%s map_focus" % size_name)
		_assert(_count_labels_containing(_app, "地图主视图") >= 1, "%s map focus should render main view title" % size_name)
		_app.set("_map_focus_mode", false)
	_app.set("_new_world_step", 1)
	AppState.navigate(&"new_world")
	await _settle()
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to protagonist step")
	await _settle()
	_assert(_count_labels_containing(_app, "主角设定") >= 1, "new world wizard step 2 should render protagonist settings")
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to key character step")
	await _settle()
	_assert(_has_button_text(_app, "+ 添加角色模板"), "new world wizard step 3 should allow adding key character rows")
	_assert(_has_button_text(_app, "+ 添加主线角色模板（女主/女二/女三/男二）"), "new world wizard step 3 should expose required main-cast templates")
	_assert(_count_labels_containing(_app, "女主、女二、女三、男二") >= 1, "new world wizard step 3 should explain main-cast coverage")
	var parsed_space := _app.call("_parse_key_characters", "Mira heroine ally calm archive_search protects_hero secret_keeper") as Array
	_assert(parsed_space.size() == 1, "key character parser should accept space-delimited text")
	var space_character := parsed_space[0] as Dictionary
	_assert(str(space_character.get("name", "")) == "Mira", "space-delimited key character should keep the first token as name")
	_assert(str(space_character.get("role", "")) == "heroine", "space-delimited key character should parse role")
	_assert(str(space_character.get("relationship", "")) == "ally", "space-delimited key character should parse relationship")
	_assert(str(space_character.get("action_tendency", "")) == "protects_hero", "space-delimited key character should parse action tendency")
	var parsed_labeled := _app.call("_parse_key_characters", "姓名:璃安 身份:女主 关系:同行 性格:温和,谨慎 目标:追查旧徽记 行动:保护主角 简述:隐藏秘密") as Array
	_assert(parsed_labeled.size() == 1, "key character parser should accept labeled text")
	var labeled_character := parsed_labeled[0] as Dictionary
	_assert(str(labeled_character.get("name", "")) == "璃安", "labeled key character should parse name")
	_assert(str(labeled_character.get("role", "")) == "女主", "labeled key character should parse role")
	_assert(str(labeled_character.get("description", "")) == "隐藏秘密", "labeled key character should parse description")
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to preferences step")
	await _settle()
	_assert(_count_labels_containing(_app, "NPC 自主行动频率") >= 1, "new world wizard step 4 should expose NPC autonomy preference")
	_assert(_count_labels_containing(_app, "叙事详细程度") >= 1, "new world wizard step 4 should expose narrative detail preference")
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to confirmation step")
	await _settle()
	_assert(_count_labels_containing(_app, "确认世界设定") >= 1, "new world wizard step 5 should show a pre-generation preview panel")
	_assert(_count_labels_containing(_app, "预计 AI 调用") >= 1, "new world wizard preview should include AI usage estimate")
	_assert(_count_labels_containing(_app, "内容偏好/禁用") >= 1, "new world wizard preview should include content preferences")
	_assert(_count_labels_containing(_app, "主角能力/弱点") >= 1, "new world wizard preview should include protagonist ability and weakness")
	_assert(_has_button_text(_app, "确认并开始扩写"), "new world wizard should expose final generation action")
	_assert(_press_button_text(_app, "上一步"), "new world wizard should allow returning from confirmation")
	await _settle()
	_assert(_count_labels_containing(_app, "内容与 AI 偏好") >= 1, "new world wizard previous button should return to editable preferences")
	AppState.navigate(&"map")
	await _settle()
	_assert(_press_button_text(_app, "进入地图主视图"), "map focus mode should be enterable from the sidebar")
	await _settle()
	_assert(_count_labels_containing(_app, "地图主视图") >= 1, "map focus mode should render a dedicated main-view panel")
	_assert(_has_button_text(_app, "退出主视图"), "map focus mode should expose an exit control")
	_assert(_press_button_text(_app, "退出主视图"), "map focus mode should be exitable")
	await _settle()
	AppState.navigate(&"map")
	await _settle()
	_assert(_has_button_text(_app, "从参考图生成地图"), "reference map generation should expose a file chooser action")
	_app.call("_open_reference_map_file_dialog")
	await _settle()
	_close_file_dialogs(get_tree().root)
	await _settle()
	var zoom_before := float(_app.get("_map_zoom"))
	var wheel_event := InputEventMouseButton.new()
	wheel_event.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel_event.pressed = true
	wheel_event.position = Vector2(120, 120)
	_assert(bool(_app.call("_handle_map_mouse_button", wheel_event)), "map wheel zoom should be handled")
	await _settle()
	_assert(float(_app.get("_map_zoom")) > zoom_before, "map wheel zoom should increase zoom")
	var pinch_before := float(_app.get("_map_zoom"))
	var magnify_event := InputEventMagnifyGesture.new()
	magnify_event.factor = 1.12
	magnify_event.position = Vector2(140, 140)
	_assert(bool(_app.call("_handle_map_magnify_gesture", magnify_event)), "map magnify gesture should be handled")
	await _settle()
	_assert(float(_app.get("_map_zoom")) > pinch_before, "map magnify gesture should increase zoom")
	AppState.navigate(&"characters")
	await _settle()
	_assert(_press_button_text(_app, "敌对"), "hostile character filter should be pressable")
	await _settle()
	_assert(_count_labels_containing(_app, "岚") >= 1, "hostile character filter should keep rival characters visible")
	_assert(_count_labels_containing(_app, "诺拉") == 0, "hostile character filter should hide companion characters")
	_assert(_press_button_text(_app, "全部"), "all character filter should be pressable")
	await _settle()
	SettingsStore.settings["show_usage_estimate"] = false
	AppState.navigate(&"exploration")
	await _settle()
	_assert(_count_labels_containing(_app, "发送前预估") == 0, "usage estimate toggle should hide exploration estimate")
	SettingsStore.settings["show_usage_estimate"] = true
	AppState.navigate(&"exploration")
	await _settle()
	var first_suggested := str(WorldStore.suggested_actions[0])
	_assert(bool(_app.call("_select_suggested_action", 0)), "suggested action shortcut should select a recommendation")
	await _settle()
	_assert(_count_line_edits_with_text(_app, first_suggested) >= 1, "selected suggested action should populate the action input")
	AppState.navigate(&"settings")
	await _settle()
	var logs_before_clear := WorldStore.ai_logs.size()
	_assert(_press_button_text(_app, "清除 AI 日志"), "clear AI logs button should be pressable")
	await _settle()
	_assert(WorldStore.ai_logs.size() == logs_before_clear, "first clear logs click should not clear before confirmation")
	_assert(_has_button_text(_app, "确认清除 AI 日志"), "clear AI logs should require explicit confirmation")
	_assert(_press_button_text(_app, "取消清除日志"), "clear logs cancel button should be pressable")
	await _settle()
	_assert(WorldStore.ai_logs.size() == logs_before_clear, "cancelled clear logs should keep logs")
	_assert(_press_button_text(_app, "重置所有设置"), "reset settings button should be pressable")
	await _settle()
	_assert(_has_button_text(_app, "确认重置设置"), "settings reset should require explicit confirmation")
	_assert(_press_button_text(_app, "取消重置设置"), "reset settings cancel button should be pressable")
	await _settle()
	_assert(_press_button_text(_app, "删除当前世界"), "delete world button should be pressable")
	await _settle()
	_assert(WorldStore.has_world(), "first delete click should not delete world before confirmation")
	_assert(_has_button_text(_app, "确认永久删除"), "delete world should require explicit confirmation")
	_assert(_press_button_text(_app, "取消删除"), "delete cancel button should be pressable")
	await _settle()
	_assert(WorldStore.has_world(), "cancelled delete should keep world")
	WorldStore.reset_world()
	AppState.navigate(&"main_menu")
	await _settle()
	_assert(_count_labels_containing(_app, "暂无可继续的本地世界") >= 1, "main menu should explain disabled continue when no local world exists")
	print("Evolvria UI breakpoint test passed: %d sizes x %d routes" % [sizes.size(), routes.size()])
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
	SettingsStore.settings["glosc_base_url"] = _previous_glosc_base_url
	SettingsStore.settings["glosc_token"] = _previous_glosc_token
	WorldStore.reset_world()
	get_tree().quit()

func _settle() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

func _seed_long_lists() -> void:
	var current_location_id := str(WorldStore.get_current_location().get("id", "loc_start"))
	for index in range(80):
		WorldStore.add_event(
			"world_event",
			"长列表事件 %03d" % index,
			"用于验证长时间线不会一次性渲染全部项目。",
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
		{"outcome": "cost", "outcome_label": "代价成功", "outcome_reason": "测试原因", "consequence": "测试后果"}
	)
	for index in range(20):
		WorldStore.record_ai_log("perf_fixture", {
			"request_id": "ai_perf_%03d" % index,
			"status": "ok",
			"summary": "长日志分页 fixture",
			"usage": {"input_tokens": 1, "output_tokens": 1, "cost": null}
		}, "长日志分页 fixture")

func _assert_layout_health(context: String, min_visible_controls: int = 12) -> void:
	_assert(_app.get_child_count() > 0, "%s should render root children" % context)
	_assert(_count_visible_controls(_app) >= min_visible_controls, "%s should render a usable control tree" % context)
	_assert(_has_positive_rect(_app), "%s should have positive root rect" % context)
	_assert(_count_visible_horizontal_scrollbars(_app) == 0, "%s should not expose horizontal scrollbars" % context)
	var button_issue := _find_unreadable_button(_app)
	_assert(button_issue.is_empty(), "%s should keep button text readable: %s" % [context, button_issue])

func _count_visible_controls(root: Node) -> int:
	var count := 0
	if root is Control and (root as Control).visible:
		count += 1
	for child in root.get_children():
		count += _count_visible_controls(child)
	return count

func _has_positive_rect(control: Control) -> bool:
	return control.get_global_rect().size.x > 0.0 and control.get_global_rect().size.y > 0.0

func _count_visible_horizontal_scrollbars(root: Node) -> int:
	var count := 0
	if root is ScrollContainer:
		var hbar := (root as ScrollContainer).get_h_scroll_bar()
		if hbar != null and hbar.visible and hbar.max_value > hbar.page + 1.0:
			count += 1
	for child in root.get_children():
		count += _count_visible_horizontal_scrollbars(child)
	return count

func _find_unreadable_button(root: Node) -> String:
	if root is Button:
		var button := root as Button
		var text := str(button.text).strip_edges()
		if button.is_visible_in_tree() and not text.is_empty():
			var font := button.get_theme_font("font")
			var font_size := button.get_theme_font_size("font_size")
			var stylebox := button.get_theme_stylebox("normal")
			var horizontal_padding := 0.0
			if stylebox != null:
				horizontal_padding = stylebox.get_margin(SIDE_LEFT) + stylebox.get_margin(SIDE_RIGHT)
			var text_width := 0.0
			if font != null:
				text_width = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1.0, font_size).x
			var available_width := button.size.x - horizontal_padding
			if available_width + 1.0 < text_width:
				return "\"%s\" needs %.1f px text space, has %.1f px" % [text, text_width, available_width]
	for child in root.get_children():
		var issue := _find_unreadable_button(child)
		if not issue.is_empty():
			return issue
	return ""

func _count_labels_containing(root: Node, text: String) -> int:
	var count := 0
	if root is Label and str((root as Label).text).contains(text):
		count += 1
	for child in root.get_children():
		count += _count_labels_containing(child, text)
	return count

func _count_line_edits_with_text(root: Node, text: String) -> int:
	var count := 0
	if root is LineEdit and str((root as LineEdit).text) == text:
		count += 1
	for child in root.get_children():
		count += _count_line_edits_with_text(child, text)
	return count

func _has_button_text(root: Node, text: String) -> bool:
	if root is Button and str((root as Button).text) == text:
		return true
	for child in root.get_children():
		if _has_button_text(child, text):
			return true
	return false

func _press_button_text(root: Node, text: String) -> bool:
	if root is Button and str((root as Button).text) == text:
		(root as Button).pressed.emit()
		return true
	for child in root.get_children():
		if _press_button_text(child, text):
			return true
	return false

func _is_button_inside_viewport(root: Node, text: String) -> bool:
	if root is Button and str((root as Button).text) == text:
		var button := root as Button
		if not button.is_visible_in_tree():
			return false
		var viewport_rect := get_viewport().get_visible_rect()
		return viewport_rect.encloses(button.get_global_rect())
	for child in root.get_children():
		if _is_button_inside_viewport(child, text):
			return true
	return false

func _button_has_scroll_ancestor(root: Node, text: String) -> bool:
	if root is Button and str((root as Button).text) == text:
		var parent := root.get_parent()
		while parent != null:
			if parent is ScrollContainer:
				return true
			parent = parent.get_parent()
		return false
	for child in root.get_children():
		if _button_has_scroll_ancestor(child, text):
			return true
	return false

func _close_file_dialogs(root: Node) -> void:
	if root is Window and str((root as Window).title).contains("选择"):
		root.queue_free()
		return
	for child in root.get_children(true):
		_close_file_dialogs(child)

func _has_check_text(root: Node, text: String) -> bool:
	if root is CheckBox and str((root as CheckBox).text) == text:
		return true
	for child in root.get_children():
		if _has_check_text(child, text):
			return true
	return false

func _has_line_edit_placeholder(root: Node, text: String) -> bool:
	if root is LineEdit and str((root as LineEdit).placeholder_text) == text:
		return true
	for child in root.get_children():
		if _has_line_edit_placeholder(child, text):
			return true
	return false

func _has_joypad_button_event(action_name: StringName) -> bool:
	for event in InputMap.action_get_events(action_name):
		if event is InputEventJoypadButton:
			return true
	return false

func _assert(condition: bool, message: String) -> void:
	if condition:
		return
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
	SettingsStore.settings["glosc_base_url"] = _previous_glosc_base_url
	SettingsStore.settings["glosc_token"] = _previous_glosc_token
	push_error(message)
	WorldStore.reset_world()
	get_tree().quit(1)
