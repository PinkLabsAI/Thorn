// Draws the window from the data in store.js and reacts to clicks.

import {
  load, save, addProject, addSession, removeSession, removeProject, addMessage, addReply, removeLastReply,
  cutMessages, renameSession, byRecent, groupByDay, searchSessions,
  setSidebarWidth, SIDEBAR_MIN, SIDEBAR_DEFAULT,
} from './store.js';
import { drawReply, playReply } from './reply.js';
import { sampleReply } from './sample.js';

// Tauri exposes its API on window.__TAURI__ ("withGlobalTauri" in tauri.conf.json).
// `open` shows the Mac folder picker, `confirm` a Mac confirmation dialog, and
// `openUrl` hands a web address to the default browser.
const { open, confirm } = window.__TAURI__.dialog;
const { openUrl } = window.__TAURI__.opener;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const state = load(localStorage);
const sidebar = document.querySelector('#sidebar');
const chat = document.querySelector('#chat');
const resizer = document.querySelector('#resizer');
const searchBox = document.querySelector('#search');
const toast = document.querySelector('#toast');
const UNDO_MS = 6000;

let playing = null; // { run, session } for the reply that is streaming in right now, if any
let shownId = null; // the session the chat is showing, so its half-typed message can be kept
const drafts = new Map(); // session id -> text typed but not sent. Kept only while the app is open
let editing = null; // position of the sent message being edited, if any
let renamingId = null; // the session whose title is being typed over in the sidebar
let undo = null; // what the data looked like before the latest delete
let undoTimer;

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
  compose: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  stop: '<rect width="12" height="12" x="6" y="6" rx="2" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  down: '<path d="M12 5v14m6-6-6 6-6-6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
};
const icon = (name) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// A three-dot button followed by its menu. The menu starts hidden.
function dots(label, menuItems) {
  return `<span class="dots">
    <button class="icon" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${label}">${icon('dots')}</button>
    <span class="menu" role="menu" hidden>${menuItems}</span>
  </span>`;
}

function menuItem(text, action, id, danger = false) {
  return `<button role="menuitem" ${danger ? 'class="danger"' : ''} data-action="${action}" data-id="${safe(id)}">${text}</button>`;
}

// <details>/<summary> is the browser's built-in dropdown: it opens and closes
// on its own, so the only code needed is remembering which ones are closed.
function dropdown(key, summary, items, emptyText) {
  return `<details data-key="${safe(key)}" ${state.closed[key] ? '' : 'open'}>
    <summary>${summary}</summary>
    <ul>${items || `<li class="empty-row">${emptyText}</li>`}</ul>
  </details>`;
}

function sessionRow(session) {
  const current = session.id === state.openSessionId ? 'aria-current="true"' : '';
  if (session.id === renamingId) {
    return `<li class="row" ${current}><input class="rename" value="${safe(session.title)}" aria-label="Session name"></li>`;
  }
  return `<li class="row" ${current}>
    <button class="label" data-action="open-session" data-id="${safe(session.id)}">
      <span class="text">${safe(session.title)}</span>
    </button>
    ${dots('Session options', menuItem('Rename', 'rename-session', session.id) + menuItem('Delete', 'delete-session', session.id, true))}
  </li>`;
}

function projectRow(project) {
  const sessions = state.sessions.filter((session) => session.projectId === project.id).sort(byRecent);
  const summary = `<span class="row" title="${safe(project.path)}">
    <span class="label">${icon('folder')}${icon('chevron')}<span class="text">${safe(project.name)}</span></span>
    <button class="icon" data-action="new-session" data-id="${safe(project.id)}"
      aria-label="New session in ${safe(project.name)}">${icon('plus')}</button>
    ${dots('Project options', menuItem('Delete', 'delete-project', project.id, true))}
  </span>`;
  return `<li>${dropdown(project.id, summary, sessions.map((s) => sessionRow(s)).join(''), 'No sessions yet')}</li>`;
}

