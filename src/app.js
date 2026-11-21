// Draws the window from the data in store.js and reacts to clicks.

import {
  load, save, addProject, addSession, removeSession, removeProject, addMessage,
} from './store.js';

// Tauri exposes its API on window.__TAURI__ ("withGlobalTauri" in tauri.conf.json).
// `open` shows the Mac folder picker and `confirm` a Mac confirmation dialog.
const { open, confirm } = window.__TAURI__.dialog;

const state = load(localStorage);
const sidebar = document.querySelector('#sidebar');
const chat = document.querySelector('#chat');

// Folder names and messages come from outside the code and are placed into
// innerHTML, so anything that looks like HTML in them has to be neutralised.
function safe(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

// A three-dot button followed by its menu. The menu starts hidden.
function dots(label, menuItems) {
  return `<span class="dots">
    <button class="icon" data-action="menu" aria-haspopup="menu" aria-label="${label}">⋯</button>
    <span class="menu" role="menu" hidden>${menuItems}</span>
  </span>`;
}

function deleteItem(action, id) {
  return `<button role="menuitem" class="danger" data-action="${action}" data-id="${id}">Delete</button>`;
}

// <details>/<summary> is the browser's built-in dropdown: it opens and closes
// on its own, so the only code needed is remembering which ones are closed.
function dropdown(key, summary, items, emptyText) {
  return `<details data-key="${key}" ${state.closed[key] ? '' : 'open'}>
    <summary>${summary}</summary>
    <ul>${items || `<li class="empty-row">${emptyText}</li>`}</ul>
  </details>`;
}

function sessionRow(session, projectTag = '') {
  return `<li class="row" ${session.id === state.openSessionId ? 'aria-current="true"' : ''}>
    <button class="label" data-action="open-session" data-id="${session.id}">
      <span class="text">${safe(session.title)}</span>${projectTag}
    </button>
    ${dots('Session options', deleteItem('delete-session', session.id))}
  </li>`;
}

function projectRow(project) {
  const sessions = state.sessions.filter((session) => session.projectId === project.id);
  const summary = `<span class="row" title="${safe(project.path)}">
    <span class="label"><span class="chevron"></span><span class="text">${safe(project.name)}</span></span>
    <button class="icon" data-action="new-session" data-id="${project.id}"
      aria-label="New session in ${safe(project.name)}">+</button>
    ${dots('Project options', deleteItem('delete-project', project.id))}
  </span>`;
  return `<li>${dropdown(project.id, summary, sessions.map((s) => sessionRow(s)).join(''), 'No sessions yet')}</li>`;
}

function heading(text) {
  return `<span class="row heading"><span class="label"><span class="chevron"></span>${text}</span></span>`;
}

function showOption(value, text) {
  return `<button role="menuitemradio" aria-checked="${state.show === value}"
    data-action="show" data-id="${value}">${text}</button>`;
}

function drawSidebar() {
  const projectName = (id) => state.projects.find((project) => project.id === id).name;
  // "All sessions" lists every session; ones inside a project carry its name as a tag.
  const everySession = state.sessions.map((session) =>
    sessionRow(session, session.projectId ? `<span class="tag">${safe(projectName(session.projectId))}</span>` : ''));

  // data-tauri-drag-region lets you move the window by dragging that element.
  sidebar.innerHTML = `
    <header class="titlebar" data-tauri-drag-region>
      <span class="name" data-tauri-drag-region>Thorn</span>
      ${dots('View options', `<span class="menu-title">Show</span>
        ${showOption('all', 'All sessions')}
        ${showOption('projects', 'Projects only')}`)}
    </header>
    <button class="row label" data-action="new-session"><span class="plus" aria-hidden="true">+</span>New session</button>
    <button class="row label" data-action="new-project"><span class="plus" aria-hidden="true">+</span>New project</button>
    ${dropdown('projects', heading('Projects'), state.projects.map(projectRow).join(''), 'No projects yet')}
    ${state.show === 'all' ? dropdown('sessions', heading('Sessions'), everySession.join(''), 'No sessions yet') : ''}`;
}

function drawChat() {
  const session = state.sessions.find((s) => s.id === state.openSessionId);
  if (!session) {
    chat.innerHTML = `<header class="titlebar" data-tauri-drag-region></header>
      <div class="welcome"><h1>Thorn</h1>
      <p>Start a session to talk with the model, or a project to work on a folder.</p></div>`;
    return;
  }
  const project = state.projects.find((p) => p.id === session.projectId);
  chat.innerHTML = `
    <header class="titlebar" data-tauri-drag-region>
      <span class="text" data-tauri-drag-region>${safe(session.title)}</span>
      ${project ? `<span class="tag">${safe(project.name)}</span>` : ''}
    </header>
    <ol class="messages">${session.messages.map((m) => `<li>${safe(m.text)}</li>`).join('')}</ol>
    <p class="notice">No model is connected yet, so messages are saved but not answered.</p>
    <form class="composer">
      <input name="text" placeholder="Message Thorn" autocomplete="off" aria-label="Message">
      <button>Send</button>
    </form>`;
  chat.querySelector('input').focus();
}

function closeMenus(except = null) {
  for (const menu of document.querySelectorAll('.menu')) {
    if (menu !== except) menu.hidden = true;
  }
}

// One click listener for the whole window (event delegation). The sidebar's HTML
// is replaced on every change, which would throw away listeners on single buttons.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const { action, id } = button?.dataset ?? {};
  const menu = action === 'menu' ? button.nextElementSibling : null;
  closeMenus(menu); // a click anywhere closes every other menu
  if (!button) return;

  event.preventDefault(); // buttons inside a <summary> must not also toggle the dropdown
  if (menu) {
    menu.hidden = !menu.hidden;
    return;
  }

  const openBefore = state.openSessionId;
  if (action === 'show') state.show = id;
  if (action === 'open-session') state.openSessionId = id;
  if (action === 'new-session') addSession(state, id ?? null);
  if (action === 'delete-session') removeSession(state, id);
  if (action === 'new-project') {
    const folder = await open({ directory: true, title: 'Choose a project folder' });
    if (folder) addProject(state, folder); // null when the picker is cancelled
  }
  if (action === 'delete-project') {
    const project = state.projects.find((p) => p.id === id);
    const count = state.sessions.filter((session) => session.projectId === id).length;
    const question = `Delete "${project.name}" and its ${count} session(s)? The folder itself is not touched.`;
    if (await confirm(question, { title: 'Delete project', kind: 'warning' })) removeProject(state, id);
  }

  save(localStorage, state);
  drawSidebar();
  // Redraw the chat only when a different session is open, so a half-typed message is kept.
  if (state.openSessionId !== openBefore) drawChat();
});

// "toggle" fires when a dropdown opens or closes. It does not bubble, so the
// third argument (capture) is what lets one listener on the document see it.
document.addEventListener('toggle', (event) => {
  const key = event.target.dataset?.key;
  if (!key) return;
  state.closed[key] = !event.target.open;
  save(localStorage, state);
}, true);

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = event.target.elements.text.value.trim();
  if (!text) return;
  addMessage(state, state.openSessionId, text);
  save(localStorage, state);
  drawSidebar();
  drawChat();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus();
});

drawSidebar();
drawChat();
