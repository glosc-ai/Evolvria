use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use image::{GenericImageView, ImageFormat, ImageReader};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;

const SAVE_FILE: &str = "save.json";
const MANIFEST_FILE: &str = "manifest.json";
const MAX_IMPORT_ENTRIES: usize = 500;
const MAX_IMPORT_ENTRY_BYTES: u64 = 50 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES: u64 = 250 * 1024 * 1024;
const MAX_MEDIA_IMPORT_BYTES: u64 = 50 * 1024 * 1024;
const MAX_MEDIA_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const SECRET_SERVICE: &str = "ai.evolvria.app";
const INSECURE_SECRET_FILE_ENV: &str = "EVOLVRIA_ALLOW_INSECURE_SECRET_FILE";
const OPENAI_COMPATIBLE_KEY_ENV: &str = "EVOLVRIA_OPENAI_COMPATIBLE_API_KEY";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMeta {
    id: String,
    name: String,
    description: Option<String>,
    updated_at: String,
    path: Option<String>,
    schema_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupMeta {
    id: String,
    workspace_id: String,
    reason: String,
    created_at: String,
    path: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    path: String,
    cancelled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretWriteResult {
    backend: String,
    warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretDeleteResult {
    backend: String,
    deleted: bool,
    warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaAssetResult {
    id: String,
    kind: String,
    purpose: String,
    relative_path: String,
    mime_type: String,
    size_bytes: u64,
    variants: Vec<Value>,
    alt_text: String,
    source: Value,
    license: Value,
    safety: Value,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageVerificationIssue {
    severity: String,
    field: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetRefsReport {
    declared: Vec<String>,
    referenced: Vec<String>,
    missing: Vec<String>,
    browser_only: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageVerificationReport {
    ok: bool,
    checked_at: String,
    format: String,
    workspace_id: Option<String>,
    workspace_name: Option<String>,
    schema_version: Option<String>,
    entity_counts: Value,
    asset_refs: AssetRefsReport,
    issues: Vec<PackageVerificationIssue>,
}

#[tauri::command]
fn workspace_list(app: AppHandle) -> Result<Vec<WorkspaceMeta>, String> {
    let root = workspaces_dir(&app)?;
    fs::create_dir_all(&root).map_err(to_string)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(root).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let save_path = path.join(SAVE_FILE);
        if save_path.exists() {
            if let Ok(envelope) = read_json(&save_path) {
                entries.push(meta_from_envelope(&path, &envelope));
            }
        }
    }
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

#[tauri::command]
fn workspace_create(app: AppHandle, envelope: Value) -> Result<WorkspaceMeta, String> {
    let workspace_id = envelope_workspace_id(&envelope)?;
    workspace_write(app, workspace_id, envelope)
}

#[tauri::command]
fn workspace_read(app: AppHandle, workspace_id: String) -> Result<Value, String> {
    let path = workspace_dir(&app, &workspace_id)?.join(SAVE_FILE);
    if !path.exists() {
        return Err("workspace_not_found".to_string());
    }
    read_json(&path)
}

#[tauri::command]
fn workspace_write(
    app: AppHandle,
    workspace_id: String,
    envelope: Value,
) -> Result<WorkspaceMeta, String> {
    validate_workspace_id(&workspace_id)?;
    validate_envelope(&envelope)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    fs::create_dir_all(dir.join("assets/images")).map_err(to_string)?;
    fs::create_dir_all(dir.join("assets/audio")).map_err(to_string)?;
    fs::create_dir_all(dir.join("assets/video")).map_err(to_string)?;
    fs::create_dir_all(dir.join("backups")).map_err(to_string)?;
    fs::create_dir_all(dir.join("logs")).map_err(to_string)?;
    write_json_atomic(&dir.join(SAVE_FILE), &envelope)?;
    let manifest = json!({
        "format": "evolvria_workspace",
        "schemaVersion": envelope.get("schemaVersion").and_then(Value::as_str).unwrap_or("unknown"),
        "workspaceId": workspace_id,
        "updatedAt": Utc::now().to_rfc3339(),
    });
    write_json_atomic(&dir.join(MANIFEST_FILE), &manifest)?;
    Ok(meta_from_envelope(&dir, &envelope))
}

#[tauri::command]
fn workspace_backup(
    app: AppHandle,
    workspace_id: String,
    reason: String,
) -> Result<BackupMeta, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    create_backup_in_dir(&dir, &workspace_id, &reason)
}

#[tauri::command]
fn workspace_list_backups(app: AppHandle, workspace_id: String) -> Result<Vec<BackupMeta>, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    list_backups_from_dir(&dir, &workspace_id)
}

#[tauri::command]
fn workspace_restore_backup(
    app: AppHandle,
    workspace_id: String,
    backup_id: String,
) -> Result<Value, String> {
    validate_workspace_id(&workspace_id)?;
    validate_backup_id(&backup_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    restore_backup_from_dir(&dir, &workspace_id, &backup_id)
}

#[tauri::command]
fn workspace_export_zip(
    app: AppHandle,
    workspace_id: String,
    target_path: Option<String>,
) -> Result<ExportResult, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    if !dir.join(SAVE_FILE).exists() {
        return Err("workspace_not_found".to_string());
    }
    let export_path = match target_path {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => {
            let exports = app_data_dir(&app)?.join("exports");
            fs::create_dir_all(&exports).map_err(to_string)?;
            exports.join(format!(
                "{}-{}.evolvria.zip",
                workspace_id,
                timestamp_slug()
            ))
        }
    };
    ensure_parent(&export_path)?;
    write_workspace_zip(&dir, &export_path)?;
    Ok(ExportResult {
        path: path_to_string(export_path),
        cancelled: false,
    })
}

#[tauri::command]
fn workspace_import_zip(app: AppHandle, source_path: String) -> Result<WorkspaceMeta, String> {
    let source = PathBuf::from(source_path);
    let file = File::open(&source).map_err(to_string)?;
    let archive = zip::ZipArchive::new(file).map_err(to_string)?;
    import_zip_archive(app, archive)
}

#[tauri::command]
fn workspace_import_zip_bytes(app: AppHandle, bytes: Vec<u8>) -> Result<WorkspaceMeta, String> {
    let cursor = std::io::Cursor::new(bytes);
    let archive = zip::ZipArchive::new(cursor).map_err(to_string)?;
    import_zip_archive(app, archive)
}

fn import_zip_archive<R: Read + Seek>(
    app: AppHandle,
    mut archive: zip::ZipArchive<R>,
) -> Result<WorkspaceMeta, String> {
    validate_zip_entries(&mut archive)?;
    let mut save = String::new();
    archive
        .by_name(SAVE_FILE)
        .map_err(|_| "zip_missing_save".to_string())?
        .read_to_string(&mut save)
        .map_err(to_string)?;
    let mut envelope: Value = serde_json::from_str(&save).map_err(to_string)?;
    validate_envelope(&envelope)?;
    let original_id = envelope_workspace_id(&envelope)?;
    let imported_id = format!("{}_import_{}", original_id, timestamp_slug());
    if let Some(workspace) = envelope.get_mut("workspace").and_then(Value::as_object_mut) {
        workspace.insert("id".to_string(), Value::String(imported_id.clone()));
        workspace.insert(
            "updatedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    let dir = workspace_dir(&app, &imported_id)?;
    let meta = workspace_write(app, imported_id, envelope)?;
    extract_zip_assets(&mut archive, &dir)?;
    Ok(meta)
}

#[tauri::command]
fn media_import(
    app: AppHandle,
    workspace_id: String,
    path: String,
    purpose: String,
) -> Result<MediaAssetResult, String> {
    validate_workspace_id(&workspace_id)?;
    import_media_file(&app, &workspace_id, PathBuf::from(path), purpose)
}

#[tauri::command]
async fn media_pick_and_import(
    app: AppHandle,
    workspace_id: String,
    purpose: String,
) -> Result<Option<MediaAssetResult>, String> {
    validate_workspace_id(&workspace_id)?;
    validate_media_purpose(&purpose)?;
    let picked = app
        .dialog()
        .file()
        .add_filter(
            "Supported media",
            &[
                "png", "jpg", "jpeg", "webp", "gif", "mp3", "wav", "ogg", "mp4", "mov", "webm",
                "txt", "md", "json", "pdf",
            ],
        )
        .blocking_pick_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let source = path.into_path().map_err(to_string)?;
    import_media_file(&app, &workspace_id, source, purpose).map(Some)
}

fn import_media_file(
    app: &AppHandle,
    workspace_id: &str,
    source: PathBuf,
    purpose: String,
) -> Result<MediaAssetResult, String> {
    validate_media_purpose(&purpose)?;
    if !source.is_file() {
        return Err("media_source_not_found".to_string());
    }
    let metadata = fs::metadata(&source).map_err(to_string)?;
    if metadata.len() > MAX_MEDIA_IMPORT_BYTES {
        return Err("media_source_too_large".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (kind, mime_type) =
        media_metadata(&extension).ok_or_else(|| "media_unsupported_type".to_string())?;
    let id = format!("media_{}", hash_file_name(&source, metadata.len()));
    let relative_path = format!("assets/{}/{}.{}", kind_folder(kind), id, extension);
    let target = workspace_dir(app, workspace_id)?.join(&relative_path);
    ensure_parent(&target)?;
    fs::copy(&source, &target).map_err(to_string)?;
    Ok(MediaAssetResult {
        id,
        kind: kind.to_string(),
        purpose,
        relative_path,
        mime_type: mime_type.to_string(),
        size_bytes: metadata.len(),
        variants: vec![],
        alt_text: "Imported local asset".to_string(),
        source: json!({ "kind": "imported", "label": "Local file import" }),
        license: json!({ "kind": "unknown", "note": "User must confirm rights before publishing." }),
        safety: json!({ "rating": "SFW", "state": "draft", "reasons": [], "safetyFlags": ["none"] }),
        created_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
fn media_thumbnail(
    app: AppHandle,
    workspace_id: String,
    asset_id: String,
    size: Option<u32>,
) -> Result<Value, String> {
    validate_workspace_id(&workspace_id)?;
    validate_entity_id(&asset_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    generate_thumbnail_from_dir(&dir, &asset_id, size.unwrap_or(320))
}

#[tauri::command]
fn media_read_data_url(
    app: AppHandle,
    workspace_id: String,
    relative_path: String,
) -> Result<String, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    read_media_data_url_from_dir(&dir, &relative_path)
}

#[tauri::command]
fn secret_set(app: AppHandle, key: String, value: String) -> Result<SecretWriteResult, String> {
    validate_secret_key(&key)?;
    validate_secret_value(&value)?;
    match write_keychain_secret(&key, &value) {
        Ok(()) => {
            let _ = remove_secret_from_file(&fallback_secrets_path(&app)?, &key);
            let _ = remove_secret_from_file(&legacy_secrets_path(&app)?, &key);
            Ok(SecretWriteResult {
                backend: "keychain".to_string(),
                warning: None,
            })
        }
        Err(error) if insecure_secret_file_allowed() => {
            write_secret_to_file(&fallback_secrets_path(&app)?, &key, &value)?;
            Ok(SecretWriteResult {
                backend: "file_fallback".to_string(),
                warning: Some(format!(
                    "System keychain unavailable; saved to an explicitly enabled local fallback file. Keychain error: {}",
                    error
                )),
            })
        }
        Err(error) => Err(format!(
            "secret_keychain_unavailable: {}. Set {}=1 only if you accept local file fallback risk.",
            error, INSECURE_SECRET_FILE_ENV
        )),
    }
}

#[tauri::command]
fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    validate_secret_key(&key)?;
    if let Some(value) = read_secret_from_env(&key) {
        return Ok(Some(value));
    }
    if let Ok(value) = read_keychain_secret(&key) {
        return Ok(Some(value));
    }
    if let Some(value) = read_secret_from_file(&legacy_secrets_path(&app)?, &key)? {
        if write_keychain_secret(&key, &value).is_ok() {
            let _ = remove_secret_from_file(&legacy_secrets_path(&app)?, &key);
            return Ok(Some(value));
        }
        if insecure_secret_file_allowed() {
            return Ok(Some(value));
        }
    }
    if insecure_secret_file_allowed() {
        return read_secret_from_file(&fallback_secrets_path(&app)?, &key);
    }
    Ok(None)
}

#[tauri::command]
fn secret_delete(app: AppHandle, key: String) -> Result<SecretDeleteResult, String> {
    validate_secret_key(&key)?;
    let mut warnings = Vec::new();
    let keychain_deleted = match delete_keychain_secret(&key) {
        Ok(deleted) => deleted,
        Err(error) => {
            warnings.push(format!("Keychain delete failed: {}", error));
            false
        }
    };
    let fallback_deleted = remove_secret_from_file(&fallback_secrets_path(&app)?, &key)?;
    let legacy_deleted = remove_secret_from_file(&legacy_secrets_path(&app)?, &key)?;

    if read_secret_from_env(&key).is_some() {
        if let Some(env_name) = secret_env_var_name(&key) {
            warnings.push(format!(
                "{} is still set and will override saved provider keys until unset.",
                env_name
            ));
        }
    }

    let file_deleted = fallback_deleted || legacy_deleted;
    let backend = if keychain_deleted && file_deleted {
        "keychain_and_file".to_string()
    } else if keychain_deleted {
        "keychain".to_string()
    } else if file_deleted {
        "file_fallback".to_string()
    } else {
        "none".to_string()
    };

    Ok(SecretDeleteResult {
        backend,
        deleted: keychain_deleted || file_deleted,
        warning: join_warnings(warnings),
    })
}

#[tauri::command]
fn log_export(app: AppHandle) -> Result<ExportResult, String> {
    let logs = app_data_dir(&app)?.join("logs");
    fs::create_dir_all(&logs).map_err(to_string)?;
    let target = logs.join(format!("diagnostics-{}.txt", timestamp_slug()));
    fs::write(
        &target,
        format!(
            "Evolvria diagnostics\ncreatedAt={}\n",
            Utc::now().to_rfc3339()
        ),
    )
    .map_err(to_string)?;
    Ok(ExportResult {
        path: path_to_string(target),
        cancelled: false,
    })
}

#[tauri::command]
fn content_package_verify(
    app: AppHandle,
    workspace_id: String,
) -> Result<PackageVerificationReport, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    verify_workspace_package_dir(&dir)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            workspace_list,
            workspace_create,
            workspace_read,
            workspace_write,
            workspace_backup,
            workspace_list_backups,
            workspace_restore_backup,
            workspace_export_zip,
            workspace_import_zip,
            workspace_import_zip_bytes,
            media_import,
            media_pick_and_import,
            media_thumbnail,
            media_read_data_url,
            secret_set,
            secret_get,
            secret_delete,
            log_export,
            content_package_verify
        ])
        .run(tauri::generate_context!())
        .expect("error while running Evolvria");
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(to_string)
}

fn workspaces_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("workspaces"))
}

fn workspace_dir(app: &AppHandle, workspace_id: &str) -> Result<PathBuf, String> {
    validate_workspace_id(workspace_id)?;
    Ok(workspaces_dir(app)?.join(workspace_id))
}

fn legacy_secrets_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("secrets.json"))
}

fn fallback_secrets_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("secrets.insecure.json"))
}

fn keychain_entry(key: &str) -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, key).map_err(to_string)
}

