// App state and the functions that change it. No DOM in here, so it runs in
// Node for tests as well as in the browser.

export const KEY = 'thorn.state';

export function emptyState() {
  return {
    projects: [], // { id, name }
    sessions: [], // { id, title, projectId (null = standalone), messages }
    selectedId: null,
    filter: 'all', // 'all' | 'projects'
    collapsed: {}, // section key or project id -> true when collapsed
  };
}

export function load(storage) {
  try {
    return { ...emptyState(), ...JSON.parse(storage.getItem(KEY)) };
  } catch {
    return emptyState(); // corrupt saved data should not break the app
  }
}

export function save(storage, state) {
  storage.setItem(KEY, JSON.stringify(state));
}

export function createProject(state, name) {
  const project = { id: crypto.randomUUID(), name };
  state.projects.unshift(project);
  return project;
}

export function createSession(state, projectId = null) {
  const session = { id: crypto.randomUUID(), title: 'New session', projectId, messages: [] };
  state.sessions.unshift(session); // newest first
  state.selectedId = session.id;
  if (projectId) delete state.collapsed[projectId]; // make sure the new row is visible
  return session;
}

export function deleteSession(state, id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (state.selectedId === id) state.selectedId = null;
}

// Deleting a project also deletes the sessions inside it.
export function deleteProject(state, id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  state.sessions = state.sessions.filter((s) => s.projectId !== id);
  delete state.collapsed[id];
  if (!state.sessions.some((s) => s.id === state.selectedId)) state.selectedId = null;
}

export function addMessage(state, sessionId, text) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session.messages.length) session.title = text.slice(0, 40); // first message names the session
  session.messages.push({ role: 'user', text });
}
