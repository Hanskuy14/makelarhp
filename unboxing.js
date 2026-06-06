/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 35 — Mystery Pallet Unboxing (Gacha)
 *
 * Replaces the old "Batam cargo instantly dumps 10–20 units
 * into Inventory" flow with an interactive unboxing mini-game.
 *
 * Flow:
 *   1. A Batam shipment finishes its real-time timer.
 *   2. Player taps "Buka Mystery Pallet" (the claim button in
 *      logistics.js). Instead of a silent dest.push() loop,
 *      logistics calls window.Unboxing.open(ship).
 *   3. We PRE-ROLL one gacha item per box (generateGachaItem)
 *      using a weighted loot table, but each item is only
 *      PUSHED into State.data.inventory the moment its box is
 *      actually revealed (per the state-sync requirement).
 *   4. "Buka Semua" cascades the rest; closing the modal
 *      auto-opens whatever is left so the player never loses
 *      paid-for cargo.
 *
 * Loot table (weighted):
 *   60% Common Trash     — low-tier phones, Batangan + heavy minus
 *   30% Good Flips       — mid-tier phones, standard cosmetic defect
 *    9% Premium Flagship — high-tier phones, decent condition
 *    1% JACKPOT          — foldables / flawless ex-inter flagships
 *
 * Public:
 *   window.Unboxing.generateGachaItem(opts)  — one weighted roll
 *   window.Unboxing.rollRarity()             — weighted tier key
 *   window.Unboxing.open(ship)               — launch the mini-game
 *   window.Unboxing.isEnabled()              — feature flag/guard
 *   window.Unboxing.DROP_RATES               — the loot table
 * ========================================================= */

