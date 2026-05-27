/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 11 — Warehouse: bulk-stock storage (capacity 500)
 *
 * Players can stash gadgets here to scale up. Stock in
 * the warehouse is "secured":
 *   - Skipped by daily IMEI-block risk roll.
 *   - Skipped by walk-in customers in the storefront.
 *   - Counts toward Wholesale (B2B) order fulfillment.
 *
 * Capacity is hard-capped at WAREHOUSE_CAPACITY units.
 * Items are moved between Inventory <-> Warehouse only;
 * they never get duplicated.
 * ========================================================= */

(function () {
  const WAREHOUSE_CAPACITY = 500;

  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }

  function ensureWarehouse() {
    const s = S();
    if (!Array.isArray(s.warehouse))  s.warehouse  = [];
    if (!s.warehouseView)             s.warehouseView = { activeTab: "stock" };
  }

  function capacity()      { return WAREHOUSE_CAPACITY; }
  function usage()         { ensureWarehouse(); return S().warehouse.length; }
  function freeSlots()     { return WAREHOUSE_CAPACITY - usage(); }
  function isFull()        { return usage() >= WAREHOUSE_CAPACITY; }

  /* =========================================================
   * Move helpers
   * ========================================================= */
  function isMovable(item) {
    if (!item) return false;
    // Items that are mid-repair / mid-IMEI-unlock are locked.
    if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(item)) return false;
    return true;
  }

  /** Move one inventory item to warehouse. Returns true if moved. */
  function storeItem(itemId) {
    ensureWarehouse();
    const s = S();
    const idx = s.inventory.findIndex((it) => it.id === itemId);
    if (idx < 0) { showToast("Barang tidak ditemukan di inventory."); return false; }
    const item = s.inventory[idx];
    if (!isMovable(item)) { showToast("Barang sedang dikunci (repair / IMEI). Tidak bisa dipindah."); return false; }
    if (isFull())         { showToast(`Warehouse penuh (${usage()}/${WAREHOUSE_CAPACITY}).`); return false; }
    s.inventory.splice(idx, 1);
    item.storedOnDay = s.currentDay;
    s.warehouse.push(item);
    window.FlippingTycoon.saveGame();
    return true;
  }

  /** Move one warehouse item back into inventory. */
  function withdrawItem(itemId) {
    ensureWarehouse();
    const s = S();
    const idx = s.warehouse.findIndex((it) => it.id === itemId);
    if (idx < 0) { showToast("Barang tidak ditemukan di warehouse."); return false; }
    const item = s.warehouse[idx];
    s.warehouse.splice(idx, 1);
    delete item.storedOnDay;
    s.inventory.push(item);
    window.FlippingTycoon.saveGame();
    return true;
  }

  /** Bulk move: store every movable inventory item until full. */
  function storeAll() {
    ensureWarehouse();
    const s = S();
    let moved = 0;
    const remain = [];
    s.inventory.forEach((it) => {
      if (moved >= freeSlots()) { remain.push(it); return; }
      if (!isMovable(it))       { remain.push(it); return; }
      it.storedOnDay = s.currentDay;
      s.warehouse.push(it);
      moved++;
    });
    s.inventory = remain;
    if (moved > 0) window.FlippingTycoon.saveGame();
    return moved;
  }

  /** Bulk move: withdraw every warehouse item back to inventory. */
  function withdrawAll() {
    ensureWarehouse();
    const s = S();
    const moved = s.warehouse.length;
    s.warehouse.forEach((it) => { delete it.storedOnDay; s.inventory.push(it); });
    s.warehouse = [];
    if (moved > 0) window.FlippingTycoon.saveGame();
    return moved;
  }

  /* =========================================================
   * Wholesale fulfillment helper
   *
   * Returns up to `qty` items (combined inventory + warehouse)
   * matching gadgetId + condition filter. Used by Wholesale.
   * Does NOT mutate state; callers must remove the returned ids.
   * ========================================================= */
  function findQualifyingStock(gadgetId, qty, opts) {
    ensureWarehouse();
    const s = S();
    const need = Math.max(0, qty | 0);
    if (need === 0) return [];
    const wantCompletenessShort = opts && opts.completenessShort;          // e.g., "Fullset"
    const requireMulus          = opts && opts.requireMulus !== false;     // default true
    const requireImeiOk         = opts && opts.requireImeiOk !== false;    // default true

    function ok(it) {
      if (!it) return false;
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      if (it.gadgetId !== gadgetId) return false;
      if (requireMulus && it.defect && it.defect.severity !== 0) return false;
      if (wantCompletenessShort && it.completeness && it.completeness.short !== wantCompletenessShort) return false;
      if (requireImeiOk && it.imeiStatus === "blocked") return false;
      return true;
    }

    const out = [];
    // Prefer warehouse first (let the active flipping inventory keep flexible stock).
    for (const it of s.warehouse) { if (out.length >= need) break; if (ok(it)) out.push({ source: "warehouse", item: it }); }
    for (const it of s.inventory) { if (out.length >= need) break; if (ok(it)) out.push({ source: "inventory", item: it }); }
    return out;
  }

  /** Counts qualifying stock without consuming it. */
  function countQualifyingStock(gadgetId, opts) {
    ensureWarehouse();
    const s = S();
    let n = 0;
    const wantCompletenessShort = opts && opts.completenessShort;
    const requireMulus          = opts && opts.requireMulus !== false;
    const requireImeiOk         = opts && opts.requireImeiOk !== false;
    function ok(it) {
      if (!it) return false;
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      if (it.gadgetId !== gadgetId) return false;
      if (requireMulus && it.defect && it.defect.severity !== 0) return false;
      if (wantCompletenessShort && it.completeness && it.completeness.short !== wantCompletenessShort) return false;
      if (requireImeiOk && it.imeiStatus === "blocked") return false;
      return true;
    }
    s.warehouse.forEach((it) => { if (ok(it)) n++; });
    s.inventory.forEach((it) => { if (ok(it)) n++; });
    return n;
  }

  /** Removes the items returned by findQualifyingStock from their respective arrays. */
  function consumeStock(picks) {
    if (!Array.isArray(picks) || picks.length === 0) return 0;
    const s = S();
    const ids = new Set(picks.map((p) => p.item.id));
    const before = s.warehouse.length + s.inventory.length;
    s.warehouse = s.warehouse.filter((it) => !ids.has(it.id));
    s.inventory = s.inventory.filter((it) => !ids.has(it.id));
    const removed = before - (s.warehouse.length + s.inventory.length);
    if (removed > 0) window.FlippingTycoon.saveGame();
    return removed;
  }

  /* =========================================================
   * Page renderer
   * ========================================================= */
  function gadgetIconHtml(item, sizeClass = "text-5xl") {
    const accent = (item.accent) || "#1c1c1e";
    const iconName = (item.icon === "tablet") ? "tablet-screen-button" : "mobile-screen-button";
    return `<i class="fa-solid fa-${iconName} ${sizeClass}" style="color:${accent}"></i>`;
  }

  function renderWarehousePage() {
    ensureWarehouse();
    const s = S();
    const wrap = document.createElement("div");

    const used = usage();
    const cap  = capacity();
    const pct  = Math.min(100, Math.round((used / cap) * 100));
    const tier = pct >= 95 ? "danger" : pct >= 75 ? "warn" : "ok";

    // Header card with capacity bar
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-warehouse text-amber-600"></i> Warehouse</h3>
          <p class="text-sm text-gray-500">Gudang utama. Stok di sini aman dari risiko IMEI &amp; walk-in.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Kapasitas</p>
          <p class="font-semibold text-sm">${used} / ${cap}</p>
        </div>
      </div>
      <div class="warehouse-cap-bar">
        <div class="warehouse-cap-fill ${tier}" style="width:${pct}%"></div>
      </div>
      <p class="text-[11px] text-gray-500 mt-2">Sisa slot: <b>${cap - used}</b> &middot; ${pct}% terpakai</p>
    `;
    wrap.appendChild(header);

    // Sub-tabs
    const ownedCount = (s.inventory || []).length;
    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    [
      { id: "stock",   label: `Storage (${used})`, icon: "warehouse" },
      { id: "intake",  label: `Inventory (${ownedCount})`, icon: "boxes-stacked" },
    ].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.warehouseView.activeTab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}`;
      btn.addEventListener("click", () => {
        s.warehouseView.activeTab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.warehouseView.activeTab === "intake") {
      wrap.appendChild(renderIntakeTab());
    } else {
      wrap.appendChild(renderStockTab());
    }
    return wrap;
  }

  function renderStockTab() {
    const wrap = document.createElement("div");
    const s = S();
    const items = s.warehouse || [];

    // Bulk action bar
    const bar = document.createElement("div");
    bar.className = "warehouse-bulkbar";
    bar.innerHTML = `
      <button id="wh-withdraw-all" class="warehouse-bulk-btn ghost" ${items.length === 0 ? "disabled" : ""}>
        <i class="fa-solid fa-arrow-up-from-bracket"></i> Withdraw All to Inventory (${items.length})
      </button>
    `;
    wrap.appendChild(bar);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-2xl mb-3">
          <i class="fa-solid fa-warehouse"></i>
        </div>
        <h3>Gudang masih kosong</h3>
        <p class="text-sm text-gray-500">Pindah barang dari tab Inventory untuk mulai bangun stok grosir.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    const grid = document.createElement("div");
    grid.className = "inventory-grid";
    items.forEach((it) => grid.appendChild(renderWarehouseCard(it, "withdraw")));
    wrap.appendChild(grid);

    setTimeout(() => {
      const btn = document.querySelector("#wh-withdraw-all");
      if (btn) btn.addEventListener("click", () => {
        if (!confirm(`Tarik semua ${items.length} barang dari Warehouse ke Inventory?`)) return;
        const moved = withdrawAll();
        showToast(`📤 ${moved} barang dipindah ke Inventory.`);
        window.FlippingTycoon.renderActivePage();
      });
    }, 0);

    return wrap;
  }

  function renderIntakeTab() {
    const wrap = document.createElement("div");
    const s = S();
    const items = (s.inventory || []).filter(isMovable);

    const bar = document.createElement("div");
    bar.className = "warehouse-bulkbar";
    const slotsLeft = freeSlots();
    bar.innerHTML = `
      <p class="text-xs text-gray-500">${items.length} barang siap dipindah &middot; sisa slot warehouse: <b>${slotsLeft}</b></p>
      <button id="wh-store-all" class="warehouse-bulk-btn primary" ${items.length === 0 || slotsLeft === 0 ? "disabled" : ""}>
        <i class="fa-solid fa-arrow-down-to-bracket"></i> Move All to Warehouse
      </button>
    `;
    wrap.appendChild(bar);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl mb-3">
          <i class="fa-solid fa-boxes-stacked"></i>
        </div>
        <h3>Tidak ada barang yang bisa dipindah</h3>
        <p class="text-sm text-gray-500">Barang yang sedang Repair / Tembak IMEI di-skip otomatis.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    const grid = document.createElement("div");
    grid.className = "inventory-grid";
    items.forEach((it) => grid.appendChild(renderWarehouseCard(it, "store")));
    wrap.appendChild(grid);

    setTimeout(() => {
      const btn = document.querySelector("#wh-store-all");
      if (btn) btn.addEventListener("click", () => {
        if (!confirm(`Pindahkan semua ${items.length} barang ke Warehouse?`)) return;
        const moved = storeAll();
        showToast(`📦 ${moved} barang masuk Warehouse.`);
        window.FlippingTycoon.renderActivePage();
      });
    }, 0);

    return wrap;
  }

  function renderWarehouseCard(item, mode) {
    const card = document.createElement("div");
    card.className = "inventory-card warehouse-card" + (item.isExInter ? " ex-inter" : "");
    const marketPrice = window.Market ? window.Market.computeCurrentMarketPrice(item) : (item.buyPrice || 0);

    const condBadges = [
      `<span class="market-badge bg-blue-100 text-blue-700">${item.completeness.short}</span>`,
      `<span class="market-badge ${item.defect.severity === 0 ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}">${item.defect.short}</span>`,
    ];
    if (item.isExInter) condBadges.push(`<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>`);
    if (item.imeiStatus === "blocked") condBadges.push(`<span class="market-badge bg-red-200 text-red-800"><i class="fa-solid fa-signal"></i> IMEI Block</span>`);
    if (mode === "withdraw" && item.storedOnDay) {
      condBadges.push(`<span class="market-badge bg-amber-100 text-amber-800"><i class="fa-solid fa-warehouse"></i> Stored Day ${item.storedOnDay}</span>`);
    }

    const buttonHtml = mode === "store"
      ? `<button class="relist-btn warehouse-store-btn" data-id="${item.id}"><i class="fa-solid fa-arrow-down-to-bracket"></i> Move to Warehouse</button>`
      : `<button class="relist-btn warehouse-withdraw-btn" data-id="${item.id}"><i class="fa-solid fa-arrow-up-from-bracket"></i> Withdraw to Inventory</button>`;

    card.innerHTML = `
      <div class="inv-thumb">
        ${gadgetIconHtml(item, "text-6xl")}
        <span class="inv-thumb-tag">${item.brand || "—"}</span>
      </div>
      <div class="inv-body">
        <p class="inv-title">${item.name}</p>
        <p class="inv-meta">${item.specs.ram} / ${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="inv-badges">${condBadges.join("")}</div>
        <div class="inv-prices">
          <div><span class="inv-prices-label">Modal (D${item.buyDay})</span><span>${fmt(item.buyPrice || 0)}</span></div>
          <div><span class="inv-prices-label">Suggested Price</span><span class="font-bold">${fmt(marketPrice)}</span></div>
        </div>
        ${buttonHtml}
      </div>
    `;

    const btn = card.querySelector(".relist-btn");
    if (btn) btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (mode === "store") {
        if (storeItem(id)) {
          showToast("📦 Barang masuk Warehouse.");
          window.FlippingTycoon.renderActivePage();
        }
      } else {
        if (withdrawItem(id)) {
          showToast("📤 Barang ditarik ke Inventory.");
          window.FlippingTycoon.renderActivePage();
        }
      }
    });
    return card;
  }

  /* ---------- Toast ---------- */
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

  /* ---------- Public API ---------- */
  window.Warehouse = {
    WAREHOUSE_CAPACITY,
    capacity,
    usage,
    freeSlots,
    isFull,
    storeItem,
    withdrawItem,
    storeAll,
    withdrawAll,
    findQualifyingStock,
    countQualifyingStock,
    consumeStock,
    renderWarehousePage,
  };
})();
