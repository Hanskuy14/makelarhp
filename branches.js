/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 28 — City Branches (Expansion to 5 Major Cities)
 *
 * The player starts with Jakarta as HQ and can unlock 4 more
 * branch cities (Bandung, Surabaya, Medan, Makassar) by paying
 * a one-time setup fee + monthly rent. Each unlocked branch
 * runs a daily demand-tilted walk-in pass that prefers items
 * matching that city's market profile.
 *
 *   Jakarta (HQ)  — Apple flagships (basePrice >= 10M)
 *   Bandung       — general (any item, balanced)
 *   Surabaya      — Samsung
 *   Medan         — Ex-Inter (BM / no pajak)
 *   Makassar      — Vivo / Oppo mid-range (3M-10M)
 *
 * Each branch contributes 1-3 extra walk-in sales per Next Day,
 * sampled from inventory matching that city's preference. Sale
 * price = sum of buyPrice × 1.10 (modest 10% markup, paid into
 * Mandiri). Player effort: zero — branches run autonomously.
 *
 * State stored on:
 *   data.cityBranches = {
 *     <cityId>: { unlocked, openedDay, totalRevenue, totalSold, lastBatch }
 *   }
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }

  /* ---------- City catalog ---------- */
  const CITIES = [
    {
      id: "jakarta",
      name: "Jakarta",
      label: "Jakarta (HQ)",
      icon: "city",
      accent: "#1d4ed8",
      hq: true,
      setupFee: 0,
      dailyRent: 0,
      requiredRevenue: 0,
      preference: "Apple flagships (basePrice >= Rp 10M)",
      filter: (it) => it.brand === "Apple" && (Number(it.basePrice) || 0) >= 10_000_000,
      saleRange: [1, 3],
      markupPct: 0.10,
    },
    {
      id: "bandung",
      name: "Bandung",
      label: "Bandung",
      icon: "mountain-city",
      accent: "#10b981",
      hq: false,
      setupFee: 50_000_000,
      dailyRent: 1_500_000,
      requiredRevenue: 200_000_000,
      preference: "General market (any unit, balanced)",
      filter: (it) => true,
      saleRange: [1, 2],
      markupPct: 0.08,
    },
    {
      id: "surabaya",
      name: "Surabaya",
      label: "Surabaya",
      icon: "anchor",
      accent: "#f59e0b",
      hq: false,
      setupFee: 80_000_000,
      dailyRent: 2_500_000,
      requiredRevenue: 350_000_000,
      preference: "Samsung Galaxy (S, Z, Note series)",
      filter: (it) => it.brand === "Samsung",
      saleRange: [1, 2],
      markupPct: 0.10,
    },
    {
      id: "medan",
      name: "Medan",
      label: "Medan",
      icon: "fire",
      accent: "#dc2626",
      hq: false,
      setupFee: 120_000_000,
      dailyRent: 4_500_000,
      requiredRevenue: 500_000_000,
      preference: "Ex-Inter / BM (no-pajak units fly fast)",
      filter: (it) => !!it.isExInter,
      saleRange: [1, 3],
      markupPct: 0.12,
    },
    {
      id: "makassar",
      name: "Makassar",
      label: "Makassar",
      icon: "umbrella-beach",
      accent: "#8b5cf6",
      hq: false,
      setupFee: 150_000_000,
      dailyRent: 5_000_000,
      requiredRevenue: 800_000_000,
      preference: "Mid-range Vivo / Oppo (3-10M)",
      filter: (it) => {
        const bp = Number(it.basePrice) || 0;
        return (it.brand === "Vivo" || it.brand === "Oppo") && bp >= 3_000_000 && bp < 10_000_000;
      },
      saleRange: [1, 2],
      markupPct: 0.10,
    },
  ];


  /* ---------- Branch Tier Ladder (Part 30) ---------- */
  /* Same 4-tier shape as the HQ Ruko, but cheaper to upgrade and
   * smaller in capacity since branches are secondary stores. */
  const BRANCH_TIERS = [
    { tier: 1, label: "Kios Mini",       displayCapacity: 100,  upgradeFee: 0,           dailyExtraRent: 0 },
    { tier: 2, label: "Kios Cabang",     displayCapacity: 400,  upgradeFee: 80_000_000,  dailyExtraRent: 1_000_000 },
    { tier: 3, label: "Ruko Cabang",     displayCapacity: 1200, upgradeFee: 200_000_000, dailyExtraRent: 2_500_000 },
    { tier: 4, label: "Premium Branch",  displayCapacity: 3000, upgradeFee: 500_000_000, dailyExtraRent: 5_000_000 },
  ];
  const MAX_BRANCH_TIER = 4;

  function tierMeta(tier) {
    return BRANCH_TIERS.find((t) => t.tier === tier) || BRANCH_TIERS[0];
  }

  /* ---------- State init ---------- */
  function ensureState() {
    const s = S();
    if (!s.cityBranches) s.cityBranches = {};
    CITIES.forEach((c) => {
      if (!s.cityBranches[c.id]) {
        s.cityBranches[c.id] = {
          unlocked: !!c.hq,                  // Jakarta auto-unlocked
          openedDay: c.hq ? 1 : null,
          totalRevenue: 0,
          totalSold: 0,
          lastBatch: null,
          storeTier: 1,
        };
      }
      // Part 30 — backfill storeTier for legacy saves
      if (typeof s.cityBranches[c.id].storeTier !== "number") {
        s.cityBranches[c.id].storeTier = 1;
      }
    });

    // Part 30 — backfill location property on every inventory item.
    // Items default to 'HQ' (where they were before this PR existed).
    (s.inventory || []).forEach((it) => {
      if (!it.location) it.location = "HQ";
    });
  }

  /* ---------- Per-branch capacity helpers ---------- */
  function getBranchTier(cityId) {
    ensureState();
    return S().cityBranches[cityId] ? S().cityBranches[cityId].storeTier || 1 : 1;
  }
  function getBranchCapacity(cityId) {
    if (cityId === "HQ" || cityId === "jakarta") {
      // Jakarta = HQ, defer to RealEstate.displayCapacity (Part 27 ladder)
      if (window.RealEstate && window.RealEstate.displayCapacity) {
        return window.RealEstate.displayCapacity();
      }
      return 5000;
    }
    return tierMeta(getBranchTier(cityId)).displayCapacity;
  }
  function getBranchUsed(cityId) {
    return ((S().inventory || []).filter((it) => (it.location || "HQ") === cityId)).length;
  }
  function getBranchRemaining(cityId) {
    return Math.max(0, getBranchCapacity(cityId) - getBranchUsed(cityId));
  }

  /** Last 30-day revenue gating for unlock costs. */
  function getMonthlyRevenue() {
    const s = S();
    const cutoff = (s.currentDay || 0) - 30;
    return ((s.salesHistory || []).reduce((sum, x) => sum + (x.day >= cutoff ? (x.salePrice || 0) : 0), 0));
  }

  function isUnlocked(cityId) {
    ensureState();
    return !!(S().cityBranches[cityId] && S().cityBranches[cityId].unlocked);
  }

  function unlockedCities() {
    ensureState();
    return CITIES.filter((c) => S().cityBranches[c.id].unlocked);
  }

  /* ---------- Open a branch ---------- */
  function openBranch(cityId) {
    ensureState();
    const city = CITIES.find((c) => c.id === cityId);
    if (!city) return false;
    if (city.hq) return false;
    const s = S();
    const meta = s.cityBranches[city.id];
    if (meta.unlocked) { showToast(`${city.name} sudah aktif.`); return false; }

    const monthlyRev = getMonthlyRevenue();
    if (monthlyRev < city.requiredRevenue) {
      showToast(`${city.name} butuh revenue 30 hari ≥ ${fmt(city.requiredRevenue)} (kamu: ${fmt(monthlyRev)}).`);
      return false;
    }
    if ((s.bankBalances.Mandiri || 0) < city.setupFee) {
      showToast(`Mandiri kurang ${fmt(city.setupFee)} buat setup ${city.name}.`);
      return false;
    }

    s.bankBalances.Mandiri -= city.setupFee;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: city.setupFee,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Setup cabang ${city.name}`,
      category: "branch-setup",
      day: s.currentDay,
      ts: Date.now(),
    });
    meta.unlocked = true;
    meta.openedDay = s.currentDay;

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Cabang ${city.name} Dibuka!`,
        message: `Setup fee ${fmt(city.setupFee)} terbayar. Cabang ${city.name} mulai jalan tiap Next Day — fokus ${city.preference}.`,
        actionPage: "branches",
        actor: "City Branches",
        icon: city.icon,
      });
    }
    showToast(`✅ ${city.name} dibuka — ${city.preference}.`);
    window.FlippingTycoon.saveGame();
    return true;
  }

  function closeBranch(cityId) {
    ensureState();
    const city = CITIES.find((c) => c.id === cityId);
    if (!city || city.hq) return false;
    const s = S();
    const meta = s.cityBranches[city.id];
    if (!meta.unlocked) return false;
    meta.unlocked = false;
    meta.openedDay = null;
    showToast(`${city.name} ditutup.`);
    window.FlippingTycoon.saveGame();
    return true;
  }

  /* ---------- Part 30 — Upgrade a branch's storeTier ---------- */
  function upgradeBranchTier(cityId) {
    ensureState();
    const s = S();
    const city = CITIES.find((c) => c.id === cityId);
    if (!city) return false;
    if (!s.cityBranches[cityId].unlocked) {
      showToast("Cabang belum aktif.");
      return false;
    }
    if (city.hq) {
      showToast("HQ Jakarta upgrade dilakukan via Real Estate page.");
      return false;
    }
    const cur = getBranchTier(cityId);
    if (cur >= MAX_BRANCH_TIER) {
      showToast(`${city.name} udah max tier (T${MAX_BRANCH_TIER}).`);
      return false;
    }
    const next = tierMeta(cur + 1);
    if ((s.bankBalances.Mandiri || 0) < next.upgradeFee) {
      showToast(`Mandiri kurang ${fmt(next.upgradeFee)} buat upgrade ${city.name} ke T${next.tier}.`);
      return false;
    }
    s.bankBalances.Mandiri -= next.upgradeFee;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: next.upgradeFee,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Upgrade cabang ${city.name} ke T${next.tier} (${next.label})`,
      category: "branch-upgrade",
      day: s.currentDay,
      ts: Date.now(),
    });
    s.cityBranches[cityId].storeTier = next.tier;

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `${city.name} → T${next.tier} (${next.label})`,
        message: `Cabang ${city.name} naik ke ${next.label}. Display capacity sekarang ${next.displayCapacity.toLocaleString("id-ID")} unit.`,
        actionPage: "branches",
        icon: city.icon,
      });
    }
    showToast(`✅ ${city.name} → T${next.tier} ${next.label} (cap ${next.displayCapacity.toLocaleString("id-ID")}).`);
    window.FlippingTycoon.saveGame();
    return true;
  }

  /* ---------- Part 30 — Transfer items between locations ---------- */
  function transferToBranch(itemIds, cityId) {
    ensureState();
    const s = S();
    if (!s.cityBranches[cityId] || !s.cityBranches[cityId].unlocked) {
      showToast("Cabang tujuan belum aktif.");
      return { ok: false, reason: "branch-locked" };
    }
    const ids = Array.isArray(itemIds) ? itemIds : [];
    if (ids.length === 0) return { ok: false, reason: "no-items" };

    // Capacity check at destination
    const remaining = getBranchRemaining(cityId);
    if (ids.length > remaining) {
      const cap = getBranchCapacity(cityId);
      const used = getBranchUsed(cityId);
      showToast(`Cabang ${cityId} kapasitas ${used}/${cap} — bisa transfer max ${remaining}.`);
      return { ok: false, reason: "capacity", remaining };
    }

    const idSet = new Set(ids);
    let moved = 0;
    (s.inventory || []).forEach((it) => {
      if (idSet.has(it.id)) {
        if (it.repair && it.repair.completesOnDay) return;
        if (it.imeiUnlock && it.imeiUnlock.status === "in-progress") return;
        it.location = cityId;
        moved++;
      }
    });
    window.FlippingTycoon.saveGame();
    if (moved > 0 && window.Notifications) {
      const cityName = (CITIES.find((c) => c.id === cityId) || {}).name || cityId;
      window.Notifications.add({
        type: "info",
        title: `Logistik: ${moved} unit → ${cityName}`,
        message: `${moved} unit dipindah dari HQ ke cabang ${cityName}. Akan dijual otomatis tiap Next Day.`,
        actionPage: "branches",
        icon: "truck",
      });
    }
    return { ok: true, moved };
  }

  function transferBackToHQ(itemIds) {
    ensureState();
    const s = S();
    const idSet = new Set(itemIds || []);
    let moved = 0;
    (s.inventory || []).forEach((it) => {
      if (idSet.has(it.id) && (it.location || "HQ") !== "HQ") {
        it.location = "HQ";
        moved++;
      }
    });
    if (moved > 0) window.FlippingTycoon.saveGame();
    return { ok: true, moved };
  }

  /** Pay daily rent for unlocked non-HQ branches. */
  function processDailyRent() {
    ensureState();
    const s = S();
    let totalRent = 0;
    CITIES.forEach((c) => {
      if (c.hq) return;
      if (!s.cityBranches[c.id].unlocked) return;
      totalRent += c.dailyRent;
    });
    if (totalRent <= 0) return;

    if ((s.bankBalances.Mandiri || 0) < totalRent) {
      // Can't pay → close all non-HQ branches
      const closed = [];
      CITIES.forEach((c) => {
        if (c.hq) return;
        if (s.cityBranches[c.id].unlocked) {
          s.cityBranches[c.id].unlocked = false;
          closed.push(c.name);
        }
      });
      if (window.Notifications && closed.length > 0) {
        window.Notifications.add({
          type: "warning",
          title: "Cabang Tutup!",
          message: `Mandiri gak cukup buat sewa ${fmt(totalRent)}. ${closed.length} cabang ditutup: ${closed.join(", ")}.`,
          actionPage: "branches",
          icon: "circle-exclamation",
        });
      }
      return;
    }

    s.bankBalances.Mandiri -= totalRent;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: totalRent,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Sewa harian cabang (${unlockedCities().filter((c) => !c.hq).length} cabang non-HQ)`,
      category: "branch-rent",
      day: s.currentDay,
      ts: Date.now(),
    });
  }

  /** Run a demand-tilted walk-in pass for each unlocked branch.
   *  Part 30: pulls from items where `location === cityId`, respecting
   *  per-branch capacity. HQ Jakarta uses items with location 'HQ' OR
   *  'jakarta' for back-compat. */
  function processBranchSales() {
    ensureState();
    const s = S();
    const cities = unlockedCities();
    if (cities.length === 0) return;

    let grandRevenue = 0, grandUnits = 0;
    const summaries = [];

    cities.forEach((city) => {
      const meta = s.cityBranches[city.id];

      /* Part 30 — strict location filter:
       * HQ Jakarta accepts items located at 'HQ' OR 'jakarta'.
       * Other branches accept ONLY items located at their cityId. */
      const locFilter = (it) => {
        const loc = it.location || "HQ";
        if (city.id === "jakarta" || city.hq) return loc === "HQ" || loc === "jakarta";
        return loc === city.id;
      };

      const eligible = (s.inventory || []).filter((it) => {
        if (!locFilter(it)) return false;
        if (it.repair && it.repair.completesOnDay) return false;
        if (it.imeiUnlock && it.imeiUnlock.status === "in-progress") return false;
        if (it.imeiStatus === "blocked") return false;
        return city.filter(it);
      });
      if (eligible.length === 0) {
        meta.lastBatch = { day: s.currentDay, sold: 0, revenue: 0 };
        return;
      }

      // Roll how many sales for this branch
      const range = city.saleRange;
      const target = Math.min(eligible.length, range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)));
      const pool = eligible.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      const sold = pool.slice(0, target);
      const totalBuy = sold.reduce((sum, it) => sum + (Number(it.buyPrice) || 0), 0);
      const branchRevenue = Math.round(totalBuy * (1 + city.markupPct));

      // Remove sold items from inventory
      const idSet = new Set(sold.map((it) => it.id));
      s.inventory = s.inventory.filter((it) => !idSet.has(it.id));

      // Credit Mandiri (one entry per branch for clarity)
      s.bankBalances.Mandiri = (s.bankBalances.Mandiri || 0) + branchRevenue;
      s.bankHistories.Mandiri.push({
        type: "CREDIT",
        amount: branchRevenue,
        balanceAfter: s.bankBalances.Mandiri,
        description: `Cabang ${city.name}: ${sold.length} unit (${city.preference})`,
        category: "branch-sale",
        day: s.currentDay,
        ts: Date.now(),
      });

      // Per-unit Analytics push (cheap data)
      if (window.Analytics && window.Analytics.recordSale) {
        sold.forEach((it) => {
          window.Analytics.recordSale({
            saleType: "branch-walk-in",
            gadget: { gadgetId: it.gadgetId, name: it.name, brand: it.brand, isExInter: !!it.isExInter, specs: it.specs },
            purchaseCost: it.buyPrice || 0,
            repairCost: it.totalRepairCost || 0,
            salePrice: Math.round(branchRevenue / sold.length),
            feePaid: 0,
            buyer: `Walk-in ${city.name}`,
            receivingBank: "Mandiri",
          });
        });
      }

      meta.totalRevenue += branchRevenue;
      meta.totalSold   += sold.length;
      meta.lastBatch    = { day: s.currentDay, sold: sold.length, revenue: branchRevenue };

      grandRevenue += branchRevenue;
      grandUnits   += sold.length;
      summaries.push(`${city.name} ${sold.length}u`);
    });

    if (grandUnits > 0 && window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Cabang Sales: ${grandUnits} unit`,
        message: `${summaries.join(" · ")} → +${fmt(grandRevenue)} masuk Mandiri.`,
        actionPage: "branches",
        actor: "City Branches",
        icon: "city",
      });
    }
    if (grandUnits > 0 && window.Reputation && window.Reputation.applyDelta) {
      const repGain = Math.max(1, Math.floor(grandUnits / 2));
      window.Reputation.applyDelta(repGain, `Branch sales: ${grandUnits} unit across ${cities.length} cabang`);
    }
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderBranchesPage() {
    ensureState();
    const s = S();
    const wrap = document.createElement("div");
    const monthlyRev = getMonthlyRevenue();
    const activeCount = unlockedCities().length;

    // Header
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-city text-indigo-600"></i> City Branches</h3>
          <p class="text-sm text-gray-500">Buka cabang di kota-kota besar — tiap cabang punya demand profile sendiri.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Cabang aktif</p>
          <p class="font-semibold text-sm text-emerald-700">${activeCount} / ${CITIES.length}</p>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-2">Monthly revenue (30d): <b>${fmt(monthlyRev)}</b></p>
    `;
    wrap.appendChild(header);

    // City grid
    const grid = document.createElement("div");
    grid.className = "branches-grid";
    CITIES.forEach((c) => grid.appendChild(renderCityCard(c, monthlyRev)));
    wrap.appendChild(grid);

    return wrap;
  }

  function renderCityCard(city, monthlyRev) {
    const s = S();
    const meta = s.cityBranches[city.id];
    const card = document.createElement("div");
    const unlocked = !!meta.unlocked;
    const unlockable = !unlocked && monthlyRev >= city.requiredRevenue;
    card.className = `fb-card branch-card ${unlocked ? "unlocked" : unlockable ? "ready" : "locked"}`;

    /* Part 30 — per-branch tier + capacity */
    const currentTier = getBranchTier(city.id);
    const currentTierMeta = tierMeta(currentTier);
    const atMaxTier = currentTier >= MAX_BRANCH_TIER;
    const nextTierMeta = atMaxTier ? null : tierMeta(currentTier + 1);
    const capacity = getBranchCapacity(city.id);
    const used = getBranchUsed(city.id);
    const capPct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
    const capColor = capPct >= 90 ? "#dc2626" : capPct >= 70 ? "#f59e0b" : "#10b981";

    const lastBatch = meta.lastBatch;
    card.innerHTML = `
      <div class="branch-card-header">
        <div class="branch-icon" style="background:${city.accent}">
          <i class="fa-solid fa-${city.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold">${city.label}</h4>
          <p class="text-xs text-gray-500">${city.preference}</p>
        </div>
        <span class="branch-status">
          ${unlocked
            ? '<span class="branch-pill active">AKTIF</span>'
            : unlockable
              ? '<span class="branch-pill ready">READY</span>'
              : '<span class="branch-pill locked">LOCKED</span>'}
        </span>
      </div>
      <div class="branch-stats">
        <div><span>Setup fee</span><b>${city.hq ? "—" : fmt(city.setupFee)}</b></div>
        <div><span>Daily rent</span><b>${city.hq ? "—" : fmt(city.dailyRent)}</b></div>
        <div><span>Min revenue</span><b>${city.hq ? "—" : fmt(city.requiredRevenue)}</b></div>
        <div><span>Sale range/day</span><b>${city.saleRange[0]}–${city.saleRange[1]} unit</b></div>
        <div><span>Tier</span><b>T${currentTier} · ${currentTierMeta.label}</b></div>
        <div><span>Capacity</span><b>${used.toLocaleString("id-ID")} / ${capacity.toLocaleString("id-ID")}</b></div>
      </div>
      <div class="branch-cap-track">
        <div class="branch-cap-fill" style="width:${capPct}%;background:${capColor}"></div>
      </div>
      ${unlocked ? `
        <div class="branch-summary">
          <div><span>Total sold</span><b>${meta.totalSold} unit</b></div>
          <div><span>Total revenue</span><b class="text-emerald-700">${fmt(meta.totalRevenue)}</b></div>
          ${lastBatch ? `<div><span>Last batch</span><b>D${lastBatch.day}: ${lastBatch.sold} unit · +${fmt(lastBatch.revenue)}</b></div>` : ""}
        </div>` : ""}
      <div class="branch-actions">
        ${city.hq
          ? `<button class="modal-btn modal-btn-ghost" disabled><i class="fa-solid fa-flag"></i> HQ — upgrade via Real Estate</button>`
          : unlocked
            ? `<div class="branch-action-row">
                ${!atMaxTier
                  ? `<button class="modal-btn modal-btn-primary branch-upgrade-btn" data-id="${city.id}" style="background:${city.accent};color:#fff" title="Upgrade ke ${nextTierMeta ? nextTierMeta.label : "next tier"} (cap ${nextTierMeta ? nextTierMeta.displayCapacity.toLocaleString("id-ID") : ""})">
                      <i class="fa-solid fa-arrow-up"></i> Upgrade Toko T${currentTier + 1} — ${fmt(nextTierMeta ? nextTierMeta.upgradeFee : 0)}
                    </button>`
                  : `<button class="modal-btn modal-btn-ghost" disabled><i class="fa-solid fa-trophy"></i> Tier MAX (T${MAX_BRANCH_TIER})</button>`}
                <button class="modal-btn modal-btn-ghost branch-close-btn" data-id="${city.id}"><i class="fa-solid fa-xmark"></i> Tutup Cabang</button>
              </div>`
            : unlockable
              ? `<button class="modal-btn modal-btn-primary branch-open-btn" data-id="${city.id}" style="background:${city.accent};color:#fff"><i class="fa-solid fa-key"></i> Buka Cabang — ${fmt(city.setupFee)}</button>`
              : `<button class="modal-btn modal-btn-ghost" disabled><i class="fa-solid fa-lock"></i> Butuh revenue ${fmt(city.requiredRevenue)}/30hr</button>`}
      </div>
    `;
    const openBtn = card.querySelector(".branch-open-btn");
    if (openBtn) openBtn.addEventListener("click", () => {
      if (confirm(`Buka cabang ${city.name}? Setup fee ${fmt(city.setupFee)} akan terpotong dari Mandiri.`)) {
        if (openBranch(city.id)) window.FlippingTycoon.renderActivePage();
      }
    });
    const closeBtn = card.querySelector(".branch-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", () => {
      if (confirm(`Tutup cabang ${city.name}? Sewa berhenti, tapi gak ada refund.`)) {
        if (closeBranch(city.id)) window.FlippingTycoon.renderActivePage();
      }
    });
    const upBtn = card.querySelector(".branch-upgrade-btn");
    if (upBtn) upBtn.addEventListener("click", () => {
      if (confirm(`Upgrade ${city.name} ke T${currentTier + 1} ${nextTierMeta.label}?\nFee ${fmt(nextTierMeta.upgradeFee)} dari Mandiri.\nCapacity baru: ${nextTierMeta.displayCapacity.toLocaleString("id-ID")} unit.`)) {
        if (upgradeBranchTier(city.id)) window.FlippingTycoon.renderActivePage();
      }
    });
    return card;
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
  window.Branches = {
    renderBranchesPage,
    openBranch,
    closeBranch,
    isUnlocked,
    unlockedCities,
    processDailyRent,
    processBranchSales,
    CITIES,
    // Part 30 — per-branch tier + logistics
    BRANCH_TIERS,
    MAX_BRANCH_TIER,
    getBranchTier,
    getBranchCapacity,
    getBranchUsed,
    getBranchRemaining,
    tierMeta,
    upgradeBranchTier,
    transferToBranch,
    transferBackToHQ,
  };
})();
