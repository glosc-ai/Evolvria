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
    let path = active_save_path(&app)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    read_json(&path)
}

#[tauri::command]
fn save_world(app: AppHandle, payload: Value) -> Result<bool, String> {
    validate_payload(&payload)?;
    let path = active_save_path(&app)?;
    ensure_parent(&path)?;
    if path.exists() {
        create_backup(&app, &path)?;
    }
    write_json_atomic(&path, &payload)?;
    Ok(true)
}

#[tauri::command]
fn save_ai_checkpoint(app: AppHandle, payload: Value) -> Result<bool, String> {
    validate_payload(&payload)?;
    let path = ai_checkpoint_path(&app)?;
    write_json_atomic(&path, &payload)?;
    Ok(true)
}

#[tauri::command]
fn list_save_entries(app: AppHandle) -> Result<Vec<SaveEntry>, String> {
    let mut entries = Vec::new();
    let active = active_save_path(&app)?;
    if active.exists() {
        entries.push(save_entry("active", &active)?);
    }
    let checkpoint = ai_checkpoint_path(&app)?;
    if checkpoint.exists() {
        entries.push(save_entry("ai_checkpoint", &checkpoint)?);
    }
    let backup_dir = backup_dir(&app)?;
    if backup_dir.exists() {
        let mut backups = fs::read_dir(&backup_dir)
            .map_err(to_string)?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
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
    write_world_zip(&export_path, &payload)?;
    Ok(ExportWorldResult {
        path: path_to_string(export_path),
        cancelled: false,
    })
}

fn write_world_zip(export_path: &Path, payload: &Value) -> Result<(), String> {
    ensure_parent(export_path)?;
    let world_id = payload
        .get("world")
        .and_then(|world| world.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("world");
    let file = File::create(export_path).map_err(to_string)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let manifest = json!({
        "schema_version": SCHEMA_VERSION,
        "world_id": world_id,
        "display_name": payload.get("world").and_then(|world| world.get("name")).and_then(Value::as_str).unwrap_or("未命名世界"),
        "exported_at": Utc::now().to_rfc3339(),
        "files": {
            "payload": "payload.json"
        }
    });
    zip.start_file("manifest.json", options)
        .map_err(to_string)?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .map_err(to_string)?
            .as_bytes(),
    )
    .map_err(to_string)?;
    zip.start_file("payload.json", options).map_err(to_string)?;
    zip.write_all(
        serde_json::to_string_pretty(&payload)
            .map_err(to_string)?
            .as_bytes(),
    )
    .map_err(to_string)?;
    zip.finish().map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn import_world(app: AppHandle, source_path: String) -> Result<Value, String> {
    let file = File::open(&source_path).map_err(to_string)?;
    let mut archive = zip::ZipArchive::new(file).map_err(to_string)?;
    let mut payload_file = archive.by_name("payload.json").map_err(to_string)?;
    let mut text = String::new();
    payload_file.read_to_string(&mut text).map_err(to_string)?;
    let payload: Value = serde_json::from_str(&text).map_err(to_string)?;
    validate_payload(&payload)?;
    save_world(app, payload.clone())?;
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
    let map_dir = save_dir(&app)?.join("maps");
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
    let map_dir = save_dir(&app)?.join("maps");
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
    let map_dir = save_dir(&app)?.join("maps");
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
            {"role": "system", "content": "你是 Evolvria 的叙事与世界模拟引擎。只返回合法 JSON，不要输出 JSON 以外的内容。"},
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

fn active_save_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(save_dir(app)?.join("active_world.json"))
}

fn ai_checkpoint_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(backup_dir(app)?.join("ai_before_request.json"))
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

fn create_backup(app: &AppHandle, active: &Path) -> Result<(), String> {
    let backup_dir = backup_dir(app)?;
    fs::create_dir_all(&backup_dir).map_err(to_string)?;
    let backup_path = backup_dir.join(format!(
        "active_world_{}.json",
        Utc::now().format("%Y%m%d_%H%M%S%.3f")
    ));
    fs::copy(active, backup_path).map_err(to_string)?;
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
            fs::remove_file(oldest).map_err(to_string)?;
        }
        backups.remove(0);
    }
    Ok(())
}

fn save_entry(kind: &str, path: &Path) -> Result<SaveEntry, String> {
    let value = read_json(path).unwrap_or_else(|_| json!({}));
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
            "world": {},
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
}
