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
  assert.match(html('```\nlet a;\n```'), /^<div class="code"><div class="code-top">code.*<pre><code>let a;<\/code><\/pre><\/div>$/);
});

test('a line indented under a list item starts a list inside that item', () => {
  assert.equal(html('- a\n  - b\n  - c\n- d'), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
  assert.equal(html('1. a\n   - b\n2. c'), '<ol start="1"><li>a<ul><li>b</li></ul></li><li>c</li></ol>');
  assert.equal(html('- a\n1. b'), '<ul><li>a</li></ul><ol start="1"><li>b</li></ol>');
});

test('a table needs its |---| line, and its cells take inline markdown', () => {
  assert.equal(
    html('| A | B |\n| --- | :-: |\n| 1 | **2** |\nafter'),
    '<div class="table"><table><thead><tr><th>A</th><th>B</th></tr></thead>'
      + '<tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div><p>after</p>',
  );
  assert.equal(html('| not a table |'), '<p>| not a table |</p>');
});

test('code with a language is coloured, and a // inside a string is not a comment', () => {
  const line = (text, language) => toHtml(`\`\`\`${language}\n${text}\n\`\`\``).match(/<span class="w">(.*)<\/span><\/code>/)[1];
  assert.equal(
    line('const a = "x//y"; // 12', 'js'),
    '<span class="t-keyword">const</span> a = <span class="t-string">&quot;x//y&quot;</span>; <span class="t-comment">// 12</span>',
  );
  assert.equal(line('x = 1 # note', 'py'), 'x = <span class="t-number">1</span> <span class="t-comment"># note</span>');
  assert.equal(line('<b> # not a comment', 'js'), '&lt;b&gt; # not a comment');
});

test('inline: bold, italic, code and links', () => {
  assert.equal(html('a **b c** *d*'), '<p>a <strong>b c</strong> <em>d</em></p>');
  assert.equal(html('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(html('[docs](https://tauri.app)'), '<p><a class="link" href="https://tauri.app" title="https://tauri.app">docs</a></p>');
  assert.equal(html('[bad](javascript:alert(1))'), '<p><span class="link">bad</span>)</p>'); // only web addresses become links
});

test('a marker with no partner is literal in a finished reply, and already applied in a streaming one', () => {
  assert.equal(html('**bold so'), '<p>**bold so</p>');
  assert.equal(html('**bold so', { streaming: true }), '<p><strong>bold so</strong></p>');
  assert.equal(html('```\nlet a;', { streaming: true }).includes('<pre><code>let a;</code></pre>'), true);
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