fn write_keychain_secret(key: &str, value: &str) -> Result<(), String> {
    keychain_entry(key)?.set_password(value).map_err(to_string)
}

fn read_keychain_secret(key: &str) -> Result<String, String> {
    keychain_entry(key)?.get_password().map_err(to_string)
}

fn delete_keychain_secret(key: &str) -> Result<bool, String> {
    match keychain_entry(key)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(error) => Err(to_string(error)),
    }
}

fn read_secret_from_env(key: &str) -> Option<String> {
    let env_name = secret_env_var_name(key)?;
    std::env::var(env_name)
        .ok()
        .filter(|value| !value.is_empty())
}

fn secret_env_var_name(key: &str) -> Option<&'static str> {
    match key {
        "openai-compatible-api-key" => Some(OPENAI_COMPATIBLE_KEY_ENV),
        _ => None,
    }
}

fn insecure_secret_file_allowed() -> bool {
    std::env::var(INSECURE_SECRET_FILE_ENV)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn read_secret_file(path: &Path) -> Result<serde_json::Map<String, Value>, String> {
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    match read_json(path)? {
        Value::Object(map) => Ok(map),
        _ => Err("secrets_invalid".to_string()),
    }
}

fn read_secret_from_file(path: &Path, key: &str) -> Result<Option<String>, String> {
    Ok(read_secret_file(path)?
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned))
}

