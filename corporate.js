/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 28 — Corporate B2B Partnerships
 *
 * Three Mega-Retailers with very different acceptance gates:
 *   eBox     — premium electronics chain  (hardest to land)
 *   Erophone — mainstream retail          (mid difficulty)
 *   PStore   — volume / Ex-Inter friendly (most permissive)
 *
 * Acceptance is RNG-checked against the player's HQ Ruko tier
 * AND their reputation. Examples (anchored to spec):
 *   Tier 1 + 0 rep + eBox     → ~1% accept   (99% rejection)
 *   Tier 4 + 80 rep + eBox    → ~85% accept
 *
 * Once accepted, the partner unlocks "Konsinyasi" (consignment).
 * Player picks up to 500 inventory units, ships them, and after
 * 3 in-game days the consignment auto-completes at a fixed
 * 15% net margin above sum(basePrice) — pure passive income.
 *
 * State stored on:
 *   data.corporate = {
 *     proposals:    { partnerId -> { status, appliedDay, score } },
 *     consignments: [...], history: [...], maxUnits: 500,
 *   }
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  /* ---------- Mega-Retailer roster ---------- */
  const PARTNERS = [
    {
      id: "ebox",
      name: "eBox",
      tagline: "Premium electronics chain — branding kelas atas, margin tipis tapi safe.",
      icon: "apple-whole",
      accent: "#1c1c1e",
      // Per-unit margin above basePrice (15% per spec)
      marginPct: 0.15,
      // Accept rate base + scaling factors
      baseRate: 0.01,
      tierWeight: 0.05,    // multiplied by (tier-1)^2
      repWeight:  0.50,    // multiplied by rep/100 (0-1)
      // What kinds of units they're willing to take
      preferred: { brand: ["Apple"], minBase: 10_000_000, maxBase: Infinity, label: "Premium Apple flagships" },
    },
    {
      id: "erophone",
      name: "Erophone",
      tagline: "Mainstream retail — terima brand & tier mainstream.",
      icon: "store",
      accent: "#3b82f6",
      marginPct: 0.15,
      baseRate: 0.10,
      tierWeight: 0.04,
      repWeight:  0.40,
      preferred: { brand: null, minBase: 3_000_000, maxBase: 14_999_999, label: "Mid-range any brand" },
    },
    {
      id: "pstore",
      name: "PStore",
      tagline: "Volume / Ex-Inter friendly — kuantitas mendominasi.",
      icon: "boxes-stacked",
      accent: "#10b981",
      marginPct: 0.15,
      baseRate: 0.30,
      tierWeight: 0.10,
      repWeight:  0.30,
      preferred: { brand: null, minBase: 0, maxBase: Infinity, label: "Any unit (Ex-Inter OK)" },
    },
  ];

  const MAX_CONSIGNMENT_UNITS = 500;
  const DELIVERY_DAYS         = 3;       // 3 in-game days per spec


  /* ---------- State init ---------- */
  function ensureState() {
    const s = S();
    if (!s.corporate) {
      s.corporate = {
        proposals: {},
        consignments: [],
        history: [],
      };
    }
    if (!s.corporate.proposals)         s.corporate.proposals = {};
    if (!Array.isArray(s.corporate.consignments)) s.corporate.consignments = [];
    if (!Array.isArray(s.corporate.history))      s.corporate.history = [];
    PARTNERS.forEach((p) => {
      if (!s.corporate.proposals[p.id]) {
        s.corporate.proposals[p.id] = { status: "none", appliedDay: null, score: null };
      }
    });
  }

  /* ---------- HQ tier helper ---------- */
  function getHqTier() {
    const s = S();
    if (s.realEstate && s.realEstate.rented && s.realEstate.store && typeof s.realEstate.store.tier === "number") {
      return s.realEstate.store.tier;
    }
    return 0; // no Ruko rented at all
  }

  function getRepScore() {
    return (window.Reputation && window.Reputation.getScore && window.Reputation.getScore()) || 0;
  }

  /** Compute the acceptance probability for a given partner. */
  function computeAcceptRate(partner) {
    const tier = getHqTier();
    const rep  = getRepScore();
    if (tier <= 0) return 0; // need a Ruko to even pitch
    // baseRate + (tier-1)^2 * tierWeight + (rep/100) * repWeight
    const tierBonus = Math.pow(Math.max(0, tier - 1), 2) * partner.tierWeight;
    const repBonus  = (rep / 100) * partner.repWeight;
    return Math.max(0, Math.min(1, partner.baseRate + tierBonus + repBonus));
  }

  /** Submit a proposal — RNG roll using computeAcceptRate. */
  function submitProposal(partnerId) {
    ensureState();
    const partner = PARTNERS.find((p) => p.id === partnerId);
    if (!partner) return { ok: false, reason: "Partner tidak ditemukan." };
    const s = S();
    const prop = s.corporate.proposals[partnerId];
    if (prop.status === "accepted") return { ok: false, reason: "Sudah jadi partner — gak perlu apply ulang." };
    if (prop.status === "pending")  return { ok: false, reason: "Proposal masih diproses." };

    const tier = getHqTier();
    if (tier <= 0) {
      showToast("Sewa Ruko dulu sebelum apply Corporate B2B.");
      return { ok: false, reason: "no-ruko" };
    }

    const rate = computeAcceptRate(partner);
    const roll = Math.random();
    const accepted = roll < rate;
    prop.appliedDay = s.currentDay;
    prop.score = Math.round(rate * 100);
    prop.status = accepted ? "accepted" : "rejected";
    if (accepted) prop.acceptedOnDay = s.currentDay;

    if (window.Notifications) {
      window.Notifications.add({
        type: accepted ? "success" : "warning",
        title: accepted ? `${partner.name}: Proposal Accepted! 🎉` : `${partner.name}: Proposal Rejected`,
        message: accepted
          ? `${partner.name} terima kerjasama (${prop.score}% accept rate). Konsinyasi unlocked — kirim stock di Corporate B2B page.`
          : `${partner.name} menolak (${prop.score}% accept rate roll'd ${(roll*100).toFixed(0)}%). Naikkin tier Ruko atau reputasi dulu.`,
        actionPage: "corporate",
        actor: partner.name,
        icon: "handshake",
      });
    }
    showToast(accepted ? `✅ ${partner.name}: Accepted! (${prop.score}% chance)` : `❌ ${partner.name}: Rejected (${prop.score}% chance)`);
    window.FlippingTycoon.saveGame();
    return { ok: true, accepted, rate, roll };
  }


  /* =========================================================
   * Konsinyasi (consignment): send stock → 3 days → auto-sell
   * ========================================================= */

  /** Items eligible for consignment with a given partner: matches the partner's
   *  preferred filter (brand + basePrice band). */
  function eligibleForPartner(partner) {
    const inv = (S().inventory || []);
    return inv.filter((it) => {
      if (it.repair && it.repair.completesOnDay) return false;          // repairing
      if (it.imeiUnlock && it.imeiUnlock.status === "in-progress") return false;
      if (it.imeiStatus === "blocked") return false;
      const bp = Number(it.basePrice) || 0;
      if (bp < partner.preferred.minBase) return false;
      if (bp > partner.preferred.maxBase) return false;
      if (partner.preferred.brand && !partner.preferred.brand.includes(it.brand)) return false;
      return true;
    });
  }

  /** Send a consignment batch. itemIds is an array of inventory ids. */
  function sendConsignment(partnerId, itemIds) {
    ensureState();
    const partner = PARTNERS.find((p) => p.id === partnerId);
    if (!partner) return { ok: false, reason: "Partner tidak ditemukan." };
    const s = S();
    if (s.corporate.proposals[partnerId].status !== "accepted") {
      showToast(`${partner.name} belum jadi partner. Ajukan proposal dulu.`);
      return { ok: false, reason: "not-accepted" };
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      showToast("Pilih minimal 1 item dulu.");
      return { ok: false, reason: "no-items" };
    }
    if (itemIds.length > MAX_CONSIGNMENT_UNITS) {
      showToast(`Maks ${MAX_CONSIGNMENT_UNITS} unit per konsinyasi.`);
      return { ok: false, reason: "too-many" };
    }

    const idSet = new Set(itemIds);
    const picked = (s.inventory || []).filter((it) => idSet.has(it.id));
    if (picked.length === 0) return { ok: false, reason: "items-missing" };

    // Compute total revenue: sum(basePrice) × (1 + marginPct)
    const totalBase    = picked.reduce((sum, it) => sum + (Number(it.basePrice) || 0), 0);
    const totalRevenue = Math.round(totalBase * (1 + partner.marginPct));

    // Snapshot items minimally for delivery (we don't need full schema)
    const snapshot = picked.map((it) => ({
      id: it.id,
      gadgetId: it.gadgetId,
      name: it.name,
      brand: it.brand,
      basePrice: Number(it.basePrice) || 0,
      buyPrice: Number(it.buyPrice) || 0,
      isExInter: !!it.isExInter,
      specs: it.specs ? { ram: it.specs.ram, rom: it.specs.rom, color: it.specs.color } : null,
    }));

    // Remove the items from inventory immediately (in-transit)
    s.inventory = (s.inventory || []).filter((it) => !idSet.has(it.id));

    // Push the consignment record
    const cons = {
      id: uid("cons"),
      partnerId: partner.id,
      partnerName: partner.name,
      partnerAccent: partner.accent,
      partnerIcon: partner.icon,
      sentDay: s.currentDay,
      deliversDay: s.currentDay + DELIVERY_DAYS,
      units: snapshot,
      unitCount: snapshot.length,
      totalBase,
      totalRevenue,
      marginPct: partner.marginPct,
      status: "in-transit",
    };
    s.corporate.consignments.unshift(cons);

    if (window.Notifications) {
      window.Notifications.add({
        type: "info",
        title: `Konsinyasi shipped: ${partner.name}`,
        message: `${snapshot.length} unit dikirim ke ${partner.name}. ETA Day ${cons.deliversDay} → +${fmt(totalRevenue)} masuk Mandiri.`,
        actionPage: "corporate",
        actor: partner.name,
        icon: "truck-fast",
      });
    }
    showToast(`📦 ${snapshot.length} unit shipped → ${partner.name} (delivers Day ${cons.deliversDay}).`);
    window.FlippingTycoon.saveGame();
    return { ok: true, cons };
  }

  /** Daily tick: deliver consignments whose deliversDay has arrived. */
  function processDailyDeliveries() {
    ensureState();
    const s = S();
    const due = (s.corporate.consignments || []).filter((c) =>
      c.status === "in-transit" && s.currentDay >= c.deliversDay
    );
    if (due.length === 0) return;

    let totalRevenue = 0, totalUnits = 0;
    due.forEach((c) => {
      // Credit Mandiri
      s.bankBalances.Mandiri = (s.bankBalances.Mandiri || 0) + c.totalRevenue;
      if (!Array.isArray(s.bankHistories.Mandiri)) s.bankHistories.Mandiri = [];
      s.bankHistories.Mandiri.push({
        type: "CREDIT",
        amount: c.totalRevenue,
        balanceAfter: s.bankBalances.Mandiri,
        description: `Konsinyasi ${c.partnerName}: ${c.unitCount} unit (Day ${c.sentDay} → ${c.deliversDay})`,
        category: "corporate-consignment",
        day: s.currentDay,
        ts: Date.now(),
      });

      // Per-unit Analytics push (cheap data)
      if (window.Analytics && window.Analytics.recordSale) {
        c.units.forEach((u) => {
          const allocatedRevenue = Math.round(c.totalRevenue * (u.basePrice / Math.max(1, c.totalBase)));
          window.Analytics.recordSale({
            saleType: "corporate-consignment",
            gadget: { gadgetId: u.gadgetId, name: u.name, brand: u.brand, isExInter: !!u.isExInter, specs: u.specs },
            purchaseCost: u.buyPrice || 0,
            repairCost: 0,
            salePrice: allocatedRevenue,
            feePaid: 0,
            buyer: c.partnerName,
            receivingBank: "Mandiri",
          });
        });
      }

      c.status = "completed";
      c.completedOnDay = s.currentDay;
      s.corporate.history.unshift({
        id: c.id,
        partnerId: c.partnerId,
        partnerName: c.partnerName,
        unitCount: c.unitCount,
        totalRevenue: c.totalRevenue,
        sentDay: c.sentDay,
        completedDay: s.currentDay,
      });

      totalRevenue += c.totalRevenue;
      totalUnits   += c.unitCount;
    });
    if (s.corporate.history.length > 30) s.corporate.history.length = 30;
    s.corporate.consignments = (s.corporate.consignments || []).filter((c) => c.status !== "completed");

    // +N rep covering all delivered units
    if (window.Reputation && totalUnits > 0) {
      window.Reputation.applyDelta(totalUnits, `Corporate consignment delivered (${totalUnits} unit)`);
    }
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `${totalUnits} unit consignment terkirim`,
        message: `${due.length} batch konsinyasi sukses → +${fmt(totalRevenue)} masuk Mandiri.`,
        actionPage: "corporate",
        actor: "Corporate B2B",
        icon: "truck-arrow-right",
      });
    }
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderCorporatePage() {
    ensureState();
    const s = S();
    const wrap = document.createElement("div");

    // Header
    const tier = getHqTier();
    const rep = getRepScore();
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-handshake-angle text-amber-500"></i> Corporate B2B</h3>
          <p class="text-sm text-gray-500">Pitch toko kamu jadi partner resmi mega-retailer. Diterima → pasive income via Konsinyasi.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">HQ Tier / Rep</p>
          <p class="font-semibold text-sm">T${tier} &middot; ${rep}/100</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Active consignments
    const inTransit = (s.corporate.consignments || []).filter((c) => c.status === "in-transit");
    if (inTransit.length > 0) {
      const card = document.createElement("div");
      card.className = "fb-card";
      card.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-truck-fast text-blue-500"></i> Konsinyasi Aktif (${inTransit.length})</h3>`;
      const list = document.createElement("div");
      list.className = "corp-cons-list";
      inTransit.forEach((c) => {
        const days = Math.max(0, c.deliversDay - s.currentDay);
        const row = document.createElement("div");
        row.className = "corp-cons-row";
        row.innerHTML = `
          <div class="corp-cons-icon" style="background:${c.partnerAccent}"><i class="fa-solid fa-${c.partnerIcon}"></i></div>
          <div class="corp-cons-info">
            <p class="corp-cons-title">${c.partnerName} — ${c.unitCount} unit</p>
            <p class="corp-cons-meta">Sent D${c.sentDay} &middot; ETA D${c.deliversDay} (${days === 0 ? "deliver next day" : days + " hari lagi"})</p>
          </div>
          <p class="corp-cons-revenue">+${fmt(c.totalRevenue)}</p>
        `;
        list.appendChild(row);
      });
      card.appendChild(list);
      wrap.appendChild(card);
    }

    // Partner cards
    PARTNERS.forEach((p) => wrap.appendChild(renderPartnerCard(p, tier, rep)));

    // History (recent 8)
    const hist = (s.corporate.history || []).slice(0, 8);
    if (hist.length > 0) {
      const card = document.createElement("div");
      card.className = "fb-card";
      card.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-purple-500"></i> Riwayat Konsinyasi</h3>`;
      const list = document.createElement("div");
      list.className = "corp-hist-list";
      hist.forEach((h) => {
        const row = document.createElement("div");
        row.className = "corp-hist-row";
        row.innerHTML = `
          <div>
            <p class="font-semibold text-sm">${h.partnerName} — ${h.unitCount} unit</p>
            <p class="text-xs text-gray-500">Day ${h.sentDay} → ${h.completedDay}</p>
          </div>
          <p class="font-bold text-emerald-600 text-sm">+${fmt(h.totalRevenue)}</p>
        `;
        list.appendChild(row);
      });
      card.appendChild(list);
      wrap.appendChild(card);
    }
    return wrap;
  }

  function renderPartnerCard(partner, tier, rep) {
    const s = S();
    const prop = s.corporate.proposals[partner.id];
    const accepted = prop.status === "accepted";
    const rate = computeAcceptRate(partner);
    const ratePct = Math.round(rate * 100);

    const card = document.createElement("div");
    card.className = `fb-card corp-partner-card ${accepted ? "accepted" : ""}`;

    const eligibleCount = accepted ? eligibleForPartner(partner).length : 0;

    card.innerHTML = `
      <div class="corp-partner-header">
        <div class="corp-partner-icon" style="background:${partner.accent}">
          <i class="fa-solid fa-${partner.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold">${partner.name}
            ${accepted ? '<span class="corp-status-pill accepted">PARTNER ✓</span>' : prop.status === "rejected" ? '<span class="corp-status-pill rejected">Rejected D' + (prop.appliedDay || "") + '</span>' : '<span class="corp-status-pill pending">Belum apply</span>'}
          </h4>
          <p class="text-xs text-gray-500">${partner.tagline}</p>
          <p class="text-xs text-gray-400 mt-1">Stock terima: ${partner.preferred.label} &middot; margin +${(partner.marginPct * 100).toFixed(0)}%</p>
        </div>
      </div>
      <div class="corp-partner-stats">
        <div><span>Accept rate</span><b class="${rate >= 0.5 ? "text-emerald-700" : rate >= 0.2 ? "text-amber-600" : "text-rose-600"}">${ratePct}%</b></div>
        <div><span>HQ Tier needed</span><b>T1+</b></div>
        <div><span>Konsinyasi</span><b>${accepted ? "Unlocked ✓" : "Locked 🔒"}</b></div>
      </div>
      <div class="corp-partner-actions">
        ${accepted
          ? `<button class="modal-btn modal-btn-primary corp-send-btn" data-id="${partner.id}" style="background:${partner.accent};color:#fff" ${eligibleCount === 0 ? "disabled" : ""}>
              <i class="fa-solid fa-truck-fast"></i> Kirim Konsinyasi (${eligibleCount} eligible)
            </button>`
          : prop.status === "pending"
            ? `<button class="modal-btn modal-btn-ghost" disabled><i class="fa-solid fa-hourglass-half"></i> Pending</button>`
            : `<button class="modal-btn modal-btn-primary corp-apply-btn" data-id="${partner.id}" style="background:${partner.accent};color:#fff">
                <i class="fa-solid fa-handshake"></i> Ajukan Proposal Kerjasama (${ratePct}%)
              </button>`}
      </div>
    `;

    const applyBtn = card.querySelector(".corp-apply-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        if (confirm(`Ajukan proposal ke ${partner.name}? Accept rate ~${ratePct}%.`)) {
          submitProposal(partner.id);
          window.FlippingTycoon.renderActivePage();
        }
      });
    }
    const sendBtn = card.querySelector(".corp-send-btn");
    if (sendBtn) {
      sendBtn.addEventListener("click", () => openSendModal(partner));
    }
    return card;
  }

  /* =========================================================
   * Send Konsinyasi modal — pick up to MAX_CONSIGNMENT_UNITS
   * ========================================================= */
  function openSendModal(partner) {
    const eligible = eligibleForPartner(partner);
    if (eligible.length === 0) { showToast(`Gak ada item eligible untuk ${partner.name}.`); return; }
    const modal = document.querySelector("#corp-send-modal");
    if (!modal) { showToast("Modal not found."); return; }
    const titleEl = modal.querySelector("#corp-send-title");
    const body    = modal.querySelector("#corp-send-body");
    const cancelBtn = modal.querySelector("#corp-send-cancel");

    titleEl.textContent = `Kirim Konsinyasi → ${partner.name}`;

    // Build the picker UI: top of body shows summary, then a scroll list
    function rebuild(selectedIds) {
      const idSet = new Set(selectedIds);
      const picked = eligible.filter((it) => idSet.has(it.id));
      const totalBase = picked.reduce((sum, it) => sum + (Number(it.basePrice) || 0), 0);
      const totalRevenue = Math.round(totalBase * (1 + partner.marginPct));

      const ready = picked.length > 0 && picked.length <= MAX_CONSIGNMENT_UNITS;
      body.innerHTML = `
        <div class="corp-send-summary">
          <p><b>${picked.length}</b> / ${MAX_CONSIGNMENT_UNITS} unit dipilih (eligible total ${eligible.length})</p>
          <p class="text-sm">Total base: ${fmt(totalBase)} &middot; Total revenue: <b class="text-emerald-700">${fmt(totalRevenue)}</b> (margin +${(partner.marginPct*100).toFixed(0)}%)</p>
          <p class="text-xs text-gray-500 mt-1">Delivery dalam ${DELIVERY_DAYS} hari → cash auto-masuk Mandiri.</p>
        </div>
        <div class="corp-send-actions-mini">
          <button class="modal-btn modal-btn-ghost" id="corp-pick-max" type="button">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Pilih Max (${Math.min(MAX_CONSIGNMENT_UNITS, eligible.length)})
          </button>
          <button class="modal-btn modal-btn-ghost" id="corp-clear-pick" type="button">
            <i class="fa-solid fa-eraser"></i> Clear
          </button>
          <button class="modal-btn modal-btn-primary" id="corp-confirm-send" ${ready ? "" : "disabled"}
                  style="background:${partner.accent};color:#fff">
            <i class="fa-solid fa-truck-fast"></i> Confirm Kirim (${picked.length})
          </button>
        </div>
        <div class="corp-pick-list">
          ${eligible.slice(0, 200).map((it) => {
            const checked = idSet.has(it.id);
            return `
              <label class="corp-pick-row ${checked ? "checked" : ""}">
                <input type="checkbox" data-id="${it.id}" ${checked ? "checked" : ""}>
                <span class="corp-pick-name">${it.brand || ""} ${it.name} <span class="text-xs text-gray-400">${it.specs ? it.specs.ram + "/" + it.specs.rom : ""}</span></span>
                <span class="corp-pick-price">${fmt(Number(it.basePrice) || 0)}</span>
              </label>
            `;
          }).join("")}
          ${eligible.length > 200 ? `<p class="text-xs text-amber-600 text-center mt-2">+ ${eligible.length - 200} item lain (tampilkan 200 teratas untuk performa)</p>` : ""}
        </div>
      `;

      body.querySelectorAll('.corp-pick-list input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const id = cb.dataset.id;
          if (cb.checked) {
            if (selectedIds.length >= MAX_CONSIGNMENT_UNITS) {
              cb.checked = false;
              showToast(`Maks ${MAX_CONSIGNMENT_UNITS} unit per konsinyasi.`);
              return;
            }
            selectedIds.push(id);
          } else {
            const i = selectedIds.indexOf(id);
            if (i !== -1) selectedIds.splice(i, 1);
          }
          rebuild(selectedIds);
        });
      });

      const pickMaxBtn = body.querySelector("#corp-pick-max");
      if (pickMaxBtn) pickMaxBtn.addEventListener("click", () => {
        const target = Math.min(MAX_CONSIGNMENT_UNITS, eligible.length);
        rebuild(eligible.slice(0, target).map((it) => it.id));
      });
      const clearBtn = body.querySelector("#corp-clear-pick");
      if (clearBtn) clearBtn.addEventListener("click", () => rebuild([]));
      const confirmBtn = body.querySelector("#corp-confirm-send");
      if (confirmBtn && ready) {
        confirmBtn.addEventListener("click", () => {
          if (sendConsignment(partner.id, picked.map((it) => it.id)).ok) {
            closeModal();
            window.FlippingTycoon.renderActivePage();
          }
        });
      }
    }

    rebuild([]);
    cancelBtn.onclick = closeModal;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    function closeModal() {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  function showToast(msg) {
    if (window.Notifications && window.Notifications.toast) {
      window.Notifications.toast(msg);
      return;
    }
    let toast = document.querySelector("#ft-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ft-toast";
      toast.className = "ft-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("ft-toast-show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("ft-toast-show"), 2400);
  }

  /* ---------- Public API ---------- */
  window.Corporate = {
    renderCorporatePage,
    submitProposal,
    sendConsignment,
    processDailyDeliveries,
    eligibleForPartner,
    computeAcceptRate,
    PARTNERS,
    MAX_CONSIGNMENT_UNITS,
    DELIVERY_DAYS,
  };
})();
