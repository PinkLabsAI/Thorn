# Thorn

An agent harness for the Mac. So far this is the app window: a sidebar of projects and sessions, and a chat. No model is connected yet, so the chat answers every message with the same scripted sample reply.

Thorn is a [Tauri](https://tauri.app) app. The screen is plain HTML, CSS and JavaScript (no framework, no build step, the same languages as PinkLabs-Webpage). Tauri shows that screen in a native Mac window, and a small Rust program handles what needs the Mac itself, such as the folder picker.

## Run it

You need [Rust](https://rustup.rs) and Apple's command line tools (`xcode-select --install`) once. Then:

```
npm install
npm run dev
```

The first run compiles the Rust side and takes a few minutes. After that, changes to files in `src/` show up when you reload the window (Cmd+R).

- `npm run build` makes `Thorn.app` and a `.dmg` in `src-tauri/target/release/bundle/`.
- `npm test` runs the tests for the data logic in `src/store.js` and the markdown in `src/markdown.js`.

## Files

- `src/index.html`, `src/styles.css`: the screen and its look. Colours are variables at the top of the CSS.
- `src/store.js`: the data (projects, sessions) and the functions that change it.
- `src/app.js`: draws the sidebar from that data and handles clicks.
- `src/reply.js`, `src/reply.css`: an assistant reply in the chat: the status line, the web search with its sources, and the answer that streams in.
- `src/markdown.js`: turns a reply's markdown text into HTML.
- `src/sample.js`: the scripted reply that stands in for a model. Connecting a real model means replacing this file's events with real ones.
- `src-tauri/tauri.conf.json`: the window (size, title bar style) and app name.
- `src-tauri/capabilities/default.json`: what the screen is allowed to ask the Mac to do.
- `src-tauri/src/lib.rs`: the Rust entry point. It starts the app and loads the dialog plugin.

Projects and sessions are saved in the app's own `localStorage`, on this Mac only.

## Design

The look follows the [unslop](https://github.com/heydamir/unslop) design guidelines by Damir Sokolovsky: one grey ramp with three text roles, spacing on a 4px grid, one line-icon set ([lucide](https://lucide.dev)) at one size, and weights 400 and 500 only. Pink is the one accent, kept for Thorn's mark and the keyboard focus ring.

The whole window is the Mac's own frosted material. The sidebar sits directly on it and the chat is a rounded panel resting beside it, so the two sides stay close in colour. That takes a see-through window, which Tauri only allows with `macOSPrivateApi` turned on in `src-tauri/tauri.conf.json`. Apps that use it cannot be sold on the Mac App Store, so Thorn is meant to be downloaded directly.

Research results appear in a compact disclosure list with bundled publisher logos and numbered citations in the answer. The MDN, Tauri and Claude marks come from [theSVG](https://thesvg.org) ([MIT license](src/source-logos/LICENSE-theSVG.txt)). The web.dev favicon comes from [web.dev](https://web.dev/). The [WHATWG mark](https://resources.whatwg.org/logo.svg) comes from [WHATWG](https://whatwg.org/). The marks remain the property of their respective owners.
