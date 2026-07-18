export default {
  id: "react-patterns",
  number: "03",
  title: "React patterns",
  blurb:
    "Designing component APIs: controlled inputs, compound components, context architecture, and the re-render traps.",
  cards: [
    {
      id: "controlled-uncontrolled",
      type: "recall",
      title: "Controlled vs uncontrolled",
      prompt: [
        {
          p: "The warm-up question in nearly every React interview: controlled vs uncontrolled inputs. Define both and give the tradeoff.",
        },
      ],
      answer: [
        {
          code: `// Controlled — React state is the source of truth
<input value={value} onChange={e => setValue(e.target.value)} />

// Uncontrolled — the DOM holds the value, read it when needed
<input ref={ref} defaultValue="..." />`,
        },
        {
          p: "Controlled inputs give you validation, formatting, and syncing on every keystroke, at the cost of a render per keystroke. Uncontrolled inputs are lighter, and fine for simple forms where you only need the value at submit.",
        },
        {
          p: "The real question is where the source of truth lives, and you can choose per field. Large performance-sensitive forms often go uncontrolled with refs; anything that reacts to input as it's typed must be controlled.",
        },
      ],
    },
    {
      id: "custom-hooks",
      type: "recall",
      title: "What makes a custom hook good",
      prompt: [
        {
          p: "What's the design rule for custom hooks, and why did hooks replace render props for sharing logic?",
        },
      ],
      answer: [
        {
          p: "Hooks encapsulate logic, not UI. A good hook like `useToggle` or `useFetch` owns state and behavior and returns values plus actions; it says nothing about rendering. The moment a hook returns JSX, it has picked up a second job.",
        },
        {
          code: `function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(s => !s), []);
  return [on, toggle];
}`,
        },
        {
          p: "Render props solved the same problem of sharing stateful logic, but every layer added nesting and its own render scope. Hooks compose flatly; three hooks in a component read as three lines rather than three wrappers.",
        },
      ],
    },
    {
      id: "provider-hook",
      type: "implement",
      title: "The provider + hook pattern",
      prompt: [
        {
          p: "Set up a context the canonical way: a provider that owns the state, and a custom hook that gives consumers safe access, including a useful failure when there's no provider above.",
        },
      ],
      answer: [
        {
          code: `const ThemeContext = createContext(null);

function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}`,
        },
        {
          p: "The structure is always the same three layers: provider owns state and logic, hook wraps `useContext` with a guard, components consume the hook. The null-check throw turns a silent `undefined` bug into an immediate, named error.",
        },
        {
          p: "One behavior worth stating explicitly: `useContext` resolves to the nearest provider above in the tree, which is what makes two sibling providers fully isolated instances of the same context.",
        },
      ],
    },
    {
      id: "compound-components",
      type: "implement",
      title: "Compound components",
      prompt: [
        { p: "Design a Tabs component with this API — the design-system classic:" },
        {
          code: `<Tabs>
  <Tabs.List>
    <Tabs.Tab index={0}>First</Tabs.Tab>
    <Tabs.Tab index={1}>Second</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel index={0}>…</Tabs.Panel>
  <Tabs.Panel index={1}>…</Tabs.Panel>
</Tabs>`,
        },
        { p: "Sketch the implementation. Where does the active-tab state live, and how do the pieces talk?" },
      ],
      answer: [
        {
          code: `const TabsContext = createContext(null);

function Tabs({ children }) {
  const [active, setActive] = useState(0);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

Tabs.List = ({ children }) => <div role="tablist">{children}</div>;

Tabs.Tab = ({ index, children }) => {
  const { active, setActive } = useContext(TabsContext);
  return (
    <button
      role="tab"
      aria-selected={active === index}
      onClick={() => setActive(index)}
    >
      {children}
    </button>
  );
};

Tabs.Panel = ({ index, children }) => {
  const { active } = useContext(TabsContext);
  return active === index ? <div role="tabpanel">{children}</div> : null;
};`,
        },
        {
          p: "The parent owns the state, and context is the private channel between the pieces, so consumers compose the markup freely without threading props. This is what “design the API, not the component” means in practice: the public surface stays flexible while the state wiring stays hidden.",
        },
      ],
    },
    {
      id: "form-system",
      type: "implement",
      title: "A reusable form system",
      prompt: [
        {
          p: "Build the skeleton of a form library: a `Form` that owns all field values and a `Field` that reads and writes just its own. The key architecture question — who owns the state?",
        },
      ],
      answer: [
        {
          code: `const FormContext = createContext(null);

function useForm() {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("useForm must be used within <Form>");
  return ctx;
}

function Form({ children, initialValues = {} }) {
  const [values, setValues] = useState(initialValues);

  const setFieldValue = useCallback((name, value) => {
    setValues(v => ({ ...v, [name]: value }));
  }, []);

  const ctx = useMemo(() => ({ values, setFieldValue }), [values, setFieldValue]);

  return <FormContext.Provider value={ctx}>{children}</FormContext.Provider>;
}

function Field({ name, ...props }) {
  const { values, setFieldValue } = useForm();
  return (
    <input
      {...props}
      value={values[name] ?? ""}
      onChange={e => setFieldValue(name, e.target.value)}
    />
  );
}`,
        },
        {
          p: "Form owns state; Field consumes it. The tempting wrong design, where each Field holds its own state, makes validation and submission impossible to coordinate.",
        },
        { p: "Natural follow-ups to be ready for:" },
        {
          ul: [
            "Validation injected as a prop (inversion of control).",
            "Dynamic fields rendered from a `map`.",
            "Nested names like `user.email`.",
          ],
        },
        { p: "Each slots into this skeleton without changing its shape." },
      ],
    },
    {
      id: "context-rerender",
      type: "predict",
      title: "The context re-render trap",
      prompt: [
        { p: "`user` never changes, but `App` re-renders every second. What happens to `Profile`, and why?" },
        {
          code: `function App() {
  const [user] = useState({ name: "Kyle" });
  const [tick, setTick] = useState(0);  // updates every second

  return (
    <UserContext.Provider value={{ user }}>
      <Profile />          {/* reads UserContext */}
      <Clock tick={tick} />
    </UserContext.Provider>
  );
}`,
        },
      ],
      answer: [
        {
          p: "`Profile` re-renders every second. `value={{ user }}` builds a fresh object on every `App` render, and context consumers re-render whenever the value's identity changes, even if the contents are equal.",
        },
        {
          p: "Wrapping `Profile` in `React.memo` won't save it: context updates bypass memo entirely. The fixes are `useMemo` on the value (`useMemo(() => ({ user }), [user])`) or splitting fast-changing and slow-changing state into separate contexts. A hand-rolled selector hook over plain `useContext` does not help, because `useContext` re-renders the consumer before any selector runs; real slice subscriptions need the `use-context-selector` library or an external store via `useSyncExternalStore`.",
        },
      ],
    },
    {
      id: "context-boundaries",
      type: "recall",
      title: "When context is the wrong tool",
      prompt: [
        {
          p: "Context gets overused. What belongs in it, what doesn't, and what's the one-line framing that shows you know the difference?",
        },
      ],
      answer: [
        { p: "Good fits:" },
        {
          ul: [
            "Theme, auth, and feature flags.",
            "Dependency injection (APIs, services).",
            "Coordinated but infrequent state, like a form or modal registry.",
          ],
        },
        {
          p: "Bad fits: anything high-frequency (keystrokes, animation frames, large objects that churn), because every update fans out to every consumer.",
        },
        {
          p: "The one-liner: context is distribution, not state management. It transports state to consumers; it isn't built to manage fast-moving state. That's why form and store libraries (React Hook Form, Zustand) keep state outside React and use subscriptions, so consumers re-render only on the slice they read.",
        },
      ],
    },
    {
      id: "usecallback-stale",
      type: "predict",
      title: "useCallback's stale closure",
      prompt: [
        { p: "Click +1 three times, then click Log. What prints?" },
        {
          code: `function Counter() {
  const [count, setCount] = useState(0);

  const logCount = useCallback(() => {
    console.log(count);
  }, []);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
      <button onClick={logCount}>Log</button>
    </>
  );
}`,
        },
      ],
      answer: [
        {
          p: "`0`. The empty dependency array freezes the first render's function, and that function closed over the first render's `count`. `useCallback` doesn't keep a function fresh. It deliberately keeps it stale in exchange for a stable identity.",
        },
        {
          p: "The plain fix is `[count]` in the deps, accepting a new identity per change. When you need fresh values and a stable identity at the same time, that's the useEvent pattern on the next card.",
        },
      ],
    },
    {
      id: "use-event",
      type: "implement",
      title: "useEvent — stable identity, fresh values",
      prompt: [
        {
          p: "Implement `useEvent(fn)`: the returned function has a stable identity forever, but always calls the latest `fn`. No stale closures, no dependency churn.",
        },
      ],
      answer: [
        {
          code: `function useEvent(fn) {
  const ref = useRef(fn);
  ref.current = fn;

  return useCallback((...args) => ref.current(...args), []);
}`,
        },
        {
          p: "The ref is re-pointed at the fresh closure on every render, while the returned wrapper (stable, empty deps) reads through it at call time, so the identity stays fixed and the values stay current.",
        },
        {
          p: "Reach for this when a memoized child needs a callback that sees current state, or an effect needs a handler without re-subscribing on every change. React's RFC version assigns the ref in a layout effect to avoid render-phase writes; mention that if asked, but don't hand-roll it in an interview.",
        },
      ],
    },
    {
      id: "optimistic-update",
      type: "implement",
      title: "Optimistic update with rollback",
      prompt: [
        {
          p: "A like button should feel instant, but the API call can fail. Implement the toggle so the UI updates immediately and recovers on failure.",
        },
      ],
      answer: [
        {
          code: `async function toggleLike(post) {
  setPosts(prev => prev.map(p =>
    p.id === post.id ? { ...p, liked: !post.liked } : p
  ));

  try {
    await api.setLiked(post.id, !post.liked);
  } catch {
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, liked: post.liked } : p
    ));  // roll back to what we knew
  }
}`,
        },
        {
          p: "Apply the change immediately, remember what you're rolling back to, and revert on failure. The snapshot here is the captured `post.liked`, and the functional updates keep both writes safe against whatever else changed `posts` in between.",
        },
        {
          p: "Two extensions worth raising: reconciling with the server's response instead of trusting the optimistic value, and the case where the user toggles twice before the first request settles, which brings back request versioning from the async deck.",
        },
      ],
    },
  ],
};
