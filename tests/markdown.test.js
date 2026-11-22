import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml, wordEnds } from '../src/markdown.js';

// Strips the per-word spans so the expected HTML stays readable.
const html = (text, options) => toHtml(text, options).replaceAll(/<span class="w">(.*?)<\/span>/g, '$1');

test('text that looks like HTML is shown as text, never run', () => {
  assert.equal(html('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(html('`<b>`'), '<p><code class="w">&lt;b&gt;</code></p>');
  assert.match(toHtml('```\n<script>\n```'), /&lt;script&gt;/);
});

test('blocks: paragraphs, headings, lists, quotes and code', () => {
  assert.equal(html('one\ntwo\n\nthree'), '<p>one<br>two</p><p>three</p>');
  assert.equal(html('# Title'), '<h3>Title</h3>');
  assert.equal(html('- a\n- b\ntext'), '<ul><li>a</li><li>b</li></ul><p>text</p>');
  assert.equal(html('3. c\n4. d'), '<ol start="3"><li>c</li><li>d</li></ol>');
  assert.equal(html('> said'), '<blockquote>said</blockquote>');
  assert.match(html('```js\nlet a;\n```'), /^<div class="code"><div class="code-top">js.*<pre><code>let a;<\/code><\/pre><\/div>$/);
});

test('inline: bold, italic, code and links', () => {
  assert.equal(html('a **b c** *d*'), '<p>a <strong>b c</strong> <em>d</em></p>');
  assert.equal(html('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(html('[docs](https://tauri.app)'), '<p><span class="link" title="https://tauri.app">docs</span></p>');
});

test('a marker with no partner is literal in a finished reply, and already applied in a streaming one', () => {
  assert.equal(html('**bold so'), '<p>**bold so</p>');
  assert.equal(html('**bold so', { streaming: true }), '<p><strong>bold so</strong></p>');
  assert.equal(html('```js\nlet a;', { streaming: true }).includes('<pre><code>let a;</code></pre>'), true);
});

test('[n] becomes a citation only when source n exists', () => {
  const cite = (n) => (n === 1 ? '<cite>1</cite>' : null);
  assert.equal(html('fact [1]. list[1] other [2]', { cite }), '<p>fact&nbsp;<cite>1</cite>. list<cite>1</cite> other [2]</p>');
});

test('a half-sent last word waits until more text arrives or the reply is final', () => {
  assert.deepEqual(wordEnds('one two thr', false), [3, 7]);
  assert.deepEqual(wordEnds('one two thr', true), [3, 7, 11]);
  assert.deepEqual(wordEnds('one two ', false), [3, 7]);
});
