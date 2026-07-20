// Event-loop visualizer for the "await isn't free" essay: steps through one
// iteration of the benchmark in await or sync mode, showing the call stack,
// the microtask queue, and the per-hop cost as it accumulates.
(() => {
  const host = document.getElementById("loop-viz");
  if (!host) return;

  const NS_PER_HOP_DEFAULT = 35; // measured on the author's machine; see the post
  const N_BENCH = 1_000_000;
  let measured = null; // { awaitMs, syncMs } from the visitor's own run
  let sink = 0; // keeps the benchmark loops observable so JIT can't drop them

  const MODES = {
    await: {
      label: "await version",
      lines: [
        "for (let i = 0; i < N; i++) {",
        "  sum += await Promise.resolve(cache.get(\"k\"));",
        "}",
      ],
      phases: [
        { line: 0, desc: "Loop check: i < N.", stack: ["viaAwait()"], queue: [] },
        { line: 1, desc: "cache.get(\"k\") returns 42; Promise.resolve wraps it in a fresh resolved promise.", stack: ["viaAwait()"], queue: [] },
        { line: 1, desc: "await suspends the function. Its continuation goes to the microtask queue — that's the hop.", stack: [], queue: ["resume viaAwait"], hop: true },
        { line: 1, desc: "The event loop drains the microtask queue and puts the continuation on the stack.", stack: ["resume viaAwait"], queue: [] },
        { line: 1, desc: "sum += 42. One iteration done — five phases, one queue round-trip.", stack: ["viaAwait()"], queue: [], iter: true },
      ],
    },
    sync: {
      label: "sync version",
      lines: [
        "for (let i = 0; i < N; i++) {",
        "  sum += cache.get(\"k\");",
        "}",
      ],
      phases: [
        { line: 0, desc: "Loop check: i < N.", stack: ["viaSync()"], queue: [] },
        { line: 1, desc: "sum += cache.get(\"k\"). No promise, no suspension, no queue. Iteration done.", stack: ["viaSync()"], queue: [], iter: true },
      ],
    },
  };

  let mode = "await";
  let phaseIdx = 0;
  let iterations = 0;
  let hops = 0;
  let playTimer = null;
  let started = false;

  host.innerHTML = `
    <p class="deck-meta">Watch the runtime run it</p>
    <div class="viz-modes">
      <button class="btn viz-mode" type="button" data-mode="await"></button>
      <button class="btn viz-mode" type="button" data-mode="sync"></button>
    </div>
    <pre class="code viz-code"><code></code></pre>
    <div class="viz-lanes">
      <div class="viz-lane">
        <p class="deck-meta">Call stack</p>
        <div class="viz-slots" data-lane="stack"></div>
      </div>
      <div class="viz-lane">
        <p class="deck-meta">Microtask queue</p>
        <div class="viz-slots" data-lane="queue"></div>
      </div>
    </div>
    <p class="viz-status" role="status"></p>
    <p class="viz-counters"></p>
    <div class="viz-controls">
      <button class="btn btn-primary" type="button" data-step>Step</button>
      <button class="btn" type="button" data-play>Play</button>
      <button class="btn" type="button" data-reset>Reset</button>
    </div>
    <div class="viz-bench">
      <button class="btn" type="button" data-bench>Run it in your browser</button>
      <p class="viz-bench-result" role="status"></p>
    </div>`;

  const codeEl = host.querySelector(".viz-code code");
  const stackEl = host.querySelector('[data-lane="stack"]');
  const queueEl = host.querySelector('[data-lane="queue"]');
  const statusEl = host.querySelector(".viz-status");
  const countersEl = host.querySelector(".viz-counters");
  const playBtn = host.querySelector("[data-play]");

  function renderLane(el, chips, emptyLabel) {
    el.innerHTML = chips.length
      ? chips.map((c) => `<span class="viz-chip">${c}</span>`).join("")
      : `<span class="viz-empty">${emptyLabel}</span>`;
  }

  function render() {
    const def = MODES[mode];
    const phase = def.phases[phaseIdx];

    host.querySelectorAll(".viz-mode").forEach((btn) => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = MODES[btn.dataset.mode].label;
    });

    codeEl.innerHTML = def.lines
      .map((l, i) => `<span class="viz-line${i === phase.line ? " is-current" : ""}">${l.replace(/</g, "&lt;")}</span>`)
      .join("");

    renderLane(stackEl, phase.stack, "idle — the event loop takes over");
    renderLane(queueEl, phase.queue, "empty — suspended work waits here");

    if (!started) {
      statusEl.textContent =
        "Press Step to run one loop iteration and watch where the work goes.";
      countersEl.textContent = "";
      return;
    }

    let desc = `${phaseIdx + 1}/${def.phases.length} · ${phase.desc}`;
    if (phase.iter && iterations === 1) {
      desc +=
        mode === "await"
          ? " Now switch to the sync version — the queue never moves."
          : " No queue involved. That's the whole difference.";
    }
    statusEl.textContent = desc;

    const nsPerHop = measured
      ? Math.round((measured.awaitMs * 1e6) / N_BENCH)
      : NS_PER_HOP_DEFAULT;
    const totals = measured
      ? `your browser, 1,000,000 iterations: ${measured.awaitMs.toFixed(0)}ms vs ${measured.syncMs.toFixed(1)}ms`
      : mode === "await"
        ? "at 1,000,000 iterations: ~35ms"
        : "at 1,000,000 iterations: ~2.8ms";
    countersEl.textContent =
      `iterations ${iterations} · microtask hops ${hops}` +
      (mode === "await" ? ` · ≈ ${hops * nsPerHop}ns queued` : "") +
      ` · ${totals}`;
  }

  let hotTimer = null;

  function step() {
    const phases = MODES[mode].phases;
    if (started) {
      phaseIdx = (phaseIdx + 1) % phases.length;
    }
    started = true;
    const phase = phases[phaseIdx];
    if (phase.hop) hops += 1;
    if (phase.iter) iterations += 1;
    render();

    // Point the eye at the queue when the hop happens
    if (phase.hop) {
      const lane = queueEl.closest(".viz-lane");
      lane.classList.add("is-hot");
      clearTimeout(hotTimer);
      hotTimer = setTimeout(() => lane.classList.remove("is-hot"), 600);
    }
  }

  function reset() {
    phaseIdx = 0;
    iterations = 0;
    hops = 0;
    started = false;
    stopPlay();
    render();
  }

  function stopPlay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
      playBtn.textContent = "Play";
    }
  }

  host.querySelector("[data-step]").addEventListener("click", () => {
    stopPlay();
    step();
  });

  playBtn.addEventListener("click", () => {
    if (playTimer) {
      stopPlay();
    } else {
      playBtn.textContent = "Pause";
      playTimer = setInterval(step, 750);
    }
  });

  host.querySelector("[data-reset]").addEventListener("click", reset);

  host.querySelectorAll(".viz-mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (mode === btn.dataset.mode) return;
      mode = btn.dataset.mode;
      reset();
    });
  });

  // The real thing: both loops from the post, run in this browser.
  async function benchAwait() {
    const cache = new Map([["k", 42]]);
    let sum = 0;
    for (let i = 0; i < N_BENCH; i++) {
      sum += await Promise.resolve(cache.get("k"));
    }
    return sum;
  }

  function benchSync() {
    const cache = new Map([["k", 42]]);
    let sum = 0;
    for (let i = 0; i < N_BENCH; i++) {
      sum += cache.get("k");
    }
    return sum;
  }

  const benchBtn = host.querySelector("[data-bench]");
  const benchResultEl = host.querySelector(".viz-bench-result");

  benchBtn.addEventListener("click", async () => {
    benchBtn.disabled = true;
    benchBtn.textContent = "Running…";
    benchResultEl.textContent = "";
    await new Promise((r) => setTimeout(r, 40)); // let the button repaint first

    sink += (await benchAwait()) + benchSync(); // warm-up

    let t = performance.now();
    sink += await benchAwait();
    const awaitMs = performance.now() - t;

    t = performance.now();
    sink += benchSync();
    const syncMs = performance.now() - t;

    measured = { awaitMs, syncMs };
    benchResultEl.textContent =
      `await ${awaitMs.toFixed(1)}ms · sync ${syncMs.toFixed(1)}ms · ` +
      `${(awaitMs / Math.max(syncMs, 0.01)).toFixed(0)}x · ` +
      `~${Math.round((awaitMs * 1e6) / N_BENCH)}ns per cached await`;
    benchBtn.textContent = "Run again";
    benchBtn.disabled = false;
    render();
  });

  render();
})();
