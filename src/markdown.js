// Turns the markdown text of a reply into HTML. Text in, text out: nothing here
// touches the window, so the tests can run it with plain Node.

// Replies come from outside the code and are placed into innerHTML, so anything
// that looks like HTML in them has to be neutralised.
export function safe(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const BLOCK_STARTS = [FENCE, HEADING, QUOTE, BULLET, ORDERED];

// Where each whole word of `text` ends. While a reply is still arriving its last
// word may be half sent, so that word only counts once the reply is final.
export function wordEnds(text, final) {
  const ends = [];
  for (const match of text.matchAll(/\S+/g)) {
    const end = match.index + match[0].length;
    if (end < text.length || final) ends.push(end);
  }
  return ends;
}

// Every word is wrapped in <span class="w"> so the screen can fade words in one by one.
//   cite(n)    returns the HTML for citation [n], or nothing if there is no source n
//   streaming  true while the text is still arriving: a marker that has not closed
//              yet (like ** with no partner) counts as closed, so raw asterisks
//              never flash on screen
export function toHtml(text, { cite = () => null, streaming = false } = {}) {
  const inline = (src) => inlineHtml(src, cite, streaming);
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  // Takes the run of lines matching `pattern`, keeping the part after its marker.
  const take = (pattern) => {
    const taken = [];
    while (i < lines.length && pattern.test(lines[i])) taken.push(lines[i++].match(pattern).at(-1));
    return taken;
  };
  const items = (pattern) => take(pattern).map((item) => `<li>${inline(item)}</li>`).join('');

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      const start = ++i;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) i++;
      // Code reads by line, not by word, so each line fades in as one unit
      const code = lines.slice(start, i++).map((l) => `<span class="w">${safe(l)}</span>`).join('\n');
      out.push(`<div class="code"><div class="code-top">${safe(fence[1].trim() || 'code')}`
        + `<button data-reply="copy-code">Copy</button></div><pre><code>${code}</code></pre></div>`);
    } else if (!line.trim()) {
      i++;
    } else if (HEADING.test(line)) {
      const [, hashes, body] = line.match(HEADING);
      const level = hashes.length + 2; // the chat already has a title, so # starts at <h3>
      out.push(`<h${level}>${inline(body)}</h${level}>`);
      i++;
    } else if (BULLET.test(line)) {
      out.push(`<ul>${items(BULLET)}</ul>`);
    } else if (ORDERED.test(line)) {
      out.push(`<ol start="${parseInt(line, 10)}">${items(ORDERED)}</ol>`);
    } else if (QUOTE.test(line)) {
      out.push(`<blockquote>${inline(take(QUOTE).join('\n'))}</blockquote>`);
    } else {
      const start = i++;
      while (i < lines.length && lines[i].trim() && !BLOCK_STARTS.some((p) => p.test(lines[i]))) i++;
      out.push(`<p>${inline(lines.slice(start, i).join('\n'))}</p>`);
    }
  }
  return out.join('');
}

// Bold, italic, `code`, [links](url) and [1] citations inside one block.
function inlineHtml(src, cite, streaming) {
  const inner = (part) => inlineHtml(part, cite, streaming);
  // Where `marker` next appears. -1 means "not a marker after all, show it as typed".
  const closing = (marker, from) => {
    const end = src.indexOf(marker, from);
    return end < 0 && streaming ? src.length : end;
  };
  const startsWord = (at) => /[^\s*]/.test(src[at] ?? ''); // "2 * 3" is not the start of italics
  let out = '';
  let i = 0;

  while (i < src.length) {
    const rest = src.slice(i);
    let end;
    let m;
    if (src[i] === '`' && (end = closing('`', i + 1)) >= 0) {
      out += `<code class="w">${safe(src.slice(i + 1, end))}</code>`;
      i = end + 1;
    } else if (rest.startsWith('**') && startsWord(i + 2) && (end = closing('**', i + 2)) >= 0) {
      out += `<strong>${inner(src.slice(i + 2, end))}</strong>`;
      i = end + 2;
    } else if (src[i] === '*' && startsWord(i + 1) && (end = closing('*', i + 1)) >= 0) {
      out += `<em>${inner(src.slice(i + 1, end))}</em>`;
      i = end + 1;
    } else if ((m = rest.match(/^(\s*)\[(\d+)\]/)) && cite(Number(m[2]))) {
      // A non-breaking space keeps the citation on the same line as the word it follows
      out += (m[1] ? '&nbsp;' : '') + cite(Number(m[2]));
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]*)\]\(([^)\s]*)\)/)) || (streaming && (m = rest.match(/^\[([^\]]*)$/)))) {
      // Shown as a link but not clickable yet: opening a browser needs a Tauri plugin Thorn does not have
      out += `<span class="link" title="${safe(m[2] ?? '')}">${inner(m[1])}</span>`;
      i += m[0].length;
    } else if ((m = rest.match(/^\s+/))) {
      out += m[0].includes('\n') ? '<br>' : ' ';
      i += m[0].length;
    } else {
      // A plain word, or a lone marker character that turned out to mean nothing
      m = rest.match(/^[^\s`*[]+|^./);
      out += `<span class="w">${safe(m[0])}</span>`;
      i += m[0].length;
    }
  }
  return out;
}
