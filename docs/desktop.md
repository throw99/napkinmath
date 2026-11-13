# Desktop app (Tauri)

The `tauri` branch wraps the web app in a Tauri 2 window. The desktop app loads the
same `dist/` build as the web app. The branch only adds files (`src-tauri/`, two
workflows, this note), so upstream merges do not conflict.

## Requirements

- Rust (stable) and the Tauri CLI: `cargo install tauri-cli --version "^2" --locked`
- Linux: WebKitGTK 4.1 dev libraries. On Debian or Ubuntu:
  `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- Node 22 and `npm ci`

The Tauri CLI is not in `package.json`. Use `cargo tauri`, or `npx @tauri-apps/cli@2.11.4`.

## Run in development

    cargo tauri dev

This starts `npm run dev` (Vite on `http://127.0.0.1:3003`) and opens the window on it.
Vite uses a strict port. Stop any other NapkinMath dev server on port 3003 first.

## Build

    cargo tauri build

This runs `npm run build` and writes the bundles to `src-tauri/target/release/bundle/`:
`deb/`, `rpm/` and `appimage/`. For a faster local build, use `cargo tauri build --bundles deb`.

The app version comes from `package.json`. Sheets are saved in the WebKit local
storage of the app (`~/.local/share/app.napkinmath.desktop/`). They are separate from
the sheets in a browser.

On GNOME (`XDG_CURRENT_DESKTOP` contains GNOME), the window has a native header bar with a main menu (zoom, full screen, reload, about, quit; F10 opens it). It follows the system dark or light setting. Other desktops keep the default title bar. On Linux the app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it, to prevent a blank window on Wayland.

## Cut a release

1. Merge the changes you want into `tauri`.
2. Tag the commit and push the tag:

       git tag v0.1.0
       git push origin v0.1.0

3. The `Tauri release` workflow builds the Linux bundles and attaches them to a
   draft GitHub release.
4. Open the draft on GitHub, check the files, and publish it.

## Upstream sync

The `Upstream sync` workflow runs every Monday and on demand (Actions tab, "Run workflow").
It does these steps:

1. Check out `tauri` and fetch `main` from `LucasAIBuilder/napkinmath`.
2. Stop with no change if `tauri` already contains upstream `main`.
3. Merge upstream `main`. A conflict fails the job.
4. Run `npm ci` and a Tauri build (`.deb` only). A failure fails the job.
5. Push the merge to `tauri`.

The job pushes only after the merge and the build succeed.

The default `GITHUB_TOKEN` cannot push commits that change `.github/workflows/`. If
upstream changes its workflows, the push fails. To fix this, add a repository secret
`SYNC_TOKEN`: a fine-grained token with write access to contents and workflows.

When the job fails on a conflict, merge by hand:

    git remote add upstream https://github.com/LucasAIBuilder/napkinmath.git
    git fetch upstream
    git checkout tauri
    git merge upstream/main
