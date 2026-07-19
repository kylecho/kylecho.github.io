import closures from "./decks/closures.js";
import asyncOrchestration from "./decks/async-orchestration.js";
import reactPatterns from "./decks/react-patterns.js";
import reactAsyncUi from "./decks/react-async-ui.js";
import frontendSystemDesign from "./decks/frontend-system-design.js";

const decks = [closures, asyncOrchestration, reactPatterns, reactAsyncUi, frontendSystemDesign];
const app = document.getElementById("app");

// ---- persistence ---------------------------------------------------------

const STORE_KEY = "patterns-v1";

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {}
}

function deckProgress(deck) {
  const store = loadStore();
  const results = store[deck.id] || {};
  return deck.cards.filter((c) => results[c.id] === "got").length;
}

function recordResult(deckId, cardId, result) {
  const store = loadStore();
  store[deckId] = store[deckId] || {};
  store[deckId][cardId] = result;
  saveStore(store);
}

function resetDeck(deckId) {
  const store = loadStore();
  delete store[deckId];
  saveStore(store);
}

// ---- syntax highlighting (vendored Prism, jsx grammar) -------------------

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(src) {
  const prism = window.Prism;
  if (prism && prism.languages && prism.languages.jsx) {
    return prism.highlight(src, prism.languages.jsx, "jsx");
  }
  return escapeHtml(src);
}

// ---- block rendering -----------------------------------------------------

