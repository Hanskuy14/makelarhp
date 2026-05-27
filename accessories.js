/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 7 — Toko Aksesoris (OEM Box & Charger Kit Repacking)
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S()    { return window.FlippingTycoon.State.data; }

  /* ---------- OEM kit pricing by brand ---------- */
  const OEM_PRICES = {
    Apple:   450_000,
    Samsung: 300_000,
  };
  const OEM_DEFAULT_PRICE = 150_000;

  function getOemKitPrice(brand) {
    return OEM_PRICES[brand] != null ? OEM_PRICES[brand] : OEM_DEFAULT_PRICE;
  }
  function getOemKitLabel(brand) {
    if (brand === "Apple")   return "Apple OEM Box Kit";
    if (brand === "Samsung") return "Samsung OEM Box Kit";
    return "Android/Other OEM Box Kit";
  }


  /* ---------- Helpers: detect Batangan completeness ---------- */
  function isBatangan(comp) {
    if (!comp) return false;
    return comp.short === "Batangan" || comp.type === "HP Only / Batangan";
  }
  function fullsetOption() {
    return window.GadgetData.COMPLETENESS_OPTIONS.find((c) => c.type === "Fullset");
  }


  /* =========================================================
   * Repacking core: flip completeness + recompute valuation
   * ========================================================= */

  /** Find target either in inventory or active listings; pay from sourceBank; flip to Fullset. */
  function buyKitForItem(scope, itemId, sourceBank) {
    const s = S();
    if (scope === "inventory") {
      const item = (s.inventory || []).find((it) => it.id === itemId);
      if (!item) return false;
      if (!isBatangan(item.completeness)) return false;
      const cost = getOemKitPrice(item.brand);
      if (!chargeBank(sourceBank, cost, `${getOemKitLabel(item.brand)} - ${item.name}`, "oem-kit")) return false;
      // Flip completeness; trueValue is computed on the fly via Market.computeCurrentMarketPrice.
      item.completeness = fullsetOption();
      item.repackedOnDay = s.currentDay;
      item.totalRepairCost = (item.totalRepairCost || 0) + cost; // Part 9: track for analytics
      window.FlippingTycoon.saveGame();
      showToast(`📦 Repacked ${item.name} jadi Fullset!`);
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Repacked Fullset",
          message: `${item.name} sekarang Fullset — nilai pasar naik instan, siap re-list di harga lebih tinggi.`,
          actionPage: "inventory",
          actor: "Toko Aksesoris",
          icon: "box-open",
        });
      }
      return true;
    }
    if (scope === "listing") {
      const listing = (s.activeListings || []).find((l) => l.listingId === itemId);
      if (!listing || !listing.itemSnapshot) return false;
      if (!isBatangan(listing.itemSnapshot.completeness)) return false;
      const cost = getOemKitPrice(listing.itemSnapshot.brand);
      if (!chargeBank(sourceBank, cost, `${getOemKitLabel(listing.itemSnapshot.brand)} - ${listing.itemSnapshot.name} (listed)`, "oem-kit")) return false;
      listing.itemSnapshot.completeness = fullsetOption();
      listing.itemSnapshot.repackedOnDay = s.currentDay;
      listing.itemSnapshot.totalRepairCost = (listing.itemSnapshot.totalRepairCost || 0) + cost; // Part 9: track for analytics
      // Immediately recompute the suggested price so walk-ins / buyer-offer math uses the new value.
      listing.suggestedPrice = window.Market.computeCurrentMarketPrice({
        gadgetId:     listing.itemSnapshot.gadgetId,
        completeness: listing.itemSnapshot.completeness,
        defect:       listing.itemSnapshot.defect,
        isExInter:    !!listing.itemSnapshot.isExInter,
        imeiStatus:   listing.itemSnapshot.imeiStatus || null,
        buyPrice:     listing.itemSnapshot.buyPrice,
      });
      window.FlippingTycoon.saveGame();
      showToast(`📦 Repacked listing ${listing.itemSnapshot.name}! Suggested price naik.`);
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Listing Repacked",
          message: `${listing.itemSnapshot.name} (listed) sekarang Fullset. Suggested price naik tanpa nunggu Next Day.`,
          actionPage: "inventory",
          actor: "Toko Aksesoris",
          icon: "box-open",
        });
      }
      return true;
    }
    return false;
  }

  function chargeBank(sourceBank, amount, description, category) {
    const s = S();
    if ((s.bankBalances[sourceBank] || 0) < amount) {
      showToast(`Saldo ${sourceBank} tidak cukup.`);
      return false;
    }
    s.bankBalances[sourceBank] -= amount;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount,
      balanceAfter: s.bankBalances[sourceBank],
      description,
      category,
      day: s.currentDay,
      ts: Date.now(),
    });
    return true;
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderAccessoriesPage() {
    const wrap = document.createElement("div");
    const s = S();

    // Collect HP Only candidates from both pools.
    const invBatangan = (s.inventory || []).filter((it) => isBatangan(it.completeness));
    const listingBatangan = (s.activeListings || [])
      .filter((l) => l.itemSnapshot && isBatangan(l.itemSnapshot.completeness));

    // Header card with summary + brand pricing legend
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-box-open text-orange-500"></i> Toko Aksesoris</h3>
          <p class="text-sm text-gray-500">
            Beli OEM Box &amp; Charger kit untuk unit Batangan &mdash; otomatis berubah jadi Fullset, nilai pasar
            <b>naik instan</b> tanpa nunggu Next Day.
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">HP Only di toko</p>
          <p class="font-semibold text-sm">${invBatangan.length + listingBatangan.length}</p>
        </div>
      </div>
      <div class="oem-price-legend">
        <div class="oem-price-row">
          <i class="fa-brands fa-apple" style="color:#1c1c1e"></i>
          <span>Apple OEM Box Kit</span>
          <span class="oem-price">${fmt(OEM_PRICES.Apple)}</span>
        </div>
        <div class="oem-price-row">
          <i class="fa-solid fa-mobile-screen" style="color:#1428a0"></i>
          <span>Samsung OEM Box Kit</span>
          <span class="oem-price">${fmt(OEM_PRICES.Samsung)}</span>
        </div>
        <div class="oem-price-row">
          <i class="fa-solid fa-mobile-screen-button" style="color:#6b7280"></i>
          <span>Android / Other OEM Box Kit</span>
          <span class="oem-price">${fmt(OEM_DEFAULT_PRICE)}</span>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Empty state if nothing to repack
    if (invBatangan.length === 0 && listingBatangan.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-orange-500 text-2xl mb-3">
          <i class="fa-solid fa-box"></i>
        </div>
        <h3>Belum ada unit Batangan</h3>
        <p class="text-sm text-gray-500">
          Cari unit "HP Only / Batangan" di Marketplace atau import dari Batam Supplier.
          Setelah punya, balik kesini buat repacking jadi Fullset.
        </p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    // Inventory section
    if (invBatangan.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-warehouse text-amber-500"></i> Dari Inventory (${invBatangan.length})</h3>`;
      invBatangan.forEach((it) => sec.appendChild(renderRepackRow("inventory", it)));
      wrap.appendChild(sec);
    }

    // Active listings section
    if (listingBatangan.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-tag text-blue-500"></i> Dari Active Listings (${listingBatangan.length})</h3>`;
      listingBatangan.forEach((l) => sec.appendChild(renderRepackRow("listing", l)));
      wrap.appendChild(sec);
    }
    return wrap;
  }


  /* ---------- Per-item row ---------- */
  function renderRepackRow(scope, target) {
    // Unify the snapshot we render from.
    const snap = scope === "inventory" ? target : target.itemSnapshot;
    const id   = scope === "inventory" ? target.id : target.listingId;
    const accent = snap.accent || "#1c1c1e";
    const iconName = snap.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";

    // Compute current vs after-repack market value for the user-visible uplift.
    const currentValue = window.Market.computeCurrentMarketPrice({
      gadgetId:     snap.gadgetId,
      completeness: snap.completeness,
      defect:       snap.defect,
      isExInter:    !!snap.isExInter,
      imeiStatus:   snap.imeiStatus || null,
      buyPrice:     snap.buyPrice,
    });
    const upliftedValue = window.Market.computeCurrentMarketPrice({
      gadgetId:     snap.gadgetId,
      completeness: fullsetOption(),
      defect:       snap.defect,
      isExInter:    !!snap.isExInter,
      imeiStatus:   snap.imeiStatus || null,
      buyPrice:     snap.buyPrice,
    });
    const uplift = upliftedValue - currentValue;
    const cost = getOemKitPrice(snap.brand);
    const netGain = uplift - cost;

    const row = document.createElement("div");
    row.className = "repack-row";
    row.innerHTML = `
      <div class="repack-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
      <div class="repack-body">
        <p class="repack-title">${snap.name}</p>
        <p class="repack-meta">${snap.specs.ram}/${snap.specs.rom} &middot; ${snap.specs.color} &middot; ${snap.defect.short}</p>
        <div class="repack-badges">
          <span class="market-badge bg-yellow-100 text-yellow-800">${snap.completeness.short}</span>
          ${scope === "listing" ? `<span class="market-badge bg-blue-100 text-blue-700"><i class="fa-solid fa-tag"></i> Listed</span>` : ""}
          ${snap.isExInter ? `<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>` : ""}
        </div>
        <div class="repack-uplift">
          <div><span>Nilai sekarang</span><b>${fmt(currentValue)}</b></div>
          <div><span>Setelah Fullset</span><b class="text-emerald-700">${fmt(upliftedValue)}</b></div>
          <div><span>Net keuntungan repack</span>
            <b class="${netGain > 0 ? "text-emerald-700" : "text-rose-700"}">${netGain >= 0 ? "+" : ""}${fmt(netGain)}</b>
          </div>
        </div>
      </div>
      <div class="repack-action">
        <p class="repack-cost">${fmt(cost)}</p>
        <button class="repack-btn" data-scope="${scope}" data-id="${id}">
          <i class="fa-solid fa-box-open"></i> Buy OEM Kit
        </button>
        <p class="text-[11px] text-gray-500 mt-1">${getOemKitLabel(snap.brand)}</p>
      </div>
    `;
    row.querySelector(".repack-btn").addEventListener("click", () => openKitModal(scope, id));
    return row;
  }


  /* =========================================================
   * Kit purchase modal (bank picker)
   * ========================================================= */
  function openKitModal(scope, itemId) {
    const s = S();
    const target = scope === "inventory"
      ? (s.inventory || []).find((it) => it.id === itemId)
      : (s.activeListings || []).find((l) => l.listingId === itemId);
    if (!target) return;
    const snap = scope === "inventory" ? target : target.itemSnapshot;
    if (!isBatangan(snap.completeness)) {
      showToast("Item ini sudah Fullset.");
      return;
    }

    const modal = document.querySelector("#accessories-modal");
    const body = modal.querySelector("#accessories-body");
    const closeBtn = modal.querySelector("#accessories-cancel");

    const cost = getOemKitPrice(snap.brand);
    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const bal = s.bankBalances[b] || 0;
      const enough = bal >= cost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(bal)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(cost)}</b></span></div>
        </button>`;
    }).join("");

    const upliftedValue = window.Market.computeCurrentMarketPrice({
      gadgetId:     snap.gadgetId,
      completeness: fullsetOption(),
      defect:       snap.defect,
      isExInter:    !!snap.isExInter,
      imeiStatus:   snap.imeiStatus || null,
      buyPrice:     snap.buyPrice,
    });

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid #f97316">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold">${snap.name} &middot; ${snap.specs.ram}/${snap.specs.rom}</p>
        <p class="text-xs text-gray-500 mt-2">Completeness sekarang</p>
        <p class="font-semibold text-amber-700">${snap.completeness.type}</p>
        <p class="text-xs text-gray-500 mt-2">${getOemKitLabel(snap.brand)}</p>
        <p class="text-xl font-bold">${fmt(cost)}</p>
        <p class="text-xs text-emerald-700 mt-1">
          <i class="fa-solid fa-arrow-trend-up"></i> Setelah repack: completeness Fullset, nilai jadi <b>${fmt(upliftedValue)}</b>.
        </p>
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
        if (buyKitForItem(scope, itemId, btn.dataset.bank)) {
          close();
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
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
  window.Accessories = {
    renderAccessoriesPage,
    buyKitForItem,
    getOemKitPrice,
    OEM_PRICES,
    OEM_DEFAULT_PRICE,
  };
})();
