/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 2 — FB Messenger Chat: AI seller, haggle RNG, purchase
 * ========================================================= */

(function () {
  /* ---------- DOM refs (lazy) ---------- */
  let overlayEl = null;
  let messagesEl = null;
  let actionsEl = null;
  let headerEl = null;

  let currentListingId = null;

  function $(sel) { return document.querySelector(sel); }
  function fmt(n) { return window.Market.formatRupiah(n); }

  /* ---------- Open / close ---------- */
  function openWithListing(listingId) {
    currentListingId = listingId;
    overlayEl   = $("#chat-overlay");
    messagesEl  = $("#chat-messages");
    actionsEl   = $("#chat-actions");
    headerEl    = $("#chat-header");

    const listing = getListing();
    if (!listing) return;

    renderHeader(listing);
    messagesEl.innerHTML = "";
    actionsEl.innerHTML = "";
    overlayEl.classList.remove("hidden");
    overlayEl.classList.add("flex");

    // Replay or initialize conversation.
    if (!Array.isArray(listing.chatLog) || listing.chatLog.length === 0) {
      const opener = openerMessage(listing);
      pushMessage(listing, "seller", opener);
    } else {
      listing.chatLog.forEach((m) => renderBubble(m));
    }
    renderActions(listing);
    scrollToBottom();
  }


  function closeChat() {
    if (!overlayEl) return;
    overlayEl.classList.add("hidden");
    overlayEl.classList.remove("flex");
    currentListingId = null;
  }

  function getListing() {
    const s = window.FlippingTycoon.State.data;
    return (s.dailyListings || []).find((l) => l.listingId === currentListingId);
  }

  /* ---------- Header ---------- */
  function renderHeader(listing) {
    headerEl.innerHTML = `
      <button id="chat-close" class="chat-icon-btn" title="Close">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="chat-header-avatar" style="background:${listing.seller.color}">
        ${listing.seller.avatar}
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${listing.seller.name}</p>
        <p class="text-xs text-emerald-500">
          <i class="fa-solid fa-circle text-[7px]"></i> Active now
        </p>
      </div>
      <button class="chat-icon-btn" title="Call"><i class="fa-solid fa-phone"></i></button>
      <button class="chat-icon-btn" title="Video"><i class="fa-solid fa-video"></i></button>
      <button class="chat-icon-btn" title="More"><i class="fa-solid fa-circle-info"></i></button>
    `;
    headerEl.querySelector("#chat-close").addEventListener("click", closeChat);
  }


  /* ---------- Bubble rendering ---------- */
  function renderBubble(message) {
    const div = document.createElement("div");
    div.className = "chat-row " + (message.from === "player" ? "from-player" : "from-seller");
    if (message.from === "system") div.className = "chat-row from-system";

    if (message.from === "system") {
      div.innerHTML = `<div class="chat-system">${message.text}</div>`;
    } else {
      const avatar = message.from === "seller"
        ? `<div class="chat-bubble-avatar" style="background:${message.color || "#999"}">${message.avatar || "S"}</div>`
        : "";
      const bubble = `<div class="chat-bubble">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>`;
      div.innerHTML = avatar + bubble;
    }
    messagesEl.appendChild(div);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pushMessage(listing, from, text) {
    if (!Array.isArray(listing.chatLog)) listing.chatLog = [];
    const msg = { from, text };
    if (from === "seller") {
      msg.avatar = listing.seller.avatar;
      msg.color = listing.seller.color;
    }
    listing.chatLog.push(msg);
    renderBubble(msg);
    scrollToBottom();
    window.FlippingTycoon.saveGame();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }


  /* ---------- AI dialogue ---------- */
  function openerMessage(listing) {
    return [
      `Halo bro/sis! 👋 Saya jual ${listing.name} ${listing.specs.ram}/${listing.specs.rom} warna ${listing.specs.color}.`,
      `Kelengkapan ${listing.completeness.type}, kondisi ${listing.defect.type}.`,
      `Harga net ${fmt(listing.finalPrice)} ya. Serius minat? 🙏`,
    ].join("\n");
  }

  function haggleSuccessLine(listing, newPrice) {
    const lines = [
      `Hmm... oke deh bro buat kakak, saya lepas di ${fmt(newPrice)} aja. Deal? 🤝`,
      `Wah pinter nego ya 😅 Yaudah saya kasih ${fmt(newPrice)}, gak boleh kurang lagi.`,
      `Oke ${fmt(newPrice)} fix ya, anggap saja diskon karena kondisi ${listing.defect.short}.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function haggleRejectLine(listing) {
    const lines = [
      `Aduh maaf bro, harga ${fmt(listing.finalPrice)} udah mentok. Saya juga ambil dari supplier 😅`,
      `Wah gak bisa kurang lagi, kondisi ${listing.defect.short} pun harga segitu udah miring banget.`,
      `Maaf, harga net ya. Banyak yang minat soalnya, kalau gak ambil sekarang bisa keduluan.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function dealLine(listing) {
    return `Sip mantap! Transfer ke rekening saya ya, barang langsung dikirim/COD. Makasih bro 📦✨`;
  }


  /* ---------- Haggle RNG ----------
   * Success rate = defect.haggleAcceptRate + completeness.haggleBonus
   * Defect severity 0 (Mulus) : ~10% (very stiff)
   * Defect severity 4 (Retak) : ~85% (eager to dump)
   * "Batangan" adds +10% (no box, more flexible).
   */
  function rollHaggle(listing) {
    const rate = Math.min(0.95, listing.defect.haggleAcceptRate + listing.completeness.haggleBonus);
    return Math.random() < rate;
  }

  /* ---------- Action button rendering ---------- */
  function renderActions(listing) {
    actionsEl.innerHTML = "";

    const haggleDisabled = listing.haggleState === "rejected";
    const haggleAccepted = listing.haggleState === "accepted";

    const acceptLabel = haggleAccepted
      ? `Accept ${fmt(listing.currentPrice)}`
      : `Accept ${fmt(listing.finalPrice)}`;

    actionsEl.innerHTML = `
      <button id="chat-accept" class="chat-action accept">
        <i class="fa-solid fa-check"></i> ${acceptLabel}
      </button>
      <button id="chat-haggle" class="chat-action haggle" ${haggleDisabled || haggleAccepted ? "disabled" : ""}>
        <i class="fa-solid fa-hand-holding-dollar"></i>
        Haggle (-10%)
        <span class="text-xs opacity-80">${Math.round((listing.defect.haggleAcceptRate + listing.completeness.haggleBonus) * 100)}% chance</span>
      </button>
      <button id="chat-leave" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> Leave Chat
      </button>
    `;

    actionsEl.querySelector("#chat-accept").addEventListener("click", () => onAccept(listing));
    actionsEl.querySelector("#chat-haggle").addEventListener("click", () => onHaggle(listing));
    actionsEl.querySelector("#chat-leave").addEventListener("click", closeChat);
  }


  /* ---------- Action handlers ---------- */
  function onHaggle(listing) {
    if (listing.haggleState) return;
    pushMessage(listing, "player", `Bisa kurang lagi gak bro? Saya tawar 10% nih, soalnya kondisi ${listing.defect.short}.`);

    // Tiny "typing..." delay then result
    showTyping();
    setTimeout(() => {
      hideTyping();
      const success = rollHaggle(listing);
      if (success) {
        const newPrice = Math.round((listing.finalPrice * 0.9) / 50_000) * 50_000;
        listing.currentPrice = newPrice;
        listing.haggleState = "accepted";
        pushMessage(listing, "seller", haggleSuccessLine(listing, newPrice));
      } else {
        listing.haggleState = "rejected";
        pushMessage(listing, "seller", haggleRejectLine(listing));
      }
      window.FlippingTycoon.saveGame();
      renderActions(listing);
    }, 900);
  }

  function showTyping() {
    const div = document.createElement("div");
    div.id = "chat-typing";
    div.className = "chat-row from-seller";
    div.innerHTML = `
      <div class="chat-bubble-avatar" style="background:#999">…</div>
      <div class="chat-bubble typing">
        <span></span><span></span><span></span>
      </div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }
  function hideTyping() {
    const t = document.getElementById("chat-typing");
    if (t) t.remove();
  }


  /* ---------- Accept = purchase ---------- */
  function onAccept(listing) {
    const price = listing.haggleState === "accepted" ? listing.currentPrice : listing.finalPrice;
    const sourceBank = pickPayingBank(price);
    if (!sourceBank) {
      pushMessage(listing, "system",
        `Saldo tidak cukup di semua rekening untuk membeli ${listing.name} (${fmt(price)}). Top up dulu via menu Banking.`);
      return;
    }

    // Player confirmation message
    pushMessage(listing, "player", `Oke deal bro, transfer dari ${sourceBank} sekarang ya 💸`);
    showTyping();

    setTimeout(() => {
      hideTyping();
      pushMessage(listing, "seller", dealLine(listing));

      // Mutate state: deduct, add inventory item, log bank history.
      const s = window.FlippingTycoon.State.data;
      s.bankBalances[sourceBank] -= price;
      s.bankHistories[sourceBank].push({
        type: "DEBIT",
        amount: price,
        balanceAfter: s.bankBalances[sourceBank],
        description: `Beli ${listing.name} dari ${listing.seller.name}`,
        day: s.currentDay,
        ts: Date.now(),
      });
      s.inventory.push({
        id: listing.listingId,
        gadgetId: listing.gadgetId,
        name: listing.name,
        brand: listing.brand,
        specs: listing.specs,
        completeness: listing.completeness,
        defect: listing.defect,
        buyPrice: price,
        buyDay: s.currentDay,
        sourceBank,
      });

      window.Market.removeListing(listing.listingId);
      window.FlippingTycoon.saveGame();

      // Show a closing system message + auto-close after a beat.
      pushMessage(listing, "system",
        `✅ Transaksi sukses. ${fmt(price)} ditarik dari ${sourceBank}. Item masuk ke Inventory.`);
      actionsEl.innerHTML = `
        <button id="chat-done" class="chat-action accept w-full">
          <i class="fa-solid fa-check-double"></i> Close & Back to Marketplace
        </button>`;
      actionsEl.querySelector("#chat-done").addEventListener("click", () => {
        closeChat();
        window.FlippingTycoon.renderActivePage();
      });
    }, 700);
  }


  /* ---------- Bank selection (prefer Mandiri) ---------- */
  function pickPayingBank(price) {
    const s = window.FlippingTycoon.State.data;
    const order = ["Mandiri", "BCA", "BNI"];
    for (const b of order) {
      if ((s.bankBalances[b] || 0) >= price) return b;
    }
    return null;
  }

  /* ---------- Public API ---------- */
  window.Chat = {
    openWithListing,
    closeChat,
  };
})();
