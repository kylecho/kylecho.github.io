// Divider demo for the "not everything belongs in state" essay. Two
// identical panes: the left routes every pointer move through a rebuild of
// its rows (a stand-in for an unmemoized subtree re-render), the right
// writes one style property and touches nothing else. Every counter is
// measured live from real work — nothing is scripted.
(() => {
  const host = document.getElementById("drag-viz");
  if (!host) return;

  const MIN_RATIO = 0.15;
  const MAX_RATIO = 0.85;
  let rowsPerColumn = 1200;

  host.innerHTML = `
    <p class="deck-meta">Feel it &mdash; two dividers, one difference</p>
    <div class="dviz-grid">
      <figure class="dviz-stage" data-mode="state">
        <figcaption>through a re-render &middot; every move rebuilds the rows</figcaption>
        <div class="dviz-cols">
          <div class="dviz-col" data-col-a><div class="dviz-rows" data-rows-a></div></div>
          <div class="dviz-handle" role="separator" tabindex="0" aria-orientation="vertical"
            aria-valuemin="15" aria-valuemax="85" aria-valuenow="50"
            aria-label="Resize columns (re-render pipeline). Arrow keys work too."></div>
          <div class="dviz-col" data-col-b><div class="dviz-rows" data-rows-b></div></div>
        </div>
        <p class="viz-counters" data-counters>drag the divider</p>
      </figure>
      <figure class="dviz-stage" data-mode="direct">
        <figcaption>direct write &middot; rows untouched, one style set</figcaption>
        <div class="dviz-cols">
          <div class="dviz-col" data-col-a><div class="dviz-rows" data-rows-a></div></div>
          <div class="dviz-handle" role="separator" tabindex="0" aria-orientation="vertical"
            aria-valuemin="15" aria-valuemax="85" aria-valuenow="50"
            aria-label="Resize columns (direct style write). Arrow keys work too."></div>
          <div class="dviz-col" data-col-b><div class="dviz-rows" data-rows-b></div></div>
        </div>
        <p class="viz-counters" data-counters>drag the divider</p>
      </figure>
    </div>
    <div class="cviz-sliders">
      <label>rows per column <input type="range" min="100" max="4000" step="100" value="1200" data-rows>
        <span data-rows-val>1200</span></label>
    </div>
    <p class="viz-status" role="status">Drag each divider. Same rows, same pointer — only the update path differs.</p>`;

  const statusEl = host.querySelector(".viz-status");

  function clamp(ratio) {
    return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
  }

  // Deterministic bar widths so a rebuild produces identical rows — the
  // left pane's rebuild should cost time, not flicker.
  function buildRows(container, count) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "dviz-row";
      row.style.width = `${40 + ((i * 7919) % 53)}%`;
      frag.appendChild(row);
    }
    container.replaceChildren(frag);
  }

  function makeStage(el) {
    const stage = {
      el,
      mode: el.dataset.mode,
      ratio: 0.5,
      colA: el.querySelector("[data-col-a]"),
      rowsA: el.querySelector("[data-rows-a]"),
      rowsB: el.querySelector("[data-rows-b]"),
      handle: el.querySelector(".dviz-handle"),
      countersEl: el.querySelector("[data-counters]"),
      stats: null,
      pendingRatio: null,
      scheduled: false,
    };
    stage.colA.style.flex = "0 0 50%";
    buildRows(stage.rowsA, rowsPerColumn);
    buildRows(stage.rowsB, rowsPerColumn);
    return stage;
  }

  const stages = [...host.querySelectorAll(".dviz-stage")].map(makeStage);

  // ---- the two update paths ------------------------------------------------

  // "State" path: coalesce to a microtask (as a state setter would), then
  // rebuild the rows — the stand-in for the subtree render — then commit
  // the width. The rebuild is real work, measured around the actual calls.
  function applyThroughRender(stage) {
    if (stage.scheduled) return;
    stage.scheduled = true;
    queueMicrotask(() => {
      stage.scheduled = false;
      const t0 = performance.now();
      buildRows(stage.rowsA, rowsPerColumn);
      buildRows(stage.rowsB, rowsPerColumn);
      stage.colA.style.flex = `0 0 ${stage.pendingRatio * 100}%`;
      const cost = performance.now() - t0;
      if (stage.stats) {
        stage.stats.renders += 1;
        stage.stats.renderMs += cost;
      }
    });
  }

  // "Direct" path: one style write in the event handler, nothing else.
  function applyDirect(stage) {
    stage.colA.style.flex = `0 0 ${stage.ratio * 100}%`;
  }

  function applyRatio(stage) {
    stage.handle.setAttribute("aria-valuenow", String(Math.round(stage.ratio * 100)));
    if (stage.mode === "state") {
      stage.pendingRatio = stage.ratio;
      applyThroughRender(stage);
    } else {
      applyDirect(stage);
    }
  }

  // ---- measurement ----------------------------------------------------------

  function startStats(stage) {
    stage.stats = {
      updates: 0,
      renders: 0,
      renderMs: 0,
      frames: 0,
      frameMs: 0,
      worstFrame: 0,
      running: true,
    };
    const stats = stage.stats;
    // Two rAFs so the first measured delta is frame-to-frame, not
    // idle-to-frame.
    requestAnimationFrame((t) => {
      let last = t;
      function frame(now) {
        if (!stats.running) return;
        const d = now - last;
        last = now;
        stats.frames += 1;
        stats.frameMs += d;
        stats.worstFrame = Math.max(stats.worstFrame, d);
        renderCounters(stage);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function renderCounters(stage) {
    const s = stage.stats;
    if (!s || !s.frames) return;
    const avgFrame = (s.frameMs / s.frames).toFixed(1);
    const worst = s.worstFrame.toFixed(0);
    if (stage.mode === "state") {
      const avgRender = s.renders ? (s.renderMs / s.renders).toFixed(1) : "–";
      stage.countersEl.textContent =
        `moves ${s.updates} · rebuild avg ${avgRender}ms · frame avg ${avgFrame}ms · worst ${worst}ms`;
    } else {
      stage.countersEl.textContent =
        `moves ${s.updates} · frame avg ${avgFrame}ms · worst ${worst}ms`;
    }
  }

  function stopStats(stage) {
    if (!stage.stats) return;
    stage.stats.running = false;
    renderCounters(stage);
    if (stage.mode === "state") {
      statusEl.textContent =
        "The left pane pays for its rows on every move. Raise the row count and drag again — the right pane won't care.";
    } else {
      statusEl.textContent =
        "One style write per move: the direct pane's frame time stays flat no matter how many rows it holds.";
    }
  }

  // ---- drag wiring -----------------------------------------------------------

  function attachDrag(stage) {
    stage.handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stage.handle.setPointerCapture(e.pointerId);
      stage.handle.classList.add("is-dragging");

      const rect = stage.el.querySelector(".dviz-cols").getBoundingClientRect();
      const session = { startX: e.clientX, startRatio: stage.ratio, width: rect.width };
      startStats(stage);

      const onMove = (ev) => {
        stage.ratio = clamp(session.startRatio + (ev.clientX - session.startX) / session.width);
        if (stage.stats) stage.stats.updates += 1;
        applyRatio(stage);
      };
      const onUp = () => {
        stage.handle.removeEventListener("pointermove", onMove);
        stage.handle.classList.remove("is-dragging");
        stopStats(stage);
      };

      // Pointer capture retargets move/up to the handle: no window listeners
      stage.handle.addEventListener("pointermove", onMove);
      stage.handle.addEventListener("pointerup", onUp, { once: true });
      stage.handle.addEventListener("pointercancel", onUp, { once: true });
    });

    stage.handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      stage.ratio = clamp(stage.ratio + (e.key === "ArrowLeft" ? -0.05 : 0.05));
      applyRatio(stage);
    });
  }

  stages.forEach(attachDrag);

  // ---- controls ---------------------------------------------------------------

  const rowsVal = host.querySelector("[data-rows-val]");
  host.querySelector("[data-rows]").addEventListener("input", (e) => {
    rowsPerColumn = Number(e.target.value);
    rowsVal.textContent = String(rowsPerColumn);
    stages.forEach((stage) => {
      buildRows(stage.rowsA, rowsPerColumn);
      buildRows(stage.rowsB, rowsPerColumn);
    });
  });
})();
