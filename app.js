import {
  load, save, createProject, createSession, deleteSession, deleteProject, addMessage,
} from './store.js';

const state = load(localStorage);
let openMenu = null; // id of the open three-dot menu. UI-only, so it is not saved.

const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');

// Names and messages are typed by the user and go into innerHTML, so escape them.
const esc = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function menu(id, items) {
  const open = openMenu === id;
  return `<div class="menu-wrap">
    <button class="icon-btn" data-action="menu" data-id="${id}" aria-haspopup="menu"
      aria-expanded="${open}" aria-label="Options">⋯</button>
    ${open ? `<div class="menu" role="menu">${items}</div>` : ''}
  </div>`;
}

// `where` keeps menu ids unique, because a project session is listed in two places.
function sessionRow(session, where, tag = '') {
  return `<li class="row ${session.id === state.selectedId ? 'selected' : ''}">
    <button class="row-main" data-action="select" data-id="${session.id}">
      <span class="title">${esc(session.title)}</span>${tag}
    </button>
    ${menu(`${where}:${session.id}`,
      `<button role="menuitem" class="danger" data-action="delete-session" data-id="${session.id}">Delete</button>`)}
  </li>`;
}

function toggle(key, label) {
  return `<button class="row-main" data-action="toggle" data-id="${key}"
    aria-expanded="${!state.collapsed[key]}"><span class="chev"></span><span class="title">${label}</span></button>`;
}

function projectItem(project) {
  const sessions = state.sessions.filter((s) => s.projectId === project.id);
  const body = sessions.length
    ? sessions.map((s) => sessionRow(s, 'p')).join('')
    : '<li class="hint">No sessions yet</li>';
  return `<li>
    <div class="row">
      ${toggle(project.id, esc(project.name))}
      <button class="icon-btn" data-action="new-session" data-id="${project.id}"
        aria-label="New session in ${esc(project.name)}">+</button>
      ${menu(`project:${project.id}`,
        `<button role="menuitem" class="danger" data-action="delete-project" data-id="${project.id}">Delete</button>`)}
    </div>
    ${state.collapsed[project.id] ? '' : `<ul class="nested">${body}</ul>`}
  </li>`;
}

function section(key, label, items, emptyHint) {
  return `<section>
    <div class="row head">${toggle(key, label)}</div>
    ${state.collapsed[key] ? '' : `<ul>${items || `<li class="hint">${emptyHint}</li>`}</ul>`}
  </section>`;
}

function filterOption(value, label) {
  return `<button role="menuitemradio" aria-checked="${state.filter === value}"
    data-action="filter" data-id="${value}">${label}</button>`;
}

function renderSidebar() {
  const projectName = (id) => state.projects.find((p) => p.id === id)?.name;
  const allSessions = state.sessions.map((s) =>
    sessionRow(s, 's', s.projectId ? `<span class="tag">${esc(projectName(s.projectId))}</span>` : ''));

  sidebar.innerHTML = `
    <header class="brand">
      <span class="name">Thorn</span>
      ${menu('view', `<div class="menu-label">Show</div>
        ${filterOption('all', 'All sessions')}
        ${filterOption('projects', 'Projects only')}`)}
    </header>
    <div class="actions">
      <button class="row-main" data-action="new-session"><span class="plus" aria-hidden="true">+</span>New session</button>
      <button class="row-main" data-action="new-project"><span class="plus" aria-hidden="true">+</span>New project</button>
    </div>
    ${section('projects', 'Projects', state.projects.map(projectItem).join(''), 'No projects yet')}
    ${state.filter === 'all' ? section('sessions', 'Sessions', allSessions.join(''), 'No sessions yet') : ''}`;
}

function renderMain() {
  const session = state.sessions.find((s) => s.id === state.selectedId);
  if (!session) {
    main.innerHTML = `<div class="empty"><h1>Thorn</h1>
      <p>Start a new session to talk with the model, or a project to work on a folder.</p></div>`;
    return;
  }
  const project = state.projects.find((p) => p.id === session.projectId);
  main.innerHTML = `
    <header class="main-head">${esc(session.title)}${project ? `<span class="tag">${esc(project.name)}</span>` : ''}</header>
    <ol class="messages">${session.messages.map((m) => `<li>${esc(m.text)}</li>`).join('')}</ol>
    <p class="note">No model is connected yet, so messages are saved but not answered.</p>
    <form id="composer">
      <input name="text" placeholder="Message Thorn" autocomplete="off" aria-label="Message">
      <button>Send</button>
    </form>`;
  main.querySelector('input').focus();
}

// A project is named after the folder you pick. Only the name is kept for now:
// reading the folder's files is the harness's job and is not built yet.
// Browsers without a folder picker (Safari, Firefox) ask for a name instead.
async function pickProjectName() {
  if (!window.showDirectoryPicker) return prompt('Project name')?.trim() || null;
  try {
    return (await window.showDirectoryPicker()).name;
  } catch {
    return null; // the user closed the picker
  }
}

// One listener for the whole page (event delegation): the sidebar is rebuilt on
// every change, so listeners attached to individual buttons would be thrown away.
document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-action]');
  const { action, id } = el?.dataset ?? {};
  const selectedBefore = state.selectedId;
  const menuBefore = openMenu;
  openMenu = null; // any click closes the open menu

  if (action === 'menu') openMenu = menuBefore === id ? null : id;
  if (action === 'toggle') state.collapsed[id] = !state.collapsed[id];
  if (action === 'filter') state.filter = id;
  if (action === 'select') state.selectedId = id;
  if (action === 'new-session') createSession(state, id ?? null);
  if (action === 'delete-session') deleteSession(state, id);
  if (action === 'new-project') {
    const name = await pickProjectName();
    if (name) createProject(state, name);
  }
  if (action === 'delete-project') {
    const project = state.projects.find((p) => p.id === id);
    const count = state.sessions.filter((s) => s.projectId === id).length;
    if (confirm(`Delete "${project.name}" and its ${count} session(s)?`)) deleteProject(state, id);
  }

  save(localStorage, state);
  renderSidebar();
  // Leave the main pane alone unless the open session changed, so a half-typed message survives.
  if (state.selectedId !== selectedBefore) renderMain();
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = event.target.elements.text.value.trim();
  if (!text) return;
  addMessage(state, state.selectedId, text);
  save(localStorage, state);
  renderSidebar();
  renderMain();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openMenu) {
    openMenu = null;
    renderSidebar();
  }
});

renderSidebar();
renderMain();
