# Thorn

An agent harness. So far this is the app shell: a sidebar of sessions and projects. No model is connected yet.

Plain HTML, CSS and JavaScript with no build step and no dependencies, the same approach as PinkLabs-Webpage.

- `npm start` serves the folder at http://localhost:5173. It has to be served rather than opened as a file, because browsers block JavaScript modules on `file://` pages.
- `npm test` runs the tests for the state logic in `store.js`.

## Files

- `index.html`: the page.
- `styles.css`: the look. Colours are variables at the top.
- `store.js`: the app's data (projects, sessions) and the functions that change it.
- `app.js`: draws the sidebar from that data and handles clicks.

Everything is saved in the browser's `localStorage`, so it stays on your machine and survives a reload.
