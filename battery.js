/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 37 — Battery Health (BH) & Battery Bypass ("Suntik BH")
 *
 * A Pear-only (parody iPhone) mechanic:
 *   - Every spawned 'Pear' gadget carries a `batteryHealth` (65–100).
 *   - Low BH drags the price down; 95–100 nudges it up.
 *   - Repair Center offers two paths for a low-BH PearPhone:
 *       A) Ganti Baterai Original (Rp 800.000)  -> BH=100, permanently safe
 *       B) Suntik BH / Software Bypass (Rp 100.000) -> BH shows 100 on the UI
 *          but a hidden `isBypassed:true` flag is injected.
 *   - The Trap: selling a bypassed phone may (25%) be discovered on the
 *     NEXT DAY — the buyer rages, you are force-refunded the sold price,
 *     the phone returns to Inventory with its real low BH, and your
 *     Reputation drops.
 *
 * This file is modular and self-contained. It exposes window.Battery
 * and hooks into market.js (pricing), repair.js (UI section),
 * selling.js (sale logging) and script.js (Next Day tick).
 * ========================================================= */

(function () {
  "use strict";

  /* ---------- Shared helpers ---------- */
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) {
    return window.Market && window.Market.formatRupiah
      ? window.Market.formatRupiah(n)
      : "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }
  function uid(p)  { return p + "-" + Math.random().toString(36).slice(2, 10); }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  /* ---------- Tunables (all IDR) ---------- */
  const ORIGINAL_BATTERY_COST = 800_000;   // Option A: genuine replacement
  const SUNTIK_BH_COST        = 100_000;   // Option B: software bypass
  const REFUND_DISCOVERY_RATE = 0.25;      // 25% chance/day a bypass is busted
  const REP_PENALTY           = 8;         // reputation points lost on a bust

  // A PearPhone is "serviceable" (shows the BH buttons) below this BH.
  const SERVICE_THRESHOLD     = 86;

  /* =========================================================
   * 1. ITEM GENERATION
   * ========================================================= */

  /** True only for the parody-Apple brand. */
  function isPearGadget(gadget) {
    return !!(gadget && gadget.brand === "Pear");
  }

  /** Roll a fresh battery health between 65 and 100 (inclusive). */
  function rollBatteryHealth() {
    return randInt(65, 100);
  }

  /**
   * Price multiplier driven by the (displayed) battery health.
   *   >= 95 : +5%   (premium, "like new")
   *   86–94 : 1.00  (healthy)
   *   80–85 : -5%
   *   < 80  : -20%  (significant drop — needs service)
   * Non-Pear items (bh == null) are unaffected (×1.0).
   */
  function healthMultiplier(bh) {
    if (typeof bh !== "number") return 1;
    if (bh >= 95) return 1.05;
    if (bh >= 86) return 1.00;
    if (bh >= 80) return 0.95;
    return 0.80;
  }

  /**
   * Inject batteryHealth onto a freshly-generated listing/item IF it's a
   * Pear gadget. Idempotent: never overwrites an existing value.
   * Returns the (possibly mutated) target for chaining.
   */
  function applyBatteryHealth(target, gadget) {
    if (!target || !isPearGadget(gadget)) return target;
    if (typeof target.batteryHealth === "number") return target;
    target.batteryHealth = rollBatteryHealth();
    target.isBypassed = false;
    return target;
  }

  /**
   * Standalone generator (handy for Batam cargo / gacha spawners).
   * Returns { batteryHealth, isBypassed } or null for non-Pear gadgets.
   */
  function generateBatteryFields(gadget) {
    if (!isPearGadget(gadget)) return null;
    return { batteryHealth: rollBatteryHealth(), isBypassed: false };
  }

  /* =========================================================
   * 2. BH BADGE (Tailwind, color-coded)
   *   86–100 : green  (text-green-500)
   *   76–85  : yellow (text-yellow-500)
   *   <= 75  : red    (text-red-500) + "Service" label
   * ========================================================= */
  function badgeHtml(bh, opts) {
    if (typeof bh !== "number") return "";
    opts = opts || {};
    let textClass, bgClass, icon, label = `BH ${bh}%`;
    if (bh >= 86) {
      textClass = "text-green-500";  bgClass = "bg-green-100";  icon = "battery-full";
    } else if (bh >= 76) {
      textClass = "text-yellow-500"; bgClass = "bg-yellow-100"; icon = "battery-half";
    } else {
      textClass = "text-red-500";    bgClass = "bg-red-100";    icon = "battery-quarter";
      label += " &middot; Service"; // call-to-service flag for the worst units
    }
    // `market-badge` keeps it visually consistent with the other condition chips.
    return `<span class="market-badge ft-bh-badge ${bgClass} ${textClass}" title="Battery Health ${bh}%">
      <i class="fa-solid fa-${icon}"></i> ${label}
    </span>`;
  }

  /* =========================================================
   * 3. STATE: pending returns queue
   * ========================================================= */
  function ensurePendingReturns() {
    const s = S();
    if (!Array.isArray(s.pendingReturns)) s.pendingReturns = [];
    return s.pendingReturns;
  }

  /** True if the item is a bypassed PearPhone (the time-bomb). */
  function isBypassed(item) {
    return !!(item && item.isBypassed === true);
  }

  /**
   * Called from selling.js completeSale(). If the sold listing was a
   * bypassed PearPhone, log it so the Next Day cycle can roll the trap.
   * `meta` = { soldPrice, receivingBank }.
   */
  function recordPotentialReturn(listing, meta) {
    if (!listing) return;
    const snap = listing.itemSnapshot || {};
    if (!isBypassed(snap)) return; // only bypassed Pears are risky

    ensurePendingReturns().push({
      id: uid("ret"),
      // Deep-ish copy of the snapshot so we can rebuild the item later.
      itemSnapshot: JSON.parse(JSON.stringify(snap)),
      soldPrice: Number(meta && meta.soldPrice) || listing.askingPrice || 0,
      receivingBank: (meta && meta.receivingBank) || "Mandiri",
      buyer: listing.currentOffer ? {
        name: listing.currentOffer.buyer.name,
        color: listing.currentOffer.buyer.color,
        avatar: listing.currentOffer.buyer.avatar,
        location: listing.currentOffer.buyer.location || null,
      } : { name: "Pembeli", color: "#ef4444", avatar: "B", location: null },
      soldDay: S().currentDay,
    });
    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * 4. THE TRAP — processed every Next Day
   *
   * For each pending bypassed sale, roll a 25% discovery. On a bust:
   *   - deduct the sold price from the receiving bank (forced refund),
   *   - rebuild the phone in Inventory with its REAL low BH (bypass undone),
   *   - subtract Reputation,
   *   - notify + (deferred) angry chat modal.
   * Sales that dodge the roll are simply cleared (buyer kept it).
   * ========================================================= */
  function processPendingReturns() {
    const s = S();
    const queue = ensurePendingReturns();
    if (queue.length === 0) return;

    const busted = [];
    const survivors = [];

    queue.forEach((entry) => {
      if (Math.random() < REFUND_DISCOVERY_RATE) busted.push(entry);
      // else: buyer never noticed (or kept it) — drop from the queue silently.
    });
    // Whether busted or not, every queued sale is resolved this cycle.
    s.pendingReturns = survivors; // (survivors stays empty by design)

    busted.forEach((entry) => executeRefund(entry));

    if (busted.length > 0) window.FlippingTycoon.saveGame();

    // Show the angry chat AFTER the Next Day overlay closes (~850ms).
    if (busted.length > 0) {
      const first = busted[0];
      setTimeout(() => showRageModal(first, busted.length), 1200);
    }
  }

  /** Apply one forced refund + restore the phone to inventory. */
  function executeRefund(entry) {
    const s = S();
    const snap = entry.itemSnapshot || {};
    const bank = entry.receivingBank in (s.bankBalances || {}) ? entry.receivingBank : "Mandiri";
    const refund = Number(entry.soldPrice) || 0;

    // 1) Force the money back out of the player's bank (can go negative —
    //    that's the punishment; the solvency systems handle the fallout).
    s.bankBalances[bank] = (s.bankBalances[bank] || 0) - refund;
    if (s.bankHistories && Array.isArray(s.bankHistories[bank])) {
      s.bankHistories[bank].push({
        type: "DEBIT",
        amount: refund,
        balanceAfter: s.bankBalances[bank],
        description: `REFUND — BH bypass ketahuan: ${snap.name} (komplain ${entry.buyer.name})`,
        category: "refund",
        day: s.currentDay,
        ts: Date.now(),
      });
    }

    // 2) Rebuild the phone in inventory with its REAL (low) battery health.
    const realBH = typeof snap.realBatteryHealth === "number"
      ? snap.realBatteryHealth
      : (typeof snap.batteryHealth === "number" ? snap.batteryHealth : 70);

    const restored = {
      id: snap.originalItemId || uid("ret-item"),
      gadgetId: snap.gadgetId,
      name: snap.name,
      brand: snap.brand,
      specs: snap.specs,
      completeness: snap.completeness,
      defect: snap.defect,
      hiddenDefect: snap.hiddenDefect || null,
      previousDefect: snap.previousDefect || null,
      accent: snap.accent,
      icon: snap.icon,
      buyPrice: snap.buyPrice || 0,
      buyDay: snap.buyDay || s.currentDay,
      isExInter: !!snap.isExInter,
      imeiStatus: snap.imeiStatus || null,
      totalRepairCost: snap.totalRepairCost || 0,
      // Battery: bypass undone, real BH exposed.
      batteryHealth: realBH,
      isBypassed: false,
      wasRefunded: true,           // marker for the inventory card
    };
    if (window.FlippingTycoon.normalizeInventoryItem) {
      window.FlippingTycoon.normalizeInventoryItem(restored);
    }
    if (!Array.isArray(s.inventory)) s.inventory = [];
    s.inventory.push(restored);

    // 3) Reputation hit.
    if (window.Reputation && typeof window.Reputation.applyDelta === "function") {
      window.Reputation.applyDelta(-REP_PENALTY, `Refund — BH bypass ${snap.name} ketahuan pembeli`);
    }

    // 4) Persistent notification (always, even if the modal is missed).
    if (window.Notifications && window.Notifications.add) {
      window.Notifications.add({
        type: "scam",
        title: "Komplain! BH Bypass Ketahuan",
        message: `${entry.buyer.name} sadar ${snap.name} BH-nya drop ke ${realBH}%. ` +
                 `Dana ${fmt(refund)} ditarik balik dari ${bank}, unit balik ke Inventory, reputasi -${REP_PENALTY}.`,
        actionPage: "inventory",
        actor: entry.buyer.name,
        icon: "triangle-exclamation",
      });
    }
  }

  /* =========================================================
   * 5. THE ANGRY CHAT MODAL (deferred)
   * ========================================================= */
  function showRageModal(entry, totalBusted) {
    if (typeof document === "undefined" || !document.body) return; // headless-safe
    const snap = entry.itemSnapshot || {};
    const realBH = typeof snap.realBatteryHealth === "number"
      ? snap.realBatteryHealth
      : (typeof snap.batteryHealth === "number" ? snap.batteryHealth : 70);
    const refund = Number(entry.soldPrice) || 0;
    const buyer = entry.buyer || { name: "Pembeli", color: "#ef4444", avatar: "B" };

    let overlay = document.querySelector("#battery-rage-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "battery-rage-overlay";
      document.body.appendChild(overlay);
    }
    overlay.className = "battery-rage-overlay flex";

    const extra = totalBusted > 1
      ? `<p class="rage-extra">+${totalBusted - 1} komplain refund lain hari ini. Cek Notifications.</p>`
      : "";

    overlay.innerHTML = `
      <div class="rage-shell" role="dialog" aria-label="Komplain Pembeli">
        <header class="rage-head">
          <div class="rage-avatar" style="background:${buyer.color}">${buyer.avatar}</div>
          <div class="rage-head-text">
            <p class="rage-name">${buyer.name}</p>
            <p class="rage-status"><i class="fa-solid fa-circle text-[7px]"></i> sangat marah</p>
          </div>
          <span class="rage-flag"><i class="fa-solid fa-triangle-exclamation"></i> Refund</span>
        </header>

        <div class="rage-body">
          <div class="rage-bubble rage-bubble-buyer">
            Bang, kok BH-nya tiba-tiba drop ke <b>${realBH}%</b>?! Katanya 100% mulus!
          </div>
          <div class="rage-bubble rage-bubble-buyer">
            Ini pasti di-<b>suntik</b> ya?! Gak terima saya. <b>Balikin duit saya ${fmt(refund)} SEKARANG!</b> 😡
          </div>
          <div class="rage-receipt">
            <div class="rage-phone">
              <i class="fa-solid fa-mobile-screen-button" style="color:${snap.accent || "#1c1c1e"}"></i>
              <div>
                <p class="rage-phone-name">${snap.name || "PearPhone"}</p>
                <p class="rage-phone-meta">BH asli ${realBH}% &middot; bypass ketahuan</p>
              </div>
            </div>
            <ul class="rage-lines">
              <li><span>Refund ke pembeli</span><b class="text-rose-600">- ${fmt(refund)}</b></li>
              <li><span>Unit balik ke Inventory</span><b>BH ${realBH}%</b></li>
              <li><span>Reputasi</span><b class="text-rose-600">- ${REP_PENALTY}</b></li>
            </ul>
          </div>
          ${extra}
        </div>

        <footer class="rage-foot">
          <button class="rage-btn" id="rage-ack" type="button">
            <i class="fa-solid fa-money-bill-transfer"></i> Terpaksa Refund 😞
          </button>
        </footer>
      </div>
    `;

    try { window.AudioManager && window.AudioManager.playErrorBuzz && window.AudioManager.playErrorBuzz(); } catch (e) {}

    const close = () => {
      overlay.classList.remove("flex");
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      if (window.FlippingTycoon && window.FlippingTycoon.renderActivePage) {
        window.FlippingTycoon.renderActivePage();
      }
    };
    overlay.querySelector("#rage-ack").addEventListener("click", close);
  }

  /* =========================================================
   * 6. REPAIR CENTER — Battery Service section
   * ========================================================= */

  /** PearPhones in inventory with low BH that aren't already bypassed/locked. */
  function eligibleItems() {
    const s = S();
    const locked = (it) => (window.Repair && window.Repair.isLocked ? window.Repair.isLocked(it) : false);
    return (s.inventory || []).filter((it) =>
      it && it.brand === "Pear" &&
      typeof it.batteryHealth === "number" &&
      it.batteryHealth < SERVICE_THRESHOLD &&
      !it.isBypassed &&
      !locked(it)
    );
  }

  /** Build the "Battery Service (PearPhone)" card, or null if nothing's eligible. */
  function renderBatterySection() {
    const items = eligibleItems();
    if (items.length === 0) return null;

    const sec = document.createElement("div");
    sec.className = "fb-card";
    sec.innerHTML = `
      <h3 class="mb-1"><i class="fa-solid fa-car-battery text-emerald-600"></i> Battery Service — PearPhone</h3>
      <p class="text-xs text-gray-500 mb-3">
        Unit Pear dengan Battery Health rendah. Pilih ganti baterai original (aman) atau
        suntik BH (murah, tapi <b class="text-rose-600">beresiko komplain refund</b> saat dijual).
      </p>
    `;
    items.forEach((it) => sec.appendChild(renderBatteryRow(it)));
    return sec;
  }

  function renderBatteryRow(item) {
    const accent = item.accent || "#1c1c1e";
    const row = document.createElement("div");
    row.className = "repair-row battery-row";
    row.innerHTML = `
      <div class="repair-icon"><i class="fa-solid fa-mobile-screen-button text-3xl" style="color:${accent}"></i></div>
      <div class="repair-body">
        <p class="repair-title">${item.name}</p>
        <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="repair-defects">${badgeHtml(item.batteryHealth)}</div>
      </div>
      <div class="repair-action battery-action">
        <!-- ============================================================
             TWO REPAIR OPTIONS (Tailwind). Paste-ready snippet.
        ============================================================= -->
        <button class="bh-btn bh-btn-original
                       inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                       bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold w-full"
                data-id="${item.id}" data-mode="original">
          <i class="fa-solid fa-battery-full"></i>
          Ganti Baterai Original
          <span class="bh-price">${fmt(ORIGINAL_BATTERY_COST)}</span>
        </button>
        <button class="bh-btn bh-btn-suntik
                       inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                       bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold w-full mt-2"
                data-id="${item.id}" data-mode="suntik">
          <i class="fa-solid fa-syringe"></i>
          Suntik BH <span class="text-[10px] opacity-80">(bypass)</span>
          <span class="bh-price">${fmt(SUNTIK_BH_COST)}</span>
        </button>
      </div>
    `;
    row.querySelector(".bh-btn-original").addEventListener("click", () => openBatteryModal(item, "original"));
    row.querySelector(".bh-btn-suntik").addEventListener("click", () => openBatteryModal(item, "suntik"));
    return row;
  }

  /* ---------- Bank-pick modal (reuses #repair-modal) ---------- */
  function openBatteryModal(item, mode) {
    const modal = document.querySelector("#repair-modal");
    if (!modal) return;
    const body = modal.querySelector("#repair-body");
    const closeBtn = modal.querySelector("#repair-cancel");

    const original = mode === "original";
    const cost = original ? ORIGINAL_BATTERY_COST : SUNTIK_BH_COST;
    const accent = original ? "#059669" : "#f59e0b";
    const title = original ? "Ganti Baterai Original" : "Suntik BH (Software Bypass)";
    const resultNote = original
      ? `Hasil: Battery Health jadi <b>100%</b> permanen & aman dijual.`
      : `Hasil: UI nampak <b>100%</b>, tapi BH asli (${item.batteryHealth}%) disembunyikan. ` +
        `<span class="text-rose-600">Ada resiko ${Math.round(REFUND_DISCOVERY_RATE * 100)}% komplain refund tiap hari setelah laku.</span>`;

    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const balance = S().bankBalances[b] || 0;
      const enough = balance >= cost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(balance)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(cost)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left:4px solid ${accent}">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold">${item.name} &middot; ${item.specs.ram}/${item.specs.rom}</p>
        <p class="text-xs text-gray-500 mt-2">Layanan</p>
        <p class="font-semibold" style="color:${accent}">${title}</p>
        <p class="text-xs text-gray-500 mt-2">Biaya</p>
        <p class="text-xl font-bold">${fmt(cost)}</p>
        <p class="text-xs mt-1 text-gray-600">${resultNote}</p>
      </div>
      <p class="text-sm font-semibold mb-2">Bayar dari rekening mana?</p>
      <div class="relist-banks">${rows}</div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;

    body.querySelectorAll(".relist-bank-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        doBatteryService(item, mode, btn.dataset.bank);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  /** Charge the bank, then mutate the item per the chosen mode. */
  function doBatteryService(item, mode, bank) {
    const s = S();
    const original = mode === "original";
    const cost = original ? ORIGINAL_BATTERY_COST : SUNTIK_BH_COST;
    if ((s.bankBalances[bank] || 0) < cost) {
      window.FlippingTycoon.showToast("Saldo tidak cukup.", "error");
      return;
    }

    s.bankBalances[bank] -= cost;
    s.bankHistories[bank].push({
      type: "DEBIT",
      amount: cost,
      balanceAfter: s.bankBalances[bank],
      description: original
        ? `Ganti Baterai Original: ${item.name}`
        : `Suntik BH (bypass): ${item.name}`,
      category: "repair",
      day: s.currentDay,
      ts: Date.now(),
    });
    item.totalRepairCost = (item.totalRepairCost || 0) + cost;

    if (original) {
      // Genuine fix — permanently safe.
      item.batteryHealth = 100;
      item.isBypassed = false;
      delete item.realBatteryHealth;
      window.FlippingTycoon.showToast(`🔋 Baterai original ${item.name} diganti — BH 100% & aman.`, "success");
    } else {
      // Software bypass — stash the REAL value, show 100, flag the bomb.
      item.realBatteryHealth = item.batteryHealth; // truth, hidden
      item.batteryHealth = 100;                    // displayed lie
      item.isBypassed = true;                       // the trap flag
      window.FlippingTycoon.showToast(`💉 BH ${item.name} disuntik ke 100% (UI). Hati-hati pas dijual...`, "info");
    }
    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Battery = {
    // generation / pricing
    isPearGadget,
    rollBatteryHealth,
    healthMultiplier,
    applyBatteryHealth,
    generateBatteryFields,
    // UI helpers
    badgeHtml,
    renderBatterySection,
    // sale logging + next-day trap
    isBypassed,
    recordPotentialReturn,
    processPendingReturns,
    ensurePendingReturns,
    // constants (handy for tests / other modules)
    ORIGINAL_BATTERY_COST,
    SUNTIK_BH_COST,
    REFUND_DISCOVERY_RATE,
    SERVICE_THRESHOLD,
  };
})();
