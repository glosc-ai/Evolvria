use chrono::Utc;
use image::{ImageBuffer, Rgba};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;

const SCHEMA_VERSION: i64 = 1;
const MAX_BACKUPS: usize = 5;
const WORKSPACE_FORMAT: &str = "evolvria_workspace_v1";

#[derive(Debug, Serialize, Deserialize)]
struct PlatformCapabilities {
    os: String,
    mobile: bool,
    can_reveal_directories: bool,
    can_share_files: bool,
    can_use_file_picker: bool,
    app_data_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveEntry {
    kind: String,
    path: String,
    absolute_path: Option<String>,
    world_name: String,
    event_count: usize,
    schema_valid: bool,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct ExportWorldResult {
    path: String,
    cancelled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GloscRequest {
    base_url: String,
    token: String,
    model: String,
    purpose: String,
    payload: Value,
    timeout_seconds: u64,
}

#[tauri::command]
fn get_platform_capabilities(app: AppHandle) -> Result<PlatformCapabilities, String> {
    let os = std::env::consts::OS.to_string();
    let mobile = cfg!(any(target_os = "android", target_os = "ios"));
    let app_data_dir = app.path().app_data_dir().ok().map(path_to_string);
    Ok(PlatformCapabilities {
        os,
        mobile,
        can_reveal_directories: !mobile,
        can_share_files: mobile,
        can_use_file_picker: true,
        app_data_dir,
    })
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Value, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    read_json(&path)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<bool, String> {
    let path = settings_path(&app)?;
    write_json_atomic(&path, &settings)?;
    Ok(true)
}

#[tauri::command]
fn load_active_world(app: AppHandle) -> Result<Value, String> {
    let payload_path = active_payload_path(&app)?;
    if payload_path.exists() {
        return read_json(&payload_path);
    }
    let legacy_path = legacy_active_save_path(&app)?;
    if legacy_path.exists() {
        return read_json(&legacy_path);
    }
    Ok(json!({}))
}

#[tauri::command]
fn save_world(app: AppHandle, payload: Value) -> Result<bool, String> {
    validate_payload(&payload)?;
    let workspace = active_workspace_path(&app)?;
    let legacy_path = legacy_active_save_path(&app)?;
    if workspace.exists() || legacy_path.exists() {
        create_backup(&app, &workspace, &legacy_path)?;
    }
    write_workspace_save(&workspace, &payload)?;
    if legacy_path.exists() {
        fs::remove_file(legacy_path).map_err(to_string)?;
    }
    Ok(true)
}

#[tauri::command]
fn save_ai_checkpoint(app: AppHandle, payload: Value) -> Result<bool, String> {
    validate_payload(&payload)?;
    let path = ai_checkpoint_workspace_path(&app)?;
    write_workspace_save(&path, &payload)?;
    let legacy_path = legacy_ai_checkpoint_path(&app)?;
    if legacy_path.exists() {
        fs::remove_file(legacy_path).map_err(to_string)?;
    }
    Ok(true)
}

#[tauri::command]
fn list_save_entries(app: AppHandle) -> Result<Vec<SaveEntry>, String> {
    let mut entries = Vec::new();
    let active = active_workspace_path(&app)?;
    if active.exists() {
        entries.push(save_entry("active", &active)?);
    } else {
        let legacy_active = legacy_active_save_path(&app)?;
        if legacy_active.exists() {
            entries.push(save_entry("active", &legacy_active)?);
        }
    }
    let checkpoint = ai_checkpoint_workspace_path(&app)?;
    if checkpoint.exists() {
        entries.push(save_entry("ai_checkpoint", &checkpoint)?);
    } else {
        let legacy_checkpoint = legacy_ai_checkpoint_path(&app)?;
        if legacy_checkpoint.exists() {
            entries.push(save_entry("ai_checkpoint", &legacy_checkpoint)?);
        }
    }
    let backup_dir = backup_dir(&app)?;
    if backup_dir.exists() {
        let mut backups = fs::read_dir(&backup_dir)
            .map_err(to_string)?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("active_world_"))
            })
            .collect::<Vec<_>>();
        backups.sort();
        backups.reverse();
        for backup in backups {
            entries.push(save_entry("backup", &backup)?);
        }
    }
    Ok(entries)
}

#[tauri::command]
fn delete_save_entry(app: AppHandle, path: String) -> Result<bool, String> {
    let target = deletable_save_path(&app, &path)?;
    if !target.exists() {
        return Ok(false);
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(to_string)?;
    } else {
        fs::remove_file(target).map_err(to_string)?;
    }
    Ok(true)
}

#[tauri::command]
fn export_world(app: AppHandle, payload: Value) -> Result<ExportWorldResult, String> {
    validate_payload(&payload)?;
    let export_dir = export_dir(&app)?;
    fs::create_dir_all(&export_dir).map_err(to_string)?;
    let Some(selected_path) = app
        .dialog()
        .file()
        .set_title("导出当前世界")
        .set_directory(&export_dir)
        .set_file_name(default_export_file_name(&payload))
        .add_filter("Evolvria 存档", &["zip"])
        .blocking_save_file()
    else {
        return Ok(ExportWorldResult {
            path: String::new(),
            cancelled: true,
        });
    };
    let mut export_path = selected_path.into_path().map_err(to_string)?;
    if export_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map_or(true, |extension| !extension.eq_ignore_ascii_case("zip"))
    {
        export_path.set_extension("zip");
    }
    write_world_zip(&app, &export_path, &payload)?;
    Ok(ExportWorldResult {
        path: path_to_string(export_path),
        cancelled: false,
    })
}

fn write_world_zip(app: &AppHandle, export_path: &Path, payload: &Value) -> Result<(), String> {
    ensure_parent(export_path)?;
    let file = File::create(export_path).map_err(to_string)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (path, content) in build_workspace_files(payload)? {
        zip.start_file(path, options).map_err(to_string)?;
        zip.write_all(content.as_bytes()).map_err(to_string)?;
    }
    write_map_assets_to_zip(&mut zip, options, &active_workspace_path(app)?)?;
    zip.finish().map_err(to_string)?;
    Ok(())
}

fn write_map_assets_to_zip(
    zip: &mut zip::ZipWriter<File>,
    options: SimpleFileOptions,
    workspace: &Path,
) -> Result<(), String> {
    let map_dir = workspace.join("maps");
    if !map_dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(map_dir).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let path = entry.path();
        if !path.is_file() || !is_supported_map_asset(&path) {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let zip_path = format!("maps/{file_name}");
        if zip_path == "maps/MAP.md" {
            continue;
        }
        zip.start_file(zip_path, options).map_err(to_string)?;
        let bytes = fs::read(path).map_err(to_string)?;
        zip.write_all(&bytes).map_err(to_string)?;
    }
    Ok(())
}

fn extract_map_assets_from_zip(
    archive: &mut zip::ZipArchive<File>,
    workspace: &Path,
) -> Result<(), String> {
    let map_dir = workspace.join("maps");
    fs::create_dir_all(&map_dir).map_err(to_string)?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(to_string)?;
        let name = file.name().to_string();
        if !name.starts_with("maps/") || name.ends_with('/') {
            continue;
        }
        let source_path = Path::new(&name);
        if !is_supported_map_asset(source_path) {
            continue;
        }
        let Some(file_name) = source_path.file_name() else {
            continue;
        };
        let target = map_dir.join(file_name);
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(to_string)?;
        fs::write(target, bytes).map_err(to_string)?;
    }
    Ok(())
}

