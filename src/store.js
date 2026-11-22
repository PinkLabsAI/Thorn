// Thorn's data and the only functions allowed to change it.
// Nothing here touches the window, so the tests can run it with plain Node.

export const STORAGE_KEY = 'thorn';

export function newState() {
  return {
    projects: [], // { id, name, path } - a folder on this Mac
    sessions: [], // { id, title, projectId, messages, updatedAt } - projectId is null for a standalone session
    openSessionId: null,
    closed: {}, // dropdown key -> true when the user collapsed it
    sidebar: { width: SIDEBAR_DEFAULT, hidden: false },
    theme: 'system', // 'system' follows the Mac's appearance; 'light' and 'dark' override it
  };
}

export const SIDEBAR_DEFAULT = 240;
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
  const name = path.split('/').filter(Boolean).pop() ?? path;
  const project = { id: crypto.randomUUID(), name, path };
  state.projects.unshift(project);
  return project;
}

// Opens a fresh session. An empty one in the same place is reused, so asking
// for a new session twice does not leave a blank one behind.
export function addSession(state, projectId = null) {
  let session = state.sessions.find((s) => !s.messages.length && s.projectId === projectId);
  if (!session) {
    session = { id: crypto.randomUUID(), title: 'New session', projectId, messages: [] };
    state.sessions.unshift(session);
  }
  session.updatedAt = Date.now();
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
  session.updatedAt = Date.now();
}

// The session may be gone by the time its reply ends, if it was deleted mid-reply.
export function addReply(state, sessionId, reply) {
  state.sessions.find((s) => s.id === sessionId)?.messages.push(reply);
}

// Editing an earlier message throws away it and everything after it.
export function cutMessages(state, sessionId, index) {
  state.sessions.find((s) => s.id === sessionId).messages.length = index;
}

// A blank name is ignored, so a session can never end up with no title.
export function renameSession(state, id, title) {
  const session = state.sessions.find((s) => s.id === id);
  if (session && title.trim()) session.title = title.trim();
}

// Most recently used first. Sessions saved before updatedAt existed sort last.
export const byRecent = (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

// Splits sessions into "Today", "Yesterday", "Previous 7 days" and "Older",
// leaving out the groups that would be empty.
export function groupByDay(sessions, now = Date.now()) {
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date(now).setHours(0, 0, 0, 0); // midnight this morning
  const groups = [['Today', today], ['Yesterday', today - DAY], ['Previous 7 days', today - 7 * DAY], ['Older', -Infinity]]
    .map(([label, from]) => ({ label, from, sessions: [] }));
  for (const session of [...sessions].sort(byRecent)) {
    groups.find((group) => (session.updatedAt ?? 0) >= group.from).sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length).map(({ label, sessions: list }) => ({ label, sessions: list }));
}

// Sessions whose title or any message contains `query`, most recent first.
// Empty sessions are left out: there is nothing in them to find.
export function searchSessions(state, query) {
  const q = query.trim().toLowerCase();
  const has = (text) => text.toLowerCase().includes(q);
  return state.sessions
    .filter((s) => s.messages.length && (has(s.title) || s.messages.some((m) => has(m.text))))
    .sort(byRecent);
}

// Retrying throws away the latest reply so a new one can take its place.
export function removeLastReply(state, sessionId) {
  const { messages } = state.sessions.find((s) => s.id === sessionId);
  if (messages.at(-1)?.from === 'assistant') messages.pop();
}
