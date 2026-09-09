/**
 * Optional enhancement only. The margin table is already in the HTML.
 * Reveals a % / $ density toggle; never replaces first-paint content with a loading shell.
 */
(function () {
  "use strict";
  var bar = document.querySelector(".js-only");
  if (!bar) return;
  bar.hidden = false;

  var buttons = bar.querySelectorAll("button[data-view]");
  function setView(view) {
    document.body.classList.remove("view-pct", "view-amt");
    if (view === "pct") document.body.classList.add("view-pct");
    if (view === "amt") document.body.classList.add("view-amt");
    buttons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-view") === view ? "true" : "false");
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setView(btn.getAttribute("data-view"));
    });
  });

  // Sanity-check the baked JSON with the same module; do not mutate the table on failure.
  try {
    var el = document.getElementById("margin-data");
    if (el && typeof MarginTracker !== "undefined") {
      MarginTracker.analyze(JSON.parse(el.textContent));
    }
  } catch (err) {
    // leave static table as-is
  }
})();
