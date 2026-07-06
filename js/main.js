(() => {
  const revealItems = document.querySelectorAll("[data-reveal]");

  if (!("IntersectionObserver" in window) || !revealItems.length) {
    return;
  }

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

  revealItems.forEach((item) => observer.observe(item));
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
