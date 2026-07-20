// Cursor-sync demo for the "smoothness is latency" essay. The visitor's own
// pointer is sent through a simulated network (real delays, real jitter,
// stale drops) and rendered back the way a remote peer would see it.
(() => {
  const host = document.getElementById("cursor-viz");
  if (!host) return;

  const SEND_TICK_MS = 50;
  const INTERP_DELAY_MS = 100;

  const state = {
    latency: 120,
    jitter: 80,
    throttle: true,
    interpolate: false,
    seq: 0,
    lastAppliedSeq: -1,
    inFlight: [], // { deliverAt, seq, x, y, sentAt }
    snapshots: [], // applied, in arrival order: { x, y, arrivedAt, sentAt }
    pending: null, // latest local position awaiting the next send tick
    sends: [], // timestamps for the sends/s counter
    moved: false,
    interactedInterp: false,
    interactedThrottle: false,
  };

  host.innerHTML = `
    <p class="deck-meta">Feel it &mdash; your cursor, through a simulated network</p>
    <div class="cviz-stage" aria-label="Cursor sync playground">
      <span class="cviz-hint">Move your pointer in here</span>
      <span class="cviz-you" hidden></span>
      <svg class="cviz-remote" width="18" height="18" viewBox="0 0 18 18" hidden>
        <path d="M2 1 L16 8.5 L9.5 10.5 L7 17 Z" fill="currentColor"/>
      </svg>
    </div>
    <div class="cviz-sliders">
      <label>latency <input type="range" min="0" max="400" step="10" value="120" data-latency>
        <span data-latency-val>120ms</span></label>
      <label>jitter <input type="range" min="0" max="200" step="10" value="80" data-jitter>
        <span data-jitter-val>80ms</span></label>
    </div>
    <div class="viz-modes">
      <button class="btn viz-mode is-on" type="button" data-toggle="throttle" aria-pressed="true">throttle sends &middot; 50ms</button>
      <button class="btn viz-mode" type="button" data-toggle="interpolate" aria-pressed="false">interpolate &middot; render 100ms back</button>
    </div>
    <p class="viz-status" role="status">Move your pointer in the box. The blue cursor is what a remote peer would see.</p>
    <p class="viz-counters"></p>`;

  const stage = host.querySelector(".cviz-stage");
  const hintEl = host.querySelector(".cviz-hint");
  const youEl = host.querySelector(".cviz-you");
  const remoteEl = host.querySelector(".cviz-remote");
  const statusEl = host.querySelector(".viz-status");
  const countersEl = host.querySelector(".viz-counters");

  function status(text) {
    statusEl.textContent = text;
  }

  // ---- send side -----------------------------------------------------------

  function send(x, y) {
    const now = performance.now();
    state.seq += 1;
    state.sends.push(now);
    state.inFlight.push({
      deliverAt: now + state.latency + Math.random() * state.jitter,
      seq: state.seq,
      x,
      y,
      sentAt: now,
    });
  }

  stage.addEventListener(
    "pointermove",
    (event) => {
      const rect = stage.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      youEl.hidden = false;
      youEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      if (!state.moved) {
        state.moved = true;
        hintEl.hidden = true;
      }

      if (state.throttle) {
        state.pending = { x, y };
      } else {
        send(x, y);
      }
    },
    { passive: true }
  );

  setInterval(() => {
    if (state.throttle && state.pending) {
      send(state.pending.x, state.pending.y);
      state.pending = null;
    }
  }, SEND_TICK_MS);

  // ---- network + receive side ---------------------------------------------

  function deliverDue(now) {
    for (let i = 0; i < state.inFlight.length; i++) {
      const msg = state.inFlight[i];
      if (msg.deliverAt > now) continue;
      state.inFlight.splice(i, 1);
      i -= 1;
      // Jitter reorders deliveries; stale sequence numbers lose to newer ones
      if (msg.seq <= state.lastAppliedSeq) continue;
      state.lastAppliedSeq = msg.seq;
      state.snapshots.push({ x: msg.x, y: msg.y, arrivedAt: now, sentAt: msg.sentAt });
      if (state.snapshots.length > 40) state.snapshots.shift();
    }
  }

  function remotePosition(now) {
    const snaps = state.snapshots;
    if (!snaps.length) return null;

    if (!state.interpolate) {
      const latest = snaps[snaps.length - 1];
      return { x: latest.x, y: latest.y, sentAt: latest.sentAt };
    }

    const renderAt = now - INTERP_DELAY_MS;
    let before = null;
    let after = null;
    for (const s of snaps) {
      if (s.arrivedAt <= renderAt) before = s;
      else {
        after = s;
        break;
      }
    }
    if (!before) return { x: snaps[0].x, y: snaps[0].y, sentAt: snaps[0].sentAt };
    if (!after) return { x: before.x, y: before.y, sentAt: before.sentAt };

    const t = (renderAt - before.arrivedAt) / (after.arrivedAt - before.arrivedAt);
    return {
      x: before.x + (after.x - before.x) * t,
      y: before.y + (after.y - before.y) * t,
      sentAt: before.sentAt + (after.sentAt - before.sentAt) * t,
    };
  }

  let running = false;
  let stopTimer = null;

  function frame() {
    const now = performance.now();
    deliverDue(now);

    const pos = remotePosition(now);
    if (pos) {
      // removeAttribute, not .hidden: SVG elements don't reflect the property
      remoteEl.removeAttribute("hidden");
      remoteEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;

      while (state.sends.length && now - state.sends[0] > 1000) state.sends.shift();
      const lag = Math.round(now - pos.sentAt);
      countersEl.textContent =
        `sends ${state.sends.length}/s · shown ~${lag}ms behind your hand · ` +
        `latency ${state.latency}ms · jitter ${state.jitter}ms`;
    }

    if (running) requestAnimationFrame(frame);
  }

  stage.addEventListener("pointerenter", () => {
    // Cancel any pending stop from a previous leave — otherwise it fires
    // later and kills this (still-active) run
    clearTimeout(stopTimer);
    stopTimer = null;
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  });

  stage.addEventListener("pointerleave", () => {
    // Let in-flight messages land, then idle — unless the pointer comes
    // back first, in which case pointerenter cancels this
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      running = false;
      stopTimer = null;
    }, 1200);
  });

  // ---- controls ------------------------------------------------------------

  const latencyVal = host.querySelector("[data-latency-val]");
  const jitterVal = host.querySelector("[data-jitter-val]");

  host.querySelector("[data-latency]").addEventListener("input", (e) => {
    state.latency = Number(e.target.value);
    latencyVal.textContent = `${state.latency}ms`;
  });

  host.querySelector("[data-jitter]").addEventListener("input", (e) => {
    state.jitter = Number(e.target.value);
    jitterVal.textContent = `${state.jitter}ms`;
  });

  host.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      state[key] = !state[key];
      btn.classList.toggle("is-on", state[key]);
      btn.setAttribute("aria-pressed", String(state[key]));

      if (key === "interpolate") {
        state.interactedInterp = true;
        status(
          state.interpolate
            ? "Smooth now, and slightly behind. That's the trade."
            : "Raw arrivals again: every network bump replayed as motion."
        );
      } else {
        state.interactedThrottle = true;
        status(
          state.throttle
            ? "Throttled: ~20 sends a second, coalesced to the latest position."
            : "Unthrottled: every pointermove is a message. Watch sends/s climb; the cursor looks the same."
        );
      }
    });
  });

  // First nudge: after the visitor has felt the raw version for a bit
  const nudge = setInterval(() => {
    if (!state.moved) return;
    clearInterval(nudge);
    if (!state.interactedInterp) {
      setTimeout(() => {
        if (!state.interactedInterp) {
          status("Stuttery? That's rendering at arrival time. Turn on interpolation.");
        }
      }, 4000);
    }
  }, 500);
})();