fn write_secret_to_file(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let mut secrets = read_secret_file(path)?;
    secrets.insert(key.to_string(), Value::String(value.to_string()));
    write_json_atomic(path, &Value::Object(secrets))
}

fn remove_secret_from_file(path: &Path, key: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let mut secrets = read_secret_file(path)?;
    let removed = secrets.remove(key).is_some();
    if !removed {
        return Ok(false);
    }
    if secrets.is_empty() {
        fs::remove_file(path).map_err(to_string)?;
    } else {
        write_json_atomic(path, &Value::Object(secrets))?;
    }
    Ok(true)
}

fn validate_workspace_id(workspace_id: &str) -> Result<(), String> {
    let valid = workspace_id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-');
    if workspace_id.is_empty() || workspace_id.contains("..") || !valid {
        return Err("invalid_workspace_id".to_string());
    }
    Ok(())
}

fn validate_backup_id(backup_id: &str) -> Result<(), String> {
    validate_entity_id(backup_id)?;
    if !backup_id.starts_with("backup_") {
        return Err("invalid_backup_id".to_string());
    }
    Ok(())
}

fn validate_entity_id(id: &str) -> Result<(), String> {
    let valid = id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-');
    if id.is_empty() || id.contains("..") || !valid {
        return Err("invalid_entity_id".to_string());
    }
    Ok(())
}

fn create_backup_in_dir(
    dir: &Path,
    workspace_id: &str,
    reason: &str,
) -> Result<BackupMeta, String> {
    let save_path = dir.join(SAVE_FILE);
    if !save_path.exists() {
        return Err("workspace_not_found".to_string());
    }
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(to_string)?;
    let id = format!("backup_{}", timestamp_slug());
    let file_name = format!("{}_{}.json", id, sanitize_file_part(reason));
    let target = backups.join(file_name);
    let size_bytes = fs::copy(save_path, &target).map_err(to_string)?;
    Ok(BackupMeta {
        id,
        workspace_id: workspace_id.to_string(),
        reason: reason.to_string(),
        created_at: Utc::now().to_rfc3339(),
        path: path_to_string(target),
        size_bytes,
    })
}

fn list_backups_from_dir(dir: &Path, workspace_id: &str) -> Result<Vec<BackupMeta>, String> {
    let backups = dir.join("backups");
    if !backups.exists() {
        return Ok(Vec::new());
    }
    let mut metas = Vec::new();
    for entry in fs::read_dir(backups).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        if let Some(meta) = backup_meta_from_path(&path, workspace_id)? {
            metas.push(meta);
        }
    }
    metas.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(metas)
}

fn backup_meta_from_path(path: &Path, workspace_id: &str) -> Result<Option<BackupMeta>, String> {
    let Some(stem) = path.file_stem().and_then(|name| name.to_str()) else {
        return Ok(None);
    };
    let mut parts = stem.splitn(3, '_');
    let Some(prefix) = parts.next() else {
        return Ok(None);
    };
    let Some(timestamp) = parts.next() else {
        return Ok(None);
    };
    if prefix != "backup" {
        return Ok(None);
    }
    let id = format!("backup_{}", timestamp);
    validate_backup_id(&id)?;
    let reason = parts.next().unwrap_or("manual").to_string();
    let metadata = fs::metadata(path).map_err(to_string)?;
    let modified = metadata.modified().map_err(to_string)?;
    let created_at: DateTime<Utc> = modified.into();
    Ok(Some(BackupMeta {
        id,
        workspace_id: workspace_id.to_string(),
        reason,
        created_at: created_at.to_rfc3339(),
        path: path_to_string(path),
        size_bytes: metadata.len(),
    }))
}

fn find_backup_path(dir: &Path, workspace_id: &str, backup_id: &str) -> Result<PathBuf, String> {
    let backups = list_backups_from_dir(dir, workspace_id)?;
    backups
        .into_iter()
        .find(|backup| backup.id == backup_id)
        .map(|backup| PathBuf::from(backup.path))
        .ok_or_else(|| "backup_not_found".to_string())
}

