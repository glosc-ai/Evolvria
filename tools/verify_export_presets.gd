extends SceneTree

const REQUIRED_PRESETS: Array[String] = ["Web", "macOS", "Windows Desktop", "Linux"]
const ENGINE_TEMPLATE_VERSION := "4.7.stable"

func _initialize() -> void:
	var ok := _run()
	quit(0 if ok else 1)

func _run() -> bool:
	var config := ConfigFile.new()
	var err := config.load("res://export_presets.cfg")
	if err != OK:
		push_error("Cannot read export_presets.cfg: %s" % error_string(err))
		return false
	var found: Dictionary = {}
	var preset_index := 0
	while config.has_section("preset.%d" % preset_index):
		var section := "preset.%d" % preset_index
		var name := str(config.get_value(section, "name", ""))
		var platform := str(config.get_value(section, "platform", ""))
		var export_path := str(config.get_value(section, "export_path", ""))
		if name.is_empty() or platform.is_empty() or export_path.is_empty():
			push_error("Preset %d is missing name, platform, or export_path." % preset_index)
			return false
		if not config.has_section("%s.options" % section):
			push_error("Preset %s is missing options section." % name)
			return false
		found[name] = {
			"platform": platform,
			"export_path": export_path
		}
		preset_index += 1
	for required in REQUIRED_PRESETS:
		if not found.has(required):
			push_error("Missing export preset: %s" % required)
			return false
	var templates_available := _export_templates_available()
	if templates_available:
		print("Export presets verified; Godot %s templates are installed." % ENGINE_TEMPLATE_VERSION)
	else:
		print("Export presets verified; Godot %s export templates are not installed on this machine." % ENGINE_TEMPLATE_VERSION)
	for name in REQUIRED_PRESETS:
		var data := found[name] as Dictionary
		print("- %s -> %s (%s)" % [name, data.get("export_path", ""), data.get("platform", "")])
	return true

func _export_templates_available() -> bool:
	var candidates: Array[String] = [
		OS.get_user_data_dir().get_base_dir().path_join("export_templates").path_join(ENGINE_TEMPLATE_VERSION),
		OS.get_data_dir().path_join("Godot").path_join("export_templates").path_join(ENGINE_TEMPLATE_VERSION)
	]
	for template_dir in candidates:
		if DirAccess.dir_exists_absolute(template_dir):
			return true
	return false
