extends Node

signal save_completed(world_id: String)
signal load_completed(world_id: String)
signal export_completed(path: String)
signal import_completed(world_id: String)
signal save_error(message: String)

const SAVE_DIR := "user://saves"
const EXPORT_DIR := "user://exports"
const ACTIVE_SAVE := "user://saves/active_world.json"
const TEMP_SAVE := "user://saves/active_world.tmp"

func _ready() -> void:
	_ensure_save_dir()

func _ensure_save_dir() -> void:
	var absolute_dir := ProjectSettings.globalize_path(SAVE_DIR)
	DirAccess.make_dir_recursive_absolute(absolute_dir)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(EXPORT_DIR))

func has_save() -> bool:
	return FileAccess.file_exists(ACTIVE_SAVE)

func save_game(payload: Dictionary) -> void:
	_ensure_save_dir()
	var file := FileAccess.open(TEMP_SAVE, FileAccess.WRITE)
	if file == null:
		var message := "无法创建临时存档。"
		save_error.emit(message)
		AppState.set_error(message)
		return
	file.store_string(JSON.stringify(payload, "\t"))
	file.close()

	var absolute_temp := ProjectSettings.globalize_path(TEMP_SAVE)
	var absolute_save := ProjectSettings.globalize_path(ACTIVE_SAVE)
	if FileAccess.file_exists(ACTIVE_SAVE):
		DirAccess.remove_absolute(absolute_save)
	var err := DirAccess.rename_absolute(absolute_temp, absolute_save)
	if err != OK:
		var message := "无法替换存档文件：%s" % error_string(err)
		save_error.emit(message)
		AppState.set_error(message)
		return
	save_completed.emit(str(payload.get("world", {}).get("id", "")))

func load_game() -> Dictionary:
	if not FileAccess.file_exists(ACTIVE_SAVE):
		return {}
	var file := FileAccess.open(ACTIVE_SAVE, FileAccess.READ)
	if file == null:
		var message := "无法读取存档。"
		save_error.emit(message)
		AppState.set_error(message)
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary:
		var message := "存档格式无效。"
		save_error.emit(message)
		AppState.set_error(message)
		return {}
	load_completed.emit(str(parsed.get("world", {}).get("id", "")))
	return parsed

func delete_save() -> void:
	if FileAccess.file_exists(ACTIVE_SAVE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(ACTIVE_SAVE))

func export_world(payload: Dictionary, include_ai_logs: bool = true) -> String:
	_ensure_save_dir()
	if payload.is_empty() or not payload.has("world"):
		_emit_error("没有可导出的世界存档。")
		return ""

	var world_data := payload.get("world", {}) as Dictionary
	var world_id := str(world_data.get("id", "world"))
	var timestamp := Time.get_datetime_string_from_system(false).replace(":", "-")
	var export_path := "%s/%s_%s.zip" % [EXPORT_DIR, world_id, timestamp]
	var absolute_export_path := ProjectSettings.globalize_path(export_path)
	var packer := ZIPPacker.new()
	var open_error := packer.open(absolute_export_path)
	if open_error != OK:
		_emit_error("无法创建导出文件：%s" % error_string(open_error))
		return ""

	var manifest := {
		"schema_version": int(payload.get("schema_version", 1)),
		"world_id": world_id,
		"display_name": str(world_data.get("name", "未命名世界")),
		"exported_at": Time.get_datetime_string_from_system(true),
		"files": {
			"world": "world.json",
			"characters": "characters.json",
			"locations": "locations.json",
			"factions": "factions.json",
			"timeline": "timeline.jsonl",
			"memories": "memories.jsonl",
			"ai_logs": "ai_logs.jsonl" if include_ai_logs else ""
		},
		"maps": []
	}
	var map_image := world_data.get("map_image", {}) as Dictionary
	var map_image_path := str(map_image.get("image_path", ""))
	var map_archive_path := ""
	if not map_image_path.is_empty() and FileAccess.file_exists(map_image_path):
		map_archive_path = "maps/%s" % map_image_path.get_file()
		manifest["maps"] = [map_archive_path]

	_write_zip_text(packer, "manifest.json", JSON.stringify(manifest, "\t"))
	_write_zip_text(packer, "world.json", JSON.stringify(world_data, "\t"))
	_write_zip_text(packer, "characters.json", JSON.stringify(payload.get("characters", []), "\t"))
	_write_zip_text(packer, "locations.json", JSON.stringify(payload.get("locations", []), "\t"))
	_write_zip_text(packer, "factions.json", JSON.stringify(payload.get("factions", []), "\t"))
	_write_zip_text(packer, "timeline.jsonl", _jsonl(payload.get("timeline", [])))
	_write_zip_text(packer, "memories.jsonl", _jsonl(payload.get("memories", [])))
	if include_ai_logs:
		_write_zip_text(packer, "ai_logs.jsonl", _jsonl(payload.get("ai_logs", [])))
	if not map_archive_path.is_empty():
		_write_zip_bytes(packer, map_archive_path, FileAccess.get_file_as_bytes(map_image_path))
	packer.close()
	export_completed.emit(export_path)
	return export_path

