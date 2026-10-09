// Copyright (C) 2026 Nguyễn Trọng Kiên
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, LogicalPosition, Manager};

#[derive(Serialize, Deserialize, Clone)]
struct LookTodo {
    id: String,
    name: String,
    done: bool,
    due_date: Option<String>,
    created_at_unix_s: i64,
    updated_at_unix_s: i64,
}

fn get_db_conn() -> Result<Connection, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "Could not find LOCALAPPDATA env var".to_string())?;
    let db_path = format!("{}\\Look\\look.db", local_app_data);
    Connection::open(db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_look_todos() -> Result<Vec<LookTodo>, String> {
    let conn = get_db_conn()?;
    let mut stmt = conn
        .prepare("SELECT id, name, done, due_date, created_at_unix_s, updated_at_unix_s FROM todo_tasks ORDER BY created_at_unix_s DESC")
        .map_err(|e| e.to_string())?;

    let todo_iter = stmt
        .query_map([], |row| {
            let done_int: i32 = row.get(2)?;
            Ok(LookTodo {
                id: row.get(0)?,
                name: row.get(1)?,
                done: done_int != 0,
                due_date: row.get(3)?,
                created_at_unix_s: row.get(4)?,
                updated_at_unix_s: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut todos = Vec::new();
    for todo in todo_iter {
        todos.push(todo.map_err(|e| e.to_string())?);
    }
    Ok(todos)
}

#[tauri::command]
fn save_look_todo(todo: LookTodo) -> Result<(), String> {
    let conn = get_db_conn()?;
    let done_int = if todo.done { 1 } else { 0 };
    conn.execute(
        "INSERT OR REPLACE INTO todo_tasks (id, name, done, due_date, created_at_unix_s, updated_at_unix_s)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            todo.id,
            todo.name,
            done_int,
            todo.due_date,
            todo.created_at_unix_s,
            todo.updated_at_unix_s
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_look_todo(id: String) -> Result<(), String> {
    let conn = get_db_conn()?;
    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;

    if let Err(e) = conn.execute("DELETE FROM todo_tasks WHERE id = ?1", params![id]) {
        let _ = conn.execute("ROLLBACK", []);
        return Err(e.to_string());
    }

    if let Err(e) = conn.execute(
        "INSERT OR REPLACE INTO todo_tombstones (id, deleted_at_unix_s) VALUES (?1, ?2)",
        params![id, now_s],
    ) {
        let _ = conn.execute("ROLLBACK", []);
        return Err(e.to_string());
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, Serialize)]
struct TrackInfo {
    title: String,
    artist: String,
    is_playing: bool,
    cover_url: Option<String>,
    source_app: String,
    position_s: i64,
    duration_s: i64,
}

#[derive(Clone, Serialize)]
struct TimelineInfo {
    position_s: i64,
    duration_s: i64,
}

#[derive(Clone, Serialize)]
struct SystemNotification {
    app_name: String,
    title: String,
    message: String,
    image_path: String,
}

async fn get_thumbnail_base64(
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
) -> Option<String> {
    use base64::Engine;
    use windows::Storage::Streams::DataReader;

    let props = session.TryGetMediaPropertiesAsync().ok()?.await.ok()?;
    let thumbnail_ref = props.Thumbnail().ok()?;
    let stream = thumbnail_ref.OpenReadAsync().ok()?.await.ok()?;
    let size = stream.Size().ok()? as usize;
    if size == 0 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.await.ok()?;
    let mut buffer = vec![0u8; size];
    reader.ReadBytes(&mut buffer).ok()?;

    let base64_str = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Some(format!("data:image/png;base64,{}", base64_str))
}

// GSMTC active media polling logic
async fn get_media_properties() -> Result<Option<TrackInfo>, windows::core::Error> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return Ok(None),
    };

    let media_properties = session.TryGetMediaPropertiesAsync()?.await?;
    let title = media_properties.Title()?.to_string();
    let artist = media_properties.Artist()?.to_string();

    let playback_info = session.GetPlaybackInfo()?;
    let status = playback_info.PlaybackStatus()?;
    let is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

    let source_app = session
        .SourceAppUserModelId()
        .map(|h| h.to_string())
        .unwrap_or_default();

    // Extract thumbnail as base64 string
    let cover_url = get_thumbnail_base64(&session).await;

    let mut position_s = 0;
    let mut duration_s = 0;
    if let Ok(timeline) = session.GetTimelineProperties() {
        if let Ok(pos) = timeline.Position() {
            position_s = pos.Duration / 10_000_000; // 100ns units to seconds
        }
        if let Ok(end) = timeline.EndTime() {
            duration_s = end.Duration / 10_000_000;
        }
    }

    Ok(Some(TrackInfo {
        title,
        artist,
        is_playing,
        cover_url,
        source_app,
        position_s,
        duration_s,
    }))
}

async fn start_media_listener(app_handle: AppHandle) {
    let mut last_title = String::new();
    let mut last_artist = String::new();
    let mut last_playing = false;

    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
        if let Ok(Some(track)) = get_media_properties().await {
            // Check for track/state change
            if track.title != last_title
                || track.artist != last_artist
                || track.is_playing != last_playing
            {
                last_title = track.title.clone();
                last_artist = track.artist.clone();
                last_playing = track.is_playing;
                let _ = app_handle.emit("track-changed", &track);
            }

            // Always emit timeline update to sync progress bar & lyrics
            let _ = app_handle.emit("media-timeline", TimelineInfo {
                position_s: track.position_s,
                duration_s: track.duration_s,
            });
        }
    }
}

async fn start_notification_listener(app_handle: AppHandle) {
    use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
    use windows::UI::Notifications::NotificationKinds;
    use windows::core::ComInterface;

    let listener = match UserNotificationListener::Current() {
        Ok(l) => l,
        Err(_) => return,
    };

    // Request access to Windows notification API
    let access_status = match listener.RequestAccessAsync() {
        Ok(op) => op.await.unwrap_or(UserNotificationListenerAccessStatus::Denied),
        Err(_) => return,
    };

    if access_status != UserNotificationListenerAccessStatus::Allowed {
        println!("Notification access denied by Windows settings.");
        return;
    }

    // Lấy ID lớn nhất của các thông báo đang tồn tại trên hệ thống Windows để tránh tự động nổ loạt tin cũ khi khởi động | Initialize last_processed_id with the max ID of existing Windows notifications to prevent toast storms on startup
    let mut last_processed_id = 0;
    let mut is_initialized = false;
    if let Ok(op) = listener.GetNotificationsAsync(NotificationKinds::Toast) {
        if let Ok(notifications) = op.await {
            for notification in notifications {
                let id = notification.Id().unwrap_or(0);
                if id > last_processed_id {
                    last_processed_id = id;
                }
            }
            is_initialized = true;
        }
    }

    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        
        let notifications = match listener.GetNotificationsAsync(NotificationKinds::Toast) {
            Ok(op) => match op.await {
                Ok(n) => n,
                Err(_) => continue,
            },
            Err(_) => continue,
        };

        for notification in notifications {
            let id = notification.Id().unwrap_or(0);
            
            // Nếu chưa được khởi tạo thành công mốc ID ban đầu | If initial baseline ID scan hasn't run successfully
            if !is_initialized {
                if id > last_processed_id {
                    last_processed_id = id;
                }
                continue;
            }

            if id > last_processed_id {
                let mut app_name = notification.AppInfo()
                    .and_then(|info| info.DisplayInfo())
                    .and_then(|display| display.DisplayName())
                    .map(|h| h.to_string())
                    .unwrap_or_else(|_| "".to_string());

                if app_name.is_empty() || app_name == "Notification" {
                    if let Ok(app_info) = notification.AppInfo() {
                        if let Ok(app_id) = app_info.Id() {
                            app_name = app_id.to_string();
                        }
                    }
                }

                if app_name.is_empty() {
                    app_name = "Notification".to_string();
                }

                let mut title = String::new();
                let mut message = String::new();

                if let Ok(raw_notification) = notification.Notification() {
                    let mut image_path = String::new();
                    
                    // Parse text elements from visual binding
                    if let Ok(toast_binding_name) = windows::UI::Notifications::KnownNotificationBindings::ToastGeneric() {
                        if let Ok(toast_binding) = raw_notification.Visual().and_then(|v| v.GetBinding(&toast_binding_name)) {
                            if let Ok(text_elements) = toast_binding.GetTextElements() {
                                let mut text_iter = text_elements.into_iter();
                                if let Some(t_elem) = text_iter.next() {
                                    if let Ok(t_text) = t_elem.Text() {
                                        title = t_text.to_string();
                                    }
                                }
                                if let Some(m_elem) = text_iter.next() {
                                    if let Ok(m_text) = m_elem.Text() {
                                        message = m_text.to_string();
                                    }
                                }
                            }
                        }
                    }

                    // Parse image source from the entire XML content
                    if let Ok(toast_notification) = raw_notification.cast::<windows::UI::Notifications::ToastNotification>() {
                        if let Ok(xml_doc) = toast_notification.Content() {
                            if let Ok(xml_str) = xml_doc.GetXml() {
                                let xml = xml_str.to_string();
                                let mut search_str = &xml[..];
                                while let Some(start_offset) = search_str.find("<image") {
                                    let img_tag = &search_str[start_offset..];
                                    if let Some(src_offset) = img_tag.find("src=\"") {
                                        let val_start = src_offset + 5;
                                        if let Some(val_end) = img_tag[val_start..].find("\"") {
                                            let src_val = &img_tag[val_start..val_start + val_end];
                                            let src_str = src_val.to_string();
                                            // Skip UWP package resources (ms-appx/ms-appdata) if there are other choices
                                            if !src_str.starts_with("ms-appx") && !src_str.starts_with("ms-appdata") {
                                                image_path = src_str;
                                                break;
                                            } else if image_path.is_empty() {
                                                image_path = src_str;
                                            }
                                        }
                                    }
                                    search_str = &img_tag[6..];
                                }
                            }
                        }
                    }
                    
                    if !title.is_empty() || !message.is_empty() {
                        let payload = SystemNotification {
                            app_name: app_name.clone(),
                            title,
                            message,
                            image_path,
                        };
                        let _ = app_handle.emit("system-notification", payload);
                    }
                    last_processed_id = id;
                }
            }
        }
        is_initialized = true;
    }
}

#[tauri::command]
fn control_media(action: String) -> Result<(), String> {
    let vk = match action.as_str() {
        "play" | "pause" => 0xB3, // VK_MEDIA_PLAY_PAUSE
        "next" => 0xB0,           // VK_MEDIA_NEXT_TRACK
        "prev" => 0xB1,           // VK_MEDIA_PREV_TRACK
        _ => return Err("Unknown action".to_string()),
    };

    #[link(name = "user32")]
    extern "system" {
        fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
    }

    unsafe {
        keybd_event(vk, 0, 0, 0); // Key down
        keybd_event(vk, 0, 2, 0); // Key up (KEYEVENTF_KEYUP = 2)
    }

    Ok(())
}

#[tauri::command]
async fn seek_media(position_ms: i64) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(session) = manager.GetCurrentSession() {
        let position_100ns = position_ms * 10_000;
        if let Ok(op) = session.TryChangePlaybackPositionAsync(position_100ns) {
            let _ = op.await;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_file(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| e.to_string())
}

// Local Vibe Island DB Setup
fn get_vibe_db_conn() -> Result<Connection, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "Could not find LOCALAPPDATA env var".to_string())?;
    let db_dir = format!("{}\\VibeIsland", local_app_data);
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = format!("{}\\vibe_island.db", db_dir);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Initialize tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS focus_sessions (
            id TEXT PRIMARY KEY,
            duration_minutes INTEGER NOT NULL,
            completed_at_unix_s INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            due_date TEXT,
            rollover_count INTEGER NOT NULL DEFAULT 0,
            created_at_unix_s INTEGER NOT NULL,
            completed_at_unix_s INTEGER,
            sort_order INTEGER
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Auto-migration: try to add columns if they don't exist from an older DB version
    let _ = conn.execute("ALTER TABLE local_tasks ADD COLUMN due_date TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE local_tasks ADD COLUMN rollover_count INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE local_tasks ADD COLUMN completed_at_unix_s INTEGER",
        [],
    );
    let _ = conn.execute("ALTER TABLE local_tasks ADD COLUMN sort_order INTEGER", []);
    // Backfill the manual order from the creation time for existing rows
    let _ = conn.execute(
        "UPDATE local_tasks SET sort_order = created_at_unix_s WHERE sort_order IS NULL",
        [],
    );

    Ok(conn)
}

fn add_one_day(date_str: &str) -> Option<String> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut y: i32 = parts[0].parse().ok()?;
    let mut m: i32 = parts[1].parse().ok()?;
    let mut d: i32 = parts[2].parse().ok()?;

    let days_in_month = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => return None,
    };

    d += 1;
    if d > days_in_month {
        d = 1;
        m += 1;
        if m > 12 {
            m = 1;
            y += 1;
        }
    }

    Some(format!("{:04}-{:02}-{:02}", y, m, d))
}

#[derive(Serialize, Deserialize, Clone)]
struct LocalTask {
    id: String,
    name: String,
    done: bool,
    due_date: Option<String>,
    rollover_count: i32,
    created_at_unix_s: i64,
    completed_at_unix_s: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct FocusReport {
    today_minutes: i32,
    today_sessions: i32,
    week_minutes: i32,
    week_sessions: i32,
    today_counts: std::collections::HashMap<i32, i32>,
}

#[tauri::command]
fn get_local_tasks(today: String) -> Result<Vec<LocalTask>, String> {
    let conn = get_vibe_db_conn()?;

    // Auto-rollover active tasks past due
    let mut stmt = conn.prepare("SELECT id, due_date, rollover_count FROM local_tasks WHERE done = 0 AND due_date IS NOT NULL AND due_date < ?1").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&today], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    for r in rows {
        if let Ok((id, _due_date, rollover_count)) = r {
            updates.push((id, rollover_count + 1));
        }
    }
    drop(stmt);

    for (id, new_rollover) in updates {
        let _ = conn.execute(
            "UPDATE local_tasks SET due_date = ?1, rollover_count = ?2 WHERE id = ?3",
            params![today, new_rollover, id],
        );
    }

    let mut stmt = conn.prepare("SELECT id, name, done, due_date, rollover_count, created_at_unix_s, completed_at_unix_s FROM local_tasks WHERE done = 1 OR (done = 0 AND (due_date IS NULL OR due_date <= ?1)) ORDER BY done ASC, COALESCE(sort_order, created_at_unix_s) ASC").map_err(|e| e.to_string())?;
    let task_iter = stmt
        .query_map([&today], |row| {
            let done_int: i32 = row.get(2)?;
            Ok(LocalTask {
                id: row.get(0)?,
                name: row.get(1)?,
                done: done_int != 0,
                due_date: row.get(3)?,
                rollover_count: row.get(4)?,
                created_at_unix_s: row.get(5)?,
                completed_at_unix_s: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for t in task_iter {
        tasks.push(t.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

#[tauri::command]
fn add_local_task(name: String, due_date: Option<String>, today: String) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;

    // Limit active tasks count to 3 for today
    let active_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM local_tasks WHERE done = 0 AND (due_date IS NULL OR due_date <= ?1)",
        params![today],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    if active_count >= 20 {
        return Err("Cannot exceed 20 active tasks".to_string());
    }

    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let task_id = format!("task_{}", now_ns);
    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO local_tasks (id, name, done, due_date, rollover_count, created_at_unix_s, sort_order) VALUES (?1, ?2, 0, ?3, 0, ?4, ?4)",
        params![task_id, name, due_date, now_s]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn toggle_local_task(id: String) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;

    let (done, name, due_date): (i32, String, Option<String>) = conn
        .query_row(
            "SELECT done, name, due_date FROM local_tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let new_done = if done == 0 { 1 } else { 0 };
    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "UPDATE local_tasks SET done = ?1, completed_at_unix_s = ?2 WHERE id = ?3",
        params![new_done, if new_done == 1 { Some(now_s) } else { None }, id],
    )
    .map_err(|e| e.to_string())?;

    // Auto-recurrence logic (+1 day)
    if new_done == 1 {
        if let Some(ref date_str) = due_date {
            if let Some(next_date_str) = add_one_day(date_str) {
                // Check if the recurring task already exists to prevent duplicates on toggle
                let exists: i32 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM local_tasks WHERE name = ?1 AND due_date = ?2",
                        params![name, next_date_str],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                if exists == 0 {
                    let active_count: i32 = conn.query_row(
                        "SELECT COUNT(*) FROM local_tasks WHERE done = 0 AND (due_date IS NULL OR due_date <= ?1)",
                        params![date_str],
                        |row| row.get(0)
                    ).map_err(|e| e.to_string())?;

                    if active_count < 20 {
                        let now_ns = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_nanos();
                        let next_task_id = format!("task_{}", now_ns);
                        let _ = conn.execute(
                            "INSERT INTO local_tasks (id, name, done, due_date, rollover_count, created_at_unix_s, sort_order) VALUES (?1, ?2, 0, ?3, 0, ?4, ?4)",
                            params![next_task_id, name, next_date_str, now_s]
                        );
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn delete_local_task(id: String) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;
    conn.execute("DELETE FROM local_tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_local_task(id: String, name: String) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;
    conn.execute("UPDATE local_tasks SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Lưu thứ tự thủ công của danh sách nhiệm vụ sau khi kéo thả | Persist the manual order of the task list after a drag & drop
#[tauri::command]
fn reorder_local_tasks(ordered_ids: Vec<String>) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;
    for (index, id) in ordered_ids.iter().enumerate() {
        if let Err(e) = conn.execute(
            "UPDATE local_tasks SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        ) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(e.to_string());
        }
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct TaskStats {
    week_completion_rate: f64,
    month_completion_rate: f64,
    streak_days: i32,
    completion_trend_30d: Vec<i32>, // daily counts for past 30 days
    activity_grid: Vec<i32>,        // daily counts for past 168 days (24 weeks * 7 days)
    avg_per_day: f64,
    best_day_count: i32,
    active_days_count: i32,
    done_30d_count: i32,
}

#[tauri::command]
fn get_local_task_stats(_today: String) -> Result<TaskStats, String> {
    let conn = get_vibe_db_conn()?;

    // Fetch all tasks
    let mut stmt = conn
        .prepare("SELECT done, due_date, created_at_unix_s, completed_at_unix_s FROM local_tasks")
        .map_err(|e| e.to_string())?;

    struct RawTask {
        done: bool,
        _due_date: Option<String>,
        created_at: i64,
        completed_at: Option<i64>,
    }

    let task_iter = stmt
        .query_map([], |row| {
            let done_int: i32 = row.get(0)?;
            Ok(RawTask {
                done: done_int != 0,
                _due_date: row.get(1)?,
                created_at: row.get(2)?,
                completed_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for t in task_iter {
        tasks.push(t.map_err(|e| e.to_string())?);
    }

    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let day_seconds = 86400;

    // Helper to calculate days ago relative to local midnight
    // today is passed as YYYY-MM-DD
    let mut completion_by_days_ago = vec![0; 365];
    let mut total_completed = 0;
    let mut best_day_count = 0;
    let mut active_days_count = 0;
    let mut done_30d_count = 0;

    // Calculate completions per day relative to today
    for task in &tasks {
        if let Some(comp_at) = task.completed_at {
            total_completed += 1;

            // Simple days-ago calculation based on completed_at timestamp
            let days_ago = ((now_s - comp_at) / day_seconds) as usize;
            if days_ago < 365 {
                completion_by_days_ago[days_ago] += 1;
            }
        }
    }

    // Active days count & Best day
    for &count in &completion_by_days_ago {
        if count > 0 {
            active_days_count += 1;
            if count > best_day_count {
                best_day_count = count;
            }
        }
    }

    // Done in last 30 days
    for i in 0..30 {
        done_30d_count += completion_by_days_ago[i];
    }

    // Streak calculation
    let mut streak_days = 0;
    // Check if completed today
    if completion_by_days_ago[0] > 0 {
        streak_days = 1;
        let mut idx = 1;
        while idx < 365 && completion_by_days_ago[idx] > 0 {
            streak_days += 1;
            idx += 1;
        }
    } else {
        // If not completed today, check if completed yesterday
        if completion_by_days_ago[1] > 0 {
            streak_days = 1;
            let mut idx = 2;
            while idx < 365 && completion_by_days_ago[idx] > 0 {
                streak_days += 1;
                idx += 1;
            }
        }
    }

    // Week and Month Completion Rate
    // Week = last 7 days; Month = last 30 days
    let mut week_done = 0;
    let mut week_total = 0;
    let mut month_done = 0;
    let mut month_total = 0;

    for task in &tasks {
        let age_days = ((now_s - task.created_at) / day_seconds) as usize;
        if age_days < 7 {
            week_total += 1;
            if task.done {
                week_done += 1;
            }
        }
        if age_days < 30 {
            month_total += 1;
            if task.done {
                month_done += 1;
            }
        }
    }

    let week_completion_rate = if week_total > 0 {
        (week_done as f64 / week_total as f64) * 100.0
    } else {
        0.0
    };
    let month_completion_rate = if month_total > 0 {
        (month_done as f64 / month_total as f64) * 100.0
    } else {
        0.0
    };

    let avg_per_day = if active_days_count > 0 {
        total_completed as f64 / active_days_count as f64
    } else {
        0.0
    };

    // Trends and activity grid
    let mut completion_trend_30d = vec![0; 30];
    for i in 0..30 {
        completion_trend_30d[i] = completion_by_days_ago[29 - i]; // chronologically older first
    }

    let mut activity_grid = vec![0; 168];
    for i in 0..168 {
        activity_grid[i] = completion_by_days_ago[167 - i]; // oldest first (24 weeks)
    }

    Ok(TaskStats {
        week_completion_rate,
        month_completion_rate,
        streak_days,
        completion_trend_30d,
        activity_grid,
        avg_per_day,
        best_day_count,
        active_days_count,
        done_30d_count,
    })
}

#[tauri::command]
fn save_focus_session(duration_minutes: i32) -> Result<(), String> {
    let conn = get_vibe_db_conn()?;
    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let session_id = format!("focus_{}", now_ns);
    let now_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO focus_sessions (id, duration_minutes, completed_at_unix_s) VALUES (?1, ?2, ?3)",
        params![session_id, duration_minutes, now_s]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_focus_reports(today_start_s: i64, week_start_s: i64) -> Result<FocusReport, String> {
    let conn = get_vibe_db_conn()?;

    let mut stmt = conn
        .prepare("SELECT duration_minutes FROM focus_sessions WHERE completed_at_unix_s >= ?1")
        .map_err(|e| e.to_string())?;
    let today_rows = stmt
        .query_map([today_start_s], |row| row.get::<_, i32>(0))
        .map_err(|e| e.to_string())?;

    let mut today_minutes = 0;
    let mut today_sessions = 0;
    let mut today_counts = std::collections::HashMap::new();

    today_counts.insert(15, 0);
    today_counts.insert(25, 0);
    today_counts.insert(45, 0);
    today_counts.insert(60, 0);

    for r in today_rows {
        if let Ok(duration) = r {
            today_minutes += duration;
            today_sessions += 1;
            let count = today_counts.entry(duration).or_insert(0);
            *count += 1;
        }
    }
    drop(stmt);

    let mut stmt = conn
        .prepare("SELECT duration_minutes FROM focus_sessions WHERE completed_at_unix_s >= ?1")
        .map_err(|e| e.to_string())?;
    let week_rows = stmt
        .query_map([week_start_s], |row| row.get::<_, i32>(0))
        .map_err(|e| e.to_string())?;

    let mut week_minutes = 0;
    let mut week_sessions = 0;
    for r in week_rows {
        if let Ok(duration) = r {
            week_minutes += duration;
            week_sessions += 1;
        }
    }

    Ok(FocusReport {
        today_minutes,
        today_sessions,
        week_minutes,
        week_sessions,
        today_counts,
    })
}

fn position_window(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let monitor_size = monitor.size();
        let scale_factor = monitor.scale_factor();

        let logical_monitor_size = monitor_size.to_logical::<f64>(scale_factor);
        let window_size = window
            .outer_size()
            .unwrap_or_default()
            .to_logical::<f64>(scale_factor);

        // Center horizontally at the top, dock 12px off-screen to hide window top behind bezel
        let x = (logical_monitor_size.width - window_size.width) / 2.0;
        let y = -12.0;

        let _ = window.set_position(tauri::Position::Logical(LogicalPosition::new(x, y)));
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct StashedFileResult {
    name: String,
    size: u64,
    path: String,
}

// Tự động quét và dọn dẹp các tệp tạm cũ có tuổi thọ lớn hơn 7 ngày trong Drop Workspace | Automatically sweep and delete stashed files older than 7 days
fn clean_old_stash_files(stash_dir: &str) {
    use std::fs;
    use std::time::{SystemTime, Duration};
    
    let max_age = Duration::from_secs(7 * 24 * 3600); // 7 ngày | 7 days
    
    if let Ok(entries) = fs::read_dir(stash_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_file() {
                // Bỏ qua không xóa các tệp định dạng dữ liệu | Skip deleting database/data format files
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "db" || ext_lower == "sqlite" || ext_lower == "sqlite3" || ext_lower == "json" || ext_lower == "sql" || ext_lower == "xml" {
                        continue;
                    }
                }

                if let Ok(metadata) = fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                            if elapsed > max_age {
                                let _ = fs::remove_file(&path); // Xóa tệp hết hạn | Delete expired file
                            }
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn stash_file(source_path: String) -> Result<StashedFileResult, String> {
    use std::path::Path;
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "Could not find LOCALAPPDATA env var".to_string())?;

    let stash_dir = format!("{}\\VibeIsland\\stash", local_app_data);
    std::fs::create_dir_all(&stash_dir).map_err(|e| e.to_string())?;

    // Thực hiện dọn dẹp các tệp tin tạm cũ | Perform old stashed files cleanup
    clean_old_stash_files(&stash_dir);

    let src_path = Path::new(&source_path);
    if !src_path.exists() {
        return Err("Source file does not exist".to_string());
    }

    let file_name = src_path
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .into_owned();

    let dest_path = Path::new(&stash_dir).join(&file_name);

    // Sao chép tệp thay vì di chuyển trực tiếp để tránh lỗi khác ổ đĩa | Copy instead of moving directly to handle cross-drive issues
    std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;

    // Cố gắng xóa tệp gốc sau khi đã sao chép thành công | Try removing the original file
    let _ = std::fs::remove_file(&src_path);

    let metadata = std::fs::metadata(&dest_path).map_err(|e| e.to_string())?;

    Ok(StashedFileResult {
        name: file_name,
        size: metadata.len(),
        path: dest_path.to_string_lossy().into_owned(),
    })
}


#[tauri::command]
fn delete_stashed_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(())
}

fn start_bluetooth_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        use std::collections::HashSet;
        use windows::Devices::Bluetooth::{BluetoothDevice, BluetoothConnectionStatus};
        use windows::Devices::Enumeration::DeviceInformation;

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            let mut last_devices: HashSet<String> = HashSet::new();
            let mut is_first_run = true;

            loop {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                
                let mut current_devices = HashSet::new();

                if let Ok(selector) = BluetoothDevice::GetDeviceSelector() {
                    if let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&selector) {
                        if let Ok(devices) = op.await {
                            for device in devices {
                                if let Ok(id) = device.Id() {
                                    if let Ok(op_dev) = BluetoothDevice::FromIdAsync(&id) {
                                        if let Ok(bt_device) = op_dev.await {
                                            if let Ok(status) = bt_device.ConnectionStatus() {
                                                if status == BluetoothConnectionStatus::Connected {
                                                    if let Ok(name) = bt_device.Name() {
                                                        let name_str = name.to_string();
                                                        if !name_str.is_empty() {
                                                            current_devices.insert(name_str);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if !is_first_run {
                    // Emit event for new connections
                    for device in current_devices.difference(&last_devices) {
                        let _ = app_handle.emit("bluetooth-connected", device.clone());
                    }
                    // Emit event for disconnections
                    for device in last_devices.difference(&current_devices) {
                        let _ = app_handle.emit("bluetooth-disconnected", device.clone());
                    }
                } else {
                    is_first_run = false;
                }
                last_devices = current_devices;
            }
        });
    });
}

fn start_fullscreen_auto_hide(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        use std::time::Duration;
        
        #[repr(C)]
        #[derive(Copy, Clone, Debug)]
        struct RECT {
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
        }

        #[repr(C)]
        #[derive(Copy, Clone, Debug)]
        struct POINT {
            x: i32,
            y: i32,
        }

        #[link(name = "user32")]
        extern "system" {
            fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> isize;
            fn GetForegroundWindow() -> isize;
            fn GetWindowRect(hwnd: isize, lpRect: *mut RECT) -> i32;
            fn GetSystemMetrics(nIndex: i32) -> i32;
            fn GetCursorPos(lpPoint: *mut POINT) -> i32;
            fn GetWindowTextW(hwnd: isize, lpString: *mut u16, nMaxCount: i32) -> i32;
            fn GetShellWindow() -> isize;
            fn GetAsyncKeyState(vKey: i32) -> i16;
            fn GetWindowLongW(hWnd: isize, nIndex: i32) -> i32;
            fn SetWindowLongW(hWnd: isize, nIndex: i32, dwNewLong: i32) -> i32;
            fn SetWindowPos(
                hWnd: isize,
                hWndInsertAfter: isize,
                X: i32,
                Y: i32,
                cx: i32,
                cy: i32,
                uFlags: u32,
            ) -> i32;
        }

        let mut is_hidden = false;
        let mut last_win_pos = window.outer_position().unwrap_or_default();
        let mut last_win_size = window.outer_size().unwrap_or_default();

        let mut last_heavy_check = std::time::Instant::now();
        let mut should_hide_trigger = false;

        let mut island_hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        if island_hwnd == 0 {
            let title_str = "Dynamic Island Windows\0";
            let title_u16: Vec<u16> = title_str.encode_utf16().collect();
            island_hwnd = unsafe { FindWindowW(std::ptr::null(), title_u16.as_ptr()) };
            if island_hwnd == 0 {
                let title_fallback = "Dynamic Island\0";
                let title_u16_fallback: Vec<u16> = title_fallback.encode_utf16().collect();
                island_hwnd = unsafe { FindWindowW(std::ptr::null(), title_u16_fallback.as_ptr()) };
            }
        }

        if island_hwnd != 0 {
            unsafe {
                let ex_style = GetWindowLongW(island_hwnd, -20); // GWL_EXSTYLE
                // WS_EX_TOOLWINDOW (0x00000080) | WS_EX_NOACTIVATE (0x08000000)
                SetWindowLongW(island_hwnd, -20, ex_style | 0x00000080 | 0x08000000);
                // HWND_TOPMOST (-1), SWP_NOMOVE (0x0002) | SWP_NOSIZE (0x0001) | SWP_NOACTIVATE (0x0010) | SWP_FRAMECHANGED (0x0020)
                SetWindowPos(island_hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010 | 0x0020);
            }
        }

        loop {
            // Run loop every 30ms for instant hover click-through response
            std::thread::sleep(Duration::from_millis(30));

            // Heavy checks (fullscreen/maximized apps detection) run once per second
            if last_heavy_check.elapsed() >= Duration::from_millis(1000) {
                last_heavy_check = std::time::Instant::now();

                // Đảm bảo cửa sổ luôn nằm trên cùng (z-order) định kỳ | Force HWND_TOPMOST periodically
                if island_hwnd != 0 && !is_hidden {
                    unsafe {
                        SetWindowPos(island_hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010);
                    }
                }

                let fg_hwnd = unsafe { GetForegroundWindow() };
                if fg_hwnd != 0 {
                    // Update window position and size caches using direct Win32 GetWindowRect for 100% accuracy
                    let mut win_rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                    if island_hwnd != 0 && unsafe { GetWindowRect(island_hwnd, &mut win_rect) } != 0 {
                        if win_rect.left != 0 || win_rect.top != 0 {
                            last_win_pos.x = win_rect.left;
                            last_win_pos.y = win_rect.top;
                            last_win_size.width = (win_rect.right - win_rect.left) as u32;
                            last_win_size.height = (win_rect.bottom - win_rect.top) as u32;
                        }
                    } else {
                        // Fallback
                        if let Ok(pos) = window.outer_position() {
                            if pos.x != 0 || pos.y != 0 { last_win_pos = pos; }
                        }
                        if let Ok(size) = window.outer_size() {
                            if size.width != 0 || size.height != 0 { last_win_size = size; }
                        }
                    }

                    let shell_hwnd = unsafe { GetShellWindow() };
                    if fg_hwnd == shell_hwnd {
                        if is_hidden {
                            let _ = window.show();
                            is_hidden = false;
                            if island_hwnd != 0 {
                                unsafe {
                                    SetWindowPos(island_hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010);
                                }
                            }
                        }
                        should_hide_trigger = false;
                    } else {
                        // Check if foreground window is Vibe Island by title
                        let mut is_vibe_foreground = false;
                        let mut title_buf = [0u16; 256];
                        let len = unsafe { GetWindowTextW(fg_hwnd, title_buf.as_mut_ptr(), 256) };
                        if len > 0 {
                            let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                            if title == "Dynamic Island Windows" || title == "Dynamic Island" || title == "Vibe Island Windows" || title == "Vibe Island" {
                                is_vibe_foreground = true;
                            }
                        }

                        if is_vibe_foreground {
                            should_hide_trigger = false;
                        } else {
                            let screen_width = unsafe { GetSystemMetrics(0) }; // SM_CXSCREEN
                            let screen_height = unsafe { GetSystemMetrics(1) }; // SM_CYSCREEN

                            let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                            let has_rect = unsafe { GetWindowRect(fg_hwnd, &mut rect) } != 0;

                            // Chỉ tự ẩn khi ứng dụng chạy toàn màn hình thật sự (game, video). Cửa sổ phóng to (maximized) vẫn giữ đảo hiển thị.
                            // Only auto-hide for genuine fullscreen apps (games, videos). Maximized windows keep the island visible.
                            let is_fullscreen = has_rect && 
                                rect.left <= 2 && 
                                rect.top <= 2 && 
                                (rect.right - rect.left).abs() >= screen_width - 5 && 
                                (rect.bottom - rect.top).abs() >= screen_height - 5;

                            should_hide_trigger = is_fullscreen;
                        }
                    }
                }
            }

            // Apply auto-hide status changes
            if should_hide_trigger {
                let mut pt = POINT { x: 0, y: 0 };
                unsafe { GetCursorPos(&mut pt) };

                let scale_factor = window.scale_factor().unwrap_or(1.0);
                let center_x = last_win_pos.x + (last_win_size.width as i32) / 2;

                // Đảo được gắn cao hơn mép trên màn hình 12px logic, nên last_win_pos.y là số âm.
                // Dùng đúng hình học thật: khi mở rộng lấy toàn bộ chiều cao cửa sổ để click bên trong bảng không bị ẩn.
                // The island is docked 12 logical px above the screen top, so last_win_pos.y is negative.
                // Use real geometry: full window height when expanded so clicks inside the panel never hide it.
                let active_width = ACTIVE_ISLAND_WIDTH.load(std::sync::atomic::Ordering::Relaxed) as f64;
                let is_expanded = last_win_size.height > ((110.0 * scale_factor) as u32);
                let island_height = if is_expanded {
                    last_win_size.height as f64
                } else {
                    50.0 * scale_factor
                };
                let margin = (10.0 * scale_factor) as i32;
                let keep_half_width =
                    ((active_width / 2.0 * scale_factor) as i32 + margin).max((220.0 * scale_factor) as i32);

                // Vùng kích hoạt: dải sát mép trên màn hình, căn giữa theo đảo
                // Activation strip: the top edge of the screen, centered on the island
                let in_activation_zone = pt.y >= last_win_pos.y - margin
                    && pt.y <= last_win_pos.y + (20.0 * scale_factor) as i32
                    && (pt.x - center_x).abs() < (220.0 * scale_factor) as i32;

                // Vùng giữ: toàn bộ đảo (thu gọn hoặc mở rộng) để thao tác không làm nó biến mất
                // Keep zone: the whole island (compact or expanded) so interacting never hides it
                let in_keep_zone = pt.y >= last_win_pos.y - margin
                    && pt.y <= last_win_pos.y + island_height as i32 + margin
                    && (pt.x - center_x).abs() <= keep_half_width;

                if is_hidden {
                    if in_activation_zone {
                        let _ = window.show();
                        is_hidden = false;
                        if island_hwnd != 0 {
                            unsafe {
                                SetWindowPos(island_hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010);
                            }
                        }
                    }
                } else {
                    if !in_keep_zone {
                        let _ = window.hide();
                        is_hidden = true;
                    }
                }
            } else {
                if is_hidden {
                    let _ = window.show();
                    is_hidden = false;
                    if island_hwnd != 0 {
                        unsafe {
                            SetWindowPos(island_hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010);
                        }
                    }
                }
            }

            // ── CLICK-THROUGH DETECTION (runs at 33fps for zero lag click recovery) ──
            if !is_hidden {
                let mut pt = POINT { x: 0, y: 0 };
                unsafe { GetCursorPos(&mut pt) };

                let scale_factor = window.scale_factor().unwrap_or(1.0);
                let center_x = last_win_pos.x + (last_win_size.width as i32) / 2;

                let active_width = ACTIVE_ISLAND_WIDTH.load(std::sync::atomic::Ordering::Relaxed) as f64;
                
                // Compact mode height is 100 logical pixels. Height threshold 110 separates compact from expanded state.
                let is_expanded = last_win_size.height > ((110.0 * scale_factor) as u32);
                let active_height = if is_expanded {
                    last_win_size.height as f64
                } else {
                    (46.0 + 12.0) * scale_factor // 58 physical pixels for compact state (adds spacing padding)
                };

                let is_lbutton_down = unsafe { GetAsyncKeyState(0x01) } < 0;

                let in_island_rect = pt.y >= last_win_pos.y
                    && pt.y <= last_win_pos.y + active_height as i32
                    && (pt.x - center_x).abs() <= ((active_width / 2.0) * scale_factor) as i32;

                let _ = window.set_ignore_cursor_events(!in_island_rect && !is_lbutton_down);
            }
        }
    });
}

#[derive(Serialize)]
struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[tauri::command]
fn get_available_monitors(window: tauri::WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().ok().flatten();
    let primary_name = primary.and_then(|m| m.name().map(|n| n.to_string())).unwrap_or_default();

    let list = monitors
        .into_iter()
        .map(|m| {
            let name = m.name().map(|n| n.to_string()).unwrap_or_else(|| "Unknown Monitor".to_string());
            let size = m.size();
            let is_primary = name == primary_name;
            MonitorInfo {
                name,
                width: size.width,
                height: size.height,
                is_primary,
            }
        })
        .collect();
    Ok(list)
}

#[tauri::command]
fn reposition_to_monitor(window: tauri::WebviewWindow, monitor_name: String) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let target = if monitor_name.is_empty() {
        window.primary_monitor().ok().flatten()
    } else {
        monitors
            .into_iter()
            .find(|m| m.name().map(|n| n == &monitor_name).unwrap_or(false))
    };

    if let Some(target_monitor) = target {
        let monitor_size = target_monitor.size();
        let scale_factor = target_monitor.scale_factor();
        let logical_monitor_size = monitor_size.to_logical::<f64>(scale_factor);
        let target_position = target_monitor.position().to_logical::<f64>(scale_factor);

        let window_size = window
            .outer_size()
            .unwrap_or_default()
            .to_logical::<f64>(scale_factor);

        // Căn giữa ngang trên màn hình mục tiêu, đặt cao quá mép trên 12px để ẩn một nửa | Center horizontally on target screen, dock 12px off-screen
        let x = target_position.x + (logical_monitor_size.width - window_size.width) / 2.0;
        let y = target_position.y - 12.0;

        let _ = window.set_position(tauri::Position::Logical(LogicalPosition::new(x, y)));
    }
    Ok(())
}

use std::ffi::c_void;

type HWND = isize;
type BOOL = i32;

#[link(name = "user32")]
extern "system" {
    fn SetForegroundWindow(hWnd: HWND) -> BOOL;
    fn ShowWindow(hWnd: HWND, nCmdShow: i32) -> BOOL;
    fn EnumWindows(lpEnumFunc: unsafe extern "system" fn(HWND, isize) -> BOOL, lParam: isize) -> BOOL;
    fn GetWindowTextW(hWnd: HWND, lpString: *mut u16, nMaxCount: i32) -> i32;
    fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut u32) -> u32;
    fn AttachThreadInput(idAttach: u32, idAttachTo: u32, fAttach: BOOL) -> BOOL;
    fn GetForegroundWindow() -> HWND;
}

#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentThreadId() -> u32;
    fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: BOOL, dwProcessId: u32) -> *mut c_void;
    fn CloseHandle(hObject: *mut c_void) -> BOOL;
    fn QueryFullProcessImageNameW(hProcess: *mut c_void, dwFlags: u32, lpExeName: *mut u16, lpdwSize: *mut u32) -> BOOL;
}

struct SearchParams {
    query: String,
    found_hwnd: Option<HWND>,
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: isize) -> BOOL {
    let params = &mut *(lparam as *mut SearchParams);
    
    // 1. Lấy tiêu đề cửa sổ | Get window title
    let mut title_buf = [0u16; 512];
    let title_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 512);
    if title_len == 0 {
        return 1; // Bỏ qua cửa sổ không có tiêu đề | Skip window with no title
    }
    let title = String::from_utf16_lossy(&title_buf[..title_len as usize]).to_lowercase();
    
    // 2. Lấy tên tiến trình tương ứng | Get process name
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    
    let mut process_name = String::new();
    let process_handle = OpenProcess(0x1000, 0, pid); // Quyền truy vấn thông tin giới hạn | PROCESS_QUERY_LIMITED_INFORMATION
    if !process_handle.is_null() {
        let mut path_buf = [0u16; 512];
        let mut size = 512;
        if QueryFullProcessImageNameW(process_handle, 0, path_buf.as_mut_ptr(), &mut size) != 0 {
            let full_path = String::from_utf16_lossy(&path_buf[..size as usize]);
            if let Some(filename) = std::path::Path::new(&full_path).file_name() {
                process_name = filename.to_string_lossy().to_string().to_lowercase();
            }
        }
        CloseHandle(process_handle);
    }
    
    let q = params.query.to_lowercase();
    
    // Tạo các từ khóa tìm kiếm truy vấn | Create query keywords
    let mut keywords = vec![q.clone()];
    if q.contains('.') {
        for part in q.split('.') {
            if part.len() >= 3 {
                keywords.push(part.to_string());
            }
        }
    }
    if q.contains(' ') {
        for part in q.split(' ') {
            if part.len() >= 3 {
                keywords.push(part.to_string());
            }
        }
    }

    // Khớp các từ khóa với tiêu đề cửa sổ hoặc tên tiến trình | Match keywords to title or process
    let mut is_match = false;
    for kw in &keywords {
        if kw.len() >= 3 {
            if title.contains(kw) || process_name.contains(kw) {
                is_match = true;
                break;
            }
        }
    }

    if is_match {
        params.found_hwnd = Some(hwnd);
        return 0; // Đã tìm thấy cửa sổ mục tiêu, dừng tìm kiếm | Found target, stop search
    }
    
    1
}

#[tauri::command]
fn focus_window_by_name(name: String) {
    if name == "Notification" {
        return;
    }
    let mut params = SearchParams {
        query: name,
        found_hwnd: None,
    };
    
    unsafe {
        EnumWindows(enum_window_callback, &mut params as *mut SearchParams as isize);
        
        if let Some(hwnd) = params.found_hwnd {
            let foreground_hwnd = GetForegroundWindow();
            let foreground_thread_id = GetWindowThreadProcessId(foreground_hwnd, std::ptr::null_mut());
            let current_thread_id = GetCurrentThreadId();
            let target_thread_id = GetWindowThreadProcessId(hwnd, std::ptr::null_mut());
            
            // Kết nối các luồng nhập liệu để cho phép cướp tiêu điểm | Attach threads to allow focus stealing
            if current_thread_id != target_thread_id {
                AttachThreadInput(current_thread_id, target_thread_id, 1);
            }
            if foreground_thread_id != 0 && current_thread_id != foreground_thread_id {
                AttachThreadInput(current_thread_id, foreground_thread_id, 1);
            }
            
            // Hiển thị, Khôi phục và Đưa lên tiền cảnh | Show, Restore, and Set to Foreground
            ShowWindow(hwnd, 9); // Khôi phục cửa sổ nếu đang bị ẩn/thu nhỏ | SW_RESTORE (Restore window if minimized)
            ShowWindow(hwnd, 5); // Đảm bảo cửa sổ hiển thị | SW_SHOW (Ensure visible)
            SetForegroundWindow(hwnd);
            
            // Ngắt kết nối các luồng nhập liệu sau khi hoàn thành | Detach threads
            if foreground_thread_id != 0 && current_thread_id != foreground_thread_id {
                AttachThreadInput(current_thread_id, foreground_thread_id, 0);
            }
            if current_thread_id != target_thread_id {
                AttachThreadInput(current_thread_id, target_thread_id, 0);
            }
            
            // Lệnh kích hoạt dự phòng bổ sung | Extra fallback activation
            SetForegroundWindow(hwnd);
        }
    }
}

static ACTIVE_ISLAND_WIDTH: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(110);

#[tauri::command]
fn update_island_width(width: u32) {
    ACTIVE_ISLAND_WIDTH.store(width, std::sync::atomic::Ordering::Relaxed);
}

#[derive(Serialize, Clone)]
struct SystemColors {
    theme: String,
    accent: String,
}

// Đọc chế độ sáng/tối của ứng dụng Windows từ registry | Read the Windows app light/dark mode from the registry
fn read_system_theme() -> String {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize") {
        if let Ok(value) = key.get_value::<u32, _>("AppsUseLightTheme") {
            return if value == 0 { "dark".to_string() } else { "light".to_string() };
        }
    }
    "dark".to_string()
}

// Đọc màu nhấn (accent color) hiện tại của Windows qua WinRT, có dự phòng qua registry | Read the current Windows accent color via WinRT, with a registry fallback
fn read_system_accent() -> String {
    use windows::UI::ViewManagement::{UIColorType, UISettings};
    if let Ok(settings) = UISettings::new() {
        if let Ok(color) = settings.GetColorValue(UIColorType::Accent) {
            if color.R != 0 || color.G != 0 || color.B != 0 {
                return format!("#{:02x}{:02x}{:02x}", color.R, color.G, color.B);
            }
        }
    }

    // Dự phòng: giá trị DWM AccentColor lưu dạng 0xAABBGGRR | Fallback: DWM AccentColor is stored as 0xAABBGGRR
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\DWM") {
        if let Ok(value) = key.get_value::<u32, _>("AccentColor") {
            let r = (value & 0xFF) as u8;
            let g = ((value >> 8) & 0xFF) as u8;
            let b = ((value >> 16) & 0xFF) as u8;
            return format!("#{:02x}{:02x}{:02x}", r, g, b);
        }
    }

    "#007aff".to_string()
}

#[tauri::command]
fn get_system_colors() -> SystemColors {
    SystemColors {
        theme: read_system_theme(),
        accent: read_system_accent(),
    }
}

// Theo dõi thay đổi theme/màu nhấn theo thời gian thực và phát sự kiện cho frontend | Watch theme/accent changes live and emit to the frontend
fn start_system_color_listener(app_handle: AppHandle) {
    std::thread::spawn(move || {
        let mut last_theme = String::new();
        let mut last_accent = String::new();
        loop {
            let theme = read_system_theme();
            let accent = read_system_accent();
            if theme != last_theme || accent != last_accent {
                last_theme = theme.clone();
                last_accent = accent.clone();
                let _ = app_handle.emit("system-color-changed", SystemColors { theme, accent });
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    });
}

// ── System tray: persistent pending-tasks indicator ──────────────────────────
static TRAY_LANG: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0); // 0 = en, 1 = vi

// (pending, open, refresh, quit, none)
fn tray_labels() -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    match TRAY_LANG.load(std::sync::atomic::Ordering::Relaxed) {
        1 => ("Đang chờ", "Mở nhiệm vụ", "Làm mới", "Thoát", "Không có nhiệm vụ"),
        _ => ("Pending", "Open tasks", "Refresh", "Quit", "No pending tasks"),
    }
}

// Ngày UTC hôm nay theo định dạng YYYY-MM-DD (khớp với frontend dùng toISOString) | Today's UTC date as YYYY-MM-DD (matches the frontend toISOString)
fn today_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86400);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

// Danh sách tác vụ đang chờ (chưa xong và đến hạn hôm nay hoặc quá hạn) | Pending tasks (not done and due today or overdue)
fn get_pending_tasks_for_tray() -> Vec<(String, String)> {
    let today = today_utc();
    let conn = match get_vibe_db_conn() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut stmt = match conn.prepare(
        "SELECT id, name FROM local_tasks WHERE done = 0 AND (due_date IS NULL OR due_date <= ?1) ORDER BY COALESCE(sort_order, created_at_unix_s) ASC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([&today], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

fn build_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let tasks = get_pending_tasks_for_tray();
    let (pending, open, refresh, quit, none) = tray_labels();

    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "header",
        format!("{}: {}", pending, tasks.len()),
        false,
        None::<&str>,
    )?)?;

    if tasks.is_empty() {
        menu.append(&MenuItem::with_id(app, "empty", none, false, None::<&str>)?)?;
    } else {
        let shown = 15usize;
        for (id, name) in tasks.iter().take(shown) {
            let item = MenuItem::with_id(
                app,
                format!("task:{}", id),
                format!("•  {}", name),
                true,
                None::<&str>,
            )?;
            menu.append(&item)?;
        }
        if tasks.len() > shown {
            menu.append(&MenuItem::with_id(
                app,
                "more",
                format!("… +{} more", tasks.len() - shown),
                false,
                None::<&str>,
            )?)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "open", open, true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "refresh", refresh, true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&PredefinedMenuItem::quit(app, Some(quit))?)?;
    Ok(menu)
}

fn show_tasks<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("tray-open-tasks", ());
}

fn refresh_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let handle = app.clone();
    let inner = app.clone();
    let _ = handle.run_on_main_thread(move || {
        if let Ok(menu) = build_tray_menu(&inner) {
            if let Some(tray) = inner.tray_by_id("main-tray") {
                let _ = tray.set_menu(Some(menu));
                let count = get_pending_tasks_for_tray().len();
                let (pending, ..) = tray_labels();
                let _ = tray.set_tooltip(Some(format!("Dynamic Island · {}: {}", pending, count)));
            }
        }
    });
}

fn on_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref().to_string();
    match id.as_str() {
        "open" => show_tasks(app),
        "refresh" => refresh_tray(app),
        _ => {
            if let Some(task_id) = id.strip_prefix("task:") {
                let _ = toggle_local_task(task_id.to_string());
                refresh_tray(app);
            }
        }
    }
}

fn build_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let handle = app.handle().clone();
    let menu = build_tray_menu(&handle)?;

    let count = get_pending_tasks_for_tray().len();
    let (pending, ..) = tray_labels();

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(format!("Dynamic Island · {}: {}", pending, count))
        .on_menu_event(|app, event| on_tray_menu(app, event))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_tasks(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

// Cập nhật icon khay khi danh sách tác vụ thay đổi | Refresh the tray icon when the task list changes
fn start_tray_updater<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last_sig = String::from("<init>");
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let tasks = get_pending_tasks_for_tray();
            let sig = tasks
                .iter()
                .map(|(id, name)| format!("{}:{}", id, name))
                .collect::<Vec<_>>()
                .join("|");
            if sig != last_sig {
                last_sig = sig;
                refresh_tray(&app_handle);
            }
        }
    });
}

#[tauri::command]
fn set_ui_language<R: tauri::Runtime>(app: tauri::AppHandle<R>, language: String) {
    let value = if language == "vi" { 1 } else { 0 };
    TRAY_LANG.store(value, std::sync::atomic::Ordering::Relaxed);
    refresh_tray(&app);
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
struct VolumeInfo {
    level: i32,
    muted: bool,
}

// Theo dõi âm lượng hệ thống (WASAPI) và phát sự kiện cho HUD | Watch the system volume (WASAPI) and emit events for the HUD
fn start_volume_listener(app_handle: AppHandle) {
    std::thread::spawn(move || {
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::Media::Audio::{
            eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
        };

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let enumerator: IMMDeviceEnumerator =
                match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                    Ok(e) => e,
                    Err(_) => return,
                };
            let device = match enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                Ok(d) => d,
                Err(_) => return,
            };
            let volume: IAudioEndpointVolume = match device.Activate(CLSCTX_ALL, None) {
                Ok(v) => v,
                Err(_) => return,
            };

            let mut last_level = -1.0f32;
            let mut last_muted = false;
            loop {
                let level = volume.GetMasterVolumeLevelScalar().unwrap_or(0.0);
                let muted = volume.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                if (level - last_level).abs() > 0.004 || muted != last_muted {
                    last_level = level;
                    last_muted = muted;
                    let _ = app_handle.emit(
                        "system-volume",
                        VolumeInfo {
                            level: (level * 100.0).round() as i32,
                            muted,
                        },
                    );
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                position_window(&window);
                start_fullscreen_auto_hide(window.clone());
            }

            let handle = app.handle().clone();
            
            // Start Bluetooth listener
            start_bluetooth_listener(handle.clone());

            // Start Windows theme + accent color watcher
            start_system_color_listener(handle.clone());

            // Start system volume watcher (HUD)
            start_volume_listener(handle.clone());

            // System tray: persistent pending-tasks indicator
            let _ = build_tray(app);
            start_tray_updater(handle.clone());

            let handle_media = handle.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    start_media_listener(handle_media).await;
                });
            });

            let handle_notif = handle.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    start_notification_listener(handle_notif).await;
                });
            });

            // Thực hiện dọn dẹp các tệp tin tạm cũ lưu trữ quá 7 ngày | Clean up stashed temporary files older than 7 days
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                let stash_dir = format!("{}\\VibeIsland\\stash", local_app_data);
                clean_old_stash_files(&stash_dir);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            get_look_todos,
            save_look_todo,
            delete_look_todo,
            control_media,
            seek_media,
            get_local_tasks,
            add_local_task,
            toggle_local_task,
            delete_local_task,
            update_local_task,
            reorder_local_tasks,
            save_focus_session,
            get_focus_reports,
            get_local_task_stats,
            stash_file,
            delete_stashed_file,
            get_available_monitors,
            reposition_to_monitor,
            focus_window_by_name,
            update_island_width,
            get_system_colors,
            set_ui_language,
            read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