function inlineCode(text) {
  // Space-free tokens get .nb (no-break) so they wrap as a unit instead of
  // splitting at hyphens or dots mid-token.
  return escapeHtml(text).replace(/`([^`]+)`/g, (m, c) =>
    `<code${/\s/.test(c) ? "" : ' class="nb"'}>${c}</code>`
  );
}

function renderBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.code !== undefined) {
        return `<pre class="code"><code>${highlight(block.code)}</code></pre>`;
      }
      if (block.ol !== undefined || block.ul !== undefined) {
        const tag = block.ol !== undefined ? "ol" : "ul";
        const items = (block.ol || block.ul)
          .map((item) => `<li><span>${inlineCode(item)}</span></li>`)
          .join("");
        return `<${tag} class="drill-list">${items}</${tag}>`;
      }
      return `<p>${inlineCode(block.p)}</p>`;
    })
    .join("");
}

const TYPE_LABELS = {
  predict: "Predict",
  implement: "Implement",
  recall: "Recall",
  design: "Design",
};

// ---- views ---------------------------------------------------------------

let session = null;
let keysBound = false;

function renderHome() {
  session = null;

  const deckCards = decks
    .map((deck) => {
      const got = deckProgress(deck);
      const total = deck.cards.length;
      const pct = total ? Math.round((got / total) * 100) : 0;
      const resetLink =
        got > 0
          ? `<button class="link-reset" type="button" data-reset="${deck.id}">reset</button>`
          : "";
      return `
        <article class="deck-card">
          <p class="deck-meta">Deck ${deck.number} · ${total} cards</p>
          <h2>${deck.title}</h2>
          <p class="deck-blurb">${deck.blurb}</p>
          <div class="deck-progress">
            <span class="deck-bar"><span class="deck-bar-fill" style="width:${pct}%"></span></span>
            <span class="deck-count">${got}/${total}</span>
            ${resetLink}
          </div>
          <button class="btn btn-primary" type="button" data-start="${deck.id}">
            ${got > 0 && got < total ? "Continue" : got === total ? "Run it again" : "Start"}
          </button>
        </article>`;
    })
    .join("");

  app.innerHTML = `<section class="deck-grid">${deckCards}</section>`;

  app.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deck = decks.find((d) => d.id === btn.dataset.start);
      startSession(deck);
    });
  });

  app.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetDeck(btn.dataset.reset);
      renderHome();
    });
  });
}

function startSession(deck) {
  session = {
    deck,
    round: [...deck.cards],
    idx: 0,
    revealed: false,
    isReview: false,
    missed: [],
    firstResults: new Map(),
  };
  renderCard();
}

function renderCard() {
  const { deck, round, idx, isReview } = session;
  const card = round[idx];
  session.revealed = false;

  const roundLabel = isReview
    ? `Review · ${idx + 1} / ${round.length}`
    : `${idx + 1} / ${round.length}`;

  app.innerHTML = `
    <section class="session">
      <div class="session-top">
        <button class="link-back" type="button" data-exit>&larr; All decks</button>
        <span class="session-count">${deck.title} · ${roundLabel}</span>
      </div>
      <article class="drill" role="group" aria-label="Card ${idx + 1} of ${round.length}">
        <p class="drill-kicker">
          <span class="drill-type drill-type-${card.type}">${TYPE_LABELS[card.type]}</span>
          <span class="drill-title">${card.title}</span>
        </p>
        <div class="drill-prompt">${renderBlocks(card.prompt)}</div>
        <div class="drill-answer" hidden>${renderBlocks(card.answer)}</div>
        <div class="drill-actions">
          <button class="btn btn-primary" type="button" data-reveal-btn>Reveal</button>
          <button class="btn" type="button" data-grade="missed" hidden>Missed it</button>
          <button class="btn btn-primary" type="button" data-grade="got" hidden>Got it</button>
        </div>
        <p class="drill-keys">space — reveal · 1 — missed · 2 — got it</p>
      </article>
    </section>`;

  app.querySelector("[data-exit]").addEventListener("click", renderHome);
  app.querySelector("[data-reveal-btn]").addEventListener("click", reveal);
  app.querySelectorAll("[data-grade]").forEach((btn) => {
    btn.addEventListener("click", () => grade(btn.dataset.grade));
  });

  app.querySelector("[data-reveal-btn]").focus();
}

function reveal() {
  if (!session || session.revealed) return;
  session.revealed = true;
  app.querySelector(".drill-answer").hidden = false;
  app.querySelector("[data-reveal-btn]").hidden = true;
  app.querySelectorAll("[data-grade]").forEach((btn) => (btn.hidden = false));
  app.querySelector('[data-grade="got"]').focus();
}

function grade(result) {
  if (!session || !session.revealed) return;
  const card = session.round[session.idx];

  if (!session.firstResults.has(card.id)) {
    session.firstResults.set(card.id, result);
  }
  recordResult(session.deck.id, card.id, result);

  if (result === "missed") {
    session.missed.push(card);
  }

  session.idx += 1;

  if (session.idx < session.round.length) {
    renderCard();
  } else if (session.missed.length) {
    session.round = session.missed;
    session.missed = [];
    session.idx = 0;
    session.isReview = true;
    renderCard();
  } else {
    renderEnd();
  }
}

function renderEnd() {
  const { deck, firstResults } = session;
  const total = deck.cards.length;
  const got = deck.cards.filter((c) => firstResults.get(c.id) === "got").length;
  const missedCards = deck.cards.filter((c) => firstResults.get(c.id) === "missed");

  const missedList = missedCards.length
    ? `<div class="end-missed">
        <p class="deck-meta">Worth another pass</p>
        <ul>${missedCards
          .map((c) => `<li><span>${TYPE_LABELS[c.type]} — ${c.title}</span></li>`)
          .join("")}</ul>
      </div>`
    : "";

  app.innerHTML = `
    <section class="session session-end">
      <h2>Deck complete.</h2>
      <p class="end-score">${got} of ${total} on the first try${
        got === total ? " — clean sweep." : "."
      }</p>
      ${missedList}
      <div class="drill-actions">
        <button class="btn btn-primary" type="button" data-again>Run it again</button>
        <button class="btn" type="button" data-exit>All decks</button>
      </div>
    </section>`;

  app.querySelector("[data-again]").addEventListener("click", () => startSession(deck));
  app.querySelector("[data-exit]").addEventListener("click", renderHome);
  app.querySelector("[data-again]").focus();
  session = null;
}

// ---- keyboard ------------------------------------------------------------

function bindKeys() {
  if (keysBound) return;
  keysBound = true;

  document.addEventListener("keydown", (event) => {
    if (!session || !session.round) return;

    if (event.key === " ") {
      event.preventDefault();
      reveal();
    } else if (event.key === "1" || event.key === "ArrowLeft") {
      grade("missed");
    } else if (event.key === "2" || event.key === "ArrowRight") {
      grade("got");
    } else if (event.key === "Escape") {
      renderHome();
    }
  });
}

bindKeys();
renderHome();