func import_world(zip_path: String) -> Dictionary:
	if zip_path.strip_edges().is_empty() or not FileAccess.file_exists(zip_path):
		_emit_error("导入文件不存在。")
		return {}
	var reader := ZIPReader.new()
	var open_error := reader.open(ProjectSettings.globalize_path(zip_path) if zip_path.begins_with("user://") else zip_path)
	if open_error != OK:
		_emit_error("无法打开导入 ZIP：%s" % error_string(open_error))
		return {}
	var manifest: Dictionary = _read_zip_json(reader, "manifest.json") as Dictionary
	if manifest.is_empty():
		reader.close()
		_emit_error("导入包缺少 manifest.json。")
		return {}
	if int(manifest.get("schema_version", 0)) != 1:
		reader.close()
		_emit_error("不支持的存档版本：%s" % manifest.get("schema_version", "未知"))
		return {}

	var world_data: Dictionary = _read_zip_json(reader, "world.json") as Dictionary
	var characters: Variant = _read_zip_json(reader, "characters.json")
	var locations: Variant = _read_zip_json(reader, "locations.json")
	var factions: Variant = _read_zip_json(reader, "factions.json")
	if world_data.is_empty() or not (characters is Array) or not (locations is Array):
		reader.close()
		_emit_error("导入包缺少必要世界数据。")
		return {}
	if not factions is Array:
		factions = []
	var payload := {
		"schema_version": 1,
		"world": world_data,
		"characters": characters,
		"locations": locations,
		"factions": factions,
		"timeline": _read_zip_jsonl(reader, "timeline.jsonl"),
		"memories": _read_zip_jsonl(reader, "memories.jsonl"),
		"ai_logs": _read_zip_jsonl(reader, "ai_logs.jsonl"),
		"suggested_actions": [],
		"event_counter": _count_jsonl_ids(_read_zip_jsonl(reader, "timeline.jsonl"), "evt_"),
		"memory_counter": _count_jsonl_ids(_read_zip_jsonl(reader, "memories.jsonl"), "mem_"),
		"location_counter": _count_location_ids(locations as Array),
		"updated_at": Time.get_datetime_string_from_system(true)
	}
	_restore_map_image(reader, world_data)
	payload["world"] = world_data
	reader.close()
	save_game(payload)
	import_completed.emit(str(world_data.get("id", "")))
	return payload

func _write_zip_text(packer: ZIPPacker, file_path: String, text: String) -> void:
	var err := packer.start_file(file_path)
	if err != OK:
		_emit_error("无法写入导出条目 %s：%s" % [file_path, error_string(err)])
		return
	packer.write_file(text.to_utf8_buffer())
	packer.close_file()

func _write_zip_bytes(packer: ZIPPacker, file_path: String, bytes: PackedByteArray) -> void:
	if bytes.is_empty():
		return
	var err := packer.start_file(file_path)
	if err != OK:
		_emit_error("无法写入导出条目 %s：%s" % [file_path, error_string(err)])
		return
	packer.write_file(bytes)
	packer.close_file()

func _jsonl(value: Variant) -> String:
	var lines: Array[String] = []
	if value is Array:
		for item in value:
			lines.append(JSON.stringify(item))
	return "\n".join(lines)

func _read_zip_json(reader: ZIPReader, file_path: String) -> Variant:
	if not file_path in reader.get_files():
		return {}
	var bytes := reader.read_file(file_path)
	if bytes.is_empty():
		return {}
	var parsed = JSON.parse_string(bytes.get_string_from_utf8())
	return parsed if parsed != null else {}

func _read_zip_jsonl(reader: ZIPReader, file_path: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not file_path in reader.get_files():
		return result
	var text := reader.read_file(file_path).get_string_from_utf8()
	for line in text.split("\n", false):
		var parsed = JSON.parse_string(line)
		if parsed is Dictionary:
			result.append(parsed)
	return result

func _restore_map_image(reader: ZIPReader, world_data: Dictionary) -> void:
	var map_image := world_data.get("map_image", {}) as Dictionary
	var original_path := str(map_image.get("image_path", ""))
	if original_path.is_empty():
		return
	var archive_path := "maps/%s" % original_path.get_file()
	if not archive_path in reader.get_files():
		return
	var maps_dir := "user://saves/maps"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(maps_dir))
	var target_path := "%s/%s" % [maps_dir, original_path.get_file()]
	var file := FileAccess.open(target_path, FileAccess.WRITE)
	if file == null:
		return
	file.store_buffer(reader.read_file(archive_path))
	file.close()
	map_image["image_path"] = target_path
	world_data["map_image"] = map_image

func _count_jsonl_ids(items: Array[Dictionary], prefix: String) -> int:
	var highest := 0
	for item in items:
		var id := str(item.get("id", ""))
		if id.begins_with(prefix):
			highest = maxi(highest, int(id.trim_prefix(prefix)))
	return highest

func _count_location_ids(items: Array) -> int:
	var highest := 100
	for item in items:
		if not item is Dictionary:
			continue
		var id := str((item as Dictionary).get("id", ""))
		if id.begins_with("loc_custom_"):
			highest = maxi(highest, int(id.trim_prefix("loc_custom_")))
	return highest

func _emit_error(message: String) -> void:
	save_error.emit(message)
	AppState.set_error(message)