// One choice in the Appearance list. The current one carries a tick.
function themeOption(value, text) {
  const chosen = state.theme === value;
  return `<button role="menuitemradio" aria-checked="${chosen}" data-action="theme" data-id="${value}">${text}${chosen ? icon('check') : ''}</button>`;
}

function drawSidebar() {
  const standalone = state.sessions.filter((session) => !session.projectId);
  sidebar.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    <div class="scroll">
    <header class="brand">Thorn</header>
    <button class="row label new-session" data-action="new-session">${icon('compose')}New session</button>
    <button class="row label" data-action="search">${icon('search')}Search</button>
    <section class="nav-section" aria-labelledby="projects-label">
      <header class="heading">
        <span id="projects-label">Projects</span>
        <button class="icon" data-action="new-project" aria-label="Add project" title="Add project">${icon('plus')}</button>
      </header>
      <ul>${state.projects.length ? state.projects.map(projectRow).join('') : '<li class="empty-row">No projects yet</li>'}</ul>
    </section>
    ${standalone.length ? `<section class="nav-section" aria-labelledby="sessions-label">
      <header class="heading" id="sessions-label">Sessions</header>
      ${groupByDay(standalone).map((group) => `<p class="day">${group.label}</p>
      <ul>${group.sessions.map(sessionRow).join('')}</ul>`).join('')}
    </section>` : ''}
    </div>
    <footer class="foot">
      <button class="icon" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Settings" title="Settings">${icon('settings')}</button>
      <span class="menu" role="menu" hidden>
        <span class="menu-title">Appearance</span>
        ${themeOption('system', 'System')}
        ${themeOption('light', 'Light')}
        ${themeOption('dark', 'Dark')}
      </span>
    </footer>`;
}

function composer(project, hasMessages) {
  const context = hasMessages
    ? (project ? `<span class="composer-context">${icon('folder')}<span class="text">${safe(project.name)}</span></span>` : '')
    : `<label class="project-picker" title="Choose a project">
        ${icon('folder')}
        <select name="project" aria-label="Choose project">
          <option value="">No project</option>
          ${state.projects.map((p) => `<option value="${safe(p.id)}" ${p.id === project?.id ? 'selected' : ''}>${safe(p.name)}</option>`).join('')}
          <option value="add-project">Add project…</option>
        </select>
      </label>`;
  return `<form class="composer">
    <p class="editing" hidden>Editing your message. Sending replaces it and everything after it.
      <button type="button" data-chat="cancel-edit">Cancel</button></p>
    <textarea name="text" rows="2" placeholder="Message Thorn" aria-label="Message Thorn"></textarea>
    <div class="composer-toolbar">
      ${context}
      <button class="send-button" aria-label="Send message" title="Send message" disabled>${icon('send')}</button>
    </div>
  </form>
  <p class="notice">Demo mode, replies are scripted until a model is connected</p>`;
}

// Ends the reply that is arriving, keeping what has arrived so far.
function endReply() {
  if (!playing) return;
  const { run, session } = playing;
  playing = null;
  addReply(state, session.id, run.stop());
  save(localStorage, state);
}

const nearEnd = (list) => list.scrollHeight - list.scrollTop - list.clientHeight < 200;

function userMessage(message, index) {
  return `<li class="mine" data-index="${index}">
    <div class="bubble">${safe(message.text)}</div>
    <div class="actions">
      <button class="icon" data-chat="copy" aria-label="Copy" title="Copy">${icon('copy')}</button>
      <button class="icon" data-chat="edit" aria-label="Edit" title="Edit">${icon('pencil')}</button>
    </div>
  </li>`;
}

function drawChat() {
  endReply(); // the chat is about to be replaced, so a reply still arriving has nowhere to go
  const typed = chat.querySelector('textarea');
  if (typed && editing === null) drafts.set(shownId, typed.value);
  editing = null;
  const session = state.sessions.find((s) => s.id === state.openSessionId);
  const project = state.projects.find((p) => p.id === session?.projectId);
  const hasMessages = Boolean(session?.messages.length);
  shownId = session?.id ?? null;
  chat.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    ${hasMessages ? `
      <header class="chat-title"><span class="text">${safe(session.title)}</span></header>
      <ol class="messages">${session.messages.map((m, index) =>
        (m.from === 'user' ? userMessage(m, index) : '<li class="reply"></li>')).join('')}</ol>
      <div class="compose-dock">
        <button class="jump" data-chat="jump" aria-label="Jump to latest" title="Jump to latest" hidden>${icon('down')}</button>
        ${composer(project, true)}
      </div>
    ` : `
      <div class="welcome">
        <h1>New session</h1>
        <p class="lede">Ask a model to work in a folder on this Mac</p>
        ${composer(project, false)}
        <p class="keys">
          <span><kbd>↵</kbd>send</span>
          <span><kbd>⇧</kbd><kbd>↵</kbd>new line</span>
          <span><kbd>⌘</kbd><kbd>N</kbd>new session</span>
          <span><kbd>⌘</kbd><kbd>K</kbd>search</span>
          <span><kbd>⌘</kbd><kbd>B</kbd>sidebar</span>
        </p>
      </div>
    `}`;
  // Replies are built from elements rather than text, so they fill their <li> after it exists
  const replies = session?.messages.filter((m) => m.from === 'assistant') ?? [];
  chat.querySelectorAll('.reply').forEach((li, i) => {
    const isLast = replies[i] === session.messages.at(-1); // only the latest reply can be retried
    drawReply(li, replies[i], isLast ? () => retry(session) : null);
  });
  const list = chat.querySelector('.messages');
  if (list) {
    // A message whose reply never got saved (the app was closed mid-reply) can still be retried
    if (session.messages.at(-1).from === 'user') {
      const li = document.createElement('li');
      li.className = 'reply unanswered';
      drawReply(li, { text: '', sources: [], error: 'This message never got a reply.' }, () => retry(session));
      list.append(li);
    }
    list.scrollTop = list.scrollHeight;
    const jump = chat.querySelector('.jump');
    list.addEventListener('scroll', () => { jump.hidden = nearEnd(list); });
  }
  const field = chat.querySelector('textarea');
  field.value = drafts.get(shownId) ?? '';
  updateComposer(field.form);
  field.focus({ preventScroll: true });
}