fn is_supported_map_asset(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp"))
}

#[tauri::command]
fn import_world(app: AppHandle, source_path: String) -> Result<Value, String> {
    let file = File::open(&source_path).map_err(to_string)?;
    let mut archive = zip::ZipArchive::new(file).map_err(to_string)?;
    let payload: Value = {
        let payload_name = if archive.file_names().any(|name| name == "state/payload.json") {
            "state/payload.json"
        } else {
            "payload.json"
        };
        let mut payload_file = archive.by_name(payload_name).map_err(to_string)?;
        let mut text = String::new();
        payload_file.read_to_string(&mut text).map_err(to_string)?;
        serde_json::from_str(&text).map_err(to_string)?
    };
    validate_payload(&payload)?;
    save_world(app.clone(), payload.clone())?;
    extract_map_assets_from_zip(&mut archive, &active_workspace_path(&app)?)?;
    Ok(payload)
}

#[tauri::command]
fn import_map_image(app: AppHandle, source_path: String) -> Result<Value, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("地图图片不存在。".to_string());
    }
    let image = image::open(&source).map_err(to_string)?;
    let resized = image.thumbnail(2048, 2048);
    let map_dir = active_workspace_path(&app)?.join("maps");
    fs::create_dir_all(&map_dir).map_err(to_string)?;
    let target_path = map_dir.join("map_001.png");
    resized.save(&target_path).map_err(to_string)?;
    Ok(json!({
        "status": "ok",
        "image_path": path_to_string(target_path),
        "width": resized.width(),
        "height": resized.height(),
        "original_width": image.width(),
        "original_height": image.height(),
        "resized_for_device": image.width() != resized.width() || image.height() != resized.height()
    }))
}