(function () {
  "use strict";

  /* ---------- Tiny shared helpers ---------- */
  function S() { return window.FlippingTycoon.State.data; }
  function fmt(n) {
    return window.Market && window.Market.formatRupiah
      ? window.Market.formatRupiah(n)
      : "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function roundTo50k(n) { return Math.max(50_000, Math.round(n / 50_000) * 50_000); }

  /* Weighted pick over [{ v, w }] entries. */
  function weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    for (const e of entries) { if ((r -= e.w) <= 0) return e.v; }
    return entries[entries.length - 1].v;
  }

  /* SFX wrappers — every call is guarded so audio never breaks gameplay. */
  function sfxClick() { try { window.AudioManager && window.AudioManager.playClick(); } catch (e) {} }
  function sfxCash()  { try { window.AudioManager && window.AudioManager.playCashRegister(); } catch (e) {} }
  function sfxError() { try { window.AudioManager && window.AudioManager.playErrorBuzz(); } catch (e) {} }

  /* =========================================================
   * LOOT TABLE / DROP-RATE MATH
   *
   * Tiers are weighted by integer percentages that sum to 100,
   * so rollRarity() is a single 0–100 roll. Each tier also
   * defines the *cosmetic* package (rarity color, glow, sound).
   * ========================================================= */
  const DROP_RATES = {
    common:  { weight: 60, label: "Barang Receh",     short: "Common", color: "#9ca3af", glow: false, jackpot: false },
    good:    { weight: 30, label: "Lumayan Buat Flip", short: "Good",   color: "#3b82f6", glow: false, jackpot: false },
    premium: { weight: 9,  label: "Flagship Premium",  short: "Premium",color: "#a855f7", glow: true,  jackpot: false },
    jackpot: { weight: 1,  label: "JACKPOT!",          short: "Jackpot",color: "#f59e0b", glow: true,  jackpot: true  },
  };

  /* Cumulative thresholds derived from the weights above (60 / 90 / 99 / 100). */
  function rollRarity() {
    const r = Math.random() * 100;
    let acc = 0;
    for (const key of ["common", "good", "premium", "jackpot"]) {
      acc += DROP_RATES[key].weight;
      if (r < acc) return key;
    }
    return "common";
  }

  /* ---------- Gadget pools, sliced from the master DB by basePrice ---------- */
  function getPools() {
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    const isFold = (window.GadgetData && window.GadgetData.isFoldableGadget) || (() => false);

    const foldables = GD.filter((g) => isFold(g));
    const nonFold   = GD.filter((g) => !isFold(g));

    return {
      // Common: cheap daily-driver trash (Siaomi Notes, Pipo Y, Ope A98, PearPhone X/XR/11, etc.)
      common:  nonFold.filter((g) => g.basePrice <= 4_500_000),
      // Good: solid mid-tier flips (Pear 12/13, Universe S21/22/23, Reno/V-series, etc.)
      good:    nonFold.filter((g) => g.basePrice > 4_500_000 && g.basePrice < 10_000_000),
      // Premium: high-tier flagships (Pear 14/15/16 Pro Max, Universe S24/Ultra, etc.)
      premium: nonFold.filter((g) => g.basePrice >= 10_000_000),
      // Jackpot: foldables + the absolute top flawless flagships.
      foldables,
      // Only the *impressive* foldables qualify as jackpots (Z Flip 5, Z Fold
      // 4/5/6, Z Flip 6) so the 1% drop never feels like a cheap old flip.
      jackpotFoldables: foldables.filter((g) => g.basePrice >= 9_000_000),
      topFlagship: nonFold.filter((g) => g.basePrice >= 15_000_000),
    };
  }

  /* ---------- Condition tables ---------- */
  function comp(short) {
    const CO = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
    return CO.find((c) => c.short === short) || CO[0] ||
      { type: "Fullset", short: "Fullset", multiplier: 1.0, haggleBonus: 0 };
  }
  function defBySeverity(sev) {
    const DO = (window.GadgetData && window.GadgetData.DEFECT_OPTIONS) || [];
    return DO.find((d) => d.severity === sev) || DO[0] ||
      { type: "Mulus / No Minus", short: "Mulus", multiplier: 1.0, severity: 0, haggleAcceptRate: 0.1 };
  }

  /* Per-tier completeness + defect roll — tuned so the *feel* of each
   * tier matches its name (trash = battered & batangan, jackpot = flawless). */
  function rollCondition(rarityKey) {
    switch (rarityKey) {
      case "common":
        // Mostly Batangan, heavy minus (battery / sensor / cracked screen).
        return {
          completeness: weightedPick([
            { v: comp("Batangan"), w: 80 },
            { v: comp("Fullset"),  w: 20 },
          ]),
          defect: weightedPick([
            { v: defBySeverity(2), w: 35 }, // Battery Drop
            { v: defBySeverity(3), w: 30 }, // Sensor Off
            { v: defBySeverity(4), w: 25 }, // LCD Retak
            { v: defBySeverity(1), w: 10 }, // Baret (lucky-ish)
          ]),
        };
      case "good":
        // Standard cosmetic defect (scratched screen / mild battery), mixed kit.
        return {
          completeness: weightedPick([
            { v: comp("Fullset"),  w: 55 },
            { v: comp("Batangan"), w: 45 },
          ]),
          defect: weightedPick([
            { v: defBySeverity(1), w: 60 }, // Baret Layar
            { v: defBySeverity(2), w: 30 }, // Battery Drop
            { v: defBySeverity(0), w: 10 }, // Mulus (bonus)
          ]),
        };
      case "premium":
        // Decent condition: mostly mint or only light scratches, usually Fullset.
        return {
          completeness: weightedPick([
            { v: comp("Fullset"),  w: 70 },
            { v: comp("Batangan"), w: 30 },
          ]),
          defect: weightedPick([
            { v: defBySeverity(0), w: 55 }, // Mulus
            { v: defBySeverity(1), w: 45 }, // Baret tipis
          ]),
        };
      case "jackpot":
      default:
        // Flawless: Fullset + Mulus, no minus. This is the dopamine hit.
        return { completeness: comp("Fullset"), defect: defBySeverity(0) };
    }
  }

  /* ---------- Pick a gadget for a given rarity ---------- */
  function pickGadget(rarityKey, pools) {
    if (rarityKey === "jackpot") {
      // 70% foldable, 30% flawless top flagship (Pear/Universe).
      const foldPool = pools.jackpotFoldables.length ? pools.jackpotFoldables : pools.foldables;
      const wantFold = foldPool.length > 0 && Math.random() < 0.7;
      const pool = wantFold ? foldPool
                 : (pools.topFlagship.length ? pools.topFlagship : pools.premium);
      if (pool && pool.length) return pick(pool);
    }
    const direct = pools[rarityKey];
    if (direct && direct.length) return pick(direct);
    // Defensive fallback chain so we always return *something*.
    return pick(pools.good.length ? pools.good
              : pools.common.length ? pools.common
              : (window.GadgetData.GADGET_DATABASE));
  }

  /* =========================================================
   * generateGachaItem(opts)
   *
   * Returns a fully inventory-shaped record + gacha metadata:
   *   { rarityKey, rarity, value, isJackpot, ...inventoryFields }
   *
   * opts: { sourceBank, importedFromCargo } (provenance carry-over)
   * NOTE: this only BUILDS the object. Pushing into the inventory
   * happens later, the instant the player reveals the box.
   * ========================================================= */
  function generateGachaItem(opts) {
    opts = opts || {};
    const pools = getPools();
    const rarityKey = opts.forceRarity || rollRarity();
    const rarity = DROP_RATES[rarityKey];
    const gadget = pickGadget(rarityKey, pools);
    const { completeness, defect } = rollCondition(rarityKey);

    // Buy cost = 50% off the basePrice ladder (same wholesale discount Batam used),
    // adjusted by condition so margins still make sense in Inventory.
    const rawCost = gadget.basePrice * completeness.multiplier * defect.multiplier * 0.5;
    const buyPrice = roundTo50k(rawCost);

    const item = {
      id: uid("gacha"),
      gadgetId: gadget.id,
      name: gadget.model,
      brand: gadget.brand,
      specs: { ...gadget.specs },
      basePrice: gadget.basePrice,
      year: gadget.year,
      icon: gadget.icon,
      accent: gadget.accent,
      completeness: { ...completeness },
      defect: { ...defect },
      hiddenDefect: null,
      buyPrice,
      buyDay: S().currentDay,                 // re-stamped on reveal
      paymentMethod: "Batam Cargo (Mystery Pallet)",
      sourceBank: opts.sourceBank || null,
      // Ex-Inter provenance carried over from Batam imports.
      isExInter: true,
      imeiStatus: "ok",
      importedFromCargo: opts.importedFromCargo || null,
      // Gacha tag (handy for analytics / future "pallet history" screens).
      gachaRarity: rarityKey,
    };

    // Estimated resale value for the reveal card (uses the live market engine).
    let value = buyPrice;
    if (window.Market && typeof window.Market.computeCurrentMarketPrice === "function") {
      value = Math.round(Number(window.Market.computeCurrentMarketPrice(item)) || buyPrice);
    }

    return { rarityKey, rarity, value, isJackpot: !!rarity.jackpot, item };
  }

  /* =========================================================
   * THE UNBOXING MINI-GAME (DOM + game feel)
   * ========================================================= */

  // Timings (ms) — tuned for suspense without dragging.
  const SHAKE_MS         = 520;   // closed-box shake/glow before it opens
  const JACKPOT_SHAKE_MS = 900;   // longer suspense build-up for the gold drop
  const CASCADE_STEP_MS  = 95;    // stagger between boxes during "Buka Semua"

  // Live session handle so only one pallet opens at a time.
  let _session = null;

  function isEnabled() {
    return !!(window.GadgetData && window.GadgetData.GADGET_DATABASE &&
              window.FlippingTycoon && window.FlippingTycoon.State);
  }

  /**
   * open(ship) — launch the unboxing mini-game for a ready Batam
   * shipment. Pre-rolls one gacha item per box (box count derived
   * from the shipment's original unit count, clamped 10–20).
   */
  function open(ship) {
    if (!isEnabled() || !ship) return false;
    if (_session) return false; // already unboxing something

    const size = Math.max(10, Math.min(20, (ship.items && ship.items.length) || randInt(10, 20)));
    const cargoTag = (ship.meta && ship.meta.cargoShortId) || (ship.id || "").slice(-4);

    // Pre-roll every box up front (deterministic for this pallet), but DON'T
    // push to inventory yet — that happens on reveal.
    const rolls = [];
    for (let i = 0; i < size; i++) {
      rolls.push(generateGachaItem({ sourceBank: ship.paymentBank, importedFromCargo: cargoTag }));
    }

    _session = {
      ship,
      rolls,
      size,
      opened: new Array(size).fill(false),
      openedCount: 0,
      totalValue: 0,
      finalized: false,
      busy: false,        // guards against double-tap during a single reveal
    };

    buildModal();
    return true;
  }

  /* ---------- Modal scaffolding ---------- */
  function buildModal() {
    let overlay = document.querySelector("#unbox-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "unbox-overlay";
      document.body.appendChild(overlay);
    }
    overlay.className = "unbox-overlay flex";

    const ses = _session;
    overlay.innerHTML = `
      <div class="unbox-shell" role="dialog" aria-label="Mystery Pallet Unboxing">
        <div class="unbox-flash" id="unbox-flash" aria-hidden="true"></div>

        <header class="unbox-head">
          <div class="unbox-head-text">
            <p class="unbox-kicker"><i class="fa-solid fa-ship"></i> Mystery Pallet &middot; ${ses.ship.label}</p>
            <h2 class="unbox-title">Buka Kargo Batam!</h2>
            <p class="unbox-sub">Ketuk tiap dus buat lihat dapet apa. Hoki nentuin isinya 👀</p>
          </div>
          <button class="unbox-close-btn" id="unbox-close" type="button" title="Tutup &amp; klaim sisa" data-no-sfx>
            <i class="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div class="unbox-stats">
          <div class="unbox-stat">
            <span class="unbox-stat-label">Dibuka</span>
            <b id="unbox-progress">0 / ${ses.size}</b>
          </div>
          <div class="unbox-stat">
            <span class="unbox-stat-label">Total Nilai Pasar</span>
            <b id="unbox-value" class="unbox-value">${fmt(0)}</b>
          </div>
        </div>

        <div class="unbox-grid" id="unbox-grid">
          ${ses.rolls.map((_, i) => boxCellHTML(i)).join("")}
        </div>

        <footer class="unbox-foot">
          <button class="unbox-skip-btn" id="unbox-open-all" type="button">
            <i class="fa-solid fa-bolt"></i> Skip Animasi / Buka Semua
          </button>
          <button class="unbox-done-btn hidden" id="unbox-done" type="button">
            <i class="fa-solid fa-circle-check"></i> Selesai &amp; Masuk Inventory
          </button>
        </footer>
      </div>
    `;

    // Wire up box taps.
    overlay.querySelectorAll(".unbox-box").forEach((boxEl) => {
      boxEl.addEventListener("click", () => {
        const idx = Number(boxEl.getAttribute("data-idx"));
        revealBox(idx, { manual: true });
      });
    });

    overlay.querySelector("#unbox-open-all").addEventListener("click", openAll);
    overlay.querySelector("#unbox-close").addEventListener("click", () => closeAndFlush());
    overlay.querySelector("#unbox-done").addEventListener("click", () => closeAndFlush());
  }

  function boxCellHTML(i) {
    return `
      <button class="unbox-box" data-idx="${i}" type="button" data-no-sfx aria-label="Dus tertutup ${i + 1}">
        <span class="unbox-box-lid">
          <i class="fa-solid fa-box"></i>
        </span>
        <span class="unbox-box-num">#${i + 1}</span>
      </button>
    `;
  }

  /* ---------- Reveal a single box ---------- */
  function revealBox(idx, opts) {
    opts = opts || {};
    const ses = _session;
    if (!ses || ses.opened[idx]) return;
    // During a manual tap, block other manual taps mid-animation so the
    // dopamine beats don't stack into mush. Cascades bypass this.
    if (opts.manual && ses.busy) return;

    ses.opened[idx] = true;
    if (opts.manual) ses.busy = true;

    const roll = ses.rolls[idx];
    const boxEl = document.querySelector(`.unbox-box[data-idx="${idx}"]`);
    if (!boxEl) { commitRoll(idx); return; }

    sfxClick();

    const shakeMs = roll.isJackpot ? JACKPOT_SHAKE_MS : SHAKE_MS;
    const instant = !!opts.instant;

    // Suspense phase: shake + glow (skipped for instant cascade/flush).
    boxEl.classList.add("is-opening");
    boxEl.classList.add(roll.isJackpot ? "unbox-glow-gold" : (roll.rarity.glow ? "unbox-glow" : "unbox-glow-soft"));
    if (!instant) boxEl.classList.add("animate-unbox-shake");

    const doOpen = () => {
      boxEl.classList.remove("animate-unbox-shake");
      boxEl.classList.add("is-open");
      // Swap the lid icon to an open box and inject the prize card.
      boxEl.innerHTML = prizeCardHTML(roll);
      const card = boxEl.querySelector(".unbox-prize");
      if (card) card.classList.add("animate-unbox-zoom");

      // Commit to inventory the moment it's visually revealed.
      commitRoll(idx);

      // Reward sounds + jackpot screen flash.
      if (roll.isJackpot) {
        sfxCash();
        flashJackpot();
      } else if (roll.rarityKey === "premium") {
        sfxCash();
      }

      updateHud();
      if (opts.manual) ses.busy = false;
    };

    if (instant) doOpen();
    else setTimeout(doOpen, shakeMs);
  }

  function prizeCardHTML(roll) {
    const it = roll.item;
    const r = roll.rarity;
    const iconName = it.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    const condition = `${it.completeness.short} &middot; ${it.defect.short}`;
    return `
      <span class="unbox-box-lid open"><i class="fa-solid fa-box-open"></i></span>
      <div class="unbox-prize rarity-${roll.rarityKey}">
        ${roll.isJackpot ? `<span class="unbox-prize-badge jackpot"><i class="fa-solid fa-crown"></i> JACKPOT</span>`
          : `<span class="unbox-prize-badge" style="background:${r.color}1f;color:${r.color}">${r.short}</span>`}
        <div class="unbox-prize-icon" style="background:${it.accent}1a;color:${it.accent}">
          <i class="fa-solid fa-${iconName}"></i>
        </div>
        <p class="unbox-prize-brand">${it.brand}</p>
        <p class="unbox-prize-model">${it.name}</p>
        <p class="unbox-prize-cond">${condition}</p>
        <p class="unbox-prize-value">${fmt(roll.value)}</p>
      </div>
    `;
  }

  /* ---------- Commit one roll into the live inventory ---------- */
  function commitRoll(idx) {
    const ses = _session;
    const roll = ses.rolls[idx];
    if (roll._committed) return;
    roll._committed = true;

    const s = S();
    const it = roll.item;
    it.buyDay = s.currentDay; // stamp arrival so age/holding-cost starts now
    if (window.FlippingTycoon && typeof window.FlippingTycoon.normalizeInventoryItem === "function") {
      window.FlippingTycoon.normalizeInventoryItem(it);
    }
    if (!Array.isArray(s.inventory)) s.inventory = [];
    s.inventory.push(it);

    ses.openedCount++;
    ses.totalValue += roll.value;

    if (window.FlippingTycoon && typeof window.FlippingTycoon.saveGame === "function") {
      window.FlippingTycoon.saveGame();
    }
  }

  /* ---------- HUD refresh ---------- */
  function updateHud() {
    const ses = _session;
    if (!ses) return;
    const prog = document.querySelector("#unbox-progress");
    const val  = document.querySelector("#unbox-value");
    if (prog) prog.textContent = `${ses.openedCount} / ${ses.size}`;
    if (val)  val.textContent = fmt(ses.totalValue);

    if (ses.openedCount >= ses.size) {
      const openAllBtn = document.querySelector("#unbox-open-all");
      const doneBtn = document.querySelector("#unbox-done");
      if (openAllBtn) openAllBtn.classList.add("hidden");
      if (doneBtn) doneBtn.classList.remove("hidden");
    }
  }

  /* ---------- "Buka Semua" — staggered cascade for impatient players ---------- */
  function openAll() {
    const ses = _session;
    if (!ses) return;
    const openAllBtn = document.querySelector("#unbox-open-all");
    if (openAllBtn) openAllBtn.setAttribute("disabled", "true");
    ses.busy = true; // lock manual taps during the cascade

    const remaining = [];
    for (let i = 0; i < ses.size; i++) if (!ses.opened[i]) remaining.push(i);

    let step = 0;
    remaining.forEach((idx) => {
      const hasJackpot = ses.rolls[idx].isJackpot;
      // Jackpots in a cascade still get their shake; everything else snaps open.
      setTimeout(() => revealBox(idx, { instant: !hasJackpot }), step * CASCADE_STEP_MS);
      step++;
    });

    // After the cascade fully resolves, unlock + refresh.
    setTimeout(() => {
      ses.busy = false;
      updateHud();
    }, remaining.length * CASCADE_STEP_MS + JACKPOT_SHAKE_MS + 50);
  }

  /* ---------- Close / flush ----------
   * Any remaining (un-revealed) boxes are auto-opened *silently*
   * and committed so the player never loses paid-for cargo. */
  function closeAndFlush() {
    const ses = _session;
    if (!ses) return;

    // Commit anything still closed (no animation, no extra SFX).
    for (let i = 0; i < ses.size; i++) {
      if (!ses.opened[i]) {
        ses.opened[i] = true;
        commitRoll(i);
      }
    }
    finalize();

    const overlay = document.querySelector("#unbox-overlay");
    if (overlay) {
      overlay.classList.add("unbox-closing");
      setTimeout(() => {
        overlay.classList.remove("flex", "unbox-closing");
        overlay.classList.add("hidden");
        overlay.innerHTML = "";
      }, 180);
    }
    _session = null;
  }

  /* ---------- Finalize: remove the shipment + notify ---------- */
  function finalize() {
    const ses = _session;
    if (!ses || ses.finalized) return;
    ses.finalized = true;

    // Tally rarity for a punchy summary line.
    const counts = { common: 0, good: 0, premium: 0, jackpot: 0 };
    ses.rolls.forEach((r) => { counts[r.rarityKey] = (counts[r.rarityKey] || 0) + 1; });

    // Remove the shipment from the logistics queue (it's been fully unboxed).
    if (window.Logistics && typeof window.Logistics.removeShipment === "function") {
      window.Logistics.removeShipment(ses.ship.id);
    } else {
      // Fallback: splice it out directly.
      const s = S();
      if (Array.isArray(s.activeShipments)) {
        const i = s.activeShipments.findIndex((x) => x.id === ses.ship.id);
        if (i >= 0) s.activeShipments.splice(i, 1);
      }
    }

    if (window.FlippingTycoon && typeof window.FlippingTycoon.saveGame === "function") {
      window.FlippingTycoon.saveGame();
    }

    const jackpotMsg = counts.jackpot > 0 ? ` 🏆 ${counts.jackpot} JACKPOT!` : "";
    if (window.FlippingTycoon && typeof window.FlippingTycoon.showToast === "function") {
      window.FlippingTycoon.showToast(
        `📦 ${ses.size} unit masuk Inventory (≈ ${fmt(ses.totalValue)}).${jackpotMsg}`,
        "success"
      );
    }
    if (window.Notifications && typeof window.Notifications.add === "function") {
      window.Notifications.add({
        type: counts.jackpot > 0 ? "success" : "info",
        title: counts.jackpot > 0 ? "Mystery Pallet — JACKPOT!" : "Mystery Pallet Dibuka",
        message: `${ses.size} unit dari ${ses.ship.label} masuk Inventory. ` +
                 `Estimasi nilai pasar ≈ ${fmt(ses.totalValue)}. ` +
                 `(${counts.common} receh, ${counts.good} flip, ${counts.premium} premium, ${counts.jackpot} jackpot).`,
        actionPage: "inventory",
        actor: "Batam Syndicate",
        icon: "box-open",
      });
    }

    if (window.FlippingTycoon && typeof window.FlippingTycoon.renderActivePage === "function") {
      window.FlippingTycoon.renderActivePage();
    }
  }

  /* ---------- Jackpot screen flash ---------- */
  function flashJackpot() {
    const flash = document.querySelector("#unbox-flash");
    if (!flash) return;
    flash.classList.remove("go");
    // Force reflow so the animation re-triggers on rapid jackpots.
    void flash.offsetWidth;
    flash.classList.add("go");
    setTimeout(() => flash.classList.remove("go"), 900);
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Unboxing = {
    open,
    generateGachaItem,
    rollRarity,
    isEnabled,
    DROP_RATES,
  };
})();