// Streams a reply to the session's latest message into the open chat.
function reply(session) {
  const list = chat.querySelector('.messages');
  list.querySelector('.unanswered')?.remove();
  const li = document.createElement('li');
  li.className = 'reply';
  list.append(li);
  // Keep the newest words in view as the reply grows, unless the reader has scrolled up
  const stick = () => {
    if (nearEnd(list)) list.scrollTop = list.scrollHeight;
  };
  const follow = new ResizeObserver(stick); // runs whenever the reply changes size
  follow.observe(li);

  const asked = session.messages.findLast((m) => m.from === 'user').text;
  const run = playReply(li, sampleReply(asked), () => retry(session));
  playing = { run, session };
  updateComposer(chat.querySelector('form'));
  run.finished.then((message) => {
    follow.disconnect();
    if (playing?.run !== run) return; // already ended, by Stop or by leaving the session
    stick(); // once more, for the buttons that were just added under the reply
    playing = null;
    addReply(state, session.id, message);
    save(localStorage, state);
    updateComposer(chat.querySelector('form'));
  });
}

function retry(session) {
  removeLastReply(state, session.id);
  save(localStorage, state);
  drawChat();
  reply(session);
}

// Puts a sent message back in the composer to be changed, or (with null) stops editing.
function setEditing(index) {
  const form = chat.querySelector('form');
  const field = form.elements.text;
  if (editing === null) drafts.set(shownId, field.value); // set the half-typed message aside
  editing = index;
  form.querySelector('.editing').hidden = index === null;
  for (const li of chat.querySelectorAll('.mine')) li.classList.toggle('being-edited', Number(li.dataset.index) === index);
  const session = state.sessions.find((s) => s.id === shownId);
  field.value = index === null ? drafts.get(shownId) ?? '' : session.messages[index].text;
  updateComposer(form);
  field.focus();
}

