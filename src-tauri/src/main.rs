// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
mod header_bar;

use tauri::Manager;

fn main() {
    // WebKitGTK's DMA-BUF renderer can fail on Wayland (GBM buffer errors, blank
    // window). Turn it off unless the user chose a value.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .setup(|app| {
            let Some(window) = app.get_webview_window("main") else { return Ok(()) };
            // GTK takes a title bar only before the window first shows, so the
            // window starts hidden (tauri.conf.json) and shows here.
            #[cfg(target_os = "linux")]
            if header_bar::wanted() {
                header_bar::install(app.handle(), &window)?;
            }
            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NapkinMath");
}
