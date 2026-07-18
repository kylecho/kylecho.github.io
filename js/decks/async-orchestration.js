export default {
  id: "async-orchestration",
  number: "02",
  title: "Async orchestration",
  blurb:
    "Fetching dependent data well: parallelism, batching, caching, partial failure, and race conditions.",
  cards: [
    {
      id: "five-steps",
      type: "recall",
      title: "The five-step shape",
      prompt: [
        {
          p: "Almost every “load this page's data” problem has the same optimal shape. What are the five steps?",
        },
      ],
      answer: [
        {
          ol: [
            "Fetch the root collection.",
            "Extract the IDs you need, deduped with a `Set`.",
            "Fetch dependent data in parallel with `Promise.all`.",
            "Normalize results into by-ID lookup maps (`Object.fromEntries`) for O(1) access.",
            "Compose the final structure by mapping over the original arrays, which preserves order for free.",
          ],
        },
        {
          p: "Narrate the structure before writing code (“root fetch, extract IDs, parallelize, normalize, compose”) and the implementation becomes dictation. Hesitating on the structure is what reads as rusty. The steps themselves are not hard.",
        },
        {
          p: "It isn't an interview invention, either. This is the shape of a GraphQL resolver fan-out: root query first, then batched entity loads.",
        },
      ],
    },
    {
      id: "sequential-awaits",
      type: "predict",
      title: "Sequential awaits",
      prompt: [
        {
          p: "Roughly what does the timer print, and what's the fix, given the two calls are independent?",
        },
        {
          code: `console.time("load");

const user = await fetchUser();    // resolves in ~100ms
const posts = await fetchPosts();  // resolves in ~100ms

console.timeEnd("load");`,
        },
      ],
      answer: [
        {
          p: "About 200ms. Each `await` suspends until its promise settles, so the second request doesn't even start until the first finishes. Since neither call depends on the other:",
        },
        {
          code: `const [user, posts] = await Promise.all([
  fetchUser(),
  fetchPosts(),
]);
// ~100ms`,
        },
        {
          p: "Sequential awaits on independent requests is the most common async red flag in interviews. Await sequentially only when a request needs the previous response.",
        },
      ],
    },
    {
      id: "promise-all-rejection",
      type: "predict",
      title: "When Promise.all fails",
      prompt: [
        { p: "What happens here, and when? And what still happens that you can't see?" },
        {
          code: `const results = await Promise.all([
  fetchA(),  // resolves in 100ms
  fetchB(),  // rejects in 10ms
  fetchC(),  // resolves in 300ms
]);`,
        },
      ],
      answer: [
        {
          p: "The whole expression rejects after about 10ms with B's error, because `Promise.all` short-circuits on the first rejection. A and C keep running to completion anyway, since promises aren't cancelled by being ignored. Their results are discarded.",
        },
        { p: "The follow-ups to know:" },
        {
          ul: [
            "`Promise.allSettled` when you want every outcome.",
            "A per-promise `.catch` when you want fallbacks without losing the fast-fail structure.",
            "`AbortController` when you actually need the extra work stopped.",
          ],
        },
      ],
    },
    {
      id: "partial-failure",
      type: "implement",
      title: "Surviving a flaky API",
      prompt: [
        {
          p: "A notifications feed: `fetchNotifications()` returns `[{ id, actorId, targetId }]`, then you need `fetchUsers(ids)` and `fetchTargets(ids)`, but `fetchTargets` fails randomly. A flaky API must not sink the page; missing entities should come back `null`.",
        },
      ],
      answer: [
        {
          code: `const safe = promise => promise.catch(() => null);

async function loadNotifications() {
  const notifs = await fetchNotifications();

  const actorIds = [...new Set(notifs.map(n => n.actorId))];
  const targetIds = [...new Set(notifs.map(n => n.targetId))];

  const [users, targets] = await Promise.all([
    safe(fetchUsers(actorIds)),
    safe(fetchTargets(targetIds)),
  ]);

  const userById = Object.fromEntries((users ?? []).map(u => [u.id, u]));
  const targetById = Object.fromEntries((targets ?? []).map(t => [t.id, t]));

  return notifs.map(n => ({
    id: n.id,
    actor: userById[n.actorId] ?? null,
    target: targetById[n.targetId] ?? null,
  }));
}`,
        },
        {
          p: "Catching at the promise level converts failure into a value, so `Promise.all` can't short-circuit: the parallelism stays and the page survives. The `?? []` and `?? null` fallbacks are what make the degradation graceful instead of a `TypeError` two lines later.",
        },
      ],
    },
    {
      id: "batching",
      type: "implement",
      title: "Batching under an ID limit",
      prompt: [
        {
          p: "`fetchOrders()` returns `[{ id, productIds }]`, and some orders carry 1000+ product IDs, but `fetchProducts(ids)` accepts at most 50 per request. Batch the requests, merge the results, and preserve each order's product order.",
        },
      ],
      answer: [
        {
          code: `function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function loadOrders() {
  const orders = await fetchOrders();

  const uniqueIds = [...new Set(orders.flatMap(o => o.productIds))];

  const batches = await Promise.all(
    chunk(uniqueIds, 50).map(ids => fetchProducts(ids))
  );

  const productById = Object.fromEntries(
    batches.flat().map(p => [p.id, p])
  );

  return orders.map(order => ({
    id: order.id,
    products: order.productIds.map(id => productById[id]),
  }));
}`,
        },
        {
          p: "Dedupe before chunking, or shared products get fetched repeatedly. Composing from each order's original `productIds` is what preserves order; responses can arrive in any sequence because the lookup map absorbs the difference.",
        },
        {
          p: "Mention a concurrency limit as an extension (so 40 chunks don't become 40 simultaneous requests) without building it. If the conversation goes deeper, this is DataLoader territory: batching and per-request caching is what GraphQL servers do behind every resolver.",
        },
      ],
    },
    {
      id: "promise-cache",
      type: "implement",
      title: "Cache the promise, not the result",
      prompt: [
        {
          p: "`fetchUser(id)` gets called repeatedly, and concurrently, for the same IDs. Deduplicate the calls so each ID is fetched once, including while a request is still in flight.",
        },
      ],
      answer: [
        {
          code: `const cache = new Map();

function cachedFetchUser(id) {
  if (!cache.has(id)) {
    const promise = fetchUser(id).catch(err => {
      cache.delete(id);  // a failure shouldn't poison the cache
      throw err;
    });
    cache.set(id, promise);
  }
  return cache.get(id);
}`,
        },
        {
          p: "Caching the result leaves a window where ten concurrent calls all miss and fire ten requests. Caching the promise closes it, because the promise goes into the map synchronously and every caller after the first awaits the same request. One pattern covers both the result cache and in-flight dedupe.",
        },
        {
          p: "Don't skip the `cache.delete` on failure: without it, one transient error makes that ID fail forever. This is also the core of DataLoader-style request deduplication in GraphQL layers.",
        },
      ],
    },
    {
      id: "foreach-async",
      type: "predict",
      title: "forEach meets async",
      prompt: [
        { p: "What does this log, and what's the correct version?" },
        {
          code: `const results = [];

ids.forEach(async id => {
  const item = await fetchItem(id);
  results.push(item);
});

console.log(results.length);`,
        },
      ],
      answer: [
        {
          p: "`0`. `forEach` ignores the promises its callback returns, so all the fetches are fire-and-forget and the log runs before any of them resolve. Even once they do, `results` fills in completion order, not input order.",
        },
        {
          code: `const results = await Promise.all(ids.map(fetchItem));`,
        },
        {
          p: "`map` collects the promises, `Promise.all` awaits them, and the output order matches `ids` regardless of which request finishes first.",
        },
      ],
    },
    {
      id: "latest-wins",
      type: "implement",
      title: "Latest query wins",
      prompt: [
        {
          p: "Search autocomplete: the user types quickly and each keystroke calls `fetchResults(query)`. Responses can arrive out of order. Make sure only the latest query's results are ever shown.",
        },
      ],
      answer: [
        {
          code: `let latestRequestId = 0;

async function search(query) {
  const requestId = ++latestRequestId;

  const results = await fetchResults(query);

  if (requestId !== latestRequestId) return null;  // stale — drop it

  return results;
}`,
        },
        {
          p: "Request versioning: every call takes a ticket, and after the `await` it checks whether it's still the newest. Stale responses complete but get discarded, which fixes the out-of-order problem with three lines of bookkeeping.",
        },
        {
          p: "The stronger variant is `AbortController`, which actually cancels the network request but needs signal plumbing and `AbortError` handling. Debounce doesn't replace either approach; it reduces how many requests fire but does nothing about ordering.",
        },
      ],
    },
    {
      id: "posts-page",
      type: "implement",
      title: "The posts page",
      prompt: [
        { p: "The capstone. You're given three APIs:" },
        {
          code: `fetchPosts()       // -> [{ id, authorId, commentIds }]
fetchUsers(ids)    // -> [{ id, name }]
fetchComments(ids) // -> [{ id, text, userId }]`,
        },
        {
          p: "Implement `loadPostsPage()` returning each post with its `author` resolved and its `comments` resolved, each comment carrying its `user`. No duplicate user fetches; parallelize what you can.",
        },
      ],
      answer: [
        {
          code: `async function loadPostsPage() {
  const posts = await fetchPosts();                     // 1. root

  const commentIds = posts.flatMap(p => p.commentIds);  // 2. extract
  const comments = await fetchComments(commentIds);

  const userIds = new Set([                             //    authors + commenters
    ...posts.map(p => p.authorId),
    ...comments.map(c => c.userId),
  ]);
  const users = await fetchUsers([...userIds]);         // 3. one deduped fetch

  const userById = Object.fromEntries(users.map(u => [u.id, u]));      // 4. normalize
  const commentById = Object.fromEntries(comments.map(c => [c.id, c]));

  return posts.map(post => ({                           // 5. compose
    id: post.id,
    author: userById[post.authorId],
    comments: post.commentIds.map(id => {
      const c = commentById[id];
      return { id: c.id, text: c.text, user: userById[c.userId] };
    }),
  }));
}`,
        },
        {
          p: "The dependency chain forces one sequencing decision: user IDs come from both posts and comments, so a single deduped user fetch has to wait for comments. The alternative fetches author users in parallel with comments, then commenter users after; it's still two rounds, but author data arrives a round earlier at the cost of an extra request. Either answer is fine if you show you chose it.",
        },
        {
          p: "Explaining the five-step structure while you write matters as much as the code, which is just the shape from the first card applied twice.",
        },
      ],
    },
    {
      id: "why-normalize",
      type: "recall",
      title: "Why the lookup map",
      prompt: [
        {
          p: "Your compose step needs to attach a user to each of 500 comments. Why do interviewers care whether you use `.find()` or a lookup map?",
        },
      ],
      answer: [
        {
          p: "`.find()` inside a loop is a linear scan per element, O(n·m) across the compose step, and it reads as not knowing better. Building `Object.fromEntries(users.map(u => [u.id, u]))` once makes every lookup O(1), and the same map serves authors, commenters, and anything else.",
        },
        {
          p: "It also shows the normalize step is a habit rather than an optimization you reach for under pressure. A plain object is fine for string or number IDs; use a `Map` when keys are objects or insertion order matters.",
        },
      ],
    },
  ],
};
