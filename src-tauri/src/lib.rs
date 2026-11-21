pub fn run() {
    tauri::Builder::default()
        // Native folder picker and confirm dialogs, called from src/app.js.
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running Thorn");
}
