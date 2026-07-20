// Two-replica CRDT text demo for the "no one has to agree" essay. Both
// panes are real, independent documents; each keystroke becomes a real
// operation delivered to the other pane after a short random delay, in
// arbitrary order. Core merge logic verified standalone before this file
// was written (fractional-key sequence CRDT: ordering is a plain sort on
// (position, id), so integration order never needs to be causal — proven,
// not assumed).
(() => {
  const host = document.getElementById("crdt-viz");
  if (!host) return;

  const MIN_DELAY = 80;
  const MAX_DELAY = 500;

  // ---- CRDT core -------------------------------------------------------

  function compareId([c1, r1], [c2, r2]) {
    if (c1 !== c2) return c1 - c2;
    return r1 < r2 ? -1 : r1 > r2 ? 1 : 0;
  }

  function compareEl(a, b) {
    if (a.pos !== b.pos) return a.pos - b.pos;
    return compareId(a.id, b.id);
  }

  function integrate(doc, op) {
    if (op.type === "delete") {
      const el = doc.find((e) => e.id[0] === op.targetId[0] && e.id[1] === op.targetId[1]);
      if (el) el.deleted = true;
      return;
    }
    const el = { id: op.id, pos: op.pos, char: op.char, deleted: false };
    let i = 0;
    while (i < doc.length && compareEl(doc[i], el) < 0) i++;
    doc.splice(i, 0, el);
  }

  function visible(doc) {
    return doc.filter((e) => !e.deleted);
  }

  function renderString(doc) {
    return visible(doc)
      .map((e) => e.char)
      .join("");
  }

  // Detects a single contiguous edit between two strings: common prefix +
  // common suffix, the middle is what changed. Covers typing, backspace,
  // and paste-over-a-selection; doesn't need to be more general than that
  // for a typing demo.
  function diffEdit(oldStr, newStr) {
    let start = 0;
    while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) start++;
    let oldEnd = oldStr.length;
    let newEnd = newStr.length;
    while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    return { start, removedCount: oldEnd - start, inserted: newStr.slice(start, newEnd) };
  }

  // ---- per-pane state ----------------------------------------------------

  function makePane(replicaId, textareaEl, tombstoneEl) {
    return {
      replicaId,
      el: textareaEl,
      tombstoneEl,
      doc: [],
      counter: 0,
      lastRendered: "",
      cursorAnchorId: null, // id of the element right before the cursor, or null = start
    };
  }

  let panes; // set after DOM is built

  function nextId(pane) {
    return [pane.counter++, pane.replicaId];
  }

  function boundsAt(doc, index) {
    const vis = visible(doc);
    const lo = index > 0 ? vis[index - 1].pos : 0;
    const hi = index < vis.length ? vis[index].pos : 1;
    return { lo, hi };
  }

  function setCursorAnchor(pane, visibleIndexBeforeCursor) {
    const vis = visible(pane.doc);
    pane.cursorAnchorId = visibleIndexBeforeCursor > 0 ? vis[visibleIndexBeforeCursor - 1].id : null;
  }

  function cursorIndexFromAnchor(pane) {
    if (pane.cursorAnchorId === null) return 0;
    const vis = visible(pane.doc);
    const i = vis.findIndex((e) => e.id[0] === pane.cursorAnchorId[0] && e.id[1] === pane.cursorAnchorId[1]);
    return i === -1 ? 0 : i + 1;
  }

  function tombstoneCount(pane) {
    return pane.doc.length - visible(pane.doc).length;
  }

  function renderPane(pane) {
    const str = renderString(pane.doc);
    if (pane.el.value !== str) {
      pane.el.value = str;
    }
    const idx = cursorIndexFromAnchor(pane);
    if (document.activeElement !== pane.el || pane.el.selectionStart !== idx) {
      try {
        pane.el.setSelectionRange(idx, idx);
      } catch (e) {}
    }
    pane.lastRendered = str;
    pane.tombstoneEl.textContent = String(tombstoneCount(pane));
  }

  // ---- propagation -------------------------------------------------------
  // No causal/FIFO requirement (the core CRDT test proved full order-
  // independence), so each op just gets its own independent random delay.

  const pending = []; // { deliverAt, targetPane, op }

  function sendTo(targetPane, op) {
    pending.push({
      deliverAt: performance.now() + MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY),
      targetPane,
      op,
    });
  }

  function deliverDue(now) {
    let delivered = false;
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].deliverAt > now) continue;
      const { targetPane, op } = pending[i];
      pending.splice(i, 1);
      i -= 1;
      integrate(targetPane.doc, op);
      delivered = true;
    }
    return delivered;
  }

  // ---- local edit handling ------------------------------------------------

  function handleLocalEdit(pane, other) {
    const newStr = pane.el.value;
    const { start, removedCount, inserted } = diffEdit(pane.lastRendered, newStr);
    if (removedCount === 0 && inserted.length === 0) return;

    const visBefore = visible(pane.doc);

    // Deletions: mark `removedCount` consecutive visible elements from `start`
    for (let k = 0; k < removedCount; k++) {
      const target = visBefore[start + k];
      if (!target) continue;
      const op = { type: "delete", targetId: target.id };
      integrate(pane.doc, op);
      sendTo(other, op);
    }

    // Insertions: sequential positions between the evolving left bound and
    // the fixed right bound (whatever followed the edit point). boundsAt
    // reads the doc post-deletion, which is correct since deletes above
    // are tombstones, not removals — visible() already skips them.
    let { lo, hi } = boundsAt(pane.doc, start);
    for (const ch of inserted) {
      const pos = (lo + hi) / 2;
      const id = nextId(pane);
      const op = { type: "insert", id, pos, char: ch };
      integrate(pane.doc, op);
      sendTo(other, op);
      lo = pos;
    }

    setCursorAnchor(pane, start + inserted.length);
    renderPane(pane);
  }

  // ---- markup --------------------------------------------------------------

  host.innerHTML = `
    <p class="deck-meta">Feel it &mdash; two replicas, no server between them</p>
    <div class="crdt-panes">
      <div class="crdt-pane">
        <p class="deck-meta">Replica A &middot; <span data-tombstones-a>0</span> tombstones</p>
        <textarea class="crdt-text" data-pane="a" spellcheck="false" aria-label="Replica A"></textarea>
      </div>
      <div class="crdt-pane">
        <p class="deck-meta">Replica B &middot; <span data-tombstones-b>0</span> tombstones</p>
        <textarea class="crdt-text" data-pane="b" spellcheck="false" aria-label="Replica B"></textarea>
      </div>
    </div>
    <p class="viz-status" role="status">Type in one, then the other. They converge once the delay clears.</p>
    <p class="viz-counters"></p>`;

  const elA = host.querySelector('[data-pane="a"]');
  const elB = host.querySelector('[data-pane="b"]');
  const tombA = host.querySelector("[data-tombstones-a]");
  const tombB = host.querySelector("[data-tombstones-b]");
  const statusEl = host.querySelector(".viz-status");
  const countersEl = host.querySelector(".viz-counters");

  const paneA = makePane("A", elA, tombA);
  const paneB = makePane("B", elB, tombB);
  panes = [paneA, paneB];

  let typedInA = false;
  let typedInB = false;
  let nudged = false;

  function maybeNudge() {
    if (nudged || !typedInA || !typedInB) return;
    nudged = true;
    statusEl.textContent =
      "Now try typing in both at the same spot at once — watch what happens near the same position.";
  }

  elA.addEventListener("input", () => {
    handleLocalEdit(paneA, paneB);
    typedInA = true;
    maybeNudge();
  });

  elB.addEventListener("input", () => {
    handleLocalEdit(paneB, paneA);
    typedInB = true;
    maybeNudge();
  });

  function tick() {
    const now = performance.now();
    if (deliverDue(now)) {
      renderPane(paneA);
      renderPane(paneB);
    }

    const sends = pending.length;
    countersEl.textContent = `${sends} operation${sends === 1 ? "" : "s"} in flight`;

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
