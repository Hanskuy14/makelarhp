/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 5 — Inventory: Owned tab + Active Listings tab
 * ========================================================= */

(function () {
  const PLATFORM_FEE_BASE = 0.05; // 5% (lowered to 2% with FB Paid Ads upgrade)

  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  function platformFeeRate() {
    return window.Repair ? window.Repair.platformFeeRate() : PLATFORM_FEE_BASE;
  }
  function isLocked(item) {
    return window.Repair ? window.Repair.isLocked(item) : false;
  }

  function gadgetIconHtml(item, sizeClass = "text-5xl") {
    const accent = (item.accent) || "#1c1c1e";
    const iconName = (item.icon === "tablet") ? "tablet-screen-button" : "mobile-screen-button";
    return `<i class="fa-solid fa-${iconName} ${sizeClass}" style="color:${accent}"></i>`;
  }

  /* ---------- Page renderer with sub-tabs ---------- */
  function renderInventoryPage() {
    const wrap = document.createElement("div");
    const s = S();
    if (!s.inventoryView) s.inventoryView = { activeTab: "owned" };

    const ownedCount = (s.inventory || []).length;
    const listings = s.activeListings || [];
    const pendingOffers = listings.filter((l) => l.negotiationState === "offer-pending").length;

    // Header card
    const header = document.createElement("div");
    header.className = "fb-card";
    const feePct = (platformFeeRate() * 100).toFixed(0);
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2">
            <i class="fa-solid fa-boxes-stacked text-amber-500"></i> Inventory
          </h3>
          <p class="text-sm text-gray-500">${ownedCount} owned &middot; ${listings.length} active listings ${pendingOffers > 0 ? `&middot; <b class="text-rose-600">${pendingOffers} new offer${pendingOffers > 1 ? "s" : ""}</b>` : ""}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Platform fee</p>
          <p class="font-semibold text-sm">${feePct}% (0% with Priority)${s.upgrades && s.upgrades.fbPaidAds ? " &middot; <span class='text-emerald-600'>FB Ads aktif</span>" : ""}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Sub-tabs
    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    [{ id: "owned", label: `Owned (${ownedCount})`, icon: "warehouse" },
     { id: "listings", label: `Active Listings (${listings.length})`, icon: "tag", badge: pendingOffers }].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.inventoryView.activeTab === t.id ? "active" : ""}`;
      btn.innerHTML = `
        <i class="fa-solid fa-${t.icon}"></i>
        ${t.label}
        ${t.badge ? `<span class="subtab-badge">${t.badge}</span>` : ""}
      `;
      btn.addEventListener("click", () => {
        s.inventoryView.activeTab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.inventoryView.activeTab === "listings") {
      wrap.appendChild(window.Selling.renderActiveListingsTab());
    } else {
      wrap.appendChild(renderOwnedTab());
    }
    return wrap;
  }

  function renderOwnedTab() {
    const wrap = document.createElement("div");
    const items = S().inventory || [];
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-2xl mb-3"><i class="fa-solid fa-box-open"></i></div>
        <h3>Belum punya barang</h3>
        <p class="text-sm text-gray-500">Beli dulu di Marketplace, baru bisa di-flip dari sini.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = document.createElement("div");
    grid.className = "inventory-grid";
    items.forEach((item) => grid.appendChild(renderInventoryCard(item)));
    wrap.appendChild(grid);
    return wrap;
  }

  /* ---------- Owned-item card ---------- */
  function renderInventoryCard(item) {
    const card = document.createElement("div");
    card.className = "inventory-card" + (isLocked(item) ? " locked" : "");

    const marketPrice = window.Market.computeCurrentMarketPrice(item);
    const buyPrice = item.buyPrice || 0;
    const grossProfit = marketPrice - buyPrice;
    const profitClass = grossProfit > 0 ? "text-emerald-600" : grossProfit < 0 ? "text-rose-600" : "text-gray-500";
    const locked = isLocked(item);
    const justRepaired = item.previousDefect && item.defect.severity === 0 && !locked;

    card.innerHTML = `
      <div class="inv-thumb">
        ${gadgetIconHtml(item, "text-6xl")}
        <span class="inv-thumb-tag">${item.brand || "—"}</span>
        ${item.hiddenDefect ? `<span class="inv-hidden-defect" title="${item.hiddenDefect}"><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
        ${locked ? `<span class="inv-repair-badge"><i class="fa-solid fa-screwdriver-wrench"></i> In Repair</span>` : ""}
        ${justRepaired ? `<span class="inv-repaired-badge"><i class="fa-solid fa-sparkles"></i> Repaired</span>` : ""}
      </div>
      <div class="inv-body">
        <p class="inv-title">${item.name}</p>
        <p class="inv-meta">${item.specs.ram} / ${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="inv-badges">
          <span class="market-badge bg-blue-100 text-blue-700">${item.completeness.short}</span>
          <span class="market-badge ${item.defect.severity === 0 ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}">${item.defect.short}</span>
        </div>
        <div class="inv-prices">
          <div><span class="inv-prices-label">Beli (D${item.buyDay})</span><span>${fmt(buyPrice)}</span></div>
          <div><span class="inv-prices-label">Suggested Price</span><span class="font-bold">${fmt(marketPrice)}</span></div>
          <div><span class="inv-prices-label">Margin Kotor</span><span class="${profitClass} font-semibold">${grossProfit >= 0 ? "+" : ""}${fmt(grossProfit)}</span></div>
        </div>
        ${locked
          ? `<button class="relist-btn" disabled><i class="fa-solid fa-lock"></i> Locked: In Repair until Day ${item.repair.completesOnDay}</button>`
          : `<button class="relist-btn" data-id="${item.id}"><i class="fa-solid fa-tag"></i> List on Marketplace</button>`}
      </div>
    `;
    if (!locked) {
      card.querySelector(".relist-btn").addEventListener("click", () => window.Selling.openListModal(item));
    }
    return card;
  }

  /* ---------- Public API ---------- */
  window.Inventory = {
    renderInventoryPage,
    platformFeeRate,
  };
})();