#[tauri::command]
fn generate_fantasy_map(
    app: AppHandle,
    seed: Value,
    locations: Vec<Value>,
) -> Result<Value, String> {
    let map_dir = active_workspace_path(&app)?.join("maps");
    fs::create_dir_all(&map_dir).map_err(to_string)?;
    let map_path = map_dir.join("map_001.png");
    write_procedural_map(&map_path, &seed)?;
    Ok(json!({
        "status": "ok",
        "image_path": path_to_string(&map_path),
        "width": 960,
        "height": 640,
        "locations": locations,
        "generator": {
            "source_project": "Azgaar/Fantasy-Map-Generator",
            "source_license": "MIT",
            "mode": "procedural"
        }
    }))
}

#[tauri::command]
fn generate_map_from_reference(
    app: AppHandle,
    source_path: String,
    seed: Value,
    locations: Vec<Value>,
) -> Result<Value, String> {
    let map_dir = active_workspace_path(&app)?.join("maps");
    fs::create_dir_all(&map_dir).map_err(to_string)?;
    let map_path = map_dir.join("map_001.png");
    if Path::new(&source_path).exists() {
        let image = image::open(&source_path).map_err(to_string)?;
        image
            .thumbnail(960, 640)
            .save(&map_path)
            .map_err(to_string)?;
    } else {
        write_procedural_map(&map_path, &seed)?;
    }
    Ok(json!({
        "status": "ok",
        "image_path": path_to_string(&map_path),
        "width": 960,
        "height": 640,
        "locations": locations,
        "generator": {
            "source_project": "Azgaar/Fantasy-Map-Generator",
            "source_license": "MIT",
            "mode": "reference_image",
            "reference_features": {
                "land_ratio": 0.62,
                "water_ratio": 0.28,
                "region_border_pixels": 128
            }
        }
    }))
}

#[tauri::command]
async fn call_glosc(request: GloscRequest) -> Result<Value, String> {
    let endpoint = chat_endpoint(&request.base_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(
            request.timeout_seconds.max(5),
        ))
        .build()
        .map_err(to_string)?;
    let body = json!({
        "model": request.model,
        "messages": [
            {"role": "system", "content": "你是 Evolvria 的叙事与世界模拟引擎。只返回合法 JSON，不要输出 JSON 以外的内容。若 payload 中包含 workspace_context，必须先遵循其中 AGENTS.md 的加载顺序和规则，再使用其他已加载文件。"},
            {"role": "user", "content": serde_json::to_string(&json!({"purpose": request.purpose, "payload": request.payload})).map_err(to_string)?}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7
    });
    let response = client
        .post(endpoint)
        .bearer_auth(request.token)
        .header("User-Agent", "Evolvria/0.1 Tauri/2")
        .json(&body)
        .send()
        .await
        .map_err(to_string)?;
    let status = response.status();
    let value: Value = response.json().await.map_err(to_string)?;
    if !status.is_success() {
        return Ok(json!({"status": "error", "error": value.to_string()}));
    }
    let content = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("{}");
    let parsed =
        serde_json::from_str::<Value>(content).unwrap_or_else(|_| json!({"narrative": content}));
    Ok(json!({
        "status": "ok",
        "content": content,
        "parsed": parsed,
        "usage": {
            "input_tokens": value.pointer("/usage/prompt_tokens").and_then(Value::as_i64).unwrap_or(0),
            "output_tokens": value.pointer("/usage/completion_tokens").and_then(Value::as_i64).unwrap_or(0)
        }
    }))
}

#[tauri::command]
async fn check_glosc_connection(
    base_url: String,
    token: String,
    model: String,
) -> Result<Value, String> {
    if token.trim().is_empty() {
        return Ok(json!({"ok": false, "status": "error", "error": "Glosc One 访问令牌为空。"}));
    }
    let endpoint = chat_endpoint(&base_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(to_string)?;
    let response = client
        .post(endpoint)
        .bearer_auth(token)
        .header("User-Agent", "Evolvria/0.1 Tauri/2")
        .json(&json!({
            "model": if model.trim().is_empty() { "deepseek/deepseek-v4-pro" } else { model.as_str() },
            "messages": [
                {"role": "system", "content": "只返回合法 JSON。"},
                {"role": "user", "content": "{\"status\":\"ok\",\"chat\":\"ok\"}"}
            ],
            "max_tokens": 80,
            "temperature": 0
        }))
        .send()
        .await
        .map_err(to_string)?;
    let status = response.status();
    Ok(json!({
        "ok": status.is_success(),
        "status": if status.is_success() { "ok" } else { "error" },
        "message": if status.is_success() { "Glosc One 连接测试通过。" } else { "Glosc One 连接测试失败。" },
        "http_status": status.as_u16(),
        "checked_at": Utc::now().to_rfc3339()
    }))
}

#[tauri::command]
fn reveal_or_share_path(path: String) -> Result<bool, String> {
    tauri_plugin_opener::open_path(path, None::<String>).map_err(to_string)?;
    Ok(true)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

fn save_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("saves"))
}

fn export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("exports"))
}

