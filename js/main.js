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
