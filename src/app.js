// Draws the window from the data in store.js and reacts to clicks.

import {
  load, save, addProject, addSession, removeSession, removeProject, addMessage, addReply, removeLastReply,
  setSidebarWidth, SIDEBAR_MIN,
} from './store.js';
import { drawReply, playReply } from './reply.js';
import { sampleReply } from './sample.js';

// Tauri exposes its API on window.__TAURI__ ("withGlobalTauri" in tauri.conf.json).
// `open` shows the Mac folder picker and `confirm` a Mac confirmation dialog.
const { open, confirm } = window.__TAURI__.dialog;

const state = load(localStorage);
const sidebar = document.querySelector('#sidebar');
const chat = document.querySelector('#chat');
const resizer = document.querySelector('#resizer');
let playing = null; // the reply that is streaming in right now, if any

// Folder names and messages come from outside the code and are placed into
// innerHTML, so anything that looks like HTML in them has to be neutralised.
function safe(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

// Line icons from the lucide set (lucide.dev), drawn inline so the app needs no
// icon files. Every icon is the same size and takes the colour of its text.
const ICONS = {
  plus: '<path d="M5 12h14M12 5v14"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (name) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// A three-dot button followed by its menu. The menu starts hidden.
function dots(label, menuItems) {
  return `<span class="dots">
    <button class="icon" data-action="menu" aria-haspopup="menu" aria-label="${label}">${icon('dots')}</button>
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
    <span class="label">${icon('chevron')}<span class="text">${safe(project.name)}</span></span>
    <button class="icon" data-action="new-session" data-id="${project.id}"
      aria-label="New session in ${safe(project.name)}">${icon('plus')}</button>
    ${dots('Project options', deleteItem('delete-project', project.id))}
  </span>`;
  return `<li>${dropdown(project.id, summary, sessions.map((s) => sessionRow(s)).join(''), 'No sessions yet')}</li>`;
}

// A section title. `addButton` is an optional icon button on the right.
function heading(text, addButton = '') {
  return `<span class="row heading"><span class="label">${icon('chevron')}${text}</span>${addButton}</span>`;
}

function showOption(value, text) {
  return `<button role="menuitemradio" aria-checked="${state.show === value}"
    data-action="show" data-id="${value}">${text}${state.show === value ? icon('check') : ''}</button>`;
}

function drawSidebar() {
  const projectName = (id) => state.projects.find((project) => project.id === id).name;
  // "All sessions" lists every session; ones inside a project carry its name as a tag.
  const everySession = state.sessions.map((session) =>
    sessionRow(session, session.projectId ? `<span class="tag">${safe(projectName(session.projectId))}</span>` : ''));

  const addProjectButton = `<button class="icon" data-action="new-project" aria-label="Add project">${icon('plus')}</button>`;

  // data-tauri-drag-region lets you move the window by dragging that element.
  sidebar.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    <header class="brand">
      <span class="name">Thorn</span>
      ${dots('View options', `<span class="menu-title">Show</span>
        ${showOption('all', 'All sessions')}
        ${showOption('projects', 'Projects only')}`)}
    </header>
    <button class="row label" data-action="new-session">${icon('plus')}New session</button>
    ${dropdown('projects', heading('Projects', addProjectButton), state.projects.map(projectRow).join(''), 'No projects yet')}
    ${state.show === 'all' ? dropdown('sessions', heading('Sessions'), everySession.join(''), 'No sessions yet') : ''}`;
}

function drawChat() {
  playing?.stop(); // the chat is about to be replaced, so a reply still arriving has nowhere to go
  playing = null;
  const session = state.sessions.find((s) => s.id === state.openSessionId);
  if (!session) {
    chat.innerHTML = `<div class="titlebar" data-tauri-drag-region></div>
      <div class="welcome"><h1>Thorn</h1>
      <p>Start a session to talk with the model, or add a project to work on a folder</p></div>`;
    return;
  }
  const project = state.projects.find((p) => p.id === session.projectId);
  chat.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    <header class="chat-title">
      <span class="text">${safe(session.title)}</span>
      ${project ? `<span class="tag">${safe(project.name)}</span>` : ''}
    </header>
    <ol class="messages">${session.messages.map((m) =>
      (m.from === 'user' ? `<li>${safe(m.text)}</li>` : '<li class="reply"></li>')).join('')}</ol>
    <p class="notice">No model is connected yet, so every reply is the same scripted sample</p>
    <form class="composer">
      <input name="text" placeholder="Message Thorn" autocomplete="off" aria-label="Message">
      <button>Send</button>
    </form>`;
  // Replies are built from elements rather than text, so they fill their <li> after it exists
  const replies = session.messages.filter((m) => m.from === 'assistant');
  chat.querySelectorAll('.reply').forEach((li, i) => {
    const isLast = replies[i] === session.messages.at(-1); // only the latest reply can be retried
    drawReply(li, replies[i], isLast ? () => retry(session) : null);
  });
  const list = chat.querySelector('.messages');
  list.scrollTop = list.scrollHeight;
  chat.querySelector('input').focus();
}

// Streams a reply to the session's latest message into the open chat.
function reply(session) {
  const list = chat.querySelector('.messages');
  const li = document.createElement('li');
  li.className = 'reply';
  list.append(li);
  // Keep the newest words in view as the reply grows, unless the reader has scrolled up
  const stick = () => {
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 200) list.scrollTop = list.scrollHeight;
  };
  const follow = new ResizeObserver(stick); // runs whenever the reply changes size
  follow.observe(li);

  const mine = playReply(li, sampleReply(), () => retry(session));
  playing = mine;
  mine.finished.then((message) => {
    follow.disconnect();
    stick(); // once more, for the buttons that were just added under the reply
    if (!message) return; // cut short, for example by opening another session
    playing = null;
    addReply(state, session.id, message);
    save(localStorage, state);
  });
}

function retry(session) {
  removeLastReply(state, session.id);
  save(localStorage, state);
  drawChat();
  reply(session);
}

// The sidebar's width and whether it is hidden are plain CSS: a variable and a
// class. Nothing needs redrawing when they change.
function applySidebar() {
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebar.width}px`);
  document.body.classList.toggle('sidebar-hidden', state.sidebar.hidden);
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
  if (action === 'toggle-sidebar') {
    state.sidebar.hidden = !state.sidebar.hidden;
    applySidebar();
  }
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
  reply(state.sessions.find((s) => s.id === state.openSessionId));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus();
  if (event.metaKey && event.key === 'b') document.querySelector('#toggle-sidebar').click(); // Cmd+B
});

// Dragging the sidebar's edge. The sidebar starts at the window's left edge, so
// its width is simply how far the pointer is from the left. Below the minimum
// width it stops shrinking and slides off the edge with the pointer instead;
// letting go past the halfway point hides it. While hidden, the edge sits at the
// window's left side, so the same drag pulls the sidebar back out.
resizer.addEventListener('pointerdown', (down) => {
  resizer.setPointerCapture(down.pointerId); // keep receiving moves even if the pointer leaves the thin edge
  let x = down.clientX;
  const drag = (move) => {
    x = move.clientX;
    state.sidebar.hidden = false;
    setSidebarWidth(state, x);
    applySidebar();
    document.body.classList.add('instant'); // follow the pointer exactly, with no animation lag
    const shift = Math.max(-SIDEBAR_MIN, Math.min(0, x - SIDEBAR_MIN));
    document.documentElement.style.setProperty('--sidebar-shift', `${shift}px`);
  };
  resizer.addEventListener('pointermove', drag);
  resizer.addEventListener('pointerup', () => {
    resizer.removeEventListener('pointermove', drag);
    const dragged = document.body.classList.contains('instant');
    document.body.classList.remove('instant');
    document.documentElement.style.removeProperty('--sidebar-shift');
    if (dragged) state.sidebar.hidden = x < SIDEBAR_MIN / 2;
    applySidebar(); // animates from where it was let go to fully hidden or fully shown
    save(localStorage, state);
  }, { once: true });
});

resizer.addEventListener('dblclick', () => {
  state.sidebar.hidden = false;
  setSidebarWidth(state, 280);
  applySidebar();
  save(localStorage, state);
});

// Start in the saved layout without animating into it.
document.body.classList.add('instant');
applySidebar();
requestAnimationFrame(() => document.body.classList.remove('instant'));

drawSidebar();
drawChat();
