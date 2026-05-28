/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 6 — Real Estate / Storefront & Walk-in Customers
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  /* ---------- Store catalog (currently a single, iconic option) ---------- */
  const STORES = [
    {
      id: "ruko-itc-roxy",
      name: "Ruko ITC Roxy",
      location: "ITC Roxy Mas, Jakarta Pusat",
      dailyRent: 5_000_000,
      icon: "shop",
      accent: "#a21caf",
      blurb: "Ruko 2 lantai di pusat ITC Roxy Mas. Lalu-lalang pembeli walk-in sepanjang hari.",
      perks: [
        "Walk-in Customers aktif: listing dengan asking price ≤ 110% suggested terjual INSTAN tiap Next Day (no haggle).",
        "Tampilan etalase fisik bikin barang gak gampang kena IMEI block? — gak juga, polisi tetap razia kalau ketauan 😅.",
      ],
    },
  ];

  /* ---------- State helpers ---------- */
  function ensureRealEstate() {
    const s = S();
    if (!s.realEstate) {
      s.realEstate = {
        rented: false,
        store: null,
        rentSince: null,
        daysRented: 0,
        totalPaid: 0,
        evictedOnDay: null,
        walkInsHistory: [],
      };
    }
  }

  function isRented() {
    ensureRealEstate();
    return !!S().realEstate.rented;
  }

  function activeStoreMeta() {
    const s = S();
    if (s.realEstate && s.realEstate.store) return s.realEstate.store;
    return STORES[0];
  }

  /* =========================================================
   * Rent / Vacate
   * ========================================================= */
  function rentStore(storeId) {
    const store = STORES.find((x) => x.id === storeId) || STORES[0];
    const s = S();
    ensureRealEstate();
    if (s.realEstate.rented) {
      showToast("Sudah menyewa toko. Vacate dulu kalau mau ganti.");
      return;
    }
    if ((s.bankBalances.Mandiri || 0) < store.dailyRent) {
      showToast(`Saldo Mandiri kurang. Butuh ${fmt(store.dailyRent)} untuk DP hari pertama.`);
      return;
    }
    // Pay first day's rent immediately from Mandiri.
    s.bankBalances.Mandiri -= store.dailyRent;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: store.dailyRent,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Sewa harian ${store.name} (Day ${s.currentDay})`,
      category: "rent",
      day: s.currentDay,
      ts: Date.now(),
    });

    s.realEstate.rented = true;
    s.realEstate.store = { ...store };
    s.realEstate.rentSince = s.currentDay;
    s.realEstate.daysRented = 1;
    s.realEstate.totalPaid = store.dailyRent;
    s.realEstate.evictedOnDay = null;

    window.FlippingTycoon.saveGame();
    showToast(`✅ ${store.name} disewa! Walk-in Customers aktif.`);
  }

  function vacateStore() {
    const s = S();
    ensureRealEstate();
    if (!s.realEstate.rented) return;
    const name = (s.realEstate.store && s.realEstate.store.name) || "Toko";
    s.realEstate.rented = false;
    s.realEstate.store = null;
    window.FlippingTycoon.saveGame();
    showToast(`Sewa ${name} dihentikan. Walk-in Customers tidak aktif.`);
  }

  /* =========================================================
   * Daily rent (auto-deducted from Mandiri on Next Day)
   * ========================================================= */
  function processDailyRent() {
    const s = S();
    ensureRealEstate();
    if (!s.realEstate.rented) return;
    const store = s.realEstate.store || STORES[0];
    const cost = store.dailyRent;

    if ((s.bankBalances.Mandiri || 0) < cost) {
      // Eviction: insufficient funds → lose store + perk
      s.bankHistories.Mandiri.push({
        type: "DEBIT",
        amount: 0,
        balanceAfter: s.bankBalances.Mandiri,
        description: `EVICTED dari ${store.name} — saldo Mandiri kurang untuk sewa harian (${fmt(cost)})`,
        category: "rent-evict",
        day: s.currentDay,
        ts: Date.now(),
      });
      s.realEstate.rented = false;
      s.realEstate.evictedOnDay = s.currentDay;
      // Keep store info for history but disable perk.
      showToast(`❌ Diusir dari ${store.name}! Saldo Mandiri kurang untuk sewa.`);
      if (window.Notifications) {
        window.Notifications.add({
          type: "alert",
          title: "Diusir dari Toko!",
          message: `Saldo Mandiri tidak cukup buat sewa harian ${store.name} (${fmt(cost)}). Walk-in Customers nonaktif sampai sewa lagi.`,
          actionPage: "real-estate",
          actor: "Pemilik Toko",
          icon: "gavel",
        });
      }
      window.FlippingTycoon.saveGame();
      return;
    }

    s.bankBalances.Mandiri -= cost;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: cost,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Sewa harian ${store.name} (Day ${s.currentDay})`,
      category: "rent",
      day: s.currentDay,
      ts: Date.now(),
    });
    s.realEstate.daysRented = (s.realEstate.daysRented || 0) + 1;
    s.realEstate.totalPaid = (s.realEstate.totalPaid || 0) + cost;
    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * Walk-in customer pass (Part 23 — O(1) Mass Simulation).
   *
   * Old behaviour: for-loop every active listing, recompute its
   * suggested price, check ratio, call completeWalkInSale per item.
   * With 1000 listings this melts mobile CPUs.
   *
   * New behaviour: compute a global Store Sale Rate, derive
   * itemsSold mathematically, splice that many listings out of
   * the array, sum their asking prices into ONE bank credit,
   * push ONE walk-ins-history summary, and emit ONE notification.
   *
   * The eligibility check (asking <= 110% of suggested) is still
   * applied during the up-front filter pass that builds the pool,
   * but the heavy completeWalkInSale-per-item path is replaced
   * with a single batched commit.
   * ========================================================= */
  function processWalkInSales() {
    const s = S();
    ensureRealEstate();
    if (!s.realEstate.rented) return;

    const all = s.activeListings || [];
    if (all.length === 0) return;

    // Filter: only listings priced at-or-below 110% of today's
    // suggested price are eligible. Listings mid-negotiation skip.
    const eligible = [];
    for (let i = 0; i < all.length; i++) {
      const l = all[i];
      if (l.negotiationState === "offer-pending") continue;
      const suggested = recomputeSuggested(l);
      if (suggested <= 0) continue;
      if (l.askingPrice / suggested > 1.10) continue;
      eligible.push(l);
    }
    if (eligible.length === 0) return;

    // Global Store Sale Rate: random 10%..30% of eligible stock,
    // tilted slightly upward by store quality and player rep.
    const baseRate = 0.10 + Math.random() * 0.20;
    const repBoost = (window.Reputation && window.Reputation.isSuhu && window.Reputation.isSuhu()) ? 0.05 : 0;
    const saleRate = Math.min(0.40, baseRate + repBoost);
    let itemsSold = Math.floor(eligible.length * saleRate);
    // Always sell at least 1 if there's any eligible stock — keeps the
    // toko alive on slow days.
    if (itemsSold < 1) itemsSold = Math.min(1, eligible.length);

    // Shuffle the eligible pool so the cheapest listings aren't always
    // the first ones to be sold.
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = eligible[i]; eligible[i] = eligible[j]; eligible[j] = t;
    }
    const sold = eligible.slice(0, itemsSold);

    // ---- O(1) batched commit ----
    const receivingBank = "Mandiri";
    const tier = window.Banking.tierOf(s.bankBalances[receivingBank] || 0);
    const isPriority = tier === "priority";
    const baseFee = window.Inventory && window.Inventory.platformFeeRate
      ? window.Inventory.platformFeeRate()
      : (window.Repair && window.Repair.platformFeeRate ? window.Repair.platformFeeRate() : 0.05);
    const feeRate = isPriority ? 0 : baseFee;

    let grossSum = 0, feeSum = 0, netSum = 0;
    const soldIds = new Set();
    sold.forEach((l) => {
      soldIds.add(l.listingId);
      const price = l.askingPrice;
      const fee = Math.round(price * feeRate);
      grossSum += price;
      feeSum   += fee;
      netSum   += (price - fee);
    });

    // Single inventory mutation: filter out all sold listings at once.
    s.activeListings = s.activeListings.filter((l) => !soldIds.has(l.listingId));

    // ONE bank credit + ONE bank-history entry
    s.bankBalances[receivingBank] += netSum;
    s.bankHistories[receivingBank].push({
      type: "CREDIT",
      amount: netSum,
      balanceAfter: s.bankBalances[receivingBank],
      description: `Walk-in batch: ${sold.length} unit @ ${(s.realEstate.store && s.realEstate.store.name) || "Toko"}` +
        (isPriority ? " (Priority - 0% fee)" : ` (after ${(baseFee*100).toFixed(0)}% fee)`),
      category: "walk-in-sale-batch",
      day: s.currentDay,
      ts: Date.now(),
    });

    // Single ledger summary entry
    s.realEstate.walkInsHistory = s.realEstate.walkInsHistory || [];
    s.realEstate.walkInsHistory.unshift({
      day: s.currentDay,
      itemName: `Batch — ${sold.length} unit`,
      asking: grossSum,
      suggested: grossSum, // approximation (we don't keep per-item suggested anymore)
      net: netSum,
      fee: feeSum,
      batched: true,
      unitCount: sold.length,
    });
    if (s.realEstate.walkInsHistory.length > 30) s.realEstate.walkInsHistory.pop();

    // Per-item Analytics push (cheap — pure data, no DOM/RNG/IO)
    if (window.Analytics && window.Analytics.recordSale) {
      sold.forEach((l) => {
        const snap = l.itemSnapshot || {};
        const price = l.askingPrice;
        const fee = Math.round(price * feeRate);
        window.Analytics.recordSale({
          saleType: "walk-in",
          gadget: {
            gadgetId: snap.gadgetId, name: snap.name, brand: snap.brand,
            specs: snap.specs, completeness: snap.completeness, defect: snap.defect,
            isExInter: !!snap.isExInter, accent: snap.accent, icon: snap.icon,
          },
          purchaseCost: snap.buyPrice || 0,
          repairCost:   snap.totalRepairCost || 0,
          salePrice:    price,
          feePaid:      fee,
          buyer:        (s.realEstate.store && s.realEstate.store.name) || "Walk-in Customer",
          receivingBank,
        });
      });
    }

    // Per-item Profile.markPostSold so old listing posts get crossed out
    if (window.Profile && window.Profile.markPostSold) {
      sold.forEach((l) => {
        window.Profile.markPostSold(l.listingId, {
          finalPrice: l.askingPrice,
          buyer: "Walk-in Customer @ " + ((s.realEstate.store && s.realEstate.store.name) || "Toko"),
          saleType: "walk-in",
        });
      });
    }
    if (window.Profile && window.Profile.recordSale) {
      // Single call — bumps totalGadgetsSold by sold.length internally
      // would be ideal, but the existing API takes a single sale. We
      // call it sold.length times on a no-op-cheap path.
      sold.forEach((l) => window.Profile.recordSale({ gadget: { isExInter: !!(l.itemSnapshot && l.itemSnapshot.isExInter) } }));
    }

    // ONE reputation delta covering all walk-in sales (silent — no per-item toast)
    if (window.Reputation && sold.length > 0) {
      const repGain = sold.length;  // +1 per walk-in (Part 43)
      // Skip the toast helper from onWalkInSale (which fires once); do it ourselves with a batch message.
      window.Reputation.applyDelta(repGain, `Walk-in batch: ${sold.length} unit`);
    }

    // ONE summary toast + ONE summary notification
    showToast(`🛍️ ${sold.length} walk-in sale${sold.length === 1 ? "" : "s"} — +${fmt(netSum)}`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Walk-in Sales: ${sold.length} unit`,
        message: `${sold.length} unit terjual ke pelanggan toko hari ini → +${fmt(netSum)} masuk Mandiri (gross ${fmt(grossSum)}).`,
        actionPage: "real-estate",
        actor: "Toko Fisik",
        icon: "shop",
      });
    }

    window.FlippingTycoon.saveGame();
  }

  function recomputeSuggested(listing) {
    const snap = listing.itemSnapshot || {};
    return window.Market.computeCurrentMarketPrice({
      gadgetId: snap.gadgetId,
      completeness: snap.completeness,
      defect: snap.defect,
      isExInter: !!snap.isExInter,
      imeiStatus: snap.imeiStatus || null,
      buyPrice: snap.buyPrice,
    });
  }

  function completeWalkInSale(listing, suggestedNow) {
    const s = S();
    const price = listing.askingPrice;
    const receivingBank = "Mandiri"; // walk-in cash always lands in Mandiri (toko op account)
    const tier = window.Banking.tierOf(s.bankBalances[receivingBank] || 0);
    const isPriority = tier === "priority";
    const baseFee = window.Inventory && window.Inventory.platformFeeRate
      ? window.Inventory.platformFeeRate()
      : (window.Repair && window.Repair.platformFeeRate ? window.Repair.platformFeeRate() : 0.05);
    const feeRate = isPriority ? 0 : baseFee;
    const fee = Math.round(price * feeRate);
    const net = price - fee;
    const itemName = listing.itemSnapshot.name;

    s.bankBalances[receivingBank] += net;
    s.bankHistories[receivingBank].push({
      type: "CREDIT",
      amount: net,
      balanceAfter: s.bankBalances[receivingBank],
      description: `Walk-in sale: ${itemName} @ ${(s.realEstate.store && s.realEstate.store.name) || "Toko"}` +
        (isPriority ? " (Priority - 0% fee)" : ` (after ${(baseFee*100).toFixed(0)}% fee)`),
      category: "walk-in-sale",
      day: s.currentDay,
      ts: Date.now(),
    });

    // Track in real-estate ledger.
    s.realEstate.walkInsHistory = s.realEstate.walkInsHistory || [];
    s.realEstate.walkInsHistory.unshift({
      day: s.currentDay,
      itemName,
      asking: price,
      suggested: suggestedNow,
      net,
      fee,
    });
    if (s.realEstate.walkInsHistory.length > 30) s.realEstate.walkInsHistory.pop();

    s.activeListings = s.activeListings.filter((l) => l.listingId !== listing.listingId);
    showToast(`🛍️ Walk-in: ${itemName} terjual ${fmt(net)}`);

    // Part 9: record walk-in sale to Analytics.
    if (window.Analytics) {
      const snap = listing.itemSnapshot || {};
      window.Analytics.recordSale({
        saleType: "walk-in",
        gadget: {
          gadgetId: snap.gadgetId, name: snap.name, brand: snap.brand,
          specs: snap.specs, completeness: snap.completeness, defect: snap.defect,
          isExInter: !!snap.isExInter, accent: snap.accent, icon: snap.icon,
        },
        purchaseCost: snap.buyPrice || 0,
        repairCost:   snap.totalRepairCost || 0,
        salePrice:    price,
        feePaid:      fee,
        buyer:        (s.realEstate.store && s.realEstate.store.name) || "Walk-in Customer",
        receivingBank,
      });
    }

    // Part 10: profile sync — mark post as sold (walk-in flavor) and bump stats.
    if (window.Profile) {
      const snap = listing.itemSnapshot || {};
      window.Profile.markPostSold(listing.listingId, {
        finalPrice: price,
        buyer: "Walk-in Customer @ " + ((s.realEstate.store && s.realEstate.store.name) || "Toko"),
        saleType: "walk-in",
      });
      window.Profile.recordSale({ gadget: { isExInter: !!snap.isExInter } });
    }

    // Part 43 — Reputation: +1 for a walk-in / Ruko sale (less than the
    // +3 Marketplace/Chat reward because there was no chat negotiation
    // effort). Fires a "Walk-in customer" toast.
    if (window.Reputation && window.Reputation.onWalkInSale) {
      window.Reputation.onWalkInSale({
        reason: `Walk-in sale: ${itemName}`,
      });
    }

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Walk-in Sale!",
        message: `${itemName} terjual ke pelanggan toko: +${fmt(net)} masuk Mandiri.`,
        actionPage: "banking",
        actor: "Toko Fisik",
        icon: "shop",
      });
    }
  }

  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderRealEstatePage() {
    ensureRealEstate();
    const s = S();
    const wrap = document.createElement("div");

    // Header
    const re = s.realEstate;
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-shop text-fuchsia-500"></i> Real Estate</h3>
          <p class="text-sm text-gray-500">Sewa ruko fisik, aktifkan Walk-in Customers, jual volume gede tanpa haggle.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Status</p>
          <p class="font-semibold text-sm ${re.rented ? "text-emerald-700" : "text-gray-600"}">
            ${re.rented ? "Aktif menyewa" : (re.evictedOnDay ? "Pernah diusir" : "Belum sewa")}
          </p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Eviction banner
    if (re.evictedOnDay && !re.rented) {
      const bn = document.createElement("div");
      bn.className = "fb-card eviction-banner";
      bn.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="upgrade-icon" style="background:#fee2e2;color:#991b1b">
            <i class="fa-solid fa-gavel"></i>
          </div>
          <div>
            <h3 class="text-rose-700">Kamu pernah diusir dari toko!</h3>
            <p class="text-sm text-gray-600 mt-1">Day ${re.evictedOnDay}: saldo Mandiri tidak cukup untuk sewa harian. Walk-in Customers nonaktif. Bisa sewa lagi kalau saldo sudah cukup.</p>
          </div>
        </div>
      `;
      wrap.appendChild(bn);
    }

    // Currently rented store status card
    if (re.rented && re.store) {
      wrap.appendChild(renderRentedCard(re));
    }

    // Available stores list
    const list = document.createElement("div");
    list.className = "store-list";
    STORES.forEach((store) => list.appendChild(renderStoreCard(store, re)));
    wrap.appendChild(list);

    // Walk-in history
    if (re.walkInsHistory && re.walkInsHistory.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `
        <h3 class="mb-2"><i class="fa-solid fa-receipt text-fuchsia-500"></i> Walk-in Sales (terbaru)</h3>
        <div class="walkin-history-list">
          ${re.walkInsHistory.map((w) => `
            <div class="walkin-history-row">
              <div>
                <p class="font-semibold text-sm">${w.itemName}</p>
                <p class="text-xs text-gray-500">Day ${w.day} &middot; asking ${fmt(w.asking)} &middot; suggested ${fmt(w.suggested)}</p>
              </div>
              <p class="walkin-history-net">+${fmt(w.net)}</p>
            </div>
          `).join("")}
        </div>
      `;
      wrap.appendChild(sec);
    }

    return wrap;
  }

  function renderRentedCard(re) {
    const store = re.store;
    const s = S();
    const card = document.createElement("div");
    card.className = "rented-store-card";
    const mandiri = s.bankBalances.Mandiri || 0;
    const safeDays = Math.floor(mandiri / store.dailyRent);
    card.innerHTML = `
      <div class="rs-banner" style="background:linear-gradient(135deg, ${store.accent} 0%, #1e1b4b 100%);">
        <div class="rs-icon"><i class="fa-solid fa-${store.icon}"></i></div>
        <div class="rs-title-block">
          <p class="rs-tag">CURRENTLY RENTING</p>
          <h2 class="rs-name">${store.name}</h2>
          <p class="rs-loc"><i class="fa-solid fa-location-dot"></i> ${store.location}</p>
        </div>
        <span class="rs-active-badge"><i class="fa-solid fa-circle text-[8px]"></i> Walk-in aktif</span>
      </div>
      <div class="rs-body">
        <div class="rs-stats">
          <div><p class="rs-stat-label">Sewa harian</p><p class="rs-stat-value">${fmt(store.dailyRent)}</p></div>
          <div><p class="rs-stat-label">Sudah sewa</p><p class="rs-stat-value">${re.daysRented} hari</p></div>
          <div><p class="rs-stat-label">Total bayar</p><p class="rs-stat-value">${fmt(re.totalPaid)}</p></div>
          <div><p class="rs-stat-label">Mandiri tahan</p><p class="rs-stat-value ${safeDays < 2 ? "text-rose-700" : "text-emerald-700"}">${safeDays} hari lagi</p></div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Sewa otomatis ditarik dari rekening Mandiri tiap Next Day. Kalau saldo kurang → diusir.
        </p>
        <button id="re-vacate" class="re-vacate-btn">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Vacate / Berhenti Sewa
        </button>
      </div>
    `;
    setTimeout(() => {
      const btn = document.querySelector("#re-vacate");
      if (btn) btn.addEventListener("click", () => {
        if (confirm(`Berhenti sewa ${store.name}? Walk-in Customers akan nonaktif.`)) {
          vacateStore();
          window.FlippingTycoon.renderActivePage();
        }
      });
    }, 0);
    return card;
  }

  function renderStoreCard(store, re) {
    const card = document.createElement("div");
    const isCurrent = !!(re.rented && re.store && re.store.id === store.id);
    card.className = "store-card" + (isCurrent ? " owned" : "");
    const s = S();
    const canAfford = (s.bankBalances.Mandiri || 0) >= store.dailyRent;
    card.innerHTML = `
      <div class="store-icon" style="background:${store.accent}22;color:${store.accent}">
        <i class="fa-solid fa-${store.icon}"></i>
      </div>
      <div class="store-body">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="store-name">${store.name}</h3>
          ${isCurrent ? `<span class="upgrade-owned-badge"><i class="fa-solid fa-check"></i> Aktif</span>` : ""}
        </div>
        <p class="store-loc"><i class="fa-solid fa-location-dot"></i> ${store.location}</p>
        <p class="store-blurb">${store.blurb}</p>
        <ul class="store-perks">
          ${store.perks.map((p) => `<li><i class="fa-solid fa-bolt"></i> ${p}</li>`).join("")}
        </ul>
      </div>
      <div class="store-action">
        <p class="store-rent">${fmt(store.dailyRent)}<span class="text-xs text-gray-500"> / hari</span></p>
        ${isCurrent
          ? `<button class="store-rent-btn" disabled><i class="fa-solid fa-circle-check"></i> Sedang Sewa</button>`
          : `<button class="store-rent-btn" data-id="${store.id}" ${canAfford ? "" : "disabled"}>
              <i class="fa-solid fa-key"></i> ${canAfford ? "Sewa Toko" : "Saldo Mandiri Kurang"}
            </button>`}
        <p class="text-[11px] text-gray-500 mt-1">Hari pertama dipotong saat sewa.<br>Selanjutnya otomatis tiap Next Day.</p>
      </div>
    `;
    if (!isCurrent && canAfford) {
      card.querySelector(".store-rent-btn").addEventListener("click", () => {
        if (confirm(`Sewa ${store.name} seharga ${fmt(store.dailyRent)}/hari?\n\nHari pertama langsung dipotong dari Mandiri sekarang.`)) {
          rentStore(store.id);
          window.FlippingTycoon.renderActivePage();
        }
      });
    }
    return card;
  }

  /* ---------- Toast (mirrors repair.js helper) ---------- */
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
  window.RealEstate = {
    renderRealEstatePage,
    rentStore,
    vacateStore,
    isRented,
    activeStoreMeta,
    processDailyRent,
    processWalkInSales,
    STORES,
  };
})();