fn restore_backup_from_dir(
    dir: &Path,
    workspace_id: &str,
    backup_id: &str,
) -> Result<Value, String> {
    let backup_path = find_backup_path(dir, workspace_id, backup_id)?;
    let envelope = read_json(&backup_path)?;
    validate_envelope(&envelope)?;
    let envelope_workspace_id = envelope_workspace_id(&envelope)?;
    if envelope_workspace_id != workspace_id {
        return Err("backup_workspace_mismatch".to_string());
    }

    if dir.join(SAVE_FILE).exists() {
        create_backup_in_dir(dir, workspace_id, "pre_restore")?;
    }
    write_json_atomic(&dir.join(SAVE_FILE), &envelope)?;
    let manifest = json!({
        "format": "evolvria_workspace",
        "schemaVersion": envelope.get("schemaVersion").and_then(Value::as_str).unwrap_or("unknown"),
        "workspaceId": workspace_id,
        "updatedAt": Utc::now().to_rfc3339(),
        "restoredFromBackupId": backup_id,
    });
    write_json_atomic(&dir.join(MANIFEST_FILE), &manifest)?;
    Ok(envelope)
}

fn validate_secret_key(key: &str) -> Result<(), String> {
    let valid = key
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-');
    if key.is_empty() || !valid {
        return Err("invalid_secret_key".to_string());
    }
    Ok(())
}

fn validate_secret_value(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 20_000 || value.contains('\0') {
        return Err("invalid_secret_value".to_string());
    }
    Ok(())
}

fn validate_media_purpose(purpose: &str) -> Result<(), String> {
    match purpose {
        "cover" | "avatar" | "background" | "sprite" | "voice" | "reference" => Ok(()),
        _ => Err("invalid_media_purpose".to_string()),
    }
}

fn join_warnings(warnings: Vec<String>) -> Option<String> {
    if warnings.is_empty() {
        None
    } else {
        Some(warnings.join(" "))
    }
}

fn validate_envelope(envelope: &Value) -> Result<(), String> {
    if envelope.get("schemaVersion").and_then(Value::as_str) != Some("1.0.0") {
        return Err("schema_mismatch".to_string());
    }
    envelope_workspace_id(envelope)?;
    if envelope.get("entities").is_none() {
        return Err("invalid_envelope_entities".to_string());
    }
    Ok(())
}

fn envelope_workspace_id(envelope: &Value) -> Result<String, String> {
    let id = envelope
        .get("workspace")
        .and_then(|workspace| workspace.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| "invalid_workspace_id".to_string())?
        .to_string();
    validate_workspace_id(&id)?;
    Ok(id)
}

fn meta_from_envelope(dir: &Path, envelope: &Value) -> WorkspaceMeta {
    let workspace = envelope.get("workspace").unwrap_or(&Value::Null);
    WorkspaceMeta {
        id: workspace
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        name: workspace
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Untitled Workspace")
            .to_string(),
        description: workspace
            .get("description")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        updated_at: workspace
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("1970-01-01T00:00:00Z")
            .to_string(),
        path: Some(path_to_string(dir)),
        schema_version: envelope
            .get("schemaVersion")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(to_string)?;
    serde_json::from_str(&text).map_err(to_string)
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    ensure_parent(path)?;
    let temp = path.with_extension("tmp");
    let text = serde_json::to_string_pretty(value).map_err(to_string)?;
    fs::write(&temp, text).map_err(to_string)?;
    fs::rename(temp, path).map_err(to_string)?;
    Ok(())
}

fn validate_zip_entries<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> Result<(), String> {
    if archive.len() > MAX_IMPORT_ENTRIES {
        return Err("zip_too_many_entries".to_string());
    }

    let mut total_size = 0_u64;
    let mut has_save = false;
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(to_string)?;
        let raw_name = file.name();
        let normalized = raw_name.replace('\\', "/");

        if normalized.is_empty()
            || normalized.starts_with('/')
            || normalized.contains('\0')
            || normalized.split('/').any(|part| part == "..")
            || normalized
                .split('/')
                .next()
                .is_some_and(|part| part.contains(':'))
        {
            return Err("zip_path_traversal".to_string());
        }

        if file.size() > MAX_IMPORT_ENTRY_BYTES {
            return Err("zip_entry_too_large".to_string());
        }
        total_size = total_size.saturating_add(file.size());
        if total_size > MAX_IMPORT_TOTAL_BYTES {
            return Err("zip_total_too_large".to_string());
        }

        let allowed = normalized == SAVE_FILE
            || normalized == MANIFEST_FILE
            || is_import_asset_path(&normalized);
        if !file.is_dir() && !allowed {
            return Err("zip_unknown_entry".to_string());
        }
        if normalized == SAVE_FILE {
            has_save = true;
        }
    }

    if !has_save {
        return Err("zip_missing_save".to_string());
    }
    Ok(())
}

fn extract_zip_assets<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    workspace_dir: &Path,
) -> Result<(), String> {
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(to_string)?;
        let normalized = file.name().replace('\\', "/");
        if file.is_dir() || !is_import_asset_path(&normalized) {
            continue;
        }
        let target = workspace_dir.join(&normalized);
        ensure_parent(&target)?;
        let mut output = File::create(&target).map_err(to_string)?;
        std::io::copy(&mut file, &mut output).map_err(to_string)?;
    }
    Ok(())
}

fn is_import_asset_path(path: &str) -> bool {
    path.starts_with("assets/images/")
        || path.starts_with("assets/audio/")
        || path.starts_with("assets/video/")
        || path.starts_with("assets/documents/")
}

fn write_workspace_zip(source_dir: &Path, export_path: &Path) -> Result<(), String> {
    let file = File::create(export_path).map_err(to_string)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    add_file_to_zip(&mut zip, source_dir, &source_dir.join(SAVE_FILE), options)?;
    let manifest_path = source_dir.join(MANIFEST_FILE);
    if manifest_path.exists() {
        add_file_to_zip(&mut zip, source_dir, &manifest_path, options)?;
    }
    let assets = source_dir.join("assets");
    if assets.exists() {
        add_dir_to_zip(&mut zip, source_dir, &assets, options)?;
    }
    zip.finish().map_err(to_string)?;
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<File>,
    root: &Path,
    dir: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let path = entry.path();
        if path.is_dir() {
            add_dir_to_zip(zip, root, &path, options)?;
        } else if path.is_file() {
            add_file_to_zip(zip, root, &path, options)?;
        }
    }
    Ok(())
}

