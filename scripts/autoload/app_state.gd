extends Node

signal route_changed(route: StringName)
signal global_error(message: String)
signal global_notice(message: String)

var current_route: StringName = &"main_menu"
var current_world_id: String = ""
var last_error: String = ""
var last_notice: String = ""

func navigate(route: StringName) -> void:
	if current_route == route:
		return
	# Banners are per-screen. Clear them on every route change so a message set on
	# one screen never leaks onto the next. Callers that want a message to appear
	# on the destination should call navigate() first, then set_notice/set_error,
	# or use navigate_with_notice().
	last_error = ""
	last_notice = ""
	current_route = route
	route_changed.emit(route)

func navigate_with_notice(route: StringName, notice: String) -> void:
	navigate(route)
	if not notice.is_empty():
		set_notice(notice)

func set_current_world(world_id: String) -> void:
	current_world_id = world_id

func set_error(message: String) -> void:
	last_error = message
	global_error.emit(message)

func set_notice(message: String) -> void:
	last_notice = message
	global_notice.emit(message)

func clear_error() -> void:
	last_error = ""

func clear_notice() -> void:
	last_notice = ""
