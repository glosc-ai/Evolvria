extends Node

const APP_SCENE := preload("res://scenes/app.tscn")

var _previous_confirm_ai_calls: bool = true
var _previous_show_usage_estimate: bool = true
var _previous_developer_mode: bool = false
var _app: Control

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	_previous_confirm_ai_calls = bool(SettingsStore.get_value("confirm_ai_calls", true))
	_previous_show_usage_estimate = bool(SettingsStore.get_value("show_usage_estimate", true))
	_previous_developer_mode = bool(SettingsStore.get_value("developer_mode", false))
	SettingsStore.settings["confirm_ai_calls"] = false
	SettingsStore.settings["show_usage_estimate"] = true
	SettingsStore.settings["developer_mode"] = true
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
		{"name": "desktop_wide", "size": Vector2i(1440, 900)},
		{"name": "desktop_narrow", "size": Vector2i(820, 900)},
		{"name": "phone_portrait", "size": Vector2i(390, 844)},
		{"name": "phone_landscape", "size": Vector2i(844, 390)},
		{"name": "tablet_landscape", "size": Vector2i(1180, 820)},
		{"name": "tablet_split", "size": Vector2i(700, 900)}
	]
	var routes: Array[StringName] = [&"onboarding", &"new_world", &"exploration", &"map", &"locations", &"characters", &"timeline", &"threads", &"world_lore", &"saves", &"settings"]
	for size_data in sizes:
		var size := size_data.get("size", Vector2i(1024, 768)) as Vector2i
		get_window().size = size
		await _settle()
		for route in routes:
			AppState.navigate(route)
			await _settle()
			_assert(_app.get_child_count() > 0, "%s %s should render root children" % [size_data.get("name", ""), route])
			_assert(_count_visible_controls(_app) >= 12, "%s %s should render a usable control tree" % [size_data.get("name", ""), route])
			_assert(_has_positive_rect(_app), "%s %s should have positive root rect" % [size_data.get("name", ""), route])
			_assert(_count_visible_horizontal_scrollbars(_app) == 0, "%s %s should not expose horizontal scrollbars" % [size_data.get("name", ""), route])
			if size.x < 900 and route in [&"exploration", &"map", &"locations", &"characters", &"timeline", &"threads", &"world_lore", &"settings"]:
				for nav_label in ["探索", "地图", "地点", "人物", "时间线", "设置"]:
					_assert(_has_button_text(_app, nav_label), "%s %s should expose mobile bottom nav: %s" % [size_data.get("name", ""), route, nav_label])
			if route == &"onboarding":
				_assert(_count_labels_containing(_app, "初始化配置") >= 1, "%s onboarding should render first-run setup" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "默认渠道商：Glosc AI") >= 1, "%s onboarding should default to Glosc AI" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "没有key?现在获取"), "%s onboarding should expose Glosc AI key acquisition link" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "保存并开始"), "%s onboarding should expose setup completion" % size_data.get("name", ""))
			elif route == &"new_world":
				_assert(_count_labels_containing(_app, "步骤 1 / 5") >= 1, "%s new world should render a five-step wizard" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "下一步"), "%s new world should expose next-step navigation" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "世界基调") >= 1, "%s new world should start at world setup" % size_data.get("name", ""))
			elif route == &"timeline":
				_assert(_count_labels_containing(_app, "长列表事件") <= 30, "%s timeline should paginate long event lists" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "加载更多事件"), "%s timeline should expose load-more control" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "原因：测试原因") >= 1, "%s timeline should show action outcome reasons" % size_data.get("name", ""))
			elif route == &"world_lore":
				_assert(_count_labels_containing(_app, "ai_perf_") <= 8, "%s world lore should paginate AI logs" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "加载更多日志"), "%s world lore should expose AI log load-more control" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "运行一致性检查"), "%s world lore should expose an explicit consistency_check action" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "抽取最近事件记忆"), "%s world lore should expose an explicit memory_extract action" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "AI 整理阶段摘要"), "%s world lore should expose an explicit summary_update action" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "开发者状态查看器") >= 1, "%s world lore should expose developer state viewer when enabled" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "复制状态 JSON"), "%s world lore should allow copying state JSON" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "添加调试事件"), "%s world lore should expose debug event editor" % size_data.get("name", ""))
			elif route == &"exploration":
				_assert(_count_labels_containing(_app, "同行角色") >= 1, "%s exploration should show companions panel" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "附近地点") >= 1, "%s exploration should show nearby locations panel" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "后果：测试后果") >= 1, "%s exploration should show action outcome consequences" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "发送前预估") >= 1, "%s exploration should show AI usage estimate" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "复制当前叙事"), "%s exploration should allow copying narrative text" % size_data.get("name", ""))
			elif route == &"map":
				_assert(_count_labels_containing(_app, "地点详情") >= 1, "%s map should show selected location details beside the map" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "显示未知地点（0）"), "%s map should expose unknown location visibility toggle" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "进入地图主视图"), "%s map should expose a map-as-main-view toggle" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "平移（方向键/WASD）") >= 1, "%s map should expose keyboard-accessible pan controls" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "手柄十字键") >= 1, "%s map should expose controller-accessible pan guidance" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "长按地图") >= 1, "%s map should expose mobile long-press marker placement guidance" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "点击地点查看详情") >= 1, "%s map should make location selection before movement explicit" % size_data.get("name", ""))
			elif route == &"characters":
				_assert(_has_button_text(_app, "离开同行"), "%s characters should allow companions to leave" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "邀请同行"), "%s characters should allow inviting companions" % size_data.get("name", ""))
				for filter_label in ["全部", "同行", "敌对", "已遇见", "仅听闻"]:
					_assert(_has_button_text(_app, filter_label), "%s characters should expose filter: %s" % [size_data.get("name", ""), filter_label])
				_assert(_count_labels_containing(_app, "最近相关事件") >= 1, "%s characters should show recent related events" % size_data.get("name", ""))
			elif route == &"saves":
				_assert(_count_labels_containing(_app, "系统文件选择器、分享面板") >= 1, "%s saves should explain cross-platform ZIP handoff" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "导出后可在这里复制 ZIP 路径") >= 1, "%s saves should expose last-export affordance placeholder" % size_data.get("name", ""))
			elif route == &"settings":
				_assert(_has_check_text(_app, "显示消耗预估"), "%s settings should expose usage estimate toggle" % size_data.get("name", ""))
				_assert(_has_check_text(_app, "AI 响应后自动保存"), "%s settings should expose auto-save toggle" % size_data.get("name", ""))
				_assert(_has_check_text(_app, "开发者模式"), "%s settings should expose developer mode toggle" % size_data.get("name", ""))
				_assert(_has_check_text(_app, "全屏模式"), "%s settings should expose fullscreen window mode toggle" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "上下文面板宽度") >= 1, "%s settings should expose adjustable context panel width" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "应用布局设置"), "%s settings should allow applying layout width settings" % size_data.get("name", ""))
				_assert(_has_check_text(_app, "我理解访问令牌会保存在本机设置文件中"), "%s settings should expose local token risk acknowledgement" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "连接状态") >= 1, "%s settings should show Glosc connection status" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "AI 请求前状态") >= 1, "%s settings should describe AI pre-request recovery" % size_data.get("name", ""))
				_assert(_count_labels_containing(_app, "settings.json") >= 1, "%s settings should explain local token storage risk" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "没有key?现在获取"), "%s settings should expose Glosc AI key acquisition link" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "测试连接"), "%s settings should expose Glosc connection test" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "清除 AI 日志"), "%s settings should expose AI log clearing" % size_data.get("name", ""))
				_assert(_has_button_text(_app, "重置所有设置"), "%s settings should expose settings reset" % size_data.get("name", ""))
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
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to preferences step")
	await _settle()
	_assert(_count_labels_containing(_app, "NPC 自主行动频率") >= 1, "new world wizard step 4 should expose NPC autonomy preference")
	_assert(_count_labels_containing(_app, "叙事详细程度") >= 1, "new world wizard step 4 should expose narrative detail preference")
	_assert(_press_button_text(_app, "下一步"), "new world wizard should advance to confirmation step")
	await _settle()
	_assert(_count_labels_containing(_app, "确认世界设定") >= 1, "new world wizard step 5 should show a pre-generation preview panel")
	_assert(_count_labels_containing(_app, "预计 AI 调用") >= 1, "new world wizard preview should include AI usage estimate")
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
	print("Evolvria UI breakpoint test passed: %d sizes x %d routes" % [sizes.size(), routes.size()])
	SettingsStore.settings["confirm_ai_calls"] = _previous_confirm_ai_calls
	SettingsStore.settings["show_usage_estimate"] = _previous_show_usage_estimate
	SettingsStore.settings["developer_mode"] = _previous_developer_mode
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

func _has_check_text(root: Node, text: String) -> bool:
	if root is CheckBox and str((root as CheckBox).text) == text:
		return true
	for child in root.get_children():
		if _has_check_text(child, text):
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
	push_error(message)
	WorldStore.reset_world()
	get_tree().quit(1)