fn add_file_to_zip(
    zip: &mut zip::ZipWriter<File>,
    root: &Path,
    path: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let name = path.strip_prefix(root).map_err(to_string)?;
    let zip_name = name
        .to_str()
        .ok_or_else(|| "invalid_zip_path".to_string())?
        .replace('\\', "/");
    if zip_name.contains("..") || zip_name.starts_with('/') {
        return Err("path_traversal".to_string());
    }
    zip.start_file(zip_name, options).map_err(to_string)?;
    let bytes = fs::read(path).map_err(to_string)?;
    zip.write_all(&bytes).map_err(to_string)?;
    Ok(())
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    Ok(())
}

fn timestamp_slug() -> String {
    Utc::now().format("%Y%m%dT%H%M%S%9fZ").to_string()
}

fn sanitize_file_part(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .filter(|char| char.is_ascii_alphanumeric() || *char == '-' || *char == '_')
        .collect();
    if sanitized.is_empty() {
        "manual".to_string()
    } else {
        sanitized
    }
}

fn hash_file_name(path: &Path, size: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(size.to_le_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)[..16].to_string()
}

fn media_metadata(extension: &str) -> Option<(&'static str, &'static str)> {
    match extension.to_ascii_lowercase().as_str() {
        "png" => Some(("image", "image/png")),
        "jpg" | "jpeg" => Some(("image", "image/jpeg")),
        "webp" => Some(("image", "image/webp")),
        "gif" => Some(("image", "image/gif")),
        "mp3" => Some(("audio", "audio/mpeg")),
        "wav" => Some(("audio", "audio/wav")),
        "ogg" => Some(("audio", "audio/ogg")),
        "mp4" => Some(("video", "video/mp4")),
        "mov" => Some(("video", "video/quicktime")),
        "webm" => Some(("video", "video/webm")),
        "txt" => Some(("document", "text/plain")),
        "md" => Some(("document", "text/markdown")),
        "json" => Some(("document", "application/json")),
        "pdf" => Some(("document", "application/pdf")),
        _ => None,
    }
}

fn kind_folder(kind: &str) -> &'static str {
    match kind {
        "image" => "images",
        "audio" => "audio",
        "video" => "video",
        _ => "documents",
    }
}

fn generate_thumbnail_from_dir(
    workspace_dir: &Path,
    asset_id: &str,
    requested_size: u32,
) -> Result<Value, String> {
    validate_entity_id(asset_id)?;
    let envelope = read_json(&workspace_dir.join(SAVE_FILE))?;
    let asset = envelope
        .get("entities")
        .and_then(|entities| entities.get("mediaAssets"))
        .and_then(Value::as_object)
        .and_then(|media| media.get(asset_id))
        .ok_or_else(|| "media_asset_not_found".to_string())?;
    let asset_kind = asset.get("kind").and_then(Value::as_str).unwrap_or("");
    if asset_kind != "image" {
        return Err("media_thumbnail_unsupported".to_string());
    }
    let relative_path = asset
        .get("relativePath")
        .and_then(Value::as_str)
        .ok_or_else(|| "asset_relative_path_missing".to_string())?;
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (kind, _) =
        media_metadata(&extension).ok_or_else(|| "media_unsupported_type".to_string())?;
    if kind != "image" {
        return Err("media_thumbnail_unsupported".to_string());
    }

    let source = resolve_existing_asset_path(workspace_dir, relative_path)?;
    let source_size = fs::metadata(&source).map_err(to_string)?.len();
    if source_size > MAX_MEDIA_PREVIEW_BYTES {
        return Err("media_preview_too_large".to_string());
    }
    let size = requested_size.clamp(64, 1024);
    let image = ImageReader::open(&source)
        .map_err(to_string)?
        .with_guessed_format()
        .map_err(to_string)?
        .decode()
        .map_err(to_string)?;
    let thumbnail = image.thumbnail(size, size);
    let (width, height) = thumbnail.dimensions();
    let variant_id = format!("variant_{}_{}", asset_id, size);
    let relative_path = format!("assets/images/variants/{}.png", variant_id);
    let target = workspace_dir.join(&relative_path);
    ensure_parent(&target)?;
    thumbnail
        .save_with_format(&target, ImageFormat::Png)
        .map_err(to_string)?;
    let size_bytes = fs::metadata(&target).map_err(to_string)?.len();

    Ok(json!({
        "id": variant_id,
        "relativePath": relative_path,
        "width": width,
        "height": height,
        "sizeBytes": size_bytes,
        "purpose": "thumbnail"
    }))
}

