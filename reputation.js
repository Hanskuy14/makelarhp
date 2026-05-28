/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 20 — Reputation Engine (Tingkat Kepercayaan)
 *
 * A 0..100 trust score that gates buyer aggression, FJB priority,
 * and unlocks Inbound Reseller DMs at Suhu tier.
 *
 * Tiers:
 *    0..20  : Newbie (Pemula)            — buyers haggle hard
 *   21..70  : Recommended Seller (Recsel) — buyers agree faster
 *   71..100 : Suhu / Pemain Besar         — VIP, FJB priority,
 *                                          AI resellers DM you
 *
 * Stored at:
 *   data.reputation = {
 *     score: number,                    // 0..100
 *     history: [{ delta, reason, day, tier, ts }, ...]
 *     lastResellerDmDay: number,        // throttle for Suhu DMs
 *   }
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  const MAX_REPUTATION = 100;
  const HISTORY_LIMIT  = 50;


  /* ---------- Tier ladder ---------- */
  const TIERS = [
    { id: "newbie", label: "Newbie",
      shortLabel: "Pemula", min: 0, max: 20,
      color: "#9ca3af", icon: "seedling",
      perks: "FJB buyers haggle aggressively",
      // Multipliers used by other modules:
      sellerStiffness: 1.20,    // BUY-side: floor 20% higher (sellers stingier)
      buyerOfferBoost: 0.92,    // SELL-side: AI offers 8% lower than baseline
      fjbBuPriority:   0,       // FJB BU posts: # extra spawns
    },
    { id: "recsel", label: "Recommended Seller",
      shortLabel: "Recsel", min: 21, max: 70,
      color: "#3b82f6", icon: "thumbs-up",
      perks: "Buyers agree to your prices faster",
      sellerStiffness: 1.00,
      buyerOfferBoost: 1.00,
      fjbBuPriority:   0,
    },
    { id: "suhu", label: "Suhu / Pemain Besar",
      shortLabel: "Suhu", min: 71, max: 100,
      color: "#a855f7", icon: "crown",
      perks: "VIP — priority on FJB BU posts, AI Resellers DM you",
      sellerStiffness: 0.90,    // BUY-side: floor 10% lower
      buyerOfferBoost: 1.08,    // SELL-side: AI offers 8% MORE generous
      fjbBuPriority:   1,       // +1 extra BU spawn per Next Day
    },
  ];

  /* Standard delta vocabulary (mirrors the Part 20 + Part 43 spec). */
  const DELTA = {
    CLEAN_COD:           +2,    // Part 20: BUY a phone via clean COD
    MARKETPLACE_SALE:    +3,    // Part 43: SELL via Marketplace/Chat ("Kirim Barang")
    WALK_IN_SALE:        +1,    // Part 43: SELL via Ruko walk-in customer (no chat effort)
    SCAMMER_REPORT:      +5,    // Part 20 / Part 40: report a scammer
    FORCE_DEFECT_SALE:   -5,    // Part 20: force-buy with hidden defect found
    DEAL_CANCEL:        -10,    // Part 20: cancel after seller accepted price
  };


  /* ---------- State init ---------- */
  function ensureState() {
    const s = S();
    if (!s.reputation) {
      s.reputation = { score: 0, history: [], lastResellerDmDay: -10 };
    }
    if (typeof s.reputation.score !== "number") s.reputation.score = 0;
    if (!Array.isArray(s.reputation.history))  s.reputation.history = [];
    if (typeof s.reputation.lastResellerDmDay !== "number") s.reputation.lastResellerDmDay = -10;
    if (!Array.isArray(s.inboundLeads)) s.inboundLeads = [];
  }

  function getScore() { ensureState(); return S().reputation.score; }

  function getCurrentTier() {
    const score = getScore();
    for (const t of TIERS) {
      if (score >= t.min && score <= t.max) return t;
    }
    return TIERS[0];
  }

  /** Progress 0..1 within the CURRENT tier. */
  function getTierProgress() {
    const score = getScore();
    const t = getCurrentTier();
    const span = (t.max - t.min) || 1;
    return Math.max(0, Math.min(1, (score - t.min) / span));
  }

  function getNextTier() {
    const cur = getCurrentTier();
    const idx = TIERS.findIndex((t) => t.id === cur.id);
    return TIERS[idx + 1] || null;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }


  /* ---------- Core mutator ---------- */
  function applyDelta(delta, reason) {
    ensureState();
    const s = S();
    const before = s.reputation.score;
    const after  = clamp(before + Number(delta || 0), 0, MAX_REPUTATION);
    if (after === before) return { delta: 0, before, after, tierChanged: false };
    const tierBefore = getCurrentTier().id;
    s.reputation.score = after;
    const tierAfter = getCurrentTier().id;

    s.reputation.history.unshift({
      id: uid("rep"),
      delta: after - before,
      reason: reason || "manual adjustment",
      day: s.currentDay,
      ts: Date.now(),
      scoreAfter: after,
      tier: tierAfter,
    });
    if (s.reputation.history.length > HISTORY_LIMIT) {
      s.reputation.history.length = HISTORY_LIMIT;
    }

    const tierChanged = tierBefore !== tierAfter;
    if (tierChanged && window.Notifications) {
      const newTier = TIERS.find((t) => t.id === tierAfter);
      const promoted = after > before;
      window.Notifications.add({
        type: promoted ? "success" : "warning",
        title: promoted ? `Naik tier: ${newTier.shortLabel}!` : `Turun tier: ${newTier.shortLabel}`,
        message: promoted
          ? `Tingkat Kepercayaan kamu sekarang ${after}/100 — perk: ${newTier.perks}.`
          : `Tingkat Kepercayaan turun ke ${after}/100 (${newTier.shortLabel}). ${newTier.perks}.`,
        actionPage: "profile",
        actor: "Reputation Engine",
        icon: newTier.icon,
      });
    }
    window.FlippingTycoon.saveGame();
    return { delta: after - before, before, after, tierChanged };
  }

  /* ---------- Convenience hooks ---------- */
  function onCleanCOD(opts)         { return applyDelta(DELTA.CLEAN_COD,        (opts && opts.reason) || "Clean COD — no hidden defect"); }
  function onForceSaleWithDefect(o) { return applyDelta(DELTA.FORCE_DEFECT_SALE,(o && o.reason)        || "Force-sale with hidden defect"); }
  function onDealCancel(opts)       { return applyDelta(DELTA.DEAL_CANCEL,      (opts && opts.reason) || "Cancelled deal after agreement"); }
  function onScammerReport(opts)    { return applyDelta(DELTA.SCAMMER_REPORT,   (opts && opts.reason) || "Reported scammer (Part 40)"); }

  /* ---------- Part 43: Reputation on Successful Sales ---------- */

  /** Marketplace / Chat sale (player clicked "Kirim Barang / Deal" in chat).
   *  Awards +3 rep AND fires a quick on-screen toast. */
  function onMarketplaceSale(opts) {
    const result = applyDelta(DELTA.MARKETPLACE_SALE, (opts && opts.reason) || "Sale via Marketplace / Chat");
    if (result.delta > 0) showRepToast(`Barang Terjual! Reputasi Naik (+${result.delta}) ⭐`);
    return result;
  }

  /** Walk-in / Ruko sale (passive — customer walked into the store).
   *  Awards +1 rep (less than chat sales — there was no negotiation
   *  effort) and fires a softer toast. */
  function onWalkInSale(opts) {
    const result = applyDelta(DELTA.WALK_IN_SALE, (opts && opts.reason) || "Walk-in sale (Ruko)");
    if (result.delta > 0) showRepToast(`Walk-in customer ✓ Reputasi +${result.delta} ⭐`);
    return result;
  }

  /* Reuses the existing #ft-toast element pattern other modules use
   * (accessories / repair / staff / batam). Auto-dismisses after 2.4s. */
  function showRepToast(msg) {
    if (typeof document === "undefined") return;
    let toast = document.querySelector("#ft-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ft-toast";
      toast.className = "ft-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("ft-toast-show");
    clearTimeout(toast._repTimer);
    toast._repTimer = setTimeout(() => toast.classList.remove("ft-toast-show"), 2400);
  }


  /* =========================================================
   * Reseller DMs (Inbound Leads) — Suhu-only
   *
   * When the player reaches the Suhu tier, AI reseller bots will
   * randomly DM the player on Next Day, opening a path to bulk
   * selling. Each DM is stored on `data.inboundLeads` so it can
   * surface in the News Feed AND fire a Notification.
   * ========================================================= */

  const RESELLER_NAMES = [
    "Bang Riza Counter", "Ko Andre BatamHP", "Mas Dimas Reseller",
    "Cici Maya Hub", "Pak Bayu Wholesaler", "Mbak Sari Recsel",
    "Bro Hendra Bandung", "Ko Galih Glodok", "Pak Yusuf Surabaya",
  ];
  const RESELLER_OPENERS = [
    "Suhu, ada barang apa hari ini? Saya siap nampung.",
    "Bro Suhu, butuh stok unit Apple/Samsung. PM yaa kalau ada 🙏",
    "Suhu, kalau lagi ada flagship over-stock saya beli borongan.",
    "Suhu, saya cari Mid-Range banyak. Mau lepasin gak?",
    "Halo Suhu, lagi nyari unit yg fullset mulus. Ada brapa biji?",
    "Suhu, kalau ada BNIB lebih, saya tampung deh seharian penuh.",
  ];

  function maybeSpawnResellerDM() {
    ensureState();
    const s = S();
    const tier = getCurrentTier();
    if (tier.id !== "suhu") return false;

    // Throttle: at most one DM every 2 in-game days
    if (s.currentDay - (s.reputation.lastResellerDmDay || -10) < 2) return false;

    // 50% chance per Next Day at Suhu
    if (Math.random() > 0.50) return false;

    const name = RESELLER_NAMES[Math.floor(Math.random() * RESELLER_NAMES.length)];
    const text = RESELLER_OPENERS[Math.floor(Math.random() * RESELLER_OPENERS.length)];
    const lead = {
      id: uid("lead"),
      name,
      avatar: name.split(" ").slice(-2)[0].charAt(0).toUpperCase(),
      color: ["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"][Math.floor(Math.random()*6)],
      text,
      day: s.currentDay,
      ts: Date.now(),
      status: "unread",        // unread | replied | dismissed
      kind: "reseller-dm",
    };
    s.inboundLeads.unshift(lead);
    if (s.inboundLeads.length > 20) s.inboundLeads.length = 20;
    s.reputation.lastResellerDmDay = s.currentDay;

    if (window.Notifications) {
      window.Notifications.add({
        type: "info",
        title: `📩 ${name} kirim DM`,
        message: `"${text.length > 70 ? text.slice(0, 70) + "…" : text}" — buka Profile / News Feed.`,
        actionPage: "profile",
        actor: name,
        icon: "envelope",
      });
    }
    window.FlippingTycoon.saveGame();
    return true;
  }


  /* ---------- Hook: called from advanceToNextDay ---------- */
  function advanceDay() {
    maybeSpawnResellerDM();
  }

  /* =========================================================
   * UI rendering
   * ========================================================= */

  function makeStarRow(score) {
    // Convert 0..100 to a 0..5 star display
    const stars5 = score / 20;
    const full = Math.floor(stars5);
    const half = (stars5 - full) >= 0.5;
    let html = "";
    for (let i = 0; i < 5; i++) {
      if (i < full)        html += '<i class="fa-solid fa-star"></i>';
      else if (i === full && half) html += '<i class="fa-solid fa-star-half-stroke"></i>';
      else                 html += '<i class="fa-regular fa-star"></i>';
    }
    return html;
  }

  /** Compact pill suitable for the topbar (icon + score). */
  function renderReputationBadge() {
    ensureState();
    const tier = getCurrentTier();
    const score = getScore();
    const el = document.createElement("div");
    el.className = `reputation-badge reputation-badge-${tier.id}`;
    el.title = `${tier.label} (${score}/100) — ${tier.perks}`;
    el.innerHTML = `
      <i class="fa-solid fa-${tier.icon}"></i>
      <span class="rep-badge-score">${score}</span>
    `;
    return el;
  }

  /** Full card for the Profile page. */
  function renderReputationCard() {
    ensureState();
    const score = getScore();
    const tier = getCurrentTier();
    const next = getNextTier();
    const progressPct = Math.round(getTierProgress() * 100);
    const card = document.createElement("div");
    card.className = "fb-card reputation-card";

    const tiersHtml = TIERS.map((t) => {
      const reached = score >= t.min;
      const current = t.id === tier.id;
      return `
        <div class="rep-tier-row ${reached ? "reached" : ""} ${current ? "current" : ""}">
          <div class="rep-tier-icon" style="background:${reached ? t.color : "#e5e7eb"}">
            <i class="fa-solid fa-${t.icon}"></i>
          </div>
          <div class="rep-tier-text">
            <p class="rep-tier-label" style="color:${reached ? t.color : "#9ca3af"}">${t.label}</p>
            <p class="rep-tier-range">${t.min}–${t.max} pts &middot; ${t.perks}</p>
          </div>
          ${current ? '<i class="fa-solid fa-circle-check rep-tier-check"></i>' : ""}
        </div>
      `;
    }).join("");

    card.innerHTML = `
      <div class="reputation-header">
        <div>
          <p class="rep-card-label">Tingkat Kepercayaan</p>
          <h3>${tier.label}</h3>
          <div class="rep-stars" style="color:${tier.color}">${makeStarRow(score)}</div>
        </div>
        <div class="reputation-score-block">
          <p class="rep-card-score" style="color:${tier.color}">${score}</p>
          <p class="rep-card-score-max">/ 100</p>
        </div>
      </div>
      <div class="rep-progress-track">
        <div class="rep-progress-fill" style="width:${progressPct}%;background:${tier.color}"></div>
      </div>
      <p class="rep-progress-label">
        ${next
          ? `${next.min - score} pts lagi ke <b>${next.shortLabel}</b>`
          : `🏆 Tier maksimal — VIP unlocked`}
      </p>
      <div class="rep-tier-list">${tiersHtml}</div>
      ${renderHistorySection()}
    `;
    return card;
  }

  function renderHistorySection() {
    const s = S();
    const hist = (s.reputation.history || []).slice(0, 6);
    if (hist.length === 0) {
      return `<p class="rep-history-empty">Belum ada perubahan reputasi. Mulai jualan / COD untuk dapet poin.</p>`;
    }
    const rows = hist.map((h) => `
      <li class="rep-hist-row">
        <span class="rep-hist-day">D${h.day}</span>
        <span class="rep-hist-delta ${h.delta > 0 ? "pos" : "neg"}">${h.delta > 0 ? "+" : ""}${h.delta}</span>
        <span class="rep-hist-reason">${escapeHtml(h.reason || "")}</span>
        <span class="rep-hist-score">${h.scoreAfter}/100</span>
      </li>
    `).join("");
    return `
      <p class="rep-history-title"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat reputasi</p>
      <ul class="rep-history-list">${rows}</ul>
    `;
  }


  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  /* =========================================================
   * Tier-effect helpers (consumed by chat.js / selling.js / fjb.js)
   * ========================================================= */

  /** BUY-side: multiplier for seller's hidden floor.
   *  Newbie -> stingier (×1.20), Suhu -> more generous (×0.90). */
  function getSellerStiffness() { return getCurrentTier().sellerStiffness; }

  /** SELL-side: multiplier on the AI buyer's initial offer.
   *  Newbie -> lowballs harder (×0.92), Suhu -> better offers (×1.08). */
  function getBuyerOfferBoost() { return getCurrentTier().buyerOfferBoost; }

  /** FJB: extra BU spawns per Next Day for Suhu players. */
  function getFjbBuPriority() { return getCurrentTier().fjbBuPriority; }

  /** Convenience predicate. */
  function isSuhu() { return getCurrentTier().id === "suhu"; }

  /* ---------- Public API ---------- */
  window.Reputation = {
    // state queries
    getScore,
    getCurrentTier,
    getTierProgress,
    getNextTier,
    isSuhu,
    TIERS,
    DELTA,
    MAX: MAX_REPUTATION,

    // mutators
    applyDelta,
    onCleanCOD,
    onForceSaleWithDefect,
    onDealCancel,
    onScammerReport,
    onMarketplaceSale,   // Part 43: +3 — chat / marketplace sale
    onWalkInSale,        // Part 43: +1 — Ruko walk-in customer

    // tier effects
    getSellerStiffness,
    getBuyerOfferBoost,
    getFjbBuPriority,

    // lifecycle
    advanceDay,
    maybeSpawnResellerDM,

    // UI
    renderReputationBadge,
    renderReputationCard,
  };
})();
