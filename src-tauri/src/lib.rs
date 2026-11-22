pub fn run() {
    tauri::Builder::default()
        // Native folder picker and confirm dialogs, called from src/app.js.
        .plugin(tauri_plugin_dialog::init())
        // Opens web links from replies in the default browser.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Thorn");
}
