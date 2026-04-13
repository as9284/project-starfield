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

// ── Windows: request dedicated (high-performance) GPU via UserGpuPreferences ──
// Equivalent to "High performance" in Windows Settings → Display → Graphics.
// Must run before the WebView2 process spawns, so it lives at the top of run().
#[cfg(target_os = "windows")]
fn set_gpu_preference() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    if let Ok(exe_path) = std::env::current_exe() {
        if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
            r"Software\Microsoft\DirectX\UserGpuPreferences",
            KEY_SET_VALUE,
        ) {
            let path_str = exe_path.to_string_lossy().to_string();
            // GpuPreference=2 → high-performance (discrete) GPU.
            let _ = hkcu.set_value(&path_str, &"GpuPreference=2;");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Apply GPU preference before WebView2 initialises.
    #[cfg(target_os = "windows")]
    set_gpu_preference();

    // Ask the Chromium compositor inside WebView2 to use GPU rasterisation
    // and zero-copy texture uploads, reducing CPU↔GPU transfer overhead.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-gpu-rasterization --enable-zero-copy",
    );

    tauri::Builder::default()
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
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
