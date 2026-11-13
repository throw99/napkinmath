//! The GNOME header bar: window controls, the title and a main menu in the
//! title bar. GNOME gets it; other desktops keep the default title bar.
//! The menu only uses window and webview APIs, so the web app needs no change.

use std::sync::Mutex;

use gtk::gdk::keys::constants as key;
use gtk::gdk::ModifierType;
use gtk::prelude::*;
use tauri::{AppHandle, WebviewWindow};

/// Zoom steps, as in GNOME Web.
const ZOOM_STEPS: [f64; 13] = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
static ZOOM: Mutex<f64> = Mutex::new(1.0);

#[derive(Clone, Copy)]
enum Action {
    ZoomIn,
    ZoomOut,
    ZoomReset,
    FullScreen,
    Reload,
    About,
    Quit,
}

pub(crate) fn wanted() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP")
        .is_ok_and(|d| d.split(':').any(|s| s.eq_ignore_ascii_case("gnome")))
}

/// Puts the header bar on the window. Call it before the window first shows.
pub(crate) fn install(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let win = window.gtk_window()?;
    let bar = gtk::HeaderBar::new();
    bar.set_show_close_button(true);
    bar.set_title(Some("NapkinMath"));

    let menu = gtk::MenuButton::new();
    menu.set_image(Some(&gtk::Image::from_icon_name(Some("open-menu-symbolic"), gtk::IconSize::Button)));
    menu.set_tooltip_text(Some("Main menu"));
    menu.set_popup(Some(&build_menu(app, window)));
    // A click on the button must not take the keys from the page.
    menu.set_focus_on_click(false);
    // Flat, as in current GNOME apps: the frame shows on hover only.
    menu.set_relief(gtk::ReliefStyle::None);

    bar.pack_end(&menu);
    bar.show_all();
    win.set_titlebar(Some(&bar));

    // Shortcuts. The window sees key presses before the webview does.
    let (a, w, m) = (app.clone(), window.clone(), menu.clone());
    win.connect_key_press_event(move |_, e| {
        let mods = e.state() & gtk::accelerator_get_default_mod_mask();
        let ctrl = mods == ModifierType::CONTROL_MASK;
        let ctrl_shift = mods == ModifierType::CONTROL_MASK | ModifierType::SHIFT_MASK;
        let k = e.keyval();
        let action = if mods.is_empty() && k == key::F10 {
            m.set_active(true);
            return gtk::glib::Propagation::Stop;
        } else if mods.is_empty() && k == key::F11 {
            Action::FullScreen
        } else if (ctrl || ctrl_shift) && (k == key::plus || k == key::equal || k == key::KP_Add) {
            Action::ZoomIn
        } else if ctrl && (k == key::minus || k == key::KP_Subtract) {
            Action::ZoomOut
        } else if ctrl && (k == key::_0 || k == key::KP_0) {
            Action::ZoomReset
        } else if ctrl && (k == key::q || k == key::Q) {
            Action::Quit
        } else {
            return gtk::glib::Propagation::Proceed;
        };
        run(&a, &w, action);
        gtk::glib::Propagation::Stop
    });

    follow_color_scheme();
    Ok(())
}

fn build_menu(app: &AppHandle, window: &WebviewWindow) -> gtk::Menu {
    let items: [Option<(&str, &str, Action)>; 10] = [
        Some(("Zoom In", "<Primary>plus", Action::ZoomIn)),
        Some(("Zoom Out", "<Primary>minus", Action::ZoomOut)),
        Some(("Actual Size", "<Primary>0", Action::ZoomReset)),
        None,
        Some(("Full Screen", "F11", Action::FullScreen)),
        Some(("Reload", "", Action::Reload)),
        None,
        Some(("About NapkinMath", "", Action::About)),
        None,
        Some(("Quit", "<Primary>q", Action::Quit)),
    ];
    let root = gtk::Menu::new();
    for it in items {
        let Some((label, accel, action)) = it else {
            root.append(&gtk::SeparatorMenuItem::new());
            continue;
        };
        let item = gtk::MenuItem::with_label(label);
        // The label only shows the key; the key handler in install() acts on it.
        if let Some(l) = item.child().and_then(|c| c.downcast::<gtk::AccelLabel>().ok()) {
            let (k, mods) = gtk::accelerator_parse(accel);
            if k != 0 {
                l.set_accel(k, mods);
            }
        }
        let (a, w) = (app.clone(), window.clone());
        item.connect_activate(move |_| run(&a, &w, action));
        root.append(&item);
    }
    root.show_all();
    root
}

