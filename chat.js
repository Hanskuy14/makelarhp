/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 2 — NB Messenger Chat: AI seller, haggle RNG, purchase
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
      sendOpener(listing);
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
          <i class="fa-solid fa-circle text-[7px]"></i> ${t("chat.activeNow")}
        </p>
      </div>
      <button class="chat-icon-btn" title="Call"><i class="fa-solid fa-phone"></i></button>
      <button class="chat-icon-btn" title="Video"><i class="fa-solid fa-video"></i></button>
      <button class="chat-icon-btn" title="More"><i class="fa-solid fa-circle-info"></i></button>
    `;
    headerEl.querySelector("#chat-close").addEventListener("click", closeChat);
  }


  /* ---------- Bubble rendering ---------- */

  /* i18n (Part 36): a chat message can be stored two ways —
   *   { from, text }            -> raw, untranslatable (legacy saves)
   *   { from, key, params }     -> translation key + params (re-translates)
   * resolveMsg() turns either into the final display string in the
   * ACTIVE language. Params whose value is a {k:"dict.key"} marker are
   * themselves translated at render time (used for condition/defect
   * labels embedded in a sentence), so everything flips on switch. */
  function resolveMsg(message) {
    if (!message) return "";
    if (message.key) {
      const params = {};
      const p = message.params || {};
      Object.keys(p).forEach((name) => {
        const v = p[name];
        params[name] = (v && typeof v === "object" && v.k) ? t(v.k) : v;
      });
      return t(message.key, params);
    }
    return message.text != null ? message.text : "";
  }

  function renderBubble(message) {
    const div = document.createElement("div");
    div.className = "chat-row " + (message.from === "player" ? "from-player" : "from-seller");
    if (message.from === "system") div.className = "chat-row from-system";

    const text = resolveMsg(message);
    if (message.from === "system") {
      div.innerHTML = `<div class="chat-system">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
    } else {
      const avatar = message.from === "seller"
        ? `<div class="chat-bubble-avatar" style="background:${message.color || "#999"}">${message.avatar || "S"}</div>`
        : "";
      const bubble = `<div class="chat-bubble">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
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

  /** Low-level: append an already-built message object to the log + DOM. */
  function appendMessage(listing, msg) {
    if (!Array.isArray(listing.chatLog)) listing.chatLog = [];
    if (msg.from === "seller") {
      msg.avatar = listing.seller.avatar;
      msg.color = listing.seller.color;
    }
    listing.chatLog.push(msg);
    renderBubble(msg);
    scrollToBottom();
    if (msg.from === "seller" && window.AudioManager) window.AudioManager.playChatPop();
    window.FlippingTycoon.saveGame();
  }

  /** Push a RAW (untranslatable) message — kept for edge cases. */
  function pushMessage(listing, from, text) {
    appendMessage(listing, { from, text });
  }

  /** Push a TRANSLATABLE message (key + params). Use this everywhere so
   * the conversation re-renders in the active language on switch. */
  function pushKey(listing, from, key, params) {
    appendMessage(listing, { from, key, params: params || null });
  }

  /** Pick a random dictionary key from "prefix1".."prefixN" (variety
   * while staying translatable — we store the chosen key, not the text). */
  function pickKey(prefix, count) {
    return prefix + (1 + Math.floor(Math.random() * count));
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }


  /* ---------- AI dialogue (Part 36: fully translatable) ----------
   * Instead of returning hardcoded strings, the generators now push
   * TRANSLATION KEYS + PARAMS. Params that are themselves translatable
   * (the completeness / defect labels) are stored as {k:"dict.key"}
   * markers and resolved at render time, so the whole opener flips
   * language live. Prices are passed pre-formatted (Rp is locale-neutral). */
  function sendOpener(listing) {
    const I = window.i18n;
    const cKey = I.conditionKey(listing.completeness);
    const dKey = I.defectKey(listing.defect);

    pushKey(listing, "seller", "chat.opener_intro", {
      name: listing.name, ram: listing.specs.ram, rom: listing.specs.rom, color: listing.specs.color,
    });
    pushKey(listing, "seller", "chat.opener_condition", {
      completeness: { k: "conditions." + cKey + ".label" },
      defect: { k: "defects." + dKey + ".label" },
    });
    if (listing.isExInter) {
      pushKey(listing, "seller", "chat.opener_exinter");
    }
    pushKey(listing, "seller", "chat.opener_price", { price: fmt(listing.finalPrice) });
    if (listing.isExInter) {
      pushKey(listing, "system", "chat.exinter_system");
    }
  }

  function sendDealLine(listing) {
    pushKey(listing, "seller", "chat.deal");
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
      // Part 20 — Reputation: Newbie players see stiffer sellers (floor ×1.20),
      // Suhu players see more flexible ones (×0.90). Multiplier is applied to
      // the FLOOR price, so >1 = stingier seller (less willing to discount).
      const stiffness = (window.Reputation && window.Reputation.getSellerStiffness)
        ? Number(window.Reputation.getSellerStiffness()) || 1
        : 1;
      const floor = listing.finalPrice * (1 - maxDiscount) * stiffness;
      // Never let the rep stiffness push the floor above the asking price.
      const cappedFloor = Math.min(floor, listing.finalPrice);
      listing.minAcceptablePrice = Math.max(50_000, Math.round(cappedFloor / 50_000) * 50_000);
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

  /* Part 36: the seller's counter / accept / rage-quit lines are now
   * keyed in the dictionary (chat.counter_1..4, chat.accept_1..3,
   * chat.ragequit_1..3). onSendOffer() picks one key at random via
   * pickKey() and pushes it with pushKey(), so the stored chat log
   * re-translates on a language switch. */

  /* ---------- Action button rendering (Part 35) ---------- */
  function renderActions(listing) {
    ensureNegotiationState(listing);
    actionsEl.innerHTML = "";

    if (listing.chatLocked) {
      actionsEl.innerHTML = `
        <p class="chat-locked-note">
          <i class="fa-solid fa-lock"></i> ${t("chat.locked")}
        </p>
        <button id="chat-leave" class="chat-action leave w-full">
          <i class="fa-solid fa-arrow-left"></i> ${t("chat.leave")}
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
          <span class="chat-action-label">${t("chat.accept_label", { price: fmt(listing.currentPrice) })}</span>
        </button>
        <button id="chat-leave" class="chat-action leave">
          <i class="fa-solid fa-xmark"></i>
          <span class="chat-action-label">${t("chat.leave")}</span>
        </button>
      </div>
      <div class="chat-actions-row chat-haggle-row">
        <input id="chat-offer-input" type="text" inputmode="numeric" pattern="[0-9]*"
               class="chat-offer-input" autocomplete="off"
               placeholder="${t("chat.offerPlaceholder")}" />
        <button id="chat-offer-send" class="chat-action haggle chat-action-send">
          <i class="fa-solid fa-paper-plane"></i>
          <span class="chat-action-label">${t("chat.sendOffer")}</span>
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
        errEl.textContent = t("chat.offer_min_error");
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
    pushKey(listing, "player", "chat.player_offer", { price: fmt(amount) });

    showTyping();
    setTimeout(() => {
      hideTyping();

      // 1. Player offered AT or ABOVE seller's current ask → instant deal at the
      //    player's amount (they've already conceded above the live price).
      if (amount >= listing.currentPrice) {
        listing.currentPrice = amount;
        pushKey(listing, "seller", pickKey("chat.accept_", 3), { price: fmt(amount) });
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 2. Player offered AT or ABOVE seller's hidden floor → seller accepts.
      if (amount >= listing.minAcceptablePrice) {
        listing.currentPrice = amount;
        pushKey(listing, "seller", pickKey("chat.accept_", 3), { price: fmt(amount) });
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 3. Below the floor — patience drops by 1.
      listing.patience -= 1;

      if (listing.patience <= 0) {
        listing.chatLocked = true;
        pushKey(listing, "seller", pickKey("chat.ragequit_", 3));
        window.FlippingTycoon.saveGame();
        renderActions(listing);
        return;
      }

      // 4. Still has patience → meet in the middle.
      const mid = midpoint(listing.currentPrice, amount);
      // Don't let the midpoint slip below the floor — clamp up.
      const safeMid = Math.max(mid, listing.minAcceptablePrice);
      listing.currentPrice = safeMid;
      pushKey(listing, "seller", pickKey("chat.counter_", 4), { price: fmt(safeMid) });
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
    pushKey(listing, "player", "chat.player_interested");
    showTyping();
    setTimeout(() => {
      hideTyping();
      pushKey(listing, "seller", "chat.seller_method");
      renderPaymentMethodActions(listing);
    }, 600);
  }

  function renderPaymentMethodActions(listing) {
    actionsEl.innerHTML = `
      <button id="method-transfer" class="chat-action accept">
        <i class="fa-solid fa-building-columns"></i>
        ${t("chat.method_transfer")}
        <span class="text-xs opacity-80">${t("chat.method_transfer_hint")}</span>
      </button>
      <button id="method-cod" class="chat-action haggle">
        <i class="fa-solid fa-handshake"></i>
        ${t("chat.method_cod")}
        <span class="text-xs opacity-80">${t("chat.method_cod_hint")}</span>
      </button>
      <button id="method-cancel" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> ${t("chat.cancel")}
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
    pushKey(listing, "player", "chat.player_pick_transfer");
    showBankPickerActions(listing);
  }

  /* ---------- Path B: COD with inspection ---------- */
  function onPickCOD(listing) {
    listing.purchaseFlow = "inspecting";
    listing.paymentMethod = "COD";
    pushKey(listing, "player", "chat.player_pick_cod");
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

      // UPDATE ("Foldable…"): an extreme foldable bomb takes priority at COD.
      if (listing.foldableHiddenDefect) {
        const def = window.Market.revealFoldableDefect(listing);
        if (window.Repair && window.Repair.warnFoldableDefect) {
          window.Repair.warnFoldableDefect(def); // toast + notification
        }
        showFoldableDefectModal(listing, def);
        return;
      }

      if (hasHidden) {
        showHiddenDefect(listing);
      } else {
        pushKey(listing, "system", "chat.inspect_clean");
        pushKey(listing, "seller", "chat.seller_clean");
        showBankPickerActions(listing);
      }
    }, 2000);
  }

  /* ---------- Hidden Defect popup ---------- */
  /* Part 36: store stable KEYS, not raw strings. The chat log embeds the
   * key via a {k:...} param marker so the found-defect text re-translates. */
  const HIDDEN_DEFECT_KEYS = [
    "back_glass", "true_tone", "speaker", "charging_port",
    "battery_cycle", "board_repair", "ultrawide",
  ];

  function showHiddenDefect(listing) {
    const foundKey = HIDDEN_DEFECT_KEYS[Math.floor(Math.random() * HIDDEN_DEFECT_KEYS.length)];
    const foundDictKey = "chat.hidden." + foundKey;
    // Keep a stable key on the listing for inventory/re-translation, plus a
    // resolved string snapshot for legacy modules that read .hiddenDefect.
    listing.hiddenDefectKey = foundDictKey;
    listing.hiddenDefect = t(foundDictKey);
    pushKey(listing, "system", "chat.hidden_found", { defect: { k: foundDictKey } });

    const modal = document.querySelector("#defect-modal");
    modal.querySelector("#defect-text").textContent = t(foundDictKey);
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
      pushKey(listing, "player", "chat.player_cancel_hidden", { defect: { k: foundDictKey } });
      pushKey(listing, "seller", "chat.seller_cancel");
      // Part 20 — Reputation: -10 for cancelling after the seller agreed on a price.
      if (window.Reputation) {
        window.Reputation.onDealCancel({ reason: "Cancel COD after seller accepted (hidden defect found)" });
      }
      listing.purchaseFlow = "idle";
      renderActions(listing);
    };

    negotiateBtn.onclick = () => {
      closeModal();
      /* ============================================================
       * Part 17 fix — Hidden Defect price discount math (unchanged):
       * the -15% is ALWAYS taken off the currently-agreed price
       * (currentPrice), rounded DOWN to Rp 50k so it's never higher.
       * ============================================================ */
      const previousPrice = Number(listing.currentPrice) || Number(listing.finalPrice) || 0;
      let newPrice = Math.floor((previousPrice * 0.85) / 50_000) * 50_000;
      if (newPrice >= previousPrice) {
        newPrice = Math.max(50_000, previousPrice - 50_000);
      }
      if (newPrice < 50_000) newPrice = 50_000;
      listing.currentPrice = newPrice;
      listing.haggleState = "accepted";
      if (window.Reputation) {
        window.Reputation.onForceSaleWithDefect({
          reason: `Force-bought unit with hidden defect: ${listing.hiddenDefect}`,
        });
      }
      pushKey(listing, "player", "chat.player_nego_hidden", {
        defect: { k: foundDictKey }, price: fmt(newPrice),
      });
      showTyping();
      setTimeout(() => {
        hideTyping();
        pushKey(listing, "seller", "chat.seller_nego_hidden", {
          prev: fmt(previousPrice), price: fmt(newPrice),
        });
        showBankPickerActions(listing);
      }, 700);
    };
  }


  /* ---------- Extreme Foldable Defect popup (UPDATE) ----------
   * COD reveal for an extreme foldable defect. Reuses the same
   * #defect-modal, but applies a steeper -25% discount because the
   * repair bill (Rp 3jt–7jt, 2 days) is far nastier than a normal minus.
   */
  function showFoldableDefectModal(listing, def) {
    const I = window.i18n;
    const dKey = I.defectKey(def);
    const labelKey = "defects." + dKey + ".label";
    const descKey = "defects." + dKey + ".desc";
    pushKey(listing, "system", "chat.inspect_foldable", {
      defect: { k: labelKey }, desc: { k: descKey },
    });

    const modal = document.querySelector("#defect-modal");
    modal.querySelector("#defect-text").textContent =
      `${t(labelKey)} — ${t(descKey)}`;
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
      pushKey(listing, "player", "chat.player_cancel_foldable", { defect: { k: labelKey } });
      pushKey(listing, "seller", "chat.seller_cancel_foldable");
      if (window.Reputation) {
        window.Reputation.onDealCancel({ reason: `COD cancel: foldable defect ${def.type}` });
      }
      listing.purchaseFlow = "idle";
      renderActions(listing);
    };

    negotiateBtn.onclick = () => {
      closeModal();
      const previousPrice = Number(listing.currentPrice) || Number(listing.finalPrice) || 0;
      let newPrice = Math.floor((previousPrice * 0.75) / 50_000) * 50_000; // -25%, rounded DOWN
      if (newPrice >= previousPrice) {
        newPrice = Math.max(50_000, previousPrice - 50_000);
      }
      if (newPrice < 50_000) newPrice = 50_000;
      listing.currentPrice = newPrice;
      listing.haggleState = "accepted";
      if (window.Reputation) {
        window.Reputation.onForceSaleWithDefect({ reason: `Force-buy foldable defect ${def.type}` });
      }
      pushKey(listing, "player", "chat.player_nego_foldable", {
        defect: { k: labelKey }, price: fmt(newPrice),
      });
      showTyping();
      setTimeout(() => {
        hideTyping();
        pushKey(listing, "seller", "chat.seller_nego_foldable", { price: fmt(newPrice) });
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
          <span class="text-xs opacity-80">${fmt(s.bankBalances[b] || 0)}${enough ? "" : " " + t("chat.bank_insufficient_tag")}</span>
        </button>`;
    }).join("");
    actionsEl.innerHTML = buttons + `
      <button id="bank-cancel" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> ${t("chat.cancel")}
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
      pushKey(listing, "system", "chat.bank_insufficient", { bank: sourceBank });
      return;
    }

    pushKey(listing, "player", "chat.player_pay", { bank: sourceBank, price: fmt(price) });
    showTyping();

    setTimeout(() => {
      hideTyping();
      sendDealLine(listing);

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
        // UPDATE ("Foldable…"): if a hidden foldable bomb was NEVER inspected
        // (player paid by blind Transfer), bake it into the item anyway so
        // they discover the damage later at repair/sell time. A COD reveal
        // has already moved it into listing.defect and cleared the stash.
        defect: listing.foldableHiddenDefect || listing.defect,
        hiddenDefect: listing.foldableHiddenDefect
          ? listing.foldableHiddenDefect.type
          : (listing.hiddenDefect || null),
        buyPrice: price,
        buyDay: s.currentDay,
        paymentMethod: listing.paymentMethod || "Transfer",
        sourceBank,
        // Part 6: black-market provenance & IMEI status tracking.
        isExInter: !!listing.isExInter,
        imeiStatus: listing.isExInter ? "ok" : null,
        // Part 37 — Battery Health (Pear only; null for other brands).
        batteryHealth: (typeof listing.batteryHealth === "number") ? listing.batteryHealth : null,
        isBypassed: false,
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

      // Part 20 — Reputation: +2 for a clean COD (no hidden defect found
      // during inspection). The hidden-defect path already deducted -5
      // earlier so we only award the bonus when the deal stayed clean.
      if (window.Reputation && !listing.hiddenDefect) {
        window.Reputation.onCleanCOD({
          reason: `Clean COD: ${listing.brand || ""} ${listing.name || ""}`.trim(),
        });
      }

      pushKey(listing, "system", "chat.txn_success", {
        price: fmt(price), bank: sourceBank, method: listing.paymentMethod || "Transfer",
      });
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
          <i class="fa-solid fa-check-double"></i> ${t("chat.doneClose")}
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

  /* i18n (Part 36): re-render the currently-open chat in the active
   * language. Called by i18n.switchLanguage() so an open negotiation —
   * including its entire history — flips instantly. */
  function refreshOpen() {
    if (!overlayEl || overlayEl.classList.contains("hidden")) return;
    const listing = getListing();
    if (!listing) return;
    renderHeader(listing);
    messagesEl.innerHTML = "";
    (listing.chatLog || []).forEach((m) => renderBubble(m));
    renderActions(listing);
    scrollToBottom();
  }

  window.Chat = {
    openWithListing,
    closeChat,
    refreshOpen,
  };
})();
