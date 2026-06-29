extends Node

signal save_completed(world_id: String)
signal load_completed(world_id: String)
signal export_completed(path: String)
signal import_completed(world_id: String)
signal save_error(message: String)

const SAVE_DIR := "user://saves"
const EXPORT_DIR := "user://exports"
const BACKUP_DIR := "user://saves/backups"
const ACTIVE_SAVE := "user://saves/active_world.json"
const TEMP_SAVE := "user://saves/active_world.tmp"
const AI_CHECKPOINT := "user://saves/backups/ai_before_request.json"
const AI_CHECKPOINT_TEMP := "user://saves/backups/ai_before_request.tmp"
const MAX_AUTO_BACKUPS := 5

var _last_world_export_path: String = ""

func _ready() -> void:
	_ensure_save_dir()

func _ensure_save_dir() -> void:
	var absolute_dir := ProjectSettings.globalize_path(SAVE_DIR)
	DirAccess.make_dir_recursive_absolute(absolute_dir)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(EXPORT_DIR))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(BACKUP_DIR))

func has_save() -> bool:
	return FileAccess.file_exists(ACTIVE_SAVE)

func list_backup_files() -> Array[String]:
	_ensure_save_dir()
	var backups: Array[String] = []
	var dir := DirAccess.open(BACKUP_DIR)
	if dir == null:
		return backups
	for file_name in dir.get_files():
		if file_name.begins_with("active_world_") and file_name.ends_with(".json"):
			backups.append("%s/%s" % [BACKUP_DIR, file_name])
	backups.sort()
	return backups

func list_backup_entries() -> Array[Dictionary]:
	var files := list_backup_files()
	var entries: Array[Dictionary] = []
	for index in range(files.size() - 1, -1, -1):
		entries.append(_read_backup_metadata(files[index]))
	return entries

func get_active_save_entry() -> Dictionary:
	if not has_save():
		return {}
	var entry := _read_backup_metadata(ACTIVE_SAVE)
	entry["kind"] = "active"
	entry["created_at"] = "当前存档"
	entry["path"] = ACTIVE_SAVE
	entry["absolute_path"] = ProjectSettings.globalize_path(ACTIVE_SAVE)
	return entry

func has_ai_checkpoint() -> bool:
	return FileAccess.file_exists(AI_CHECKPOINT)

func get_ai_checkpoint_entry() -> Dictionary:
	if not has_ai_checkpoint():
		return {}
	var entry := _read_backup_metadata(AI_CHECKPOINT)
	entry["kind"] = "ai_checkpoint"
	entry["created_at"] = "最近 AI 请求前"
	entry["path"] = AI_CHECKPOINT
	entry["absolute_path"] = ProjectSettings.globalize_path(AI_CHECKPOINT)
	return entry

func get_save_dir_path() -> String:
	_ensure_save_dir()
	return ProjectSettings.globalize_path(SAVE_DIR)

func get_export_dir_path() -> String:
	_ensure_save_dir()
	return ProjectSettings.globalize_path(EXPORT_DIR)

func get_backup_dir_path() -> String:
	_ensure_save_dir()
	return ProjectSettings.globalize_path(BACKUP_DIR)

func get_last_world_export_path() -> String:
	return _last_world_export_path

func get_shareable_file_path(path: String) -> String:
	if path.strip_edges().is_empty():
		return ""
	return ProjectSettings.globalize_path(path) if path.begins_with("user://") else path

func open_or_share_export_file(path: String = "") -> bool:
	var target_path := path if not path.strip_edges().is_empty() else _last_world_export_path
	var absolute_path := get_shareable_file_path(target_path)
	if absolute_path.is_empty() or not FileAccess.file_exists(target_path):
		_emit_error("没有可打开或分享的导出文件。")
		return false
	var error := OS.shell_open(absolute_path)
	if error != OK:
		_emit_error("无法打开或分享导出文件：%s" % error_string(error))
		return false
	return true

func can_reveal_directories() -> bool:
	return OS.get_name() in ["Windows", "macOS", "Linux", "FreeBSD", "NetBSD", "OpenBSD", "BSD"]

func reveal_export_dir() -> bool:
	_ensure_save_dir()
	return _reveal_path(EXPORT_DIR)

func reveal_backup_dir() -> bool:
	_ensure_save_dir()
	return _reveal_path(BACKUP_DIR)

func restore_latest_backup() -> Dictionary:
	var backups := list_backup_files()
	if backups.is_empty():
		_emit_error("没有可恢复的备份。")
		return {}
	return restore_backup(backups.back())

func restore_ai_checkpoint() -> Dictionary:
	if not has_ai_checkpoint():
		_emit_error("没有可恢复的 AI 请求前状态。")
		return {}
	return restore_backup(AI_CHECKPOINT)

