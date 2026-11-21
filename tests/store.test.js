import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, newState, load, addProject, addSession, removeSession, removeProject, addMessage,
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
