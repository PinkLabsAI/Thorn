import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, newState, load, addProject, addSession, removeSession, removeProject, addMessage, addReply, removeLastReply,
  cutMessages, renameSession, groupByDay, searchSessions,
  setSidebarWidth,
} from '../src/store.js';

test('a project is named after its folder', () => {
  const project = addProject(newState(), '/Users/me/code/webcrawler/');
  assert.equal(project.name, 'webcrawler');
  assert.equal(project.path, '/Users/me/code/webcrawler/');
});

test('removing a project removes its sessions and keeps the others', () => {
  const state = newState();
  const project = addProject(state, '/Users/me/code/thorn');
  const standalone = addSession(state);
  addSession(state, project.id); // this one is open, and is about to go

  removeProject(state, project.id);

  assert.deepEqual(state.projects, []);
  assert.deepEqual(state.sessions, [standalone]);
  assert.equal(state.openSessionId, null);
});

test('removing a session closes it only if it was the open one', () => {
  const state = newState();
  const first = addSession(state);
  addMessage(state, first.id, 'hello'); // an empty session would be reused instead of joined by a second
  const second = addSession(state); // open

  removeSession(state, first.id);
  assert.equal(state.openSessionId, second.id);

  removeSession(state, second.id);
  assert.equal(state.openSessionId, null);
});

test('adding a session to a collapsed project reopens the project', () => {
  const state = newState();
  const project = addProject(state, '/Users/me/code/thorn');
  state.closed[project.id] = true;

  addSession(state, project.id);

  assert.equal(project.id in state.closed, false);
});

test('only the first message names the session', () => {
  const state = newState();
  const session = addSession(state);

  addMessage(state, session.id, 'Explain closures');
  addMessage(state, session.id, 'Now with an example');

  assert.equal(session.title, 'Explain closures');
  assert.equal(session.messages.length, 2);
});

test('the sidebar width stays between its limits', () => {
  const state = newState();

  setSidebarWidth(state, 50);
  assert.equal(state.sidebar.width, 220);

  setSidebarWidth(state, 2000);
  assert.equal(state.sidebar.width, 480);

  setSidebarWidth(state, 333.4);
  assert.equal(state.sidebar.width, 333);
});

test('load starts fresh when saved data is missing or unreadable', () => {
  const storageHolding = (value) => ({ getItem: (key) => (key === STORAGE_KEY ? value : null) });

  assert.deepEqual(load(storageHolding(null)), newState());
  assert.deepEqual(load(storageHolding('{not json')), newState());
});

test('retrying removes the latest reply but never a message the user wrote', () => {
  const state = newState();
  const session = addSession(state);
  addMessage(state, session.id, 'Explain closures');
  addReply(state, session.id, { from: 'assistant', text: 'A closure is…' });

  removeLastReply(state, session.id);
  removeLastReply(state, session.id);

  assert.deepEqual(session.messages, [{ from: 'user', text: 'Explain closures' }]);
});

test('saved data from before a setting existed still gets that setting', () => {
  const storage = { getItem: () => JSON.stringify({ projects: [], sessions: [] }) };
  assert.equal(load(storage).theme, 'system');
});

test('asking for a new session twice reuses the empty one', () => {
  const state = newState();
  const first = addSession(state);
  assert.equal(addSession(state), first);
  addMessage(state, first.id, 'hello');
  assert.notEqual(addSession(state), first);
  assert.equal(state.sessions.length, 2);
});

test('a reply for a session that was deleted meanwhile is dropped', () => {
  const state = newState();
  const session = addSession(state);
  removeSession(state, session.id);
  addReply(state, session.id, { from: 'assistant', text: 'late' }); // must not throw
  assert.deepEqual(state.sessions, []);
});

test('editing a message removes it and everything after it', () => {
  const state = newState();
  const session = addSession(state);
  addMessage(state, session.id, 'one');
  addReply(state, session.id, { from: 'assistant', text: 'reply' });
  addMessage(state, session.id, 'two');
  cutMessages(state, session.id, 2);
  assert.deepEqual(session.messages.map((m) => m.text), ['one', 'reply']);
});

test('renaming trims the name and ignores a blank one', () => {
  const state = newState();
  const session = addSession(state);
  renameSession(state, session.id, '  Plans  ');
  renameSession(state, session.id, '   ');
  assert.equal(session.title, 'Plans');
});

test('sessions are grouped by the day they were last used, newest first', () => {
  const now = new Date(2026, 10, 22, 15).getTime(); // 3 PM
  const hours = (n) => now - n * 60 * 60 * 1000;
  const sessions = [
    { id: 'old' }, // saved before sessions had a time
    { id: 'yesterday', updatedAt: hours(20) },
    { id: 'morning', updatedAt: hours(6) },
    { id: 'just-now', updatedAt: hours(0) },
    { id: 'this-week', updatedAt: hours(24 * 4) },
  ];
  assert.deepEqual(groupByDay(sessions, now).map((g) => [g.label, g.sessions.map((s) => s.id)]), [
    ['Today', ['just-now', 'morning']],
    ['Yesterday', ['yesterday']],
    ['Previous 7 days', ['this-week']],
    ['Older', ['old']],
  ]);
});

test('search looks in titles and messages, ignoring case and empty sessions', () => {
  const state = newState();
  const a = addSession(state);
  addMessage(state, a.id, 'Fix the Sidebar');
  const b = addSession(state);
  addMessage(state, b.id, 'hello');
  addReply(state, b.id, { from: 'assistant', text: 'The sidebar is fine' });
  addSession(state); // empty
  assert.deepEqual(searchSessions(state, 'SIDEBAR').map((s) => s.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(searchSessions(state, 'hello'), [b]);
  assert.equal(searchSessions(state, '').length, 2);
});
