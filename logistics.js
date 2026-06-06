/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 33 — Real-Time Shipping & 2-Step Ad-Skip Mechanic
 *
 * Centralised logistics layer for Batam Supplier and Brand
 * Partnership orders. Replaces the old "instant arrival" path
 * with a real-time 2-hour countdown driven by TIMESTAMPS
 * (Date.now()) so the timer keeps progressing even when the
 * PWA is closed (offline / idle progress).
 *
 * ---- Timer model (timestamp-based) ----
 *   When a cargo is ordered we store an absolute `endTime`:
 *       endTime = Date.now() + SHIPMENT_DURATION_MS   (2h)
 *   The remaining time is ALWAYS derived on the fly:
 *       remaining = endTime - Date.now()
 *   This is robust against the app being backgrounded/closed:
 *   re-opening the app recomputes the true remaining time from
 *   the wall clock, so there is no drift from setInterval ticks.
 *
 * ---- 2-step rewarded-ad model ----
 *   Each cargo tracks `adWatchedCount` (0 → 1 → 2). Exactly TWO
 *   rewarded ads are allowed per cargo:
 *     • adWatchedCount === 0  → cut the REMAINING time by 50%
 *                               (endTime -= remaining/2)
 *     • adWatchedCount === 1  → arrive instantly (endTime = now)
 *     • adWatchedCount >= 2   → maxed out, no-op
 *
 * ---- Auto-delivery ----
 *   A lightweight global ticker sweeps the queue once per second.
 *   As soon as `endTime <= Date.now()` the cargo's items are moved
 *   automatically into the Inventory (or Warehouse) array — no
 *   manual click required. (A manual "Klaim" button is also kept
 *   as an instant fallback.)
 *
 * Public:
 *   window.Logistics.addShipment(opts)          — queue a new shipment
 *   window.Logistics.claimShipment(id)          — manual claim (instant)
 *   window.Logistics.sweepDeliveries()          — auto-deliver ready cargo
 *   window.Logistics.applyAdReward(id)          — shared 2-step ad math
 *   window.Logistics.showRewardedAd(id)         — built-in mock-ad loop
 *   window.Logistics.renderLogisticsPage()      — Kargo / Logistik tab
 *   window.Logistics.getRemainingMs(s)          — ms left until ready
 *   window.Logistics.isReady(s)                 — bool, remaining === 0
 *   window.Logistics.activeCount() / readyCount()
 *   window.Logistics.SHIPMENT_DURATION_MS       — 2h = 7_200_000
 * ========================================================= */

