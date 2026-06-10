/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 43 — Interactive Onboarding Tutorial
 *
 * A dependency-free (no Intro.js / Shepherd) step-by-step
 * spotlight tour. It:
 *   1. Dims the screen with a fixed dark overlay (z-[55], above the
 *      app's z-50 topbar / bottom-nav chrome).
 *   2. Lifts the targeted element ABOVE the overlay (z-60) and rings it.
 *   3. Floats a dark-mode-aware tooltip (z-70) near the target with
 *      Previous / Next / Skip controls.
 *
 * Triggering:
 *   window.Tutorial.maybeStart()  -> runs ONLY if State.data.isTutorialDone
 *                                    is falsy (brand-new save). Called from
 *                                    enterApp() after the first renderAll().
 *   window.Tutorial.startTutorial() -> force-start (e.g. a "replay" button),
 *                                      ignores the flag.
 *   window.Tutorial.end()         -> tear down immediately.
 *
 * All copy is i18n-driven via window.t("tutorial.*").
 *
 * Load order: include AFTER the feature modules and BEFORE
 * script.js in index.html (script.js's enterApp() calls us).
 * ========================================================= */

(function () {
  "use strict";

  /* ---------- helpers / module wiring ---------- */
  function S() {
    return (window.FlippingTycoon && window.FlippingTycoon.State)
      ? window.FlippingTycoon.State.data
      : null;
  }
  function save() {
    if (window.FlippingTycoon && typeof window.FlippingTycoon.saveGame === "function") {
      window.FlippingTycoon.saveGame();
    }
  }
  // i18n shortcut — graceful fallback to the key if i18n isn't ready.
  function t(key, params) {
    return (typeof window.t === "function") ? window.t(key, params) : key;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* =========================================================
   * 1. THE TUTORIAL SEQUENCE
   *
   * Each step: { selector | targetId, titleKey, textKey }.
   *   selector : a CSS selector (preferred — handles the
   *              responsive desktop/mobile duplicates of a nav item).
   *   targetId : convenience for `#id` targets.
   *   A null target renders a centered, target-less tooltip
   *   (used for the welcome step).
   * ========================================================= */
  var STEPS = [
    {
      selector: null, // welcome — centered, no spotlight
      titleKey: "tutorial.welcome_title",
      textKey:  "tutorial.welcome_desc",
    },
    {
      selector: '.sidebar-nav[data-page="marketplace"]',
      titleKey: "tutorial.market_title",
      textKey:  "tutorial.market_desc",
    },
    {
      selector: '.sidebar-nav[data-page="inventory"]',
      titleKey: "tutorial.inventory_title",
      textKey:  "tutorial.inventory_desc",
    },
    {
      // E-commerce / Seller Center has no dedicated tab — it is rendered
      // inside the Real Estate page, so we spotlight that entry point.
      selector: '.sidebar-nav[data-page="real-estate"]',
      titleKey: "tutorial.ecommerce_title",
      textKey:  "tutorial.ecommerce_desc",
    },
    {
      targetId: "next-day-btn",
      titleKey: "tutorial.nextday_title",
      textKey:  "tutorial.nextday_desc",
    },
  ];

  // Visual highlight classes (NO `relative`, NO `bg-*` — see note in header).
  var HL_CLASSES = ["tutorial-spotlight", "rounded-lg", "shadow-2xl", "ring-4", "ring-blue-400", "transition-all"];

  /* ---------- engine state ---------- */
  var active    = false;
  var current   = 0;
  var overlayEl = null;
  var tooltipEl = null;
  var currentEl = null;

  /* =========================================================
   * 2. VISIBILITY + TARGET RESOLUTION
   * ========================================================= */
  function isVisible(el) {
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  // Resolve the first VISIBLE element for a step (handles the
  // desktop-sidebar vs mobile-bottom-nav duplicates automatically).
  function resolveTarget(step) {
    var sel = step.selector || (step.targetId ? "#" + step.targetId : null);
    if (!sel) return null;
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    for (var i = 0; i < els.length; i++) {
      if (isVisible(els[i])) return els[i];
    }
    return null;
  }

  /* =========================================================
   * 3. SPOTLIGHT (position-aware so we never break `fixed`/`bg`)
   * ========================================================= */
  function applyHighlight(el) {
    if (!el) return;
    var cs = window.getComputedStyle(el);
    // Remember inline values so we can restore them exactly on cleanup.
    el._tutPrev = {
      position: el.style.position,
      zIndex: el.style.zIndex,
      pointerEvents: el.style.pointerEvents,
    };
    // Only force `relative` when the element is statically positioned;
    // a `fixed`/`absolute`/`sticky` element keeps its own positioning.
    if (cs.position === "static") el.style.position = "relative";
    el.style.zIndex = "60";              // above the z-[55] overlay (and the z-50 chrome)
    el.style.pointerEvents = "none";     // stay on-rails during the tour
    el.classList.add.apply(el.classList, HL_CLASSES);
    // Bring it into view BEFORE we measure for tooltip placement.
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } catch (e) {
      el.scrollIntoView();
    }
  }
  function clearHighlight(el) {
    if (!el) return;
    el.classList.remove.apply(el.classList, HL_CLASSES);
    if (el._tutPrev) {
      el.style.position = el._tutPrev.position || "";
      el.style.zIndex = el._tutPrev.zIndex || "";
      el.style.pointerEvents = el._tutPrev.pointerEvents || "";
      delete el._tutPrev;
    } else {
      el.style.zIndex = "";
      el.style.pointerEvents = "";
    }
  }

  /* =========================================================
   * 4. OVERLAY + TOOLTIP DOM
   * ========================================================= */
  function buildOverlay() {
    overlayEl = document.createElement("div");
    // z-[55] so it dims the app's z-50 chrome (topbar + mobile bottom nav).
    // Highlighted targets jump to z-60 and the tooltip to z-70 (see below).
    overlayEl.className = "tutorial-overlay fixed inset-0 bg-black/80 z-[55] transition-opacity";
    // Swallow clicks so the dimmed UI underneath can't be interacted with.
    overlayEl.addEventListener("click", function (e) { e.stopPropagation(); });
    document.body.appendChild(overlayEl);
  }
  function buildTooltip() {
    tooltipEl = document.createElement("div");
    tooltipEl.className =
      "tutorial-tooltip fixed z-[70] w-[calc(100vw-1.5rem)] max-w-sm p-4 rounded-xl " +
      "shadow-2xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white " +
      "border border-slate-200 dark:border-slate-700";
    tooltipEl.setAttribute("role", "dialog");
    tooltipEl.setAttribute("aria-live", "polite");
    tooltipEl.addEventListener("click", onTooltipClick);
    document.body.appendChild(tooltipEl);
  }

  function renderTooltip(step, i) {
    var total = STEPS.length;
    var isFirst = i === 0;
    var isLast = i === total - 1;
    tooltipEl.innerHTML =
      '<div class="flex items-center justify-between mb-2">' +
        '<span class="text-[11px] font-semibold uppercase tracking-wide text-blue-500">' +
          esc(t("tutorial.progress", { current: i + 1, total: total })) +
        '</span>' +
        '<button data-tut="skip" aria-label="' + esc(t("tutorial.skip")) + '" ' +
          'class="w-7 h-7 -mr-1 -mt-1 flex items-center justify-center rounded-full text-lg leading-none ' +
          'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white">&times;</button>' +
      '</div>' +
      '<h3 class="text-base font-bold mb-1">' + esc(t(step.titleKey)) + '</h3>' +
      '<p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-4">' + esc(t(step.textKey)) + '</p>' +
      '<div class="flex items-center justify-between gap-2">' +
        '<button data-tut="skip" class="px-3 py-1.5 text-sm rounded-lg text-slate-500 dark:text-slate-400 ' +
          'hover:bg-slate-100 dark:hover:bg-slate-700">' + esc(t("tutorial.skip")) + '</button>' +
        '<div class="flex items-center gap-2">' +
          '<button data-tut="prev" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 ' +
            'hover:bg-slate-100 dark:hover:bg-slate-700 ' + (isFirst ? "hidden" : "") + '">' +
            esc(t("tutorial.prev")) + '</button>' +
          '<button data-tut="next" class="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[#1877F2] text-white ' +
            'hover:bg-[#155fc4] active:scale-95 transition-all">' +
            esc(isLast ? t("tutorial.finish") : t("tutorial.next")) + '</button>' +
        '</div>' +
      '</div>';
  }

  function onTooltipClick(e) {
    var btn = e.target.closest("[data-tut]");
    if (!btn) return;
    var action = btn.getAttribute("data-tut");
    if (action === "skip") complete();
    else if (action === "prev") showStep(current - 1);
    else if (action === "next") showStep(current + 1);
  }

  /* =========================================================
   * 5. TOOLTIP POSITIONING (viewport-anchored via `fixed`)
   * ========================================================= */
  function positionTooltip(targetEl) {
    if (!tooltipEl) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var tip = tooltipEl.getBoundingClientRect();
    var tw = tip.width;
    var th = tip.height;
    var gap = 14;
    var margin = 12;
    var left, top;

    if (!targetEl) {
      // Centered (welcome / missing-target fallback).
      left = (vw - tw) / 2;
      top = (vh - th) / 2;
    } else {
      var r = targetEl.getBoundingClientRect();
      left = r.left + r.width / 2 - tw / 2;        // center horizontally on target
      var below = r.bottom + gap;
      var above = r.top - gap - th;
      if (below + th <= vh - margin) top = below;  // prefer below
      else if (above >= margin) top = above;       // else above
      else top = Math.max(margin, (vh - th) / 2);  // else just clamp/center
    }
    left = Math.max(margin, Math.min(left, vw - tw - margin));
    top = Math.max(margin, Math.min(top, vh - th - margin));
    tooltipEl.style.left = Math.round(left) + "px";
    tooltipEl.style.top = Math.round(top) + "px";
  }

  function reposition() {
    if (active) positionTooltip(currentEl);
  }

  /* =========================================================
   * 6. STEP FLOW
   * ========================================================= */
  function showStep(i) {
    if (!active) return;
    // Clean up the previous step's highlight first.
    clearHighlight(currentEl);
    currentEl = null;

    if (i < 0) i = 0;
    if (i >= STEPS.length) { complete(); return; }
    current = i;

    var step = STEPS[i];
    var el = resolveTarget(step);
    currentEl = el;

    renderTooltip(step, i);

    if (el) {
      applyHighlight(el);
      // Position once now, then again after the smooth-scroll settles.
      positionTooltip(el);
      window.setTimeout(function () { positionTooltip(el); }, 320);
    } else {
      // No (visible) target: gracefully fall back to a centered tooltip.
      positionTooltip(null);
    }
  }

  /* =========================================================
   * 7. LIFECYCLE
   * ========================================================= */
  function onKeyDown(e) {
    if (!active) return;
    if (e.key === "Escape") { complete(); }
    else if (e.key === "ArrowRight") { showStep(current + 1); }
    else if (e.key === "ArrowLeft") { showStep(current - 1); }
  }
  function attachListeners() {
    // capture:true so we also catch scrolls inside the (overflow-y-auto) sidebar.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", onKeyDown, true);
  }
  function removeListeners() {
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function start() {
    if (active) return;
    active = true;
    current = 0;
    buildOverlay();
    buildTooltip();
    attachListeners();
    showStep(0);
  }

  // Gated entry point: brand-new saves only.
  function maybeStart() {
    var s = S();
    if (!s || s.isTutorialDone) return;
    // Let the first render + any layout settle before measuring/positioning.
    window.setTimeout(function () {
      // Re-check in case the player navigated/finished in the meantime.
      var st = S();
      if (st && !st.isTutorialDone) start();
    }, 450);
  }

  // Persist completion + tear everything down.
  function complete() {
    var s = S();
    if (s) { s.isTutorialDone = true; save(); }
    teardown();
  }
  function teardown() {
    clearHighlight(currentEl);
    currentEl = null;
    removeListeners();
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    active = false;
  }

  /* =========================================================
   * 8. PUBLIC API
   * ========================================================= */
  window.Tutorial = {
    maybeStart: maybeStart,        // gated — called from enterApp()
    startTutorial: start,          // force-start (e.g. a "replay tutorial" button)
    start: start,
    end: teardown,                 // dismiss without marking done
    complete: complete,            // dismiss AND mark done
    isActive: function () { return active; },
    STEPS: STEPS,
  };
})();
