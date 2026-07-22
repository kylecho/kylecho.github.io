(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;

  // ---- split headings into staggered words -------------------------------
  if (!reduced && hasIO) {
    document.querySelectorAll("[data-split]").forEach((el) => {
      const label = el.textContent.replace(/\s+/g, " ").trim();
      let wordIndex = 0;

      const split = (node) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach((token) => {
              if (!token) {
                return;
              }
              if (/^\s+$/.test(token)) {
                frag.appendChild(document.createTextNode(token));
                return;
              }
              const word = document.createElement("span");
              word.className = "word";
              const inner = document.createElement("span");
              inner.className = "word-inner";
              inner.style.setProperty("--i", wordIndex++);
              inner.textContent = token;
              word.appendChild(inner);
              frag.appendChild(word);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
            split(child);
          }
        });
      };

      split(el);
      el.setAttribute("aria-label", label);
      el.classList.add("split");
    });
  }

  // ---- reveal on load/scroll (kicker, intro, list, actions) ---------------
  if (hasIO) {
    const targets = [
      ...document.querySelectorAll("[data-reveal]"),
      ...document.querySelectorAll(".split"),
    ];

    if (targets.length) {
      document.body.classList.add("reveal-ready");

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        },
        {
          rootMargin: "0px 0px -8% 0px",
          threshold: 0.08,
        }
      );

      targets.forEach((item) => observer.observe(item));
    }
  }

  // ---- dynamic year in the meta line --------------------------------------
  const yearFull = document.querySelector("[data-year-full]");
  if (yearFull) yearFull.textContent = new Date().getFullYear();

  // ---- live San Francisco clock in the meta line ---------------------------
  const clock = document.querySelector("[data-clock]");
  if (clock) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tick = () => {
      clock.textContent = "SF " + formatter.format(new Date());
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---- magnetic buttons (fine pointers only) -----------------------------
  // .btn leans toward the pointer via --tx/--ty; CSS composes them with the
  // :active squeeze. Delegated, since the drill flow re-renders its buttons.
  if (!reduced && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener(
      "pointermove",
      (event) => {
        const btn = event.target.closest(".btn");
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty("--tx", `${(event.clientX - rect.left - rect.width / 2) * 0.18}px`);
        btn.style.setProperty("--ty", `${(event.clientY - rect.top - rect.height / 2) * 0.3}px`);
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerout",
      (event) => {
        const btn = event.target.closest(".btn");
        if (!btn || (event.relatedTarget && btn.contains(event.relatedTarget))) return;
        btn.style.setProperty("--tx", "0px");
        btn.style.setProperty("--ty", "0px");
      },
      { passive: true }
    );
  }

  // ---- custom cursor (fine pointers only) --------------------------------
  if (!reduced && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.append(dot, ring);
    document.documentElement.classList.add("custom-cursor", "cursor-hidden");

    let targetX = -100;
    let targetY = -100;
    let dotX = -100;
    let dotY = -100;
    let ringX = -100;
    let ringY = -100;

    document.addEventListener(
      "pointermove",
      (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        const root = document.documentElement;
        root.classList.remove("cursor-hidden");

        ring.classList.toggle("is-active", !!event.target.closest("a, button, input[type=range]"));

        // Let the native text cursor show through on real text fields —
        // a circle can't communicate "click to type" the way an I-beam
        // does, so the custom cursor steps aside instead of competing.
        root.classList.toggle(
          "cursor-text-target",
          !!event.target.closest("textarea, input[type=text], input[type=email], input[type=search]")
        );
      },
      { passive: true }
    );

    document.documentElement.addEventListener("mouseleave", () => {
      document.documentElement.classList.add("cursor-hidden");
    });

    const loop = () => {
      dotX += (targetX - dotX) * 0.5;
      dotY += (targetY - dotY) * 0.5;
      ringX += (targetX - ringX) * 0.18;
      ringY += (targetY - ringY) * 0.18;
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();

(() => {
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  if (!toggle) {
    return;
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const syncUI = () => {
    const theme = root.dataset.theme || "dark";
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    if (themeMeta) {
      themeMeta.content = getComputedStyle(root).getPropertyValue("--bg").trim();
    }
  };
  syncUI();

  // Instant swap: the sun/moon morph and the terrain's color melt
  // (scene.js) carry the moment — no full-screen transition layers.
  toggle.addEventListener("click", () => {
    const next = (root.dataset.theme || "dark") === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    syncUI();
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
  });
})();

(() => {
  const mailLinks = document.querySelectorAll('a[href^="mailto:"]');

  if (!mailLinks.length || !navigator.clipboard || !navigator.clipboard.writeText) {
    return;
  }

  let toast;
  let hideTimer;

  function showToast(message) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "copy-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  mailLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const email = link.href.replace(/^mailto:/, "").split("?")[0];
      navigator.clipboard
        .writeText(email)
        .then(() => showToast(`Copied ${email} to clipboard`))
        .catch(() => {});
    });
  });
})();

(() => {
  // "g" then a letter jumps pages, GitHub/Gmail-style. Two-key chord so
  // typing "h" or "n" alone (e.g. in the CRDT demo's live textareas) is safe.
  const routes = { h: "/", n: "/notes/", p: "/patterns/" };
  let armed = false;
  let armTimer;

  const isEditable = (el) =>
    !!(el && el.closest && el.closest("input, textarea, select, [contenteditable]"));

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) {
      armed = false;
      return;
    }

    if (!armed) {
      if (event.key === "g") {
        armed = true;
        clearTimeout(armTimer);
        armTimer = setTimeout(() => (armed = false), 1200);
      }
      return;
    }

    armed = false;
    clearTimeout(armTimer);
    const path = routes[event.key];
    if (path && path !== location.pathname) {
      event.preventDefault();
      location.href = path;
    }
  });
})();

(() => {
  // Kicker's org detail expands one level per click: base -> team -> org -> base.
  const toggle = document.querySelector(".hero-kicker-toggle");
  if (!toggle) return;

  const details = [...toggle.querySelectorAll(".hero-kicker-detail")];
  let level = 0;

  const render = () => {
    toggle.dataset.level = String(level);
    toggle.setAttribute("aria-expanded", level > 0 ? "true" : "false");
    details.forEach((el) => {
      el.setAttribute("aria-hidden", Number(el.dataset.level) <= level ? "false" : "true");
    });
  };

  toggle.addEventListener("click", () => {
    level = (level + 1) % 3;
    render();
  });

  render();
})();

(() => {
  console.log("%cHi, I'm Kyle.", "font: 600 22px system-ui, sans-serif; color: #2251ff;");
  console.log(
    "You're in the console, so you're probably the audience this site is actually for. " +
      "There's a keyboard shortcut if you want it: g, then h / n / p, jumps Home / Notes / Patterns."
  );
  console.log("kylecho.work@gmail.com");
})();
