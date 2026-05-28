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

    /* Part 21 — Bulk-broadcast bar (Suhu + ≥100M net worth only).
     * Renders as a sticky-style bar above the grid showing selected
     * count, total wholesale price, and the "Share ke Grup VIP" CTA. */
    const wa = window.WAGroup;
    if (wa && wa.isUnlocked()) {
      const bar = renderBulkActionBar();
      if (bar) wrap.appendChild(bar);
    }

    /* Part 23 — STRICT 50-item DOM cap (no Load More). */
    const HARD_CAP = 50;
    const s = S();
    if (!s.inventoryView) s.inventoryView = {};
    const total = items.length;
    const limit = Math.min(HARD_CAP, total);

    const grid = document.createElement("div");
    grid.className = "inventory-grid";
    items.slice(0, limit).forEach((item) => grid.appendChild(renderInventoryCard(item)));
    wrap.appendChild(grid);

    if (total > HARD_CAP) {
      const note = document.createElement("p");
      note.className = "ft-render-cap-note";
      note.innerHTML = `
        <i class="fa-solid fa-circle-info"></i>
        Menampilkan <b>${HARD_CAP}</b> item teratas dari total <b>${total}</b> item
        untuk menjaga performa.
      `;
      wrap.appendChild(note);
    }
    return wrap;
  }

  /* ---------- Part 21: bulk-action bar ---------- */
  function renderBulkActionBar() {
    const wa = window.WAGroup;
    if (!wa) return null;
    const selected = wa.getSelectedItems();
    const { askingPrice, totalMarket } = wa.computeBoronganPrice(selected);

    const bar = document.createElement("div");
    bar.className = "fb-card wa-bulk-bar";
    const ready = selected.length >= wa.MIN_SELECT && selected.length <= wa.MAX_SELECT;
    bar.innerHTML = `
      <div class="wa-bulk-info">
        <p class="wa-bulk-title">
          <i class="fa-brands fa-whatsapp text-[#25D366]"></i>
          Grup Reseller VIP <span class="wa-bulk-tag">SUHU</span>
        </p>
        <p class="wa-bulk-meta">
          ${selected.length} / ${wa.MAX_SELECT} dipilih
          ${selected.length > 0
            ? ` &middot; total wholesale <b>${fmt(askingPrice)}</b> <span class="text-gray-400">(market ${fmt(totalMarket)})</span>`
            : ` &middot; pilih ${wa.MIN_SELECT}–${wa.MAX_SELECT} item lalu klik Share.`}
        </p>
      </div>
      <div class="wa-bulk-actions">
        ${selected.length > 0 ? `<button id="wa-clear-sel" class="modal-btn modal-btn-ghost" type="button"><i class="fa-solid fa-eraser"></i> Clear</button>` : ""}
        <button id="wa-broadcast-btn"
                class="modal-btn ${ready ? "" : "modal-btn-ghost"}"
                ${ready ? `style="background:#25D366;color:#fff"` : "disabled"}>
          <i class="fa-brands fa-whatsapp"></i>
          ${ready ? `Share ke Grup VIP (${selected.length})` : `Pilih min ${wa.MIN_SELECT} item`}
        </button>
      </div>
    `;
    if (ready) {
      bar.querySelector("#wa-broadcast-btn").addEventListener("click", () => wa.openBroadcastModal());
    }
    const clearBtn = bar.querySelector("#wa-clear-sel");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      wa.clearSelected();
      window.FlippingTycoon.renderActivePage();
    });
    return bar;
  }

  /* ---------- Owned-item card ---------- */
  function renderInventoryCard(item) {
    const card = document.createElement("div");
    card.className = "inventory-card" + (isLocked(item) ? " locked" : "") + (item.isExInter ? " ex-inter" : "");

    const marketPrice = window.Market.computeCurrentMarketPrice(item);
    const buyPrice = item.buyPrice || 0;
    const grossProfit = marketPrice - buyPrice;
    const profitClass = grossProfit > 0 ? "text-emerald-600" : grossProfit < 0 ? "text-rose-600" : "text-gray-500";
    const locked = isLocked(item);
    const justRepaired = item.previousDefect && item.defect.severity === 0 && !locked;
    const imeiUnlocking = !!(item.imeiUnlock && item.imeiUnlock.status === "in-progress");
    const imeiBlocked = item.imeiStatus === "blocked";
    const imeiUnlocked = item.imeiStatus === "unlocked";

    // Build the badge cluster shown above the price grid.
    const condBadges = [
      `<span class="market-badge bg-blue-100 text-blue-700">${item.completeness.short}</span>`,
      `<span class="market-badge ${item.defect.severity === 0 ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}">${item.defect.short}</span>`,
    ];
    if (item.isExInter) {
      condBadges.push(`<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>`);
    }
    if (imeiBlocked) {
      condBadges.push(`<span class="market-badge bg-red-200 text-red-800"><i class="fa-solid fa-signal"></i> IMEI Terblokir</span>`);
    } else if (imeiUnlocked) {
      condBadges.push(`<span class="market-badge bg-emerald-100 text-emerald-700"><i class="fa-solid fa-shield-halved"></i> IMEI Aman (Tembakan)</span>`);
    } else if (imeiUnlocking) {
      condBadges.push(`<span class="market-badge bg-purple-100 text-purple-700"><i class="fa-solid fa-rotate fa-spin"></i> Tembak IMEI...</span>`);
    } else if (item.isExInter) {
      condBadges.push(`<span class="market-badge bg-yellow-100 text-yellow-800"><i class="fa-solid fa-signal"></i> IMEI Belum Diblokir</span>`);
    }

    // Thumb-corner overlay tags.
    const thumbOverlays = [];
    if (item.isExInter) {
      thumbOverlays.push(`<span class="ex-inter-tag"><i class="fa-solid fa-skull-crossbones"></i> No Pajak</span>`);
    }
    if (imeiBlocked) {
      thumbOverlays.push(`<span class="imei-block-tag"><i class="fa-solid fa-signal-slash"></i> IMEI Terblokir</span>`);
    }

    // Listing button label & state.
    let buttonHtml;
    if (locked) {
      const reason = imeiUnlocking
        ? `Tembak IMEI (selesai Day ${item.imeiUnlock.completesOnDay})`
        : `In Repair until Day ${item.repair.completesOnDay}`;
      buttonHtml = `<button class="relist-btn" disabled><i class="fa-solid fa-lock"></i> Locked: ${reason}</button>`;
    } else if (imeiBlocked) {
      buttonHtml = `<button class="relist-btn warn" data-id="${item.id}"><i class="fa-solid fa-tag"></i> List Anyway (-60% nilai)</button>`;
    } else {
      buttonHtml = `<button class="relist-btn" data-id="${item.id}"><i class="fa-solid fa-tag"></i> List on Marketplace</button>`;
    }

    card.innerHTML = `
      <div class="inv-thumb">
        ${gadgetIconHtml(item, "text-6xl")}
        <span class="inv-thumb-tag">${item.brand || "—"}</span>
        ${item.hiddenDefect ? `<span class="inv-hidden-defect" title="${item.hiddenDefect}"><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
        ${locked && !imeiUnlocking ? `<span class="inv-repair-badge"><i class="fa-solid fa-screwdriver-wrench"></i> In Repair</span>` : ""}
        ${imeiUnlocking ? `<span class="inv-imei-unlocking-badge"><i class="fa-solid fa-rotate fa-spin"></i> Tembak IMEI</span>` : ""}
        ${justRepaired ? `<span class="inv-repaired-badge"><i class="fa-solid fa-sparkles"></i> Repaired</span>` : ""}
        ${thumbOverlays.join("")}
        ${(window.WAGroup && window.WAGroup.isUnlocked() && !locked && !imeiBlocked) ? `
          <label class="wa-pick-toggle ${window.WAGroup.isSelected(item.id) ? "checked" : ""}" title="Tick untuk borongan VIP">
            <input type="checkbox" class="wa-pick-input" data-id="${item.id}" ${window.WAGroup.isSelected(item.id) ? "checked" : ""} />
            <span class="wa-pick-box"><i class="fa-solid fa-check"></i></span>
          </label>` : ""}
      </div>
      <div class="inv-body">
        <p class="inv-title">${item.name}</p>
        <p class="inv-meta">${item.specs.ram} / ${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="inv-badges">
          ${condBadges.join("")}
        </div>
        <div class="inv-prices">
          <div><span class="inv-prices-label">Beli (D${item.buyDay})</span><span>${fmt(buyPrice)}</span></div>
          <div><span class="inv-prices-label">Suggested Price</span><span class="font-bold">${fmt(marketPrice)}</span></div>
          <div><span class="inv-prices-label">Margin Kotor</span><span class="${profitClass} font-semibold">${grossProfit >= 0 ? "+" : ""}${fmt(grossProfit)}</span></div>
        </div>
        ${buttonHtml}
      </div>
    `;
    if (!locked) {
      card.querySelector(".relist-btn").addEventListener("click", () => window.Selling.openListModal(item));
    }
    // Part 21: WA bulk-pick checkbox
    const pickInput = card.querySelector(".wa-pick-input");
    if (pickInput) {
      pickInput.addEventListener("change", () => {
        if (window.WAGroup && window.WAGroup.toggleSelected(item.id)) {
          window.FlippingTycoon.renderActivePage();
        } else {
          // toggle was rejected (e.g. >MAX) — re-render to restore checkbox state
          window.FlippingTycoon.renderActivePage();
        }
      });
    }
    return card;
  }

  /* ---------- Public API ---------- */
  window.Inventory = {
    renderInventoryPage,
    platformFeeRate,
  };
})();
