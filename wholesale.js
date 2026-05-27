/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 11 — Wholesale (B2B) Bulk Orders
 *
 * Small-shop owner AI buyers post bulk orders for a single
 * gadget model (e.g., "Request: 20 units of iPhone 13 Pro Max").
 *
 *   - Prices are fixed (slightly below market) but high-volume.
 *   - Player must accept the order AND choose a Logistics Partner
 *     (JNE / J&T / SiCepat). Each has its own Speed vs Risk tradeoff.
 *   - On accept, qualifying stock (Mulus, IMEI-OK, optional condition
 *     filter) is reserved out of inventory + warehouse.
 *   - Speed = days until delivery. On delivery, RNG rolls for
 *     loss/damage; lost units are reimbursed at cost (not full price)
 *     so you only get paid for units that arrive intact.
 *   - When the Head of Logistics staff is hired, a 2% commission
 *     of the order value is deducted from the payout and tracked.
 *
 * Auto-process: window.Staff.processAutoAcceptWholesale (Part 11
 * patch in staff.js) accepts fulfillable open orders for you using
 * the staff's defaultPartner setting.
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }

  /* ---------- Logistics partners (Speed vs Risk) ---------- */
  const PARTNERS = {
    JNE: {
      id: "JNE",   name: "JNE",
      speedDays: 3, lossRate: 0.04, damageRate: 0.04, feeRate: 0.015,
      blurb: "Reliable klasik. Pelan tapi paling jarang ngilangin barang.",
      icon: "truck",   accent: "#dc2626",
    },
    "J&T": {
      id: "J&T",   name: "J&T Express",
      speedDays: 2, lossRate: 0.07, damageRate: 0.06, feeRate: 0.020,
      blurb: "Cepat & populer. Risiko menengah, fee menengah.",
      icon: "truck-fast", accent: "#dc2626",
    },
    SiCepat: {
      id: "SiCepat", name: "SiCepat",
      speedDays: 1, lossRate: 0.10, damageRate: 0.08, feeRate: 0.025,
      blurb: "Ekspres kilat. Sering ada paket retak / hilang di gudang transit.",
      icon: "rocket",  accent: "#f97316",
    },
  };

  /* ---------- Buyer pool: small shop owners ---------- */
  const BUYER_SHOPS = [
    { name: "Konter Berkah HP",    city: "Bandung",    avatar: "B", color: "#06b6d4" },
    { name: "Toko Sinar Jaya Cell",city: "Surabaya",   avatar: "S", color: "#84cc16" },
    { name: "Konter Maju Mundur",  city: "Bekasi",     avatar: "M", color: "#f59e0b" },
    { name: "Cell Plaza Margonda", city: "Depok",      avatar: "C", color: "#a855f7" },
    { name: "Hape Murah Ku",       city: "Tangerang",  avatar: "H", color: "#ef4444" },
    { name: "iStore Pelangi",      city: "Yogyakarta", avatar: "I", color: "#3b82f6" },
    { name: "Konter Bang Jago",    city: "Medan",      avatar: "J", color: "#10b981" },
    { name: "GadgetWorld Mart",    city: "Jakarta",    avatar: "G", color: "#ec4899" },
    { name: "Andalan Phone Shop",  city: "Semarang",   avatar: "A", color: "#7c3aed" },
    { name: "Pusat Hape Bekas",    city: "Makassar",   avatar: "P", color: "#0ea5e9" },
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function ensureWholesale() {
    const s = S();
    if (!Array.isArray(s.wholesaleOrders))  s.wholesaleOrders  = [];
    if (!Array.isArray(s.wholesaleHistory)) s.wholesaleHistory = [];
    if (!s.wholesaleView)                    s.wholesaleView    = { tab: "open" };
    if (typeof s.lastWholesaleGenDay !== "number") s.lastWholesaleGenDay = 0;
  }

  /* =========================================================
   * Order generation
   *
   * Spawn 2-4 fresh orders each day. Each order:
   *  - random gadget from DB
   *  - 5-30 unit qty (lower for premium phones)
   *  - per-unit price = basePrice * 0.78-0.92 (high volume = thinner margin)
   *  - condition requirement: 80% require Fullset, 20% Batangan; always Mulus
   *  - deadline: 3-5 days
   * ========================================================= */
  function generateDailyOrders() {
    ensureWholesale();
    const s = S();
    if (s.lastWholesaleGenDay === s.currentDay) return; // already generated today
    s.lastWholesaleGenDay = s.currentDay;

    const COMPLETENESS_OPTIONS = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
    const GADGET_DATABASE      = (window.GadgetData && window.GadgetData.GADGET_DATABASE)      || [];
    if (GADGET_DATABASE.length === 0) return;

    const count = randInt(2, 4);
    for (let i = 0; i < count; i++) {
      const gadget = pick(GADGET_DATABASE);
      // High-end phones = smaller qty; budget phones = larger qty.
      const qtyMax = gadget.basePrice >= 12_000_000 ? 12
                   : gadget.basePrice >= 6_000_000  ? 22
                   : 30;
      const qty = randInt(5, qtyMax);

      const wantBatangan = Math.random() < 0.20;
      const completeness = wantBatangan
        ? (COMPLETENESS_OPTIONS.find((c) => c.short === "Batangan") || COMPLETENESS_OPTIONS[1])
        : (COMPLETENESS_OPTIONS.find((c) => c.short === "Fullset")  || COMPLETENESS_OPTIONS[0]);

      // Wholesale price: thinner margin than market. Base * (0.78 - 0.92), rounded to 50k.
      const priceMul = 0.78 + Math.random() * 0.14;
      const completenessMul = completeness ? completeness.multiplier : 1;
      const rawUnit = gadget.basePrice * priceMul * completenessMul;
      const pricePerUnit = Math.max(50_000, Math.round(rawUnit / 50_000) * 50_000);

      const buyer = pick(BUYER_SHOPS);
      const deadlineDay = s.currentDay + randInt(3, 5);

      s.wholesaleOrders.push({
        id: uid("ord"),
        status: "open",                 // open | accepted | delivered | cancelled | failed
        createdDay: s.currentDay,
        deadlineDay,
        buyer,
        gadget: {
          id: gadget.id,
          name: gadget.model,
          brand: gadget.brand,
          accent: gadget.accent,
          icon: gadget.icon,
          basePrice: gadget.basePrice,
        },
        condition: {
          completenessShort: completeness ? completeness.short : "Fullset",
          requireMulus: true,
          requireImeiOk: true,
        },
        qty,
        pricePerUnit,
        totalValue: pricePerUnit * qty,
        // Filled when accepted
        partner: null,
        acceptedDay: null,
        deliversOnDay: null,
        consumedItemIds: [],
        // Filled on delivery
        delivery: null,
      });
    }

    // Cap open queue at 12 to avoid runaway.
    const openOnly = s.wholesaleOrders.filter((o) => o.status === "open");
    if (openOnly.length > 12) {
      const trim = openOnly.length - 12;
      let removed = 0;
      s.wholesaleOrders = s.wholesaleOrders.filter((o) => {
        if (removed >= trim && o.status === "open") return true;
        if (o.status === "open") { removed++; return false; }
        return true;
      });
    }
    window.FlippingTycoon.saveGame();
  }

  /** Drop open orders past their deadline and log them. */
  function expireOpenOrders() {
    ensureWholesale();
    const s = S();
    let expired = 0;
    s.wholesaleOrders = s.wholesaleOrders.filter((o) => {
      if (o.status === "open" && s.currentDay > o.deadlineDay) {
        pushHistory({
          ...o,
          status: "expired",
          closedDay: s.currentDay,
        });
        expired++;
        return false;
      }
      return true;
    });
    if (expired > 0) {
      window.FlippingTycoon.saveGame();
      if (window.Notifications) {
        window.Notifications.add({
          type: "info",
          title: `${expired} Bulk Order Expired`,
          message: `${expired} permintaan grosir lewat deadline tanpa di-accept. Cek tab History di Wholesale.`,
          actionPage: "wholesale",
          actor: "Wholesale Desk",
          icon: "hourglass-end",
        });
      }
    }
  }

  /* =========================================================
   * Accept flow
   * ========================================================= */
  function canFulfill(order) {
    if (!window.Warehouse) return false;
    const have = window.Warehouse.countQualifyingStock(order.gadget.id, {
      completenessShort: order.condition.completenessShort,
      requireMulus:      order.condition.requireMulus,
      requireImeiOk:     order.condition.requireImeiOk,
    });
    return have >= order.qty;
  }

  function acceptOrder(orderId, partnerId, opts) {
    ensureWholesale();
    const s = S();
    const order = s.wholesaleOrders.find((o) => o.id === orderId);
    if (!order)                       { showToast("Order tidak ditemukan."); return false; }
    if (order.status !== "open")      { showToast("Order ini sudah tidak open."); return false; }
    const partner = PARTNERS[partnerId];
    if (!partner)                     { showToast("Logistics partner tidak valid."); return false; }
    if (!window.Warehouse)            { showToast("Warehouse module belum siap."); return false; }
    if (!canFulfill(order))           { showToast(`Stok kurang. Butuh ${order.qty} unit ${order.gadget.name} kondisi ${order.condition.completenessShort} / Mulus.`); return false; }

    const picks = window.Warehouse.findQualifyingStock(order.gadget.id, order.qty, {
      completenessShort: order.condition.completenessShort,
      requireMulus:      order.condition.requireMulus,
      requireImeiOk:     order.condition.requireImeiOk,
    });
    if (picks.length < order.qty)     { showToast("Stok tiba-tiba berubah, refresh dan coba lagi."); return false; }

    // Snapshot purchase + repair cost so we can record COGS on delivery.
    const cogsTotal = picks.reduce((acc, p) => acc + (p.item.buyPrice || 0) + (p.item.totalRepairCost || 0), 0);
    const consumedIds = picks.map((p) => p.item.id);
    window.Warehouse.consumeStock(picks);

    order.status         = "accepted";
    order.partner        = partner.id;
    order.acceptedDay    = s.currentDay;
    order.deliversOnDay  = s.currentDay + partner.speedDays;
    order.consumedItemIds = consumedIds;
    order.cogsTotal      = cogsTotal;
    order.acceptedBy     = (opts && opts.acceptedBy) || "player";
    order.receivingBank  = (opts && opts.receivingBank) || "Mandiri";
    window.FlippingTycoon.saveGame();

    showToast(`🚚 Accepted! ${order.qty} unit ${order.gadget.name} via ${partner.name}, tiba Day ${order.deliversOnDay}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Bulk Order Accepted",
        message: `Order ${order.qty}x ${order.gadget.name} dari ${order.buyer.name} dikirim via ${partner.name} (Speed ${partner.speedDays}d, Risk ${(partner.lossRate*100).toFixed(0)}% loss / ${(partner.damageRate*100).toFixed(0)}% damage). Tiba Day ${order.deliversOnDay}.`,
        actionPage: "wholesale",
        actor: order.buyer.name,
        icon: partner.icon,
      });
    }
    return true;
  }

  function declineOrder(orderId) {
    ensureWholesale();
    const s = S();
    const idx = s.wholesaleOrders.findIndex((o) => o.id === orderId);
    if (idx < 0) return false;
    const order = s.wholesaleOrders[idx];
    if (order.status !== "open") { showToast("Order ini sudah tidak open."); return false; }
    pushHistory({ ...order, status: "declined", closedDay: s.currentDay });
    s.wholesaleOrders.splice(idx, 1);
    window.FlippingTycoon.saveGame();
    showToast("❌ Order ditolak.");
    return true;
  }

  /* =========================================================
   * Daily delivery processing
   *
   * For each accepted order whose deliversOnDay <= currentDay,
   * roll for loss/damage per unit, compute payout, deduct logistics
   * fee + (if HoL hired) 2% commission, credit to receivingBank.
   * ========================================================= */
  function processDailyShipments() {
    ensureWholesale();
    const s = S();
    const completed = [];

    s.wholesaleOrders.slice().forEach((order) => {
      if (order.status !== "accepted") return;
      if (s.currentDay < order.deliversOnDay) return;
      const partner = PARTNERS[order.partner] || PARTNERS.JNE;

      // Per-unit RNG: loss (gone, no payout) and damage (delivered but rejected).
      let lostUnits = 0, damagedUnits = 0;
      for (let i = 0; i < order.qty; i++) {
        const r = Math.random();
        if (r < partner.lossRate) lostUnits++;
        else if (r < partner.lossRate + partner.damageRate) damagedUnits++;
      }
      const arrivedUnits  = order.qty - lostUnits - damagedUnits;
      const grossRevenue  = arrivedUnits * order.pricePerUnit;
      const logisticsFee  = Math.round(arrivedUnits * order.pricePerUnit * partner.feeRate);

      // 2% staff commission if Head of Logistics is hired.
      const hasLogistics = !!(s.staff && s.staff.logistics && s.staff.logistics.hired);
      const commissionRate = hasLogistics ? 0.02 : 0;
      const commission = Math.round(grossRevenue * commissionRate);

      const netPayout = Math.max(0, grossRevenue - logisticsFee - commission);
      const bank = order.receivingBank || "Mandiri";
      s.bankBalances[bank] = (s.bankBalances[bank] || 0) + netPayout;
      s.bankHistories[bank].push({
        type: "CREDIT",
        amount: netPayout,
        balanceAfter: s.bankBalances[bank],
        description: `Wholesale ${order.gadget.name} x${arrivedUnits} → ${order.buyer.name} (via ${partner.name}, fee ${(partner.feeRate*100).toFixed(1)}%${commissionRate ? `, HoL 2%` : ""})`,
        category: "wholesale-sale",
        day: s.currentDay,
        ts: Date.now(),
      });

      if (commission > 0) {
        s.staff.logistics.totalCommission = (s.staff.logistics.totalCommission || 0) + commission;
      }

      // Record gross profit per arrived unit for analytics.
      if (window.Analytics && arrivedUnits > 0) {
        // Allocate cogs proportionally to arrived units (lost units = sunk cost we still ate).
        const perUnitCogs = order.qty > 0 ? (order.cogsTotal || 0) / order.qty : 0;
        const cogsArrived = Math.round(perUnitCogs * arrivedUnits);
        const cogsLost    = Math.round(perUnitCogs * (lostUnits + damagedUnits));
        // Treat the whole shipment as one "sale" record so it shows up in history.
        window.Analytics.recordSale({
          saleType: "wholesale",
          gadget: {
            gadgetId: order.gadget.id,
            name: `${order.gadget.name} x${arrivedUnits}`,
            brand: order.gadget.brand,
            specs: null,
            completeness: { type: order.condition.completenessShort, short: order.condition.completenessShort },
            defect: { type: "Mulus / No Minus", short: "Mulus" },
            isExInter: false,
            accent: order.gadget.accent,
            icon: order.gadget.icon,
          },
          purchaseCost: cogsArrived + cogsLost,   // we ate cost on lost units too
          repairCost:   0,
          salePrice:    grossRevenue,
          feePaid:      logisticsFee + commission,
          buyer:        order.buyer.name + " (B2B)",
          receivingBank: bank,
        });
      }

      const delivery = {
        deliveredDay: s.currentDay,
        partner: partner.id,
        lostUnits, damagedUnits, arrivedUnits,
        grossRevenue, logisticsFee, commission, netPayout, commissionRate,
        cogsTotal: order.cogsTotal || 0,
      };
      order.status   = lostUnits + damagedUnits === order.qty ? "failed" : "delivered";
      order.delivery = delivery;
      pushHistory({ ...order, closedDay: s.currentDay });
      completed.push(order);
    });

    // Remove finished orders from active list.
    if (completed.length > 0) {
      const ids = new Set(completed.map((o) => o.id));
      s.wholesaleOrders = s.wholesaleOrders.filter((o) => !ids.has(o.id));
      window.FlippingTycoon.saveGame();

      // Notifications: one per completed shipment.
      completed.forEach((order) => {
        const d = order.delivery;
        const partner = PARTNERS[order.partner];
        const lostBlurb = (d.lostUnits + d.damagedUnits) > 0
          ? ` ⚠️ ${d.lostUnits} hilang, ${d.damagedUnits} damaged.`
          : " 100% sampai utuh!";
        if (window.Notifications) {
          window.Notifications.add({
            type: order.status === "failed" ? "alert" : "success",
            title: order.status === "failed"
              ? `Bulk Shipment GAGAL — ${order.gadget.name}`
              : `Bulk Sale Lunas: ${order.gadget.name} x${d.arrivedUnits}`,
            message: `${order.buyer.name} via ${partner.name}.${lostBlurb} Net ${fmt(d.netPayout)} masuk ${order.receivingBank} (logistics fee ${fmt(d.logisticsFee)}${d.commission > 0 ? `, HoL commission ${fmt(d.commission)}` : ""}).`,
            actionPage: "wholesale",
            actor: partner.name,
            icon: order.status === "failed" ? "circle-xmark" : "truck-ramp-box",
          });
        }
      });
    }
  }

  function pushHistory(entry) {
    const s = S();
    s.wholesaleHistory.unshift(entry);
    if (s.wholesaleHistory.length > 60) s.wholesaleHistory.length = 60;
  }

  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderWholesalePage() {
    ensureWholesale();
    const s = S();
    const wrap = document.createElement("div");

    // Auto-generate the first batch if a player is opening this page on Day 1.
    if (s.lastWholesaleGenDay === 0 && s.wholesaleOrders.length === 0 && s.wholesaleHistory.length === 0) {
      generateDailyOrders();
    }

    const open      = s.wholesaleOrders.filter((o) => o.status === "open");
    const accepted  = s.wholesaleOrders.filter((o) => o.status === "accepted");
    const history   = s.wholesaleHistory;

    const hasLogistics = !!(s.staff && s.staff.logistics && s.staff.logistics.hired);
    const totalCommission = (s.staff && s.staff.logistics && s.staff.logistics.totalCommission) || 0;

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-truck-fast text-blue-600"></i> Wholesale (B2B)</h3>
          <p class="text-sm text-gray-500">Permintaan grosir dari konter HP kecil. Volume gede, margin tipis, kirim via JNE / J&amp;T / SiCepat.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Head of Logistics</p>
          <p class="font-semibold text-sm ${hasLogistics ? "text-emerald-700" : "text-gray-600"}">
            ${hasLogistics ? "Hired &middot; auto-process aktif" : "Belum di-hire"}
          </p>
          ${hasLogistics ? `<p class="text-[11px] text-gray-500">Commission paid: ${fmt(totalCommission)}</p>` : ""}
        </div>
      </div>
    `;
    wrap.appendChild(header);

    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    [
      { id: "open",      label: `Open (${open.length})`,         icon: "envelope-open-text" },
      { id: "in-transit",label: `In Transit (${accepted.length})`, icon: "truck-fast" },
      { id: "history",   label: `History (${history.length})`,    icon: "clock-rotate-left" },
    ].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.wholesaleView.tab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}`;
      btn.addEventListener("click", () => {
        s.wholesaleView.tab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.wholesaleView.tab === "in-transit") {
      wrap.appendChild(renderInTransitTab(accepted));
    } else if (s.wholesaleView.tab === "history") {
      wrap.appendChild(renderHistoryTab(history));
    } else {
      wrap.appendChild(renderOpenTab(open));
    }
    return wrap;
  }

  function renderOpenTab(orders) {
    const wrap = document.createElement("div");
    if (orders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl mb-3">
          <i class="fa-solid fa-envelope-open-text"></i>
        </div>
        <h3>Belum ada bulk order</h3>
        <p class="text-sm text-gray-500">Konter HP kecil bakal kirim permintaan di awal hari berikutnya.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    orders.forEach((o) => wrap.appendChild(renderOrderCard(o)));
    return wrap;
  }

  function renderOrderCard(order) {
    const s = S();
    const card = document.createElement("div");
    card.className = "fb-card wholesale-card";
    const have = window.Warehouse
      ? window.Warehouse.countQualifyingStock(order.gadget.id, {
          completenessShort: order.condition.completenessShort,
          requireMulus: order.condition.requireMulus,
          requireImeiOk: order.condition.requireImeiOk,
        })
      : 0;
    const need = order.qty;
    const ok   = have >= need;
    const daysLeft = order.deadlineDay - s.currentDay;

    card.innerHTML = `
      <div class="wholesale-head">
        <div class="wholesale-buyer">
          <div class="wholesale-avatar" style="background:${order.buyer.color}">${order.buyer.avatar}</div>
          <div>
            <p class="wholesale-buyer-name">${order.buyer.name}</p>
            <p class="wholesale-buyer-meta">${order.buyer.city} &middot; Day ${order.createdDay} &middot; deadline Day ${order.deadlineDay} (${daysLeft <= 0 ? "today" : daysLeft + "d left"})</p>
          </div>
        </div>
        <span class="wholesale-tag b2b"><i class="fa-solid fa-handshake"></i> B2B</span>
      </div>
      <div class="wholesale-body">
        <div class="wholesale-gadget">
          <i class="fa-solid fa-${order.gadget.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button"}" style="color:${order.gadget.accent || "#1c1c1e"}"></i>
          <div>
            <p class="wholesale-gadget-name">${order.gadget.name}</p>
            <p class="wholesale-gadget-meta">${order.gadget.brand} &middot; kondisi ${order.condition.completenessShort} / Mulus / IMEI Aman</p>
          </div>
        </div>
        <div class="wholesale-stats">
          <div><span>Qty</span><b>${order.qty} unit</b></div>
          <div><span>Harga / unit</span><b>${fmt(order.pricePerUnit)}</b></div>
          <div><span>Total order</span><b class="text-emerald-700">${fmt(order.totalValue)}</b></div>
          <div><span>Stok kamu</span><b class="${ok ? "text-emerald-700" : "text-rose-700"}">${have} / ${need}</b></div>
        </div>
      </div>
      <div class="wholesale-actions">
        <button class="wholesale-decline" data-id="${order.id}">
          <i class="fa-solid fa-xmark"></i> Decline
        </button>
        <button class="wholesale-accept" data-id="${order.id}" ${ok ? "" : "disabled"}>
          <i class="fa-solid fa-truck-fast"></i> ${ok ? "Accept &amp; Pick Logistics" : `Stok kurang (${have}/${need})`}
        </button>
      </div>
    `;

    card.querySelector(".wholesale-decline").addEventListener("click", () => {
      if (confirm(`Decline order ${order.qty}x ${order.gadget.name} dari ${order.buyer.name}?`)) {
        declineOrder(order.id);
        window.FlippingTycoon.renderActivePage();
      }
    });
    const acceptBtn = card.querySelector(".wholesale-accept");
    if (!acceptBtn.disabled) acceptBtn.addEventListener("click", () => openAcceptModal(order));
    return card;
  }

  function renderInTransitTab(orders) {
    const wrap = document.createElement("div");
    if (orders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-2xl mb-3">
          <i class="fa-solid fa-truck-fast"></i>
        </div>
        <h3>Tidak ada paket dalam pengiriman</h3>
        <p class="text-sm text-gray-500">Accept order di tab Open untuk mulai shipment.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    const s = S();
    orders.forEach((order) => {
      const partner = PARTNERS[order.partner];
      const left = order.deliversOnDay - s.currentDay;
      const card = document.createElement("div");
      card.className = "fb-card wholesale-card transit";
      card.innerHTML = `
        <div class="wholesale-head">
          <div class="wholesale-buyer">
            <div class="wholesale-avatar" style="background:${order.buyer.color}">${order.buyer.avatar}</div>
            <div>
              <p class="wholesale-buyer-name">${order.buyer.name}</p>
              <p class="wholesale-buyer-meta">via ${partner.name} &middot; tiba Day ${order.deliversOnDay} (${left <= 0 ? "today" : left + "d left"})</p>
            </div>
          </div>
          <span class="wholesale-tag transit"><i class="fa-solid fa-${partner.icon}"></i> ${partner.name}</span>
        </div>
        <div class="wholesale-body">
          <div class="wholesale-gadget">
            <i class="fa-solid fa-${order.gadget.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button"}" style="color:${order.gadget.accent || "#1c1c1e"}"></i>
            <div>
              <p class="wholesale-gadget-name">${order.gadget.name} x${order.qty}</p>
              <p class="wholesale-gadget-meta">Reserved dari Warehouse + Inventory &middot; ${order.consumedItemIds.length} unit</p>
            </div>
          </div>
          <div class="wholesale-stats">
            <div><span>Total order</span><b>${fmt(order.totalValue)}</b></div>
            <div><span>Logistics fee</span><b class="text-rose-700">~${fmt(Math.round(order.totalValue * partner.feeRate))}</b></div>
            <div><span>Risk loss / damage</span><b>${(partner.lossRate*100).toFixed(0)}% / ${(partner.damageRate*100).toFixed(0)}%</b></div>
            <div><span>Akan diterima di</span><b>${order.receivingBank}</b></div>
          </div>
        </div>
      `;
      wrap.appendChild(card);
    });
    return wrap;
  }

  function renderHistoryTab(history) {
    const wrap = document.createElement("div");
    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-2xl mb-3">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3>Belum ada riwayat</h3>
        <p class="text-sm text-gray-500">Setiap order yang selesai / decline / expired akan tercatat di sini.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    const card = document.createElement("div");
    card.className = "fb-card";
    card.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-blue-500"></i> Wholesale History</h3>`;
    const list = document.createElement("div");
    list.className = "bulk-log-list";
    history.forEach((entry) => list.appendChild(renderHistoryRow(entry)));
    card.appendChild(list);
    wrap.appendChild(card);
    return wrap;
  }

  function renderHistoryRow(o) {
    const meta = ({
      delivered: { icon: "truck-ramp-box", color: "#059669", label: "Delivered" },
      failed:    { icon: "circle-xmark",   color: "#b91c1c", label: "Failed (total loss)" },
      declined:  { icon: "ban",            color: "#6b7280", label: "Declined" },
      expired:   { icon: "hourglass-end",  color: "#9a3412", label: "Expired" },
    })[o.status] || { icon: "circle-info", color: "#6b7280", label: o.status };

    let detail = `${o.gadget.name} x${o.qty} &middot; ${o.buyer.name}`;
    if (o.delivery) {
      const d = o.delivery;
      detail += ` &middot; arrived ${d.arrivedUnits}/${o.qty} via ${d.partner} &middot; net ${fmt(d.netPayout)}` +
                (d.commission > 0 ? ` (HoL fee ${fmt(d.commission)})` : "");
    } else {
      detail += ` &middot; total ${fmt(o.totalValue)}`;
    }

    const row = document.createElement("div");
    row.className = "bulk-log-row";
    row.innerHTML = `
      <div class="bulk-log-icon" style="background:${meta.color}22;color:${meta.color}">
        <i class="fa-solid fa-${meta.icon}"></i>
      </div>
      <div class="bulk-log-body">
        <p class="bulk-log-title">${meta.label}</p>
        <p class="bulk-log-meta">Day ${o.closedDay || o.deadlineDay} &middot; ${detail}</p>
      </div>
    `;
    return row;
  }

  /* =========================================================
   * Accept modal: pick logistics partner + receiving bank
   * ========================================================= */
  function openAcceptModal(order) {
    const modal = document.querySelector("#wholesale-accept-modal");
    if (!modal) { showToast("Modal tidak ditemukan."); return; }
    const body  = modal.querySelector("#wholesale-accept-body");
    const titleEl = modal.querySelector("#wholesale-accept-title");
    const closeBtn = modal.querySelector("#wholesale-accept-cancel");

    titleEl.textContent = `Accept Bulk Order — ${order.gadget.name} x${order.qty}`;

    const hasLogistics = !!(S().staff && S().staff.logistics && S().staff.logistics.hired);
    const partnerCards = Object.values(PARTNERS).map((p) => {
      const fee = Math.round(order.totalValue * p.feeRate);
      return `
        <button class="logistics-card" data-partner="${p.id}">
          <div class="logistics-icon" style="background:${p.accent}22;color:${p.accent}">
            <i class="fa-solid fa-${p.icon}"></i>
          </div>
          <div class="logistics-body">
            <p class="logistics-name">${p.name}</p>
            <p class="logistics-blurb">${p.blurb}</p>
            <div class="logistics-stats">
              <div><span>Speed</span><b>${p.speedDays}d</b></div>
              <div><span>Loss</span><b class="text-rose-700">${(p.lossRate*100).toFixed(0)}%</b></div>
              <div><span>Damage</span><b class="text-amber-700">${(p.damageRate*100).toFixed(0)}%</b></div>
              <div><span>Fee</span><b>${(p.feeRate*100).toFixed(1)}% (~${fmt(fee)})</b></div>
            </div>
          </div>
        </button>
      `;
    }).join("");

    const banks = ["Mandiri", "BCA", "BNI"];
    const bankRows = banks.map((b) => `
      <label class="wholesale-bank-row">
        <input type="radio" name="ws-bank" value="${b}" ${b === "Mandiri" ? "checked" : ""}>
        <span>${b}</span>
      </label>
    `).join("");

    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Buyer</p>
        <p class="font-semibold">${order.buyer.name} (${order.buyer.city})</p>
        <p class="text-xs text-gray-500 mt-2">Order Value</p>
        <p class="text-xl font-bold text-emerald-700">${fmt(order.totalValue)}</p>
        <p class="text-[11px] text-gray-500 mt-1">${order.qty} unit ${order.gadget.name} &middot; ${order.condition.completenessShort} / Mulus / IMEI Aman</p>
        ${hasLogistics ? `<p class="text-[11px] text-amber-700 mt-2"><i class="fa-solid fa-circle-info"></i> Head of Logistics aktif: -2% commission akan dipotong dari hasil pengiriman.</p>` : ""}
      </div>
      <p class="text-sm font-semibold mb-2">Pilih Logistics Partner</p>
      <div class="logistics-grid">${partnerCards}</div>
      <p class="text-sm font-semibold mt-3 mb-1">Hasil masuk ke rekening</p>
      <div class="wholesale-bank-pick">${bankRows}</div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;

    body.querySelectorAll(".logistics-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        // Highlight selection then trigger accept on click.
        body.querySelectorAll(".logistics-card").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const partnerId = btn.dataset.partner;
        const bank = (body.querySelector('input[name="ws-bank"]:checked') || {}).value || "Mandiri";
        if (acceptOrder(order.id, partnerId, { receivingBank: bank })) {
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

  /* =========================================================
   * Sidebar badge: count fulfillable open orders
   * ========================================================= */
  function fulfillableOpenCount() {
    ensureWholesale();
    const s = S();
    if (!window.Warehouse) return 0;
    let n = 0;
    s.wholesaleOrders.forEach((o) => {
      if (o.status === "open" && canFulfill(o)) n++;
    });
    return n;
  }

  /* ---------- Public API ---------- */
  window.Wholesale = {
    PARTNERS,
    generateDailyOrders,
    expireOpenOrders,
    processDailyShipments,
    acceptOrder,
    declineOrder,
    canFulfill,
    fulfillableOpenCount,
    renderWholesalePage,
  };
})();
