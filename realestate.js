/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 6 — Real Estate / Storefront & Walk-in Customers
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  /* =========================================================
   * Store catalog (Part 27 — 4-tier ladder with display capacity)
   * Each tier defines:
   *   displayCapacity — how many items you can list in the store
   *   walkInBaseRate  — base sale-rate boost over the no-store baseline
   * ========================================================= */
  const STORES = [
    {
      id: "kios-kecil",
      tier: 1,
      name: "Kios Kecil",
      location: "Kompleks Pasar Senen, Jakarta",
      dailyRent: 1_500_000,
      displayCapacity: 150,
      walkInBaseRate: 0.10,
      icon: "store",
      accent: "#10b981",
      blurb: "Kios kecil di pasar — modal awal yang ramah, traffic lokal.",
      perks: [
        "Display max 150 item.",
        "Cocok buat reseller pemula yang baru naik dari online-only.",
      ],
    },
    {
      id: "ruko-itc-roxy",
      tier: 2,
      name: "Kios ITC",
      location: "ITC Roxy Mas, Jakarta Pusat",
      dailyRent: 5_000_000,
      displayCapacity: 800,
      walkInBaseRate: 0.18,
      icon: "shop",
      accent: "#a21caf",
      blurb: "Kios resmi di ITC Roxy. Lalu-lalang pembeli sepanjang hari.",
      perks: [
        "Display max 800 item.",
        "Walk-in customers aktif tiap Next Day.",
      ],
    },
    {
      id: "ruko-2-lantai",
      tier: 3,
      name: "Ruko 2 Lantai",
      location: "Mangga Dua Square, Jakarta",
      dailyRent: 12_500_000,
      displayCapacity: 2500,
      walkInBaseRate: 0.24,
      icon: "building",
      accent: "#1d4ed8",
      blurb: "Ruko 2 lantai dengan etalase besar — operasi serius mulai dari sini.",
      perks: [
        "Display max 2.500 item.",
        "Premium foot traffic, support full Service Center crew.",
      ],
    },
    {
      id: "premium-flagship",
      tier: 4,
      name: "Premium Flagship Store",
      location: "Pondok Indah Mall, Jakarta Selatan",
      dailyRent: 35_000_000,
      displayCapacity: 5000,
      walkInBaseRate: 0.30,
      icon: "building-columns",
      accent: "#f59e0b",
      blurb: "Flagship store eksklusif — branding premium, conversion tinggi.",
      perks: [
        "Display max 5.000 item.",
        "Foot traffic & ticket size paling tinggi di game.",
        "Repair Counter prestige — service customer quote 2x lebih percaya.",
      ],
    },
  ];

  /* Ruko-staff role catalog (Part 27 — max 3 hires) */
  const RUKO_ROLES = [
    {
      id: "sales",
      label: "Sales / SPG",
      icon: "user-tie",
      accent: "#10b981",
      salaryPerDay: 250_000,
      desc: "Customer service di etalase. Tiap SPG +20% walk-in sale rate.",
      effect: "+20% walk-in rate per staff",
    },
    {
      id: "technician",
      label: "Teknisi",
      icon: "screwdriver-wrench",
      accent: "#3b82f6",
      salaryPerDay: 400_000,
      desc: "Buka Repair Counter — service customer datang khusus benerin HP.",
      effect: "Unlocks Service Center (1-5 customers/day)",
    },
    {
      id: "sosmed",
      label: "Admin Sosmed",
      icon: "hashtag",
      accent: "#ec4899",
      salaryPerDay: 200_000,
      desc: "Bikin postingan promosi. Boost arrival rate online buyer +10%.",
      effect: "+10% online buyer offers/day",
    },
  ];
  const MAX_RUKO_STAFF = 3;

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
    // Part 27 — Ruko staff + service center state
    if (!Array.isArray(s.realEstate.rukoStaff))     s.realEstate.rukoStaff     = [];
    if (!Array.isArray(s.realEstate.serviceQueue))  s.realEstate.serviceQueue  = [];
    if (!Array.isArray(s.realEstate.serviceHistory)) s.realEstate.serviceHistory = [];
  }

  /* ---------- Part 27 — Capacity, Staff, Service helpers ---------- */
  function displayCapacity() {
    ensureRealEstate();
    const s = S();
    if (s.realEstate.rented && s.realEstate.store && typeof s.realEstate.store.displayCapacity === "number") {
      return s.realEstate.store.displayCapacity;
    }
    // No store rented: legacy default of 50 (online-only seller)
    return 50;
  }
  function displayUsed()     { return ((S().activeListings) || []).length; }
  function displayRemaining(){ return Math.max(0, displayCapacity() - displayUsed()); }
  function canListMore(n)    { return displayUsed() + (n || 1) <= displayCapacity(); }

  function getRukoStaff()    { ensureRealEstate(); return S().realEstate.rukoStaff || []; }
  function staffCount()      { return getRukoStaff().length; }
  function staffByRole(role) { return getRukoStaff().filter((s) => s.role === role); }
  function hasTechnician()   { return staffByRole("technician").length > 0; }
  function spgCount()        { return staffByRole("sales").length; }
  function sosmedCount()     { return staffByRole("sosmed").length; }

  function hireRukoStaff(roleId) {
    ensureRealEstate();
    if (staffCount() >= MAX_RUKO_STAFF) {
      showToast(`Max ${MAX_RUKO_STAFF} karyawan toko.`);
      return false;
    }
    const meta = RUKO_ROLES.find((r) => r.id === roleId);
    if (!meta) return false;
    const s = S();
    s.realEstate.rukoStaff.push({
      id: "ruko-" + Math.random().toString(36).slice(2, 10),
      role: meta.id,
      label: meta.label,
      hiredOnDay: s.currentDay,
      salaryPerDay: meta.salaryPerDay,
      totalPaid: 0,
    });
    window.FlippingTycoon.saveGame();
    showToast(`✅ ${meta.label} hired — gaji ${fmt(meta.salaryPerDay)}/hari.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `${meta.label} hired`,
        message: `${meta.label} bergabung di toko. Effect: ${meta.effect}.`,
        actionPage: "real-estate",
        icon: meta.icon,
      });
    }
    return true;
  }

  function fireRukoStaff(staffId) {
    ensureRealEstate();
    const s = S();
    const idx = s.realEstate.rukoStaff.findIndex((x) => x.id === staffId);
    if (idx === -1) return false;
    const removed = s.realEstate.rukoStaff.splice(idx, 1)[0];
    window.FlippingTycoon.saveGame();
    showToast(`${removed.label || "Staff"} dipecat.`);
    return true;
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
    // Part 27: tier-specific store base + per-SPG boost (max 3 SPG → +60%).
    const tierBase = (s.realEstate.store && typeof s.realEstate.store.walkInBaseRate === "number")
      ? s.realEstate.store.walkInBaseRate
      : 0.10;
    const spgBoost = spgCount() * 0.20;          // +20% per SPG hired
    const baseRate = tierBase + Math.random() * 0.20 + spgBoost;
    const repBoost = (window.Reputation && window.Reputation.isSuhu && window.Reputation.isSuhu()) ? 0.05 : 0;
    const saleRate = Math.min(0.80, baseRate + repBoost);
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
      // Part 27: capacity, staff, service center cards (only when rented)
      wrap.appendChild(renderCapacityCard(re));
      wrap.appendChild(renderStaffCard(re));
      if (hasTechnician()) {
        wrap.appendChild(renderServiceCenterCard(re));
      }
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

  /* ---------- Part 27: Capacity card ---------- */
  function renderCapacityCard(re) {
    const cap  = displayCapacity();
    const used = displayUsed();
    const remaining = cap - used;
    const pct  = cap > 0 ? Math.round((used / cap) * 100) : 0;
    const color = pct >= 90 ? "#dc2626" : pct >= 70 ? "#f59e0b" : "#10b981";
    const card = document.createElement("div");
    card.className = "fb-card ruko-capacity-card";
    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3><i class="fa-solid fa-warehouse text-fuchsia-500"></i> Display Capacity</h3>
          <p class="text-xs text-gray-500">Kapasitas etalase dibatasi tier ruko. Upgrade tier untuk lebih banyak listing.</p>
        </div>
        <p class="text-sm font-bold" style="color:${color}">${used.toLocaleString("id-ID")} / ${cap.toLocaleString("id-ID")}</p>
      </div>
      <div class="ruko-cap-track">
        <div class="ruko-cap-fill" style="width:${Math.min(100, pct)}%;background:${color}"></div>
      </div>
      <p class="text-xs mt-2 ${remaining <= 0 ? "text-rose-600 font-semibold" : "text-gray-500"}">
        ${remaining > 0 ? `Sisa slot: <b>${remaining.toLocaleString("id-ID")}</b>` : "🚫 Etalase penuh — gak bisa list barang baru sampai ada yang terjual."}
      </p>
    `;
    return card;
  }

  /* ---------- Part 27: Staff Management card (max 3) ---------- */
  function renderStaffCard(re) {
    const card = document.createElement("div");
    card.className = "fb-card ruko-staff-card";
    const staff = getRukoStaff();
    const slotsLeft = MAX_RUKO_STAFF - staff.length;

    const rosterHtml = staff.length === 0
      ? `<p class="text-sm text-gray-500">Belum ada karyawan toko. Hire SPG / Teknisi / Admin Sosmed di bawah ini.</p>`
      : `<div class="ruko-staff-list">${staff.map((x) => {
          const meta = RUKO_ROLES.find((r) => r.id === x.role) || {};
          return `
            <div class="ruko-staff-row" style="border-color:${meta.accent || "#d1d5db"}55">
              <div class="ruko-staff-avatar" style="background:${meta.accent || "#9ca3af"}">
                <i class="fa-solid fa-${meta.icon || "user"}"></i>
              </div>
              <div class="ruko-staff-info">
                <p class="ruko-staff-name">${x.label || meta.label || x.role}</p>
                <p class="ruko-staff-meta">Hired Day ${x.hiredOnDay} · Gaji ${fmt(x.salaryPerDay)}/hari · Total bayar ${fmt(x.totalPaid || 0)}</p>
              </div>
              <button class="modal-btn modal-btn-ghost ruko-fire-btn" data-id="${x.id}" title="Fire ${x.label || x.role}">
                <i class="fa-solid fa-user-xmark"></i>
              </button>
            </div>
          `;
        }).join("")}</div>`;

    const hireOptionsHtml = RUKO_ROLES.map((r) => {
      const alreadyMaxed = slotsLeft <= 0;
      return `
        <button class="ruko-hire-btn" data-role="${r.id}" ${alreadyMaxed ? "disabled" : ""}>
          <div class="ruko-hire-icon" style="background:${r.accent}">
            <i class="fa-solid fa-${r.icon}"></i>
          </div>
          <div class="ruko-hire-info">
            <p class="ruko-hire-label">${r.label}</p>
            <p class="ruko-hire-effect">${r.effect}</p>
            <p class="ruko-hire-salary">Gaji ${fmt(r.salaryPerDay)}/hari</p>
          </div>
          <i class="fa-solid fa-${alreadyMaxed ? "lock" : "circle-plus"} ruko-hire-cta"></i>
        </button>
      `;
    }).join("");

    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3><i class="fa-solid fa-user-tie text-emerald-600"></i> Karyawan Toko</h3>
          <p class="text-xs text-gray-500">Maks ${MAX_RUKO_STAFF} karyawan. Gaji terpotong dari Mandiri tiap Next Day.</p>
        </div>
        <p class="text-sm font-bold ${slotsLeft <= 0 ? "text-rose-600" : "text-emerald-700"}">
          ${staff.length} / ${MAX_RUKO_STAFF}
        </p>
      </div>
      ${rosterHtml}
      <p class="text-xs font-semibold text-gray-500 mt-3 mb-1 uppercase tracking-wide">Hire posisi</p>
      <div class="ruko-hire-list">${hireOptionsHtml}</div>
    `;

    card.querySelectorAll(".ruko-hire-btn").forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener("click", () => {
        if (hireRukoStaff(btn.dataset.role)) {
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
    card.querySelectorAll(".ruko-fire-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Fire karyawan ini?")) {
          fireRukoStaff(btn.dataset.id);
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
    return card;
  }

  /* ---------- Part 27: Service Center / Repair Counter card ---------- */
  function renderServiceCenterCard(re) {
    const card = document.createElement("div");
    card.className = "fb-card ruko-service-card";
    const queue = (re.serviceQueue || []).filter((q) => q.status === "pending");
    const history = (re.serviceHistory || []).slice(0, 5);

    const queueHtml = queue.length === 0
      ? `<p class="text-sm text-gray-500">Belum ada customer service hari ini. 1–5 customer akan datang tiap Next Day kalau Teknisi aktif.</p>`
      : queue.map((q) => `
          <div class="ruko-service-row" data-id="${q.id}">
            <div class="ruko-service-avatar" style="background:${q.color}">${q.avatar}</div>
            <div class="ruko-service-info">
              <p class="ruko-service-name">${q.name} <span class="text-xs text-gray-400">(D${q.arrivedDay} → exp D${q.expiresOnDay})</span></p>
              <p class="ruko-service-complaint">"${q.complaint}"</p>
              <p class="ruko-service-base">Base parts: <b>${fmt(q.baseCost)}</b> &middot; max quote (3×): ${fmt(q.baseCost * 3)}</p>
            </div>
            <div class="ruko-service-quote">
              <input type="text" inputmode="numeric" pattern="[0-9]*"
                     class="ruko-service-input"
                     placeholder="Biaya Servis (IDR)"
                     value="${q.baseCost * 2}"
                     data-id="${q.id}" />
              <button class="modal-btn modal-btn-primary ruko-quote-btn"
                      data-id="${q.id}" style="background:#10b981;color:#fff">
                <i class="fa-solid fa-paper-plane"></i> Kirim Quote
              </button>
            </div>
          </div>
        `).join("");

    const histHtml = history.length === 0
      ? ""
      : `
        <p class="text-xs font-semibold text-gray-500 mt-3 mb-1 uppercase tracking-wide">Service History</p>
        <div class="ruko-service-history">
          ${history.map((h) => `
            <div class="ruko-service-hist-row">
              <span class="text-xs text-gray-400">D${h.day}</span>
              <span class="text-sm">${h.name}</span>
              <span class="text-xs text-emerald-600 font-bold">+${fmt(h.profit)}</span>
            </div>
          `).join("")}
        </div>
      `;

    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3><i class="fa-solid fa-screwdriver-wrench text-blue-600"></i> Service Center</h3>
          <p class="text-xs text-gray-500">Repair counter aktif — customer datang khusus servis HP. Quote >3× base = customer kabur.</p>
        </div>
        <p class="text-sm font-semibold text-blue-700">${queue.length} antrean</p>
      </div>
      ${queueHtml}
      ${histHtml}
    `;

    // Sanitize numeric inputs (Part 17 pattern)
    card.querySelectorAll(".ruko-service-input").forEach((inp) => {
      const sanitize = () => {
        const cleaned = String(inp.value || "").replace(/[^0-9]/g, "");
        if (cleaned !== inp.value) inp.value = cleaned;
      };
      inp.addEventListener("input", sanitize);
      inp.addEventListener("paste", () => setTimeout(sanitize, 0));
    });
    card.querySelectorAll(".ruko-quote-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const inp = card.querySelector(`.ruko-service-input[data-id="${id}"]`);
        const quote = Number(String(inp.value || "0").replace(/[^0-9]/g, "")) || 0;
        if (completeServiceQuote(id, quote)) {
          window.FlippingTycoon.renderActivePage();
        } else {
          // Even on rejection (>3x customer leaves), re-render so the
          // ticket UI updates to its "rejected" state.
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
    return card;
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

  /* =========================================================
   * Part 27 — Daily salary tick for Ruko staff
   *
   * Called from advanceToNextDay BEFORE walk-in sales so SPG/Tech/
   * Sosmed effects only apply when their salary is actually paid.
   * Total cost = sum(salaryPerDay across rukoStaff). If Mandiri can't
   * cover it, all unpaid staff walk out (resigned).
   * ========================================================= */
  function processRukoStaffSalaries() {
    ensureRealEstate();
    const s = S();
    const staff = s.realEstate.rukoStaff || [];
    if (staff.length === 0) return;

    const total = staff.reduce((sum, x) => sum + (Number(x.salaryPerDay) || 0), 0);
    if (total <= 0) return;

    if ((s.bankBalances.Mandiri || 0) < total) {
      // Can't pay → all staff resign in protest
      const resigned = staff.slice();
      s.realEstate.rukoStaff = [];
      if (window.Notifications) {
        window.Notifications.add({
          type: "warning",
          title: "Karyawan Toko Resign!",
          message: `Saldo Mandiri gak cukup buat gaji ${total.toLocaleString("id-ID")} → ${resigned.length} karyawan toko walkout.`,
          actionPage: "real-estate",
          actor: "Ruko",
          icon: "person-walking-arrow-right",
        });
      }
      return;
    }

    s.bankBalances.Mandiri -= total;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: total,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Gaji harian karyawan toko (${staff.length} orang)`,
      category: "ruko-staff-salary",
      day: s.currentDay,
      ts: Date.now(),
    });
    staff.forEach((x) => { x.totalPaid = (x.totalPaid || 0) + (Number(x.salaryPerDay) || 0); });
  }

  /* =========================================================
   * Part 27 — Service Customer walk-ins (Repair Counter)
   *
   * Triggered each Next Day if at least one Technician is hired.
   * 1-5 customers spawn per day, each with a random complaint and
   * a randomized base repair cost (parts only — labour is the
   * player's quote). The customer ends up in serviceQueue and the
   * player decides the quote price via UI later.
   * ========================================================= */
  const COMPLAINTS = [
    { text: "Bang, HP saya mati total kena air, bisa benerin gak?",     base: [400_000,  900_000] },
    { text: "Mas, layar pecah parah nih, ganti LCD bisa?",              base: [600_000, 1_400_000] },
    { text: "Pak, baterai bocor cepat banget — perlu ganti baterai.",   base: [200_000,  500_000] },
    { text: "Bang, tombol power lengket, kebuka sendiri terus.",         base: [100_000,  300_000] },
    { text: "Mas, charger gak nge-detect — port USB rusak kayaknya.",    base: [250_000,  600_000] },
    { text: "Bang, speaker bunyi sember, ada cara servis?",              base: [150_000,  400_000] },
    { text: "Pak, IMEI invalid sehabis update — bisa flash ulang?",      base: [350_000,  800_000] },
    { text: "Mas, kamera blur terus, fokus gak jalan.",                  base: [400_000,  900_000] },
  ];
  const CUSTOMER_NAMES = [
    "Pak Budi", "Bu Sri", "Mas Andre", "Mbak Rina", "Bro Galih",
    "Pak Yusuf", "Mas Hendra", "Mbak Maya", "Pak Joko", "Bu Citra",
    "Mas Rizky", "Bro Dimas", "Mbak Vina", "Pak Bayu", "Bu Lina",
  ];
  const AVATAR_COLORS = ["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#06b6d4"];

  function makeServiceCustomer(day) {
    const c = COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)];
    const name = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];
    const base = Math.round((c.base[0] + Math.random() * (c.base[1] - c.base[0])) / 10_000) * 10_000;
    return {
      id: "svc-" + Math.random().toString(36).slice(2, 10),
      name,
      avatar: name.split(" ").slice(-1)[0].charAt(0).toUpperCase(),
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      complaint: c.text,
      baseCost: base,
      arrivedDay: day,
      expiresOnDay: day + 2,        // customer waits 2 days max for a quote
      status: "pending",            // pending | accepted | rejected | walked-out
    };
  }

  function processServiceWalkIns() {
    ensureRealEstate();
    if (!hasTechnician()) return;
    const s = S();

    // Expire any pending tickets older than expiresOnDay
    s.realEstate.serviceQueue = (s.realEstate.serviceQueue || []).filter((q) => {
      if (q.status !== "pending") return true;
      if (s.currentDay > q.expiresOnDay) return false; // walked out silently
      return true;
    });

    // Spawn 1-5 fresh tickets
    const count = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      s.realEstate.serviceQueue.unshift(makeServiceCustomer(s.currentDay));
    }
    if (s.realEstate.serviceQueue.length > 30) s.realEstate.serviceQueue.length = 30;

    if (window.Notifications) {
      window.Notifications.add({
        type: "info",
        title: `Service Counter: ${count} customer baru`,
        message: `${count} customer datang ke Repair Counter hari ini. Set quote harga di Real Estate page.`,
        actionPage: "real-estate",
        actor: "Service Center",
        icon: "screwdriver-wrench",
      });
    }
  }

  /* =========================================================
   * Part 27 — Player accepts a service ticket with a quote price
   * ========================================================= */
  function completeServiceQuote(ticketId, quotePrice) {
    ensureRealEstate();
    const s = S();
    const queue = s.realEstate.serviceQueue || [];
    const ticket = queue.find((q) => q.id === ticketId);
    if (!ticket || ticket.status !== "pending") {
      showToast("Ticket gak ditemukan atau udah closed.");
      return false;
    }
    const quote = Math.max(0, Math.round(Number(quotePrice) || 0));
    if (quote <= 0) {
      showToast("Quote price minimal Rp 1.");
      return false;
    }
    if (quote < ticket.baseCost) {
      showToast(`Quote terlalu rendah — base parts udah ${fmt(ticket.baseCost)}.`);
      return false;
    }

    // Reject if quote > 3x baseCost — customer leaves
    const ratio = quote / ticket.baseCost;
    if (ratio > 3) {
      ticket.status = "rejected";
      ticket.rejectedQuote = quote;
      window.FlippingTycoon.saveGame();
      showToast(`❌ ${ticket.name} kabur — quote ${ratio.toFixed(1)}x base, kemahalan!`);
      return false;
    }

    // Accept: deduct base cost from Mandiri (parts), credit total quote
    if ((s.bankBalances.Mandiri || 0) < ticket.baseCost) {
      showToast(`Saldo Mandiri kurang buat beli parts (${fmt(ticket.baseCost)}).`);
      return false;
    }
    s.bankBalances.Mandiri -= ticket.baseCost;
    s.bankHistories.Mandiri.push({
      type: "DEBIT",
      amount: ticket.baseCost,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Service parts: ${ticket.name} (${ticket.complaint.slice(0, 40)}…)`,
      category: "service-parts",
      day: s.currentDay,
      ts: Date.now(),
    });
    s.bankBalances.Mandiri += quote;
    s.bankHistories.Mandiri.push({
      type: "CREDIT",
      amount: quote,
      balanceAfter: s.bankBalances.Mandiri,
      description: `Service quote: ${ticket.name}`,
      category: "service-quote",
      day: s.currentDay,
      ts: Date.now(),
    });

    ticket.status = "accepted";
    ticket.acceptedQuote = quote;
    ticket.profit = quote - ticket.baseCost;

    s.realEstate.serviceHistory.unshift({
      id: ticket.id,
      day: s.currentDay,
      name: ticket.name,
      complaint: ticket.complaint,
      baseCost: ticket.baseCost,
      quote,
      profit: ticket.profit,
    });
    if (s.realEstate.serviceHistory.length > 30) s.realEstate.serviceHistory.length = 30;

    if (window.Reputation && window.Reputation.applyDelta) {
      window.Reputation.applyDelta(1, `Service repair: ${ticket.name}`);
    }

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Service Done: ${ticket.name}`,
        message: `${ticket.complaint.slice(0, 50)}… → quote ${fmt(quote)}, profit ${fmt(ticket.profit)}.`,
        actionPage: "real-estate",
        actor: "Service Center",
        icon: "screwdriver-wrench",
      });
    }
    showToast(`✅ Service done — profit ${fmt(ticket.profit)} masuk Mandiri.`);
    window.FlippingTycoon.saveGame();
    return true;
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
    // Part 27 — capacity, staff, service center
    displayCapacity,
    displayUsed,
    displayRemaining,
    canListMore,
    RUKO_ROLES,
    MAX_RUKO_STAFF,
    getRukoStaff,
    staffCount,
    hasTechnician,
    spgCount,
    sosmedCount,
    hireRukoStaff,
    fireRukoStaff,
    processRukoStaffSalaries,
    processServiceWalkIns,
    completeServiceQuote,
    STORES,
  };
})();
