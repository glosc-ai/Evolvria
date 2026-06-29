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
	current_route = route
	route_changed.emit(route)

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
