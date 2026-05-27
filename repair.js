/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 4 — Repair Center + Business Upgrades
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  /* ---------- Repair fee table (per defect.type) ---------- */
  const REPAIR_COSTS = {
    "Layar Baret":            300_000,
    "Battery Health Drop":    500_000,
    "FaceID/Fingerprint Off": 900_000,
    "Layar Retak":            1_500_000,
  };

  /* ---------- IMEI tembak service constants (Part 6) ---------- */
  const IMEI_TEMBAK_COST = 2_000_000;
  const IMEI_TEMBAK_DAYS = 2;
  const IMEI_BLOCK_CHANCE = 0.15;

  /* ---------- Upgrade catalog ---------- */
  const UPGRADES = [
    {
      id: "premiumTools",
      name: "Premium Tools",
      blurb: "Repair toolkit lengkap (heatgun, microscope, special screwdrivers).",
      effect: "Reduces repair time from 1 Day to Instant (0 Days).",
      cost: 15_000_000,
      icon: "screwdriver-wrench",
      accent: "#f59e0b",
    },
    {
      id: "fbPaidAds",
      name: "FB Paid Ads",
      blurb: "Boost listing reach via Gadgetbook Ads Manager.",
      effect: "Default Marketplace platform fee: 5% to 2% forever (Priority still 0%).",
      cost: 25_000_000,
      icon: "bullhorn",
      accent: "#1877F2",
    },
  ];

  /* ---------- Helpers exposed to inventory.js ---------- */
  function platformFeeRate() {
    return S().upgrades && S().upgrades.fbPaidAds ? 0.02 : 0.05;
  }
  function isImeiUnlocking(item) {
    return !!(item && item.imeiUnlock && item.imeiUnlock.status === "in-progress");
  }
  function isLocked(item) {
    return !!(item && (
      (item.repair && item.repair.status === "in-progress") ||
      isImeiUnlocking(item)
    ));
  }



  /* =========================================================
   * Tick: called from script.js advanceToNextDay()
   * Completes repairs whose completesOnDay <= currentDay.
   * ========================================================= */
  function applyDayTickToRepairs() {
    const s = S();
    (s.inventory || []).forEach((item) => {
      const r = item.repair;
      if (r && r.status === "in-progress" && r.completesOnDay <= s.currentDay) {
        finishRepair(item);
      }
    });
  }

  function finishRepair(item) {
    // Flip defect to Mulus permanently.
    const mulus = window.GadgetData.DEFECT_OPTIONS.find((d) => d.severity === 0);
    if (item.repair) item.repair.status = "completed";
    item.previousDefect = item.defect;
    item.defect = mulus;
    item.hiddenDefect = null;
    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * Part 6 — IMEI block risk + Tembak IMEI day tick
   * ========================================================= */
  function applyDayTickToImeiUnlocks() {
    const s = S();
    (s.inventory || []).forEach((item) => {
      const u = item.imeiUnlock;
      if (u && u.status === "in-progress" && u.completesOnDay <= s.currentDay) {
        finishImeiUnlock(item);
      }
    });
  }

  function finishImeiUnlock(item) {
    if (item.imeiUnlock) item.imeiUnlock.status = "completed";
    item.imeiStatus = "unlocked"; // permanent: immune to future blocks, value restored
    showToast(`✅ IMEI ${item.name} berhasil ditembak! Sekarang aman dari blokir.`);
    window.FlippingTycoon.saveGame();
  }

  /** 15% chance per day each Ex-Inter inventory unit gets its IMEI blocked. */
  function processImeiBlockRisk() {
    const s = S();
    let blockedCount = 0;
    (s.inventory || []).forEach((item) => {
      if (!item.isExInter) return;
      if (item.imeiStatus !== "ok") return;   // skip blocked / unlocked / unlocking
      if (isLocked(item)) return;             // protected while in service
      if (Math.random() < IMEI_BLOCK_CHANCE) {
        item.imeiStatus = "blocked";
        item.imeiBlockedOnDay = s.currentDay;
        blockedCount++;
      }
    });
    if (blockedCount > 0) {
      showToast(`⚠️ ${blockedCount} unit Ex-Inter kena IMEI block hari ini! Cek Repair Center.`);
    }
    if (blockedCount > 0) window.FlippingTycoon.saveGame();
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderRepairCenterPage() {
    const s = S();
    if (!s.repairView) s.repairView = { activeTab: "repairs" };
    const wrap = document.createElement("div");

    const ownedCount = Object.values(s.upgrades || {}).filter(Boolean).length;
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-screwdriver-wrench text-rose-500"></i> Repair Center</h3>
          <p class="text-sm text-gray-500">Service barang minus, lalu jual ulang dengan harga mulus 100%.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Upgrades</p>
          <p class="font-semibold text-sm">${ownedCount} / ${UPGRADES.length}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    const blockedCount = (s.inventory || []).filter((it) => it.imeiStatus === "blocked").length;
    [{ id: "repairs", label: "Active Repairs", icon: "wrench" },
     { id: "imei", label: "IMEI Service", icon: "skull-crossbones", badge: blockedCount },
     { id: "upgrades", label: "Upgrades & Perks", icon: "star" }].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.repairView.activeTab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}${t.badge ? ` <span class="subtab-badge">${t.badge}</span>` : ""}`;
      btn.addEventListener("click", () => {
        s.repairView.activeTab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.repairView.activeTab === "upgrades") wrap.appendChild(renderUpgradesTab());
    else if (s.repairView.activeTab === "imei") wrap.appendChild(renderImeiTab());
    else wrap.appendChild(renderRepairsTab());
    return wrap;
  }



  /* ---------- Repairs tab ---------- */
  function renderRepairsTab() {
    const s = S();
    const wrap = document.createElement("div");

    const inProgress = (s.inventory || []).filter((it) => isLocked(it));
    const defective = (s.inventory || []).filter(
      (it) => !isLocked(it) && it.defect && it.defect.severity > 0
    );

    if (inProgress.length === 0 && defective.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 text-2xl mb-3">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <h3>Semua barang sudah mulus</h3>
        <p class="text-sm text-gray-500">Belum ada barang minus di Inventory yang perlu diservice.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    if (inProgress.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-rotate text-rose-500"></i> Sedang Diservice</h3>`;
      inProgress.forEach((it) => sec.appendChild(renderRepairRow(it, true)));
      wrap.appendChild(sec);
    }

    if (defective.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i> Bisa Diservice</h3>`;
      defective.forEach((it) => sec.appendChild(renderRepairRow(it, false)));
      wrap.appendChild(sec);
    }
    return wrap;
  }


  function renderRepairRow(item, locked) {
    const s = S();
    const cost = REPAIR_COSTS[item.defect.type] || 0;
    const accent = item.accent || "#1c1c1e";
    const iconName = item.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    const row = document.createElement("div");
    row.className = "repair-row";

    if (locked) {
      const r = item.repair;
      const remaining = Math.max(0, r.completesOnDay - s.currentDay);
      row.innerHTML = `
        <div class="repair-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
        <div class="repair-body">
          <p class="repair-title">${item.name}</p>
          <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; bekas defect: <b>${(item.previousDefect || item.defect).type}</b></p>
          <p class="text-xs text-gray-500 mt-1">Mulai Day ${r.startDay} &middot; Selesai Day ${r.completesOnDay}</p>
        </div>
        <div class="repair-action">
          <span class="repair-progress-badge"><i class="fa-solid fa-rotate fa-spin"></i> ${remaining === 0 ? "Selesai besok" : "Sisa " + remaining + " hari"}</span>
          <p class="text-xs text-gray-500 mt-1">Bayar: ${fmt(r.paidFee)} via ${r.sourceBank}</p>
        </div>
      `;
      return row;
    }

    row.innerHTML = `
      <div class="repair-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
      <div class="repair-body">
        <p class="repair-title">${item.name}</p>
        <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="repair-defects">
          <span class="market-badge bg-rose-100 text-rose-700">${item.defect.type}</span>
          ${item.hiddenDefect ? `<span class="market-badge bg-amber-100 text-amber-800" title="${item.hiddenDefect}">+ hidden</span>` : ""}
        </div>
      </div>
      <div class="repair-action">
        <p class="repair-cost">${fmt(cost)}</p>
        <button class="repair-fix-btn" data-id="${item.id}"><i class="fa-solid fa-wrench"></i> Fix Defect</button>
      </div>
    `;
    row.querySelector(".repair-fix-btn").addEventListener("click", () => openRepairModal(item, cost));
    return row;
  }



  /* ---------- Repair modal ---------- */
  function openRepairModal(item, cost) {
    const modal = document.querySelector("#repair-modal");
    const body = modal.querySelector("#repair-body");
    const closeBtn = modal.querySelector("#repair-cancel");

    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const balance = S().bankBalances[b] || 0;
      const enough = balance >= cost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(balance)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(cost)}</b></span></div>
        </button>`;
    }).join("");

    const instant = !!(S().upgrades && S().upgrades.premiumTools);
    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold">${item.name} &middot; ${item.specs.ram}/${item.specs.rom}</p>
        <p class="text-xs text-gray-500 mt-2">Defect</p>
        <p class="font-semibold text-rose-700">${item.defect.type}</p>
        <p class="text-xs text-gray-500 mt-2">Biaya servis</p>
        <p class="text-xl font-bold">${fmt(cost)}</p>
        <p class="text-xs ${instant ? "text-emerald-700" : "text-gray-500"} mt-1">
          <i class="fa-solid fa-clock"></i>
          ${instant ? "Premium Tools aktif - selesai INSTAN." : "Servis selesai 1 hari kerja (selesai setelah Next Day)."}
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
        startRepair(item, btn.dataset.bank, cost);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }


  function startRepair(item, sourceBank, cost) {
    const s = S();
    if ((s.bankBalances[sourceBank] || 0) < cost) return;
    s.bankBalances[sourceBank] -= cost;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: cost,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Repair Cost: ${item.name} (${item.defect.type})`,
      category: "repair",
      day: s.currentDay,
      ts: Date.now(),
    });

    const instant = !!(s.upgrades && s.upgrades.premiumTools);
    item.repair = {
      startDay: s.currentDay,
      completesOnDay: instant ? s.currentDay : s.currentDay + 1,
      paidFee: cost,
      sourceBank,
      status: instant ? "completed" : "in-progress",
    };
    item.previousDefect = item.defect;

    if (instant) {
      finishRepair(item);
      showToast(`Repair instan! ${item.name} sekarang Mulus.`);
    } else {
      window.FlippingTycoon.saveGame();
      showToast(`Repair dimulai. ${item.name} selesai Day ${item.repair.completesOnDay}.`);
    }
  }



  /* =========================================================
   * IMEI Service tab (Part 6)
   * ========================================================= */
  function renderImeiTab() {
    const wrap = document.createElement("div");
    const items = S().inventory || [];

    const inProgress = items.filter(isImeiUnlocking);
    const blocked = items.filter((it) => it.imeiStatus === "blocked" && !isLocked(it));
    const safeOk = items.filter((it) => it.isExInter && it.imeiStatus === "ok" && !isLocked(it));
    const safeUnlocked = items.filter((it) => it.imeiStatus === "unlocked");

    // Top info card explaining the service.
    const info = document.createElement("div");
    info.className = "fb-card imei-info";
    info.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="upgrade-icon" style="background:#f3e8ff;color:#7e22ce">
          <i class="fa-solid fa-skull-crossbones"></i>
        </div>
        <div>
          <h3>Jasa Tembak IMEI (Underground)</h3>
          <p class="text-sm text-gray-600 mt-1">
            Khusus unit Ex-Inter yang IMEI-nya kena blokir Bea Cukai. Biaya
            <b>${fmt(IMEI_TEMBAK_COST)}</b> per unit, proses
            <b>${IMEI_TEMBAK_DAYS} hari</b>. Setelah selesai, IMEI ditembak ke
            database resmi: <span class="text-emerald-700 font-semibold">imun dari blokir</span>
            dan nilai pulih 100%.
          </p>
          <p class="text-xs text-amber-700 mt-2"><i class="fa-solid fa-triangle-exclamation"></i>
            Setiap Next Day, ${Math.round(IMEI_BLOCK_CHANCE * 100)}% unit Ex-Inter di Inventory bisa kena blokir IMEI.
          </p>
        </div>
      </div>
    `;
    wrap.appendChild(info);

    if (inProgress.length === 0 && blocked.length === 0 && safeOk.length === 0 && safeUnlocked.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-purple-50 flex items-center justify-center text-purple-500 text-2xl mb-3">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h3>Belum punya unit Ex-Inter</h3>
        <p class="text-sm text-gray-500">Cari listing dengan tag "No Pajak" di Marketplace untuk margin gede (resiko IMEI block).</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    if (inProgress.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-rotate text-purple-500"></i> Sedang Ditembak</h3>`;
      inProgress.forEach((it) => sec.appendChild(renderImeiRow(it, "in-progress")));
      wrap.appendChild(sec);
    }
    if (blocked.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-signal-slash text-red-500"></i> IMEI Terblokir</h3>`;
      blocked.forEach((it) => sec.appendChild(renderImeiRow(it, "blocked")));
      wrap.appendChild(sec);
    }
    if (safeOk.length + safeUnlocked.length > 0) {
      const sec = document.createElement("div");
      sec.className = "fb-card";
      sec.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-shield-halved text-emerald-500"></i> Status Ex-Inter</h3>`;
      safeUnlocked.forEach((it) => sec.appendChild(renderImeiRow(it, "unlocked")));
      safeOk.forEach((it) => sec.appendChild(renderImeiRow(it, "ok")));
      wrap.appendChild(sec);
    }
    return wrap;
  }

  function renderImeiRow(item, status) {
    const accent = item.accent || "#1c1c1e";
    const iconName = item.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    const row = document.createElement("div");
    row.className = "repair-row";

    if (status === "in-progress") {
      const u = item.imeiUnlock;
      const remaining = Math.max(0, u.completesOnDay - S().currentDay);
      row.innerHTML = `
        <div class="repair-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
        <div class="repair-body">
          <p class="repair-title">${item.name}</p>
          <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; <b>Tembak IMEI in progress</b></p>
          <p class="text-xs text-gray-500 mt-1">Mulai Day ${u.startDay} &middot; Selesai Day ${u.completesOnDay}</p>
        </div>
        <div class="repair-action">
          <span class="imei-progress-badge"><i class="fa-solid fa-rotate fa-spin"></i> ${remaining === 0 ? "Selesai besok" : "Sisa " + remaining + " hari"}</span>
          <p class="text-xs text-gray-500 mt-1">Bayar: ${fmt(u.paidFee)} via ${u.sourceBank}</p>
        </div>
      `;
      return row;
    }

    if (status === "blocked") {
      row.innerHTML = `
        <div class="repair-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
        <div class="repair-body">
          <p class="repair-title">${item.name}</p>
          <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; ${item.specs.color}</p>
          <div class="repair-defects">
            <span class="market-badge bg-red-200 text-red-800"><i class="fa-solid fa-signal-slash"></i> IMEI Terblokir</span>
            <span class="market-badge bg-rose-100 text-rose-700">Nilai -60%</span>
          </div>
        </div>
        <div class="repair-action">
          <p class="repair-cost">${fmt(IMEI_TEMBAK_COST)}</p>
          <button class="repair-fix-btn imei-btn" data-id="${item.id}"><i class="fa-solid fa-bullseye"></i> Tembak IMEI</button>
        </div>
      `;
      row.querySelector(".repair-fix-btn").addEventListener("click", () => openImeiModal(item));
      return row;
    }

    // ok or unlocked
    const isUnlocked = status === "unlocked";
    const badgeClass = isUnlocked ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800";
    const badgeIcon = isUnlocked ? "shield-halved" : "circle-question";
    const badgeText = isUnlocked ? "IMEI Aman (Tembakan)" : "Belum Diblokir";
    row.innerHTML = `
      <div class="repair-icon"><i class="fa-solid fa-${iconName} text-3xl" style="color:${accent}"></i></div>
      <div class="repair-body">
        <p class="repair-title">${item.name}</p>
        <p class="repair-meta">${item.specs.ram}/${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="repair-defects">
          <span class="market-badge ${badgeClass}"><i class="fa-solid fa-${badgeIcon}"></i> ${badgeText}</span>
        </div>
      </div>
      <div class="repair-action">
        ${isUnlocked
          ? `<span class="text-xs text-emerald-700 font-semibold"><i class="fa-solid fa-lock"></i> Imun blokir</span>`
          : `<span class="text-xs text-amber-700 font-semibold"><i class="fa-solid fa-dice"></i> Resiko ${Math.round(IMEI_BLOCK_CHANCE*100)}%/hari</span>`}
      </div>
    `;
    return row;
  }

  function openImeiModal(item) {
    const modal = document.querySelector("#repair-modal");
    const body = modal.querySelector("#repair-body");
    const closeBtn = modal.querySelector("#repair-cancel");

    const banks = ["Mandiri", "BCA", "BNI"];
    const cost = IMEI_TEMBAK_COST;
    const rows = banks.map((b) => {
      const balance = S().bankBalances[b] || 0;
      const enough = balance >= cost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(balance)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(cost)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid #a855f7">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold">${item.name} &middot; ${item.specs.ram}/${item.specs.rom}</p>
        <p class="text-xs text-gray-500 mt-2">Status</p>
        <p class="font-semibold text-rose-700"><i class="fa-solid fa-signal-slash"></i> IMEI Terblokir (No Signal)</p>
        <p class="text-xs text-gray-500 mt-2">Jasa Tembak IMEI (Underground)</p>
        <p class="text-xl font-bold">${fmt(cost)}</p>
        <p class="text-xs text-purple-700 mt-1">
          <i class="fa-solid fa-clock"></i> Proses ${IMEI_TEMBAK_DAYS} hari kerja. Setelah selesai, unit IMUN dari blokir & nilai pulih 100%.
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
        startImeiUnlock(item, btn.dataset.bank);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  function startImeiUnlock(item, sourceBank) {
    const s = S();
    if ((s.bankBalances[sourceBank] || 0) < IMEI_TEMBAK_COST) return;
    s.bankBalances[sourceBank] -= IMEI_TEMBAK_COST;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: IMEI_TEMBAK_COST,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Tembak IMEI (Underground): ${item.name}`,
      category: "imei-unlock",
      day: s.currentDay,
      ts: Date.now(),
    });
    item.imeiUnlock = {
      startDay: s.currentDay,
      completesOnDay: s.currentDay + IMEI_TEMBAK_DAYS,
      paidFee: IMEI_TEMBAK_COST,
      sourceBank,
      status: "in-progress",
    };
    window.FlippingTycoon.saveGame();
    showToast(`Tembak IMEI dimulai. ${item.name} selesai Day ${item.imeiUnlock.completesOnDay}.`);
  }


  /* ---------- Upgrades tab ---------- */
  function renderUpgradesTab() {
    const wrap = document.createElement("div");
    UPGRADES.forEach((u) => wrap.appendChild(renderUpgradeCard(u)));
    return wrap;
  }

  function renderUpgradeCard(upg) {
    const s = S();
    const owned = !!(s.upgrades && s.upgrades[upg.id]);
    const card = document.createElement("div");
    card.className = `upgrade-card ${owned ? "owned" : ""}`;
    card.innerHTML = `
      <div class="upgrade-icon" style="background:${upg.accent}22;color:${upg.accent}">
        <i class="fa-solid fa-${upg.icon}"></i>
      </div>
      <div class="upgrade-body">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="upgrade-name">${upg.name}</h3>
          ${owned ? `<span class="upgrade-owned-badge"><i class="fa-solid fa-check"></i> Owned</span>` : ""}
        </div>
        <p class="upgrade-blurb">${upg.blurb}</p>
        <p class="upgrade-effect"><i class="fa-solid fa-bolt"></i> ${upg.effect}</p>
      </div>
      <div class="upgrade-action">
        <p class="upgrade-cost">${fmt(upg.cost)}</p>
        ${owned
          ? `<button class="upgrade-buy-btn" disabled><i class="fa-solid fa-circle-check"></i> Active</button>`
          : `<button class="upgrade-buy-btn" data-id="${upg.id}"><i class="fa-solid fa-cart-shopping"></i> Buy</button>`}
      </div>
    `;
    if (!owned) {
      card.querySelector(".upgrade-buy-btn").addEventListener("click", () => openUpgradeModal(upg));
    }
    return card;
  }

  function openUpgradeModal(upg) {
    const modal = document.querySelector("#repair-modal");
    const body = modal.querySelector("#repair-body");
    const closeBtn = modal.querySelector("#repair-cancel");

    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const balance = S().bankBalances[b] || 0;
      const enough = balance >= upg.cost;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(balance)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(upg.cost)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid ${upg.accent}">
        <p class="text-xs text-gray-500">Upgrade</p>
        <p class="font-semibold text-base">${upg.name}</p>
        <p class="text-sm text-gray-700 mt-1">${upg.blurb}</p>
        <p class="text-xs text-emerald-700 font-semibold mt-2"><i class="fa-solid fa-bolt"></i> ${upg.effect}</p>
        <p class="text-xs text-gray-500 mt-2">Harga</p>
        <p class="text-xl font-bold">${fmt(upg.cost)}</p>
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
        executeUpgradePurchase(upg, btn.dataset.bank);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  function executeUpgradePurchase(upg, sourceBank) {
    const s = S();
    if ((s.bankBalances[sourceBank] || 0) < upg.cost) return;
    s.bankBalances[sourceBank] -= upg.cost;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: upg.cost,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Upgrade purchased: ${upg.name}`,
      category: "upgrade",
      day: s.currentDay,
      ts: Date.now(),
    });
    if (!s.upgrades) s.upgrades = {};
    s.upgrades[upg.id] = true;
    window.FlippingTycoon.saveGame();
    showToast(`Upgrade ${upg.name} aktif!`);
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
  window.Repair = {
    renderRepairCenterPage,
    applyDayTickToRepairs,
    applyDayTickToImeiUnlocks,
    processImeiBlockRisk,
    platformFeeRate,
    isLocked,
    isImeiUnlocking,
    REPAIR_COSTS,
    UPGRADES,
    IMEI_TEMBAK_COST,
    IMEI_TEMBAK_DAYS,
    IMEI_BLOCK_CHANCE,
  };
})();
