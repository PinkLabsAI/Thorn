// Draws the window from the data in store.js and reacts to clicks.

import {
  load, save, addProject, addSession, removeSession, removeProject, addMessage, addReply, removeLastReply,
  setSidebarWidth, SIDEBAR_MIN, SIDEBAR_DEFAULT,
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
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
};
// Thorn's own mark: a single thorn, filled with the accent colour.
const MARK = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 20.5C10 18.5 14.5 12 16 3c.8 7 2 12.5 4.5 17.5Z"/></svg>';
const icon = (name) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// A three-dot button followed by its menu. The menu starts hidden.
function dots(label, menuItems) {
  return `<span class="dots">
    <button class="icon" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${label}">${icon('dots')}</button>
    <span class="menu" role="menu" hidden>${menuItems}</span>
  </span>`;
}

function deleteItem(action, id) {
  return `<button role="menuitem" class="danger" data-action="${action}" data-id="${safe(id)}">Delete</button>`;
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
  return `<li class="row" ${session.id === state.openSessionId ? 'aria-current="true"' : ''}>
    <button class="label" data-action="open-session" data-id="${safe(session.id)}">
      <span class="text">${safe(session.title)}</span>
    </button>
    ${dots('Session options', deleteItem('delete-session', session.id))}
  </li>`;
}

function projectRow(project) {
  const sessions = state.sessions.filter((session) => session.projectId === project.id);
  const summary = `<span class="row" title="${safe(project.path)}">
    <span class="label">${icon('chevron')}<span class="text">${safe(project.name)}</span></span>
    <button class="icon" data-action="new-session" data-id="${safe(project.id)}"
      aria-label="New session in ${safe(project.name)}">${icon('plus')}</button>
    ${dots('Project options', deleteItem('delete-project', project.id))}
  </span>`;
  return `<li>${dropdown(project.id, summary, sessions.map((s) => sessionRow(s)).join(''), 'No sessions yet')}</li>`;
}

function drawSidebar() {
  const standalone = state.sessions.filter((session) => !session.projectId);
  sidebar.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    <header class="brand">${MARK}Thorn</header>
    <button class="row label new-session" data-action="new-session">${icon('plus')}New session</button>
    <section class="nav-section" aria-labelledby="projects-label">
      <header class="heading">
        <span id="projects-label">Projects</span>
        <button class="icon" data-action="new-project" aria-label="Add project" title="Add project">${icon('plus')}</button>
      </header>
      <ul>${state.projects.length ? state.projects.map(projectRow).join('') : '<li class="empty-row">No projects yet</li>'}</ul>
    </section>
    ${standalone.length ? `<section class="nav-section" aria-labelledby="sessions-label">
      <header class="heading" id="sessions-label">Sessions</header>
      <ul>${standalone.map(sessionRow).join('')}</ul>
    </section>` : ''}`;
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
    <textarea name="text" rows="2" placeholder="Message Thorn" aria-label="Message Thorn"></textarea>
    <div class="composer-toolbar">
      ${context}
      <button class="send-button" aria-label="Send message" title="Send message" disabled>${icon('send')}</button>
    </div>
  </form>
  <p class="notice">Demo mode. Replies are scripted until a model is connected.</p>`;
}

function drawChat() {
  playing?.stop(); // the chat is about to be replaced, so a reply still arriving has nowhere to go
  playing = null;
  const session = state.sessions.find((s) => s.id === state.openSessionId);
  const project = state.projects.find((p) => p.id === session?.projectId);
  const hasMessages = Boolean(session?.messages.length);
  chat.innerHTML = `
    <div class="titlebar" data-tauri-drag-region></div>
    ${hasMessages ? `
      <header class="chat-title"><span class="text">${safe(session.title)}</span></header>
      <ol class="messages">${session.messages.map((m) =>
        (m.from === 'user' ? `<li>${safe(m.text)}</li>` : '<li class="reply"></li>')).join('')}</ol>
      <div class="compose-dock">${composer(project, true)}</div>
    ` : `
      <div class="welcome">
        ${MARK}<h1>What are we working on?</h1>
        ${composer(project, false)}
      </div>
    `}`;
  // Replies are built from elements rather than text, so they fill their <li> after it exists
  const replies = session?.messages.filter((m) => m.from === 'assistant') ?? [];
  chat.querySelectorAll('.reply').forEach((li, i) => {
    const isLast = replies[i] === session.messages.at(-1); // only the latest reply can be retried
    drawReply(li, replies[i], isLast ? () => retry(session) : null);
  });
  const list = chat.querySelector('.messages');
  if (list) list.scrollTop = list.scrollHeight;
  chat.querySelector('textarea').focus({ preventScroll: true });
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
  updateComposer(chat.querySelector('form'));
  mine.finished.then((message) => {
    follow.disconnect();
    stick(); // once more, for the buttons that were just added under the reply
    if (!message) return; // cut short, for example by opening another session
    playing = null;
    updateComposer(chat.querySelector('form'));
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
    if (menu === except) continue;
    menu.hidden = true;
    menu.previousElementSibling.setAttribute('aria-expanded', 'false');
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
    button.setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }

  const openBefore = state.openSessionId;
  if (action === 'toggle-sidebar') {
    state.sidebar.hidden = !state.sidebar.hidden;
    applySidebar();
  }
  if (action === 'open-session') state.openSessionId = id;
  if (action === 'new-session') addSession(state, id ?? null);
  if (action === 'delete-session') removeSession(state, id);
  if (action === 'new-project') {
    const folder = await open({ directory: true, title: 'Choose a project folder' });
    if (folder && !state.projects.some((p) => p.path === folder)) addProject(state, folder);
  }
  if (action === 'delete-project') {
    const project = state.projects.find((p) => p.id === id);
    const count = state.sessions.filter((session) => session.projectId === id).length;
    const question = `Delete "${project.name}" and its ${count} session(s)? The folder itself is not touched.`;
    if (await confirm(question, { title: 'Delete project', kind: 'warning' })) removeProject(state, id);
  }

  save(localStorage, state);
  drawSidebar();
  if (state.openSessionId !== openBefore) drawChat();
  else if (action === 'new-project' || action === 'delete-project') {
    const picker = chat.querySelector('.project-picker');
    if (picker) {
      const selected = state.projects.find((p) => p.id === picker.querySelector('select').value);
      const form = picker.closest('form');
      const draft = form.elements.text.value;
      drawChat();
      const fresh = chat.querySelector('form');
      fresh.elements.project.value = selected?.id ?? '';
      fresh.elements.project.dataset.selected = fresh.elements.project.value;
      fresh.elements.text.value = draft;
      updateComposer(fresh);
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
  form.querySelector('.send-button').disabled = !field.value.trim() || Boolean(playing);
}

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

drawSidebar();
drawChat();
