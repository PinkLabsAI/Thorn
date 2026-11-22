// Draws an assistant reply: a status line, the web search it ran, and the answer.
// playReply shows one live as its events arrive; drawReply shows a finished one.

import { toHtml, safe } from './markdown.js';

// Line icons from the lucide set, as in app.js
const svg = (name, shape) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`;
const ICONS = {
  done: svg('done', '<path pathLength="1" d="M20 6 9 17l-5-5"/>'),
  globe: svg('', '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  chevron: svg('chevron-down', '<path d="m6 9 6 6 6-6"/>'),
  copy: svg('', '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  retry: svg('', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};

const LABELS = { thinking: 'Thinking', researching: 'Researching', writing: 'Writing' };
const COPIED_MS = 1600;

function element(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

const elapsed = (seconds) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');
const sourceLogos = new Map([
  ['developer.mozilla.org', 'mdn-web-docs.svg'],
  ['tauri.app', 'tauri.svg'],
  ['platform.claude.com', 'claude.svg'],
  ['web.dev', 'webdev.png'],
  ['html.spec.whatwg.org', 'whatwg.svg'],
]);

function sourceLogo(host) {
  const asset = sourceLogos.get(host);
  const mark = asset ? `<img src="./source-logos/${asset}" width="16" height="16" alt="">` : ICONS.globe;
  return `<span class="source-logo" aria-hidden="true">${mark}</span>`;
}

function citation(source, n) {
  const host = hostOf(source.url);
  return `<span class="cite" tabindex="0" aria-label="Source ${n}: ${safe(source.title)}">${n}
    <span class="preview" role="tooltip">
      <span class="site">${sourceLogo(host)}${safe(host)}</span>
      <span class="title">${safe(source.title)}</span>
      <span class="snippet">${safe(source.snippet)}</span>
    </span>
  </span>`;
}

// Keeps a citation's preview inside the reply instead of running off the edge,
// and drops it below the pill when there is no room above.
function placePreview(cite) {
  const pill = cite.getBoundingClientRect();
  const reply = cite.closest('.reply').getBoundingClientRect();
  const preview = cite.querySelector('.preview');
  preview.style.left = `${Math.min(0, reply.right - (pill.left + preview.offsetWidth))}px`;
  preview.classList.toggle('below', pill.top < 240);
}

function statusLine() {
  const el = element('<div class="status" role="status" aria-live="polite"></div>');
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);

  return {
    el,
    seconds,
    show(state) {
      el.innerHTML = `<span class="working-dot" aria-hidden="true"></span>${LABELS[state]}…`;
    },
    done(total) {
      el.textContent = `Worked for ${elapsed(total)}`;
    },
  };
}

function webSearch(sources, query, live) {
  const el = element(`<details class="search">
    <summary>${ICONS.globe}<span class="search-label"></span>${ICONS.chevron}</summary>
    <ol class="sources" role="list"></ol>
  </details>`);
  const label = el.querySelector('.search-label');
  const list = el.querySelector('.sources');
  let searching = live;

  function draw() {
    const count = sources.length;
    label.textContent = searching ? `Searching “${query}”` : `Searched ${count} ${count === 1 ? 'source' : 'sources'}`;
    list.innerHTML = sources.map((source, index) => {
      const host = hostOf(source.url);
      return `<li class="source">
        <span class="source-index">${index + 1}</span>
        ${sourceLogo(host)}
        <span class="source-info">
          <span class="source-title">${safe(source.title)}</span>
          <span class="source-host">${safe(host)}</span>
        </span>
      </li>`;
    }).join('');
  }

  draw();
  return {
    el,
    draw,
    done() {
      searching = false;
      draw();
    },
  };
}

// Copy and retry, shown under a finished reply.
function actions(message, onRetry) {
  const el = element(`<div class="actions">
    <button class="icon" data-reply="copy" aria-label="Copy" title="Copy"><span class="slot"></span></button>
    ${onRetry ? `<button class="icon" data-reply="retry" aria-label="Retry" title="Retry">${ICONS.retry}</button>` : ''}
  </div>`);
  const copy = el.querySelector('.slot');
  copy.innerHTML = ICONS.copy;
  el.addEventListener('click', (event) => {
    const action = event.target.closest('[data-reply]')?.dataset.reply;
    if (action === 'retry') onRetry();
    if (action === 'copy') {
      navigator.clipboard.writeText(message.text);
      copy.innerHTML = ICONS.done;
      setTimeout(() => { copy.innerHTML = ICONS.copy; }, COPIED_MS);
    }
  });
  return el;
}

// What every reply needs whether it is live or finished: the parts that react
// to the pointer anywhere inside it.
function listen(li) {
  li.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reply="copy-code"]');
    if (!button) return;
    navigator.clipboard.writeText(button.closest('.code').querySelector('code').textContent);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, COPIED_MS);
  });
  for (const type of ['pointerover', 'focusin']) {
    li.addEventListener(type, (event) => {
      const cite = event.target.closest('.cite');
      if (cite) placePreview(cite);
    });
  }
}

const citeFrom = (sources) => (n) => sources[n - 1] && citation(sources[n - 1], n);

// Draws a finished reply, such as one from an earlier visit, with nothing animating.
// `onRetry` adds a retry button; leave it out for replies that cannot be retried.
export function drawReply(li, message, onRetry) {
  const status = statusLine();
  status.done(message.seconds);
  li.append(status.el);
  if (message.sources.length) {
    const search = webSearch(message.sources, message.query, false);
    li.append(search.el);
  }
  const answer = element('<div class="answer"></div>');
  answer.innerHTML = toHtml(message.text, { cite: citeFrom(message.sources) });
  li.append(answer, actions(message, onRetry));
  listen(li);
}

// Plays a reply into `li` as its events arrive (see sample.js for the events).
// `finished` resolves to the complete message, or to null if stop() cut it short.
export function playReply(li, events, onRetry) {
  const message = { from: 'assistant', text: '', query: '', sources: [], seconds: 0 };
  const status = statusLine();
  const answer = element('<div class="answer"></div>');
  const cite = citeFrom(message.sources);
  let search = null;
  let stopped = false;
  li.append(status.el, answer);
  listen(li);

  async function play() {
    // "for await" waits for each event in turn without freezing the window
    for await (const event of events) {
      if (stopped) return null;
      if (event.status) {
        if (event.query) {
          message.query = event.query;
          search = webSearch(message.sources, message.query, true);
          status.el.after(search.el);
        } else {
          search?.done(); // moving on from researching means the search is over
        }
        status.show(event.status);
      }
      if (event.source) {
        message.sources.push(event.source);
        search.draw();
      }
      if (event.text) {
        message.text += event.text;
        answer.innerHTML = toHtml(message.text, { cite, streaming: true });
      }
    }
    if (stopped) return null;
    search?.done();
    answer.innerHTML = toHtml(message.text, { cite });
    message.seconds = status.seconds();
    status.done(message.seconds);
    li.append(actions(message, onRetry));
    return message;
  }

  return {
    finished: play(),
    stop() {
      stopped = true;
    },
  };
}
