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
const ITEM = /^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/; // a list line: its indent, its number if it has one, its text
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/; // the |---|---| line under a table's header
const BLOCK_STARTS = [FENCE, HEADING, QUOTE, ITEM, TABLE_ROW];

// Colours for code. This is deliberately rough: it reads one line at a time and
// knows only comments, strings, numbers and common keywords, which is enough to
// make code easier to scan without bringing in a highlighting library.
const KEYWORDS = new Set(`as async await break case catch class const continue def default do elif else enum export
  extends false fn for from function if impl import in interface let match new nil none null of pub return self static
  struct switch this throw true try type use var while yield`.split(/\s+/));
const HASH_COMMENTS = new Set(['py', 'python', 'sh', 'bash', 'zsh', 'shell', 'rb', 'ruby', 'yaml', 'yml', 'toml']);
const STRING = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\`(?:\\.|[^\`\\])*\``;

function highlight(line, language) {
  const comment = HASH_COMMENTS.has(language) ? '#.*' : String.raw`\/\/.*`;
  const token = new RegExp(String.raw`(${comment})|(${STRING})|(\b\d[\w.]*)|([A-Za-z_]\w*)`, 'g');
  let out = '';
  let last = 0;
  for (const m of line.matchAll(token)) {
    const kind = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'number' : KEYWORDS.has(m[4].toLowerCase()) ? 'keyword' : null;
    out += safe(line.slice(last, m.index)) + (kind ? `<span class="t-${kind}">${safe(m[0])}</span>` : safe(m[0]));
    last = m.index + m[0].length;
  }
  return out + safe(line.slice(last));
}

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
  // A list starting at the current line. A line indented further than the list
  // starts a list inside the item above it, which is how lists nest.
  const list = () => {
    const [, indent, number] = lines[i].match(ITEM);
    let items = '';
    while (i < lines.length) {
      const m = lines[i].match(ITEM);
      if (!m || m[1].length < indent.length) break;
      if (m[1].length > indent.length) {
        items = `${items.slice(0, -'</li>'.length)}${list()}</li>`;
      } else if (Boolean(m[2]) !== Boolean(number)) {
        break; // bullets after numbers, or the other way round, start a new list
      } else {
        items += `<li>${inline(m[3])}</li>`;
        i++;
      }
    }
    return number ? `<ol start="${number}">${items}</ol>` : `<ul>${items}</ul>`;
  };
  const cells = (row, tag) => row.match(TABLE_ROW)[1].split('|').map((cell) => `<${tag}>${inline(cell.trim())}</${tag}>`).join('');

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      const start = ++i;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) i++;
      // Code reads by line, not by word, so each line fades in as one unit
      const language = fence[1].trim().toLowerCase();
      const code = lines.slice(start, i++).map((l) => `<span class="w">${language ? highlight(l, language) : safe(l)}</span>`).join('\n');
      out.push(`<div class="code"><div class="code-top">${safe(language || 'code')}`
        + `<button data-reply="copy-code">Copy</button></div><pre><code>${code}</code></pre></div>`);
    } else if (!line.trim()) {
      i++;
    } else if (HEADING.test(line)) {
      const [, hashes, body] = line.match(HEADING);
      const level = hashes.length + 2; // the chat already has a title, so # starts at <h3>
      out.push(`<h${level}>${inline(body)}</h${level}>`);
      i++;
    } else if (ITEM.test(line)) {
      out.push(list());
    } else if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      i += 2;
      const rows = take(TABLE_ROW).map((row) => `<tr>${cells(`|${row}|`, 'td')}</tr>`).join('');
      // The wrapper lets a wide table scroll sideways instead of stretching the chat
      out.push(`<div class="table"><table><thead><tr>${cells(line, 'th')}</tr></thead><tbody>${rows}</tbody></table></div>`);
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
      // Only web addresses become real links (app.js opens them in the browser).
      // Anything else, and a link still arriving, is shown as a link but does nothing.
      const url = /^https?:\/\//.test(m[2] ?? '') ? m[2] : null;
      out += url ? `<a class="link" href="${safe(url)}" title="${safe(url)}">${inner(m[1])}</a>` : `<span class="link">${inner(m[1])}</span>`;
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
