// Stands in for the model until one is connected: one scripted reply, delivered
// the way a real one arrives, as a stream of small events spread over time.
//
// The events, in the order a reply sends them:
//   { status }          what the model is doing: 'thinking', 'researching', 'writing'
//   { status, query }   'researching' also carries what is being searched for
//   { source }          one search result: { title, url, snippet }
//   { text }            the next few words of the answer

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SOURCES = [
  {
    title: 'Using server-sent events',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events',
    snippet: 'A server can keep one connection open and push new data to the page whenever it has some.',
  },
  {
    title: 'Calling the Frontend from Rust',
    url: 'https://tauri.app/develop/calling-frontend/',
    snippet: 'Events and channels let the Rust side of a Tauri app send data to the window as it becomes available.',
  },
  {
    title: 'Using readable streams',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams',
    snippet: 'Read a response piece by piece as it downloads instead of waiting for all of it.',
  },
  {
    title: 'Streaming Messages',
    url: 'https://platform.claude.com/docs/en/build-with-claude/streaming',
    snippet: 'Set stream to true to receive the response incrementally as server-sent events.',
  },
  {
    title: 'How to create high-performance CSS animations',
    url: 'https://web.dev/articles/animations-guide',
    snippet: 'Animating transform and opacity keeps motion smooth because the browser can skip layout.',
  },
  {
    title: 'Server-sent events',
    url: 'https://html.spec.whatwg.org/multipage/server-sent-events.html',
    snippet: 'The EventSource interface and the text/event-stream format.',
  },
];

const TEXT = `This is a **sample reply**. No model is connected to Thorn yet, so this text is scripted to show how a real answer will arrive.

A model does not send its answer in one piece. It sends a few words at a time over one open connection, usually as server-sent events [1][4]. Thorn shows whole words as they come in, so nothing appears half typed.

What the pieces on screen mean:

- **The status line** says what the model is doing and how long it took.
- **The search row** opens to show every source [2].
- **Citations** like the one ending this sentence show their source when you point at them [3].

Reading a stream in JavaScript looks like this:

\`\`\`js
for await (const event of reply) {
  if (event.text) show(event.text);
}
\`\`\`

Each trip around that loop waits for the next event, then handles it. That is how \`sample.js\` feeds this reply to the screen.`;

// An async generator: each `yield` hands over one event, and the function
// pauses there until whoever is reading asks for the next one.
export async function* sampleReply() {
  yield { status: 'thinking' };
  await wait(1600);
  yield { status: 'researching', query: 'how streamed replies work' };
  for (const source of SOURCES) {
    await wait(500);
    yield { source };
  }
  await wait(700);
  yield { status: 'writing' };
  // A model sends its text in bursts of a few words
  for (const burst of TEXT.match(/(\S+\s*){1,10}/g)) {
    await wait(140);
    yield { text: burst };
  }
}
