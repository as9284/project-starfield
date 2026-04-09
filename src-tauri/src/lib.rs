mod commands;

use commands::{
    keychain::{
        delete_deepseek_key, delete_tavily_key, get_deepseek_key, get_tavily_key,
        save_deepseek_key, save_tavily_key,
    },
    luna::stream_luna,
    search::web_search,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_deepseek_key,
            get_deepseek_key,
            delete_deepseek_key,
            save_tavily_key,
            get_tavily_key,
            delete_tavily_key,
            stream_luna,
            web_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Starfield");
}