// Shows "Undo" for a few seconds after a delete. `before` is the data as it was.
function offerUndo(text, before) {
  undo = before;
  toast.innerHTML = `${safe(text)}<button data-action="undo">Undo</button>`;
  toast.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(dropUndo, UNDO_MS);
}

function dropUndo() {
  undo = null;
  toast.hidden = true;
}

// Deleting replaces these lists rather than changing them, so keeping the old
// lists is enough to put everything back.
const snapshot = () => ({ projects: state.projects, sessions: state.sessions, openSessionId: state.openSessionId });

function drawSearch() {
  const found = searchSessions(state, searchBox.querySelector('input').value);
  const where = (session) => state.projects.find((p) => p.id === session.projectId)?.name ?? '';
  searchBox.querySelector('ul').innerHTML = found.map((session, i) => `<li>
    <button class="row label" data-action="open-session" data-id="${safe(session.id)}" aria-selected="${i === 0}">
      <span class="text">${safe(session.title)}</span><span class="where">${safe(where(session))}</span>
    </button>
  </li>`).join('') || '<li class="empty-row">No sessions found</li>';
}

function openSearch() {
  if (searchBox.open) return;
  searchBox.querySelector('input').value = '';
  drawSearch();
  searchBox.showModal();
}

// Ends renaming, keeping the typed name or not.
function finishRename(input, keep) {
  if (!renamingId) return; // already finished: removing the box also makes it lose focus
  if (keep) renameSession(state, renamingId, input.value);
  renamingId = null;
  save(localStorage, state);
  drawSidebar();
  const title = chat.querySelector('.chat-title .text');
  const session = state.sessions.find((s) => s.id === shownId);
  if (title && session) title.textContent = session.title;
}

