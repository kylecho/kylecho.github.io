export default {
  id: "frontend-system-design",
  number: "05",
  title: "Frontend system design",
  blurb:
    "Designing whole features: data modeling, pagination, live updates, rendering strategy, and the tradeoffs that shape frontend architecture.",
  cards: [
    {
      id: "four-layers",
      type: "recall",
      title: "The four layers",
      prompt: [
        {
          p: "“Design the frontend for X” is really four smaller problems in a fixed order. What are the layers, and why does the order matter?",
        },
      ],
      answer: [
        {
          ol: [
            "Requirements: who uses it, on what devices, how fresh the data must be, what scale.",
            "Data model and API contract: the entities, their relationships, and the shape of what crosses the network.",
            "State architecture: where each piece of state lives (server cache, client state, URL) and how it flows to components.",
            "Rendering and performance: what renders where, what loads when, and what happens on slow networks and errors.",
          ],
        },
        {
          p: "The order matters because each layer constrains the next: you can't place state before you know the entities, and you can't pick a rendering strategy before you know the freshness requirements. Working top-down keeps each decision grounded in the one above it.",
        },
      ],
    },
    {
      id: "infinite-feed",
      type: "design",
      title: "Design an infinite feed",
      prompt: [
        {
          p: "A social feed: posts arrive continuously, users scroll for thousands of items, and each post has like and comment actions. Walk the four layers.",
        },
      ],
      answer: [
        {
          p: "Data: posts referencing authors by ID, fetched via cursor pagination (`fetchFeed(cursor)` returning `{ items, nextCursor }`). Normalize into by-ID maps so a like update touches one record instead of a copy in every page.",
        },
        {
          p: "State: the feed is server state in a query cache keyed by cursor pages; the scroll position and composer draft are client state. Likes are optimistic updates with rollback, and the page list is append-only so earlier pages never re-render.",
        },
        {
          p: "Rendering: virtualize the list; thousands of DOM nodes will kill scroll long before the network does. An `IntersectionObserver` sentinel loads the next page, and new-post arrivals go behind a “new posts” pill instead of shifting the list under the reader's thumb.",
        },
        {
          ul: [
            "Media lazy-loads with explicit dimensions, or layout shift eats the scroll anchor.",
            "The unread pill preserves scroll anchoring; prepending directly is the classic mistake.",
            "Dedupe by post ID across pages, since new posts shift cursor boundaries.",
          ],
        },
      ],
    },
    {
      id: "cursor-vs-offset",
      type: "recall",
      title: "Cursor vs offset pagination",
      prompt: [
        {
          p: "Offset pagination (`?page=3`) is simpler. When does it break, and what does cursor pagination actually promise?",
        },
      ],
      answer: [
        {
          p: "Offset breaks the moment the underlying list changes while someone is paging: a new post shifts every offset, so page 3 repeats an item from page 2 or silently skips one. It also degrades on the server, since `OFFSET 10000` scans and discards ten thousand rows.",
        },
        {
          p: "A cursor (“everything after item X”) pins the position to an item rather than an index, so inserts and deletes elsewhere in the list can't shift your window. That is the promise: stable iteration over a moving list.",
        },
        {
          p: "Offset remains the right choice for jump-to-page UIs over mostly static data, like an admin table. Feeds, comment threads, and anything ordered by recency want cursors.",
        },
      ],
    },
    {
      id: "server-vs-client-state",
      type: "recall",
      title: "Server state is not client state",
      prompt: [
        {
          p: "The distinction that decides most state-management arguments: what makes server state different from client state, and what does each need?",
        },
      ],
      answer: [
        {
          p: "Server state is a cache of data you don't own: it can be stale the moment it arrives, someone else can change it, and it needs fetching, deduplication, invalidation, and refresh. Client state (open modals, form drafts, selections) is owned by the UI, synchronous, and never stale.",
        },
        {
          p: "Treating server state as client state is how apps end up hand-rolling caches in Redux: loading flags, request dedupe, and invalidation logic scattered across reducers. Query caches (TanStack Query, SWR, Apollo) exist because staleness, refetching, and cache keys are one reusable problem; the `useFetch` and promise-cache cards from earlier decks are the primitives they industrialize.",
        },
        {
          p: "What's left over after the query cache takes server state is usually small enough for `useState` and context, with an external store (Zustand, `useSyncExternalStore`) only for fast-changing shared state.",
        },
      ],
    },
    {
      id: "live-updates",
      type: "design",
      title: "Polling, SSE, or WebSocket",
      prompt: [
        {
          p: "A dashboard needs live data. Rank the three delivery mechanisms (polling, server-sent events, WebSocket) and give the deciding question for each step up.",
        },
      ],
      answer: [
        {
          p: "Start with polling. It's cache-friendly, survives proxies and reconnects for free, and a 30-second interval is genuinely live enough for most dashboards. The question that justifies moving up: does staleness measured in seconds actually hurt?",
        },
        {
          p: "SSE is the next step when the server needs to push but the client only listens: one HTTP connection, automatic reconnection with `Last-Event-ID`, no protocol upgrade. Notifications, tickers, and progress streams live here.",
        },
        {
          p: "WebSocket earns its cost only for bidirectional, low-latency traffic (collaborative editing, chat, multiplayer cursors) where the client sends as much as it receives. The cost is real: heartbeats, reconnection with backoff, missed-message recovery, and infrastructure that must hold open connections.",
        },
        {
          p: "Whatever the transport, the client-side discipline is the one from the async decks: out-of-order and duplicate events are guaranteed eventually, so updates must be idempotent and versioned.",
        },
      ],
    },
    {
      id: "concurrent-edits",
      type: "recall",
      title: "Two people edit the same thing",
      prompt: [
        {
          p: "Two users have the same document open. Name the conflict strategies in order of complexity, and the question that picks between them.",
        },
      ],
      answer: [
        {
          ol: [
            "Pessimistic locking: one editor at a time. Trivially correct, miserable UX; fine for rarely co-edited records.",
            "Last-write-wins with versioning: each save carries the version it was based on, and a mismatch surfaces a conflict instead of silently overwriting. Right for forms and settings.",
            "Operational transforms or CRDTs: edits merge automatically at the character or structure level. OT transforms operations against concurrent ones and needs a central server; CRDTs make operations commutative so replicas converge without one.",
          ],
        },
        {
          p: "The deciding question is the unit of conflict. If two people rarely touch the same field, versioned last-write-wins plus a merge UI covers it. Character-level co-editing is the only tier that justifies OT/CRDT machinery, and even then presence (cursors, who's-here) ships first, because it prevents most conflicts socially before any algorithm has to resolve them.",
        },
      ],
    },
    {
      id: "rendering-strategy",
      type: "recall",
      title: "Where should this page render",
      prompt: [
        {
          p: "CSR, SSR, SSG, and server components: give the deciding axis for each, using a marketing page, a dashboard, and a feed as the test cases.",
        },
      ],
      answer: [
        {
          p: "The axes are freshness and personalization. Static generation wins when neither matters: the marketing page is the same HTML for everyone, built once, served from a CDN. Client-side rendering wins when both are extreme and first paint isn't the product: the dashboard is behind a login, personal, and long-lived, so shipping an app shell and fetching is fine.",
        },
        {
          p: "Server rendering earns its complexity in between, where first impressions and content both matter: the feed wants real content in the initial HTML for perceived speed and link previews, then hydration for interactivity. React Server Components refine this by splitting the tree itself, so data-heavy, non-interactive parts stay on the server and ship no JS while interactive islands hydrate.",
        },
        {
          p: "The mistake to avoid is picking one strategy per app. It's a per-page decision (with RSC, per-subtree), and hydration cost decides the marginal cases, since HTML you server-render and then hydrate is paid for twice.",
        },
      ],
    },
    {
      id: "performance-levers",
      type: "recall",
      title: "The performance levers",
      prompt: [
        {
          p: "A page scores badly on Core Web Vitals. For each metric (LCP, CLS, INP) name the lever that most often moves it.",
        },
      ],
      answer: [
        {
          p: "LCP is usually the critical path to the hero content: eliminate render-blocking chains (fonts, CSS, lazy-loaded frameworks) and preload the hero image. If the largest element needs four round trips before it can paint, nothing else matters.",
        },
        {
          p: "CLS is almost always unreserved space: images without dimensions, late-loading ads and embeds, fonts swapping metrics. The fix is boring and total: every async element gets its space reserved up front.",
        },
        {
          p: "INP is long tasks on the main thread: giant renders, synchronous state cascades, heavy event handlers. The levers are splitting work (code splitting, virtualization, `startTransition`, moving computation off-thread) and rendering less, which is the memo discipline from the React decks.",
        },
        {
          p: "The meta-lever is measurement: prefer field data from real users to lab runs, keep a performance budget in CI, and work one metric at a time.",
        },
      ],
    },
    {
      id: "notifications-system",
      type: "design",
      title: "Design the notification system",
      prompt: [
        {
          p: "The capstone: an in-app notification center. Badge count in the header, a dropdown list, mark-as-read, live delivery. Walk the four layers and name the tradeoffs.",
        },
      ],
      answer: [
        {
          p: "Data: a notification is `{ id, type, actorId, targetId, readAt, createdAt }`, holding references that get hydrated through the batched entity fetches from the async deck. The unread count is its own tiny endpoint, because the badge must be cheap and the list can be lazy.",
        },
        {
          p: "State: the list is cursor-paginated server state, fetched when the dropdown first opens rather than on page load. The count is server state with live updates layered on. Mark-as-read is an optimistic update that decrements the badge immediately and reconciles with the server's count on the next sync rather than trusting client arithmetic.",
        },
        {
          p: "Delivery: SSE or an existing WebSocket pushes “count changed” events, and the client refetches the count. Pushing invalidations instead of data keeps events tiny, idempotent, and safe to deliver twice or out of order. Polling every 60 seconds is the fallback, and an honest v1.",
        },
        {
          ul: [
            "Badge count caps at “9+”, which conveniently tolerates approximate counts.",
            "Read state syncs across tabs (storage events or the push channel), or the badge lies.",
            "Batch aggregation (“3 people liked…”) belongs server-side in the data model rather than in the client.",
          ],
        },
      ],
    },
  ],
};