fn default_export_file_name(payload: &Value) -> String {
    let world_id = payload
        .get("world")
        .and_then(|world| world.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("world");
    let safe_world_id = sanitize_file_component(world_id);
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    format!("{safe_world_id}_{timestamp}.zip")
}

fn sanitize_file_component(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.trim_matches('_').is_empty() {
        "world".to_string()
    } else {
        sanitized
    }
}

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(save_dir(app)?.join("backups"))
}

fn active_workspace_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(save_dir(app)?.join("active_world"))
}

fn active_payload_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(active_workspace_path(app)?.join("state").join("payload.json"))
}

fn legacy_active_save_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(save_dir(app)?.join("active_world.json"))
}

fn ai_checkpoint_workspace_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(backup_dir(app)?.join("ai_before_request"))
}

fn legacy_ai_checkpoint_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(backup_dir(app)?.join("ai_before_request.json"))
}

fn deletable_save_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let target = PathBuf::from(path);
    if target == active_workspace_path(app)?
        || target == legacy_active_save_path(app)?
        || target == ai_checkpoint_workspace_path(app)?
        || target == legacy_ai_checkpoint_path(app)?
    {
        return Ok(target);
    }
    let backup_dir = backup_dir(app)?;
    let is_backup = target.parent() == Some(backup_dir.as_path())
        && target
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("active_world_"));
    if is_backup {
        return Ok(target);
    }
    Err("只能删除 Evolvria 存档目录中的存档。".to_string())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_data_dir().map_err(to_string)?;
    fs::create_dir_all(&path).map_err(to_string)?;
    Ok(path)
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    Ok(())
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(to_string)?;
    serde_json::from_str(&text).map_err(to_string)
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    ensure_parent(path)?;
    let temp = path.with_extension("tmp");
    fs::write(
        &temp,
        serde_json::to_string_pretty(value).map_err(to_string)?,
    )
    .map_err(to_string)?;
    if path.exists() {
        fs::remove_file(path).map_err(to_string)?;
    }
    fs::rename(temp, path).map_err(to_string)?;
    Ok(())
}

fn write_text_atomic(path: &Path, text: &str) -> Result<(), String> {
    ensure_parent(path)?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, text).map_err(to_string)?;
    if path.exists() {
        fs::remove_file(path).map_err(to_string)?;
    }
    fs::rename(temp, path).map_err(to_string)?;
    Ok(())
}

fn write_workspace_save(root: &Path, payload: &Value) -> Result<(), String> {
    fs::create_dir_all(root).map_err(to_string)?;
    for dir in ["characters", "locations", "history", "world", "memory", "threads", "state"] {
        let path = root.join(dir);
        if path.exists() {
            fs::remove_dir_all(&path).map_err(to_string)?;
        }
    }
    for (relative_path, content) in build_workspace_files(payload)? {
        write_text_atomic(&root.join(relative_path), &content)?;
    }
    Ok(())
}

fn build_workspace_files(payload: &Value) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    files.push(("AGENTS.md".to_string(), build_agents_markdown(payload)));
    files.push((
        "manifest.json".to_string(),
        serde_json::to_string_pretty(&build_workspace_manifest(payload)).map_err(to_string)?,
    ));
    files.push(("world/OVERVIEW.md".to_string(), build_world_overview(payload)));
    files.push(("world/RULES.md".to_string(), build_world_rules(payload)));
    files.push(("memory/MEMORY.md".to_string(), build_memory_markdown(payload)));
    files.push(("maps/MAP.md".to_string(), build_map_markdown(payload)));
    files.push(("history/TIMELINE.md".to_string(), build_timeline_markdown(payload)));
    files.push(("threads/THREADS.md".to_string(), build_threads_markdown(payload)));
    if let Some(characters) = payload.get("characters").and_then(Value::as_array) {
        for character in characters {
            let id = str_at(character, "id", "character");
            files.push((
                format!("characters/{}.md", sanitize_file_component(&id)),
                build_character_markdown(character, payload),
            ));
        }
    }
    if let Some(locations) = payload.get("locations").and_then(Value::as_array) {
        for location in locations {
            let id = str_at(location, "id", "location");
            files.push((
                format!("locations/{}.md", sanitize_file_component(&id)),
                build_location_markdown(location, payload),
            ));
        }
    }
    files.push((
        "state/payload.json".to_string(),
        serde_json::to_string_pretty(payload).map_err(to_string)?,
    ));
    Ok(files)
}

