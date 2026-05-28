/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 21 — Grup WA Reseller VIP
 *
 * A late-game bulk-selling QoL feature. Once the player is
 * Suhu (rep > 70) AND has net worth >= Rp 100.000.000, a new
 * "Grup Reseller VIP" menu unlocks.
 *
 * From Inventory the player tick-selects 5..10 items, hits
 * "Share ke Grup VIP", and a WhatsApp/Telegram-style group-chat
 * modal opens. AI members ("Toko Budi", "Andi Cell", ...) race
 * to reply. The first reply wins the borongan — all selected
 * items vanish from inventory, cash hits the chosen bank, and
 * the broadcast lands in the WA Group history.
 *
 * State stored on:
 *   data.waGroup = { history: [{...}], lastBank: "Mandiri" }
 *   data.inventoryView.selectedIds = [itemId, ...]
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  /* ---------- Tunables ---------- */
  const MIN_NETWORTH      = 100_000_000;
  const MIN_REP           = 71;
  const WHOLESALE_DISC    = 0.10;     // 10% off market for borongan
  const MIN_SELECT        = 5;
  const MAX_SELECT        = 10;
  const HISTORY_LIMIT     = 30;


  /* ---------- AI member roster ---------- */
  const MEMBERS = [
    { name: "Toko Budi",      avatar: "B", color: "#10b981" },
    { name: "Andi Cell",      avatar: "A", color: "#3b82f6" },
    { name: "Ko Riza Glodok", avatar: "R", color: "#ef4444" },
    { name: "Mas Dimas",      avatar: "D", color: "#a855f7" },
    { name: "Cici Maya HP",   avatar: "M", color: "#ec4899" },
    { name: "Pak Yusuf BTM",  avatar: "Y", color: "#f59e0b" },
    { name: "Bro Galih",      avatar: "G", color: "#06b6d4" },
    { name: "Bang Hendra",    avatar: "H", color: "#84cc16" },
    { name: "Ko Andre Batam", avatar: "A", color: "#0891b2" },
    { name: "Pak Bayu WTC",   avatar: "B", color: "#dc2626" },
  ];
  const REPLY_LINES = [
    "Bungkus Suhu! Saya cabut sekarang juga 🚗",
    "Ambil semua bos, transfer langsung jalan 💸",
    "Saya borong Suhu, ready cash. PM lokasi pickup 🙏",
    "Mantap, saya tampung semua. Mau COD apa transfer?",
    "Gas Suhu, fix saya borong. No nego, langsung deal!",
    "Tampung semua bro, kirim ke alamat saya yes 🚀",
    "Saya yang pertama ya bos! Borong fix 🤝",
    "Wah deal! Saya transfer dulu, kirim besok pagi gpp.",
    "Sikat semua Suhu! Standby di Roxy tunggu unitnya.",
    "Borong total bro! Saya butuh stok hari ini 🎯",
  ];

  /* ---------- State init ---------- */
  function ensureState() {
    const s = S();
    if (!s.waGroup) {
      s.waGroup = { history: [], lastBank: "Mandiri" };
    }
    if (!Array.isArray(s.waGroup.history)) s.waGroup.history = [];
    if (!s.waGroup.lastBank) s.waGroup.lastBank = "Mandiri";
    if (!s.inventoryView) s.inventoryView = {};
    if (!Array.isArray(s.inventoryView.selectedIds)) s.inventoryView.selectedIds = [];
  }


  /* ---------- Unlock + selection helpers ---------- */
  function computeNetWorth() {
    const s = S();
    const bank = (s.bankBalances && Object.values(s.bankBalances).reduce((a, b) => a + (Number(b) || 0), 0)) || 0;
    const inv  = (s.inventory || []).reduce((sum, it) => sum + (Number(it.buyPrice) || 0), 0);
    const wh   = (s.warehouse || []).reduce((sum, it) => sum + (Number(it.buyPrice) || 0), 0);
    return bank + inv + wh;
  }

  function isUnlocked() {
    ensureState();
    const repScore = (window.Reputation && window.Reputation.getScore())  || 0;
    const isSuhu   = (window.Reputation && window.Reputation.isSuhu())    || false;
    const networth = computeNetWorth();
    return (isSuhu || repScore >= MIN_REP) && networth >= MIN_NETWORTH;
  }

  function unlockReport() {
    const repScore = (window.Reputation && window.Reputation.getScore()) || 0;
    return {
      repScore,
      repNeeded: MIN_REP,
      netWorth: computeNetWorth(),
      netWorthNeeded: MIN_NETWORTH,
      repOk: repScore >= MIN_REP,
      worthOk: computeNetWorth() >= MIN_NETWORTH,
    };
  }

  /** Items eligible to be ticked: not locked, not blocked, not mid-IMEI-unlock. */
  function eligibleItems() {
    return (S().inventory || []).filter((it) =>
      !(it.repair && it.repair.completesOnDay) &&
      !(it.imeiUnlock && it.imeiUnlock.status === "in-progress") &&
      it.imeiStatus !== "blocked"
    );
  }

  function getSelectedItems() {
    const ids = (S().inventoryView && S().inventoryView.selectedIds) || [];
    const idSet = new Set(ids);
    return (S().inventory || []).filter((it) => idSet.has(it.id));
  }

  function isSelected(itemId) {
    return ((S().inventoryView && S().inventoryView.selectedIds) || []).includes(itemId);
  }

  function toggleSelected(itemId) {
    ensureState();
    const arr = S().inventoryView.selectedIds;
    const idx = arr.indexOf(itemId);
    if (idx === -1) {
      if (arr.length >= MAX_SELECT) {
        toast(`Maks ${MAX_SELECT} item per broadcast.`);
        return false;
      }
      arr.push(itemId);
    } else {
      arr.splice(idx, 1);
    }
    window.FlippingTycoon.saveGame();
    return true;
  }

  function clearSelected() {
    ensureState();
    S().inventoryView.selectedIds = [];
    window.FlippingTycoon.saveGame();
  }

  /** Suggested borongan price = sum(suggestedMarketPrice) × (1 - WHOLESALE_DISC). */
  function computeBoronganPrice(items) {
    const market = window.Market && window.Market.computeCurrentMarketPrice;
    const totalMarket = items.reduce((s, it) => s + (Number(market ? market(it) : it.buyPrice) || 0), 0);
    const totalCost   = items.reduce((s, it) => s + (Number(it.buyPrice) || 0), 0);
    const askingPrice = Math.max(50_000, Math.round(totalMarket * (1 - WHOLESALE_DISC) / 50_000) * 50_000);
    return { totalMarket, totalCost, askingPrice };
  }


  /* =========================================================
   * Page renderer — "Grup Reseller VIP"
   * ========================================================= */
  function renderVIPPage() {
    ensureState();
    const wrap = document.createElement("div");
    const unlocked = isUnlocked();
    const rep = unlockReport();

    // Header card
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="flex items-center gap-2"><i class="fa-brands fa-whatsapp text-[#25D366]"></i> Grup Reseller VIP</h3>
          <p class="text-sm text-gray-500">Borongan ke "Grup Mafia HP Pusat" — sell out 5–10 unit dalam satu klik.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Status</p>
          <p class="font-semibold text-sm ${unlocked ? "text-emerald-700" : "text-rose-600"}">
            ${unlocked ? "✓ VIP Unlocked" : "🔒 Locked"}
          </p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Unlock requirements card
    const reqCard = document.createElement("div");
    reqCard.className = "fb-card wa-req-card";
    reqCard.innerHTML = `
      <h3 class="mb-3"><i class="fa-solid fa-key text-amber-500"></i> Syarat Akses VIP</h3>
      <div class="wa-req-row ${rep.repOk ? "ok" : "bad"}">
        <i class="fa-solid fa-${rep.repOk ? "check-circle" : "xmark-circle"}"></i>
        <div>
          <p class="font-semibold">Reputasi <b>Suhu</b> (>${MIN_REP - 1}/100)</p>
          <p class="text-xs text-gray-500">Sekarang: <b class="${rep.repOk ? "text-emerald-700" : "text-rose-600"}">${rep.repScore}/100</b></p>
        </div>
      </div>
      <div class="wa-req-row ${rep.worthOk ? "ok" : "bad"}">
        <i class="fa-solid fa-${rep.worthOk ? "check-circle" : "xmark-circle"}"></i>
        <div>
          <p class="font-semibold">Net Worth ≥ ${fmt(MIN_NETWORTH)}</p>
          <p class="text-xs text-gray-500">Sekarang: <b class="${rep.worthOk ? "text-emerald-700" : "text-rose-600"}">${fmt(rep.netWorth)}</b> (bank + inventory + warehouse)</p>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-2">VIP grants: jualan borongan, ${(WHOLESALE_DISC * 100).toFixed(0)}% wholesale discount, instant cash.</p>
    `;
    wrap.appendChild(reqCard);

    // CTA card
    const ctaCard = document.createElement("div");
    ctaCard.className = "fb-card";
    if (unlocked) {
      const sel = getSelectedItems();
      ctaCard.innerHTML = `
        <h3 class="mb-2"><i class="fa-brands fa-whatsapp text-[#25D366]"></i> Mulai Borongan</h3>
        <p class="text-sm text-gray-600 mb-3">
          Buka tab <b>Inventory</b>, centang ${MIN_SELECT}–${MAX_SELECT} unit yang mau dijual borongan,
          lalu klik <b>Share ke Grup VIP</b>. Modal chat WA akan muncul dan AI reseller akan langsung respon.
        </p>
        <p class="text-sm text-gray-500 mb-3">Currently selected: <b class="${sel.length > 0 ? "text-emerald-700" : "text-gray-500"}">${sel.length} items</b></p>
        <div class="flex gap-2 flex-wrap">
          <button id="wa-goto-inv" class="modal-btn modal-btn-primary"><i class="fa-solid fa-boxes-stacked"></i> Pergi ke Inventory</button>
          ${sel.length >= MIN_SELECT
            ? `<button id="wa-broadcast-now" class="modal-btn" style="background:#25D366;color:#fff"><i class="fa-brands fa-whatsapp"></i> Broadcast ${sel.length} item</button>`
            : `<button class="modal-btn modal-btn-ghost" disabled><i class="fa-brands fa-whatsapp"></i> Pilih min ${MIN_SELECT} item dulu</button>`}
        </div>
      `;
    } else {
      ctaCard.innerHTML = `
        <h3 class="mb-2"><i class="fa-solid fa-lock text-gray-500"></i> Belum bisa akses VIP</h3>
        <p class="text-sm text-gray-600">Naikin reputasi ke Suhu dan total net worth ke ≥ ${fmt(MIN_NETWORTH)}. Mainan ini diumpetin buat late-game player aja, biar terasa "earned".</p>
      `;
    }
    wrap.appendChild(ctaCard);

    if (unlocked) {
      const goto = ctaCard.querySelector("#wa-goto-inv");
      if (goto) goto.addEventListener("click", () => window.FlippingTycoon.setActivePage("inventory"));
      const bcast = ctaCard.querySelector("#wa-broadcast-now");
      if (bcast) bcast.addEventListener("click", () => openBroadcastModal());
    }

    // Broadcast history
    const hist = (S().waGroup.history || []);
    const histCard = document.createElement("div");
    histCard.className = "fb-card";
    if (hist.length === 0) {
      histCard.innerHTML = `
        <h3 class="mb-2"><i class="fa-solid fa-clock-rotate-left text-purple-500"></i> Riwayat Broadcast</h3>
        <p class="text-sm text-gray-500">Belum ada broadcast. Borongan kamu bakal muncul di sini.</p>
      `;
    } else {
      histCard.innerHTML = `<h3 class="mb-3"><i class="fa-solid fa-clock-rotate-left text-purple-500"></i> Riwayat Broadcast</h3>`;
      const list = document.createElement("div");
      list.className = "wa-hist-list";
      hist.slice(0, 8).forEach((h) => {
        const row = document.createElement("div");
        row.className = "wa-hist-row";
        row.innerHTML = `
          <div class="wa-hist-avatar" style="background:${h.buyer.color}">${h.buyer.avatar}</div>
          <div class="wa-hist-body">
            <p class="wa-hist-title">${h.buyer.name} — ${h.unitCount} unit</p>
            <p class="wa-hist-meta">D${h.day} &middot; ${fmt(h.totalCash)} masuk ${h.bank}</p>
          </div>
        `;
        list.appendChild(row);
      });
      histCard.appendChild(list);
    }
    wrap.appendChild(histCard);

    return wrap;
  }


  /* =========================================================
   * The WA group-chat broadcast modal (mini-game)
   * ========================================================= */

  let modalState = null;  // { items, askingPrice, claimedBy, timers, msgs }

  function openBroadcastModal() {
    ensureState();
    if (!isUnlocked()) {
      toast("VIP belum unlocked.");
      return;
    }
    const items = getSelectedItems();
    if (items.length < MIN_SELECT) {
      toast(`Pilih minimal ${MIN_SELECT} item dulu.`);
      return;
    }
    if (items.length > MAX_SELECT) {
      toast(`Maks ${MAX_SELECT} item per broadcast.`);
      return;
    }
    const modal = document.querySelector("#wa-modal");
    if (!modal) { toast("Modal not found."); return; }

    const { totalMarket, totalCost, askingPrice } = computeBoronganPrice(items);
    const msgs = [];

    // Build the player's broadcast message
    const itemLines = items.slice(0, 5).map((it) =>
      `• ${it.brand || ""} ${it.name} ${it.specs.ram}/${it.specs.rom}`).join("\n");
    const broadcastText =
      "Ready stok nih bosku 🔥\n" +
      itemLines +
      (items.length > 5 ? `\n• ...(+${items.length - 5} unit lain)` : "") +
      `\n\nTotal ${items.length} unit borongan.\n` +
      `Borong semua ${fmt(askingPrice)} (-${(WHOLESALE_DISC * 100).toFixed(0)}% wholesale).\n` +
      "Siapa cepat dia dapat! 🚀";

    msgs.push({ author: "player", text: broadcastText });
    modalState = {
      items: items.slice(),
      askingPrice,
      totalMarket,
      totalCost,
      claimedBy: null,
      timers: [],
      msgs,
    };

    renderChatModal();

    // Schedule 2-3 AI replies arriving over the next 1.5..6 seconds.
    const replyCount = randInt(2, 4);
    const usedNames = new Set();
    for (let i = 0; i < replyCount; i++) {
      let m;
      do { m = pick(MEMBERS); } while (usedNames.has(m.name));
      usedNames.add(m.name);
      const delayMs = 1200 + i * randInt(700, 1800);
      const t = setTimeout(() => onReplyArrive(m), delayMs);
      modalState.timers.push(t);
    }
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function onReplyArrive(member) {
    if (!modalState) return;
    const text = pick(REPLY_LINES);
    modalState.msgs.push({ author: "member", member, text });
    if (!modalState.claimedBy) {
      modalState.claimedBy = member;   // first reply wins
      modalState.msgs.push({
        author: "system",
        text: `🎯 ${member.name} menang borongan — ready klik Deal.`,
      });
    }
    renderChatModal();
  }

  function clearTimers() {
    if (!modalState) return;
    modalState.timers.forEach((t) => clearTimeout(t));
    modalState.timers = [];
  }


  function renderChatModal() {
    const modal = document.querySelector("#wa-modal");
    if (!modal || !modalState) return;
    const titleEl = modal.querySelector("#wa-modal-subtitle");
    const body    = modal.querySelector("#wa-modal-body");
    const footer  = modal.querySelector("#wa-modal-footer");
    titleEl.textContent = `${modalState.items.length} unit · ${fmt(modalState.askingPrice)}`;

    body.innerHTML = modalState.msgs.map((m) => {
      if (m.author === "player") {
        return `
          <div class="wa-row wa-row-out">
            <div class="wa-bubble wa-bubble-out">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>
          </div>`;
      }
      if (m.author === "system") {
        return `<div class="wa-system">${escapeHtml(m.text)}</div>`;
      }
      const won = modalState.claimedBy && modalState.claimedBy.name === m.member.name;
      return `
        <div class="wa-row wa-row-in">
          <div class="wa-avatar" style="background:${m.member.color}">${m.member.avatar}</div>
          <div class="wa-bubble wa-bubble-in ${won ? "wa-bubble-winner" : ""}">
            <p class="wa-author">${escapeHtml(m.member.name)}${won ? ' <span class="wa-winner-tag">PERTAMA ✓</span>' : ""}</p>
            <p>${escapeHtml(m.text)}</p>
          </div>
        </div>`;
    }).join("");
    body.scrollTop = body.scrollHeight;

    if (modalState.claimedBy) {
      const banks = ["Mandiri", "BCA", "BNI"];
      footer.innerHTML = `
        <p class="wa-deal-prompt"><b>Deal sama ${escapeHtml(modalState.claimedBy.name)}?</b><br>
        Total cash masuk: <b class="text-emerald-700">${fmt(modalState.askingPrice)}</b></p>
        <p class="modal-label" style="margin-bottom:4px">Kirim ke rekening:</p>
        <div class="wa-bank-row">
          ${banks.map((b) =>
            `<button class="wa-bank-btn" data-bank="${b}">
              <span class="wa-bank-logo">${b.charAt(0)}</span>
              <span class="wa-bank-label">${b}</span>
            </button>`).join("")}
        </div>
        <div class="modal-actions">
          <button id="wa-modal-cancel" class="modal-btn modal-btn-ghost"><i class="fa-solid fa-xmark"></i> Batal</button>
        </div>
      `;
      footer.querySelectorAll(".wa-bank-btn").forEach((btn) => {
        btn.addEventListener("click", () => completeBroadcast(btn.dataset.bank));
      });
      footer.querySelector("#wa-modal-cancel").onclick = closeModal;
    } else {
      footer.innerHTML = `
        <p class="wa-deal-prompt text-gray-500">Tunggu reseller pertama balas… <i class="fa-solid fa-circle-notch fa-spin"></i></p>
        <div class="modal-actions">
          <button id="wa-modal-cancel" class="modal-btn modal-btn-ghost"><i class="fa-solid fa-xmark"></i> Cancel Broadcast</button>
        </div>
      `;
      footer.querySelector("#wa-modal-cancel").onclick = closeModal;
    }
  }

  function closeModal() {
    clearTimers();
    const modal = document.querySelector("#wa-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
    modalState = null;
  }


  /* ---------- The "Deal" — actually transfer cash + remove items ---------- */
  function completeBroadcast(bankKey) {
    if (!modalState || !modalState.claimedBy) return;
    const s = S();
    const items   = modalState.items;
    const cash    = modalState.askingPrice;
    const buyer   = modalState.claimedBy;

    // Remove items from inventory
    const idSet = new Set(items.map((it) => it.id));
    s.inventory = (s.inventory || []).filter((it) => !idSet.has(it.id));

    // Credit chosen bank
    s.bankBalances[bankKey] = (s.bankBalances[bankKey] || 0) + cash;
    if (!Array.isArray(s.bankHistories[bankKey])) s.bankHistories[bankKey] = [];
    s.bankHistories[bankKey].push({
      type: "CREDIT",
      amount: cash,
      balanceAfter: s.bankBalances[bankKey],
      description: `WA Group VIP borongan: ${items.length} unit ke ${buyer.name}`,
      category: "wa-vip-bulk",
      day: s.currentDay,
      ts: Date.now(),
    });
    s.waGroup.lastBank = bankKey;

    // Log each item to Analytics so the gross-profit chart picks them up
    if (window.Analytics && window.Analytics.recordSale) {
      const totalCost = items.reduce((sum, it) => sum + (it.buyPrice || 0), 0);
      items.forEach((it) => {
        const itemCost = it.buyPrice || 0;
        // Allocate the borongan price proportionally to each unit's buyPrice.
        const itemShare = totalCost > 0 ? (itemCost / totalCost) : (1 / items.length);
        const itemSalePrice = Math.round(cash * itemShare);
        window.Analytics.recordSale({
          saleType: "wa-vip-bulk",
          gadget: {
            gadgetId: it.gadgetId,
            name: it.name,
            brand: it.brand,
            specs: it.specs,
            completeness: it.completeness,
            defect: it.defect,
            isExInter: !!it.isExInter,
            accent: it.accent,
            icon: it.icon,
          },
          purchaseCost: itemCost,
          repairCost: it.totalRepairCost || 0,
          salePrice: itemSalePrice,
          feePaid: 0,
          buyer: { name: buyer.name, avatar: buyer.avatar, color: buyer.color },
          receivingBank: bankKey,
        });
      });
    }

    // Push to broadcast history
    s.waGroup.history.unshift({
      id: uid("wa"),
      day: s.currentDay,
      ts: Date.now(),
      buyer: { name: buyer.name, avatar: buyer.avatar, color: buyer.color },
      unitCount: items.length,
      totalCash: cash,
      bank: bankKey,
      itemNames: items.slice(0, 6).map((it) => `${it.brand || ""} ${it.name}`.trim()),
    });
    if (s.waGroup.history.length > HISTORY_LIMIT) s.waGroup.history.length = HISTORY_LIMIT;

    // Clear selection so the same items can't be re-broadcast
    s.inventoryView.selectedIds = [];

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: `Borongan closed: ${buyer.name}`,
        message: `${items.length} unit terjual ke Grup Mafia HP Pusat → ${fmt(cash)} masuk ${bankKey}.`,
        actionPage: "wa-vip",
        actor: buyer.name,
        icon: "whatsapp",
      });
    }

    closeModal();
    window.FlippingTycoon.saveGame();
    window.FlippingTycoon.renderActivePage();
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function toast(msg) {
    if (window.Notifications && window.Notifications.toast) window.Notifications.toast(msg);
    else if (typeof console !== "undefined") console.log("[WA toast]", msg);
  }

  /* ---------- Public API ---------- */
  window.WAGroup = {
    isUnlocked,
    computeNetWorth,
    eligibleItems,
    isSelected,
    toggleSelected,
    clearSelected,
    getSelectedItems,
    computeBoronganPrice,
    openBroadcastModal,
    renderVIPPage,
    MIN_SELECT, MAX_SELECT,
    MIN_NETWORTH, MIN_REP,
    WHOLESALE_DISC,
  };
})();
