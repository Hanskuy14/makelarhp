/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 9 — Staff Room: Customer Service & Technician
 *
 * Hire employees that unlock professional bulk operations.
 *   Customer Service → Bulk List with Markup, Auto-Accept Offers
 *   Technician       → Auto-Repair All, Auto-Buy Completeness
 *
 * Daily salaries auto-deducted from Mandiri at Next Day.
 * If Mandiri can't cover salary, employees walk out.
 * ========================================================= */

(function () {
  function S()   { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }

  /* ---------- Roster ---------- */
  const STAFF_META = {
    cs: {
      id: "cs",
      title: "Customer Service",
      role: "Sales Specialist",
      icon: "headset",
      accent: "#1d4ed8",
      avatar: "C",
      avatarColor: "#1d4ed8",
      hireFee: 2_000_000,
      dailySalary: 1_500_000,
      desc: "Mengelola listing, follow-up pembeli, auto-accept tawaran wajar.",
      perks: [
        "Aktifkan tombol <b>Bulk List with Markup</b> di Inventory.",
        "Auto-accept offer ≥ threshold (default 95% asking) saat Next Day.",
      ],
    },
    tech: {
      id: "tech",
      title: "Technician",
      role: "Repair Engineer",
      icon: "screwdriver-wrench",
      accent: "#b45309",
      avatar: "T",
      avatarColor: "#b45309",
      hireFee: 3_000_000,
      dailySalary: 2_000_000,
      desc: "Spesialis perbaikan & repacking. Bisa kerja paralel ke banyak unit sekaligus.",
      perks: [
        "Aktifkan tombol <b>Auto-Repair All</b> (semua defect inventory diservis sekaligus).",
        "Aktifkan tombol <b>Auto-Buy Completeness</b> (semua HP Only di-repack jadi Fullset).",
      ],
    },
    logistics: {
      id: "logistics",
      title: "Head of Logistics",
      role: "Wholesale Operations",
      icon: "truck-fast",
      accent: "#0f766e",
      avatar: "L",
      avatarColor: "#0f766e",
      hireFee: 4_000_000,
      dailySalary: 2_500_000,
      desc: "Pegang divisi B2B. Auto-process bulk order grosir tiap Next Day pakai partner default kamu.",
      perks: [
        "Auto-accept setiap <b>Bulk Order</b> (Wholesale) yang stoknya cukup.",
        "Pilih default <b>Logistics Partner</b> (JNE / J&T / SiCepat).",
        "Ambil <b>commission 2%</b> dari nilai pengiriman tiap order yang sukses.",
      ],
    },
  };

  /* =========================================================
   * State helpers
   * ========================================================= */
  function ensureStaff() {
    const s = S();
    if (!s.staff) {
      s.staff = {
        cs:        { hired: false, hiredOnDay: null, totalPaid: 0, autoAcceptThreshold: 95 },
        tech:      { hired: false, hiredOnDay: null, totalPaid: 0 },
        logistics: { hired: false, hiredOnDay: null, totalPaid: 0, totalCommission: 0, defaultPartner: "JNE" },
      };
    }
    if (!s.staff.cs)        s.staff.cs        = { hired: false, hiredOnDay: null, totalPaid: 0, autoAcceptThreshold: 95 };
    if (!s.staff.tech)      s.staff.tech      = { hired: false, hiredOnDay: null, totalPaid: 0 };
    if (!s.staff.logistics) s.staff.logistics = { hired: false, hiredOnDay: null, totalPaid: 0, totalCommission: 0, defaultPartner: "JNE" };
    if (typeof s.staff.cs.autoAcceptThreshold !== "number") s.staff.cs.autoAcceptThreshold = 95;
    if (!s.staff.logistics.defaultPartner)      s.staff.logistics.defaultPartner = "JNE";
    if (typeof s.staff.logistics.totalCommission !== "number") s.staff.logistics.totalCommission = 0;
    if (!Array.isArray(s.staff.bulkLog)) s.staff.bulkLog = [];
    if (!s.staffView) s.staffView = { tab: "roster" };
  }

  function isHired(role) {
    ensureStaff();
    return !!(S().staff[role] && S().staff[role].hired);
  }

  function dailySalaryTotal() {
    ensureStaff();
    let total = 0;
    Object.keys(STAFF_META).forEach((k) => {
      if (S().staff[k] && S().staff[k].hired) total += STAFF_META[k].dailySalary;
    });
    return total;
  }

  /* =========================================================
   * Hiring
   * ========================================================= */
  function hire(role, sourceBank) {
    ensureStaff();
    const meta = STAFF_META[role];
    if (!meta) return false;
    const s = S();
    if (s.staff[role].hired) { showToast("Sudah dipekerjakan."); return false; }
    if ((s.bankBalances[sourceBank] || 0) < meta.hireFee) {
      showToast(`Saldo ${sourceBank} kurang untuk hiring fee.`);
      return false;
    }
    s.bankBalances[sourceBank] -= meta.hireFee;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: meta.hireFee,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Hiring fee: ${meta.title}`,
      category: "staff-hire",
      day: s.currentDay,
      ts: Date.now(),
    });
    s.staff[role] = {
      hired: true,
      hiredOnDay: s.currentDay,
      totalPaid: meta.hireFee,
      autoAcceptThreshold: role === "cs" ? (s.staff.cs.autoAcceptThreshold || 95) : undefined,
      // Part 11: preserve logistics-specific fields across re-hire cycles.
      totalCommission: role === "logistics"
        ? ((s.staff.logistics && s.staff.logistics.totalCommission) || 0)
        : undefined,
      defaultPartner: role === "logistics"
        ? ((s.staff.logistics && s.staff.logistics.defaultPartner) || "JNE")
        : undefined,
    };
    window.FlippingTycoon.saveGame();
    showToast(`✅ ${meta.title} bergabung. Salary ${fmt(meta.dailySalary)}/hari (Mandiri).`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `${meta.title} Joined the Team`,
        message: `${meta.title} resmi dipekerjakan. Daily salary ${fmt(meta.dailySalary)} otomatis ditarik dari Mandiri.`,
        actionPage: "staff",
        actor: "HR Department",
        icon: meta.icon,
      });
    }
    return true;
  }

  function fire(role) {
    ensureStaff();
    const meta = STAFF_META[role];
    if (!meta) return;
    const s = S();
    if (!s.staff[role].hired) return;
    s.staff[role].hired = false;
    window.FlippingTycoon.saveGame();
    showToast(`${meta.title} di-PHK. Bulk operation tools nonaktif.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "info",
        title: `${meta.title} Resigned`,
        message: `${meta.title} sudah tidak bekerja di perusahaan kamu lagi. Bulk tools terkait nonaktif.`,
        actionPage: "staff",
        actor: "HR Department",
        icon: "user-xmark",
      });
    }
  }

  /* =========================================================
   * Daily salaries (called from script.js advanceToNextDay)
   * Returns { paid, walkout: [roleIds], total }
   * ========================================================= */
  function processDailySalaries() {
    ensureStaff();
    const s = S();
    const result = { paid: 0, walkout: [], total: 0 };
    Object.keys(STAFF_META).forEach((role) => {
      const meta = STAFF_META[role];
      if (!s.staff[role] || !s.staff[role].hired) return;
      const cost = meta.dailySalary;
      result.total += cost;
      if ((s.bankBalances.Mandiri || 0) < cost) {
        // Walk-out
        s.staff[role].hired = false;
        s.bankHistories.Mandiri.push({
          type: "DEBIT",
          amount: 0,
          balanceAfter: s.bankBalances.Mandiri,
          description: `${meta.title} walked out — Mandiri kurang untuk salary (${fmt(cost)})`,
          category: "staff-walkout",
          day: s.currentDay,
          ts: Date.now(),
        });
        if (window.Notifications) {
          window.Notifications.add({
            type: "alert",
            title: `${meta.title} Walked Out!`,
            message: `Saldo Mandiri tidak cukup buat bayar salary ${meta.title} (${fmt(cost)}). Mereka resign mendadak. Hire ulang kalau saldo sudah cukup.`,
            actionPage: "staff",
            actor: "HR Department",
            icon: "user-xmark",
          });
        }
        result.walkout.push(role);
        return;
      }
      s.bankBalances.Mandiri -= cost;
      s.bankHistories.Mandiri.push({
        type: "DEBIT",
        amount: cost,
        balanceAfter: s.bankBalances.Mandiri,
        description: `Daily salary: ${meta.title}`,
        category: "staff-salary",
        day: s.currentDay,
        ts: Date.now(),
      });
      s.staff[role].totalPaid = (s.staff[role].totalPaid || 0) + cost;
      result.paid += cost;
    });
    if (result.paid > 0 || result.walkout.length > 0) window.FlippingTycoon.saveGame();
    return result;
  }

  /* =========================================================
   * AUTO-REPAIR ALL — Technician
   *
   * Loops inventory, identifies items with defects (severity > 0),
   * computes total repair cost, deducts from a chosen bank,
   * and triggers the repair timer for all of them at once.
   * Respects Premium Tools upgrade (instant) just like normal flow.
   * ========================================================= */
  function autoRepairAll(sourceBank) {
    if (!isHired("tech")) { showToast("Hire Technician dulu untuk pakai Auto-Repair All."); return null; }
    const s = S();
    const REPAIR_COSTS = (window.Repair && window.Repair.REPAIR_COSTS) || {};
    const targets = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      return it.defect && it.defect.severity > 0;
    });
    if (targets.length === 0) { showToast("Tidak ada barang minus untuk diservice."); return { count: 0, totalCost: 0 }; }
    let totalCost = 0;
    targets.forEach((it) => { totalCost += REPAIR_COSTS[it.defect.type] || 0; });
    if ((s.bankBalances[sourceBank] || 0) < totalCost) {
      showToast(`Saldo ${sourceBank} kurang. Butuh ${fmt(totalCost)} untuk ${targets.length} unit.`);
      return null;
    }

    // Single consolidated debit entry
    s.bankBalances[sourceBank] -= totalCost;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: totalCost,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Auto-Repair All: ${targets.length} unit (Technician)`,
      category: "repair-bulk",
      day: s.currentDay,
      ts: Date.now(),
    });

    const instant = !!(s.upgrades && s.upgrades.premiumTools);
    targets.forEach((it) => {
      const cost = REPAIR_COSTS[it.defect.type] || 0;
      it.totalRepairCost = (it.totalRepairCost || 0) + cost;
      it.previousDefect = it.defect;
      it.repair = {
        startDay: s.currentDay,
        completesOnDay: instant ? s.currentDay : s.currentDay + 1,
        paidFee: cost,
        sourceBank,
        status: instant ? "completed" : "in-progress",
        bulk: true,
      };
      if (instant) {
        const mulus = window.GadgetData.DEFECT_OPTIONS.find((d) => d.severity === 0);
        if (mulus) it.defect = mulus;
        it.hiddenDefect = null;
      }
    });

    pushBulkLog({
      kind: "auto-repair",
      day: s.currentDay,
      count: targets.length,
      totalCost,
      sourceBank,
      instant,
    });

    window.FlippingTycoon.saveGame();
    showToast(`🔧 Auto-Repair: ${targets.length} unit ${instant ? "instant fixed" : "started repair"}. -${fmt(totalCost)} via ${sourceBank}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Auto-Repair All",
        message: `Technician menangani ${targets.length} unit sekaligus. Total biaya ${fmt(totalCost)} via ${sourceBank}${instant ? " (instant via Premium Tools)" : ", selesai Next Day"}.`,
        actionPage: "repair",
        actor: "Technician",
        icon: "screwdriver-wrench",
      });
    }
    return { count: targets.length, totalCost, instant };
  }

  /* =========================================================
   * AUTO-BUY COMPLETENESS — Technician
   *
   * For every HP Only item in inventory, buy the OEM Box & Charger
   * Kit and flip to Fullset. Charges a single consolidated total.
   * ========================================================= */
  function autoBuyCompleteness(sourceBank) {
    if (!isHired("tech")) { showToast("Hire Technician dulu untuk pakai Auto-Buy Completeness."); return null; }
    const s = S();
    const fullsetOption = window.GadgetData.COMPLETENESS_OPTIONS.find((c) => c.type === "Fullset");
    const getOemKitPrice = (window.Accessories && window.Accessories.getOemKitPrice) || (() => 150_000);

    const targets = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      return it.completeness && (it.completeness.short === "Batangan" || it.completeness.type === "HP Only / Batangan");
    });
    if (targets.length === 0) { showToast("Tidak ada unit HP Only untuk di-repack."); return { count: 0, totalCost: 0 }; }

    let totalCost = 0;
    targets.forEach((it) => { totalCost += getOemKitPrice(it.brand); });
    if ((s.bankBalances[sourceBank] || 0) < totalCost) {
      showToast(`Saldo ${sourceBank} kurang. Butuh ${fmt(totalCost)} untuk ${targets.length} kit OEM.`);
      return null;
    }

    s.bankBalances[sourceBank] -= totalCost;
    s.bankHistories[sourceBank].push({
      type: "DEBIT",
      amount: totalCost,
      balanceAfter: s.bankBalances[sourceBank],
      description: `Auto-Buy Completeness: ${targets.length} OEM kit (Technician)`,
      category: "oem-kit-bulk",
      day: s.currentDay,
      ts: Date.now(),
    });

    targets.forEach((it) => {
      const kitCost = getOemKitPrice(it.brand);
      it.totalRepairCost = (it.totalRepairCost || 0) + kitCost;
      it.completeness = fullsetOption;
      it.repackedOnDay = s.currentDay;
    });

    pushBulkLog({
      kind: "auto-completeness",
      day: s.currentDay,
      count: targets.length,
      totalCost,
      sourceBank,
    });

    window.FlippingTycoon.saveGame();
    showToast(`📦 Auto-Repack: ${targets.length} unit jadi Fullset. -${fmt(totalCost)} via ${sourceBank}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Auto-Buy Completeness",
        message: `Technician beli ${targets.length} OEM kit & ngerepack jadi Fullset. Total ${fmt(totalCost)} via ${sourceBank}.`,
        actionPage: "inventory",
        actor: "Technician",
        icon: "box-open",
      });
    }
    return { count: targets.length, totalCost };
  }

  /* =========================================================
   * BULK LIST WITH MARKUP — Customer Service
   *
   * Loops all Mulus / No Minus inventory items, computes
   * suggestedPrice * (1 + markup/100), rounds to Rp 50k, and
   * lists them in activeListings via Selling.listItem.
   * ========================================================= */
  function bulkListWithMarkup(markupPct) {
    if (!isHired("cs")) { showToast("Hire Customer Service dulu untuk pakai Bulk List."); return null; }
    if (!window.Selling || !window.Market) return null;
    const pct = Math.max(-50, Math.min(500, Number(markupPct) || 0));
    const s = S();

    const targets = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      if (!it.defect || it.defect.severity !== 0) return false;
      if (it.imeiStatus === "blocked") return false;
      return true;
    });
    if (targets.length === 0) { showToast("Tidak ada unit Mulus yang siap di-list."); return { count: 0 }; }

    let listed = 0;
    let totalAsking = 0;
    // Iterate over a copy because listItem mutates inventory in place.
    targets.slice().forEach((it) => {
      const suggested = window.Market.computeCurrentMarketPrice(it);
      let asking = Math.round((suggested * (1 + pct / 100)) / 50_000) * 50_000;
      if (asking < 50_000) asking = 50_000;
      window.Selling.listItem(it, asking);
      listed++;
      totalAsking += asking;
    });

    pushBulkLog({
      kind: "bulk-list",
      day: s.currentDay,
      count: listed,
      markupPct: pct,
      totalAsking,
    });

    window.FlippingTycoon.saveGame();
    showToast(`🏷️ Bulk Listed ${listed} unit dengan markup ${pct >= 0 ? "+" : ""}${pct}%.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Bulk List with Markup",
        message: `Customer Service nge-list ${listed} unit Mulus di markup ${pct >= 0 ? "+" : ""}${pct}% (total asking ${fmt(totalAsking)}).`,
        actionPage: "inventory",
        actor: "Customer Service",
        icon: "tags",
      });
    }
    return { count: listed, totalAsking, markupPct: pct };
  }

  /* =========================================================
   * AUTO-ACCEPT OFFERS — Customer Service
   *
   * Called from script.js advanceToNextDay AFTER processNextDayOffers.
   * If CS is hired, loops active listings with offer-pending state
   * and auto-accepts any offer >= threshold% of asking price.
   * Routes net (after fee) to receiving bank (Mandiri default).
   * ========================================================= */
  function processAutoAcceptOffers() {
    if (!isHired("cs")) return;
    const s = S();
    const threshold = (s.staff.cs && s.staff.cs.autoAcceptThreshold) || 95;
    const baseFee = (window.Inventory && window.Inventory.platformFeeRate)
      ? window.Inventory.platformFeeRate()
      : 0.05;
    const tierOf = (window.Banking && window.Banking.tierOf) || (() => "regular");

    const ratioGate = threshold / 100;
    const accepted = [];
    (s.activeListings || []).slice().forEach((listing) => {
      if (listing.negotiationState !== "offer-pending" || !listing.currentOffer) return;
      const offered = listing.currentOffer.offeredPrice;
      const asking = listing.askingPrice;
      if (offered / asking < ratioGate) return; // doesn't meet threshold

      // Receiving bank: prefer Mandiri (default operating account).
      const receivingBank = "Mandiri";
      const tier = tierOf(s.bankBalances[receivingBank] || 0);
      const isPriority = tier === "priority";
      const feeRate = isPriority ? 0 : baseFee;
      const fee = Math.round(offered * feeRate);
      const net = offered - fee;
      const buyerName = listing.currentOffer.buyer ? listing.currentOffer.buyer.name : "Buyer";
      const itemName = listing.itemSnapshot.name;

      // Bank credit
      s.bankBalances[receivingBank] += net;
      s.bankHistories[receivingBank].push({
        type: "CREDIT",
        amount: net,
        balanceAfter: s.bankBalances[receivingBank],
        description: `Auto-Accept sale: ${itemName} to ${buyerName}` + (isPriority ? " (Priority - 0% fee)" : ` (after ${(baseFee * 100).toFixed(0)}% fee)`),
        category: "sale-auto",
        day: s.currentDay,
        ts: Date.now(),
      });

      // Analytics
      if (window.Analytics) {
        const snap = listing.itemSnapshot || {};
        window.Analytics.recordSale({
          saleType: "auto-accept",
          gadget: {
            gadgetId: snap.gadgetId, name: snap.name, brand: snap.brand,
            specs: snap.specs, completeness: snap.completeness, defect: snap.defect,
            isExInter: !!snap.isExInter, accent: snap.accent, icon: snap.icon,
          },
          purchaseCost: snap.buyPrice || 0,
          repairCost:   snap.totalRepairCost || 0,
          salePrice:    offered,
          feePaid:      fee,
          buyer:        buyerName,
          receivingBank,
        });
      }

      // Part 10: profile sync — mark post sold, archive chat, bump stats.
      if (window.Profile) {
        const snap = listing.itemSnapshot || {};
        window.Profile.markPostSold(listing.listingId, { finalPrice: offered, buyer: buyerName, saleType: "auto-accept" });
        window.Profile.recordSale({ gadget: { isExInter: !!snap.isExInter } });
        window.Profile.archiveChat({
          role: "seller",
          counterparty: {
            name:   listing.currentOffer.buyer.name,
            avatar: listing.currentOffer.buyer.avatar,
            color:  listing.currentOffer.buyer.color,
            location: listing.currentOffer.buyer.location || null,
          },
          gadget: { name: snap.name, icon: snap.icon, accent: snap.accent, brand: snap.brand, isExInter: !!snap.isExInter },
          chatLog: (listing.chatLog || []).concat([{ from: "system", text: `🤖 Auto-accepted by Customer Service. Net ${fmt(net)} ke ${receivingBank}.` }]),
          outcome: "sold",
          finalPrice: offered,
          itemKey: "active-" + listing.listingId,
        });
      }

      listing.negotiationState = "sold";
      accepted.push({ listingId: listing.listingId, itemName, net, buyerName });
    });

    if (accepted.length > 0) {
      const acceptedIds = new Set(accepted.map((a) => a.listingId));
      s.activeListings = s.activeListings.filter((l) => !acceptedIds.has(l.listingId));
      pushBulkLog({
        kind: "auto-accept",
        day: s.currentDay,
        count: accepted.length,
        threshold,
      });
      window.FlippingTycoon.saveGame();
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Auto-Accept Closed Sales",
          message: `Customer Service auto-accept ${accepted.length} offer (≥${threshold}% asking). Cek Banking & Analytics.`,
          actionPage: "analytics",
          actor: "Customer Service",
          icon: "robot",
        });
      }
    }
  }

  /* =========================================================
   * AUTO-ACCEPT WHOLESALE (B2B) — Head of Logistics
   *
   * Called from script.js advanceToNextDay BEFORE
   * Wholesale.generateDailyOrders so leftover orders from yesterday
   * get auto-processed with the staff's defaultPartner.
   * ========================================================= */
  function processAutoAcceptWholesale() {
    if (!isHired("logistics")) return;
    if (!window.Wholesale) return;
    const s = S();
    const partnerId = (s.staff.logistics && s.staff.logistics.defaultPartner) || "JNE";
    const partner = window.Wholesale.PARTNERS[partnerId];
    if (!partner) return;

    const open = (s.wholesaleOrders || []).filter((o) => o.status === "open");
    if (open.length === 0) return;

    const accepted = [];
    open.forEach((order) => {
      if (!window.Wholesale.canFulfill(order)) return;
      const ok = window.Wholesale.acceptOrder(order.id, partnerId, {
        receivingBank: "Mandiri",
        acceptedBy: "logistics",
      });
      if (ok) accepted.push(order);
    });

    if (accepted.length > 0) {
      pushBulkLog({
        kind: "auto-wholesale",
        day: s.currentDay,
        count: accepted.length,
        partner: partnerId,
      });
      window.FlippingTycoon.saveGame();
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Head of Logistics Auto-Accepted Bulk Orders",
          message: `${accepted.length} bulk order di-accept otomatis pakai ${partner.name}. Komisi 2% dipotong saat shipment tiba.`,
          actionPage: "wholesale",
          actor: "Head of Logistics",
          icon: "truck-fast",
        });
      }
    }
  }

  function setDefaultLogisticsPartner(partnerId) {
    ensureStaff();
    const s = S();
    if (!window.Wholesale || !window.Wholesale.PARTNERS[partnerId]) return false;
    s.staff.logistics.defaultPartner = partnerId;
    window.FlippingTycoon.saveGame();
    return true;
  }

  /* ---------- Bulk operation history (capped) ---------- */
  function pushBulkLog(entry) {
    ensureStaff();
    const s = S();
    s.staff.bulkLog.unshift({ id: "blk-" + Math.random().toString(36).slice(2, 8), ...entry, ts: Date.now() });
    if (s.staff.bulkLog.length > 30) s.staff.bulkLog.pop();
  }

  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderStaffRoomPage() {
    ensureStaff();
    const s = S();
    const wrap = document.createElement("div");

    const csHired = isHired("cs");
    const techHired = isHired("tech");
    const dailyTotal = dailySalaryTotal();

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-user-tie text-blue-500"></i> Staff Room</h3>
          <p class="text-sm text-gray-500">Hire profesional untuk unlock bulk automation tools.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Daily Salary Total</p>
          <p class="font-semibold text-sm ${dailyTotal > 0 ? "text-rose-700" : "text-gray-700"}">${fmt(dailyTotal)}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    [
      { id: "roster", label: "Roster", icon: "users" },
      { id: "tools",  label: "Bulk Tools", icon: "bolt" },
      { id: "log",    label: `Bulk Log (${(s.staff.bulkLog || []).length})`, icon: "clock-rotate-left" },
    ].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.staffView.tab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}`;
      btn.addEventListener("click", () => {
        s.staffView.tab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.staffView.tab === "tools") {
      wrap.appendChild(renderToolsTab(csHired, techHired));
    } else if (s.staffView.tab === "log") {
      wrap.appendChild(renderLogTab());
    } else {
      wrap.appendChild(renderRosterTab());
    }
    return wrap;
  }

  function renderRosterTab() {
    const wrap = document.createElement("div");
    Object.keys(STAFF_META).forEach((role) => wrap.appendChild(renderEmployeeCard(role)));
    return wrap;
  }

  function renderEmployeeCard(role) {
    const meta = STAFF_META[role];
    const s = S();
    const rec = s.staff[role] || {};
    const hired = !!rec.hired;

    const card = document.createElement("div");
    card.className = "staff-card" + (hired ? " hired" : "");
    card.innerHTML = `
      <div class="staff-banner" style="background:linear-gradient(135deg, ${meta.accent}cc 0%, ${meta.accent}66 100%);"></div>
      <div class="staff-avatar" style="background:${meta.avatarColor}"><i class="fa-solid fa-${meta.icon}"></i></div>
      <div class="staff-body">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="staff-name">${meta.title}</p>
          ${hired ? `<span class="upgrade-owned-badge"><i class="fa-solid fa-check"></i> Hired</span>` : ""}
        </div>
        <p class="staff-role">${meta.role}</p>
        <p class="staff-desc">${meta.desc}</p>
        <ul class="staff-perks">
          ${meta.perks.map((p) => `<li><i class="fa-solid fa-bolt"></i> ${p}</li>`).join("")}
        </ul>
        <div class="staff-stats">
          <div><span>Hiring fee</span><b>${fmt(meta.hireFee)}</b></div>
          <div><span>Daily salary</span><b>${fmt(meta.dailySalary)}</b></div>
          ${hired ? `<div><span>Hired sejak</span><b>Day ${rec.hiredOnDay || "?"}</b></div>` : ""}
          ${hired ? `<div><span>Total dibayar</span><b>${fmt(rec.totalPaid || 0)}</b></div>` : ""}
        </div>
        ${role === "cs" && hired ? renderCsThresholdControl(rec) : ""}
        ${role === "logistics" && hired ? renderLogisticsPartnerControl(rec) : ""}
      </div>
      <div class="staff-action">
        ${hired
          ? `<button class="staff-fire-btn" data-role="${role}"><i class="fa-solid fa-user-xmark"></i> Fire / PHK</button>`
          : `<button class="staff-hire-btn" data-role="${role}"><i class="fa-solid fa-user-plus"></i> Hire ${fmt(meta.hireFee)}</button>`}
      </div>
    `;

    const hireBtn = card.querySelector(".staff-hire-btn");
    if (hireBtn) hireBtn.addEventListener("click", () => openHireModal(role));
    const fireBtn = card.querySelector(".staff-fire-btn");
    if (fireBtn) fireBtn.addEventListener("click", () => {
      if (confirm(`PHK ${meta.title}? Kamu kehilangan akses bulk tools terkait.`)) {
        fire(role);
        window.FlippingTycoon.renderActivePage();
      }
    });
    const slider = card.querySelector(".cs-threshold-slider");
    if (slider) {
      slider.addEventListener("input", (e) => {
        const v = parseInt(e.target.value, 10);
        S().staff.cs.autoAcceptThreshold = v;
        const lbl = card.querySelector(".cs-threshold-value");
        if (lbl) lbl.textContent = v + "%";
      });
      slider.addEventListener("change", () => {
        window.FlippingTycoon.saveGame();
      });
    }
    // Part 11: logistics partner picker wiring.
    card.querySelectorAll(".logistics-partner-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.dataset.partner;
        if (setDefaultLogisticsPartner(pid)) {
          card.querySelectorAll(".logistics-partner-pick").forEach((b) => b.classList.toggle("selected", b === btn));
        }
      });
    });
    return card;
  }

  function renderCsThresholdControl(rec) {
    const v = rec.autoAcceptThreshold || 95;
    return `
      <div class="cs-threshold">
        <div class="flex items-center justify-between">
          <p class="text-xs text-gray-500 font-semibold">Auto-Accept Threshold</p>
          <span class="cs-threshold-value">${v}%</span>
        </div>
        <input type="range" min="50" max="100" step="1" value="${v}" class="cs-threshold-slider" />
        <p class="text-[11px] text-gray-500">Saat Next Day, offer ≥ ${v}% dari asking price akan auto-accepted ke Mandiri.</p>
      </div>
    `;
  }

  function renderLogisticsPartnerControl(rec) {
    const partners = (window.Wholesale && window.Wholesale.PARTNERS) || {};
    const selected = rec.defaultPartner || "JNE";
    const buttons = Object.values(partners).map((p) => `
      <button class="logistics-partner-pick ${p.id === selected ? "selected" : ""}" data-partner="${p.id}" type="button">
        <i class="fa-solid fa-${p.icon}" style="color:${p.accent}"></i>
        <span class="lpp-name">${p.name}</span>
        <span class="lpp-meta">${p.speedDays}d &middot; loss ${(p.lossRate*100).toFixed(0)}%</span>
      </button>
    `).join("");
    const totalCommission = rec.totalCommission || 0;
    return `
      <div class="cs-threshold">
        <p class="text-xs text-gray-500 font-semibold mb-1">Default Logistics Partner (auto-process)</p>
        <div class="logistics-partner-row">${buttons || `<p class="text-[11px] text-gray-500">Wholesale belum siap.</p>`}</div>
        <p class="text-[11px] text-gray-500 mt-1">Commission yang sudah dibayar ke staff: <b>${fmt(totalCommission)}</b> &middot; 2% dari nilai shipment tiap order.</p>
      </div>
    `;
  }

  function openHireModal(role) {
    const meta = STAFF_META[role];
    const modal = document.querySelector("#staff-hire-modal");
    const body = modal.querySelector("#staff-hire-body");
    const titleEl = modal.querySelector("#staff-hire-title");
    const closeBtn = modal.querySelector("#staff-hire-cancel");
    titleEl.textContent = `Hire ${meta.title}`;

    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const bal = S().bankBalances[b] || 0;
      const enough = bal >= meta.hireFee;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(bal)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(meta.hireFee)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary" style="border-left: 4px solid ${meta.accent}">
        <p class="text-xs text-gray-500">Posisi</p>
        <p class="font-semibold">${meta.title} &middot; ${meta.role}</p>
        <p class="text-xs text-gray-500 mt-2">Hiring Fee</p>
        <p class="text-xl font-bold">${fmt(meta.hireFee)}</p>
        <p class="text-xs text-amber-700 mt-1"><i class="fa-solid fa-clock"></i> Daily salary ${fmt(meta.dailySalary)} otomatis ditarik dari Mandiri tiap Next Day.</p>
      </div>
      <p class="text-sm font-semibold mb-2">Bayar hiring fee dari rekening mana?</p>
      <div class="relist-banks">${rows}</div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;

    body.querySelectorAll(".relist-bank-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (hire(role, btn.dataset.bank)) {
          close();
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
  }

  /* ---------- Tools tab ---------- */
  function renderToolsTab(csHired, techHired) {
    const wrap = document.createElement("div");
    const s = S();

    // Tech Tools
    const techCard = document.createElement("div");
    techCard.className = "fb-card staff-tools-card";
    const defective = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      return it.defect && it.defect.severity > 0;
    });
    const batangan = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      return it.completeness && (it.completeness.short === "Batangan" || it.completeness.type === "HP Only / Batangan");
    });
    const REPAIR_COSTS = (window.Repair && window.Repair.REPAIR_COSTS) || {};
    let repairTotal = 0; defective.forEach((it) => { repairTotal += REPAIR_COSTS[it.defect.type] || 0; });
    const getOemKitPrice = (window.Accessories && window.Accessories.getOemKitPrice) || (() => 150_000);
    let kitTotal = 0; batangan.forEach((it) => { kitTotal += getOemKitPrice(it.brand); });

    techCard.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <div class="upgrade-icon" style="background:#fef3c7;color:#b45309"><i class="fa-solid fa-screwdriver-wrench"></i></div>
        <div>
          <h3>Technician Tools</h3>
          <p class="text-xs text-gray-500">${techHired ? "Active &middot; semua tombol di bawah aktif." : "Belum di-hire — tombol di bawah disabled."}</p>
        </div>
      </div>
      <div class="staff-tool-row">
        <div class="staff-tool-info">
          <p class="staff-tool-title"><i class="fa-solid fa-wrench"></i> Auto-Repair All</p>
          <p class="staff-tool-meta">${defective.length} unit defect siap diservis &middot; total biaya ${fmt(repairTotal)}.</p>
        </div>
        <button class="staff-tool-btn" id="btn-auto-repair" ${techHired && defective.length > 0 ? "" : "disabled"}>
          <i class="fa-solid fa-bolt"></i> Run Auto-Repair (${defective.length})
        </button>
      </div>
      <div class="staff-tool-row">
        <div class="staff-tool-info">
          <p class="staff-tool-title"><i class="fa-solid fa-box-open"></i> Auto-Buy Completeness</p>
          <p class="staff-tool-meta">${batangan.length} unit HP Only siap di-repack &middot; total biaya OEM kit ${fmt(kitTotal)}.</p>
        </div>
        <button class="staff-tool-btn" id="btn-auto-comp" ${techHired && batangan.length > 0 ? "" : "disabled"}>
          <i class="fa-solid fa-bolt"></i> Repack Semua (${batangan.length})
        </button>
      </div>
    `;
    wrap.appendChild(techCard);

    // CS Tools
    const csCard = document.createElement("div");
    csCard.className = "fb-card staff-tools-card";
    const mulus = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      if (!it.defect || it.defect.severity !== 0) return false;
      if (it.imeiStatus === "blocked") return false;
      return true;
    });

    csCard.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <div class="upgrade-icon" style="background:#dbeafe;color:#1d4ed8"><i class="fa-solid fa-headset"></i></div>
        <div>
          <h3>Customer Service Tools</h3>
          <p class="text-xs text-gray-500">${csHired ? "Active &middot; tombol di bawah aktif. Auto-Accept jalan tiap Next Day." : "Belum di-hire — tombol di bawah disabled."}</p>
        </div>
      </div>
      <div class="staff-tool-row">
        <div class="staff-tool-info">
          <p class="staff-tool-title"><i class="fa-solid fa-tags"></i> Bulk List with Markup</p>
          <p class="staff-tool-meta">${mulus.length} unit Mulus siap di-list ke Marketplace dengan markup yang kamu pilih.</p>
        </div>
        <button class="staff-tool-btn cs" id="btn-bulk-list" ${csHired && mulus.length > 0 ? "" : "disabled"}>
          <i class="fa-solid fa-bullhorn"></i> Bulk List (${mulus.length})
        </button>
      </div>
    `;
    wrap.appendChild(csCard);

    setTimeout(() => {
      const arBtn = document.querySelector("#btn-auto-repair");
      if (arBtn) arBtn.addEventListener("click", () => openBankPicker("auto-repair", repairTotal));
      const acBtn = document.querySelector("#btn-auto-comp");
      if (acBtn) acBtn.addEventListener("click", () => openBankPicker("auto-completeness", kitTotal));
      const blBtn = document.querySelector("#btn-bulk-list");
      if (blBtn) blBtn.addEventListener("click", openBulkMarkupModal);
    }, 0);

    return wrap;
  }

  function openBankPicker(action, total) {
    const modal = document.querySelector("#staff-bank-modal");
    const body  = modal.querySelector("#staff-bank-body");
    const titleEl = modal.querySelector("#staff-bank-title");
    const closeBtn = modal.querySelector("#staff-bank-cancel");
    titleEl.textContent = action === "auto-repair" ? "Auto-Repair All — Pilih Bank"
                       : "Auto-Buy Completeness — Pilih Bank";

    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const bal = S().bankBalances[b] || 0;
      const enough = bal >= total;
      return `
        <button class="relist-bank-row" data-bank="${b}" ${enough ? "" : "disabled"}>
          <div class="rb-left"><span class="rb-bank">${b}</span><span class="rb-tier">Saldo: ${fmt(bal)}</span></div>
          <div class="rb-right"><span class="rb-fee">${enough ? "Cukup" : "Saldo kurang"}</span><span class="rb-net" style="color:#b91c1c"><b>-${fmt(total)}</b></span></div>
        </button>`;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Total biaya bulk operation</p>
        <p class="text-xl font-bold">${fmt(total)}</p>
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
        const bank = btn.dataset.bank;
        close();
        if (action === "auto-repair") autoRepairAll(bank);
        else if (action === "auto-completeness") autoBuyCompleteness(bank);
        window.FlippingTycoon.renderActivePage();
      });
    });
  }

  function openBulkMarkupModal() {
    const modal = document.querySelector("#bulk-markup-modal");
    const body  = modal.querySelector("#bulk-markup-body");
    const closeBtn = modal.querySelector("#bulk-markup-cancel");
    const submitBtn = modal.querySelector("#bulk-markup-submit");

    const s = S();
    const mulus = (s.inventory || []).filter((it) => {
      if (window.Repair && window.Repair.isLocked && window.Repair.isLocked(it)) return false;
      if (!it.defect || it.defect.severity !== 0) return false;
      if (it.imeiStatus === "blocked") return false;
      return true;
    });

    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Calon listing (Mulus / No Minus)</p>
        <p class="font-semibold">${mulus.length} unit siap di-bulk-list</p>
      </div>
      <label class="modal-label">Markup % (boleh negatif untuk obral)
        <input id="bulk-markup-input" type="number" min="-50" max="500" step="1" value="20" class="modal-input" />
      </label>
      <div class="list-quickset">
        <button data-pct="-5"  type="button"><span>-5%</span><span>Obral</span></button>
        <button data-pct="0"   type="button"><span>0%</span><span>Fair</span></button>
        <button data-pct="10"  type="button"><span>+10%</span><span>Stretch</span></button>
        <button data-pct="20"  type="button"><span>+20%</span><span>Greedy</span></button>
      </div>
      <p class="text-xs text-gray-500 mt-1">Asking price = Suggested × (1 + markup/100), dibulatkan ke Rp 50.000 terdekat.</p>
      <p id="bulk-markup-error" class="text-xs text-rose-600 font-semibold"></p>
    `;

    const input = body.querySelector("#bulk-markup-input");
    body.querySelectorAll(".list-quickset button").forEach((b) => {
      b.addEventListener("click", () => { input.value = b.dataset.pct; });
    });

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;

    submitBtn.onclick = () => {
      const err = body.querySelector("#bulk-markup-error");
      const pct = Number(input.value);
      if (Number.isNaN(pct)) { err.textContent = "Markup harus angka."; return; }
      if (pct < -50 || pct > 500) { err.textContent = "Range markup -50% s.d. 500%."; return; }
      close();
      bulkListWithMarkup(pct);
      window.FlippingTycoon.renderActivePage();
    };
  }

  /* ---------- Log tab ---------- */
  function renderLogTab() {
    const s = S();
    const wrap = document.createElement("div");
    const log = s.staff.bulkLog || [];
    if (log.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-xl mb-2">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <p class="font-semibold">Belum ada bulk operation</p>
        <p class="text-xs text-gray-500">Setiap kali Auto-Repair / Auto-Buy / Bulk List / Auto-Accept dijalankan, log-nya muncul di sini.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    const card = document.createElement("div");
    card.className = "fb-card";
    card.innerHTML = `<h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-blue-500"></i> Bulk Operation Log</h3>`;
    const list = document.createElement("div");
    list.className = "bulk-log-list";
    log.forEach((entry) => list.appendChild(renderLogRow(entry)));
    card.appendChild(list);
    wrap.appendChild(card);
    return wrap;
  }

  function renderLogRow(entry) {
    const meta = {
      "auto-repair":       { icon: "wrench",        color: "#b45309", label: "Auto-Repair All" },
      "auto-completeness": { icon: "box-open",      color: "#f97316", label: "Auto-Buy Completeness" },
      "bulk-list":         { icon: "tags",          color: "#1d4ed8", label: "Bulk List with Markup" },
      "auto-accept":       { icon: "robot",         color: "#7e22ce", label: "Auto-Accept Offers" },
      "auto-wholesale":    { icon: "truck-fast",    color: "#0f766e", label: "Auto-Accept Bulk Orders" },
    }[entry.kind] || { icon: "bolt", color: "#6b7280", label: entry.kind };

    let detail = "";
    if (entry.kind === "auto-repair")       detail = `${entry.count} unit &middot; ${fmt(entry.totalCost)} via ${entry.sourceBank}${entry.instant ? " &middot; instant" : ""}`;
    else if (entry.kind === "auto-completeness") detail = `${entry.count} unit &middot; ${fmt(entry.totalCost)} via ${entry.sourceBank}`;
    else if (entry.kind === "bulk-list")    detail = `${entry.count} unit &middot; markup ${entry.markupPct >= 0 ? "+" : ""}${entry.markupPct}% &middot; total asking ${fmt(entry.totalAsking)}`;
    else if (entry.kind === "auto-accept")  detail = `${entry.count} sale ditutup &middot; threshold ≥${entry.threshold}%`;
    else if (entry.kind === "auto-wholesale") detail = `${entry.count} bulk order di-accept &middot; default partner ${entry.partner}`;

    const row = document.createElement("div");
    row.className = "bulk-log-row";
    row.innerHTML = `
      <div class="bulk-log-icon" style="background:${meta.color}22;color:${meta.color}">
        <i class="fa-solid fa-${meta.icon}"></i>
      </div>
      <div class="bulk-log-body">
        <p class="bulk-log-title">${meta.label}</p>
        <p class="bulk-log-meta">Day ${entry.day} &middot; ${detail}</p>
      </div>
    `;
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
  window.Staff = {
    STAFF_META,
    renderStaffRoomPage,
    isHired,
    hire,
    fire,
    dailySalaryTotal,
    processDailySalaries,
    autoRepairAll,
    autoBuyCompleteness,
    bulkListWithMarkup,
    processAutoAcceptOffers,
    processAutoAcceptWholesale,
    setDefaultLogisticsPartner,
  };
})();
