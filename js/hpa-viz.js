// Autoscaler demo for the "half idle, fully busy" essay. Two fleets, same
// traffic, different signals.
//
// The controller is real: the Kubernetes HPA algorithm as documented, with
// its actual defaults (15s sync period, 10% tolerance, 300s scale-down
// stabilization window, and the max-of-100%-or-4-pods scale-up limit).
//
// The workload underneath it is a model, not a measurement: a queue fed at
// the offered rate and drained at the pod's capacity. Its constants are
// fitted to the benchmark table in the essay (~3.6ms of event-loop work per
// request, 40ms downstream, 4 libuv pool threads) so the curve it produces
// matches what the real service did.
(() => {
  const host = document.getElementById("hpa-viz");
  if (!host) return;

  // --- Kubernetes defaults, unchanged ---------------------------------------
  const MIN_REPLICAS = 2;
  const MAX_REPLICAS = 24;
  const SYNC_PERIOD = 15; // seconds between HPA evaluations
  const TOLERANCE = 0.1; // no action while the ratio sits inside ±10%
  const DOWN_STABILIZATION = 300; // scale-down uses the max over this window

  // --- workload model constants --------------------------------------------
  const STARTUP_S = 20; // image pull, boot, JIT warmup before a pod serves
  const DOWNSTREAM_MS = 40;
  const POOL_THREADS = 4;
  const TIMEOUT_S = 10; // callers give up, so the backlog can't grow forever

  const SIM_STEP = 0.5; // simulated seconds per tick
  const TICK_MS = 30; // real ms per tick, so 1 simulated second ≈ 60ms

  const TARGETS = { cpu: 0.7, elu: 0.7, lag: 50 };

  const PRESETS = {
    gateway: {
      label: "i/o-heavy gateway",
      loopMs: 3.57,
      poolMs: 0,
      cpuRequest: 2,
      traffic: 600,
      leftSignal: "cpu",
      note:
        "Every pod is pegged. CPU reads about half the request and the left " +
        "fleet never scales; ELU reads 100% and the right fleet does.",
    },
    step: {
      label: "traffic step",
      loopMs: 3.57,
      poolMs: 0,
      cpuRequest: 2,
      traffic: 400,
      stepTo: 1200,
      stepAt: 30,
      leftSignal: "lag",
      note:
        "Traffic triples at 30s. Lag sits near zero until it doesn't, so the " +
        "left fleet gets no warning and then overcorrects.",
    },
    compress: {
      label: "compression on",
      loopMs: 1.0,
      poolMs: 11,
      cpuRequest: 2,
      traffic: 400,
      leftSignal: "cpu",
      note:
        "Response compression runs on the libuv pool, off the loop. CPU reads " +
        "high, the loop is nearly idle, and nothing is actually saturated.",
    },
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  host.innerHTML = `
    <p class="deck-meta">Watch it &mdash; two autoscalers, one traffic stream</p>
    <p class="hviz-premise">
      <span>offered traffic</span>
      <strong data-traffic-big>600/s</strong>
      <span>&rarr; split evenly across each fleet&rsquo;s ready pods</span>
    </p>
    <div class="hviz-grid">
      ${["left", "right"]
        .map(
          (side) => `
      <figure class="hviz-fleet" data-fleet="${side}">
        <figcaption>
          <span class="hviz-scaling">scaling on</span>
          <span class="hviz-signal" data-signal-name></span>
        </figcaption>
        <p class="hviz-metric"><span data-metric>&mdash;</span><span class="hviz-verdict" data-verdict></span></p>
        <p class="hviz-metric-sub">what this autoscaler reads &middot; <span data-target></span></p>
        <div class="hviz-gauges">
          <div class="hviz-gauge">
            <span>ELU</span>
            <div class="hviz-bar"><i data-gauge-elu></i><u class="hviz-tick"></u></div>
            <b data-gauge-elu-val>0%</b>
          </div>
          <div class="hviz-gauge">
            <span>CPU</span>
            <div class="hviz-bar"><i data-gauge-cpu></i><u class="hviz-tick"></u></div>
            <b data-gauge-cpu-val>0%</b>
          </div>
          <p class="hviz-legend"><u class="hviz-tick-key"></u> <span>70% target</span> <span>&middot; per-pod values</span></p>
        </div>
        <div class="hviz-podrow">
          <span>replicas</span>
          <b data-replicas>2</b>
          <div class="hviz-pods" data-pods aria-hidden="true"></div>
        </div>
        <p class="hviz-foot" data-p99>p99 &mdash;</p>
        <div class="hviz-sparkwrap">
          <span>replicas over time &middot; scale 0&ndash;${MAX_REPLICAS}</span>
          <svg class="hviz-spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
            <polyline data-spark fill="none" stroke="currentColor" stroke-width="1.5"
              vector-effect="non-scaling-stroke" points=""></polyline>
          </svg>
        </div>
      </figure>`
        )
        .join("")}
    </div>
    <div class="hviz-controls">
      <div class="hviz-ctl">
        <span class="hviz-ctl-label">scenario</span>
        <div class="viz-modes" data-presets>
          ${Object.entries(PRESETS)
            .map(
              ([key, p], i) =>
                `<button class="btn viz-mode${i === 0 ? " is-on" : ""}" type="button"
                  data-preset="${key}" aria-pressed="${i === 0}">${p.label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="hviz-ctl">
        <span class="hviz-ctl-label">left fleet scales on</span>
        <div class="viz-modes">
          <button class="btn viz-mode is-on" type="button" data-signal="cpu" aria-pressed="true">cpu</button>
          <button class="btn viz-mode" type="button" data-signal="lag" aria-pressed="false">lag</button>
        </div>
      </div>
      <div class="hviz-ctl hviz-ctl-wide">
        <span class="hviz-ctl-label">traffic &amp; playback</span>
        <div class="cviz-sliders">
          <label><input type="range" min="100" max="2400" step="50" value="600" data-traffic>
            <span data-traffic-val>600/s</span></label>
          <span class="hviz-playback">
            <button class="btn" type="button" data-play>${reduced ? "Play" : "Pause"}</button>
            <button class="btn" type="button" data-reset>Reset</button>
          </span>
        </div>
      </div>
    </div>
    <p class="viz-status" role="status"></p>
    <p class="viz-counters" data-clock></p>`;

  const els = {};
  for (const side of ["left", "right"]) {
    const root = host.querySelector(`[data-fleet="${side}"]`);
    els[side] = {
      root,
      signalName: root.querySelector("[data-signal-name]"),
      target: root.querySelector("[data-target]"),
      metric: root.querySelector("[data-metric]"),
      verdict: root.querySelector("[data-verdict]"),
      gaugeElu: root.querySelector("[data-gauge-elu]"),
      gaugeEluVal: root.querySelector("[data-gauge-elu-val]"),
      gaugeCpu: root.querySelector("[data-gauge-cpu]"),
      gaugeCpuVal: root.querySelector("[data-gauge-cpu-val]"),
      pods: root.querySelector("[data-pods]"),
      replicas: root.querySelector("[data-replicas]"),
      p99: root.querySelector("[data-p99]"),
      spark: root.querySelector("[data-spark]"),
    };
  }
  const statusEl = host.querySelector(".viz-status");
  const clockEl = host.querySelector("[data-clock]");
  const trafficInput = host.querySelector("[data-traffic]");
  const trafficVal = host.querySelector("[data-traffic-val]");
  const trafficBigEl = host.querySelector("[data-traffic-big]");
  const playBtn = host.querySelector("[data-play]");

  let sim = null;

  function makeFleet(signal) {
    return {
      signal,
      // one pod per entry; readyAt is when it starts taking traffic
      pods: Array.from({ length: MIN_REPLICAS }, () => ({ readyAt: 0 })),
      queue: 0, // backlogged requests per ready pod
      recs: [], // { t, v } recommendations, for the scale-down window
      elu: 0,
      cpuUtil: 0,
      lagMs: 0,
      p99: DOWNSTREAM_MS,
      history: [],
      lastSync: 0,
    };
  }

  function reset(presetKey) {
    const preset = PRESETS[presetKey];
    sim = {
      presetKey,
      preset,
      t: 0,
      traffic: preset.traffic,
      left: makeFleet(preset.leftSignal),
      right: makeFleet("elu"),
      acc: 0,
    };
    trafficInput.value = preset.traffic;
    trafficVal.textContent = `${preset.traffic}/s`;
    syncSignalButtons(preset.leftSignal);
    statusEl.textContent = preset.note;
  }

  function syncSignalButtons(signal) {
    host.querySelectorAll("[data-signal]").forEach((b) => {
      const on = b.dataset.signal === signal;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  const readyCount = (f, t) => f.pods.filter((p) => p.readyAt <= t).length;

  // --- workload model -------------------------------------------------------
  // f.queue is the whole fleet's backlog. Keeping it as a total rather than a
  // per-pod figure means adding and removing pods needs no redistribution:
  // the same backlog is simply divided among however many are ready.
  function stepWorkload(f, dt) {
    const { loopMs, poolMs, cpuRequest } = sim.preset;
    const ready = Math.max(1, readyCount(f, sim.t));

    // The loop runs one request's JS at a time; the pool has four threads.
    // Whichever runs out first is the pod's capacity.
    const loopCap = 1000 / loopMs;
    const poolCap = poolMs > 0 ? (POOL_THREADS * 1000) / poolMs : Infinity;
    const capacity = Math.min(loopCap, poolCap);
    const fleetCap = capacity * ready;

    const arrivals = sim.traffic * dt;
    const drained = Math.min(f.queue + arrivals, fleetCap * dt);
    // Anything queued behind more than TIMEOUT_S of work is abandoned rather
    // than waited on, which is what bounds latency on a real overloaded pod.
    f.queue = Math.min(
      Math.max(0, f.queue + arrivals - drained),
      fleetCap * TIMEOUT_S
    );

    // With a backlog the pods run flat out, so served rate is the capacity;
    // without one it's just the arrival rate. This expression covers both.
    const servedPerPod = drained / dt / ready;

    f.elu = Math.min(1, servedPerPod / loopCap);
    const poolCores = Math.min(POOL_THREADS, (servedPerPod * poolMs) / 1000);
    f.cpuUtil = (f.elu + poolCores) / cpuRequest;

    // Backlog is what turns into waiting.
    f.lagMs = (f.queue / fleetCap) * 1000;
    f.p99 = DOWNSTREAM_MS + f.lagMs + loopMs * 2;
  }

  // --- the HPA itself, per the documented algorithm -------------------------
  function metricFor(f) {
    if (f.signal === "cpu") return f.cpuUtil;
    if (f.signal === "lag") return f.lagMs;
    return f.elu;
  }

  function hpaSync(f) {
    const current = f.pods.length;
    const metric = metricFor(f);
    const ratio = metric / TARGETS[f.signal];

    let desired = current;
    if (Math.abs(ratio - 1) > TOLERANCE) {
      desired = Math.ceil(current * ratio);
    }
    desired = Math.max(MIN_REPLICAS, Math.min(MAX_REPLICAS, desired));

    f.recs.push({ t: sim.t, v: desired });
    f.recs = f.recs.filter((r) => sim.t - r.t <= DOWN_STABILIZATION);

    if (desired > current) {
      // scale-up limit: 100% of current, or 4 pods, whichever is larger
      const cap = Math.max(current * 2, current + 4);
      desired = Math.min(desired, cap);
      for (let i = current; i < desired; i++) {
        f.pods.push({ readyAt: sim.t + STARTUP_S });
      }
    } else if (desired < current) {
      // scale-down waits for the highest recommendation in the window
      const stabilized = Math.max(...f.recs.map((r) => r.v));
      desired = Math.min(current, stabilized);
      if (desired < current) {
        // drop the newest pods first; the backlog is a fleet total, so it
        // needs no adjustment when the fleet shrinks
        f.pods.sort((a, b) => a.readyAt - b.readyAt);
        f.pods.length = desired;
      }
    }

    f.history.push(f.pods.length);
    if (f.history.length > 120) f.history.shift();
  }

  function stepSim(dt) {
    const p = sim.preset;
    if (p.stepTo && sim.t >= p.stepAt && sim.traffic === p.traffic) {
      sim.traffic = p.stepTo;
      trafficInput.value = Math.min(Number(trafficInput.max), p.stepTo);
      trafficVal.textContent = `${p.stepTo}/s`;
    }
    sim.t += dt;
    for (const f of [sim.left, sim.right]) {
      stepWorkload(f, dt);
      if (sim.t - f.lastSync >= SYNC_PERIOD) {
        f.lastSync = sim.t;
        hpaSync(f);
      }
    }
  }

  // --- rendering ------------------------------------------------------------
  const fmt = {
    cpu: (v) => `${Math.round(v * 100)}%`,
    elu: (v) => `${Math.round(v * 100)}%`,
    lag: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`),
  };
  const NAMES = { cpu: "cpu utilization", elu: "event-loop utilization", lag: "event-loop lag" };

  function renderFleet(side, f) {
    const e = els[side];
    const metric = metricFor(f);
    const target = TARGETS[f.signal];

    e.signalName.textContent = NAMES[f.signal];
    e.target.textContent = `target ${fmt[f.signal](target)}`;
    e.metric.textContent = fmt[f.signal](metric);

    const over = metric > target * (1 + TOLERANCE);
    const under = metric < target * (1 - TOLERANCE);
    e.metric.parentElement.classList.toggle("is-over", over);

    // Say what the controller can actually do, not just what it wants. A
    // fleet stuck on its floor while latency climbs is the whole point.
    const atFloor = f.pods.length <= MIN_REPLICAS;
    const atCeiling = f.pods.length >= MAX_REPLICAS;
    e.verdict.textContent = over
      ? atCeiling
        ? "at ceiling"
        : "scaling up"
      : under
      ? atFloor
        ? "at floor"
        : "scaling down"
      : "holding";

    e.gaugeElu.style.width = `${Math.min(100, f.elu * 100)}%`;
    e.gaugeEluVal.textContent = `${Math.round(f.elu * 100)}%`;
    e.gaugeCpu.style.width = `${Math.min(100, f.cpuUtil * 100)}%`;
    e.gaugeCpuVal.textContent = `${Math.round(f.cpuUtil * 100)}%`;
    e.gaugeCpu.parentElement.classList.toggle("is-past", f.cpuUtil > 1);

    const ready = readyCount(f, sim.t);
    if (e.pods.childElementCount !== f.pods.length) {
      e.pods.replaceChildren(
        ...f.pods.map(() => {
          const d = document.createElement("i");
          d.className = "hviz-pod";
          return d;
        })
      );
    }
    [...e.pods.children].forEach((el, i) => {
      el.classList.toggle("is-pending", i >= ready);
    });

    const starting = f.pods.length - ready;
    e.replicas.textContent = starting
      ? `${f.pods.length} (${starting} starting)`
      : `${f.pods.length}`;
    e.p99.textContent = `p99 ${fmt.lag(f.p99)}`;
    e.p99.classList.toggle("is-bad", f.p99 > 250);

    if (f.history.length > 1) {
      const max = Math.max(MAX_REPLICAS, ...f.history);
      const pts = f.history
        .map((v, i) => {
          const x = (i / (f.history.length - 1)) * 120;
          const y = 30 - (v / max) * 28;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      e.spark.setAttribute("points", pts);
    }
  }

  function render() {
    renderFleet("left", sim.left);
    renderFleet("right", sim.right);
    trafficBigEl.textContent = `${sim.traffic}/s`;
    clockEl.textContent =
      `t+${Math.round(sim.t)}s · ${sim.traffic}/s offered · ` +
      `hpa syncs every ${SYNC_PERIOD}s · new pods ready after ${STARTUP_S}s · ` +
      `workload simulated, controller is the real algorithm`;
  }

  // --- loop -----------------------------------------------------------------
  let running = !reduced;
  let raf = null;
  let lastFrame = 0;

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    let elapsed = now - lastFrame;
    lastFrame = now;
    // Clamp so a backgrounded tab doesn't fast-forward minutes on return
    elapsed = Math.min(elapsed, 250);
    sim.acc += elapsed;
    while (sim.acc >= TICK_MS) {
      sim.acc -= TICK_MS;
      stepSim(SIM_STEP);
    }
    render();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) cancelAnimationFrame(raf);
    lastFrame = 0;
    running = true;
    playBtn.textContent = "Pause";
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    playBtn.textContent = "Play";
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // --- controls -------------------------------------------------------------
  host.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      host.querySelectorAll("[data-preset]").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      reset(btn.dataset.preset);
      if (reduced) {
        settle();
        render();
      } else {
        start();
      }
    });
  });

  host.querySelectorAll("[data-signal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncSignalButtons(btn.dataset.signal);
      sim.left = makeFleet(btn.dataset.signal);
      statusEl.textContent =
        btn.dataset.signal === "lag"
          ? "Lag is flat while there's headroom, then vertical. The controller " +
            "multiplies by whatever it reads, so it overshoots and then flaps."
          : sim.preset.note;
      if (reduced) {
        settle();
        render();
      }
    });
  });

  trafficInput.addEventListener("input", (e) => {
    sim.traffic = Number(e.target.value);
    trafficVal.textContent = `${sim.traffic}/s`;
    // a hand-set rate should stick, so drop the preset's scripted step
    sim.preset = { ...sim.preset, stepTo: 0 };
    if (reduced) {
      settle();
      render();
    }
  });

  playBtn.addEventListener("click", () => (running ? stop() : start()));
  host.querySelector("[data-reset]").addEventListener("click", () => {
    reset(sim.presetKey);
    if (reduced) settle();
    render();
  });

  // Reduced motion: run the model forward with no animation and show where
  // each fleet lands, so the comparison is still legible without movement.
  function settle(seconds = 420) {
    for (let i = 0; i < seconds / SIM_STEP; i++) stepSim(SIM_STEP);
  }

  reset("gateway");
  if (reduced) {
    settle();
    render();
  } else {
    start();
  }
})();
