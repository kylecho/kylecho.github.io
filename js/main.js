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

  // ---- reveal on scroll (sections, split headings, stat count-ups) ------
  if (hasIO) {
    const targets = [
      ...document.querySelectorAll("[data-reveal]"),
      ...document.querySelectorAll(".split"),
      ...(reduced ? [] : document.querySelectorAll("[data-count]")),
    ];

    if (targets.length) {
      document.body.classList.add("reveal-ready");

      const runCount = (el) => {
        const match = el.textContent.trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
        if (!match) {
          return;
        }
        const target = parseFloat(match[1]);
        const suffix = match[2];
        const duration = 1300;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (p < 1) {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }
            entry.target.classList.add("is-visible");
            if (entry.target.hasAttribute("data-count")) {
              runCount(entry.target);
            }
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

  // ---- header switches style once scrolled past the dark hero -----------
  const hero = document.querySelector(".hero");
  if (hero) {
    let ticking = false;
    const update = () => {
      ticking = false;
      document.body.classList.toggle("scrolled", window.scrollY > 24);
      document.body.classList.toggle("past-hero", window.scrollY > hero.offsetHeight - 76);
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();
  }

  // ---- dynamic year strings (hero index, footer copyright) ---------------
  const now = new Date();
  const yearFull = document.querySelector("[data-year-full]");
  if (yearFull) yearFull.textContent = now.getFullYear();
  const yearShort = document.querySelector("[data-year-short]");
  if (yearShort) yearShort.textContent = String(now.getFullYear()).slice(-2);

  // ---- live San Francisco clock in the hero index ------------------------
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
        document.documentElement.classList.remove("cursor-hidden");
        ring.classList.toggle("is-active", !!event.target.closest("a, button, .work-item"));
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

  // ---- marquee leans with scroll velocity ---------------------------------
  const marquee = document.querySelector(".marquee");
  if (!reduced && marquee) {
    let lastY = window.scrollY;
    let target = 0;
    let current = 0;
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        target = Math.max(-5, Math.min(5, (y - lastY) * 0.15));
        lastY = y;
      },
      { passive: true }
    );
    const lean = () => {
      target *= 0.9;
      current += (target - current) * 0.12;
      marquee.style.setProperty("--marquee-skew", current.toFixed(3) + "deg");
      requestAnimationFrame(lean);
    };
    requestAnimationFrame(lean);
  }

  // ---- magnetic buttons ---------------------------------------------------
  if (!reduced && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".button").forEach((button) => {
      button.addEventListener("pointermove", (event) => {
        const rect = button.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.18;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.3;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener("pointerleave", () => {
        button.style.transform = "";
      });
    });
  }
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