fn run(app: &AppHandle, window: &WebviewWindow, action: Action) {
    match action {
        Action::ZoomIn => zoom(window, 1),
        Action::ZoomOut => zoom(window, -1),
        Action::ZoomReset => zoom(window, 0),
        Action::FullScreen => {
            let on = window.is_fullscreen().unwrap_or(false);
            let _ = window.set_fullscreen(!on);
        }
        Action::Reload => {
            let _ = window.reload();
        }
        Action::About => about(app, window),
        Action::Quit => app.exit(0),
    }
}

/// `dir` 1 zooms in one step, -1 zooms out, 0 resets.
fn zoom(window: &WebviewWindow, dir: i32) {
    let mut z = ZOOM.lock().unwrap_or_else(|e| e.into_inner());
    let next = match dir {
        0 => 1.0,
        d if d > 0 => ZOOM_STEPS.iter().copied().find(|s| *s > *z + 0.001).unwrap_or(*z),
        _ => ZOOM_STEPS.iter().rev().copied().find(|s| *s < *z - 0.001).unwrap_or(*z),
    };
    if window.set_zoom(next).is_ok() {
        *z = next;
    }
}

fn about(app: &AppHandle, window: &WebviewWindow) {
    let info = app.package_info();
    let d = gtk::AboutDialog::new();
    d.set_program_name("NapkinMath");
    d.set_version(Some(&info.version.to_string()));
    d.set_comments(Some("A notepad calculator. Type math line by line and see the answers."));
    d.set_website(Some("https://napkinmath.app"));
    d.set_license_type(gtk::License::MitX11);
    // The window icon is small; the dialog wants a large logo.
    let loader = gtk::gdk_pixbuf::PixbufLoader::new();
    if loader.write(include_bytes!("../icons/128x128@2x.png")).is_ok() && loader.close().is_ok() {
        d.set_logo(loader.pixbuf().and_then(|p| p.scale_simple(128, 128, gtk::gdk_pixbuf::InterpType::Bilinear)).as_ref());
    }
    if let Ok(w) = window.gtk_window() {
        d.set_transient_for(Some(&w));
    }
    d.set_modal(true);
    d.connect_response(|d, _| d.close());
    d.show();
}

/// Dark header bar and menus when GNOME prefers dark. GTK 3 does not follow
/// org.gnome.desktop.interface color-scheme by itself.
fn follow_color_scheme() {
    const SCHEMA: &str = "org.gnome.desktop.interface";
    let has_key = gtk::gio::SettingsSchemaSource::default()
        .and_then(|s| s.lookup(SCHEMA, true))
        .is_some_and(|s| s.has_key("color-scheme"));
    if !has_key {
        return;
    }
    let settings = gtk::gio::Settings::new(SCHEMA);
    let apply = |s: &gtk::gio::Settings| {
        let dark = s.string("color-scheme") == "prefer-dark";
        if let Some(g) = gtk::Settings::default() {
            g.set_gtk_application_prefer_dark_theme(dark);
        }
    };
    apply(&settings);
    settings.connect_changed(Some("color-scheme"), move |s, _| apply(s));
    // Keep the settings object, so the change signal stays connected.
    std::mem::forget(settings);
}
