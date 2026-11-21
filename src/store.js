// Thorn's data and the only functions allowed to change it.
// Nothing here touches the window, so the tests can run it with plain Node.

export const STORAGE_KEY = 'thorn';

export function newState() {
  return {
    projects: [], // { id, name, path } - a folder on this Mac
    sessions: [], // { id, title, projectId, messages } - projectId is null for a standalone session
    openSessionId: null,
    show: 'all', // sidebar filter: 'all' or 'projects'
    closed: {}, // dropdown key -> true when the user collapsed it
    sidebar: { width: 280, hidden: false },
  };
}

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 480;

// The sidebar can be dragged wider or narrower, within sensible limits.
export function setSidebarWidth(state, width) {
  state.sidebar.width = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}

export function load(storage) {
  try {
    return { ...newState(), ...JSON.parse(storage.getItem(STORAGE_KEY)) };
  } catch {
    return newState(); // unreadable saved data should not stop the app from opening
  }
}

export function save(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// A project is a folder, and takes the folder's name.
export function addProject(state, path) {
  const name = path.split('/').filter(Boolean).pop();
  const project = { id: crypto.randomUUID(), name, path };
  state.projects.unshift(project);
  return project;
}

export function addSession(state, projectId = null) {
  const session = { id: crypto.randomUUID(), title: 'New session', projectId, messages: [] };
  state.sessions.unshift(session); // newest first
  state.openSessionId = session.id;
  if (projectId) delete state.closed[projectId]; // reopen the project so the new session shows
  return session;
}

export function removeSession(state, id) {
  state.sessions = state.sessions.filter((session) => session.id !== id);
  if (state.openSessionId === id) state.openSessionId = null;
}

// Removing a project removes its sessions too. The folder on disk is never touched.
export function removeProject(state, id) {
  state.projects = state.projects.filter((project) => project.id !== id);
  state.sessions = state.sessions.filter((session) => session.projectId !== id);
  delete state.closed[id];
  const stillThere = state.sessions.some((session) => session.id === state.openSessionId);
  if (!stillThere) state.openSessionId = null;
}

export function addMessage(state, sessionId, text) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (session.messages.length === 0) session.title = text.slice(0, 40); // the first message names the session
  session.messages.push({ from: 'user', text });
}

export function addReply(state, sessionId, reply) {
  state.sessions.find((s) => s.id === sessionId).messages.push(reply);
}

// Retrying throws away the latest reply so a new one can take its place.
export function removeLastReply(state, sessionId) {
  const { messages } = state.sessions.find((s) => s.id === sessionId);
  if (messages.at(-1)?.from === 'assistant') messages.pop();
}
