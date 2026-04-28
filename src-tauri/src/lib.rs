mod commands;

use commands::{
    ai_text::ai_text,
    beacon::scan_local_directory,
    keychain::{
        delete_deepseek_key, delete_tavily_key, delete_weather_key, get_deepseek_key,
        get_tavily_key, get_weather_key, save_deepseek_key, save_tavily_key, save_weather_key,
    },
    luna::stream_luna,
    pulsar::{
        pulsar_cancel_download, pulsar_check_ytdlp, pulsar_delete_file, pulsar_download,
        pulsar_get_downloads_dir, pulsar_install_ytdlp, PulsarState,
    },
    search::web_search,
};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

// ── Window state persistence ─────────────────────────────────────────────────
const WINDOW_STATE_KEY: &str = "window-state";

#[derive(serde::Serialize, serde::Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn load_window_state(app: &tauri::AppHandle) -> Option<WindowState> {
    let store = app.store("settings.json").ok()?;
    store.get(WINDOW_STATE_KEY).and_then(|v| {
        serde_json::from_value(v.clone()).ok()
    })
}

fn save_window_state(app: &tauri::AppHandle, state: &WindowState) {
    if let Ok(store) = app.store("settings.json") {
        let _ = store.set(WINDOW_STATE_KEY, serde_json::to_value(state).unwrap());
        let _ = store.save();
    }
}

fn apply_window_state(window: &tauri::WebviewWindow, state: &WindowState) {
    let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
    let _ = window.set_size(tauri::PhysicalSize::new(state.width, state.height));
    if state.maximized {
        let _ = window.maximize();
    }
}

fn get_window_state(window: &tauri::WebviewWindow) -> Option<WindowState> {
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let maximized = window.is_maximized().unwrap_or(false);
    Some(WindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

// ── GPU selection ─────────────────────────────────────────────────────────────
// WebView2 manages GPU selection internally. The UserGpuPreferences registry
// key does NOT affect WebView2 because Chromium does not call SetGPUPreference().
// To force the discrete GPU on Windows: Settings → Display → Graphics →
// Browse → Starfield.exe → High Performance. There is no programmatic API.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ask the Chromium compositor inside WebView2 to use GPU rasterisation
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-gpu-rasterization --enable-zero-copy",
    );

    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").ok_or_else(|| anyhow::anyhow!("Window not found"))?;

            if let Some(state) = load_window_state(app.handle()) {
                apply_window_state(&window, &state);
            } else {
                let _ = window.maximize();
            }

            let window_clone = window.clone();
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if let Some(state) = get_window_state(&window_clone) {
                        save_window_state(&app_handle, &state);
                    }
                }
            });

            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = window.set_icon(icon);
            }

            app.manage(PulsarState::new());

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            ai_text,
            save_deepseek_key,
            get_deepseek_key,
            delete_deepseek_key,
            save_tavily_key,
            get_tavily_key,
            delete_tavily_key,
            save_weather_key,
            get_weather_key,
            delete_weather_key,
            stream_luna,
            web_search,
            scan_local_directory,
            pulsar_check_ytdlp,
            pulsar_download,
            pulsar_get_downloads_dir,
            pulsar_cancel_download,
            pulsar_install_ytdlp,
            pulsar_delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Starfield");
}
