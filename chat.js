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
    // Reset any incomplete purchase flow when re-opening.
    if (listing.purchaseFlow && listing.purchaseFlow !== "completed") {
      listing.purchaseFlow = "idle";
    }

    // Replay or initialize conversation.
    if (!Array.isArray(listing.chatLog) || listing.chatLog.length === 0) {
      const opener = openerMessage(listing);
      pushMessage(listing, "seller", opener);
      if (listing.isExInter) {
        pushMessage(listing, "system", `⚠️ Listing ini Ex-Inter / No Pajak. Murah, tapi IMEI bisa kena blokir signal.`);
      }
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
    const lines = [
      `Halo bro/sis! 👋 Saya jual ${listing.name} ${listing.specs.ram}/${listing.specs.rom} warna ${listing.specs.color}.`,
      `Kelengkapan ${listing.completeness.type}, kondisi ${listing.defect.type}.`,
    ];
    if (listing.isExInter) {
      lines.push(`Ini barang Ex-Inter ya bro, no pajak — makanya harga miring banget. Tau resikonya kan? 😏`);
    }
    lines.push(`Harga net ${fmt(listing.finalPrice)} ya. Serius minat? 🙏`);
    return lines.join("\n");
  }

  function dealLine(listing) {
    return `Sip mantap! Transfer ke rekening saya ya, barang langsung dikirim/COD. Makasih bro 📦✨`;
  }


  /* =========================================================
   * Part 35 — Advanced Negotiation
   *
   * State stored on `listing`:
   *   patience           : hidden int (2..4), -1 each rejected counter
   *   minAcceptablePrice : seller's hard floor (computed once)
   *   currentPrice       : current "live" asking from the seller
   *   chatLocked         : true when seller rage-quits (patience hit 0)
   *
   * Algorithm on player offer X:
   *   if X >= currentPrice              → seller accepts at X (overpaid)
   *   elif X >= minAcceptablePrice      → seller accepts at X (player won)
   *   elif patience > 1                 → seller counters at midpoint
   *                                        between currentPrice and X,
   *                                        patience -= 1, currentPrice = mid
   *   else (patience == 1, will hit 0)  → seller rage-quits, lock chat
   * ========================================================= */

  function ensureNegotiationState(listing) {
    if (typeof listing.patience !== "number") {
      // Random 2..4 inclusive
      listing.patience = 2 + Math.floor(Math.random() * 3);
    }
    if (typeof listing.minAcceptablePrice !== "number") {
      // Stiff (Mulus): floor ≈ 90% of asking; flexible (Retak): floor ≈ 70%.
      // Uses defect.haggleAcceptRate + completeness.haggleBonus as the
      // "willingness to discount" proxy, same data the old system used.
      const willingness = (listing.defect.haggleAcceptRate || 0) +
                          (listing.completeness.haggleBonus || 0);
      const maxDiscount = Math.min(0.30, 0.05 + willingness * 0.4); // 5%..30%
      const floor = listing.finalPrice * (1 - maxDiscount);
      listing.minAcceptablePrice = Math.max(50_000, Math.round(floor / 50_000) * 50_000);
    }
    if (typeof listing.chatLocked !== "boolean") {
      listing.chatLocked = false;
    }
    if (typeof listing.currentPrice !== "number") {
      listing.currentPrice = listing.finalPrice;
    }
  }

  function midpoint(a, b) {
    return Math.round(((a + b) / 2) / 50_000) * 50_000;
  }

  function counterLine(midPrice) {
    const lines = [
      `Belum dapet gan. Kalau ${fmt(midPrice)} langsung bungkus deh 🤝`,
      `Hmm masih ketinggian buat saya. Gimana kalo ${fmt(midPrice)}? Fix ya kalau mau.`,
      `Saya turunin lagi nih ke ${fmt(midPrice)}. Lebih murah lagi gak bisa bro 😅`,
      `Oke nego tipis, ${fmt(midPrice)} aja. Kalau cocok langsung COD/transfer.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function acceptCounterLine(price) {
    const lines = [
      `Wah oke deh kakak, ${fmt(price)} saya iyain! Deal 🤝`,
      `Yaudah ${fmt(price)} fix ya, mantap nego nya 😅`,
      `Sip ${fmt(price)} sah ya, langsung diproses bro.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function rageQuitLine() {
    const lines = [
      `Males ah, nego afgan! 😤 Cari yang lain aja gan.`,
      `Udah cape nego nya bro, kasih harga gak masuk akal terus. Cabut! 👋`,
      `Males lah, nego afgan banget. Saya tutup ya chatnya 🙏`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /* ---------- Action button rendering (Part 35) ---------- */
  function renderActions(listing) {
    ensureNegotiationState(listing);
    actionsEl.innerHTML = "";

    if (listing.chatLocked) {
      actionsEl.innerHTML = `
        <p class="chat-locked-note">
          <i class="fa-solid fa-lock"></i> Seller udah males nego — chat dikunci.
        </p>
        <button id="chat-leave" class="chat-action leave w-full">
          <i class="fa-solid fa-arrow-left"></i> Leave Chat
        </button>`;
      actionsEl.querySelector("#chat-leave").addEventListener("click", closeChat);
      return;
    }

    /* Part 17 — Two-row layout that doesn't overflow on 360px phones:
     *   Row 1 (grid 2-col): [Accept]  [Leave Chat]
     *   Row 2 (flex):       [Input flex-grow]  [Kirim Tawaran shrink-0]
     */
    actionsEl.innerHTML = `
      <div class="chat-actions-row chat-actions-row-grid">
        <button id="chat-accept" class="chat-action accept">
          <i class="fa-solid fa-check"></i>
          <span class="chat-action-label">Accept ${fmt(listing.currentPrice)}</span>
        </button>
        <button id="chat-leave" class="chat-action leave">
          <i class="fa-solid fa-xmark"></i>
          <span class="chat-action-label">Leave Chat</span>
        </button>
      </div>
      <div class="chat-actions-row chat-haggle-row">
        <input id="chat-offer-input" type="text" inputmode="numeric" pattern="[0-9]*"
               class="chat-offer-input" autocomplete="off"
               placeholder="Tawar berapa? (IDR)" />
        <button id="chat-offer-send" class="chat-action haggle chat-action-send">
          <i class="fa-solid fa-paper-plane"></i>
          <span class="chat-action-label">Kirim</span>
        </button>
      </div>
      <p id="chat-offer-error" class="chat-offer-error"></p>
    `;

    const input = actionsEl.querySelector("#chat-offer-input");
    // Strip non-digits on every keystroke / paste
    const sanitize = () => {
      const cleaned = String(input.value || "").replace(/[^0-9]/g, "");
      if (cleaned !== input.value) input.value = cleaned;
    };
    input.addEventListener("input", sanitize);
    input.addEventListener("paste", () => setTimeout(sanitize, 0));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitOffer(); }
    });

    actionsEl.querySelector("#chat-accept").addEventListener("click", () => onAccept(listing));
    actionsEl.querySelector("#chat-offer-send").addEventListener("click", submitOffer);
    actionsEl.querySelector("#chat-leave").addEventListener("click", closeChat);

    function submitOffer() {
      sanitize();
      const errEl = actionsEl.querySelector("#chat-offer-error");
      const raw = Number(input.value);
      if (!isFinite(raw) || raw < 50_000) {
        errEl.textContent = "Tawaran minimal Rp 50.000.";
        return;
      }
      errEl.textContent = "";
      const amount = Math.round(raw / 50_000) * 50_000;
      onSendOffer(listing, amount);
    }
  }


  /* ---------- Action handlers ---------- */
  function onSendOffer(listing, amount) {
    ensureNegotiationState(listing);
    pushMessage(listing, "player", `Saya tawar ${fmt(amount)} ya bro. Dikasih gak? 🙏`);

    showTyping();
    setTimeout(() => {
      hideTyping();

      // 1. Player offered AT or ABOVE seller's current ask → instant deal at the
      //    player's amount (they've already conceded above the live price).
      if (amount >= listing.currentPrice) {
        listing.currentPrice = amount;
        pushMessage(listing, "seller", acceptCounterLine(amount));
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 2. Player offered AT or ABOVE seller's hidden floor → seller accepts.
      if (amount >= listing.minAcceptablePrice) {
        listing.currentPrice = amount;
        pushMessage(listing, "seller", acceptCounterLine(amount));
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 3. Below the floor — patience drops by 1.
      listing.patience -= 1;

      if (listing.patience <= 0) {
        listing.chatLocked = true;
        pushMessage(listing, "seller", rageQuitLine());
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 4. Still has patience → meet in the middle.
      const mid = midpoint(listing.currentPrice, amount);
      // Don't let the midpoint slip below the floor — clamp up.
      const safeMid = Math.max(mid, listing.minAcceptablePrice);
      listing.currentPrice = safeMid;
      pushMessage(listing, "seller", counterLine(safeMid));
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


  /* ---------- Accept = choose payment method ---------- */
  function onAccept(listing) {
    if (listing.purchaseFlow && listing.purchaseFlow !== "idle") return;
    listing.purchaseFlow = "method";
    pushMessage(listing, "player", `Oke, saya minat ambil bro. Pakai metode apa enaknya?`);
    showTyping();
    setTimeout(() => {
      hideTyping();
      pushMessage(listing, "seller", `Bisa Bank Transfer atau COD ketemuan langsung. Pilih mana?`);
      renderPaymentMethodActions(listing);
    }, 600);
  }

  function renderPaymentMethodActions(listing) {
    actionsEl.innerHTML = `
      <button id="method-transfer" class="chat-action accept">
        <i class="fa-solid fa-building-columns"></i>
        Bank Transfer
        <span class="text-xs opacity-80">Cepat & langsung</span>
      </button>
      <button id="method-cod" class="chat-action haggle">
        <i class="fa-solid fa-handshake"></i>
        COD (Meetup)
        <span class="text-xs opacity-80">Bisa cek barang dulu</span>
      </button>
      <button id="method-cancel" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> Cancel
      </button>
    `;
    actionsEl.querySelector("#method-transfer").addEventListener("click", () => onPickTransfer(listing));
    actionsEl.querySelector("#method-cod").addEventListener("click", () => onPickCOD(listing));
    actionsEl.querySelector("#method-cancel").addEventListener("click", () => {
      listing.purchaseFlow = "idle";
      renderActions(listing);
    });
  }

  /* ---------- Path A: Bank Transfer ---------- */
  function onPickTransfer(listing) {
    listing.purchaseFlow = "pick-bank";
    listing.paymentMethod = "Transfer";
    pushMessage(listing, "player", `Saya transfer aja ya, biar cepat 💸`);
    showBankPickerActions(listing);
  }

  /* ---------- Path B: COD with inspection ---------- */
  function onPickCOD(listing) {
    listing.purchaseFlow = "inspecting";
    listing.paymentMethod = "COD";
    pushMessage(listing, "player", `COD aja deh, mau cek dulu kondisinya 🔍`);
    runInspection(listing);
  }

  function runInspection(listing) {
    const overlay = document.querySelector("#inspect-overlay");
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");

    setTimeout(() => {
      const HIDDEN_DEFECT_RATE = 0.25;
      const hasHidden = Math.random() < HIDDEN_DEFECT_RATE;
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");

      if (hasHidden) {
        showHiddenDefect(listing);
      } else {
        pushMessage(listing, "system", `🔍 Hasil inspeksi: Barang sesuai deskripsi.`);
        pushMessage(listing, "seller", `Tuh kan, bersih semua. Bayar pakai bank apa?`);
        showBankPickerActions(listing);
      }
    }, 2000);
  }

  /* ---------- Hidden Defect popup ---------- */
  const HIDDEN_DEFECTS = [
    "Found a hidden scratch on the back glass.",
    "True Tone is off / sensor warna error.",
    "Speaker bawah pecah saat volume tinggi.",
    "Konektor charging goyang, perlu service.",
    "Battery cycle ternyata lewat 800 (sangat tinggi).",
    "Ada bekas servis di mainboard.",
    "Kamera ultrawide ngeblur, sensor bermasalah.",
  ];

  function showHiddenDefect(listing) {
    const found = HIDDEN_DEFECTS[Math.floor(Math.random() * HIDDEN_DEFECTS.length)];
    listing.hiddenDefect = found;
    pushMessage(listing, "system", `⚠️ Hidden defect ditemukan: ${found}`);

    const modal = document.querySelector("#defect-modal");
    modal.querySelector("#defect-text").textContent = found;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const cancelBtn = modal.querySelector("#defect-cancel");
    const negotiateBtn = modal.querySelector("#defect-negotiate");

    const closeModal = () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    };

    cancelBtn.onclick = () => {
      closeModal();
      pushMessage(listing, "player", `Wah ada minus tersembunyi: ${found}. Sorry bro, batal aja.`);
      pushMessage(listing, "seller", `Ya udah deh. Mungkin lain kali 🙏`);
      listing.purchaseFlow = "idle";
      renderActions(listing);
    };

    negotiateBtn.onclick = () => {
      closeModal();
      /* ============================================================
       * Part 17 fix — Hidden Defect price discount math.
       *
       * Bug: The old code did
       *     basePrice = listing.haggleState === "accepted"
       *                   ? listing.currentPrice
       *                   : listing.finalPrice;
       * but Part 35 removed `haggleState` entirely and now keeps
       * `listing.currentPrice` live at all times. The fallback to
       * `listing.finalPrice` was kicking in even after the player
       * had negotiated way below it, so applying -15% to the original
       * asking made the price jump UP instead of DOWN.
       *
       * Correct behaviour: the -15% is ALWAYS taken off the
       * currently-agreed price (currentPrice). Math is forced to
       * round DOWN to Rp 50k so the result is always strictly less
       * than the price before inspection — never higher.
       * ============================================================ */
      const previousPrice = Number(listing.currentPrice) || Number(listing.finalPrice) || 0;
      let newPrice = Math.floor((previousPrice * 0.85) / 50_000) * 50_000;
      // Defensive: never let it round up to or past the previous price.
      if (newPrice >= previousPrice) {
        newPrice = Math.max(50_000, previousPrice - 50_000);
      }
      if (newPrice < 50_000) newPrice = 50_000;
      listing.currentPrice = newPrice;
      // Also stamp legacy state so any code path still reading haggleState behaves.
      listing.haggleState = "accepted";
      pushMessage(listing, "player",
        `Karena ada minus tersembunyi (${found}), saya tawar -15% dari harga deal kita ya bro. Jadi ${fmt(newPrice)}.`);
      showTyping();
      setTimeout(() => {
        hideTyping();
        pushMessage(listing, "seller",
          `Hmm... oke deh, fair lah dari ${fmt(previousPrice)} jadi ${fmt(newPrice)}. Bayar pakai bank apa?`);
        showBankPickerActions(listing);
      }, 700);
    };
  }


  /* ---------- Bank picker (used by both Transfer and COD paths) ---------- */
  function showBankPickerActions(listing) {
    // Part 17 — always use the live currentPrice (kept up-to-date by the
    // Part 35 patience-meter system AND by the hidden-defect handler).
    // Falling back to finalPrice here would charge the player the original
    // asking instead of the negotiated amount.
    const price = Number(listing.currentPrice) || Number(listing.finalPrice) || 0;
    const s = window.FlippingTycoon.State.data;
    const banks = ["Mandiri", "BCA", "BNI"];
    const buttons = banks.map((b) => {
      const enough = (s.bankBalances[b] || 0) >= price;
      return `
        <button class="chat-action bank-pick bank-pick-${b.toLowerCase()}" data-bank="${b}" ${enough ? "" : "disabled"}>
          <i class="fa-solid fa-building-columns"></i>
          ${b}
          <span class="text-xs opacity-80">${fmt(s.bankBalances[b] || 0)}${enough ? "" : " (kurang)"}</span>
        </button>`;
    }).join("");
    actionsEl.innerHTML = buttons + `
      <button id="bank-cancel" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> Cancel
      </button>`;
    actionsEl.querySelectorAll(".bank-pick").forEach((btn) => {
      btn.addEventListener("click", () => completePurchase(listing, btn.dataset.bank));
    });
    actionsEl.querySelector("#bank-cancel").addEventListener("click", () => {
      listing.purchaseFlow = "idle";
      renderActions(listing);
    });
  }

  function completePurchase(listing, sourceBank) {
    // Part 17 — same fix as showBankPickerActions: charge the live
    // currentPrice, not the original asking. Part 35 keeps currentPrice
    // up-to-date through every counter-offer; the hidden-defect handler
    // also lowers it before this is called.
    const price = Number(listing.currentPrice) || Number(listing.finalPrice) || 0;
    const s = window.FlippingTycoon.State.data;
    if ((s.bankBalances[sourceBank] || 0) < price) {
      pushMessage(listing, "system", `Saldo ${sourceBank} tidak cukup.`);
      return;
    }

    pushMessage(listing, "player", `Sip, transfer dari ${sourceBank} ya bro. ${fmt(price)} 💸`);
    showTyping();

    setTimeout(() => {
      hideTyping();
      pushMessage(listing, "seller", dealLine(listing));

      // Deduct from chosen bank.
      s.bankBalances[sourceBank] -= price;
      s.bankHistories[sourceBank].push({
        type: "DEBIT",
        amount: price,
        balanceAfter: s.bankBalances[sourceBank],
        description: `Payment to ${listing.seller.name} via ${listing.paymentMethod || "Transfer"}`,
        category: "purchase",
        day: s.currentDay,
        ts: Date.now(),
      });

      // Add to inventory (preserving any hidden defect found at COD).
      s.inventory.push({
        id: listing.listingId,
        gadgetId: listing.gadgetId,
        name: listing.name,
        brand: listing.brand,
        specs: listing.specs,
        completeness: listing.completeness,
        defect: listing.defect,
        hiddenDefect: listing.hiddenDefect || null,
        buyPrice: price,
        buyDay: s.currentDay,
        paymentMethod: listing.paymentMethod || "Transfer",
        sourceBank,
        // Part 6: black-market provenance & IMEI status tracking.
        isExInter: !!listing.isExInter,
        imeiStatus: listing.isExInter ? "ok" : null,
      });

      window.Market.removeListing(listing.listingId);
      window.FlippingTycoon.saveGame();

      // Part 10: archive the seller chat & bump player profile stats.
      if (window.Profile) {
        window.Profile.recordPurchase({ gadget: { name: listing.name, isExInter: !!listing.isExInter } });
        window.Profile.archiveChat({
          role: "buyer",
          counterparty: { name: listing.seller.name, avatar: listing.seller.avatar, color: listing.seller.color, location: listing.seller.location || null },
          gadget: { name: listing.name, icon: listing.icon, accent: listing.accent, brand: listing.brand, isExInter: !!listing.isExInter },
          chatLog: (listing.chatLog || []).slice(),
          outcome: "purchased",
          finalPrice: price,
          itemKey: "daily-" + listing.listingId,
        });
      }

      pushMessage(listing, "system",
        `✅ Transaksi sukses. ${fmt(price)} ditarik dari ${sourceBank} via ${listing.paymentMethod || "Transfer"}. Item masuk ke Inventory.`);
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Purchase Complete",
          message: `${listing.name} masuk Inventory${listing.isExInter ? " (Ex-Inter — awas IMEI block!)" : ""}. ${fmt(price)} ditarik dari ${sourceBank}.`,
          actionPage: "inventory",
          actor: listing.seller.name,
          icon: listing.isExInter ? "skull-crossbones" : "bag-shopping",
        });
      }
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

  /* ---------- Bank selection (legacy auto-pick fallback) ---------- */
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