fn read_media_data_url_from_dir(
    workspace_dir: &Path,
    relative_path: &str,
) -> Result<String, String> {
    validate_asset_relative_path(relative_path)?;
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (kind, mime_type) =
        media_metadata(&extension).ok_or_else(|| "media_unsupported_type".to_string())?;
    if kind == "document" {
        return Err("media_preview_unsupported".to_string());
    }
    let path = resolve_existing_asset_path(workspace_dir, relative_path)?;
    let metadata = fs::metadata(&path).map_err(|_| "media_file_missing".to_string())?;
    if metadata.len() > MAX_MEDIA_PREVIEW_BYTES {
        return Err("media_preview_too_large".to_string());
    }
    let bytes = fs::read(path).map_err(to_string)?;
    Ok(format!(
        "data:{};base64,{}",
        mime_type,
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn resolve_existing_asset_path(
    workspace_dir: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    validate_asset_relative_path(relative_path)?;
    let root = workspace_dir.canonicalize().map_err(to_string)?;
    let path = root.join(relative_path);
    let metadata = fs::metadata(&path).map_err(|_| "media_file_missing".to_string())?;
    if !metadata.is_file() {
        return Err("media_file_missing".to_string());
    }
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "media_file_missing".to_string())?;
    if !canonical_path.starts_with(root) {
        return Err("invalid_asset_path".to_string());
    }
    Ok(canonical_path)
}

fn validate_asset_relative_path(relative_path: &str) -> Result<(), String> {
    let normalized = relative_path.replace('\\', "/");
    if normalized.trim().is_empty()
        || normalized != relative_path
        || normalized.starts_with('/')
        || normalized.contains('\0')
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "..")
        || normalized
            .split('/')
            .next()
            .is_some_and(|part| part.contains(':'))
        || !normalized.starts_with("assets/")
    {
        return Err("invalid_asset_path".to_string());
    }
    if !is_import_asset_path(&normalized) {
        return Err("media_preview_unsupported".to_string());
    }
    Ok(())
}

fn verify_workspace_package_dir(workspace_dir: &Path) -> Result<PackageVerificationReport, String> {
    let save_path = workspace_dir.join(SAVE_FILE);
    if !save_path.exists() {
        return Err("workspace_not_found".to_string());
    }
    let envelope = read_json(&save_path)?;
    let mut issues = Vec::new();
    if let Err(error) = validate_envelope(&envelope) {
        issues.push(package_issue(
            "error",
            "save",
            format!("Invalid save envelope: {}", error),
        ));
    }

    let manifest_path = workspace_dir.join(MANIFEST_FILE);
    let manifest = if manifest_path.exists() {
        match read_json(&manifest_path) {
            Ok(value) => Some(value),
            Err(error) => {
                issues.push(package_issue(
                    "error",
                    "manifest",
                    format!("Manifest is not valid JSON: {}", error),
                ));
                None
            }
        }
    } else {
        issues.push(package_issue(
            "error",
            "manifest",
            "manifest.json is missing.",
        ));
        None
    };

    let workspace = envelope.get("workspace").unwrap_or(&Value::Null);
    let workspace_id = workspace
        .get("id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let workspace_name = workspace
        .get("name")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let schema_version = envelope
        .get("schemaVersion")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    if schema_version.as_deref() != Some("1.0.0") {
        issues.push(package_issue(
            "error",
            "schemaVersion",
            "Only schemaVersion 1.0.0 is supported.",
        ));
    }

    if let Some(manifest) = &manifest {
        let manifest_schema = manifest.get("schemaVersion").and_then(Value::as_str);
        if manifest_schema != schema_version.as_deref() {
            issues.push(package_issue(
                "error",
                "manifest.schemaVersion",
                "Manifest schemaVersion does not match save.json.",
            ));
        }
        let manifest_workspace_id = manifest.get("workspaceId").and_then(Value::as_str);
        if manifest_workspace_id != workspace_id.as_deref() {
            issues.push(package_issue(
                "error",
                "manifest.workspaceId",
                "Manifest workspaceId does not match save.json.",
            ));
        }
    }

    let entity_counts = package_entity_counts(&envelope, &mut issues);
    let asset_refs = package_asset_refs(&envelope);
    for missing in &asset_refs.missing {
        issues.push(package_issue(
            "error",
            format!("assets.{}", missing),
            format!(
                "Referenced media asset {} is missing from mediaAssets.",
                missing
            ),
        ));
    }
    verify_physical_assets(workspace_dir, &envelope, &mut issues);

    let save_text = fs::read_to_string(&save_path).map_err(to_string)?;
    if contains_secret_like_text(&save_text) {
        issues.push(package_issue(
            "error",
            "secrets",
            "Package appears to contain an API key or bearer token.",
        ));
    }

    let ok = !issues.iter().any(|issue| issue.severity == "error");
    Ok(PackageVerificationReport {
        ok,
        checked_at: Utc::now().to_rfc3339(),
        format: "tauri_workspace_dir".to_string(),
        workspace_id,
        workspace_name,
        schema_version,
        entity_counts,
        asset_refs,
        issues,
    })
}

fn package_issue(
    severity: impl Into<String>,
    field: impl Into<String>,
    message: impl Into<String>,
) -> PackageVerificationIssue {
    PackageVerificationIssue {
        severity: severity.into(),
        field: field.into(),
        message: message.into(),
    }
}

fn package_entity_counts(envelope: &Value, issues: &mut Vec<PackageVerificationIssue>) -> Value {
    let keys = [
        "characters",
        "storylines",
        "scenarios",
        "mediaAssets",
        "personas",
        "chats",
        "chatCheckpoints",
        "messages",
        "summaryChapters",
        "arcs",
        "dungeonMindConfigs",
        "fateChecks",
        "creditLedger",
        "creditAdjustments",
        "moderationCases",
        "creatorEarnings",
        "engagementStats",
        "syncOperations",
        "syncConflicts",
    ];
    let mut counts = serde_json::Map::new();
    let entities = envelope.get("entities").unwrap_or(&Value::Null);
    for key in keys {
        match entities.get(key).and_then(Value::as_object) {
            Some(map) => {
                counts.insert(key.to_string(), json!(map.len()));
            }
            None => {
                counts.insert(key.to_string(), json!(0));
                issues.push(package_issue(
                    "error",
                    format!("entities.{}", key),
                    format!("{} must be an object map.", key),
                ));
            }
        }
    }
    Value::Object(counts)
}

fn package_asset_refs(envelope: &Value) -> AssetRefsReport {
    let mut declared: Vec<String> = envelope
        .get("entities")
        .and_then(|entities| entities.get("mediaAssets"))
        .and_then(Value::as_object)
        .map(|media| media.keys().cloned().collect())
        .unwrap_or_default();
    declared.sort();
    declared.dedup();

    let mut referenced = Vec::new();
    let entities = envelope.get("entities").unwrap_or(&Value::Null);
    if let Some(storylines) = entities.get("storylines").and_then(Value::as_object) {
        for story in storylines.values() {
            collect_string_array(story.get("mediaIds"), &mut referenced);
        }
    }
    if let Some(characters) = entities.get("characters").and_then(Value::as_object) {
        for character in characters.values() {
            collect_string_array(character.get("mediaIds"), &mut referenced);
        }
    }
    if let Some(messages) = entities.get("messages").and_then(Value::as_object) {
        for message in messages.values() {
            collect_scene_hint_assets(message.get("sceneHints"), &mut referenced);
        }
    }
    referenced.sort();
    referenced.dedup();

    let missing = referenced
        .iter()
        .filter(|id| !declared.contains(id))
        .cloned()
        .collect();

    let browser_only = entities
        .get("mediaAssets")
        .and_then(Value::as_object)
        .map(|media| {
            let mut ids: Vec<String> = media
                .iter()
                .filter_map(|(id, asset)| {
                    asset
                        .get("relativePath")
                        .and_then(Value::as_str)
                        .is_some_and(|path| path.starts_with("browser://"))
                        .then(|| id.clone())
                })
                .collect();
            ids.sort();
            ids
        })
        .unwrap_or_default();

    AssetRefsReport {
        declared,
        referenced,
        missing,
        browser_only,
    }
}

fn collect_string_array(value: Option<&Value>, out: &mut Vec<String>) {
    if let Some(items) = value.and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.as_str() {
                out.push(text.to_string());
            }
        }
    }
}

fn collect_scene_hint_assets(value: Option<&Value>, out: &mut Vec<String>) {
    if let Some(hints) = value.and_then(Value::as_array) {
        for hint in hints {
            if let Some(id) = hint.get("backgroundAssetId").and_then(Value::as_str) {
                out.push(id.to_string());
            }
            if let Some(id) = hint.get("musicAssetId").and_then(Value::as_str) {
                out.push(id.to_string());
            }
            if let Some(sprites) = hint.get("characterSprites").and_then(Value::as_array) {
                for sprite in sprites {
                    if let Some(id) = sprite.get("mediaAssetId").and_then(Value::as_str) {
                        out.push(id.to_string());
                    }
                }
            }
            if let Some(voices) = hint.get("voice").and_then(Value::as_array) {
                for voice in voices {
                    if let Some(id) = voice.get("assetId").and_then(Value::as_str) {
                        out.push(id.to_string());
                    }
                }
            }
        }
    }
}