func restore_backup(backup_path: String) -> Dictionary:
	if backup_path.strip_edges().is_empty() or not FileAccess.file_exists(backup_path):
		_emit_error("备份文件不存在。")
		return {}
	var file := FileAccess.open(backup_path, FileAccess.READ)
	if file == null:
		_emit_error("无法读取备份文件。")
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary:
		_emit_error("备份格式无效。")
		return {}
	var payload := parsed as Dictionary
	if not validate_payload_schema(payload):
		_emit_error("备份 schema 校验失败。")
		return {}
	_ensure_save_dir()
	if not _copy_file(backup_path, ACTIVE_SAVE):
		_emit_error("无法恢复备份到当前存档。")
		return {}
	load_completed.emit(str(payload.get("world", {}).get("id", "")))
	return payload

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
		_create_save_backup()
		DirAccess.remove_absolute(absolute_save)
	var err := DirAccess.rename_absolute(absolute_temp, absolute_save)
	if err != OK:
		var message := "无法替换存档文件：%s" % error_string(err)
		save_error.emit(message)
		AppState.set_error(message)
		return
	save_completed.emit(str(payload.get("world", {}).get("id", "")))

func save_ai_checkpoint(payload: Dictionary) -> void:
	if payload.is_empty() or not validate_payload_schema(payload):
		return
	_ensure_save_dir()
	var file := FileAccess.open(AI_CHECKPOINT_TEMP, FileAccess.WRITE)
	if file == null:
		_emit_error("无法创建 AI 请求前状态备份。")
		return
	file.store_string(JSON.stringify(payload, "\t"))
	file.close()
	var absolute_temp := ProjectSettings.globalize_path(AI_CHECKPOINT_TEMP)
	var absolute_checkpoint := ProjectSettings.globalize_path(AI_CHECKPOINT)
	if FileAccess.file_exists(AI_CHECKPOINT):
		DirAccess.remove_absolute(absolute_checkpoint)
	var err := DirAccess.rename_absolute(absolute_temp, absolute_checkpoint)
	if err != OK:
		_emit_error("无法保存 AI 请求前状态：%s" % error_string(err))

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
	var payload := parsed as Dictionary
	if not validate_payload_schema(payload):
		var message := "存档缺少必要字段或版本不受支持。"
		save_error.emit(message)
		AppState.set_error(message)
		return {}
	load_completed.emit(str(payload.get("world", {}).get("id", "")))
	return payload

func delete_save() -> void:
	if FileAccess.file_exists(ACTIVE_SAVE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(ACTIVE_SAVE))
	if FileAccess.file_exists(AI_CHECKPOINT):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(AI_CHECKPOINT))

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
			"threads": "threads.json",
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
	_write_zip_text(packer, "threads.json", JSON.stringify(payload.get("threads", []), "\t"))
	_write_zip_text(packer, "timeline.jsonl", _jsonl(payload.get("timeline", [])))
	_write_zip_text(packer, "memories.jsonl", _jsonl(payload.get("memories", [])))
	if include_ai_logs:
		_write_zip_text(packer, "ai_logs.jsonl", _jsonl(payload.get("ai_logs", [])))
	if not map_archive_path.is_empty():
		_write_zip_bytes(packer, map_archive_path, FileAccess.get_file_as_bytes(map_image_path))
	packer.close()
	_last_world_export_path = export_path
	export_completed.emit(export_path)
	return export_path