// The sidebar's width and whether it is hidden are plain CSS: a variable and a
// class. Nothing needs redrawing when they change.
function applySidebar() {
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebar.width}px`);
  document.body.classList.toggle('sidebar-hidden', state.sidebar.hidden);
}

// Asks the Mac to draw the window light or dark. Passing null hands the choice
// back to the Mac's own appearance setting. The stylesheet needs no second set
// of colours for this: it already follows whichever appearance the window has.
function applyTheme() {
  appWindow.setTheme(state.theme === 'system' ? null : state.theme);
}

function closeMenus(except = null) {
  for (const menu of document.querySelectorAll('.menu')) {
    if (menu === except) continue;
    menu.hidden = true;
    menu.previousElementSibling.setAttribute('aria-expanded', 'false');
  }
}

// One click listener for the whole window (event delegation). The sidebar's HTML
// is replaced on every change, which would throw away listeners on single buttons.
document.addEventListener('click', async (event) => {
  // Links never load inside the app's own window. Web addresses open in the browser.
  const link = event.target.closest('a[href]');
  if (link) {
    event.preventDefault();
    if (/^https?:/.test(link.href)) openUrl(link.href);
    return;
  }
  const button = event.target.closest('[data-action]');
  const { action, id } = button?.dataset ?? {};
  const menu = action === 'menu' ? button.nextElementSibling : null;
  closeMenus(menu); // a click anywhere closes every other menu
  if (!button) return;

  event.preventDefault(); // buttons inside a <summary> must not also toggle the dropdown
  if (menu) {
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }

  if (action === 'search') return openSearch();
  if (action === 'rename-session') {
    renamingId = id;
    drawSidebar();
    const input = sidebar.querySelector('.rename');
    input.focus();
    input.select();
    return;
  }

  const openBefore = state.openSessionId;
  const before = snapshot();
  let restored = false;
  if (action === 'undo') {
    Object.assign(state, undo);
    restored = true;
  }
  dropUndo(); // doing anything else means the delete stands
  if (action === 'toggle-sidebar') {
    state.sidebar.hidden = !state.sidebar.hidden;
    applySidebar();
  }
  if (action === 'theme') {
    state.theme = id;
    applyTheme();
  }
  if (action === 'open-session') {
    state.openSessionId = id;
    searchBox.close();
  }
  if (action === 'new-session') addSession(state, id ?? null);
  if (action === 'delete-session') {
    removeSession(state, id);
    offerUndo('Session deleted', before);
  }
  if (action === 'new-project') {
    const folder = await open({ directory: true, title: 'Choose a project folder' });
    if (folder && !state.projects.some((p) => p.path === folder)) addProject(state, folder);
  }
  if (action === 'delete-project') {
    const project = state.projects.find((p) => p.id === id);
    const count = state.sessions.filter((session) => session.projectId === id).length;
    const question = `Delete "${project.name}" and its ${count} session(s)? The folder itself is not touched.`;
    if (await confirm(question, { title: 'Delete project', kind: 'warning' })) {
      removeProject(state, id);
      offerUndo('Project deleted', before);
    }
  }

  save(localStorage, state);
  drawSidebar();
  if (state.openSessionId !== openBefore || restored) drawChat();
  else if (action === 'new-project' || action === 'delete-project') {
    const picker = chat.querySelector('.project-picker');
    if (picker) {
      const selected = state.projects.find((p) => p.id === picker.querySelector('select').value);
      drawChat(); // keeps the half-typed message, but not the picker's choice
      const fresh = chat.querySelector('form');
      fresh.elements.project.value = selected?.id ?? '';
      fresh.elements.project.dataset.selected = fresh.elements.project.value;
    }
  }
});

// "toggle" fires when a dropdown opens or closes. It does not bubble, so the
// third argument (capture) is what lets one listener on the document see it.
document.addEventListener('toggle', (event) => {
  const key = event.target.dataset?.key;
  if (!key) return;
  state.closed[key] = !event.target.open;
  save(localStorage, state);
}, true);

function updateComposer(form) {
  const field = form.elements.text;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
  // While a reply is arriving, the send button becomes a stop button
  const button = form.querySelector('.send-button');
  const label = playing ? 'Stop' : 'Send message';
  button.type = playing ? 'button' : 'submit';
  button.dataset.chat = playing ? 'stop' : '';
  button.innerHTML = icon(playing ? 'stop' : 'send');
  button.title = label;
  button.ariaLabel = label;
  button.disabled = !playing && !field.value.trim();
}

// Buttons inside the chat that change nothing in the sidebar.
chat.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chat]');
  const action = button?.dataset.chat;
  const mine = button?.closest('.mine');
  if (action === 'stop') {
    event.preventDefault(); // the button is about to turn back into Send, and this click must not send
    endReply();
    updateComposer(chat.querySelector('form'));
  }
  if (action === 'jump') {
    const list = chat.querySelector('.messages');
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }
  if (action === 'copy') {
    navigator.clipboard.writeText(mine.querySelector('.bubble').textContent);
    button.innerHTML = icon('check');
    setTimeout(() => { button.innerHTML = icon('copy'); }, 1600);
  }
  if (action === 'edit' && !playing) setEditing(Number(mine.dataset.index));
  if (action === 'cancel-edit') setEditing(null);
});

sidebar.addEventListener('keydown', (event) => {
  if (!event.target.matches('.rename')) return;
  if (event.key === 'Enter') finishRename(event.target, true);
  if (event.key === 'Escape') finishRename(event.target, false);
});
sidebar.addEventListener('focusout', (event) => {
  if (event.target.matches('.rename')) finishRename(event.target, true);
});

searchBox.addEventListener('input', drawSearch);
searchBox.addEventListener('click', (event) => {
  if (event.target === searchBox) searchBox.close(); // a click on the dimmed area around the box
});
// Up and down move the highlight through the results, and Enter opens the highlighted one.
searchBox.addEventListener('keydown', (event) => {
  const rows = [...searchBox.querySelectorAll('[data-action]')];
  const at = rows.findIndex((row) => row.ariaSelected === 'true');
  if (event.key === 'Enter') rows[at]?.click();
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step || !rows.length) return;
  event.preventDefault();
  const next = rows[(at + step + rows.length) % rows.length];
  rows[at].ariaSelected = 'false';
  next.ariaSelected = 'true';
  next.scrollIntoView({ block: 'nearest' });
});

chat.addEventListener('input', (event) => {
  if (event.target.matches('textarea')) updateComposer(event.target.form);
});

chat.addEventListener('change', async (event) => {
  const picker = event.target;
  if (picker.name !== 'project') return;
  if (picker.value === 'add-project') {
    const previous = picker.dataset.selected ?? picker.querySelector('option[selected]')?.value ?? '';
    picker.value = previous;
    const folder = await open({ directory: true, title: 'Choose a project folder' });
    if (!folder) return;
    const project = state.projects.find((p) => p.path === folder) ?? addProject(state, folder);
    save(localStorage, state);
    drawSidebar();
    if (!picker.isConnected) return;
    if (![...picker.options].some((option) => option.value === project.id)) {
      picker.add(new Option(project.name, project.id), picker.options.length - 1);
    }
    picker.value = project.id;
  }
  picker.dataset.selected = picker.value;
});

chat.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const text = form.elements.text.value.trim();
  if (!text || playing) return;
  const project = state.projects.find((p) => p.id === form.elements.project?.value);
  const session = state.sessions.find((s) => s.id === state.openSessionId) ?? addSession(state, project?.id);
  if (!session.messages.length) {
    session.projectId = project?.id ?? null;
    if (project) delete state.closed[project.id];
  }
  // An edit replaces the old message; drawChat then brings back whatever was half-typed before it.
  // Otherwise the text was just sent, so it is no longer a half-typed message to keep.
  if (editing !== null) cutMessages(state, session.id, editing);
  else form.elements.text.value = '';
  dropUndo();
  addMessage(state, session.id, text);
  save(localStorage, state);
  drawSidebar();
  drawChat();
  reply(session);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.querySelector('.menu:not([hidden])')?.previousElementSibling.focus();
    closeMenus();
    if (editing !== null) setEditing(null);
  }
  if (event.metaKey && event.key === 'n') {
    event.preventDefault();
    sidebar.querySelector('.new-session').click();
  }
  if (event.metaKey && event.key === 'k') {
    event.preventDefault();
    openSearch();
  }
  if (event.metaKey && event.key === 'b') {
    event.preventDefault();
    document.querySelector('#toggle-sidebar').click();
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target.matches('.composer textarea')) {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
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
    const shift = Math.max(-SIDEBAR_MIN, Math.min(0, x - SIDEBAR_MIN));
    document.documentElement.style.setProperty('--sidebar-shift', `${shift}px`);
  };
  resizer.addEventListener('pointermove', drag);
  resizer.addEventListener('lostpointercapture', () => {
    resizer.removeEventListener('pointermove', drag);
    document.documentElement.style.removeProperty('--sidebar-shift');
    state.sidebar.hidden = x < SIDEBAR_MIN / 2;
    applySidebar();
    save(localStorage, state);
  }, { once: true });
});

resizer.addEventListener('dblclick', () => {
  state.sidebar.hidden = false;
  setSidebarWidth(state, SIDEBAR_DEFAULT);
  applySidebar();
  save(localStorage, state);
});

applySidebar();
if (state.theme !== 'system') applyTheme();

drawSidebar();
drawChat();
