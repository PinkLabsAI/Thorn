// Draws an assistant reply: a status line, the web search it ran, and the answer.
// playReply shows one live as its events arrive; drawReply shows a finished one.

import { toHtml, safe, wordEnds } from './markdown.js';

// Line icons from the lucide set, as in app.js
const svg = (name, shape) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`;
const ICONS = {
  thinking: svg('thinking', '<path fill="currentColor" d="M12 3Q13 11 21 12Q13 13 12 21Q11 13 3 12Q11 11 12 3Z"/>'),
  researching: svg('researching', '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  writing: svg('writing', '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'),
  done: svg('done', '<path pathLength="1" d="M20 6 9 17l-5-5"/>'),
  globe: svg('', '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  chevron: svg('chevron-down', '<path d="m6 9 6 6 6-6"/>'),
  copy: svg('', '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  retry: svg('', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};

const LABELS = { thinking: 'Thinking', researching: 'Researching', writing: 'Writing' };
const COLUMNS = 4; // source cards per row
const COPIED_MS = 1600;

// Pace of the answer, in words. A model sends text in uneven bursts; showing it
// at a steadier pace reads better than showing each burst the moment it lands.
const SPEED = 8; // words per second
const CATCH_UP = 16; // a backlog this many words long doubles the pace
const SENTENCE_PAUSE = 240;
const CLAUSE_PAUSE = 90;
const FADE = 520; // how long a new word takes to fade in; matches .w.new in reply.css

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function element(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

// Changes what a slot shows: the old content drifts up and out while the new
// rises in. A slot's first content just appears, so finished replies draw still.
function swap(slot, html) {
  if (slot.shows === html) return;
  slot.shows = html;
  const old = [...slot.children];
  slot.insertAdjacentHTML('beforeend', `<span${old.length ? ' class="in"' : ''}>${html}</span>`);
  for (const child of old) {
    child.className = 'out';
    setTimeout(() => child.remove(), 250); // the length of the "leave" animation
  }
}

const elapsed = (seconds) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');
// developer.mozilla.org reads as "mozilla", the way people say it
const siteName = (url) => hostOf(url).split('.').at(-2) ?? hostOf(url);

// A round tile with the site's first letter. Its colour is worked out from the
// name, so a site always gets the same one.
function favicon(source, extra = '') {
  const name = siteName(source.url);
  const hue = [...name].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 360, 0);
  return `<span class="fav ${extra}" style="--hue:${hue}" aria-hidden="true">${safe(name[0])}</span>`;
}

// The small pill that stands for source `n` inside the answer. Its preview card
// is shown by CSS on hover or keyboard focus.
function citation(source, n) {
  return `<span class="w cite" tabindex="0">${favicon(source)}${safe(siteName(source.url))}<span class="n">${n}</span>
    <span class="preview" role="tooltip">
      <span class="site">${favicon(source)}${safe(hostOf(source.url))}</span>
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

// "Thinking 3s", then "Researching mozilla 5s", and at the end "Worked for 9s".
function statusLine() {
  const el = element(`<div class="status" role="status">
    <span class="slot"></span><span class="slot caption"></span><span class="slot detail"></span>
    <span class="timer" aria-hidden="true"></span>
  </div>`);
  const [icon, caption, detail, timer] = el.children;
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  let clock = null;
  const stop = () => clearInterval(clock);

  return {
    el,
    seconds,
    stop,
    show(state, note = '') {
      clock ??= setInterval(() => { timer.textContent = elapsed(seconds()); }, 1000);
      swap(icon, ICONS[state]);
      swap(caption, `<span class="shimmer">${LABELS[state]}</span>`);
      swap(detail, safe(note));
    },
    done(total) {
      stop();
      timer.textContent = '';
      swap(icon, ICONS.done);
      swap(caption, `Worked for ${elapsed(total)}`);
      swap(detail, '');
    },
  };
}

