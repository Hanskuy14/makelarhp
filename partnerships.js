/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 12 — Strategic Brand Partnerships & Tiered Wholesale
 *
 * Partnership Hub: Players unlock brand partnerships by hitting
 * Minimum Monthly Revenue thresholds. Higher tiers grant access
 * to exclusive Bulk Order Packages (pre-defined bundles of
 * 50/200/1000 units at discounted wholesale prices).
 *
 * Payment is made upfront from one of the player's bank accounts.
 * Purchased units go directly into the Warehouse.
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  /* ---------- Partner Brands ---------- */
  const BRANDS = [
    { id: "apple",   name: "Apple",   icon: "apple",          accent: "#1c1c1e", minRevenue: 0 },
    { id: "samsung", name: "Samsung", icon: "mobile-screen",  accent: "#1428a0", minRevenue: 50_000_000 },
    { id: "xiaomi",  name: "Xiaomi",  icon: "mobile-button",  accent: "#ff6700", minRevenue: 30_000_000 },
    { id: "oppo",    name: "Oppo",    icon: "mobile-screen",  accent: "#1a8c37", minRevenue: 40_000_000 },
    { id: "vivo",    name: "Vivo",    icon: "mobile-screen",  accent: "#415fff", minRevenue: 35_000_000 },
  ];


  /* ---------- Partnership Tiers ---------- */
  const TIERS = [
    { id: "bronze",   label: "Bronze Partner",   minRevenue: 0,           discount: 0.05, color: "#cd7f32" },
    { id: "silver",   label: "Silver Partner",   minRevenue: 100_000_000, discount: 0.10, color: "#9ca3af" },
    { id: "gold",     label: "Gold Partner",     minRevenue: 300_000_000, discount: 0.15, color: "#f59e0b" },
    { id: "platinum", label: "Platinum Partner", minRevenue: 750_000_000, discount: 0.20, color: "#6366f1" },
  ];

  /* ---------- Bulk Order Packages ---------- */
  const PACKAGES = [
    {
      id: "flagship-bundle",
      name: "The Flagship Bundle",
      description: "50 unit flagship terbaru. Margin tebal, demand tinggi.",
      units: 50,
      tier: "bronze",
      basePricePerUnit: 12_000_000,
      icon: "crown",
      accent: "#f59e0b",
    },
    {
      id: "midrange-kit",
      name: "Mid-Range Budget Kit",
      description: "200 unit HP mid-range populer. Volume besar, cepat laku.",
      units: 200,
      tier: "silver",
      basePricePerUnit: 4_500_000,
      icon: "boxes-stacked",
      accent: "#3b82f6",
    },
    {
      id: "mega-stock",
      name: "Mega Stock Pack",
      description: "1000 unit campuran brand. Untuk pemain besar yang siap scale.",
      units: 1000,
      tier: "gold",
      basePricePerUnit: 3_200_000,
      icon: "warehouse",
      accent: "#10b981",
    },
  ];


  /* ---------- State helpers ---------- */
  function ensurePartnership() {
    const s = S();
    if (!s.partnerships) {
      s.partnerships = {
        unlockedBrands: ["apple"], // Apple available from start (minRevenue: 0)
        currentTier: "bronze",
        purchaseHistory: [],
      };
    }
    if (!s.partnershipsView) {
      s.partnershipsView = { tab: "brands" };
    }
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
    let best = TIERS[0];
    for (const t of TIERS) {
      if (rev >= t.minRevenue) best = t;
    }
    return best;
  }

  /** Refresh unlocked brands based on monthly revenue. */
  function refreshUnlockedBrands() {
    ensurePartnership();
    const s = S();
    const rev = getMonthlyRevenue();
    const unlocked = [];
    BRANDS.forEach((b) => {
      if (rev >= b.minRevenue) unlocked.push(b.id);
    });
    s.partnerships.unlockedBrands = unlocked;
    s.partnerships.currentTier = resolveCurrentTier().id;
    window.FlippingTycoon.saveGame();
  }


  /** Check if player can afford a package with a specific bank. */
  function canAfford(pkg, bankKey) {
    const s = S();
    const tier = resolveCurrentTier();
    const totalCost = computePackageCost(pkg, tier);
    return (s.bankBalances[bankKey] || 0) >= totalCost;
  }

  /** Compute the final cost of a package after tier discount. */
  function computePackageCost(pkg, tier) {
    const discount = tier ? tier.discount : 0;
    return Math.round(pkg.basePricePerUnit * pkg.units * (1 - discount));
  }

  /** Check if player's tier qualifies for a package. */
  function isTierQualified(pkg) {
    const tierOrder = TIERS.map((t) => t.id);
    const playerIdx = tierOrder.indexOf(resolveCurrentTier().id);
    const reqIdx = tierOrder.indexOf(pkg.tier);
    return playerIdx >= reqIdx;
  }

  /* ---------- Purchase flow ---------- */
  function purchasePackage(pkgId, bankKey) {
    ensurePartnership();
    const s = S();
    const pkg = PACKAGES.find((p) => p.id === pkgId);
    if (!pkg) { showToast("Package tidak ditemukan."); return false; }
    if (!isTierQualified(pkg)) { showToast("Tier kamu belum cukup untuk package ini."); return false; }

    const tier = resolveCurrentTier();
    const totalCost = computePackageCost(pkg, tier);

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
      description: `Partnership: ${pkg.name} (${pkg.units} unit, disc ${(tier.discount * 100).toFixed(0)}%)`,
      category: "partnership-purchase",
      day: s.currentDay,
      ts: Date.now(),
    });


    // Generate items and add to warehouse
    const GADGET_DATABASE = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    const COMPLETENESS_OPTIONS = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
    const DEFECT_OPTIONS = (window.GadgetData && window.GadgetData.DEFECT_OPTIONS) || [];

    // Filter gadgets by brand matching the package context
    const brandFilter = s.partnerships.unlockedBrands;
    const eligibleGadgets = GADGET_DATABASE.filter((g) =>
      brandFilter.includes(g.brand.toLowerCase())
    );
    const fallbackGadgets = GADGET_DATABASE.length > 0 ? GADGET_DATABASE : [];
    const pool = eligibleGadgets.length > 0 ? eligibleGadgets : fallbackGadgets;

    if (pool.length === 0) {
      showToast("Gadget database kosong. Tidak bisa generate stock.");
      // Refund
      s.bankBalances[bankKey] += totalCost;
      s.bankHistories[bankKey].pop();
      return false;
    }

    /* ---------------- BNIB defaults (Part 15 fix) ----------------
     * Partnership stock is Brand-New-In-Box from the principal brand.
     * Hardcode condition modifiers to 1.0 so price math NEVER goes NaN.
     * Use the canonical entries from the master tables when available
     * (so any extra fields like haggleBonus / haggleAcceptRate / desc
     * stay consistent with the rest of the inventory pipeline).
     * --------------------------------------------------------------- */
    const fullsetMaster = COMPLETENESS_OPTIONS.find((c) => c.short === "Fullset");
    const mulusMaster   = DEFECT_OPTIONS.find((d) => d.short === "Mulus");

    const BNIB_COMPLETENESS = fullsetMaster
      ? { ...fullsetMaster, multiplier: 1.0 }
      : { type: "Fullset", short: "Fullset", multiplier: 1.0, haggleBonus: 0.0, desc: "BNIB — Brand New In Box (Partnership)" };

    const BNIB_DEFECT = mulusMaster
      ? { ...mulusMaster, multiplier: 1.0 }
      : { type: "Mulus / No Minus", short: "Mulus", multiplier: 1.0, severity: 0, haggleAcceptRate: 0.10, desc: "BNIB — Brand New, Segel" };

    const items = [];
    const unitCost = Math.round(totalCost / pkg.units);
    for (let i = 0; i < pkg.units; i++) {
      const gadget = pool[Math.floor(Math.random() * pool.length)];
      const item = {
        id: uid("ptn"),
        gadgetId: gadget.id,
        name: gadget.model,
        brand: gadget.brand,
        icon: gadget.icon,
        accent: gadget.accent,
        // Strictly inherit basePrice + specs + year from the master GADGET_DB
        basePrice: Number(gadget.basePrice) || 0,
        year: gadget.year,
        specs: { ...(gadget.specs || { ram: "8GB", rom: "128GB", color: "Black" }) },
        // BNIB hardcoded multipliers (1.0 / 1.0)
        completeness: { ...BNIB_COMPLETENESS },
        defect: { ...BNIB_DEFECT },
        isExInter: false,
        imeiStatus: null,
        buyPrice: unitCost,
        totalRepairCost: 0,
        buyDay: s.currentDay,
        source: "partnership",
      };
      items.push(item);
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
      packageId: pkg.id,
      packageName: pkg.name,
      units: pkg.units,
      totalCost,
      tier: tier.id,
      discount: tier.discount,
      bank: bankKey,
      day: s.currentDay,
      ts: Date.now(),
    });
    if (s.partnerships.purchaseHistory.length > 50) s.partnerships.purchaseHistory.length = 50;

    window.FlippingTycoon.saveGame();

    showToast(`✅ ${pkg.name} purchased! ${pkg.units} unit masuk Warehouse via ${bankKey}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Partnership Order: ${pkg.name}`,
        message: `${pkg.units} unit gadget dikirim ke Warehouse. Total ${fmt(totalCost)} dari ${bankKey} (disc ${(tier.discount * 100).toFixed(0)}%).`,
        actionPage: "partnerships",
        actor: "Partnership Hub",
        icon: "handshake",
      });
    }
    return true;
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderPartnershipsPage() {
    ensurePartnership();
    refreshUnlockedBrands();
    const s = S();
    const wrap = document.createElement("div");

    const monthlyRev = getMonthlyRevenue();
    const tier = resolveCurrentTier();

    // Header
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-handshake text-purple-600"></i> Partnership Hub</h3>
          <p class="text-sm text-gray-500">Kerjasama brand resmi. Beli bulk langsung dari principal.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Monthly Revenue (30d)</p>
          <p class="font-semibold text-sm text-emerald-700">${fmt(monthlyRev)}</p>
          <p class="text-xs mt-1"><span class="partnership-tier-badge" style="background:${tier.color}">${tier.label}</span></p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Sub-tabs
    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    const tabItems = [
      { id: "brands", label: "Brands", icon: "building" },
      { id: "packages", label: "Bulk Packages", icon: "boxes-stacked" },
      { id: "history", label: "Purchase History", icon: "clock-rotate-left" },
    ];
    tabItems.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.partnershipsView.tab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}`;
      btn.addEventListener("click", () => {
        s.partnershipsView.tab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    // Tab content
    if (s.partnershipsView.tab === "packages") {
      wrap.appendChild(renderPackagesTab(tier));
    } else if (s.partnershipsView.tab === "history") {
      wrap.appendChild(renderHistoryTab());
    } else {
      wrap.appendChild(renderBrandsTab(monthlyRev));
    }
    return wrap;
  }


  /* ---------- Brands Tab ---------- */
  function renderBrandsTab(monthlyRev) {
    const wrap = document.createElement("div");
    const s = S();

    // Tier progress card
    const tierCard = document.createElement("div");
    tierCard.className = "fb-card";
    tierCard.innerHTML = `
      <h3 class="mb-3"><i class="fa-solid fa-trophy text-amber-500"></i> Partner Tier Progress</h3>
      <div class="partnership-tier-grid">
        ${TIERS.map((t) => {
          const active = monthlyRev >= t.minRevenue;
          return `
            <div class="partnership-tier-item ${active ? "active" : "locked"}">
              <div class="partnership-tier-dot" style="background:${active ? t.color : "#d1d5db"}"></div>
              <div>
                <p class="font-semibold text-sm" style="color:${active ? t.color : "#9ca3af"}">${t.label}</p>
                <p class="text-xs text-gray-500">Min. Revenue: ${fmt(t.minRevenue)}</p>
                <p class="text-xs text-gray-500">Discount: ${(t.discount * 100).toFixed(0)}%</p>
              </div>
            </div>`;
        }).join("")}
      </div>
    `;
    wrap.appendChild(tierCard);

    // Brands list
    const brandsCard = document.createElement("div");
    brandsCard.className = "fb-card";
    brandsCard.innerHTML = `<h3 class="mb-3"><i class="fa-solid fa-building text-blue-500"></i> Available Brands</h3>`;
    const grid = document.createElement("div");
    grid.className = "partnership-brands-grid";

    BRANDS.forEach((brand) => {
      const unlocked = monthlyRev >= brand.minRevenue;
      const card = document.createElement("div");
      card.className = `partnership-brand-card ${unlocked ? "unlocked" : "locked"}`;
      card.innerHTML = `
        <div class="partnership-brand-icon" style="background:${unlocked ? brand.accent : "#e5e7eb"}">
          <i class="fa-solid fa-${brand.icon}" style="color:${unlocked ? "#fff" : "#9ca3af"}"></i>
        </div>
        <div class="partnership-brand-info">
          <p class="font-semibold">${brand.name}</p>
          <p class="text-xs ${unlocked ? "text-emerald-600" : "text-gray-500"}">
            ${unlocked ? "✓ Unlocked" : `🔒 Need ${fmt(brand.minRevenue)} monthly revenue`}
          </p>
        </div>
      `;
      grid.appendChild(card);
    });
    brandsCard.appendChild(grid);
    wrap.appendChild(brandsCard);
    return wrap;
  }


  /* ---------- Packages Tab ---------- */
  function renderPackagesTab(currentTier) {
    const wrap = document.createElement("div");
    const s = S();

    if (PACKAGES.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `<p class="text-gray-500">Tidak ada package tersedia.</p>`;
      wrap.appendChild(empty);
      return wrap;
    }

    PACKAGES.forEach((pkg) => {
      const qualified = isTierQualified(pkg);
      const cost = computePackageCost(pkg, currentTier);
      const card = document.createElement("div");
      card.className = `fb-card partnership-package-card ${qualified ? "" : "locked"}`;
      card.innerHTML = `
        <div class="partnership-package-header">
          <div class="partnership-package-icon" style="background:${pkg.accent}20;color:${pkg.accent}">
            <i class="fa-solid fa-${pkg.icon}"></i>
          </div>
          <div>
            <h4 class="font-bold">${pkg.name}</h4>
            <p class="text-xs text-gray-500">${pkg.description}</p>
          </div>
        </div>
        <div class="partnership-package-stats">
          <div><span>Units</span><b>${pkg.units.toLocaleString()}</b></div>
          <div><span>Base / unit</span><b>${fmt(pkg.basePricePerUnit)}</b></div>
          <div><span>Your Discount</span><b class="text-emerald-700">${(currentTier.discount * 100).toFixed(0)}%</b></div>
          <div><span>Total Cost</span><b class="text-blue-700">${fmt(cost)}</b></div>
        </div>
        <div class="partnership-package-req">
          <span class="text-xs ${qualified ? "text-emerald-600" : "text-rose-600"}">
            ${qualified ? "✓ Tier qualified" : `🔒 Requires ${TIERS.find((t) => t.id === pkg.tier).label}`}
          </span>
        </div>
        ${qualified ? `<button class="partnership-buy-btn" data-pkg="${pkg.id}"><i class="fa-solid fa-cart-shopping"></i> Order Package</button>` : `<button class="partnership-buy-btn" disabled><i class="fa-solid fa-lock"></i> Tier Too Low</button>`}
      `;
      if (qualified) {
        card.querySelector(".partnership-buy-btn").addEventListener("click", () => openBuyModal(pkg));
      }
      wrap.appendChild(card);
    });
    return wrap;
  }


  /* ---------- Purchase Modal ---------- */
  function openBuyModal(pkg) {
    const tier = resolveCurrentTier();
    const cost = computePackageCost(pkg, tier);
    const s = S();

    // Re-use the generic staff-bank-modal for bank picking
    const modal = document.querySelector("#partnership-buy-modal");
    if (!modal) { showToast("Modal not found."); return; }
    const body = modal.querySelector("#partnership-buy-body");
    const titleEl = modal.querySelector("#partnership-buy-title");
    const closeBtn = modal.querySelector("#partnership-buy-cancel");

    titleEl.textContent = `Order: ${pkg.name}`;

    const banks = ["Mandiri", "BCA", "BNI"];
    body.innerHTML = `
      <div class="mb-3">
        <p class="text-sm text-gray-600">Package: <b>${pkg.name}</b> (${pkg.units} unit)</p>
        <p class="text-sm text-gray-600">Total biaya: <b class="text-blue-700">${fmt(cost)}</b> (disc ${(tier.discount * 100).toFixed(0)}%)</p>
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
        if (purchasePackage(pkg.id, bank)) {
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
    refreshUnlockedBrands,
    getMonthlyRevenue,
    resolveCurrentTier,
    BRANDS,
    TIERS,
    PACKAGES,
  };
})();
