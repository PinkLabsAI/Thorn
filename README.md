# Thorn

An agent harness for the Mac. So far this is the app window: a sidebar of projects and sessions. No model is connected yet.

Thorn is a [Tauri](https://tauri.app) app. The screen is plain HTML, CSS and JavaScript (no framework, no build step, the same languages as PinkLabs-Webpage). Tauri shows that screen in a native Mac window, and a small Rust program handles what needs the Mac itself, such as the folder picker.

## Run it

You need [Rust](https://rustup.rs) and Apple's command line tools (`xcode-select --install`) once. Then:

```
npm install
npm run dev
```

The first run compiles the Rust side and takes a few minutes. After that, changes to files in `src/` show up when you reload the window (Cmd+R).

- `npm run build` makes `Thorn.app` and a `.dmg` in `src-tauri/target/release/bundle/`.
- `npm test` runs the tests for the data logic in `src/store.js`.

## Files

- `src/index.html`, `src/styles.css`: the screen and its look. Colours are variables at the top of the CSS.
- `src/store.js`: the data (projects, sessions) and the functions that change it.
- `src/app.js`: draws the sidebar from that data and handles clicks.
- `src-tauri/tauri.conf.json`: the window (size, title bar style) and app name.
- `src-tauri/capabilities/default.json`: what the screen is allowed to ask the Mac to do.
- `src-tauri/src/lib.rs`: the Rust entry point. It starts the app and loads the dialog plugin.

Projects and sessions are saved in the app's own `localStorage`, on this Mac only.
