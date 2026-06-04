/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 33 — Real-Time Shipping & Ad-Skip Mechanic
 *
 * Centralised logistics layer for Batam Supplier and Brand
 * Partnership orders. Replaces the old "instant arrival" path
 * with a real-time 2-hour countdown driven by Date.now() so
 * the timer keeps progressing even when the PWA is closed
 * (offline / idle progress).
 *
 * Public:
 *   window.Logistics.addShipment(opts)          — queue a new shipment
 *   window.Logistics.claimShipment(id)          — move items to dest
 *   window.Logistics.showRewardedAd(id)         — double-ad loop
 *   window.Logistics.renderLogisticsPage()      — Kargo / Logistik tab
 *   window.Logistics.getRemainingMs(s)          — ms left until ready
 *   window.Logistics.isReady(s)                 — bool, remaining===0
 *   window.Logistics.activeCount() / readyCount()
 *   window.Logistics.SHIPMENT_DURATION_MS       — 2h = 7_200_000
 * ========================================================= */

(function () {
  const SHIPMENT_DURATION_MS = 7_200_000; // 2 hours real-time

  function S() { return window.FlippingTycoon.State.data; }
  function fmt(n) {
    return window.Market ? window.Market.formatRupiah(n) :
      ("Rp " + (n || 0).toLocaleString("id-ID"));
  }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  function ensureShipments() {
    const s = S();
    if (!Array.isArray(s.activeShipments)) s.activeShipments = [];
  }

  /* =========================================================
   * Core API
   * ========================================================= */

  /**
   * Add a shipment to activeShipments. The shipment is NOT
   * delivered immediately — the player must wait
   * SHIPMENT_DURATION_MS (2h real-time) and then click "Klaim
   * Barang", or use the rewarded-ad loop to skip the timer.
   *
   * opts: {
   *   source: "batam" | "partnership",
   *   label:  string  (e.g. "Batam Cargo #abcd" or "Pear Flagship"),
   *   icon:   string  (Font Awesome icon name, no fa- prefix),
   *   accent: string  (hex color),
   *   destination: "inventory" | "warehouse",
   *   items:  array of inventory-shaped items,
   *   totalCost:   number (already debited, for display only),
   *   paymentBank: string ("Mandiri" | "BCA" | "BNI" | null),
   *   meta:   object  (any extra info),
   * }
   */
  function addShipment(opts) {
    ensureShipments();
    const s = S();
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
      startedAt:   Date.now(),
      durationMs:  SHIPMENT_DURATION_MS,
      adWatches:   0,
      claimed:     false,
      meta:        opts.meta || {},
    };
    s.activeShipments.push(ship);
    if (window.FlippingTycoon && window.FlippingTycoon.saveGame) {
      window.FlippingTycoon.saveGame();
    }
    return ship;
  }

  function getRemainingMs(ship) {
    if (!ship) return 0;
    const elapsed = Date.now() - Number(ship.startedAt || 0);
    const remaining = Number(ship.durationMs || 0) - elapsed;
    return Math.max(0, remaining);
  }

  function isReady(ship) { return getRemainingMs(ship) === 0; }

  /**
   * Move shipment items to their destination container, then
   * remove the shipment from activeShipments. Refuses if not
   * ready yet.
   */
  function claimShipment(shipmentId) {
    ensureShipments();
    const s = S();
    const idx = s.activeShipments.findIndex((x) => x.id === shipmentId);
    if (idx < 0) return false;
    const ship = s.activeShipments[idx];
    if (!isReady(ship)) {
      showToast("Belum bisa klaim — kargo masih dalam perjalanan.");
      return false;
    }

    const useWarehouse = ship.destination === "warehouse" && Array.isArray(s.warehouse);
    const dest = useWarehouse ? s.warehouse : s.inventory;
    const normalize = window.FlippingTycoon && window.FlippingTycoon.normalizeInventoryItem;

    ship.items.forEach((it) => {
      // Stamp buyDay at claim time so age/holding-cost calcs start now.
      it.buyDay = s.currentDay;
      if (normalize) normalize(it);
      dest.push(it);
    });

    s.activeShipments.splice(idx, 1);
    if (window.FlippingTycoon && window.FlippingTycoon.saveGame) {
      window.FlippingTycoon.saveGame();
    }

    const destLabel = useWarehouse ? "Warehouse" : "Inventory";
    showToast(`✅ Klaim sukses — ${ship.items.length} unit masuk ${destLabel}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Kargo Tiba & Dikirim",
        message: `${ship.items.length} unit dari ${ship.label} berhasil di-claim ke ${destLabel}.`,
        actionPage: useWarehouse ? "warehouse" : "inventory",
        actor: ship.source === "batam" ? "Batam Syndicate" : "Partnership Hub",
        icon: "truck-fast",
      });
    }
    if (window.FlippingTycoon && window.FlippingTycoon.renderActivePage) {
      window.FlippingTycoon.renderActivePage();
    }
    return true;
  }

  /**
   * The 2-step rewarded-ad loop:
   *   adWatches === 0  → cut remaining time exactly in HALF (50% off)
   *   adWatches === 1  → instant skip, remaining = 0 (Klaim Barang reveals)
   *   adWatches >= 2   → no-op (already maxed)
   */
  function showRewardedAd(shipmentId) {
    ensureShipments();
    const s = S();
    const ship = s.activeShipments.find((x) => x.id === shipmentId);
    if (!ship) return;
    if (ship.adWatches >= 2) {
      showToast("Sudah maksimum tonton 2x per kargo.");
      return;
    }
    if (isReady(ship)) {
      showToast("Kargo sudah siap diklaim.");
      return;
    }

    showAdOverlay(() => {
      const remaining = getRemainingMs(ship);
      if (ship.adWatches === 0) {
        // 50% discount — cut remaining time in half.
        ship.durationMs = Math.max(0, ship.durationMs - Math.floor(remaining / 2));
        ship.adWatches = 1;
        showToast("⚡ Waktu pengiriman dipotong 50%!");
      } else if (ship.adWatches === 1) {
        // Instant skip — remaining becomes 0.
        ship.durationMs = Math.max(0, Date.now() - Number(ship.startedAt || 0));
        ship.adWatches = 2;
        showToast("⚡⚡ Instan sampai! Tinggal klaim.");
      }
      if (window.FlippingTycoon && window.FlippingTycoon.saveGame) {
        window.FlippingTycoon.saveGame();
      }
      if (window.FlippingTycoon && window.FlippingTycoon.renderActivePage) {
        window.FlippingTycoon.renderActivePage();
      }
    });
  }

  /* =========================================================
   * Mock rewarded-ad overlay (3-second progress bar)
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
        <p class="ad-overlay-title">Tonton Iklan untuk Reward...</p>
        <p class="ad-overlay-sub">Reward unlock dalam <span id="ad-countdown">3</span> detik</p>
        <div class="ad-overlay-track"><div id="ad-progress-fill" class="ad-overlay-fill"></div></div>
      </div>
    `;

    const totalMs = 3000;
    const start = Date.now();
    const cd = modal.querySelector("#ad-countdown");
    const fill = modal.querySelector("#ad-progress-fill");
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      if (fill) fill.style.width = pct + "%";
      const left = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      if (cd) cd.textContent = left;
      if (elapsed >= totalMs) {
        clearInterval(timer);
        modal.classList.remove("flex");
        modal.classList.add("hidden");
        modal.innerHTML = "";
        try { onComplete && onComplete(); } catch (e) { console.error(e); }
      }
    }, 100);
  }

  /* =========================================================
   * Live ticker — runs only while the user is on the
   * "Kargo / Logistik" page. Updates timer text + progress bar
   * + reveals the green "Klaim Barang" button when ready.
   * ========================================================= */
  let _intervalId = null;

  function startTicker() {
    if (_intervalId) return;
    _intervalId = setInterval(updateTimers, 1000);
  }
  function stopTicker() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
  }

  function updateTimers() {
    const s = S();
    if (!s || s.activePage !== "logistics") {
      stopTicker();
      return;
    }
    if (!Array.isArray(s.activeShipments) || s.activeShipments.length === 0) return;

    s.activeShipments.forEach((ship) => {
      const card = document.querySelector(`[data-ship-id="${ship.id}"]`);
      if (!card) return;

      const remaining = getRemainingMs(ship);
      const ready = remaining === 0;
      const elapsedPct = Math.min(100, Math.max(0,
        ship.durationMs > 0
          ? ((ship.durationMs - remaining) / ship.durationMs) * 100
          : 100
      ));

      const timerEl  = card.querySelector(".ship-timer");
      const barEl    = card.querySelector(".ship-progress-fill");
      const claimBtn = card.querySelector(".ship-claim-btn");
      const adBtn    = card.querySelector(".ship-ad-btn");

      if (timerEl) timerEl.textContent = ready ? "Siap diklaim!" : fmtTime(remaining);
      if (barEl)   barEl.style.width = elapsedPct + "%";
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
    const s = S();
    const wrap = document.createElement("div");

    const totalActive = s.activeShipments.length;
    const totalReady  = s.activeShipments.filter(isReady).length;

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2">
            <i class="fa-solid fa-truck-fast text-cyan-600"></i> Kargo / Logistik
          </h3>
          <p class="text-sm text-gray-500 mt-1">
            Tracking real-time kargo dari Batam Supplier &amp; Partnership Hub.
            Setiap kargo butuh <b>2 jam</b> sampai siap diklaim.
            Timer jalan terus walaupun aplikasi ditutup &mdash; cek lagi nanti!
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

    // Sort: ready first, then closest to ready
    const sorted = [...s.activeShipments].sort((a, b) =>
      getRemainingMs(a) - getRemainingMs(b)
    );
    sorted.forEach((ship) => wrap.appendChild(renderShipmentCard(ship)));

    // Kick off the live ticker; it auto-stops when the user leaves this page.
    setTimeout(startTicker, 0);
    return wrap;
  }

  function renderShipmentCard(ship) {
    const remaining = getRemainingMs(ship);
    const ready = remaining === 0;
    const elapsedPct = Math.min(100, Math.max(0,
      ship.durationMs > 0
        ? ((ship.durationMs - remaining) / ship.durationMs) * 100
        : 100
    ));
    const adBtnLabel = ship.adWatches === 0
      ? "Tonton Iklan (Percepat Waktu)"
      : "Tonton Iklan (Instan Sampai)";
    const adNote = ship.adWatches === 1
      ? `<p class="ship-ad-note"><i class="fa-solid fa-bolt"></i> Diskon 50% sudah dipakai &middot; tonton 1x lagi untuk instan sampai.</p>`
      : ship.adWatches === 2
        ? `<p class="ship-ad-note ok"><i class="fa-solid fa-circle-check"></i> Boost iklan maksimum &mdash; siap diklaim.</p>`
        : "";

    const sourceTag = ship.source === "batam"
      ? '<span class="ship-source-tag" style="background:#cffafe;color:#0e7490">Batam</span>'
      : '<span class="ship-source-tag" style="background:#ede9fe;color:#6d28d9">Partnership</span>';

    const card = document.createElement("div");
    card.className = "fb-card shipment-card" + (ready ? " shipment-card-ready" : "");
    card.setAttribute("data-ship-id", ship.id);
    card.innerHTML = `
      <div class="shipment-card-head">
        <div class="ship-icon" style="background:${ship.accent}22;color:${ship.accent}">
          <i class="fa-solid fa-${ship.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="ship-title">${ship.label}</p>
            ${sourceTag}
          </div>
          <p class="ship-meta">
            ${ship.items.length} unit &middot; total ${fmt(ship.totalCost)}${ship.paymentBank ? " &middot; via " + ship.paymentBank : ""}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-gray-400">${ready ? "Status" : "Sisa Waktu"}</p>
          <p class="ship-timer" style="color:${ready ? "#059669" : ship.accent}">
            ${ready ? "Siap diklaim!" : fmtTime(remaining)}
          </p>
        </div>
      </div>

      <div class="ship-progress-track">
        <div class="ship-progress-fill" style="width:${elapsedPct}%; background:${ready ? "#10b981" : ship.accent}"></div>
      </div>

      <div class="ship-actions">
        <button class="ship-claim-btn ${ready ? "" : "hidden"}" type="button" data-id="${ship.id}">
          <i class="fa-solid fa-circle-check"></i> Klaim Barang
        </button>
        <button class="ship-ad-btn ${ready ? "hidden" : ""}" type="button" data-id="${ship.id}">
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
        if (window.AdsEngine) {
            // Panggil Iklan Asli AdMob
            window.AdsEngine.playRewardedAd(ship.id);
        } else {
            // Fallback ke fungsi lama
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

  function showToast(msg) {
    let toast = document.querySelector("#ft-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ft-toast";
      toast.className = "ft-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Logistics = {
    addShipment,
    claimShipment,
    showRewardedAd,
    renderLogisticsPage,
    getRemainingMs,
    isReady,
    activeCount,
    readyCount,
    ensureShipments,
    fmtTime,
    SHIPMENT_DURATION_MS,
  };
})();