fn verify_physical_assets(
    workspace_dir: &Path,
    envelope: &Value,
    issues: &mut Vec<PackageVerificationIssue>,
) {
    let Some(media) = envelope
        .get("entities")
        .and_then(|entities| entities.get("mediaAssets"))
        .and_then(Value::as_object)
    else {
        return;
    };

    for (id, asset) in media {
        let relative_path = asset
            .get("relativePath")
            .and_then(Value::as_str)
            .unwrap_or("");
        let source_kind = asset
            .get("source")
            .and_then(|source| source.get("kind"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let size_bytes = asset.get("sizeBytes").and_then(Value::as_u64).unwrap_or(0);
        if relative_path.trim().is_empty() {
            if source_kind == "placeholder" && size_bytes == 0 {
                issues.push(package_issue(
                    "warning",
                    format!("assets.{}.relativePath", id),
                    "Placeholder asset has no physical file in the package.",
                ));
            } else {
                issues.push(package_issue(
                    "error",
                    format!("assets.{}.relativePath", id),
                    "Asset relativePath is required.",
                ));
            }
            continue;
        }
        if relative_path.starts_with('/')
            || relative_path.contains("..")
            || relative_path.contains('\\')
        {
            issues.push(package_issue(
                "error",
                format!("assets.{}.relativePath", id),
                "Asset relativePath must stay inside the workspace package.",
            ));
            continue;
        }
        if relative_path.starts_with("browser://") {
            issues.push(package_issue(
                "warning",
                format!("assets.{}", id),
                "Browser-only asset is not portable until reimported in the Tauri app.",
            ));
            continue;
        }
        if !relative_path.starts_with("assets/") {
            issues.push(package_issue(
                "warning",
                format!("assets.{}.relativePath", id),
                "Asset path should be under assets/ for portable packages.",
            ));
            continue;
        }
        let path = workspace_dir.join(relative_path);
        if !path.exists() {
            issues.push(package_issue(
                "error",
                format!("assets.{}", id),
                "Asset file is missing from the workspace assets directory.",
            ));
        }
    }
}

fn contains_secret_like_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("openai_api_key")
        || lower.contains("bearer ")
        || text
            .split(|char: char| char.is_whitespace() || char == '"' || char == '\'')
            .any(|part| part.starts_with("sk-") && part.len() >= 16)
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn rejects_path_traversal_workspace_id() {
        assert!(validate_workspace_id("../bad").is_err());
        assert!(validate_workspace_id("workspace_ok-1").is_ok());
    }

    #[test]
    fn validates_envelope_shape() {
        let envelope = json!({
            "schemaVersion": "1.0.0",
            "workspace": { "id": "workspace_test", "name": "Test", "updatedAt": "2026-07-02T00:00:00Z" },
            "entities": {}
        });
        assert!(validate_envelope(&envelope).is_ok());
    }

    #[test]
    fn rejects_wrong_schema() {
        let envelope = json!({
            "schemaVersion": "2.0.0",
            "workspace": { "id": "workspace_test" },
            "entities": {}
        });
        assert!(validate_envelope(&envelope).is_err());
    }

    #[test]
    fn lists_and_restores_workspace_backups_from_dir() {
        let dir = temp_test_dir("workspace_backups");
        fs::create_dir_all(&dir).unwrap();
        let envelope = test_envelope(json!({}));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();

        let backup = create_backup_in_dir(&dir, "workspace_test", "manual_test").unwrap();
        assert!(PathBuf::from(&backup.path).exists());
        assert!(backup.size_bytes > 0);

        let mut changed = envelope.clone();
        changed["workspace"]["name"] = json!("Changed Workspace");
        write_json_atomic(&dir.join(SAVE_FILE), &changed).unwrap();
        let restored = restore_backup_from_dir(&dir, "workspace_test", &backup.id).unwrap();
        assert_eq!(restored["workspace"]["name"], "Test Workspace");
        assert_eq!(
            read_json(&dir.join(SAVE_FILE)).unwrap()["workspace"]["name"],
            "Test Workspace"
        );

        let backups = list_backups_from_dir(&dir, "workspace_test").unwrap();
        assert!(backups.iter().any(|item| item.id == backup.id));
        assert!(backups.iter().any(|item| item.reason == "pre_restore"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn accepts_safe_workspace_zip_entries() {
        let bytes = make_zip(&[
            (SAVE_FILE, br#"{"schemaVersion":"1.0.0"}"#.as_slice()),
            (MANIFEST_FILE, b"{}"),
            ("assets/images/cover.png", b"image"),
        ]);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert!(validate_zip_entries(&mut archive).is_ok());
    }

    #[test]
    fn rejects_zip_path_traversal_entries() {
        let bytes = make_zip(&[(SAVE_FILE, b"{}"), ("../evil.json", b"bad")]);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert_eq!(
            validate_zip_entries(&mut archive).unwrap_err(),
            "zip_path_traversal"
        );
    }

    #[test]
    fn rejects_unknown_zip_entries() {
        let bytes = make_zip(&[(SAVE_FILE, b"{}"), ("private/key.txt", b"bad")]);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert_eq!(
            validate_zip_entries(&mut archive).unwrap_err(),
            "zip_unknown_entry"
        );
    }

    #[test]
    fn recognizes_only_workspace_asset_paths() {
        assert!(is_import_asset_path("assets/images/cover.png"));
        assert!(is_import_asset_path("assets/audio/voice.ogg"));
        assert!(is_import_asset_path("assets/video/scene.webm"));
        assert!(is_import_asset_path("assets/documents/reference.txt"));
        assert!(!is_import_asset_path("assets/secrets/key.txt"));
        assert!(!is_import_asset_path("private/assets/images/cover.png"));
    }

    #[test]
    fn maps_only_supported_media_import_extensions() {
        assert_eq!(media_metadata("png"), Some(("image", "image/png")));
        assert_eq!(media_metadata("WAV"), Some(("audio", "audio/wav")));
        assert_eq!(media_metadata("pdf"), Some(("document", "application/pdf")));
        assert_eq!(media_metadata("exe"), None);
        assert_eq!(media_metadata(""), None);
    }

    #[test]
    fn validates_media_purpose_values() {
        assert!(validate_media_purpose("cover").is_ok());
        assert!(validate_media_purpose("voice").is_ok());
        assert_eq!(
            validate_media_purpose("../cover").unwrap_err(),
            "invalid_media_purpose"
        );
        assert_eq!(
            validate_media_purpose("shell").unwrap_err(),
            "invalid_media_purpose"
        );
    }

    #[test]
    fn validates_secret_keys_and_values() {
        assert!(validate_secret_key("openai-compatible-api-key").is_ok());
        assert_eq!(
            validate_secret_key("../token").unwrap_err(),
            "invalid_secret_key"
        );
        assert!(validate_secret_value("sk-test").is_ok());
        assert_eq!(
            validate_secret_value("").unwrap_err(),
            "invalid_secret_value"
        );
        assert_eq!(
            secret_env_var_name("openai-compatible-api-key"),
            Some(OPENAI_COMPATIBLE_KEY_ENV)
        );
        assert_eq!(secret_env_var_name("unknown-key"), None);
    }

    #[test]
    fn file_secret_helpers_roundtrip_without_legacy_export_names() {
        let dir = temp_test_dir("secret_file");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("secrets.insecure.json");

        write_secret_to_file(&path, "openai-compatible-api-key", "sk-test").unwrap();
        assert_eq!(
            read_secret_from_file(&path, "openai-compatible-api-key").unwrap(),
            Some("sk-test".to_string())
        );
        assert!(remove_secret_from_file(&path, "openai-compatible-api-key").unwrap());
        assert_eq!(
            read_secret_from_file(&path, "openai-compatible-api-key").unwrap(),
            None
        );
        assert!(!path.exists());
        assert!(!remove_secret_from_file(&path, "openai-compatible-api-key").unwrap());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_only_workspace_media_data_urls() {
        let dir = temp_test_dir("media_data_url");
        let image_dir = dir.join("assets/images");
        fs::create_dir_all(&image_dir).unwrap();
        fs::write(image_dir.join("cover.png"), b"png").unwrap();

        let data_url = read_media_data_url_from_dir(&dir, "assets/images/cover.png").unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
        assert_eq!(
            read_media_data_url_from_dir(&dir, "../secret.png").unwrap_err(),
            "invalid_asset_path"
        );
        assert_eq!(
            read_media_data_url_from_dir(&dir, "assets/documents/ref.pdf").unwrap_err(),
            "media_preview_unsupported"
        );
        assert_eq!(
            read_media_data_url_from_dir(&dir, "assets/images/missing.png").unwrap_err(),
            "media_file_missing"
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_media_preview_symlink_escape() {
        use std::os::unix::fs::symlink;

        let dir = temp_test_dir("media_symlink");
        let outside = temp_test_dir("media_symlink_outside");
        fs::create_dir_all(dir.join("assets/images")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.png"), b"secret").unwrap();
        symlink(
            outside.join("secret.png"),
            dir.join("assets/images/escape.png"),
        )
        .unwrap();

        assert_eq!(
            read_media_data_url_from_dir(&dir, "assets/images/escape.png").unwrap_err(),
            "invalid_asset_path"
        );
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn generates_image_thumbnail_variant() {
        let dir = temp_test_dir("thumbnail");
        let image_dir = dir.join("assets/images");
        fs::create_dir_all(&image_dir).unwrap();
        let image = image::RgbaImage::from_pixel(200, 100, image::Rgba([32, 64, 96, 255]));
        image.save(image_dir.join("cover.png")).unwrap();
        let envelope = test_envelope(json!({
            "media_cover": {
                "id": "media_cover",
                "kind": "image",
                "purpose": "cover",
                "relativePath": "assets/images/cover.png",
                "mimeType": "image/png",
                "sizeBytes": 800,
                "variants": [],
                "altText": "Cover",
                "source": { "kind": "owned", "label": "Test" },
                "license": { "kind": "owned", "note": "Test" },
                "safety": { "rating": "SFW", "state": "local_ready", "reasons": [], "safetyFlags": ["none"] },
                "createdAt": "2026-07-02T00:00:00Z"
            }
        }));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();

        let variant = generate_thumbnail_from_dir(&dir, "media_cover", 64).unwrap();
        assert_eq!(variant["id"], "variant_media_cover_64");
        assert_eq!(variant["width"], 64);
        assert_eq!(variant["height"], 32);
        let relative_path = variant["relativePath"].as_str().unwrap();
        assert!(relative_path.starts_with("assets/images/variants/"));
        assert!(dir.join(relative_path).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn verifies_workspace_package_dir_with_manifest_and_placeholder_warning() {
        let dir = temp_test_dir("verify_ok");
        fs::create_dir_all(&dir).unwrap();
        let envelope = test_envelope(json!({
            "media_cover": {
                "id": "media_cover",
                "relativePath": "",
                "mimeType": "image/svg-placeholder",
                "sizeBytes": 0,
                "source": { "kind": "placeholder" }
            }
        }));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();
        write_json_atomic(
            &dir.join(MANIFEST_FILE),
            &json!({
                "format": "evolvria_workspace",
                "schemaVersion": "1.0.0",
                "workspaceId": "workspace_test",
                "updatedAt": "2026-07-02T00:00:00Z"
            }),
        )
        .unwrap();

        let report = verify_workspace_package_dir(&dir).unwrap();
        assert!(report.ok);
        assert_eq!(report.format, "tauri_workspace_dir");
        assert_eq!(
            report.asset_refs.referenced,
            vec!["media_cover".to_string()]
        );
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.severity == "warning"
                && issue.field == "assets.media_cover.relativePath"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn package_verify_reports_missing_physical_assets_and_secrets() {
        let dir = temp_test_dir("verify_missing_asset");
        fs::create_dir_all(&dir).unwrap();
        let mut envelope = test_envelope(json!({
            "media_cover": {
                "id": "media_cover",
                "relativePath": "assets/images/missing.png",
                "mimeType": "image/png",
                "sizeBytes": 42,
                "source": { "kind": "owned" }
            }
        }));
        envelope["storylines"]["story_test"]["premise"] =
            json!("Leaked sk-test-12345678901234567890");
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();
        write_json_atomic(
            &dir.join(MANIFEST_FILE),
            &json!({
                "format": "evolvria_workspace",
                "schemaVersion": "1.0.0",
                "workspaceId": "workspace_test"
            }),
        )
        .unwrap();

        let report = verify_workspace_package_dir(&dir).unwrap();
        assert!(!report.ok);
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.field == "assets.media_cover"));
        assert!(report.issues.iter().any(|issue| issue.field == "secrets"));
        let _ = fs::remove_dir_all(dir);
    }

    fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "evolvria_{}_{}",
            name,
            Utc::now().timestamp_nanos_opt().unwrap()
        ))
    }

    fn test_envelope(media_assets: Value) -> Value {
        let empty = json!({});
        json!({
            "schemaVersion": "1.0.0",
            "workspace": {
                "id": "workspace_test",
                "name": "Test Workspace",
                "description": "Package verifier test.",
                "createdAt": "2026-07-02T00:00:00Z",
                "updatedAt": "2026-07-02T00:00:00Z"
            },
            "entities": {
                "characters": empty,
                "storylines": {
                    "story_test": {
                        "id": "story_test",
                        "title": "Test Story",
                        "premise": "Clean premise",
                        "mediaIds": ["media_cover"]
                    }
                },
                "scenarios": empty,
                "mediaAssets": media_assets,
                "personas": empty,
                "chats": empty,
                "chatCheckpoints": empty,
                "messages": empty,
                "summaryChapters": empty,
                "arcs": empty,
                "dungeonMindConfigs": empty,
                "fateChecks": empty,
                "creditLedger": empty,
                "creditAdjustments": empty,
                "moderationCases": empty,
                "creatorEarnings": empty,
                "engagementStats": empty,
                "syncOperations": empty,
                "syncConflicts": empty
            }
        })
    }
}