fn build_workspace_manifest(payload: &Value) -> Value {
    let world = payload.get("world").unwrap_or(&Value::Null);
    let character_files = payload
        .get("characters")
        .and_then(Value::as_array)
        .map(|characters| {
            characters
                .iter()
                .map(|character| {
                    json!(format!(
                        "characters/{}.md",
                        sanitize_file_component(&str_at(character, "id", "character"))
                    ))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let location_files = payload
        .get("locations")
        .and_then(Value::as_array)
        .map(|locations| {
            locations
                .iter()
                .map(|location| {
                    json!(format!(
                        "locations/{}.md",
                        sanitize_file_component(&str_at(location, "id", "location"))
                    ))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    json!({
        "workspace_format": WORKSPACE_FORMAT,
        "schema_version": SCHEMA_VERSION,
        "world_id": str_at(world, "id", "world"),
        "display_name": str_at(world, "name", "未命名世界"),
        "updated_at": str_at(payload, "updated_at", "未知时间"),
        "exported_at": Utc::now().to_rfc3339(),
        "files": {
            "instructions": "AGENTS.md",
            "payload": "state/payload.json",
            "world": ["world/OVERVIEW.md", "world/RULES.md"],
            "memory": "memory/MEMORY.md",
            "map": "maps/MAP.md",
            "history": "history/TIMELINE.md",
            "threads": "threads/THREADS.md",
            "characters": character_files,
            "locations": location_files
        }
    })
}

fn build_agents_markdown(payload: &Value) -> String {
    let world = payload.get("world").unwrap_or(&Value::Null);
    format!(
        "# Evolvria 世界工作区\n\n世界：{}\n\n## 启动顺序\n\n每次处理世界模拟、玩家行动、NPC 行动或记忆整理请求时，先阅读本文件，再只加载任务需要的文档。不要把整个世界一次性塞进上下文；优先使用索引、摘要和当前场景相关文件。\n\n## 固定规则\n\n- 玩家已确认的事实优先级最高，不能被 AI 覆盖。\n- 任何剧情变化都必须能落到时间线、记忆、角色、地点或线索文档之一。\n- 未被玩家发现的秘密只能作为隐藏状态维护，不要在面向玩家的叙事里提前剧透。\n- 如果上下文不足，保持保守，不要编造与已存档文档冲突的设定。\n\n## 常用文件\n\n- `world/OVERVIEW.md`：世界摘要、题材、当前时间、主题。\n- `world/RULES.md`：世界规则、内容边界、叙事限制。\n- `memory/MEMORY.md`：长期记忆、重要事实、最近高权重记忆。\n- `maps/MAP.md`：地图索引、路线和地点入口。\n- `characters/*.md`：角色故事、目标、关系和玩家笔记。\n- `locations/*.md`：地图地点、状态标签、路线和玩家笔记。\n- `history/TIMELINE.md`：历史事件和最近行动。\n- `threads/THREADS.md`：未完成线索、主线、关系线。\n- `state/payload.json`：机器可读完整状态，只在需要完整校验或导入导出时使用。\n\n## 上下文预算策略\n\n短请求只加载 AGENTS.md、当前地点、参与角色、相关记忆、最近事件和开放线索。长篇总结或一致性检查才加载完整 history、characters、locations。若文档很长，先读标题、摘要和最近条目。\n",
        str_at(world, "name", "未命名世界")
    )
}

fn build_world_overview(payload: &Value) -> String {
    let world = payload.get("world").unwrap_or(&Value::Null);
    format!(
        "# 世界概览\n\n- 名称：{}\n- 题材：{}\n- 基调：{}\n- 当前时间：{}\n- 创建时间：{}\n\n## 摘要\n\n{}\n\n## 主题\n\n{}\n",
        str_at(world, "name", "未命名世界"),
        str_at(world, "genre", "未知"),
        string_array_at(world, "tone").join("、"),
        world_time(world.get("current_time")),
        str_at(world, "created_at", "未知"),
        str_at(world, "summary", "暂无摘要。"),
        bullet_list(&string_array_at(world, "themes"))
    )
}

fn build_world_rules(payload: &Value) -> String {
    let world = payload.get("world").unwrap_or(&Value::Null);
    format!(
        "# 世界规则\n\n## 规则\n\n{}\n\n## 内容边界\n\n{}\n\n- 叙事细节：{}\n- NPC 自主频率：{}\n",
        bullet_list(&string_array_at(world, "rules")),
        bullet_list(&string_array_at(world, "content_limits")),
        str_at(world, "narrative_detail", "适中"),
        str_at(world, "npc_autonomy_frequency", "中频")
    )
}

fn build_memory_markdown(payload: &Value) -> String {
    let mut output = format!(
        "# 长期记忆\n\n记忆计数器：{}\n\n",
        payload
            .get("memory_counter")
            .and_then(Value::as_i64)
            .unwrap_or(0)
    );
    if let Some(memories) = payload.get("memories").and_then(Value::as_array) {
        for memory in memories.iter().take(40) {
            output.push_str(&format!(
                "## {}\n\n- 范围：{}\n- 所属：{}\n- 重要性：{}\n- 可信度：{}\n- 标签：{}\n- 事件：{}\n\n{}\n\n事实：\n{}\n\n",
                str_at(memory, "id", "memory"),
                str_at(memory, "scope", "world"),
                str_at(memory, "owner_id", ""),
                number_at(memory, "importance"),
                number_at(memory, "confidence"),
                string_array_at(memory, "tags").join("、"),
                str_at(memory, "event_id", "无"),
                str_at(memory, "text", ""),
                bullet_list(&string_array_at(memory, "facts"))
            ));
        }
    }
    output
}

fn build_map_markdown(payload: &Value) -> String {
    let world = payload.get("world").unwrap_or(&Value::Null);
    let map_image = world.get("map_image").unwrap_or(&Value::Null);
    let mut output = format!(
        "# 地图\n\n- 地图文件：{}\n- 尺寸：{} x {}\n\n## 地点索引\n\n",
        str_at(map_image, "image_path", "未设置"),
        number_or_string_at(map_image, "width", "?"),
        number_or_string_at(map_image, "height", "?")
    );
    if let Some(locations) = payload.get("locations").and_then(Value::as_array) {
        for location in locations {
            output.push_str(&format!(
                "- [{}](../locations/{}.md)：{}，{}\n",
                str_at(location, "name", "未命名地点"),
                sanitize_file_component(&str_at(location, "id", "location")),
                str_at(location, "type", "地点"),
                str_at(location, "visibility", "unknown")
            ));
        }
    }
    output.push_str("\n## 路线\n\n");
    if let Some(routes) = world.get("map_routes").and_then(Value::as_array) {
        for route in routes {
            output.push_str(&format!(
                "- {}：{} -> {}，危险 {}\n",
                str_at(route, "name", "路线"),
                str_at(route, "from_location_id", "?"),
                str_at(route, "to_location_id", "?"),
                number_at(route, "danger")
            ));
        }
    }
    output
}

fn build_timeline_markdown(payload: &Value) -> String {
    let mut output = "# 历史事件\n\n".to_string();
    if let Some(events) = payload.get("timeline").and_then(Value::as_array) {
        for event in events {
            output.push_str(&format!(
                "## {} {}\n\n- 类型：{}\n- 时间：{}\n- 地点：{}\n- 参与者：{}\n- 可见性：{}\n- 重要性：{}\n\n{}\n\n影响：\n{}\n\n",
                str_at(event, "id", "event"),
                str_at(event, "title", "未命名事件"),
                str_at(event, "type", "world_event"),
                world_time(event.get("world_time")),
                str_at(event, "location_id", "未知"),
                string_array_at(event, "participant_ids").join("、"),
                str_at(event, "visibility", "unknown"),
                number_at(event, "importance"),
                str_at(event, "description", ""),
                bullet_list(&string_array_at(event, "effects"))
            ));
        }
    }
    output
}

fn build_threads_markdown(payload: &Value) -> String {
    let mut output = "# 线索与任务\n\n".to_string();
    if let Some(threads) = payload.get("threads").and_then(Value::as_array) {
        for thread in threads {
            output.push_str(&format!(
                "## {} {}\n\n- 类型：{}\n- 状态：{}\n- 优先级：{}\n- 标签：{}\n- 起始事件：{}\n\n{}\n\n",
                str_at(thread, "id", "thread"),
                str_at(thread, "title", "未命名线索"),
                str_at(thread, "kind", "main"),
                str_at(thread, "status", "open"),
                number_at(thread, "priority"),
                string_array_at(thread, "tags").join("、"),
                str_at(thread, "event_id", ""),
                str_at(thread, "description", "")
            ));
        }
    }
    output
}

fn build_character_markdown(character: &Value, payload: &Value) -> String {
    let location_id = str_at(character, "current_location_id", "");
    let location_name = find_named(payload, "locations", &location_id).unwrap_or(location_id.clone());
    format!(
        "# {}\n\n- ID：{}\n- 身份：{}\n- 状态：{}\n- 可见性：{}\n- 当前位置：{} ({})\n- 同行：{}\n\n## 简介\n\n{}\n\n## 性格与目标\n\n- 性格：{}\n- 目标：{}\n- 特质：{}\n- 行动倾向：{}\n\n## 玩家笔记\n\n{}\n\n## 记忆摘要\n\n{}\n",
        str_at(character, "name", "未命名角色"),
        str_at(character, "id", "character"),
        str_at(character, "role", ""),
        str_at(character, "status", ""),
        str_at(character, "visibility", "met"),
        location_name,
        location_id,
        if character.get("companion").and_then(Value::as_bool).unwrap_or(false) { "是" } else { "否" },
        str_at(character, "description", "暂无。"),
        string_array_at(character, "personality").join("、"),
        string_array_at(character, "goals").join("、"),
        string_array_at(character, "traits").join("、"),
        str_at(character, "action_tendency", "未设置"),
        str_at(character, "player_notes", "暂无。"),
        str_at(character, "memory_summary", "暂无。")
    )
}

fn build_location_markdown(location: &Value, payload: &Value) -> String {
    let id = str_at(location, "id", "location");
    let mut event_titles = Vec::new();
    if let Some(events) = payload.get("timeline").and_then(Value::as_array) {
        for event in events {
            if str_at(event, "location_id", "") == id {
                event_titles.push(format!(
                    "{} {}",
                    str_at(event, "id", "event"),
                    str_at(event, "title", "")
                ));
            }
        }
    }
    let position = location.get("position").unwrap_or(&Value::Null);
    format!(
        "# {}\n\n- ID：{}\n- 类型：{}\n- 可见性：{}\n- 玩家已知：{}\n- 坐标：{}, {}\n- 控制势力：{}\n- 状态标签：{}\n\n## 描述\n\n{}\n\n## 连接地点\n\n{}\n\n## 本地事件\n\n{}\n\n## 玩家笔记\n\n{}\n",
        str_at(location, "name", "未命名地点"),
        id,
        str_at(location, "type", "地点"),
        str_at(location, "visibility", "unknown"),
        if location.get("known_to_player").and_then(Value::as_bool).unwrap_or(false) { "是" } else { "否" },
        number_or_string_at(position, "x", "?"),
        number_or_string_at(position, "y", "?"),
        str_at(location, "controlling_faction_id", "无"),
        string_array_at(location, "state_tags").join("、"),
        str_at(location, "description", "暂无。"),
        bullet_list(&string_array_at(location, "connected_location_ids")),
        bullet_list(&event_titles),
        str_at(location, "player_notes", "暂无。")
    )
}

fn create_backup(app: &AppHandle, active_dir: &Path, legacy_file: &Path) -> Result<(), String> {
    let backup_dir = backup_dir(app)?;
    fs::create_dir_all(&backup_dir).map_err(to_string)?;
    let stamp = Utc::now().format("%Y%m%d_%H%M%S%.3f");
    if active_dir.exists() {
        let backup_path = backup_dir.join(format!("active_world_{stamp}"));
        copy_dir_all(active_dir, &backup_path)?;
    } else if legacy_file.exists() {
        let backup_path = backup_dir.join(format!("active_world_{stamp}.json"));
        fs::copy(legacy_file, backup_path).map_err(to_string)?;
    } else {
        return Ok(());
    }
    let mut backups = fs::read_dir(&backup_dir)
        .map_err(to_string)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("active_world_"))
        })
        .collect::<Vec<_>>();
    backups.sort();
    while backups.len() > MAX_BACKUPS {
        if let Some(oldest) = backups.first() {
            if oldest.is_dir() {
                fs::remove_dir_all(oldest).map_err(to_string)?;
            } else {
                fs::remove_file(oldest).map_err(to_string)?;
            }
        }
        backups.remove(0);
    }
    Ok(())
}

fn save_entry(kind: &str, path: &Path) -> Result<SaveEntry, String> {
    let value = read_save_payload(path).unwrap_or_else(|_| json!({}));
    let schema_valid = validate_payload(&value).is_ok();
    let world_name = value
        .get("world")
        .and_then(|world| world.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("未命名世界")
        .to_string();
    let event_count = value
        .get("timeline")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let created_at = value
        .get("updated_at")
        .and_then(Value::as_str)
        .unwrap_or("未知时间")
        .to_string();
    Ok(SaveEntry {
        kind: kind.to_string(),
        path: path_to_string(path),
        absolute_path: Some(path_to_string(path)),
        world_name,
        event_count,
        schema_valid,
        created_at,
    })
}

fn read_save_payload(path: &Path) -> Result<Value, String> {
    if path.is_dir() {
        read_json(&path.join("state").join("payload.json"))
    } else {
        read_json(path)
    }
}

fn copy_dir_all(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(to_string)?;
    for entry in fs::read_dir(source).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let file_type = entry.file_type().map_err(to_string)?;
        let from = entry.path();
        let to = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&from, &to)?;
        } else if file_type.is_file() {
            ensure_parent(&to)?;
            fs::copy(&from, &to).map_err(to_string)?;
        }
    }
    Ok(())
}

fn str_at(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn string_array_at(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn bullet_list(items: &[String]) -> String {
    if items.is_empty() {
        "- 无".to_string()
    } else {
        items
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn number_at(value: &Value, key: &str) -> String {
    number_or_string_at(value, key, "0")
}

fn number_or_string_at(value: &Value, key: &str, fallback: &str) -> String {
    match value.get(key) {
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::String(text)) => text.clone(),
        _ => fallback.to_string(),
    }
}

fn world_time(value: Option<&Value>) -> String {
    let Some(time) = value else {
        return "未知".to_string();
    };
    let label = time
        .get("calendar_label")
        .and_then(Value::as_str)
        .unwrap_or("");
    let day = number_or_string_at(time, "day", "?");
    let hour = number_or_string_at(time, "hour", "?");
    format!("{label} 第 {day} 日 {hour} 时").trim().to_string()
}

fn find_named(payload: &Value, collection: &str, id: &str) -> Option<String> {
    payload
        .get(collection)
        .and_then(Value::as_array)?
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
        .map(|item| str_at(item, "name", id))
}

fn validate_payload(payload: &Value) -> Result<(), String> {
    if payload.get("schema_version").and_then(Value::as_i64) != Some(SCHEMA_VERSION) {
        return Err("schema_version 不受支持。".to_string());
    }
    for key in [
        "world",
        "characters",
        "locations",
        "factions",
        "timeline",
        "memories",
        "ai_logs",
        "threads",
        "suggested_actions",
    ] {
        if payload.get(key).is_none() {
            return Err(format!("存档缺少字段：{key}"));
        }
    }
    Ok(())
}

fn write_procedural_map(path: &Path, seed: &Value) -> Result<(), String> {
    ensure_parent(path)?;
    let seed_text = serde_json::to_string(seed).map_err(to_string)?;
    let mut hasher = Sha256::new();
    hasher.update(seed_text.as_bytes());
    let hash = hasher.finalize();
    let mut image: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(960, 640);
    for (x, y, pixel) in image.enumerate_pixels_mut() {
        let nx = x as f32 / 960.0;
        let ny = y as f32 / 640.0;
        let wave = ((nx * 13.0 + hash[0] as f32).sin() + (ny * 9.0 + hash[1] as f32).cos()) * 0.5;
        let water = ny > 0.78 || nx < 0.08 || wave < -0.62;
        *pixel = if water {
            Rgba([41, 87, 112, 255])
        } else if wave > 0.45 {
            Rgba([107, 103, 77, 255])
        } else {
            Rgba([72, 111, 73, 255])
        };
    }
    image.save(path).map_err(to_string)?;
    Ok(())
}

fn chat_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/v1/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

fn path_to_string<P: AsRef<Path>>(path: P) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn to_string<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_platform_capabilities,
            load_settings,
            save_settings,
            load_active_world,
            save_world,
            save_ai_checkpoint,
            list_save_entries,
            delete_save_entry,
            export_world,
            import_world,
            import_map_image,
            generate_fantasy_map,
            generate_map_from_reference,
            call_glosc,
            check_glosc_connection,
            reveal_or_share_path
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Evolvria");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_chat_endpoint() {
        assert_eq!(
            chat_endpoint("https://one.gloscai.com"),
            "https://one.gloscai.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("https://one.gloscai.com/v1"),
            "https://one.gloscai.com/v1/chat/completions"
        );
    }

    #[test]
    fn validates_payload_schema() {
        let payload = json!({
            "schema_version": 1,
            "world": {"id": "world_001", "name": "烟测世界"},
            "characters": [],
            "locations": [],
            "factions": [],
            "timeline": [],
            "memories": [],
            "ai_logs": [],
            "threads": [],
            "suggested_actions": []
        });
        assert!(validate_payload(&payload).is_ok());
    }

    #[test]
    fn builds_workspace_files_with_agents_entrypoint() {
        let payload = json!({
            "schema_version": 1,
            "world": {
                "id": "world_001",
                "name": "烟测世界",
                "summary": "测试摘要",
                "current_time": {"day": 1, "hour": 8},
                "map_routes": [],
                "map_image": {}
            },
            "characters": [{"id": "char_hero", "name": "主角", "current_location_id": "loc_start"}],
            "locations": [{"id": "loc_start", "name": "起点", "position": {"x": 0, "y": 0}}],
            "factions": [],
            "timeline": [],
            "memories": [],
            "ai_logs": [],
            "threads": [],
            "suggested_actions": [],
            "updated_at": "2026-06-30T00:00:00Z"
        });
        let files = build_workspace_files(&payload).expect("workspace files");
        let paths = files.iter().map(|(path, _)| path.as_str()).collect::<Vec<_>>();
        assert!(paths.contains(&"AGENTS.md"));
        assert!(paths.contains(&"state/payload.json"));
        assert!(paths.contains(&"characters/char_hero.md"));
        assert!(paths.contains(&"locations/loc_start.md"));
        let agents = files
            .iter()
            .find(|(path, _)| path == "AGENTS.md")
            .map(|(_, content)| content)
            .unwrap();
        assert!(agents.contains("每次处理世界模拟"));
    }
}
