/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 7 — Batam Syndicate Imports (Bulk Cargo + Customs Risk)
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S()    { return window.FlippingTycoon.State.data; }

  /* ---------- Tunables ---------- */
  const DELIVERY_DAYS    = 3;
  const CUSTOMS_RISK     = 0.30;   // 30% chance shipment is Red Lined
  const CUSTOMS_FINE_PCT = 0.30;   // 30% of totalCost
  const CUSTOMS_GRACE    = 2;      // days to pay after arrival
  const BULK_DISCOUNT    = 0.50;   // 50% off basePrice ladder
  // Cargo "completeness" mix (Batam imports lean Batangan to feed the Toko Aksesoris loop)
  const COMP_BATANGAN_P  = 0.70;

  /* ---------- RNG helpers ---------- */
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uid(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 10); }

  function ensureCargo() {
    const s = S();
    if (!Array.isArray(s.batamCargo))   s.batamCargo = [];
    if (!Array.isArray(s.batamHistory)) s.batamHistory = [];
  }

  /* ---------- Pre-roll a manifest of items for a cargo ---------- */
  function rollCargoManifest(size) {
    const { GADGET_DATABASE, COMPLETENESS_OPTIONS, DEFECT_OPTIONS } = window.GadgetData;
    const fullset  = COMPLETENESS_OPTIONS.find((c) => c.type === "Fullset");
    const batangan = COMPLETENESS_OPTIONS.find((c) => c.short === "Batangan");

    // Defect distribution (weighted toward better cosmetic):
    //   Mulus 55%, Baret 25%, Battery 12%, Sensor 5%, LCD Retak 3%
    const defectWeights = [
      { d: DEFECT_OPTIONS.find((x) => x.severity === 0), w: 55 },
      { d: DEFECT_OPTIONS.find((x) => x.severity === 1), w: 25 },
      { d: DEFECT_OPTIONS.find((x) => x.severity === 2), w: 12 },
      { d: DEFECT_OPTIONS.find((x) => x.severity === 3), w:  5 },
      { d: DEFECT_OPTIONS.find((x) => x.severity === 4), w:  3 },
    ];
    const totalW = defectWeights.reduce((s, x) => s + x.w, 0);
    function rollDefect() {
      let r = Math.random() * totalW;
      for (const { d, w } of defectWeights) { if ((r -= w) <= 0) return d; }
      return defectWeights[0].d;
    }

    const items = [];
    let totalCost = 0;
    for (let i = 0; i < size; i++) {
      const gadget = pick(GADGET_DATABASE);
      const completeness = Math.random() < COMP_BATANGAN_P ? batangan : fullset;
      const defect = rollDefect();
      const raw = gadget.basePrice * completeness.multiplier * defect.multiplier * BULK_DISCOUNT;
      const buyPrice = Math.max(50_000, Math.round(raw / 50_000) * 50_000);
      totalCost += buyPrice;
      items.push({
        id: uid("imp"),
        gadgetId: gadget.id,
        name: gadget.model,
        brand: gadget.brand,
        specs: { ...gadget.specs },
        basePrice: gadget.basePrice,
        year: gadget.year,
        icon: gadget.icon,
        accent: gadget.accent,
        completeness,
        defect,
        hiddenDefect: null,
        buyPrice,
      });
    }
    return { items, totalCost };
  }

  /* =========================================================
   * Order flow
   * ========================================================= */
  function openOrderModal() {
    ensureCargo();
    const size = randInt(10, 20);
    const manifest = rollCargoManifest(size);
    showOrderModal(size, manifest);
  }

  function showOrderModal(size, manifest) {
    const modal = document.querySelector("#batam-modal");
    const titleEl = modal.querySelector("#batam-title");
    const subEl   = modal.querySelector("#batam-subtitle");
    const body    = modal.querySelector("#batam-body");
    const closeBtn = modal.querySelector("#batam-cancel");

    titleEl.textContent = "Order Kargo Container";
    subEl.textContent   = `${size} unit &middot; 50% off basePrice &middot; ETA ${DELIVERY_DAYS} hari`;

    const banks = ["Mandiri", "BCA", "BNI"];
    const totalCost = manifest.totalCost;
    const top3 = [...manifest.items].sort((a, b) => b.buyPrice - a.buyPrice).slice(0, 3);
    const rows = banks.map((b) => {
      const bal = S().bankBalances[b] || 0;
      const enough = bal >= totalCost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(bal)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(totalCost)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid #0e7490">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-500">Manifest preview</p>
            <p class="font-bold text-base">${size} unit kargo</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500">Total Bayar</p>
            <p class="text-xl font-bold">${fmt(totalCost)}</p>
          </div>
        </div>
        <div class="batam-manifest-preview">
          ${top3.map((it) => `
            <div class="batam-manifest-row">
              <i class="fa-solid fa-${it.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button"}" style="color:${it.accent}"></i>
              <span class="bm-name">${it.name}</span>
              <span class="bm-spec">${it.specs.ram}/${it.specs.rom}</span>
              <span class="bm-cond">${it.completeness.short}</span>
              <span class="bm-price">${fmt(it.buyPrice)}</span>
            </div>
          `).join("")}
          ${size > 3 ? `<p class="bm-more">...dan ${size - 3} unit lainnya, di-roll random saat order.</p>` : ""}
        </div>
        <p class="text-xs text-cyan-700 mt-2">
          <i class="fa-solid fa-clock"></i> Kargo tiba Day ${S().currentDay + DELIVERY_DAYS}.
        </p>
        <p class="text-xs text-rose-700 mt-1">
          <i class="fa-solid fa-triangle-exclamation"></i>
          ${Math.round(CUSTOMS_RISK * 100)}% risiko di-Red Line Bea Cukai (denda
          ${Math.round(CUSTOMS_FINE_PCT * 100)}% dari total cargo, harus dibayar dalam
          ${CUSTOMS_GRACE} hari atau disita).
        </p>
        <p class="text-xs text-gray-600 mt-1">
          <i class="fa-solid fa-circle-info"></i> Semua unit otomatis ditandai
          <b>Ex-Inter / No Pajak</b> &mdash; siap-siap servis IMEI juga.
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
        commitCargoOrder(size, manifest, btn.dataset.bank);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  function commitCargoOrder(size, manifest, sourceBank) {
    const s = S();
    if ((s.bankBalances[sourceBank] || 0) < manifest.totalCost) {
      showToast(`Saldo ${sourceBank} tidak cukup.`);
      return;
    }
    ensureCargo();
    s.bankBalances[sourceBank] -= manifest.totalCost;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: manifest.totalCost,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Batam Cargo (${size} unit) - bulk import`,
      category: "batam-order",
      day: s.currentDay,
      ts: Date.now(),
    });

    const cargo = {
      id: uid("cargo"),
      orderedDay: s.currentDay,
      arrivalDay: s.currentDay + DELIVERY_DAYS,
      size,
      totalCost: manifest.totalCost,
      paymentBank: sourceBank,
      status: "in-transit",
      items: manifest.items,
      customs: null,
      deliveredOnDay: null,
      confiscatedOnDay: null,
    };
    s.batamCargo.push(cargo);
    window.FlippingTycoon.saveGame();
    showToast(`📦 Kargo dipesan! Tiba Day ${cargo.arrivalDay}.`);
  }


  /* =========================================================
   * Day tick: arrivals + customs deadline
   * ========================================================= */
  function applyDayTickToCargo() {
    ensureCargo();
    const s = S();
    s.batamCargo.forEach((cargo) => {
      if (cargo.status === "in-transit" && s.currentDay >= cargo.arrivalDay) {
        handleArrival(cargo);
      } else if (cargo.status === "customs-hold" &&
                 cargo.customs &&
                 !cargo.customs.paid &&
                 s.currentDay > cargo.customs.deadlineDay) {
        confiscateCargo(cargo);
      }
    });
    // Cull confiscated/delivered cargos that have been around for >5 days, push to history.
    archiveOldCargos();
    window.FlippingTycoon.saveGame();
  }

  function handleArrival(cargo) {
    const redLined = Math.random() < CUSTOMS_RISK;
    if (!redLined) {
      deliverCargo(cargo, /*viaCustomsPaid=*/false);
      return;
    }
    const s = S();
    cargo.status = "customs-hold";
    cargo.customs = {
      flagged: true,
      fineAmount: Math.round((cargo.totalCost * CUSTOMS_FINE_PCT) / 50_000) * 50_000,
      deadlineDay: cargo.arrivalDay + CUSTOMS_GRACE,
      paid: false,
      paidOnDay: null,
      paidBank: null,
    };
    showToast(`🚨 Kargo ${cargo.id.slice(-4)} kena Red Line Bea Cukai!`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "warning",
        title: "Red Line Bea Cukai!",
        message: `Kargo ${cargo.id.slice(-4)} (${cargo.size} unit) kena Red Line. Bayar denda ${fmt(cargo.customs.fineAmount)} sebelum Day ${cargo.customs.deadlineDay} atau seluruh kargo disita.`,
        actionPage: "batam",
        actor: "Bea Cukai",
        icon: "circle-exclamation",
      });
    }
  }

  function deliverCargo(cargo, viaCustomsPaid) {
    const s = S();
    cargo.status = "delivered";
    cargo.deliveredOnDay = s.currentDay;
    // Each cargo item becomes an inventory line; tagged Ex-Inter.
    cargo.items.forEach((it) => {
      s.inventory.push({
        id: it.id,
        gadgetId: it.gadgetId,
        name: it.name,
        brand: it.brand,
        specs: it.specs,
        basePrice: it.basePrice,
        year: it.year,
        icon: it.icon,
        accent: it.accent,
        completeness: it.completeness,
        defect: it.defect,
        hiddenDefect: null,
        buyPrice: it.buyPrice,
        buyDay: s.currentDay,
        paymentMethod: "Batam Cargo",
        sourceBank: cargo.paymentBank,
        // Black-market provenance: Batam units start "ok" and roll for IMEI block daily.
        isExInter: true,
        imeiStatus: "ok",
        importedFromCargo: cargo.id,
      });
    });
    s.batamHistory.unshift({
      day: s.currentDay,
      cargoId: cargo.id,
      result: viaCustomsPaid ? "delivered-after-customs" : "delivered-clean",
      size: cargo.size,
      totalCost: cargo.totalCost,
      customsFine: viaCustomsPaid && cargo.customs ? cargo.customs.fineAmount : 0,
    });
    if (s.batamHistory.length > 20) s.batamHistory.pop();
    showToast(`✅ Kargo tiba: ${cargo.size} unit masuk ke Inventory.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: viaCustomsPaid ? "Kargo Tiba (Setelah Bayar Customs)" : "Kargo Tiba",
        message: `${cargo.size} unit dari Batam sudah masuk Inventory${viaCustomsPaid ? " setelah customs dibayar" : ""}. Cek statusnya — semua tagged Ex-Inter.`,
        actionPage: "inventory",
        actor: "Batam Syndicate",
        icon: "ship",
      });
    }
  }

  function confiscateCargo(cargo) {
    const s = S();
    cargo.status = "confiscated";
    cargo.confiscatedOnDay = s.currentDay;
    cargo.items = []; // gone forever
    s.batamHistory.unshift({
      day: s.currentDay,
      cargoId: cargo.id,
      result: "confiscated",
      size: cargo.size,
      totalCost: cargo.totalCost,
      customsFine: cargo.customs ? cargo.customs.fineAmount : 0,
    });
    if (s.batamHistory.length > 20) s.batamHistory.pop();
    showToast(`💀 Kargo ${cargo.id.slice(-4)} disita Bea Cukai!`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "alert",
        title: "Kargo Disita!",
        message: `Kargo ${cargo.id.slice(-4)} (${cargo.size} unit, modal ${fmt(cargo.totalCost)}) DISITA Bea Cukai. Modal hangus permanen.`,
        actionPage: "batam",
        actor: "Bea Cukai",
        icon: "skull",
      });
    }
  }

  function archiveOldCargos() {
    const s = S();
    s.batamCargo = s.batamCargo.filter((c) => {
      if (c.status === "delivered" && c.deliveredOnDay && s.currentDay - c.deliveredOnDay > 5) return false;
      if (c.status === "confiscated" && c.confiscatedOnDay && s.currentDay - c.confiscatedOnDay > 5) return false;
      return true;
    });
  }

  function customsAlertCount() {
    ensureCargo();
    return (S().batamCargo || []).filter(
      (c) => c.status === "customs-hold" && c.customs && !c.customs.paid
    ).length;
  }


  /* =========================================================
   * Pay Customs flow
   * ========================================================= */
  function openCustomsModal(cargoId) {
    const s = S();
    const cargo = s.batamCargo.find((c) => c.id === cargoId);
    if (!cargo || cargo.status !== "customs-hold" || !cargo.customs) return;

    const modal = document.querySelector("#batam-modal");
    const titleEl = modal.querySelector("#batam-title");
    const subEl   = modal.querySelector("#batam-subtitle");
    const body    = modal.querySelector("#batam-body");
    const closeBtn = modal.querySelector("#batam-cancel");

    titleEl.textContent = "Bayar Denda Bea Cukai";
    subEl.textContent   = `Kargo ${cargo.id.slice(-4)} kena Red Line - bayar atau disita.`;

    const banks = ["Mandiri", "BCA", "BNI"];
    const fine = cargo.customs.fineAmount;
    const remaining = cargo.customs.deadlineDay - s.currentDay;
    const rows = banks.map((b) => {
      const bal = s.bankBalances[b] || 0;
      const enough = bal >= fine;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(bal)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(fine)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid #b91c1c">
        <p class="text-xs text-gray-500">Cargo</p>
        <p class="font-semibold">${cargo.size} unit &middot; total bayar awal ${fmt(cargo.totalCost)}</p>
        <p class="text-xs text-gray-500 mt-2">Denda Customs (30%)</p>
        <p class="text-xl font-bold text-rose-700">${fmt(fine)}</p>
        <p class="text-xs ${remaining <= 0 ? "text-rose-700" : "text-amber-700"} mt-1">
          <i class="fa-solid fa-clock"></i>
          ${remaining > 0
            ? `Sisa ${remaining} hari sebelum disita (deadline Day ${cargo.customs.deadlineDay}).`
            : `Hari terakhir! Kalau gak bayar Next Day, kargo disita permanen.`}
        </p>
      </div>
      <p class="text-sm font-semibold mb-2">Bayar denda dari rekening mana?</p>
      <div class="relist-banks">${rows}</div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;

    body.querySelectorAll(".relist-bank-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        payCustomsFine(cargo, btn.dataset.bank);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  function payCustomsFine(cargo, sourceBank) {
    const s = S();
    if (!cargo.customs || cargo.customs.paid) return;
    const fine = cargo.customs.fineAmount;
    if ((s.bankBalances[sourceBank] || 0) < fine) {
      showToast(`Saldo ${sourceBank} tidak cukup.`);
      return;
    }
    s.bankBalances[sourceBank] -= fine;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: fine,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Bea Cukai fine - cargo ${cargo.id.slice(-4)} (${cargo.size} unit)`,
      category: "batam-customs",
      day: s.currentDay,
      ts: Date.now(),
    });
    cargo.customs.paid = true;
    cargo.customs.paidOnDay = s.currentDay;
    cargo.customs.paidBank = sourceBank;
    deliverCargo(cargo, /*viaCustomsPaid=*/true);
    window.FlippingTycoon.saveGame();
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderBatamPage() {
    ensureCargo();
    const s = S();
    const wrap = document.createElement("div");

    // Header card
    const totalActive = (s.batamCargo || []).filter((c) => c.status === "in-transit" || c.status === "customs-hold").length;
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-ship text-cyan-600"></i> Batam Syndicate</h3>
          <p class="text-sm text-gray-500">Pesan bulk container dari pelabuhan Batam &mdash; setengah harga, 3 hari proses, resiko Bea Cukai.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Active shipments</p>
          <p class="font-semibold text-sm">${totalActive}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Order CTA card
    const order = document.createElement("div");
    order.className = "fb-card batam-order-card";
    order.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="upgrade-icon" style="background:#cffafe;color:#0e7490;font-size:22px">
          <i class="fa-solid fa-truck-fast"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h3>Order Kargo Container</h3>
          <p class="text-sm text-gray-600 mt-1">
            Random 10&ndash;20 unit per kargo &middot; <b>50% off</b> dari basePrice
            &middot; ETA <b>${DELIVERY_DAYS} hari</b>.
          </p>
          <ul class="batam-order-perks">
            <li><i class="fa-solid fa-bolt"></i> Margin gede karena beli grosir, langsung Batangan-friendly buat repacking.</li>
            <li><i class="fa-solid fa-triangle-exclamation"></i> ${Math.round(CUSTOMS_RISK*100)}% RNG kena Red Line: bayar denda 30% dalam ${CUSTOMS_GRACE} hari atau seluruh kargo <b>disita</b>.</li>
            <li><i class="fa-solid fa-skull-crossbones"></i> Semua unit otomatis Ex-Inter (No Pajak) &mdash; rentan IMEI block.</li>
          </ul>
        </div>
        <button id="batam-order-btn" class="batam-order-btn">
          <i class="fa-solid fa-ship"></i> Order Cargo
        </button>
      </div>
    `;
    wrap.appendChild(order);
    setTimeout(() => {
      const btn = document.querySelector("#batam-order-btn");
      if (btn) btn.addEventListener("click", openOrderModal);
    }, 0);

    // Active cargos
    const activeCargos = (s.batamCargo || []).filter((c) => c.status === "in-transit" || c.status === "customs-hold" || c.status === "delivered" || c.status === "confiscated");
    if (activeCargos.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-anchor text-cyan-600"></i> Active &amp; Recent Shipments</h3>`;
      activeCargos.forEach((cargo) => sec.appendChild(renderCargoRow(cargo)));
      wrap.appendChild(sec);
    }

    // History
    if ((s.batamHistory || []).length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `
        <h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-cyan-600"></i> Shipment Log</h3>
        <div class="batam-history-list">
          ${s.batamHistory.map((h) => `
            <div class="batam-history-row ${h.result}">
              <div>
                <p class="font-semibold text-sm">Cargo ${h.cargoId.slice(-4)} &middot; ${h.size} unit</p>
                <p class="text-xs text-gray-500">Day ${h.day} &middot; total ${fmt(h.totalCost)}${h.customsFine ? ` &middot; denda ${fmt(h.customsFine)}` : ""}</p>
              </div>
              <span class="batam-history-tag tag-${h.result}">${
                h.result === "delivered-clean"          ? "Lolos &amp; Tiba" :
                h.result === "delivered-after-customs" ? "Tiba (Bayar Denda)" :
                h.result === "confiscated"              ? "Disita Bea Cukai" : h.result
              }</span>
            </div>
          `).join("")}
        </div>
      `;
      wrap.appendChild(sec);
    }

    return wrap;
  }


  function renderCargoRow(cargo) {
    const s = S();
    const row = document.createElement("div");
    row.className = "cargo-row " + cargo.status;

    const statusIcon = {
      "in-transit":   { icon: "ship",          color: "#0e7490", label: "In Transit" },
      "customs-hold": { icon: "circle-exclamation", color: "#b91c1c", label: "Red Line - Customs Hold" },
      "delivered":    { icon: "circle-check",  color: "#059669", label: "Delivered" },
      "confiscated":  { icon: "skull",         color: "#7f1d1d", label: "Confiscated" },
    }[cargo.status];

    let body = "";
    if (cargo.status === "in-transit") {
      const remaining = Math.max(0, cargo.arrivalDay - s.currentDay);
      body = `
        <p class="cargo-meta">${cargo.size} unit &middot; total bayar ${fmt(cargo.totalCost)}</p>
        <p class="text-xs text-gray-500">Order Day ${cargo.orderedDay} via ${cargo.paymentBank}</p>
        <p class="cargo-detail">
          <i class="fa-solid fa-rotate fa-spin"></i>
          ${remaining === 0 ? "Tiba Next Day" : `Sisa ${remaining} hari (tiba Day ${cargo.arrivalDay})`}
        </p>
      `;
    } else if (cargo.status === "customs-hold") {
      const remaining = cargo.customs.deadlineDay - s.currentDay;
      body = `
        <p class="cargo-meta">${cargo.size} unit &middot; total bayar ${fmt(cargo.totalCost)}</p>
        <p class="cargo-detail rose">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Kena Red Line. Denda <b>${fmt(cargo.customs.fineAmount)}</b>.
        </p>
        <p class="text-xs ${remaining <= 0 ? "text-rose-700 font-bold" : "text-amber-700 font-semibold"}">
          ${remaining > 0
            ? `Sisa ${remaining} hari (deadline Day ${cargo.customs.deadlineDay})`
            : `Hari terakhir &mdash; bayar sekarang atau Next Day disita!`}
        </p>
        <button class="cargo-pay-btn" data-id="${cargo.id}">
          <i class="fa-solid fa-money-bill-wave"></i> Bayar Denda Customs
        </button>
      `;
    } else if (cargo.status === "delivered") {
      body = `
        <p class="cargo-meta">${cargo.size} unit &middot; total bayar ${fmt(cargo.totalCost)}</p>
        <p class="cargo-detail emerald">
          <i class="fa-solid fa-circle-check"></i>
          Tiba Day ${cargo.deliveredOnDay}. Item sudah masuk Inventory.
        </p>
      `;
    } else if (cargo.status === "confiscated") {
      body = `
        <p class="cargo-meta">${cargo.size} unit &middot; total bayar ${fmt(cargo.totalCost)}</p>
        <p class="cargo-detail rose">
          <i class="fa-solid fa-skull"></i>
          Disita Day ${cargo.confiscatedOnDay}. Modal hangus.
        </p>
      `;
    }

    row.innerHTML = `
      <div class="cargo-icon" style="background:${statusIcon.color}22;color:${statusIcon.color}">
        <i class="fa-solid fa-${statusIcon.icon}"></i>
      </div>
      <div class="cargo-body">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="cargo-title">Cargo ${cargo.id.slice(-4)}</p>
          <span class="cargo-status-tag" style="background:${statusIcon.color}22;color:${statusIcon.color}">${statusIcon.label}</span>
        </div>
        ${body}
      </div>
    `;
    const payBtn = row.querySelector(".cargo-pay-btn");
    if (payBtn) payBtn.addEventListener("click", () => openCustomsModal(cargo.id));
    return row;
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
  window.Batam = {
    renderBatamPage,
    applyDayTickToCargo,
    customsAlertCount,
    openOrderModal,
    DELIVERY_DAYS,
    CUSTOMS_RISK,
    CUSTOMS_FINE_PCT,
    CUSTOMS_GRACE,
  };
})();
