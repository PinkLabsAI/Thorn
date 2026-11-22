// Draws an assistant reply: a status line, the web search it ran, and the answer.
// playReply shows one live as its events arrive; drawReply shows a finished one.

import { toHtml, safe } from './markdown.js';
import { logoFor } from './logos.js';

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

// Logos that failed to load, for example while offline. Replies redraw often,
// and remembering these stops the same missing picture being asked for each time.
const failedLogos = new Set();

// A site's logo: one of the files that ship with Thorn, or else theSVG's logo
// for that site (thesvg.org, MIT licensed), or else a plain globe.
function sourceLogo(url) {
  const asset = sourceLogos.get(hostOf(url));
  const name = asset ? null : logoFor(url);
  const src = asset ? `./source-logos/${asset}` : name && `https://thesvg.org/icons/${name}/default.svg`;
  const mark = src && !failedLogos.has(src) ? `<img src="${src}" width="16" height="16" alt="">` : ICONS.globe;
  return `<span class="source-logo" aria-hidden="true">${mark}</span>`;
}

function citation(source, n) {
  return `<a class="cite" href="${safe(source.url)}" aria-label="Source ${n}: ${safe(source.title)}">${n}
    <span class="preview" role="tooltip">
      <span class="site">${sourceLogo(source.url)}${safe(hostOf(source.url))}</span>
      <span class="title">${safe(source.title)}</span>
      <span class="snippet">${safe(source.snippet)}</span>
    </span>
  </a>`;
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
    done(message) {
      el.textContent = message.error ? 'Interrupted'
        : `${message.stopped ? 'Stopped after' : 'Worked for'} ${elapsed(message.seconds)}`;
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
    list.innerHTML = sources.map((source, index) => `<li>
        <a class="source" href="${safe(source.url)}">
          <span class="source-index">${index + 1}</span>
          ${sourceLogo(source.url)}
          <span class="source-info">
            <span class="source-title">${safe(source.title)}</span>
            <span class="source-host">${safe(hostOf(source.url))}</span>
          </span>
        </a>
      </li>`).join('');
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
  // A picture that fails to load does not bubble its "error" event, so this
  // listens on the way down (capture) and swaps in the globe.
  li.addEventListener('error', (event) => {
    if (!event.target.matches('.source-logo img')) return;
    failedLogos.add(event.target.src);
    event.target.outerHTML = ICONS.globe;
  }, true);
  for (const type of ['pointerover', 'focusin']) {
    li.addEventListener(type, (event) => {
      const cite = event.target.closest('.cite');
      if (cite) placePreview(cite);
    });
  }
}

const citeFrom = (sources) => (n) => sources[n - 1] && citation(sources[n - 1], n);

// A reply that was stopped or failed is shown as far as it got, so markers
// left open in its text (like ** with no partner) are treated as closed.
const answerHtml = (message) => toHtml(message.text, {
  cite: citeFrom(message.sources),
  streaming: Boolean(message.stopped || message.error),
});

// What goes under a reply once it has ended: why it failed, if it did, then copy and retry.
function ending(message, onRetry) {
  const parts = [actions(message, onRetry)];
  if (message.error) parts.unshift(element(`<p class="reply-error" role="alert">${safe(message.error)}</p>`));
  return parts;
}

// Draws a reply that has ended, such as one from an earlier visit, with nothing animating.
// `onRetry` adds a retry button; leave it out for replies that cannot be retried.
export function drawReply(li, message, onRetry) {
  const status = statusLine();
  status.done(message);
  li.append(status.el);
  if (message.sources.length) li.append(webSearch(message.sources, message.query, false).el);
  const answer = element('<div class="answer"></div>');
  answer.innerHTML = answerHtml(message);
  li.append(answer, ...ending(message, onRetry));
  listen(li);
}

// Plays a reply into `li` as its events arrive (see sample.js for the events).
// A reply ends in one of three ways: it finishes, stop() is called, or reading
// its events fails. Each time the message is complete as far as it got, marked
// `stopped` or carrying an `error`. `finished` resolves to it, and stop() returns it.
export function playReply(li, events, onRetry) {
  const message = { from: 'assistant', text: '', query: '', sources: [], seconds: 0 };
  const status = statusLine();
  const answer = element('<div class="answer"></div>');
  const cite = citeFrom(message.sources);
  let search = null;
  let ended = false;
  li.append(status.el, answer);
  listen(li);

  function end(how = {}) {
    if (ended) return message;
    ended = true;
    Object.assign(message, how, { seconds: status.seconds() });
    search?.done();
    answer.innerHTML = answerHtml(message);
    status.done(message);
    li.append(...ending(message, onRetry));
    return message;
  }

  async function play() {
    try {
      // "for await" waits for each event in turn without freezing the window
      for await (const event of events) {
        if (ended) break; // leaving the loop also tells the source of the events to stop
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
    } catch (error) {
      return end({ error: error.message || 'Something went wrong.' });
    }
    return end();
  }

  return { finished: play(), stop: () => end({ stopped: true }) };
}
