/* ========================================
   GlassCube AR — Scroll Reveal
   ======================================== */

(function () {
  "use strict";

  var els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  /* Stagger initial delay per element index */
  function onIntersect(entries, observer) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(onIntersect, {
      threshold: 0.15,
    });
    els.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    /* Fallback: show everything */
    els.forEach(function (el) {
      el.classList.add("visible");
    });
  }
})();
