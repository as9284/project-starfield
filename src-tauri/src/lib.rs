mod commands;

use commands::{
    beacon::scan_local_directory,
    keychain::{
        delete_deepseek_key, delete_tavily_key, delete_weather_key, get_deepseek_key,
        get_tavily_key, get_weather_key, save_deepseek_key, save_tavily_key, save_weather_key,
    },
    luna::stream_luna,
    pulsar::{pulsar_check_ytdlp, pulsar_download, pulsar_get_downloads_dir},
    search::web_search,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                let _ = window.set_icon(icon);
            }

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Starfield");
}
