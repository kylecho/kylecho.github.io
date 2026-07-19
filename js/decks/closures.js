export default {
  id: "closures",
  number: "01",
  title: "Closures & composition",
  blurb:
    "Closure mechanics and the higher-order wrappers built on them: once, debounce, memoize, retry, pipe.",
  cards: [
    {
      id: "loop-var",
      type: "predict",
      title: "The loop that logs the wrong thing",
      prompt: [
        { p: "What does this log, and what one-word change fixes it?" },
        {
          code: `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}`,
        },
      ],
      answer: [
        {
          p: "It logs `3 3 3`. `var` is function-scoped, so all three callbacks close over the same binding of `i`. The loop finishes (leaving `i` at 3) before any timer fires, and each callback then reads that shared final value.",
        },
        {
          p: "Changing `var` to `let` logs `0 1 2`, because `let` creates a fresh binding per iteration and each closure captures its own `i`. This is the cleanest demonstration that closures capture references to variables, not copies of values.",
        },
      ],
    },
    {
      id: "shared-env",
      type: "predict",
      title: "Two counters, one scope",
      prompt: [
        { p: "What does the last line log?" },
        {
          code: `function makeCounter() {
  let count = 0;
  return {
    inc: () => ++count,
    dec: () => --count,
  };
}

const a = makeCounter();
const b = makeCounter();

a.inc();
a.inc();
b.dec();
console.log(a.inc(), b.dec());`,
        },
      ],
      answer: [
        {
          p: "`3 -2`. Each call to `makeCounter` creates a new lexical environment, so `a` and `b` have independent counts, while `inc` and `dec` from the same call share one. `a`'s count goes 1, 2, then 3; `b`'s goes -1, then -2.",
        },
        {
          p: "Two ideas in one snippet: closures created in the same scope share an environment, and separate invocations get separate ones. It also shows why `count` is genuinely private, since nothing outside the closure can reach it.",
        },
      ],
    },
    {
      id: "define-closure",
      type: "recall",
      title: "Define it cleanly",
      prompt: [
        {
          p: "“What is a closure?” is a question you keep answering for years — in code review, while mentoring, in design docs. Give a two-sentence answer that survives follow-up questions.",
        },
      ],
      answer: [
        {
          p: "A closure is a function bundled with the lexical environment it was created in. It keeps live references to the variables that were in scope, even after the enclosing function has returned, so if a variable changes later the closure sees the new value. That last part is exactly what the `var` loop demonstrates.",
        },
        {
          p: "Follow the definition with a concrete use, like debounce's timer or a memo cache, instead of stopping at theory.",
        },
      ],
    },
    {
      id: "once",
      type: "implement",
      title: "once",
      prompt: [
        {
          p: "Implement `once(fn)`: the returned function invokes `fn` at most one time. The first call's result is cached and returned by every later call. Arguments must be forwarded.",
        },
      ],
      answer: [
        {
          code: `function once(fn) {
  let called = false;
  let result;

  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}`,
        },
        {
          p: "Two pieces of state live in the closure: the flag and the cached result. Track `called` explicitly instead of testing `result === undefined`, since `fn` may legitimately return `undefined`.",
        },
      ],
    },
    {
      id: "debounce",
      type: "implement",
      title: "debounce",
      prompt: [
        {
          p: "Implement `debounce(fn, delay)`: the wrapped function runs only after `delay` ms have passed without another call, and the last call's arguments win.",
        },
      ],
      answer: [
        {
          code: `function debounce(fn, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}`,
        },
        {
          p: "The whole mechanism is one `timer` variable held in the closure. Every call cancels the pending run and schedules a new one, so only the final call in a burst survives. Two details tend to get checked: `clearTimeout` before rescheduling, and forwarding `...args` so the eventual call sees the latest arguments.",
        },
        {
          p: "If `this` matters (methods, event handlers), switch to a `function` wrapper and call `fn.apply(this, args)`. An arrow wrapper can't forward `this`.",
        },
      ],
    },
    {
      id: "memoize",
      type: "implement",
      title: "memoize",
      prompt: [
        {
          p: "Implement `memoize(fn)`: cache results by arguments so repeated calls with the same inputs skip `fn` entirely.",
        },
      ],
      answer: [
        {
          code: `function memoize(fn) {
  const cache = new Map();

  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}`,
        },
        { p: "`JSON.stringify` as the key is the pragmatic default, but mention its limits:" },
        {
          ul: [
            "It only works for serializable arguments.",
            "Two equivalent objects with different key order produce different keys.",
            "The cache grows without bound.",
          ],
        },
        {
          p: "A good follow-up if memory comes up: for a single object argument, a `WeakMap` keyed on the object lets cache entries be garbage-collected along with their keys.",
        },
      ],
    },
    {
      id: "with-retry",
      type: "implement",
      title: "withRetry",
      prompt: [
        {
          p: "Implement `withRetry(fn, retries)`: wrap an async function so a failure retries up to `retries` more times, and the final failure rethrows.",
        },
      ],
      answer: [
        {
          code: `const withRetry = (fn, retries) => async (...args) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(...args);
    } catch (err) {
      if (attempt === retries) throw err;
    }
  }
};`,
        },
        {
          p: "This shape, taking a function and returning a compatible function with a policy wrapped around it, is the one to practice. “Wrap this API with retry / caching / logging” shows up in every codebase that talks to a network.",
        },
        {
          p: "The `await` inside `try` is essential: without it the promise escapes the block and rejections skip the `catch`. Exponential backoff and jitter slot into the loop without changing its shape; add them when the failure mode is load rather than flakiness.",
        },
      ],
    },
    {
      id: "pipe",
      type: "implement",
      title: "pipe and compose",
      prompt: [
        {
          p: "Implement `pipe` so that `pipe(f, g, h)(x)` equals `h(g(f(x)))`. Then write `compose`, its mirror image.",
        },
      ],
      answer: [
        {
          code: `const pipe = (...fns) => x =>
  fns.reduce((value, fn) => fn(value), x);

const compose = (...fns) => x =>
  fns.reduceRight((value, fn) => fn(value), x);`,
        },
        {
          p: "`pipe` reads left to right and `compose` right to left; the implementation is the same reduce in opposite directions. Deep currying puzzles are rarely worth the practice time. `pipe` is, because it shows in one line that you treat functions as values.",
        },
      ],
    },
    {
      id: "stale-closure",
      type: "predict",
      title: "The stale closure",
      prompt: [
        { p: "What does this component render after five seconds?" },
        {
          code: `function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCount(count + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <span>{count}</span>;
}`,
        },
      ],
      answer: [
        {
          p: "`1`. The effect runs once, so the interval callback closes over the first render's `count`, which is 0, and every tick calls `setCount(0 + 1)`. After the first update the state never changes again.",
        },
        {
          p: "The fix is the functional update, `setCount(c => c + 1)`, which reads current state instead of captured state. Mechanically this is the `var` loop again: a callback outliving the value it captured. The failure has a name, “stale closure,” and knowing it matters — it's the search term that finds you the fix.",
        },
      ],
    },
    {
      id: "arg-forwarding",
      type: "recall",
      title: "Argument forwarding",
      prompt: [
        {
          p: "Every wrapper in this deck used `(...args) => fn(...args)`. What breaks without it, and when do you reach for `function` plus `apply` instead?",
        },
      ],
      answer: [
        {
          p: "Rest-and-spread forwards any call signature through the wrapper unchanged. Hardcoding parameters like `(a, b)` silently drops arguments for any other signature, so the wrapper stops being a drop-in replacement, which is its entire job.",
        },
        {
          p: "Arrow wrappers don't carry `this`. That's fine for standalone utilities, but when wrapping methods or DOM event handlers, use a `function` wrapper and `fn.apply(this, args)` so the original receiver survives.",
        },
      ],
    },
  ],
};