(function () {
  const SHIPMENT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours real-time = 7_200_000 ms
  const AD_OVERLAY_MS = 2000;                       // mock rewarded-ad duration (2s)

  function S() { return window.FlippingTycoon.State.data; }
  function fmt(n) {
    return window.Market ? window.Market.formatRupiah(n) :
      ("Rp " + (Number(n) || 0).toLocaleString("id-ID"));
  }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  /* Prefer the global toast (script.js); fall back to a local pill. */
  function toast(msg, type) {
    if (window.FlippingTycoon && typeof window.FlippingTycoon.showToast === "function") {
      window.FlippingTycoon.showToast(msg, type);
      return;
    }
    let el = document.querySelector("#ft-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ft-toast";
      el.className = "ft-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function rerenderActivePage() {
    if (window.FlippingTycoon && typeof window.FlippingTycoon.renderActivePage === "function") {
      window.FlippingTycoon.renderActivePage();
    }
  }
  function persist() {
    if (window.FlippingTycoon && typeof window.FlippingTycoon.saveGame === "function") {
      window.FlippingTycoon.saveGame();
    }
  }

  /* =========================================================
   * State hygiene — ensure the queue exists and every shipment
   * uses the timestamp model (migrate any legacy shipment that
   * still carries the old startedAt/durationMs/adWatches fields).
   * ========================================================= */
  function migrateShipment(ship) {
    if (!ship || typeof ship !== "object") return;
    // Backfill absolute endTime from the legacy startedAt + durationMs pair.
    if (typeof ship.endTime !== "number" || !isFinite(ship.endTime)) {
      const started = Number(ship.startedAt);
      const dur = Number(ship.durationMs);
      const base = isFinite(started) ? started : Date.now();
      ship.endTime = base + (isFinite(dur) ? dur : SHIPMENT_DURATION_MS);
    }
    // Total duration is used only as the progress-bar baseline.
    if (typeof ship.totalDurationMs !== "number" || !isFinite(ship.totalDurationMs) || ship.totalDurationMs <= 0) {
      ship.totalDurationMs = SHIPMENT_DURATION_MS;
    }
    // adWatches (old) → adWatchedCount (new), clamped to 0..2.
    if (typeof ship.adWatchedCount !== "number" || !isFinite(ship.adWatchedCount)) {
      ship.adWatchedCount = Math.min(2, Math.max(0, Number(ship.adWatches) || 0));
    }
  }

  function ensureShipments() {
    const s = S();
    if (!Array.isArray(s.activeShipments)) s.activeShipments = [];
    s.activeShipments.forEach(migrateShipment);
  }

  /* =========================================================
   * Core API
   * ========================================================= */

  /**
   * Add a shipment to activeShipments. The shipment is NOT
   * delivered immediately — the player must wait
   * SHIPMENT_DURATION_MS (2h real-time). When the timer hits
   * zero the cargo is auto-delivered (or can be claimed early).
   *
   * opts: {
   *   source: "batam" | "partnership",
   *   label:  string,
   *   icon:   string  (Font Awesome icon name, no fa- prefix),
   *   accent: string  (hex color),
   *   destination: "inventory" | "warehouse",
   *   items:  array of inventory-shaped items,
   *   totalCost:   number (already debited, for display only),
   *   paymentBank: string ("Mandiri" | "BCA" | "BNI" | null),
   *   meta:   object,
   * }
   */
  function addShipment(opts) {
    ensureShipments();
    const s = S();
    const now = Date.now();
    const ship = {
      id: uid("ship"),
      source:      String(opts.source || "unknown"),
      label:       String(opts.label  || "Shipment"),
      icon:        String(opts.icon   || "ship"),
      accent:      String(opts.accent || "#0e7490"),
      destination: opts.destination === "warehouse" ? "warehouse" : "inventory",
      items:       Array.isArray(opts.items) ? opts.items : [],
      totalCost:   Number(opts.totalCost) || 0,
      paymentBank: opts.paymentBank || null,

      // --- Timestamp-based timer model ---
      orderedAt:      now,                            // for reference/UI
      endTime:        now + SHIPMENT_DURATION_MS,     // absolute arrival timestamp
      totalDurationMs: SHIPMENT_DURATION_MS,          // progress-bar baseline
      adWatchedCount: 0,                              // 0 → 1 → 2

      claimed: false,
      meta:    opts.meta || {},
    };
    s.activeShipments.push(ship);
    persist();
    return ship;
  }

  /** Remaining milliseconds until the cargo is ready (>= 0). */
  function getRemainingMs(ship) {
    if (!ship) return 0;
    let end = Number(ship.endTime);
    if (!isFinite(end)) {
      // Robust fallback for un-migrated legacy shipments.
      const started = Number(ship.startedAt) || 0;
      const dur = isFinite(Number(ship.durationMs)) ? Number(ship.durationMs) : SHIPMENT_DURATION_MS;
      end = started + dur;
    }
    return Math.max(0, end - Date.now());
  }

  /** Elapsed progress as a 0..100 percentage (for the progress bar). */
  function getProgressPct(ship) {
    const total = Number(ship && ship.totalDurationMs) > 0 ? ship.totalDurationMs : SHIPMENT_DURATION_MS;
    const remaining = getRemainingMs(ship);
    const pct = ((total - remaining) / total) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  function isReady(ship) { return getRemainingMs(ship) === 0; }

  /* =========================================================
   * Delivery — shared by manual claim + auto-sweep
   * ========================================================= */
  function deliverShipment(ship, opts) {
    opts = opts || {};
    const s = S();
    const useWarehouse = ship.destination === "warehouse" && Array.isArray(s.warehouse);
    const dest = useWarehouse ? s.warehouse : s.inventory;
    const normalize = window.FlippingTycoon && window.FlippingTycoon.normalizeInventoryItem;

    (ship.items || []).forEach((it) => {
      // Stamp buyDay at arrival so age / holding-cost calcs start now.
      it.buyDay = s.currentDay;
      if (normalize) normalize(it);
      dest.push(it);
    });

    const destLabel = useWarehouse ? "Warehouse" : "Inventory";
    if (!opts.silent) {
      toast(`✅ ${ship.items.length} unit dari ${ship.label} masuk ${destLabel}.`, "success");
    }
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: opts.auto ? "Kargo Tiba Otomatis" : "Kargo Tiba & Dikirim",
        message: `${ship.items.length} unit dari ${ship.label} ${opts.auto ? "otomatis masuk" : "berhasil di-claim ke"} ${destLabel}.`,
        actionPage: useWarehouse ? "warehouse" : "inventory",
        actor: ship.source === "batam" ? "Batam Syndicate" : "Partnership Hub",
        icon: "truck-fast",
      });
    }
    return destLabel;
  }

  /**
   * Manual claim — moves items to their destination and removes
   * the shipment. Refuses if the cargo is not ready yet.
   */
  function claimShipment(shipmentId) {
    ensureShipments();
    const s = S();
    const idx = s.activeShipments.findIndex((x) => x.id === shipmentId);
    if (idx < 0) return false;
    const ship = s.activeShipments[idx];
    if (!isReady(ship)) {
      toast("Belum bisa klaim — kargo masih dalam perjalanan.", "error");
      return false;
    }

    /* Part 35 — Mystery Pallet Unboxing (Gacha).
     * Batam cargo no longer dumps straight into Inventory. Instead we
     * hand the ready shipment to the unboxing mini-game, which rolls a
     * weighted loot table and pushes each unit only as its box is
     * revealed (and removes the shipment itself once fully opened). */
    if (ship.source === "batam" && window.Unboxing &&
        typeof window.Unboxing.isEnabled === "function" && window.Unboxing.isEnabled()) {
      const launched = window.Unboxing.open(ship);
      if (launched) return true; // unboxing owns delivery + shipment removal
      // If it failed to launch, fall through to the legacy instant claim.
    }

    deliverShipment(ship, { auto: false });
    s.activeShipments.splice(idx, 1);
    persist();
    rerenderActivePage();
    return true;
  }

  /**
   * removeShipment(id) — remove a shipment from the queue WITHOUT
   * delivering its items. Used by the Mystery Pallet unboxing flow,
   * which pushes items into Inventory itself (one per revealed box)
   * and then asks logistics to drop the now-empty shipment.
   */
  function removeShipment(shipmentId) {
    ensureShipments();
    const s = S();
    const idx = s.activeShipments.findIndex((x) => x.id === shipmentId);
    if (idx < 0) return false;
    s.activeShipments.splice(idx, 1);
    persist();
    return true;
  }

  /**
   * Auto-delivery sweep — moves EVERY ready cargo (endTime <= now)
   * into Inventory/Warehouse without a manual click. Runs from the
   * global ticker and on key lifecycle events (app open, next day).
   * Returns the number of shipments delivered.
   */
  function sweepDeliveries() {
    ensureShipments();
    const s = S();
    if (!Array.isArray(s.activeShipments) || s.activeShipments.length === 0) return 0;

    let delivered = 0;
    // Iterate over a snapshot so splicing while looping is safe.
    s.activeShipments.slice().forEach((ship) => {
      if (!isReady(ship)) return;
      // Part 35 — Batam cargo is an interactive Mystery Pallet: it must
      // NOT auto-deliver. It waits, "ready to open", until the player taps
      // "Buka Mystery Pallet" (which routes through window.Unboxing). The
      // items are safe in the queue meanwhile, so nothing is ever lost.
      if (ship.source === "batam" && window.Unboxing &&
          typeof window.Unboxing.isEnabled === "function" && window.Unboxing.isEnabled()) {
        return;
      }
      deliverShipment(ship, { auto: true });
      const idx = s.activeShipments.indexOf(ship);
      if (idx >= 0) s.activeShipments.splice(idx, 1);
      delivered++;
    });

    if (delivered > 0) persist();
    return delivered;
  }

  /* =========================================================
   * 2-step rewarded-ad math (shared by the built-in mock ad
   * overlay AND the native AdMob path in ads.js).
   *
   *   adWatchedCount === 0  → cut remaining time in HALF
   *   adWatchedCount === 1  → arrive instantly (endTime = now)
   *   adWatchedCount >= 2   → no-op
   *
   * Returns the step actually applied: 1, 2, or 0 (no-op).
   * ========================================================= */
  function applyAdReward(shipmentId) {
    ensureShipments();
    const s = S();
    const ship = s.activeShipments.find((x) => x.id === shipmentId);
    if (!ship) return 0;

    if (ship.adWatchedCount >= 2) {
      toast("Sudah maksimum tonton 2x iklan per kargo.", "error");
      return 0;
    }
    if (isReady(ship)) {
      toast("Kargo sudah siap diklaim.");
      return 0;
    }

    const remaining = getRemainingMs(ship);
    let step = 0;

    if (ship.adWatchedCount === 0) {
      // AD 1 — cut the remaining time by exactly 50%.
      // remaining_new = endTime_new - now
      //               = (endTime - remaining/2) - now
      //               = remaining - remaining/2 = remaining / 2  ✓
      ship.endTime = Date.now() + Math.floor(remaining / 2);
      ship.adWatchedCount = 1;
      step = 1;
      toast("⚡ Waktu pengiriman dipotong 50%!", "success");
    } else if (ship.adWatchedCount === 1) {
      // AD 2 — arrive instantly. Setting endTime to now makes
      // remaining === 0, so the next sweep auto-delivers it.
      ship.endTime = Date.now();
      ship.adWatchedCount = 2;
      step = 2;
      toast("⚡⚡ Instan sampai! Barang langsung dikirim.", "success");
    }

    persist();
    // If the ad made it instant, deliver right away so the player
    // sees the cargo land immediately instead of waiting for the tick.
    if (isReady(ship)) sweepDeliveries();
    rerenderActivePage();
    return step;
  }

  /**
   * Built-in mock rewarded-ad: shows a 2-second full-screen
   * loading modal, then applies the 2-step reward math. Used as
   * the web fallback when the native AdMob plugin is unavailable.
   */
  function showRewardedAd(shipmentId) {
    ensureShipments();
    const s = S();
    const ship = s.activeShipments.find((x) => x.id === shipmentId);
    if (!ship) return;
    if (ship.adWatchedCount >= 2) {
      toast("Sudah maksimum tonton 2x iklan per kargo.", "error");
      return;
    }
    if (isReady(ship)) {
      toast("Kargo sudah siap diklaim.");
      return;
    }
    showAdOverlay(() => applyAdReward(shipmentId));
  }

  /* =========================================================
   * Mock rewarded-ad overlay (2-second progress bar)
   * ========================================================= */
  function showAdOverlay(onComplete) {
    let modal = document.querySelector("#ad-overlay");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ad-overlay";
      document.body.appendChild(modal);
    }
    modal.className = "ad-overlay flex";
    modal.innerHTML = `
      <div class="ad-overlay-card">
        <p class="ad-overlay-tag">Sponsored Ad</p>
        <div class="ad-overlay-art"><i class="fa-solid fa-bolt"></i></div>
        <p class="ad-overlay-title">Memutar Iklan untuk Reward...</p>
        <p class="ad-overlay-sub">Reward unlock dalam <span id="ad-countdown">2</span> detik</p>
        <div class="ad-overlay-track"><div id="ad-progress-fill" class="ad-overlay-fill"></div></div>
      </div>
    `;

    const start = Date.now();
    const cd = modal.querySelector("#ad-countdown");
    const fill = modal.querySelector("#ad-progress-fill");
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / AD_OVERLAY_MS) * 100);
      if (fill) fill.style.width = pct + "%";
      const left = Math.max(0, Math.ceil((AD_OVERLAY_MS - elapsed) / 1000));
      if (cd) cd.textContent = left;
      if (elapsed >= AD_OVERLAY_MS) {
        clearInterval(timer);
        modal.classList.remove("flex");
        modal.classList.add("hidden");
        modal.innerHTML = "";
        try { onComplete && onComplete(); } catch (e) { console.error(e); }
      }
    }, 80);
  }

  /* =========================================================
   * Global ticker — always running (once per second).
   *   1) Auto-delivers any ready cargo (sweepDeliveries).
   *   2) If the user is on the Kargo/Logistik page, live-updates
   *      the timer text + progress bars in place.
   * ========================================================= */
  let _tickerId = null;

  function startGlobalTicker() {
    if (_tickerId) return;
    _tickerId = setInterval(tick, 1000);
  }

  function tick() {
    if (!window.FlippingTycoon || !window.FlippingTycoon.State) return;
    const s = S();
    if (!s || !Array.isArray(s.activeShipments) || s.activeShipments.length === 0) return;

    // 1) Auto-deliver finished cargo.
    const delivered = sweepDeliveries();

    // 2) Keep the on-screen timers fresh while viewing logistics.
    if (s.activePage === "logistics") {
      if (delivered > 0 && !isEditingText()) {
        rerenderActivePage(); // cards changed — rebuild the list
      } else {
        updateTimers();       // cheap in-place DOM refresh
      }
    } else if (delivered > 0 && !isEditingText()) {
      // Delivered while on another page — refresh so any summary
      // tiles / badges reflect the new inventory state. We skip this
      // while the user is typing (e.g. the Banking bank-name field) so
      // a full re-render never wipes focus/unsaved input.
      rerenderActivePage();
    }
  }

  /* True while the user is typing in a form field — used to avoid
   * disruptive full re-renders triggered by background auto-delivery. */
  function isEditingText() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
  }

  function updateTimers() {
    const s = S();
    if (!Array.isArray(s.activeShipments)) return;

    s.activeShipments.forEach((ship) => {
      const card = document.querySelector(`[data-ship-id="${ship.id}"]`);
      if (!card) return;

      const remaining = getRemainingMs(ship);
      const ready = remaining === 0;
      const pct = getProgressPct(ship);

      const timerEl  = card.querySelector(".ship-timer");
      const barEl    = card.querySelector(".ship-progress-fill");
      const claimBtn = card.querySelector(".ship-claim-btn");
      const adBtn    = card.querySelector(".ship-ad-btn");

      if (timerEl) {
        timerEl.textContent = ready ? "Siap diklaim!" : fmtTime(remaining);
        timerEl.style.color = ready ? "#059669" : ship.accent;
      }
      if (barEl) {
        barEl.style.width = pct + "%";
        barEl.style.background = ready ? "#10b981" : ship.accent;
      }
      if (claimBtn) claimBtn.classList.toggle("hidden", !ready);
      if (adBtn)    adBtn.classList.toggle("hidden", ready);
      card.classList.toggle("shipment-card-ready", ready);
    });
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  /* =========================================================
   * Page renderer — "Kargo / Logistik"
   * ========================================================= */
  function renderLogisticsPage() {
    ensureShipments();
    // Deliver anything that finished while the app was away/closed,
    // BEFORE we read the queue for rendering.
    sweepDeliveries();

    const s = S();
    const wrap = document.createElement("div");

    const totalActive = s.activeShipments.length;
    const totalReady  = s.activeShipments.filter(isReady).length;

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <h3 class="flex items-center gap-2">
            <i class="fa-solid fa-truck-fast text-cyan-600"></i> Kargo / Logistik
          </h3>
          <p class="text-sm text-gray-500 mt-1">
            Tracking real-time kargo dari Batam Supplier &amp; Partnership Hub.
            Setiap kargo butuh <b>2 jam</b> sampai tiba &mdash; timer jalan terus
            walau aplikasi ditutup, dan barang otomatis masuk gudang saat sampai.
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-gray-400">Aktif</p>
          <p class="font-bold text-base">${totalActive}</p>
          ${totalReady > 0
            ? `<p class="text-xs text-emerald-600 font-semibold mt-1">${totalReady} siap</p>`
            : ""}
        </div>
      </div>
    `;
    wrap.appendChild(header);

    if (totalActive === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-cyan-50 flex items-center justify-center text-cyan-600 text-2xl mb-3">
          <i class="fa-solid fa-truck-fast"></i>
        </div>
        <h3>Belum ada kargo aktif</h3>
        <p class="text-sm text-gray-500 mt-1">
          Order kargo dari <b>Batam Supplier</b> atau bulk package dari
          <b>Partnership Hub</b>, lalu pantau ETA-nya di sini.
        </p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    // Sort: closest to ready first.
    const sorted = [...s.activeShipments].sort((a, b) =>
      getRemainingMs(a) - getRemainingMs(b)
    );
    sorted.forEach((ship) => wrap.appendChild(renderShipmentCard(ship)));

    // Make sure the global ticker is running so timers tick live.
    startGlobalTicker();
    return wrap;
  }

  function renderShipmentCard(ship) {
    const remaining = getRemainingMs(ship);
    const ready = remaining === 0;
    const pct = getProgressPct(ship);

    const adBtnLabel = ship.adWatchedCount === 0
      ? "Tonton Iklan (Percepat 50%)"
      : "Tonton Iklan (Instan Sampai)";

    const adNote = ship.adWatchedCount === 1
      ? `<p class="ship-ad-note"><i class="fa-solid fa-bolt"></i> Diskon 50% sudah dipakai &middot; tonton 1x lagi untuk instan sampai.</p>`
      : ship.adWatchedCount >= 2
        ? `<p class="ship-ad-note ok"><i class="fa-solid fa-circle-check"></i> Boost iklan maksimum &mdash; tinggal tunggu/klaim.</p>`
        : `<p class="ship-ad-note"><i class="fa-solid fa-circle-info"></i> 2x iklan tersedia: ad-1 potong 50%, ad-2 instan sampai.</p>`;

    const sourceTag = ship.source === "batam"
      ? '<span class="ship-source-tag" style="background:#cffafe;color:#0e7490">Batam</span>'
      : '<span class="ship-source-tag" style="background:#ede9fe;color:#6d28d9">Partnership</span>';

    // Part 35 — Batam cargo opens as an interactive Mystery Pallet (gacha),
    // so its claim button is reframed from a plain "claim" into an "open".
    const unboxable = ship.source === "batam" && window.Unboxing &&
      typeof window.Unboxing.isEnabled === "function" && window.Unboxing.isEnabled();
    const claimLabel = unboxable
      ? '<i class="fa-solid fa-box-open"></i> Buka Mystery Pallet'
      : '<i class="fa-solid fa-circle-check"></i> Klaim Barang Sekarang';

    const destTag = ship.destination === "warehouse"
      ? '<span class="ship-source-tag" style="background:#fef3c7;color:#92400e">→ Gudang</span>'
      : '<span class="ship-source-tag" style="background:#dcfce7;color:#166534">→ Inventory</span>';

    const card = document.createElement("div");
    card.className = "fb-card shipment-card" + (ready ? " shipment-card-ready" : "");
    card.setAttribute("data-ship-id", ship.id);
    card.innerHTML = `
      <!-- Top row: icon + title/meta (flex-1 min-w-0) + timer -->
      <div class="shipment-card-head">
        <div class="ship-icon" style="background:${ship.accent}22;color:${ship.accent}">
          <i class="fa-solid fa-${ship.icon}"></i>
        </div>
        <div class="ship-info">
          <div class="ship-title-row">
            <p class="ship-title">${ship.label}</p>
            ${sourceTag}${destTag}
          </div>
          <p class="ship-meta">
            ${ship.items.length} unit &middot; total ${fmt(ship.totalCost)}${ship.paymentBank ? " &middot; via " + ship.paymentBank : ""}
          </p>
        </div>
        <div class="ship-timer-box">
          <p class="ship-timer-label">${ready ? "Status" : "Sisa Waktu"}</p>
          <p class="ship-timer" style="color:${ready ? "#059669" : ship.accent}">
            ${ready ? "Siap diklaim!" : fmtTime(remaining)}
          </p>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="ship-progress-track">
        <div class="ship-progress-fill" style="width:${pct}%; background:${ready ? "#10b981" : ship.accent}"></div>
      </div>

      <!-- Actions: full-width on mobile, stack cleanly -->
      <div class="ship-actions">
        <button class="ship-claim-btn ${ready ? "" : "hidden"}${unboxable ? " ship-claim-btn-gacha" : ""}" type="button" data-id="${ship.id}">
          ${claimLabel}
        </button>
        <button class="ship-ad-btn ${ready ? "hidden" : ""}" type="button" data-id="${ship.id}" ${ship.adWatchedCount >= 2 ? "disabled" : ""}>
          <i class="fa-solid fa-tv"></i> ${adBtnLabel}
        </button>
      </div>
      ${adNote}
    `;

    const claimBtn = card.querySelector(".ship-claim-btn");
    if (claimBtn) claimBtn.addEventListener("click", () => claimShipment(ship.id));

    const adBtn = card.querySelector(".ship-ad-btn");
    if (adBtn) {
      adBtn.addEventListener("click", () => {
        if (ship.adWatchedCount >= 2) return;
        // Prefer the native AdMob path (ads.js); fall back to the
        // built-in 2-second mock ad on the web.
        if (window.AdsEngine && typeof window.AdsEngine.playRewardedAd === "function") {
          window.AdsEngine.playRewardedAd(ship.id);
        } else {
          showRewardedAd(ship.id);
        }
      });
    }

    return card;
  }

  /* =========================================================
   * Helpers
   * ========================================================= */
  function activeCount() {
    ensureShipments();
    return S().activeShipments.length;
  }
  function readyCount() {
    ensureShipments();
    return S().activeShipments.filter(isReady).length;
  }

  /* The global ticker is started from enterApp() (script.js) once the
   * player is actually inside the app, and again from renderLogisticsPage().
   * We intentionally do NOT auto-start on DOMContentLoaded so a returning
   * player sitting on the home screen doesn't get background deliveries /
   * toasts before they press "Continue". */

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Logistics = {
    addShipment,
    claimShipment,
    removeShipment,
    sweepDeliveries,
    applyAdReward,
    showRewardedAd,
    renderLogisticsPage,
    getRemainingMs,
    getProgressPct,
    isReady,
    activeCount,
    readyCount,
    ensureShipments,
    startGlobalTicker,
    fmtTime,
    SHIPMENT_DURATION_MS,
  };
})();
