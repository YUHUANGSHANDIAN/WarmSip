use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.eval(
                        r#"
                        (async () => {
                          if (!("serviceWorker" in navigator)) return;
                          const registrations = await navigator.serviceWorker.getRegistrations();
                          await Promise.all(registrations.map((registration) => registration.unregister()));
                          if ("caches" in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map((key) => caches.delete(key)));
                          }
                          if (registrations.length) location.reload();
                        })().catch(() => {});
                        "#,
                    );
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("WarmSip runtime could not start");
}