func export_ai_logs(world_id: String, logs: Array[Dictionary]) -> String:
	_ensure_save_dir()
	if logs.is_empty():
		_emit_error("没有可导出的 AI 日志。")
		return ""
	var safe_world_id := world_id.strip_edges()
	if safe_world_id.is_empty():
		safe_world_id = "world"
	var timestamp := Time.get_datetime_string_from_system(false).replace(":", "-")
	var export_path := "%s/%s_ai_logs_%s.jsonl" % [EXPORT_DIR, safe_world_id, timestamp]
	var file := FileAccess.open(export_path, FileAccess.WRITE)
	if file == null:
		_emit_error("无法创建 AI 日志导出文件。")
		return ""
	file.store_string(_jsonl(logs))
	file.close()
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
	var threads: Variant = _read_zip_json(reader, "threads.json")
	if world_data.is_empty() or not (characters is Array) or not (locations is Array):
		reader.close()
		_emit_error("导入包缺少必要世界数据。")
		return {}
	if not factions is Array:
		factions = []
	if not threads is Array:
		threads = []
	var payload := {
		"schema_version": 1,
		"world": world_data,
		"characters": characters,
		"locations": locations,
		"factions": factions,
		"threads": threads,
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
	_resolve_import_world_id_conflict(world_data)
	payload["world"] = world_data
	reader.close()
	if not validate_payload_schema(payload):
		_emit_error("导入包 schema 校验失败。")
		return {}
	save_game(payload)
	import_completed.emit(str(world_data.get("id", "")))
	return payload

func validate_payload_schema(payload: Dictionary) -> bool:
	if int(payload.get("schema_version", 0)) != 1:
		return false
	var world_data: Variant = payload.get("world", {})
	if not world_data is Dictionary:
		return false
	var world_dict := world_data as Dictionary
	if str(world_dict.get("id", "")).strip_edges().is_empty() or str(world_dict.get("name", "")).strip_edges().is_empty():
		return false
	for key in ["characters", "locations", "timeline", "memories", "ai_logs", "suggested_actions"]:
		if not payload.has(key) or not payload.get(key) is Array:
			return false
	if payload.has("factions") and not payload.get("factions") is Array:
		return false
	if payload.has("threads") and not payload.get("threads") is Array:
		return false
	if (payload.get("characters", []) as Array).is_empty():
		return false
	if (payload.get("locations", []) as Array).is_empty():
		return false
	for character in payload.get("characters", []):
		if not character is Dictionary or str((character as Dictionary).get("id", "")).strip_edges().is_empty():
			return false
	for location in payload.get("locations", []):
		if not location is Dictionary or str((location as Dictionary).get("id", "")).strip_edges().is_empty():
			return false
	for event in payload.get("timeline", []):
		if not event is Dictionary or str((event as Dictionary).get("id", "")).strip_edges().is_empty():
			return false
	for memory in payload.get("memories", []):
		if not memory is Dictionary or str((memory as Dictionary).get("id", "")).strip_edges().is_empty():
			return false
	return true

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

func _resolve_import_world_id_conflict(world_data: Dictionary) -> void:
	var imported_id := str(world_data.get("id", ""))
	if imported_id.is_empty() or imported_id != AppState.current_world_id:
		return
	var replacement_id := "%s_import_%d" % [imported_id, Time.get_unix_time_from_system()]
	world_data["id"] = replacement_id
	world_data["imported_from_world_id"] = imported_id
	world_data["imported_at"] = Time.get_datetime_string_from_system(true)

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

func _read_backup_metadata(backup_path: String) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(backup_path) if backup_path.begins_with("user://") else backup_path
	var metadata := {
		"path": backup_path,
		"absolute_path": absolute_path,
		"file_name": backup_path.get_file(),
		"created_at": backup_path.get_file().trim_prefix("active_world_").trim_suffix(".json"),
		"schema_valid": false,
		"world_id": "",
		"world_name": "未知世界",
		"world_day": 0,
		"event_count": 0,
		"memory_count": 0,
		"size_bytes": FileAccess.get_file_as_bytes(backup_path).size(),
		"modified_unix": FileAccess.get_modified_time(absolute_path)
	}
	var file := FileAccess.open(backup_path, FileAccess.READ)
	if file == null:
		return metadata
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary:
		return metadata
	var payload := parsed as Dictionary
	metadata["schema_valid"] = validate_payload_schema(payload)
	metadata["updated_at"] = str(payload.get("updated_at", ""))
	var world_data: Variant = payload.get("world", {})
	if world_data is Dictionary:
		var world_dict := world_data as Dictionary
		metadata["world_id"] = str(world_dict.get("id", ""))
		metadata["world_name"] = str(world_dict.get("name", "未知世界"))
		var current_time: Variant = world_dict.get("current_time", {})
		if current_time is Dictionary:
			metadata["world_day"] = int((current_time as Dictionary).get("day", 0))
	var timeline: Variant = payload.get("timeline", [])
	if timeline is Array:
		metadata["event_count"] = (timeline as Array).size()
	var memories: Variant = payload.get("memories", [])
	if memories is Array:
		metadata["memory_count"] = (memories as Array).size()
	return metadata

func _reveal_path(path: String) -> bool:
	if not can_reveal_directories():
		_emit_error("当前平台不支持直接打开目录，请使用导出 ZIP 或系统文件分享。")
		return false
	var absolute_path := ProjectSettings.globalize_path(path) if path.begins_with("user://") else path
	if not DirAccess.dir_exists_absolute(absolute_path):
		_emit_error("目录不存在：%s" % absolute_path)
		return false
	var error := OS.shell_open(absolute_path)
	if error != OK:
		_emit_error("无法打开目录：%s" % error_string(error))
		return false
	return true

func _create_save_backup() -> void:
	var timestamp := Time.get_datetime_string_from_system(false).replace(":", "-")
	var backup_path := "%s/active_world_%s_%d.json" % [BACKUP_DIR, timestamp, Time.get_ticks_msec()]
	if not _copy_file(ACTIVE_SAVE, backup_path):
		return
	_prune_backups(MAX_AUTO_BACKUPS)

func _copy_file(source_path: String, target_path: String) -> bool:
	if not FileAccess.file_exists(source_path):
		return false
	var bytes := FileAccess.get_file_as_bytes(source_path)
	if bytes.is_empty():
		return false
	var target := FileAccess.open(target_path, FileAccess.WRITE)
	if target == null:
		return false
	target.store_buffer(bytes)
	target.close()
	return true

func _prune_backups(max_count: int) -> void:
	var backups := list_backup_files()
	while backups.size() > max_count:
		var oldest: String = backups.pop_front()
		DirAccess.remove_absolute(ProjectSettings.globalize_path(oldest))

func _emit_error(message: String) -> void:
	save_error.emit(message)
	AppState.set_error(message)
