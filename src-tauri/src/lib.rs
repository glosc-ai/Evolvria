use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use image::{GenericImageView, ImageFormat, ImageReader};
use keyring::{Entry, Error as KeyringError};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
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
    has_sqlite_index: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    sqlite_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sqlite_size_bytes: Option<u64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetInventoryStats {
    declared_assets: usize,
    referenced_assets: usize,
    unreferenced_assets: usize,
    browser_only_assets: usize,
    missing_physical_assets: usize,
    physical_files: usize,
    untracked_files: usize,
    declared_bytes: u64,
    physical_bytes: u64,
    untracked_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetInventoryItem {
    id: String,
    kind: String,
    purpose: String,
    relative_path: String,
    source_kind: String,
    referenced: bool,
    physical_status: String,
    declared_size_bytes: u64,
    physical_size_bytes: Option<u64>,
    variant_count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PhysicalAssetFile {
    relative_path: String,
    size_bytes: u64,
    folder: String,
    supported: bool,
    tracked: bool,
    asset_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceAssetInventory {
    workspace_id: String,
    checked_at: String,
    root_path: String,
    stats: AssetInventoryStats,
    by_folder: BTreeMap<String, u64>,
    assets: Vec<AssetInventoryItem>,
    untracked_files: Vec<PhysicalAssetFile>,
    missing_asset_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteIndexReport {
    workspace_id: String,
    path: String,
    indexed_at: String,
    item_count: usize,
    message_count: usize,
    source_updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteSearchHit {
    entity_type: String,
    entity_id: String,
    title: String,
    snippet: String,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteMessagePage {
    chat_id: String,
    total_count: usize,
    offset_from_end: usize,
    page_size: usize,
    start_index: usize,
    end_index: usize,
    has_older: bool,
    has_newer: bool,
    next_offset_from_end: usize,
    messages: Vec<Value>,
}

#[derive(Debug)]
struct SearchIndexItem {
    entity_type: String,
    entity_id: String,
    title: String,
    body: String,
    updated_at: Option<String>,
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

#[tauri::command]
fn media_write_generated_image(
    app: AppHandle,
    workspace_id: String,
    bytes: Vec<u8>,
    mime_type: String,
    purpose: String,
    prompt: String,
) -> Result<MediaAssetResult, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    write_generated_image_from_bytes(&dir, bytes, mime_type, purpose, prompt)
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
        width: None,
        height: None,
        size_bytes: metadata.len(),
        variants: vec![],
        alt_text: "Imported local asset".to_string(),
        source: json!({ "kind": "imported", "label": "Local file import" }),
        license: json!({ "kind": "unknown", "note": "User must confirm rights before publishing." }),
        safety: json!({ "rating": "SFW", "state": "draft", "reasons": [], "safetyFlags": ["none"] }),
        created_at: Utc::now().to_rfc3339(),
    })
}

fn write_generated_image_from_bytes(
    workspace_dir: &Path,
    bytes: Vec<u8>,
    mime_type: String,
    purpose: String,
    prompt: String,
) -> Result<MediaAssetResult, String> {
    validate_media_purpose(&purpose)?;
    if bytes.is_empty() {
        return Err("generated_image_empty".to_string());
    }
    if bytes.len() as u64 > MAX_MEDIA_IMPORT_BYTES {
        return Err("generated_image_too_large".to_string());
    }
    if prompt.contains('\0') || prompt.len() > 10_000 {
        return Err("generated_image_invalid_prompt".to_string());
    }
    let (extension, normalized_mime) = generated_image_extension(&mime_type, &bytes)?;
    let dimensions = image::load_from_memory(&bytes)
        .ok()
        .map(|image| image.dimensions());
    let id = format!("media_gen_{}", hash_bytes(&bytes));
    let relative_path = format!("assets/images/{}.{}", id, extension);
    let target = workspace_dir.join(&relative_path);
    ensure_parent(&target)?;
    fs::write(&target, &bytes).map_err(to_string)?;
    let alt = compact_generated_prompt(&prompt);
    Ok(MediaAssetResult {
        id,
        kind: "image".to_string(),
        purpose,
        relative_path,
        mime_type: normalized_mime.to_string(),
        width: dimensions.map(|(width, _)| width),
        height: dimensions.map(|(_, height)| height),
        size_bytes: bytes.len() as u64,
        variants: vec![],
        alt_text: format!("Generated image: {}", alt),
        source: json!({ "kind": "generated", "label": "Glosc One image generation" }),
        license: json!({ "kind": "owned", "note": "Generated through the configured AI provider; review before publishing." }),
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

#[tauri::command]
fn workspace_asset_inventory(
    app: AppHandle,
    workspace_id: String,
) -> Result<WorkspaceAssetInventory, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    workspace_asset_inventory_in_dir(&dir, &workspace_id)
}

#[tauri::command]
fn workspace_rebuild_sqlite_index(
    app: AppHandle,
    workspace_id: String,
) -> Result<SqliteIndexReport, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    rebuild_sqlite_index_in_dir(&dir, &workspace_id)
}

#[tauri::command]
fn workspace_search_sqlite_index(
    app: AppHandle,
    workspace_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SqliteSearchHit>, String> {
    validate_workspace_id(&workspace_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    search_sqlite_index_in_dir(&dir, &query, limit.unwrap_or(20))
}

#[tauri::command]
fn workspace_query_sqlite_messages(
    app: AppHandle,
    workspace_id: String,
    chat_id: String,
    page_size: Option<usize>,
    offset_from_end: Option<usize>,
) -> Result<SqliteMessagePage, String> {
    validate_workspace_id(&workspace_id)?;
    validate_entity_id(&chat_id)?;
    let dir = workspace_dir(&app, &workspace_id)?;
    query_sqlite_messages_in_dir(
        &dir,
        &chat_id,
        page_size.unwrap_or(80),
        offset_from_end.unwrap_or(0),
    )
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
            media_write_generated_image,
            media_thumbnail,
            media_read_data_url,
            secret_set,
            secret_get,
            secret_delete,
            log_export,
            content_package_verify,
            workspace_asset_inventory,
            workspace_rebuild_sqlite_index,
            workspace_search_sqlite_index,
            workspace_query_sqlite_messages
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
    let sqlite_backup = copy_sqlite_index_backup(dir, &target);
    Ok(BackupMeta {
        id,
        workspace_id: workspace_id.to_string(),
        reason: reason.to_string(),
        created_at: Utc::now().to_rfc3339(),
        path: path_to_string(target),
        size_bytes,
        has_sqlite_index: sqlite_backup.is_some(),
        sqlite_path: sqlite_backup.as_ref().map(|(path, _)| path_to_string(path)),
        sqlite_size_bytes: sqlite_backup.map(|(_, size)| size),
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
    let sqlite_meta = backup_sqlite_meta(path);
    let modified = metadata.modified().map_err(to_string)?;
    let created_at: DateTime<Utc> = modified.into();
    Ok(Some(BackupMeta {
        id,
        workspace_id: workspace_id.to_string(),
        reason,
        created_at: created_at.to_rfc3339(),
        path: path_to_string(path),
        size_bytes: metadata.len(),
        has_sqlite_index: sqlite_meta.is_some(),
        sqlite_path: sqlite_meta.as_ref().map(|(path, _)| path_to_string(path)),
        sqlite_size_bytes: sqlite_meta.map(|(_, size)| size),
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
    restore_sqlite_index_backup(dir, &backup_path);
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

fn copy_sqlite_index_backup(dir: &Path, save_backup_path: &Path) -> Option<(PathBuf, u64)> {
    let index_path = sqlite_index_path(dir);
    if !index_path.is_file() {
        return None;
    }

    // The SQLite file is a rebuildable mirror. Checkpoint if possible, but keep
    // save backups available even when the mirror is locked or malformed.
    if let Ok(connection) = Connection::open(&index_path) {
        let _ = connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }

    let target = sqlite_backup_path_for_save_backup(save_backup_path);
    fs::copy(&index_path, &target)
        .ok()
        .map(|size| (target, size))
}

fn backup_sqlite_meta(save_backup_path: &Path) -> Option<(PathBuf, u64)> {
    let sqlite_path = sqlite_backup_path_for_save_backup(save_backup_path);
    let metadata = fs::metadata(&sqlite_path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    Some((sqlite_path, metadata.len()))
}

fn restore_sqlite_index_backup(dir: &Path, save_backup_path: &Path) {
    let sqlite_backup_path = sqlite_backup_path_for_save_backup(save_backup_path);
    remove_sqlite_index_files(dir);
    if sqlite_backup_path.is_file() {
        let _ = fs::copy(sqlite_backup_path, sqlite_index_path(dir));
    }
}

fn remove_sqlite_index_files(dir: &Path) {
    let index_path = sqlite_index_path(dir);
    let _ = fs::remove_file(&index_path);
    let _ = fs::remove_file(sqlite_sidecar_path(&index_path, "-wal"));
    let _ = fs::remove_file(sqlite_sidecar_path(&index_path, "-shm"));
}

fn sqlite_backup_path_for_save_backup(save_backup_path: &Path) -> PathBuf {
    save_backup_path.with_extension("sqlite3")
}

fn sqlite_sidecar_path(index_path: &Path, suffix: &str) -> PathBuf {
    let mut raw_path = index_path.as_os_str().to_os_string();
    raw_path.push(suffix);
    PathBuf::from(raw_path)
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

fn compact_generated_prompt(value: &str) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(120).collect()
}

fn hash_file_name(path: &Path, size: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(size.to_le_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)[..16].to_string()
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
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

fn generated_image_extension(
    mime_type: &str,
    bytes: &[u8],
) -> Result<(&'static str, &'static str), String> {
    match mime_type.to_ascii_lowercase().as_str() {
        "image/png" => return Ok(("png", "image/png")),
        "image/jpeg" | "image/jpg" => return Ok(("jpg", "image/jpeg")),
        "image/webp" => return Ok(("webp", "image/webp")),
        "image/gif" => return Ok(("gif", "image/gif")),
        _ => {}
    }

    match image::guess_format(bytes).map_err(|_| "generated_image_unsupported_type".to_string())? {
        ImageFormat::Png => Ok(("png", "image/png")),
        ImageFormat::Jpeg => Ok(("jpg", "image/jpeg")),
        ImageFormat::WebP => Ok(("webp", "image/webp")),
        ImageFormat::Gif => Ok(("gif", "image/gif")),
        _ => Err("generated_image_unsupported_type".to_string()),
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

fn workspace_asset_inventory_in_dir(
    workspace_dir: &Path,
    workspace_id: &str,
) -> Result<WorkspaceAssetInventory, String> {
    validate_workspace_id(workspace_id)?;
    let save_path = workspace_dir.join(SAVE_FILE);
    if !save_path.exists() {
        return Err("workspace_not_found".to_string());
    }
    let envelope = read_json(&save_path)?;
    validate_envelope(&envelope)?;
    let envelope_workspace_id = envelope_workspace_id(&envelope)?;
    if envelope_workspace_id != workspace_id {
        return Err("workspace_mismatch".to_string());
    }

    let physical_files = list_workspace_asset_files(workspace_dir)?;
    let physical_by_path: HashMap<String, PhysicalAssetFile> = physical_files
        .iter()
        .map(|file| (file.relative_path.clone(), file.clone()))
        .collect();
    let referenced: HashSet<String> = package_asset_refs(&envelope)
        .referenced
        .into_iter()
        .collect();
    let media = envelope
        .get("entities")
        .and_then(|entities| entities.get("mediaAssets"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let mut tracked_paths: HashMap<String, String> = HashMap::new();
    let mut assets = Vec::new();
    let mut missing_asset_ids = Vec::new();
    let mut declared_bytes = 0_u64;
    let mut browser_only_assets = 0_usize;
    let mut missing_physical_assets = 0_usize;

    for (id, asset) in &media {
        let relative_path = value_str(asset, "relativePath").unwrap_or("").to_string();
        let declared_size_bytes = asset.get("sizeBytes").and_then(Value::as_u64).unwrap_or(0);
        declared_bytes = declared_bytes.saturating_add(declared_size_bytes);
        let source_kind = asset
            .get("source")
            .and_then(|source| source.get("kind"))
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let variant_paths = collect_media_variant_paths(asset);
        for variant_path in &variant_paths {
            tracked_paths.insert(variant_path.clone(), id.clone());
        }

        let (physical_status, physical_size_bytes) = if relative_path.starts_with("browser://") {
            browser_only_assets += 1;
            ("browser_only".to_string(), None)
        } else if relative_path.trim().is_empty()
            && source_kind == "placeholder"
            && declared_size_bytes == 0
        {
            ("placeholder".to_string(), None)
        } else if validate_asset_relative_path(&relative_path).is_err() {
            missing_physical_assets += 1;
            missing_asset_ids.push(id.clone());
            ("invalid_path".to_string(), None)
        } else if let Some(file) = physical_by_path.get(&relative_path) {
            tracked_paths.insert(relative_path.clone(), id.clone());
            ("present".to_string(), Some(file.size_bytes))
        } else {
            missing_physical_assets += 1;
            missing_asset_ids.push(id.clone());
            ("missing".to_string(), None)
        };

        assets.push(AssetInventoryItem {
            id: id.clone(),
            kind: value_str(asset, "kind").unwrap_or("unknown").to_string(),
            purpose: value_str(asset, "purpose").unwrap_or("unknown").to_string(),
            relative_path,
            source_kind,
            referenced: referenced.contains(id),
            physical_status,
            declared_size_bytes,
            physical_size_bytes,
            variant_count: variant_paths.len(),
        });
    }

    assets.sort_by(|a, b| {
        a.physical_status
            .cmp(&b.physical_status)
            .then_with(|| a.kind.cmp(&b.kind))
            .then_with(|| a.id.cmp(&b.id))
    });
    missing_asset_ids.sort();
    missing_asset_ids.dedup();

    let mut by_folder: BTreeMap<String, u64> = BTreeMap::new();
    let mut physical_bytes = 0_u64;
    let mut untracked_bytes = 0_u64;
    let mut untracked_files = Vec::new();
    for mut file in physical_files {
        physical_bytes = physical_bytes.saturating_add(file.size_bytes);
        *by_folder.entry(file.folder.clone()).or_insert(0) += file.size_bytes;
        if let Some(asset_id) = tracked_paths.get(&file.relative_path) {
            file.tracked = true;
            file.asset_id = Some(asset_id.clone());
        } else {
            untracked_bytes = untracked_bytes.saturating_add(file.size_bytes);
            untracked_files.push(file);
        }
    }
    untracked_files.sort_by(|a, b| {
        b.size_bytes
            .cmp(&a.size_bytes)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });

    let stats = AssetInventoryStats {
        declared_assets: media.len(),
        referenced_assets: assets.iter().filter(|asset| asset.referenced).count(),
        unreferenced_assets: assets.iter().filter(|asset| !asset.referenced).count(),
        browser_only_assets,
        missing_physical_assets,
        physical_files: physical_by_path.len(),
        untracked_files: untracked_files.len(),
        declared_bytes,
        physical_bytes,
        untracked_bytes,
    };

    Ok(WorkspaceAssetInventory {
        workspace_id: workspace_id.to_string(),
        checked_at: Utc::now().to_rfc3339(),
        root_path: path_to_string(workspace_dir),
        stats,
        by_folder,
        assets,
        untracked_files,
        missing_asset_ids,
    })
}

fn list_workspace_asset_files(workspace_dir: &Path) -> Result<Vec<PhysicalAssetFile>, String> {
    let assets_dir = workspace_dir.join("assets");
    if !assets_dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    collect_workspace_asset_files(workspace_dir, &assets_dir, &mut files)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

fn collect_workspace_asset_files(
    workspace_dir: &Path,
    dir: &Path,
    out: &mut Vec<PhysicalAssetFile>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(to_string)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_workspace_asset_files(workspace_dir, &path, out)?;
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let relative_path = path
            .strip_prefix(workspace_dir)
            .map_err(to_string)?
            .to_string_lossy()
            .replace('\\', "/");
        if !relative_path.starts_with("assets/") {
            continue;
        }
        out.push(PhysicalAssetFile {
            folder: asset_inventory_folder(&relative_path),
            supported: is_import_asset_path(&relative_path),
            relative_path,
            size_bytes: metadata.len(),
            tracked: false,
            asset_id: None,
        });
    }
    Ok(())
}

fn collect_media_variant_paths(asset: &Value) -> Vec<String> {
    asset
        .get("variants")
        .and_then(Value::as_array)
        .map(|variants| {
            variants
                .iter()
                .filter_map(|variant| variant.get("relativePath").and_then(Value::as_str))
                .filter(|path| validate_asset_relative_path(path).is_ok())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn asset_inventory_folder(relative_path: &str) -> String {
    let mut parts = relative_path.split('/');
    let _assets = parts.next();
    parts.next().unwrap_or("unknown").to_string()
}

fn rebuild_sqlite_index_in_dir(
    workspace_dir: &Path,
    workspace_id: &str,
) -> Result<SqliteIndexReport, String> {
    let save_path = workspace_dir.join(SAVE_FILE);
    if !save_path.exists() {
        return Err("workspace_not_found".to_string());
    }
    let envelope = read_json(&save_path)?;
    validate_envelope(&envelope)?;
    let envelope_workspace_id = envelope_workspace_id(&envelope)?;
    if envelope_workspace_id != workspace_id {
        return Err("workspace_mismatch".to_string());
    }

    let index_path = sqlite_index_path(workspace_dir);
    ensure_parent(&index_path)?;
    let mut connection = Connection::open(&index_path).map_err(to_string)?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            DROP TABLE IF EXISTS search_items_fts;
            DROP TABLE IF EXISTS search_items;
            DROP TABLE IF EXISTS chat_messages;
            CREATE TABLE search_items (
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              updated_at TEXT,
              PRIMARY KEY(entity_type, entity_id)
            );
            CREATE VIRTUAL TABLE search_items_fts USING fts5(
              title,
              body,
              entity_type UNINDEXED,
              entity_id UNINDEXED,
              updated_at UNINDEXED,
              tokenize = 'unicode61'
            );
            CREATE TABLE chat_messages (
              chat_id TEXT NOT NULL,
              message_id TEXT NOT NULL,
              message_index INTEGER NOT NULL,
              created_at TEXT,
              role TEXT,
              mode TEXT,
              content TEXT NOT NULL,
              payload TEXT NOT NULL,
              PRIMARY KEY(chat_id, message_id)
            );
            CREATE INDEX chat_messages_window_idx ON chat_messages(chat_id, message_index);
            ",
        )
        .map_err(to_string)?;

    let items = build_sqlite_search_items(&envelope);
    let message_count = count_sqlite_chat_messages(&envelope);
    let transaction = connection.transaction().map_err(to_string)?;
    for item in &items {
        transaction
            .execute(
                "INSERT INTO search_items (entity_type, entity_id, title, body, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![item.entity_type, item.entity_id, item.title, item.body, item.updated_at],
            )
            .map_err(to_string)?;
        transaction
            .execute(
                "INSERT INTO search_items_fts (title, body, entity_type, entity_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![item.title, item.body, item.entity_type, item.entity_id, item.updated_at],
            )
            .map_err(to_string)?;
    }
    insert_sqlite_chat_messages(&transaction, &envelope)?;
    transaction.commit().map_err(to_string)?;

    Ok(SqliteIndexReport {
        workspace_id: workspace_id.to_string(),
        path: path_to_string(index_path),
        indexed_at: Utc::now().to_rfc3339(),
        item_count: items.len(),
        message_count,
        source_updated_at: envelope
            .get("workspace")
            .and_then(|workspace| workspace.get("updatedAt"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    })
}

fn search_sqlite_index_in_dir(
    workspace_dir: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<SqliteSearchHit>, String> {
    let index_path = sqlite_index_path(workspace_dir);
    if !index_path.exists() {
        return Err("sqlite_index_missing".to_string());
    }
    let connection = Connection::open(&index_path).map_err(to_string)?;
    let limit = limit.clamp(1, 100);
    let query = query.trim();
    if query.is_empty() {
        return search_sqlite_recent(&connection, limit);
    }

    let fts_hits = search_sqlite_fts(&connection, query, limit).unwrap_or_default();
    if !fts_hits.is_empty() {
        return Ok(fts_hits);
    }
    search_sqlite_like(&connection, query, limit)
}

fn search_sqlite_recent(
    connection: &Connection,
    limit: usize,
) -> Result<Vec<SqliteSearchHit>, String> {
    let mut statement = connection
        .prepare(
            "SELECT entity_type, entity_id, title, body, updated_at
             FROM search_items
             ORDER BY COALESCE(updated_at, '') DESC, title ASC
             LIMIT ?1",
        )
        .map_err(to_string)?;
    let rows = statement
        .query_map(params![limit as i64], |row| {
            let body: String = row.get(3)?;
            Ok(SqliteSearchHit {
                entity_type: row.get(0)?,
                entity_id: row.get(1)?,
                title: row.get(2)?,
                snippet: compact_snippet(&body),
                updated_at: row.get(4)?,
            })
        })
        .map_err(to_string)?;
    collect_sqlite_hits(rows)
}

fn search_sqlite_fts(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SqliteSearchHit>, String> {
    let fts_query = fts_phrase(query);
    let mut statement = connection
        .prepare(
            "SELECT entity_type, entity_id, title,
                    snippet(search_items_fts, 1, '', '', ' ... ', 18) AS snippet,
                    updated_at
             FROM search_items_fts
             WHERE search_items_fts MATCH ?1
             ORDER BY bm25(search_items_fts), COALESCE(updated_at, '') DESC
             LIMIT ?2",
        )
        .map_err(to_string)?;
    let rows = statement
        .query_map(params![fts_query, limit as i64], |row| {
            let snippet: String = row.get(3)?;
            Ok(SqliteSearchHit {
                entity_type: row.get(0)?,
                entity_id: row.get(1)?,
                title: row.get(2)?,
                snippet: compact_snippet(&snippet),
                updated_at: row.get(4)?,
            })
        })
        .map_err(to_string)?;
    collect_sqlite_hits(rows)
}

fn search_sqlite_like(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SqliteSearchHit>, String> {
    let like_query = escape_like_query(query);
    let mut statement = connection
        .prepare(
            "SELECT entity_type, entity_id, title, body, updated_at
             FROM search_items
             WHERE title LIKE ?1 ESCAPE '\\'
                OR body LIKE ?1 ESCAPE '\\'
             ORDER BY COALESCE(updated_at, '') DESC, title ASC
             LIMIT ?2",
        )
        .map_err(to_string)?;
    let rows = statement
        .query_map(params![like_query, limit as i64], |row| {
            let body: String = row.get(3)?;
            Ok(SqliteSearchHit {
                entity_type: row.get(0)?,
                entity_id: row.get(1)?,
                title: row.get(2)?,
                snippet: snippet_around(&body, query),
                updated_at: row.get(4)?,
            })
        })
        .map_err(to_string)?;
    collect_sqlite_hits(rows)
}

fn query_sqlite_messages_in_dir(
    workspace_dir: &Path,
    chat_id: &str,
    page_size: usize,
    offset_from_end: usize,
) -> Result<SqliteMessagePage, String> {
    validate_entity_id(chat_id)?;
    let index_path = sqlite_index_path(workspace_dir);
    if !index_path.exists() {
        return Err("sqlite_index_missing".to_string());
    }
    let connection = Connection::open(&index_path).map_err(to_string)?;
    let total_count = connection
        .query_row(
            "SELECT COUNT(*) FROM chat_messages WHERE chat_id = ?1",
            params![chat_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(to_string)?
        .max(0) as usize;
    let page_size = page_size.clamp(1, 200);
    let offset_from_end = offset_from_end.min(total_count);
    let end_index = total_count.saturating_sub(offset_from_end);
    let start_index = end_index.saturating_sub(page_size);
    let messages = query_sqlite_message_payloads(&connection, chat_id, start_index, end_index)?;
    let returned_count = messages.len();

    Ok(SqliteMessagePage {
        chat_id: chat_id.to_string(),
        total_count,
        offset_from_end,
        page_size,
        start_index,
        end_index,
        has_older: start_index > 0,
        has_newer: offset_from_end > 0,
        next_offset_from_end: (offset_from_end + returned_count).min(total_count),
        messages,
    })
}

fn query_sqlite_message_payloads(
    connection: &Connection,
    chat_id: &str,
    start_index: usize,
    end_index: usize,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT payload
             FROM chat_messages
             WHERE chat_id = ?1
               AND message_index >= ?2
               AND message_index < ?3
             ORDER BY message_index ASC",
        )
        .map_err(to_string)?;
    let rows = statement
        .query_map(
            params![chat_id, start_index as i64, end_index as i64],
            |row| row.get::<_, String>(0),
        )
        .map_err(to_string)?;
    let payloads = rows.collect::<Result<Vec<_>, _>>().map_err(to_string)?;
    payloads
        .into_iter()
        .map(|payload| serde_json::from_str(&payload).map_err(to_string))
        .collect()
}

fn insert_sqlite_chat_messages(
    transaction: &rusqlite::Transaction<'_>,
    envelope: &Value,
) -> Result<(), String> {
    let entities = envelope.get("entities").unwrap_or(&Value::Null);
    let Some(chats) = entities.get("chats").and_then(Value::as_object) else {
        return Ok(());
    };
    let Some(messages) = entities.get("messages").and_then(Value::as_object) else {
        return Ok(());
    };

    for (chat_id, chat) in chats {
        validate_entity_id(chat_id)?;
        let Some(message_ids) = chat.get("messageIds").and_then(Value::as_array) else {
            continue;
        };
        for (message_index, message_id) in message_ids.iter().filter_map(Value::as_str).enumerate()
        {
            validate_entity_id(message_id)?;
            let Some(message) = messages.get(message_id) else {
                continue;
            };
            let payload = serde_json::to_string(message).map_err(to_string)?;
            transaction
                .execute(
                    "INSERT INTO chat_messages (chat_id, message_id, message_index, created_at, role, mode, content, payload)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        chat_id,
                        message_id,
                        message_index as i64,
                        value_str(message, "createdAt"),
                        value_str(message, "role"),
                        value_str(message, "mode"),
                        value_str(message, "content").unwrap_or(""),
                        payload,
                    ],
                )
                .map_err(to_string)?;
        }
    }
    Ok(())
}

fn count_sqlite_chat_messages(envelope: &Value) -> usize {
    let entities = envelope.get("entities").unwrap_or(&Value::Null);
    let Some(chats) = entities.get("chats").and_then(Value::as_object) else {
        return 0;
    };
    let Some(messages) = entities.get("messages").and_then(Value::as_object) else {
        return 0;
    };
    chats
        .values()
        .filter_map(|chat| chat.get("messageIds").and_then(Value::as_array))
        .flat_map(|ids| ids.iter().filter_map(Value::as_str))
        .filter(|id| messages.contains_key(*id))
        .count()
}

fn collect_sqlite_hits<F>(rows: rusqlite::MappedRows<'_, F>) -> Result<Vec<SqliteSearchHit>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<SqliteSearchHit>,
{
    rows.collect::<Result<Vec<_>, _>>().map_err(to_string)
}

fn build_sqlite_search_items(envelope: &Value) -> Vec<SearchIndexItem> {
    let mut items = Vec::new();
    let entities = envelope.get("entities").unwrap_or(&Value::Null);

    if let Some(storylines) = entities.get("storylines").and_then(Value::as_object) {
        for (id, story) in storylines {
            if is_deleted(story) {
                continue;
            }
            let mut body = Vec::new();
            append_str(story, "tagline", &mut body);
            append_str(story, "summary", &mut body);
            append_str(story, "premise", &mut body);
            append_str(story, "playerRole", &mut body);
            append_str_array(story, "worldRules", &mut body);
            append_str_array(story, "tags", &mut body);
            if let Some(name) = story
                .get("createdBy")
                .and_then(|creator| creator.get("name"))
                .and_then(Value::as_str)
            {
                body.push(name.to_string());
            }
            items.push(search_item(
                "storyline",
                id,
                value_str(story, "title").unwrap_or(id),
                body,
                updated_or_created_at(story),
            ));
        }
    }

    if let Some(characters) = entities.get("characters").and_then(Value::as_object) {
        for (id, character) in characters {
            if is_deleted(character) {
                continue;
            }
            let mut body = Vec::new();
            append_str(character, "subtitle", &mut body);
            append_str(character, "summary", &mut body);
            append_str(character, "profile", &mut body);
            append_str_array(character, "goals", &mut body);
            append_str_array(character, "fears", &mut body);
            append_str_array(character, "boundaries", &mut body);
            append_str_array(character, "tags", &mut body);
            append_nested_str(character, &["voice", "tone"], &mut body);
            append_nested_str(character, &["voice", "cadence"], &mut body);
            items.push(search_item(
                "character",
                id,
                value_str(character, "name").unwrap_or(id),
                body,
                updated_or_created_at(character),
            ));
        }
    }

    if let Some(scenarios) = entities.get("scenarios").and_then(Value::as_object) {
        for (id, scenario) in scenarios {
            if is_deleted(scenario) {
                continue;
            }
            let mut body = Vec::new();
            append_str(scenario, "summary", &mut body);
            append_str(scenario, "opening", &mut body);
            append_str(scenario, "location", &mut body);
            items.push(search_item(
                "scenario",
                id,
                value_str(scenario, "title").unwrap_or(id),
                body,
                updated_or_created_at(scenario),
            ));
        }
    }

    if let Some(media_assets) = entities.get("mediaAssets").and_then(Value::as_object) {
        for (id, asset) in media_assets {
            if is_deleted(asset) {
                continue;
            }
            let mut body = Vec::new();
            append_str(asset, "kind", &mut body);
            append_str(asset, "purpose", &mut body);
            append_str(asset, "mimeType", &mut body);
            append_nested_str(asset, &["source", "label"], &mut body);
            append_nested_str(asset, &["license", "note"], &mut body);
            items.push(search_item(
                "media",
                id,
                value_str(asset, "altText").unwrap_or(id),
                body,
                updated_or_created_at(asset),
            ));
        }
    }

    if let Some(messages) = entities.get("messages").and_then(Value::as_object) {
        for (id, message) in messages {
            let content = value_str(message, "content").unwrap_or("");
            if content.is_empty() {
                continue;
            }
            let role = value_str(message, "role").unwrap_or("message");
            let title = format!("{}: {}", role, content.chars().take(42).collect::<String>());
            let mut body = vec![content.to_string()];
            append_str(message, "mode", &mut body);
            append_str(message, "speakerId", &mut body);
            items.push(search_item(
                "message",
                id,
                &title,
                body,
                updated_or_created_at(message),
            ));
        }
    }

    items.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.entity_type.cmp(&b.entity_type))
            .then_with(|| a.title.cmp(&b.title))
    });
    items
}

fn search_item(
    entity_type: &str,
    entity_id: &str,
    title: &str,
    body: Vec<String>,
    updated_at: Option<String>,
) -> SearchIndexItem {
    SearchIndexItem {
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        title: title.trim().to_string(),
        body: body
            .into_iter()
            .map(|part| part.trim().to_string())
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        updated_at,
    }
}

fn sqlite_index_path(workspace_dir: &Path) -> PathBuf {
    workspace_dir.join("search.sqlite3")
}

fn value_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn append_str(value: &Value, key: &str, out: &mut Vec<String>) {
    if let Some(text) = value_str(value, key) {
        out.push(text.to_string());
    }
}

fn append_nested_str(value: &Value, path: &[&str], out: &mut Vec<String>) {
    let mut current = value;
    for key in path {
        current = current.get(*key).unwrap_or(&Value::Null);
    }
    if let Some(text) = current.as_str() {
        out.push(text.to_string());
    }
}

fn append_str_array(value: &Value, key: &str, out: &mut Vec<String>) {
    if let Some(items) = value.get(key).and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.as_str() {
                out.push(text.to_string());
            }
        }
    }
}

fn updated_or_created_at(value: &Value) -> Option<String> {
    value_str(value, "updatedAt")
        .or_else(|| value_str(value, "createdAt"))
        .map(ToOwned::to_owned)
}

fn is_deleted(value: &Value) -> bool {
    value.get("deletedAt").and_then(Value::as_str).is_some()
}

fn fts_phrase(query: &str) -> String {
    format!("\"{}\"", query.replace('"', "\"\""))
}

fn escape_like_query(query: &str) -> String {
    let mut escaped = String::from("%");
    for char in query.chars() {
        if matches!(char, '%' | '_' | '\\') {
            escaped.push('\\');
        }
        escaped.push(char);
    }
    escaped.push('%');
    escaped
}

fn compact_snippet(value: &str) -> String {
    let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() <= 180 {
        text
    } else {
        format!("{}...", text.chars().take(180).collect::<String>())
    }
}

fn snippet_around(body: &str, query: &str) -> String {
    if query.is_empty() {
        return compact_snippet(body);
    }
    let Some(byte_index) = body.find(query) else {
        return compact_snippet(body);
    };
    let start = body[..byte_index]
        .char_indices()
        .rev()
        .nth(48)
        .map(|(index, _)| index)
        .unwrap_or(0);
    let end = body[byte_index..]
        .char_indices()
        .nth(query.chars().count() + 96)
        .map(|(index, _)| byte_index + index)
        .unwrap_or(body.len());
    compact_snippet(&format!(
        "{}{}{}",
        if start > 0 { "..." } else { "" },
        &body[start..end],
        if end < body.len() { "..." } else { "" }
    ))
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
        "creatorPayoutRequests",
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
    fn rebuilds_sqlite_index_and_searches_workspace_content() {
        let dir = temp_test_dir("sqlite_index");
        fs::create_dir_all(&dir).unwrap();
        let mut envelope = test_envelope(json!({}));
        envelope["entities"]["storylines"]["story_test"]["title"] = json!("星烬边境");
        envelope["entities"]["storylines"]["story_test"]["summary"] =
            json!("灯塔坐标片正在记录新的航线。");
        envelope["entities"]["scenarios"]["scenario_beacon"] = json!({
            "id": "scenario_beacon",
            "title": "灯塔第一次熄灭",
            "summary": "Beacon opening",
            "opening": "玩家发现坐标片发热。",
            "createdAt": "2026-07-02T00:01:00Z",
            "updatedAt": "2026-07-02T00:02:00Z"
        });
        envelope["entities"]["messages"]["msg_beacon"] = json!({
            "id": "msg_beacon",
            "chatId": "chat_test",
            "role": "assistant",
            "content": "The Starbloom beacon answers in static.",
            "safetyFlags": ["none"],
            "createdAt": "2026-07-02T00:03:00Z"
        });
        envelope["entities"]["chats"]["chat_test"] = json!({
            "id": "chat_test",
            "storylineId": "story_test",
            "scenarioId": "scenario_beacon",
            "personaId": "persona_test",
            "title": "SQLite paging chat",
            "status": "active",
            "provider": { "type": "mock", "model": "evolvria-mock" },
            "messageIds": ["msg_beacon"],
            "checkpointIds": [],
            "createdAt": "2026-07-02T00:00:00Z",
            "updatedAt": "2026-07-02T00:03:00Z"
        });
        for index in 0..12 {
            let id = format!("msg_page_{}", index);
            envelope["entities"]["messages"][&id] = json!({
                "id": id,
                "chatId": "chat_test",
                "role": if index % 2 == 0 { "user" } else { "assistant" },
                "content": format!("Paged message {}", index),
                "safetyFlags": ["none"],
                "createdAt": format!("2026-07-02T00:{:02}:00Z", index + 4)
            });
            envelope["entities"]["chats"]["chat_test"]["messageIds"]
                .as_array_mut()
                .unwrap()
                .push(json!(format!("msg_page_{}", index)));
        }
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();

        let report = rebuild_sqlite_index_in_dir(&dir, "workspace_test").unwrap();
        assert!(PathBuf::from(&report.path).exists());
        assert!(report.item_count >= 3);
        assert_eq!(report.message_count, 13);
        assert_eq!(
            report.source_updated_at.as_deref(),
            Some("2026-07-02T00:00:00Z")
        );

        let cjk_hits = search_sqlite_index_in_dir(&dir, "坐标片", 10).unwrap();
        assert!(cjk_hits
            .iter()
            .any(|hit| hit.entity_id == "story_test" || hit.entity_id == "scenario_beacon"));
        let latin_hits = search_sqlite_index_in_dir(&dir, "Starbloom", 10).unwrap();
        assert!(latin_hits.iter().any(|hit| hit.entity_id == "msg_beacon"));
        let recent = search_sqlite_index_in_dir(&dir, "", 2).unwrap();
        assert_eq!(recent.len(), 2);
        let latest_page = query_sqlite_messages_in_dir(&dir, "chat_test", 5, 0).unwrap();
        assert_eq!(latest_page.total_count, 13);
        assert_eq!(latest_page.start_index, 8);
        assert_eq!(latest_page.messages.len(), 5);
        assert_eq!(latest_page.messages[0]["id"], "msg_page_7");
        assert!(latest_page.has_older);
        assert!(!latest_page.has_newer);
        let older_page =
            query_sqlite_messages_in_dir(&dir, "chat_test", 5, latest_page.next_offset_from_end)
                .unwrap();
        assert_eq!(older_page.start_index, 3);
        assert_eq!(older_page.messages[0]["id"], "msg_page_2");
        assert!(older_page.has_older);
        assert!(older_page.has_newer);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn lists_and_restores_workspace_backups_from_dir() {
        let dir = temp_test_dir("workspace_backups");
        fs::create_dir_all(&dir).unwrap();
        let envelope = test_envelope(json!({}));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();
        fs::write(sqlite_index_path(&dir), b"sqlite-backup-v1").unwrap();

        let backup = create_backup_in_dir(&dir, "workspace_test", "manual_test").unwrap();
        assert!(PathBuf::from(&backup.path).exists());
        assert!(backup.size_bytes > 0);
        assert!(backup.has_sqlite_index);
        assert!(PathBuf::from(backup.sqlite_path.as_deref().unwrap()).exists());
        assert_eq!(backup.sqlite_size_bytes, Some(16));

        let mut changed = envelope.clone();
        changed["workspace"]["name"] = json!("Changed Workspace");
        write_json_atomic(&dir.join(SAVE_FILE), &changed).unwrap();
        fs::write(sqlite_index_path(&dir), b"sqlite-changed").unwrap();
        let restored = restore_backup_from_dir(&dir, "workspace_test", &backup.id).unwrap();
        assert_eq!(restored["workspace"]["name"], "Test Workspace");
        assert_eq!(
            read_json(&dir.join(SAVE_FILE)).unwrap()["workspace"]["name"],
            "Test Workspace"
        );
        assert_eq!(
            fs::read(sqlite_index_path(&dir)).unwrap(),
            b"sqlite-backup-v1"
        );

        let backups = list_backups_from_dir(&dir, "workspace_test").unwrap();
        assert!(backups
            .iter()
            .any(|item| item.id == backup.id && item.has_sqlite_index));
        assert!(backups
            .iter()
            .any(|item| item.reason == "pre_restore" && item.has_sqlite_index));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_backup_without_sqlite_removes_stale_index() {
        let dir = temp_test_dir("workspace_backup_without_sqlite");
        fs::create_dir_all(&dir).unwrap();
        let envelope = test_envelope(json!({}));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();

        let backup = create_backup_in_dir(&dir, "workspace_test", "manual_test").unwrap();
        assert!(!backup.has_sqlite_index);

        fs::write(sqlite_index_path(&dir), b"stale-sqlite").unwrap();
        fs::write(
            sqlite_sidecar_path(&sqlite_index_path(&dir), "-wal"),
            b"wal",
        )
        .unwrap();
        fs::write(
            sqlite_sidecar_path(&sqlite_index_path(&dir), "-shm"),
            b"shm",
        )
        .unwrap();
        let restored = restore_backup_from_dir(&dir, "workspace_test", &backup.id).unwrap();
        assert_eq!(restored["workspace"]["name"], "Test Workspace");
        assert!(!sqlite_index_path(&dir).exists());
        assert!(!sqlite_sidecar_path(&sqlite_index_path(&dir), "-wal").exists());
        assert!(!sqlite_sidecar_path(&sqlite_index_path(&dir), "-shm").exists());
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
    fn writes_generated_image_asset_from_bytes() {
        let dir = temp_test_dir("generated_image");
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.png");
        let image = image::RgbaImage::from_pixel(80, 45, image::Rgba([16, 32, 64, 255]));
        image.save(&source).unwrap();
        let bytes = fs::read(&source).unwrap();

        let asset = write_generated_image_from_bytes(
            &dir,
            bytes,
            "image/png".to_string(),
            "background".to_string(),
            "Original storm harbor background with beacon light".to_string(),
        )
        .unwrap();

        assert_eq!(asset.kind, "image");
        assert_eq!(asset.purpose, "background");
        assert_eq!(asset.mime_type, "image/png");
        assert_eq!(asset.width, Some(80));
        assert_eq!(asset.height, Some(45));
        assert!(asset.relative_path.starts_with("assets/images/media_gen_"));
        assert!(dir.join(&asset.relative_path).exists());
        assert!(asset.alt_text.contains("Original storm harbor"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn inventories_declared_missing_browser_and_untracked_assets() {
        let dir = temp_test_dir("asset_inventory");
        fs::create_dir_all(dir.join("assets/images/variants")).unwrap();
        fs::create_dir_all(dir.join("assets/audio")).unwrap();
        fs::create_dir_all(dir.join("assets/video")).unwrap();
        fs::write(dir.join("assets/images/cover.png"), b"cover").unwrap();
        fs::write(dir.join("assets/images/variants/thumb.png"), b"thumb").unwrap();
        fs::write(dir.join("assets/audio/orphan.wav"), b"orphan").unwrap();
        fs::write(dir.join("assets/video/untracked.mp4"), b"untracked").unwrap();

        let envelope = test_envelope(json!({
            "media_cover": {
                "id": "media_cover",
                "kind": "image",
                "purpose": "cover",
                "relativePath": "assets/images/cover.png",
                "mimeType": "image/png",
                "sizeBytes": 5,
                "variants": [{
                    "id": "variant_cover_thumb",
                    "relativePath": "assets/images/variants/thumb.png",
                    "sizeBytes": 5,
                    "purpose": "thumbnail"
                }],
                "altText": "Cover",
                "source": { "kind": "owned", "label": "Test" },
                "license": { "kind": "owned", "note": "Test" },
                "safety": { "rating": "SFW", "state": "local_ready", "reasons": [], "safetyFlags": ["none"] },
                "createdAt": "2026-07-02T00:00:00Z"
            },
            "media_orphan": {
                "id": "media_orphan",
                "kind": "audio",
                "purpose": "voice",
                "relativePath": "assets/audio/orphan.wav",
                "mimeType": "audio/wav",
                "sizeBytes": 6,
                "variants": [],
                "altText": "Unused voice",
                "source": { "kind": "imported", "label": "Test" },
                "license": { "kind": "owned", "note": "Test" },
                "safety": { "rating": "SFW", "state": "local_ready", "reasons": [], "safetyFlags": ["none"] },
                "createdAt": "2026-07-02T00:00:00Z"
            },
            "media_missing": {
                "id": "media_missing",
                "kind": "video",
                "purpose": "background",
                "relativePath": "assets/video/missing.mp4",
                "mimeType": "video/mp4",
                "sizeBytes": 9,
                "variants": [],
                "altText": "Missing",
                "source": { "kind": "generated", "label": "Test" },
                "license": { "kind": "owned", "note": "Test" },
                "safety": { "rating": "SFW", "state": "local_ready", "reasons": [], "safetyFlags": ["none"] },
                "createdAt": "2026-07-02T00:00:00Z"
            },
            "media_browser": {
                "id": "media_browser",
                "kind": "image",
                "purpose": "cover",
                "relativePath": "browser://temp.png",
                "mimeType": "image/png",
                "sizeBytes": 7,
                "variants": [],
                "altText": "Browser temp",
                "source": { "kind": "imported", "label": "Browser" },
                "license": { "kind": "unknown", "note": "Test" },
                "safety": { "rating": "SFW", "state": "draft", "reasons": [], "safetyFlags": ["none"] },
                "createdAt": "2026-07-02T00:00:00Z"
            }
        }));
        write_json_atomic(&dir.join(SAVE_FILE), &envelope).unwrap();

        let inventory = workspace_asset_inventory_in_dir(&dir, "workspace_test").unwrap();
        assert_eq!(inventory.stats.declared_assets, 4);
        assert_eq!(inventory.stats.referenced_assets, 1);
        assert_eq!(inventory.stats.unreferenced_assets, 3);
        assert_eq!(inventory.stats.browser_only_assets, 1);
        assert_eq!(inventory.stats.missing_physical_assets, 1);
        assert_eq!(inventory.stats.physical_files, 4);
        assert_eq!(inventory.stats.untracked_files, 1);
        assert_eq!(
            inventory.missing_asset_ids,
            vec!["media_missing".to_string()]
        );
        assert_eq!(
            inventory
                .assets
                .iter()
                .find(|asset| asset.id == "media_cover")
                .unwrap()
                .variant_count,
            1
        );
        assert_eq!(
            inventory.untracked_files[0].relative_path,
            "assets/video/untracked.mp4"
        );
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
                "creatorPayoutRequests": empty,
                "engagementStats": empty,
                "syncOperations": empty,
                "syncConflicts": empty
            }
        })
    }
}
