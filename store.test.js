import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY, emptyState, load, createProject, createSession, deleteSession, deleteProject, addMessage,
} from './store.js';

test('deleting a project removes its sessions and keeps the rest', () => {
  const state = emptyState();
  const project = createProject(state, 'thorn');
  const standalone = createSession(state);
  createSession(state, project.id); // selected, and about to be deleted

  deleteProject(state, project.id);

  assert.deepEqual(state.projects, []);
  assert.deepEqual(state.sessions, [standalone]);
  assert.equal(state.selectedId, null);
});

test('deleting a session only clears the selection if it was the selected one', () => {
  const state = emptyState();
  const first = createSession(state);
  const second = createSession(state); // selected

  deleteSession(state, first.id);
  assert.equal(state.selectedId, second.id);

  deleteSession(state, second.id);
  assert.equal(state.selectedId, null);
});

test('only the first message names the session', () => {
  const state = emptyState();
  const session = createSession(state);

  addMessage(state, session.id, 'Explain closures');
  addMessage(state, session.id, 'Now with an example');

  assert.equal(session.title, 'Explain closures');
  assert.equal(session.messages.length, 2);
});

test('load falls back to an empty state when saved data is missing or corrupt', () => {
  const storageWith = (value) => ({ getItem: (key) => (key === KEY ? value : null) });

  assert.deepEqual(load(storageWith(null)), emptyState());
  assert.deepEqual(load(storageWith('{not json')), emptyState());
});