// The pill ("Searching…", then "Searched 6 sites") and the grid of source cards
// that opens under it. `sources` is the reply's own list, so results added to
// it show up on the next draw().
function webSearch(sources, query, live) {
  const el = element(`<div class="search ${live ? 'open' : ''}">
    <button class="pill" data-reply="toggle" aria-expanded="${live}">
      <span class="globe">${ICONS.globe}
        <svg class="ring" viewBox="0 0 28 28" aria-hidden="true">
          <circle class="track" cx="14" cy="14" r="13"/><circle class="fill" cx="14" cy="14" r="13" pathLength="1"/>
        </svg>
      </span>
      <span class="slot caption"></span><span class="stack"></span>${ICONS.chevron}
    </button>
    <div class="collapse"><div><ol class="cards"></ol></div></div>
  </div>`);
  const caption = el.querySelector('.caption');
  const ring = el.querySelector('.fill');
  const stack = el.querySelector('.stack');
  const cards = el.querySelector('.cards');
  let searching = live;
  let expanded = false;
  // How many favicons and cards the last draw showed. Only ones past that count
  // animate in, so a redraw never replays what is already on screen.
  let stacked = live ? 0 : COLUMNS;
  let drawn = live ? 0 : COLUMNS;

  function draw() {
    const count = sources.length;
    el.dataset.status = searching ? 'searching' : 'done';
    swap(caption, searching
      ? `<span class="shimmer">Searching “${safe(query)}”</span>`
      : `Searched ${count} ${count === 1 ? 'site' : 'sites'}`);
    // The ring is a circle whose outline is one long dash; the offset is how much
    // of it is still missing. Each result closes 30% of what is left, so it fills
    // fast early and only completes when the search is done.
    ring.style.strokeDashoffset = searching ? Math.min(0.92, 0.7 ** count) : 0;

    stack.innerHTML = sources.slice(0, COLUMNS).map((s, i) => favicon(s, i >= stacked ? 'new' : '')).join('');
    stacked = count;

    // From the fourth result on, the last slot of the row is the "more" card
    const overflow = !expanded && count >= COLUMNS;
    const shown = overflow ? sources.slice(0, COLUMNS - 1) : sources;
    const more = count - shown.length;
    // Placeholders keep the first row full while results are still landing
    const placeholders = searching && !overflow ? COLUMNS - count : 0;
    cards.innerHTML = shown.map((source, i) => `
      <li ${i >= drawn ? `class="new" style="animation-delay:${(i - drawn) * 45}ms"` : ''}>
        <div class="card" title="${safe(source.title)}">
          <span class="title">${safe(source.title)}</span>
          <span class="site">${favicon(source)}<span class="text">${safe(siteName(source.url))}</span><span class="n">${i + 1}</span></span>
        </div>
      </li>`).join('')
      + '<li aria-hidden="true"><div class="card skeleton"><i></i><i></i><i></i></div></li>'.repeat(placeholders)
      + (overflow ? `<li><button class="card" data-reply="more">
          <span class="stack">${sources.slice(COLUMNS - 1, COLUMNS * 2 - 1).map((s) => favicon(s)).join('')}</span>
          <span class="title">${more} more ${more === 1 ? 'source' : 'sources'}</span>
        </button></li>` : '')
      + (expanded ? '<li><button class="card less" data-reply="less">Show less</button></li>' : '');
    drawn = shown.length;
  }

  el.addEventListener('click', (event) => {
    const action = event.target.closest('[data-reply]')?.dataset.reply;
    if (action === 'toggle') {
      el.querySelector('.pill').setAttribute('aria-expanded', el.classList.toggle('open'));
    }
    if (action === 'more' || action === 'less') {
      expanded = action === 'more';
      draw();
    }
  });

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

// The answer text. write() says how much text exists so far; the words then
// appear at a reading pace, each one fading in.
function answerView(cite) {
  const el = element('<div class="answer"></div>');
  // When each word first appeared. Every step replaces the answer's HTML, which
  // would restart each word's fade, so words still fading resume part-way instead.
  const births = [];
  let text = '';
  let final = false;
  let count = 0; // words shown so far
  let timer = null;
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });

  function draw(visible, streaming) {
    el.innerHTML = toHtml(visible, { cite, streaming });
    const words = [...el.querySelectorAll('.w')];
    const now = performance.now();
    let fresh = 0;
    for (const [i, word] of words.entries()) {
      births[i] ??= now + Math.min(fresh++ * 16, 60); // words arriving together fade in reading order
      const age = now - births[i];
      if (age < FADE) {
        word.classList.add('new');
        word.style.animationDelay = `${-age}ms`; // a negative delay starts an animation that far in
      }
    }
    // The dot that marks where the text is being written
    if (streaming) words.at(-1)?.insertAdjacentHTML('afterend', `<span class="caret" style="animation-delay:${-now % 1000}ms"></span>`);
  }

  function step() {
    timer = null;
    const ends = wordEnds(text, final);
    if (count >= ends.length) {
      if (final) settle();
      return; // nothing more to show until write() is called again
    }
    const backlog = ends.length - count;
    // Words land a few at a time after uneven gaps, like text off a real model
    const chunk = calm() ? backlog : 1 + Math.floor(Math.random() * 3) + Math.floor(backlog / CATCH_UP);
    count = Math.min(ends.length, count + chunk);
    const end = ends[count - 1];
    draw(text.slice(0, end), !final || count < ends.length);
    const pause = /[.!?]/.test(text[end - 1]) ? SENTENCE_PAUSE : /[,;:]/.test(text[end - 1]) ? CLAUSE_PAUSE : 0;
    const gap = ((chunk * 1000) / SPEED) * (0.5 + Math.random());
    timer = setTimeout(step, (gap + pause) / (1 + backlog / CATCH_UP));
  }

  return {
    el,
    settled, // resolves once a final text is fully shown, or the answer is stopped
    write(next, isFinal) {
      text = next;
      final = isFinal;
      if (!timer) step();
    },
    stop() {
      clearTimeout(timer);
      settle();
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
  swap(copy, ICONS.copy);
  el.addEventListener('click', (event) => {
    const action = event.target.closest('[data-reply]')?.dataset.reply;
    if (action === 'retry') onRetry();
    if (action === 'copy') {
      navigator.clipboard.writeText(message.text);
      swap(copy, ICONS.done);
      setTimeout(() => swap(copy, ICONS.copy), COPIED_MS);
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
    search.done();
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
  const answer = answerView(citeFrom(message.sources));
  let search = null;
  let stopped = false;
  li.append(status.el, answer.el);
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
        status.show('researching', siteName(event.source.url));
      }
      if (event.text) {
        message.text += event.text;
        answer.write(message.text, false);
      }
    }
    answer.write(message.text, true);
    await answer.settled;
    if (stopped) return null;
    message.seconds = status.seconds();
    status.done(message.seconds);
    li.append(actions(message, onRetry));
    return message;
  }

  return {
    finished: play(),
    stop() {
      stopped = true;
      status.stop();
      answer.stop();
    },
  };
}
