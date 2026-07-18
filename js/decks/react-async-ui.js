export default {
  id: "react-async-ui",
  number: "04",
  title: "React async UI",
  blurb:
    "Async data in components without race conditions: useFetch, debounced search, infinite scroll, and re-render control.",
  cards: [
    {
      id: "effect-race",
      type: "predict",
      title: "The out-of-order response",
      prompt: [
        {
          p: "The user types “a”, then quickly “ab”. `fetchResults(\"a\")` takes 300ms; `fetchResults(\"ab\")` takes 100ms. What does the list show after 300ms?",
        },
        {
          code: `function Results({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetchResults(query).then(setResults);
  }, [query]);

  return <List items={results} />;
}`,
        },
      ],
      answer: [
        {
          p: "The results for “a”, the stale query. Both effects run, but whichever response settles last wins the state, and here the older request finishes second. The UI ends up showing results that don't match the input.",
        },
        {
          code: `useEffect(() => {
  let cancelled = false;
  fetchResults(query).then(r => {
    if (!cancelled) setResults(r);
  });
  return () => { cancelled = true; };
}, [query]);`,
        },
        {
          p: "The canonical React fix: the effect's cleanup runs before the next effect, so each request gets a flag that's flipped the moment its query is superseded. Same idea as request versioning, expressed through the effect lifecycle.",
        },
        {
          p: "The same discipline applies anywhere updates arrive faster than they settle: live maps, collaborative editors, dashboards. The question is always whether this response is still the one you want, and the answer has to be explicit in the code.",
        },
      ],
    },
    {
      id: "use-fetch",
      type: "implement",
      title: "useFetch",
      prompt: [
        { p: "The foundation hook. Implement:" },
        { code: `const { data, loading, error, refetch } = useFetch(fetchFn, deps);` },
        {
          p: "Requirements: fetch on mount and when deps change, expose loading and error states, ignore stale responses, and support manual `refetch()`.",
        },
      ],
      answer: [
        {
          code: `function useFetch(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const reqIdRef = useRef(0);  // identifies the latest request

  const run = useCallback(async () => {
    const reqId = ++reqIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      if (reqId !== reqIdRef.current) return;  // stale — drop it
      setData(result);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refetch: run };
}`,
        },
        {
          p: "The request counter lives in a ref because it must persist across renders without causing any; it's bookkeeping, not UI state. Every state write after the `await` is guarded, including the ones in `catch` and `finally`, so a stale request can't touch anything once it has been superseded.",
        },
        {
          p: "Passing `deps` through to `useCallback` (rather than depending on `fetchFn`) is deliberate: callers pass inline arrows, and a new function identity every render would refetch in a loop. And `refetch` needs no extra code, since it's just `run`.",
        },
      ],
    },
    {
      id: "use-debounce",
      type: "implement",
      title: "useDebounce",
      prompt: [
        {
          p: "Implement `useDebounce(value, delay)`: the returned value trails the input, updating only after `delay` ms without a change. What's the line that makes it correct?",
        },
      ],
      answer: [
        {
          code: `function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}`,
        },
        {
          p: "The cleanup is the whole mechanism. Each new value schedules an update and cancels the previous one, the same clear-then-reschedule move as plain `debounce`, mapped onto the effect lifecycle. Without `clearTimeout`, every intermediate keystroke eventually lands and the value stutters through them all.",
        },
      ],
    },
    {
      id: "autocomplete",
      type: "implement",
      title: "Autocomplete, composed",
      prompt: [
        {
          p: "Build the search box: fetch as the user types, debounced 300ms, showing only the latest query's results. You have `useFetch` and `useDebounce`; the interesting part is how they compose.",
        },
      ],
      answer: [
        {
          code: `function SearchBox() {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);

  const { data, loading } = useFetch(
    () => fetchResults(debounced),
    [debounced]
  );

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      {loading && <Spinner />}
      {data?.map(r => <Row key={r.id} result={r} />)}
    </>
  );
}`,
        },
        {
          p: "Each concern has a home: input state is local and instant, `useDebounce` decides when a query is worth sending, and `useFetch` handles the request lifecycle. The component just wires them together, and that separation is most of what's being tested.",
        },
        {
          p: "Make the distinction explicit if asked: debouncing reduces how many requests fire, while the staleness check inside `useFetch` handles out-of-order responses. They solve different problems, and you need both solved.",
        },
      ],
    },
    {
      id: "infinite-scroll",
      type: "implement",
      title: "Infinite scroll",
      prompt: [
        {
          p: "Load the next page when the user scrolls near the bottom, using `fetchPage(page)`. The two classic bugs to avoid: duplicate fetches while one is in flight, and an observer callback that captured stale state.",
        },
      ],
      answer: [
        {
          code: `function InfiniteList() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef(null);

  async function loadMore() {
    if (loading) return;  // guard against duplicate triggers
    setLoading(true);

    const next = await fetchPage(page);
    setItems(prev => [...prev, ...next]);
    setPage(p => p + 1);

    setLoading(false);
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    });

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [page, loading]);

  return (
    <>
      {items.map(item => <Row key={item.id} item={item} />)}
      <div ref={sentinelRef} />
      {loading && <Spinner />}
    </>
  );
}`,
        },
        {
          p: "`IntersectionObserver` on a sentinel div is the modern answer; no scroll-event math, no throttling. The `loading` guard prevents the sentinel from firing three fetches while the first is in flight, and the effect re-subscribes as `page` and `loading` change so `loadMore` never runs with stale values.",
        },
        { p: "Extensions to offer:" },
        {
          ul: [
            "A `hasMore` flag to stop at the end.",
            "Appending with functional updates (already there).",
            "`rootMargin` to start loading before the sentinel is actually visible.",
          ],
        },
      ],
    },
    {
      id: "memo-list",
      type: "implement",
      title: "Stop the list re-rendering",
      prompt: [
        {
          p: "Every row in a 500-row list re-renders whenever the parent's unrelated state changes. Each row receives an `onClick` handler from the parent. Fix it, and know why each piece is required.",
        },
      ],
      answer: [
        {
          code: `const Row = React.memo(function Row({ item, onClick }) {
  return (
    <div>
      {item.name}
      <button onClick={() => onClick(item.id)}>Select</button>
    </div>
  );
});

function List({ items }) {
  const handleClick = useCallback(id => {
    select(id);
  }, []);

  return items.map(item => (
    <Row key={item.id} item={item} onClick={handleClick} />
  ));
}`,
        },
        {
          p: "`React.memo` skips a row when its props are shallowly equal, but an inline handler is a new function on every parent render, which defeats memo on every row. `useCallback` pins the identity; neither piece works without the other.",
        },
        {
          p: "The same logic applies to the data. If the parent rebuilds `items` with a fresh `.map` or `.filter` each render, every `item` prop is a new object and memo is defeated again. Referential equality has to hold end to end; mention it, because most answers stop at `useCallback`.",
        },
      ],
    },
    {
      id: "async-states-ux",
      type: "recall",
      title: "The three states are UX",
      prompt: [
        {
          p: "A component fetches data. What does a complete rendering of it look like, and what's the mistake interviewers are watching for?",
        },
      ],
      answer: [
        {
          code: `function Page() {
  const { data, error, loading, refetch } = useFetch(fetchData, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState onRetry={refetch} />;
  return <Content data={data} />;
}`,
        },
        {
          p: "All three states rendered, with an error state that is actionable rather than decorative. A retry button wired to `refetch` is the part candidates skip, and it's the reason `useFetch` exposes `refetch` at all: recovery is part of the hook's contract.",
        },
        {
          p: "If there's room, mention the states this model doesn't capture: refreshing while stale data is still visible, and empty results versus no results yet. Those come up in real products more than in exercises.",
        },
      ],
    },
    {
      id: "failure-modes",
      type: "recall",
      title: "Where async UI answers fall apart",
      prompt: [
        {
          p: "Last card: the three recurring mistakes that sink otherwise-working async UI solutions. Name them and their fixes.",
        },
      ],
      answer: [
        {
          p: "First, missing staleness handling: the solution works until responses arrive out of order, then shows wrong data. The fix, request versioning or effect-cleanup cancellation, should be reflexive.",
        },
        {
          p: "Second, unstable function identities: inline callbacks and un-memoized values that silently defeat `React.memo`, or worse, sit in a dependency array and turn an effect into an infinite fetch loop.",
        },
        {
          p: "Third, fetch logic tangled into components, with request state managed inline next to JSX where it can't be reused or tested. Extract the hook first, then build UI on top.",
        },
      ],
    },
  ],
};
