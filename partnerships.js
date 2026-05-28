/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 12 — Strategic Brand Partnerships & Tiered Wholesale
 * Part 18 — Brand-Specific Contracts + Strict Tier Filtering
 *           + Dynamic Per-Package Pricing (no hardcoded totals)
 *
 * Partnership Hub: Players negotiate B2B contracts with three
 * specific principals — Apple Authorized, Samsung Corporate, and
 * BBK Distributor (Xiaomi/Vivo/Oppo). Each principal sells three
 * tier packages (Flagship / Mid-Range / Entry-Level) whose stock
 * is STRICTLY filtered by basePrice band against the master DB.
 *
 * The total cost is computed dynamically from the actual rolled
 * stock — no hardcoded totals. Player tier (Bronze/Silver/Gold/
 * Platinum) determines the wholesale discount %.
 *
 * All units arrive Fullset / Mulus (1.0 / 1.0 multipliers).
 * Payment is upfront via one of the player's bank accounts.
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  /* ---------- Brand Groups (Part 18) ---------- */
  const BRAND_GROUPS = [
    { id: "apple",
      label: "Apple Authorized",
      shortLabel: "Apple",
      brands: ["Apple"],
      minRevenue: 0,
      icon: "apple",
      accent: "#1c1c1e",
      tagline: "Stok resmi distributor Apple. iPhone & iPad BNIB.",
    },
    { id: "samsung",
      label: "Samsung Corporate",
      shortLabel: "Samsung",
      brands: ["Samsung"],
      minRevenue: 50_000_000,
      icon: "mobile-screen",
      accent: "#1428a0",
      tagline: "Kontrak korporat Samsung Indonesia. Galaxy S, Z & Tab.",
    },
    { id: "bbk",
      label: "BBK Distributor (Xiaomi/Vivo/Oppo)",
      shortLabel: "BBK",
      brands: ["Xiaomi", "Vivo", "Oppo"],
      minRevenue: 30_000_000,
      icon: "boxes-stacked",
      accent: "#10b981",
      tagline: "Distributor Chinese mid-tier — Xiaomi, Vivo, Oppo dalam satu kontrak.",
    },
  ];


  /* ---------- Partnership Tiers (player-side discount %) ---------- */
  const PARTNER_TIERS = [
    { id: "bronze",   label: "Bronze Partner",   minRevenue: 0,           discount: 0.05, color: "#cd7f32" },
    { id: "silver",   label: "Silver Partner",   minRevenue: 100_000_000, discount: 0.10, color: "#9ca3af" },
    { id: "gold",     label: "Gold Partner",     minRevenue: 300_000_000, discount: 0.15, color: "#f59e0b" },
    { id: "platinum", label: "Platinum Partner", minRevenue: 750_000_000, discount: 0.20, color: "#6366f1" },
  ];

  /* ---------- Tier Packages (Part 18 — strict basePrice filter) ----------
   * Filters are applied against the master GADGET_DATABASE basePrice:
   *   Flagship  : basePrice >= 10.000.000
   *   Mid-Range : 3.000.000 <= basePrice <  10.000.000
   *   Entry     : basePrice < 3.000.000
   * unitCount is fixed per tier; total cost is computed dynamically.
   */
  const TIER_PACKAGES = [
    { id: "flagship",  label: "Flagship Bundle",
      description: "Top-of-the-line saja. Margin tebal, demand premium.",
      units: 50,    minBase: 10_000_000, maxBase: Infinity,
      icon: "crown",         accent: "#f59e0b" },
    { id: "midrange",  label: "Mid-Range Kit",
      description: "Sweet spot 3jt–10jt. Volume sehat, perputaran cepat.",
      units: 200,   minBase:  3_000_000, maxBase:  9_999_999,
      icon: "boxes-stacked", accent: "#3b82f6" },
    { id: "entry",     label: "Entry-Level Pack",
      description: "Stok murah <3jt untuk pasar massal & toko ramai.",
      units: 1000,  minBase:           0, maxBase:  2_999_999,
      icon: "warehouse",     accent: "#10b981" },
  ];

  /* Backwards-compat alias so any old code still referencing TIERS works. */
  const TIERS = PARTNER_TIERS;


  /* ---------- State helpers ---------- */
  function ensurePartnership() {
    const s = S();
    if (!s.partnerships) {
      s.partnerships = {
        unlockedGroups: ["apple"],   // unlocked brand-group ids
        currentTier: "bronze",
        purchaseHistory: [],
      };
    }
    // Part 18 migration: drop the old `unlockedBrands` (per-brand) shape.
    if (s.partnerships.unlockedBrands && !s.partnerships.unlockedGroups) {
      s.partnerships.unlockedGroups = ["apple"]; // recomputed by refresh below
      delete s.partnerships.unlockedBrands;
    }
    if (!s.partnershipsView) {
      s.partnershipsView = { tab: "apple", preGenerated: {} };
    }
    if (!s.partnershipsView.preGenerated) s.partnershipsView.preGenerated = {};
  }

  /** Calculate total revenue from the last 30 in-game days. */
  function getMonthlyRevenue() {
    const s = S();
    if (!Array.isArray(s.salesHistory)) return 0;
    const cutoff = s.currentDay - 30;
    let total = 0;
    s.salesHistory.forEach((sale) => {
      if (sale.day >= cutoff) total += (sale.salePrice || 0);
    });
    return total;
  }

  /** Determine current tier based on monthly revenue. */
  function resolveCurrentTier() {
    const rev = getMonthlyRevenue();
    let best = PARTNER_TIERS[0];
    for (const t of PARTNER_TIERS) {
      if (rev >= t.minRevenue) best = t;
    }
    return best;
  }

  /** Refresh unlocked brand-groups based on monthly revenue. */
  function refreshUnlockedGroups() {
    ensurePartnership();
    const s = S();
    const rev = getMonthlyRevenue();
    const unlocked = [];
    BRAND_GROUPS.forEach((g) => {
      if (rev >= g.minRevenue) unlocked.push(g.id);
    });
    s.partnerships.unlockedGroups = unlocked;
    s.partnerships.currentTier = resolveCurrentTier().id;
    window.FlippingTycoon.saveGame();
  }
  // Backwards-compat: external callers from Part 12 used this name.
  const refreshUnlockedBrands = refreshUnlockedGroups;

  /* ---------- Pre-generation cache (Part 18) ----------
   * For each (brandGroupId, tierPkgId) we lazily roll an array of
   * gadget references from the master DB filtered by the tier's
   * basePrice band AND the brand-group's brand list. The resulting
   * picks drive BOTH the dynamic cost shown in the UI AND the actual
   * inventory generated on purchase — so they always match.
   *
   * Stored at: state.partnershipsView.preGenerated[`${brand}:${tier}`]
   *   { picks: [{gadgetId, basePrice}, ...], rolledOnDay }
   */
  function cacheKey(groupId, tierPkgId) { return groupId + ":" + tierPkgId; }

  function eligiblePool(brandGroup, tierPkg) {
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    return GD.filter((g) =>
      brandGroup.brands.includes(g.brand) &&
      Number(g.basePrice) >= tierPkg.minBase &&
      Number(g.basePrice) <= tierPkg.maxBase
    );
  }

  function rollPicks(brandGroup, tierPkg) {
    const pool = eligiblePool(brandGroup, tierPkg);
    if (pool.length === 0) return [];
    const out = [];
    for (let i = 0; i < tierPkg.units; i++) {
      const g = pool[Math.floor(Math.random() * pool.length)];
      out.push({ gadgetId: g.id, basePrice: Number(g.basePrice) || 0 });
    }
    return out;
  }

  /** Get cached picks; roll if missing or if `force` requested. */
  function getCachedPicks(brandGroup, tierPkg, force) {
    ensurePartnership();
    const s = S();
    const key = cacheKey(brandGroup.id, tierPkg.id);
    const existing = s.partnershipsView.preGenerated[key];
    if (!force && existing && Array.isArray(existing.picks) && existing.picks.length > 0) {
      return existing.picks;
    }
    const picks = rollPicks(brandGroup, tierPkg);
    s.partnershipsView.preGenerated[key] = {
      picks,
      rolledOnDay: s.currentDay,
    };
    window.FlippingTycoon.saveGame();
    return picks;
  }

  function clearCachedPicks(brandGroupId, tierPkgId) {
    ensurePartnership();
    const s = S();
    delete s.partnershipsView.preGenerated[cacheKey(brandGroupId, tierPkgId)];
    window.FlippingTycoon.saveGame();
  }

  /** DYNAMIC: total cost = sum(basePrice across picks) * (1 - discount) */
  function computeDynamicCost(picks, partnerTier) {
    const totalReal = picks.reduce((s, p) => s + (Number(p.basePrice) || 0), 0);
    const discount = partnerTier ? Number(partnerTier.discount) || 0 : 0;
    return Math.max(0, Math.round(totalReal * (1 - discount)));
  }

  /** Per-brand summary of which tiers actually have eligible stock. */
  function summarizeBrandStock(brandGroup) {
    return TIER_PACKAGES.map((tp) => ({
      tierPkg: tp,
      poolSize: eligiblePool(brandGroup, tp).length,
    }));
  }

  /** Group rolled picks by gadgetId for compact UI summaries. */
  function summarizePicks(picks) {
    const counts = {};
    picks.forEach((p) => { counts[p.gadgetId] = (counts[p.gadgetId] || 0) + 1; });
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    return Object.entries(counts)
      .map(([gid, count]) => {
        const g = GD.find((x) => x.id === gid) || { model: gid, brand: "?", basePrice: 0 };
        return { id: gid, count, model: g.model, brand: g.brand, basePrice: Number(g.basePrice) || 0 };
      })
      .sort((a, b) => b.basePrice - a.basePrice);
  }

  function isGroupUnlocked(brandGroup) {
    return getMonthlyRevenue() >= brandGroup.minRevenue;
  }

  /* ---------- Purchase flow (Part 18) ---------- */
  function purchasePackage(brandGroupId, tierPkgId, bankKey) {
    ensurePartnership();
    const s = S();
    const brandGroup = BRAND_GROUPS.find((g) => g.id === brandGroupId);
    const tierPkg    = TIER_PACKAGES.find((t) => t.id === tierPkgId);
    if (!brandGroup) { showToast("Brand partner tidak ditemukan."); return false; }
    if (!tierPkg)    { showToast("Tier package tidak ditemukan.");  return false; }
    if (!isGroupUnlocked(brandGroup)) {
      showToast(`${brandGroup.label} belum unlock — butuh revenue ${fmt(brandGroup.minRevenue)}/bulan.`);
      return false;
    }

    // Use the picks the player JUST SAW in the UI (cached) — never re-roll
    // here, so the cost they paid matches the inventory they receive.
    const picks = getCachedPicks(brandGroup, tierPkg, /*force*/ false);
    if (!picks || picks.length === 0) {
      showToast(`${brandGroup.label} ${tierPkg.label}: stok kosong di tier ini.`);
      return false;
    }

    const tier = resolveCurrentTier();
    const totalCost = computeDynamicCost(picks, tier);

    if ((s.bankBalances[bankKey] || 0) < totalCost) {
      showToast(`Saldo ${bankKey} tidak cukup. Butuh ${fmt(totalCost)}.`);
      return false;
    }

    // Debit bank
    s.bankBalances[bankKey] -= totalCost;
    s.bankHistories[bankKey].push({
      type: "DEBIT",
      amount: totalCost,
      balanceAfter: s.bankBalances[bankKey],
      description: `Partnership: ${brandGroup.shortLabel} ${tierPkg.label} (${picks.length} unit, disc ${(tier.discount * 100).toFixed(0)}%)`,
      category: "partnership-purchase",
      day: s.currentDay,
      ts: Date.now(),
    });


    // Look up master tables for BNIB defaults
    const GADGET_DATABASE      = (window.GadgetData && window.GadgetData.GADGET_DATABASE)      || [];
    const COMPLETENESS_OPTIONS = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
    const DEFECT_OPTIONS       = (window.GadgetData && window.GadgetData.DEFECT_OPTIONS)       || [];

    /* B2B Guarantee — Fullset (1.0) + Mulus (1.0). We deep-spread from
     * the master tables so haggleBonus / haggleAcceptRate / desc stay
     * canonical, then force the multipliers to exactly 1.0. */
    const fullsetMaster = COMPLETENESS_OPTIONS.find((c) => c.short === "Fullset");
    const mulusMaster   = DEFECT_OPTIONS.find((d) => d.short === "Mulus");

    const BNIB_COMPLETENESS = fullsetMaster
      ? { ...fullsetMaster, multiplier: 1.0 }
      : { type: "Fullset", short: "Fullset", multiplier: 1.0, haggleBonus: 0.0, desc: "BNIB — Brand New In Box (Partnership)" };

    const BNIB_DEFECT = mulusMaster
      ? { ...mulusMaster, multiplier: 1.0 }
      : { type: "Mulus / No Minus", short: "Mulus", multiplier: 1.0, severity: 0, haggleAcceptRate: 0.10, desc: "BNIB — Brand New, Segel" };

    /* Part 34 — Proportional Cost Allocation kept intact */
    const totalRealBaseValue = picks.reduce((sum, p) => sum + (Number(p.basePrice) || 0), 0);
    let discountRatio = 0;
    if (totalRealBaseValue > 0) {
      discountRatio = (totalRealBaseValue - totalCost) / totalRealBaseValue;
    }
    const SAFETY_DISCOUNT = 0.25;

    const items = [];
    let allocatedSum = 0;

    picks.forEach((pick) => {
      const gadget = GADGET_DATABASE.find((g) => g.id === pick.gadgetId);
      if (!gadget) return; // skip — DB shouldn't change but be safe
      const basePrice = Number(gadget.basePrice) || 0;

      let buyPrice = Math.round(basePrice * (1 - discountRatio));
      const marginCeiling = Math.round(basePrice * 0.95);
      if (buyPrice >= basePrice) {
        buyPrice = Math.round(basePrice * (1 - SAFETY_DISCOUNT));
      } else if (buyPrice > marginCeiling) {
        buyPrice = marginCeiling;
      }
      if (buyPrice < 50_000) buyPrice = 50_000;
      buyPrice = Math.round(buyPrice / 50_000) * 50_000;
      allocatedSum += buyPrice;

      items.push({
        id: uid("ptn"),
        gadgetId: gadget.id,
        name: gadget.model,
        brand: gadget.brand,
        icon: gadget.icon,
        accent: gadget.accent,
        basePrice,
        year: gadget.year,
        specs: { ...(gadget.specs || { ram: "8GB", rom: "128GB", color: "Black" }) },
        completeness: { ...BNIB_COMPLETENESS },
        defect: { ...BNIB_DEFECT },
        isExInter: false,
        imeiStatus: null,
        buyPrice,
        totalRepairCost: 0,
        buyDay: s.currentDay,
        source: "partnership",
      });
    });

    // Diagnostic log so we can sanity-check the allocation in DevTools
    if (typeof console !== "undefined") {
      console.log(
        "[Partnership] %s %s: totalCost=%s, realBase=%s, ratio=%s%%, allocated=%s, delta=%s",
        brandGroup.shortLabel,
        tierPkg.label,
        totalCost.toLocaleString("id-ID"),
        totalRealBaseValue.toLocaleString("id-ID"),
        (discountRatio * 100).toFixed(2),
        allocatedSum.toLocaleString("id-ID"),
        (allocatedSum - totalCost).toLocaleString("id-ID")
      );
    }


    // Add to warehouse if available, otherwise inventory.
    // Part 16 — defensively run every generated item through the
    // global normalizer so even a future regression can never store
    // an item missing defect.multiplier / completeness.multiplier.
    const normalize = window.FlippingTycoon && window.FlippingTycoon.normalizeInventoryItem;
    if (window.Warehouse && Array.isArray(s.warehouse)) {
      items.forEach((it) => { if (normalize) normalize(it); s.warehouse.push(it); });
    } else {
      items.forEach((it) => { if (normalize) normalize(it); s.inventory.push(it); });
    }

    // Record purchase history
    s.partnerships.purchaseHistory.unshift({
      id: uid("ph"),
      brandGroupId: brandGroup.id,
      tierPkgId: tierPkg.id,
      packageId: brandGroup.id + "-" + tierPkg.id,        // back-compat aggregate id
      packageName: brandGroup.shortLabel + " " + tierPkg.label,
      units: items.length,
      totalCost,
      tier: tier.id,
      discount: tier.discount,
      bank: bankKey,
      day: s.currentDay,
      ts: Date.now(),
    });
    if (s.partnerships.purchaseHistory.length > 50) s.partnerships.purchaseHistory.length = 50;

    // Drop the cached picks so the next visit re-rolls a fresh batch.
    clearCachedPicks(brandGroup.id, tierPkg.id);

    window.FlippingTycoon.saveGame();

    const purchaseLabel = `${brandGroup.shortLabel} ${tierPkg.label}`;
    showToast(`✅ ${purchaseLabel} purchased! ${items.length} unit masuk Warehouse via ${bankKey}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Partnership Order: ${purchaseLabel}`,
        message: `${items.length} unit gadget dikirim ke Warehouse. Total ${fmt(totalCost)} dari ${bankKey} (disc ${(tier.discount * 100).toFixed(0)}%).`,
        actionPage: "partnerships",
        actor: "Partnership Hub",
        icon: "handshake",
      });
    }
    return true;
  }


  /* =========================================================
   * Page renderer (Part 18 — brand-specific tabs)
   * ========================================================= */
  function renderPartnershipsPage() {
    ensurePartnership();
    refreshUnlockedGroups();
    const s = S();
    const wrap = document.createElement("div");

    const monthlyRev = getMonthlyRevenue();
    const tier = resolveCurrentTier();

    // Header card with monthly revenue + current partner tier badge
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-handshake text-purple-600"></i> Partnership Hub</h3>
          <p class="text-sm text-gray-500">Kontrak B2B resmi. Stok BNIB Fullset / Mulus, garansi distributor.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Monthly Revenue (30d)</p>
          <p class="font-semibold text-sm text-emerald-700">${fmt(monthlyRev)}</p>
          <p class="text-xs mt-1"><span class="partnership-tier-badge" style="background:${tier.color}">${tier.label} &middot; ${(tier.discount * 100).toFixed(0)}% off</span></p>
        </div>
      </div>
      <div class="partnership-tier-strip">
        ${PARTNER_TIERS.map((t) => {
          const active = monthlyRev >= t.minRevenue;
          const reached = active && t.id === tier.id;
          return `<div class="partnership-tier-pip ${active ? "active" : "locked"} ${reached ? "current" : ""}"
                       title="${t.label} — ${(t.discount * 100).toFixed(0)}% off &middot; min ${fmt(t.minRevenue)}/bulan">
            <span class="dot" style="background:${active ? t.color : "#d1d5db"}"></span>
            <span class="lab">${t.label.replace(" Partner","")} ${(t.discount * 100).toFixed(0)}%</span>
          </div>`;
        }).join("")}
      </div>
    `;
    wrap.appendChild(header);

    // Tabs: 3 brand groups + History
    const tabs = document.createElement("div");
    tabs.className = "subtabs subtabs-scroll";
    const tabItems = [
      ...BRAND_GROUPS.map((g) => ({ id: g.id, label: g.shortLabel, icon: g.icon, locked: !isGroupUnlocked(g) })),
      { id: "history", label: "History", icon: "clock-rotate-left", locked: false },
    ];
    // Auto-correct legacy tab id from Part 12 ("brands"/"packages")
    const validIds = tabItems.map((t) => t.id);
    if (!validIds.includes(s.partnershipsView.tab)) {
      s.partnershipsView.tab = "apple";
    }
    tabItems.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.partnershipsView.tab === t.id ? "active" : ""} ${t.locked ? "subtab-locked" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}${t.locked ? ' <i class="fa-solid fa-lock text-xs ml-1"></i>' : ""}`;
      btn.addEventListener("click", () => {
        s.partnershipsView.tab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    // Tab content
    if (s.partnershipsView.tab === "history") {
      wrap.appendChild(renderHistoryTab());
    } else {
      const grp = BRAND_GROUPS.find((g) => g.id === s.partnershipsView.tab) || BRAND_GROUPS[0];
      wrap.appendChild(renderBrandGroupTab(grp, tier, monthlyRev));
    }
    return wrap;
  }


  /* ---------- Brand-Group Tab (Part 18) ---------- */
  function renderBrandGroupTab(brandGroup, partnerTier, monthlyRev) {
    const wrap = document.createElement("div");
    const unlocked = isGroupUnlocked(brandGroup);

    // Brand-group hero card
    const hero = document.createElement("div");
    hero.className = "fb-card partnership-group-hero";
    hero.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="partnership-group-icon" style="background:${unlocked ? brandGroup.accent : "#9ca3af"}">
          <i class="fa-solid fa-${brandGroup.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold">${brandGroup.label}</h3>
          <p class="text-xs text-gray-500">${brandGroup.tagline}</p>
          <p class="text-xs ${unlocked ? "text-emerald-600" : "text-rose-600"} mt-1">
            ${unlocked
              ? "✓ Unlocked &middot; kontrak aktif"
              : `🔒 Butuh ${fmt(brandGroup.minRevenue)} revenue / 30 hari`}
          </p>
        </div>
      </div>
    `;
    wrap.appendChild(hero);

    if (!unlocked) {
      const need = brandGroup.minRevenue - monthlyRev;
      const lockCard = document.createElement("div");
      lockCard.className = "fb-card text-center py-10";
      lockCard.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center text-rose-500 text-2xl mb-3">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h3>${brandGroup.label} masih terkunci</h3>
        <p class="text-sm text-gray-500 mt-1">Naikin revenue 30 hari terakhir minimal <b>${fmt(brandGroup.minRevenue)}</b>.</p>
        <p class="text-xs text-gray-400 mt-2">Kurang ${fmt(Math.max(0, need))} lagi.</p>
      `;
      wrap.appendChild(lockCard);
      return wrap;
    }

    // Three tier-package cards
    TIER_PACKAGES.forEach((tierPkg) => {
      wrap.appendChild(renderPackageCard(brandGroup, tierPkg, partnerTier));
    });
    return wrap;
  }


  /* ---------- Package Card with dynamic cost (Part 18) ---------- */
  function renderPackageCard(brandGroup, tierPkg, partnerTier) {
    const card = document.createElement("div");
    const pool = eligiblePool(brandGroup, tierPkg);

    if (pool.length === 0) {
      card.className = "fb-card partnership-package-card locked";
      card.innerHTML = `
        <div class="partnership-package-header">
          <div class="partnership-package-icon" style="background:${tierPkg.accent}20;color:${tierPkg.accent}">
            <i class="fa-solid fa-${tierPkg.icon}"></i>
          </div>
          <div>
            <h4 class="font-bold">${tierPkg.label}</h4>
            <p class="text-xs text-gray-500">${tierPkg.description}</p>
          </div>
        </div>
        <p class="text-xs text-rose-600 mt-2">
          🔒 ${brandGroup.shortLabel} belum punya stok di tier ini
          (basePrice ${fmt(tierPkg.minBase)}${isFinite(tierPkg.maxBase) ? "–" + fmt(tierPkg.maxBase) : "+"}).
        </p>
      `;
      return card;
    }

    // Dynamic pre-generation: roll picks (cached per session) and price them
    const picks = getCachedPicks(brandGroup, tierPkg, /*force*/ false);
    const totalReal = picks.reduce((s, p) => s + (Number(p.basePrice) || 0), 0);
    const totalCost = computeDynamicCost(picks, partnerTier);
    const summary = summarizePicks(picks);

    card.className = "fb-card partnership-package-card";
    card.innerHTML = `
      <div class="partnership-package-header">
        <div class="partnership-package-icon" style="background:${tierPkg.accent}20;color:${tierPkg.accent}">
          <i class="fa-solid fa-${tierPkg.icon}"></i>
        </div>
        <div>
          <h4 class="font-bold">${brandGroup.shortLabel} ${tierPkg.label}</h4>
          <p class="text-xs text-gray-500">${tierPkg.description}</p>
          <p class="text-xs text-gray-400 mt-1">
            Filter: basePrice ${fmt(tierPkg.minBase)}${isFinite(tierPkg.maxBase) ? "–" + fmt(tierPkg.maxBase) : "+"}
            &middot; pool ${pool.length} model
          </p>
        </div>
      </div>
      <div class="partnership-package-stats">
        <div><span>Units</span><b>${picks.length.toLocaleString()}</b></div>
        <div><span>Total Real Base</span><b>${fmt(totalReal)}</b></div>
        <div><span>Your Discount</span><b class="text-emerald-700">${(partnerTier.discount * 100).toFixed(0)}%</b></div>
        <div><span>Total Package Cost</span><b class="text-blue-700">${fmt(totalCost)}</b></div>
      </div>
      <div class="partnership-package-mix">
        <p class="partnership-mix-label"><i class="fa-solid fa-list"></i> Stock generated (top models):</p>
        <ul class="partnership-mix-list">
          ${summary.slice(0, 4).map((row) => `
            <li>
              <span class="mix-count">${row.count}×</span>
              <span class="mix-name">${row.brand} ${row.model}</span>
              <span class="mix-base">${fmt(row.basePrice)}</span>
            </li>
          `).join("")}
          ${summary.length > 4 ? `<li class="mix-more">+ ${summary.length - 4} model lain…</li>` : ""}
        </ul>
      </div>
      <div class="partnership-card-actions">
        <button class="partnership-buy-btn" data-act="buy">
          <i class="fa-solid fa-cart-shopping"></i> Order — ${fmt(totalCost)}
        </button>
        <button class="partnership-refresh-btn" data-act="refresh" title="Roll ulang stok">
          <i class="fa-solid fa-rotate"></i> Refresh Stock
        </button>
      </div>
    `;
    card.querySelector('[data-act="buy"]').addEventListener("click", () => openBuyModal(brandGroup, tierPkg));
    card.querySelector('[data-act="refresh"]').addEventListener("click", () => {
      getCachedPicks(brandGroup, tierPkg, /*force*/ true);
      window.FlippingTycoon.renderActivePage();
    });
    return card;
  }


  /* ---------- Purchase Modal (Part 18) ---------- */
  function openBuyModal(brandGroup, tierPkg) {
    const tier = resolveCurrentTier();
    const picks = getCachedPicks(brandGroup, tierPkg, /*force*/ false);
    const cost = computeDynamicCost(picks, tier);
    const s = S();

    const modal = document.querySelector("#partnership-buy-modal");
    if (!modal) { showToast("Modal not found."); return; }
    const body = modal.querySelector("#partnership-buy-body");
    const titleEl = modal.querySelector("#partnership-buy-title");
    const closeBtn = modal.querySelector("#partnership-buy-cancel");

    titleEl.textContent = `Order: ${brandGroup.shortLabel} ${tierPkg.label}`;

    const banks = ["Mandiri", "BCA", "BNI"];
    body.innerHTML = `
      <div class="mb-3">
        <p class="text-sm text-gray-600">Package: <b>${brandGroup.shortLabel} ${tierPkg.label}</b> (${picks.length} unit)</p>
        <p class="text-sm text-gray-600">Filter basePrice: ${fmt(tierPkg.minBase)}${isFinite(tierPkg.maxBase) ? "–" + fmt(tierPkg.maxBase) : "+"}</p>
        <p class="text-sm text-gray-600">Total biaya: <b class="text-blue-700">${fmt(cost)}</b> (disc ${(tier.discount * 100).toFixed(0)}% &middot; tier ${tier.label})</p>
        <p class="text-xs text-emerald-600 mt-1">Stok BNIB &middot; Fullset Mulus &middot; auto masuk Warehouse.</p>
      </div>
      <p class="modal-label" style="margin-bottom:4px">Pilih rekening pembayaran:</p>
      <div class="partnership-bank-options">
        ${banks.map((b) => {
          const bal = s.bankBalances[b] || 0;
          const enough = bal >= cost;
          return `
            <button class="partnership-bank-opt ${enough ? "" : "disabled"}" data-bank="${b}" ${enough ? "" : "disabled"}>
              <div class="partnership-bank-opt-left">
                <span class="partnership-bank-logo">${b.charAt(0)}</span>
                <div>
                  <p class="font-semibold text-sm">${b}</p>
                  <p class="text-xs text-gray-500">Saldo: ${fmt(bal)}</p>
                </div>
              </div>
              <span class="text-xs ${enough ? "text-emerald-600" : "text-rose-500"}">
                ${enough ? "✓ Cukup" : "✗ Kurang"}
              </span>
            </button>`;
        }).join("")}
      </div>
      <p id="partnership-buy-error" class="text-xs text-rose-600 font-semibold mt-2"></p>
    `;

    body.querySelectorAll(".partnership-bank-opt:not(.disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bank = btn.dataset.bank;
        if (purchasePackage(brandGroup.id, tierPkg.id, bank)) {
          closePartnershipModal();
          window.FlippingTycoon.renderActivePage();
        }
      });
    });

    closeBtn.onclick = closePartnershipModal;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closePartnershipModal() {
    const modal = document.querySelector("#partnership-buy-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }


  /* ---------- History Tab ---------- */
  function renderHistoryTab() {
    ensurePartnership();
    const s = S();
    const history = s.partnerships.purchaseHistory || [];
    const wrap = document.createElement("div");

    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-purple-50 flex items-center justify-center text-purple-500 text-2xl mb-3">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3>Belum ada pembelian</h3>
        <p class="text-sm text-gray-500">Order Bulk Package di tab Packages untuk mulai stocking via partnership.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    const card = document.createElement("div");
    card.className = "fb-card";
    card.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-purple-500"></i> Purchase History</h3>`;
    const list = document.createElement("div");
    list.className = "bulk-log-list";

    history.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "bulk-log-row";
      row.innerHTML = `
        <div class="bulk-log-icon" style="background:#6366f122;color:#6366f1">
          <i class="fa-solid fa-handshake"></i>
        </div>
        <div class="bulk-log-body">
          <p class="bulk-log-title">${entry.packageName}</p>
          <p class="bulk-log-meta">Day ${entry.day} &middot; ${entry.units} unit &middot; ${fmt(entry.totalCost)} from ${entry.bank} &middot; Tier: ${entry.tier} (${(entry.discount * 100).toFixed(0)}% off)</p>
        </div>
      `;
      list.appendChild(row);
    });
    card.appendChild(list);
    wrap.appendChild(card);
    return wrap;
  }

  /* ---------- Toast helper ---------- */
  function showToast(msg) {
    if (window.Notifications && window.Notifications.toast) {
      window.Notifications.toast(msg);
    } else {
      alert(msg);
    }
  }

  /* ---------- Public API ---------- */
  window.Partnerships = {
    renderPartnershipsPage,
    refreshUnlockedGroups,
    refreshUnlockedBrands,    // back-compat alias
    getMonthlyRevenue,
    resolveCurrentTier,
    // Part 18 — new shape
    BRAND_GROUPS,
    TIER_PACKAGES,
    PARTNER_TIERS,
    eligiblePool,
    getCachedPicks,
    computeDynamicCost,
    // Back-compat aliases for anything that still imports the Part 12 names
    TIERS: PARTNER_TIERS,
  };
})();
