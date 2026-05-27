/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 5 — Custom Selling Price & Inbound Buyer Negotiation
 * ========================================================= */

(function () {
  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  /* ---------- Buyer pool ---------- */
  const BUYER_NAMES = [
    "Reza Buyer", "Sari Penawar", "Tommy Kolektor", "Umi Pencari HP",
    "Vino Reseller", "Wira Trader", "Xena Pemula", "Yoga Counter",
    "Zaki Pembeli", "Aldi PROMO", "Bella Cuan", "Caca Murmer",
  ];
  const AVATAR_COLORS = [
    "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#a855f7",
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#ec4899",
  ];
  const LOCATIONS = ["Jakarta", "Bandung", "Surabaya", "Bekasi", "Tangerang", "Depok", "Yogyakarta", "Medan"];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uid(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 10); }

  function makeBuyer() {
    const name = pick(BUYER_NAMES);
    return {
      id: uid("buyer"),
      name,
      avatar: name[0].toUpperCase(),
      color: pick(AVATAR_COLORS),
      location: pick(LOCATIONS),
    };
  }

  /* ---------- RNG: offer chance based on price gap ---------- */
  function offerChance(askingPrice, suggestedPrice) {
    const ratio = askingPrice / suggestedPrice;
    if (ratio <= 1.00) return 0.85;
    if (ratio <= 1.10) return 0.65;
    if (ratio <= 1.20) return 0.35;
    if (ratio <= 1.40) return 0.15;
    return 0.05;
  }

  /* ---------- RNG: how much will buyer offer? ---------- */
  function generateBuyerOffer(askingPrice, suggestedPrice) {
    const ratio = askingPrice / suggestedPrice;
    let lo, hi; // % of asking price
    if (ratio <= 1.00)      { lo = 0.92; hi = 1.00; } // fair: near asking
    else if (ratio <= 1.10) { lo = 0.85; hi = 0.95; }
    else if (ratio <= 1.20) { lo = 0.75; hi = 0.88; }
    else if (ratio <= 1.40) { lo = 0.60; hi = 0.78; } // lowball
    else                    { lo = 0.45; hi = 0.65; } // heavy lowball
    const pct = lo + Math.random() * (hi - lo);
    const raw = askingPrice * pct;
    return Math.max(1, Math.round(raw / 50_000) * 50_000);
  }

  /* ---------- Counter response RNG ---------- */
  function rollCounterResponse(playerCounter, currentOffer) {
    if (playerCounter <= currentOffer) {
      return { outcome: "accept" }; // player went lower; trivial accept
    }
    const ratio = playerCounter / currentOffer;
    let acceptP, counterP;
    if (ratio <= 1.05)      { acceptP = 0.80; counterP = 0.15; }
    else if (ratio <= 1.15) { acceptP = 0.50; counterP = 0.35; }
    else if (ratio <= 1.30) { acceptP = 0.20; counterP = 0.40; }
    else                    { acceptP = 0.05; counterP = 0.25; }
    const r = Math.random();
    if (r < acceptP) return { outcome: "accept" };
    if (r < acceptP + counterP) {
      // Buyer counters back, leaning closer to their old offer.
      const split = 0.30 + Math.random() * 0.30; // 30-60% of the way
      const newOffer = Math.round((currentOffer + (playerCounter - currentOffer) * split) / 50_000) * 50_000;
      return { outcome: "counter", newOffer };
    }
    return { outcome: "leave" };
  }




  /* =========================================================
   * Listing lifecycle
   * ========================================================= */

  function ensureActiveListings() {
    const s = S();
    if (!Array.isArray(s.activeListings)) s.activeListings = [];
  }

  function listItem(inventoryItem, askingPrice) {
    const s = S();
    ensureActiveListings();

    const suggestedPrice = window.Market.computeCurrentMarketPrice(inventoryItem);
    const listing = {
      listingId: uid("act"),
      // snapshot the gadget data so resale UI works even if defect/state changes
      itemSnapshot: {
        gadgetId: inventoryItem.gadgetId,
        name: inventoryItem.name,
        brand: inventoryItem.brand,
        specs: inventoryItem.specs,
        completeness: inventoryItem.completeness,
        defect: inventoryItem.defect,
        hiddenDefect: inventoryItem.hiddenDefect || null,
        previousDefect: inventoryItem.previousDefect || null,
        accent: inventoryItem.accent,
        icon: inventoryItem.icon,
        buyPrice: inventoryItem.buyPrice,
        buyDay: inventoryItem.buyDay,
        // Part 6: provenance & IMEI status follow the item across listing/cancel cycles.
        isExInter: !!inventoryItem.isExInter,
        imeiStatus: inventoryItem.imeiStatus || null,
        imeiUnlock: inventoryItem.imeiUnlock || null,
        imeiBlockedOnDay: inventoryItem.imeiBlockedOnDay || null,
      },
      originalItemId: inventoryItem.id,
      askingPrice,
      suggestedPrice,
      listedDay: s.currentDay,
      daysListed: 0,
      currentOffer: null,    // set when a buyer makes an offer
      chatLog: [],           // shared chat log with buyer
      negotiationState: "waiting", // waiting | offer-pending | sold | cancelled
    };

    // Move item out of inventory (locked while listed).
    s.inventory = s.inventory.filter((it) => it.id !== inventoryItem.id);
    s.activeListings.push(listing);
    window.FlippingTycoon.saveGame();
    return listing;
  }

  function cancelListing(listing) {
    const s = S();
    ensureActiveListings();
    // Recreate the inventory item from the snapshot.
    s.inventory.push({
      id: listing.originalItemId,
      gadgetId: listing.itemSnapshot.gadgetId,
      name: listing.itemSnapshot.name,
      brand: listing.itemSnapshot.brand,
      specs: listing.itemSnapshot.specs,
      completeness: listing.itemSnapshot.completeness,
      defect: listing.itemSnapshot.defect,
      hiddenDefect: listing.itemSnapshot.hiddenDefect,
      previousDefect: listing.itemSnapshot.previousDefect,
      accent: listing.itemSnapshot.accent,
      icon: listing.itemSnapshot.icon,
      buyPrice: listing.itemSnapshot.buyPrice,
      buyDay: listing.itemSnapshot.buyDay,
      // Part 6: restore Ex-Inter / IMEI fields so block risk applies again.
      isExInter: !!listing.itemSnapshot.isExInter,
      imeiStatus: listing.itemSnapshot.imeiStatus || null,
      imeiUnlock: listing.itemSnapshot.imeiUnlock || null,
      imeiBlockedOnDay: listing.itemSnapshot.imeiBlockedOnDay || null,
    });
    s.activeListings = s.activeListings.filter((l) => l.listingId !== listing.listingId);
    window.FlippingTycoon.saveGame();
  }

  /* ---------- Next Day: roll for offers ---------- */
  function processNextDayOffers() {
    const s = S();
    ensureActiveListings();
    s.activeListings.forEach((listing) => {
      listing.daysListed = (listing.daysListed || 0) + 1;
      if (listing.currentOffer && listing.negotiationState === "offer-pending") {
        // There's already a pending offer; the buyer waits one more day before walking.
        listing.currentOffer.staleDays = (listing.currentOffer.staleDays || 0) + 1;
        return;
      }
      const chance = offerChance(listing.askingPrice, listing.suggestedPrice);
      if (Math.random() >= chance) return;

      const buyer = makeBuyer();
      const offered = generateBuyerOffer(listing.askingPrice, listing.suggestedPrice);
      const suspicious = (offered / listing.suggestedPrice) < 0.55;
      listing.currentOffer = {
        buyer,
        offeredPrice: offered,
        firstOfferPrice: offered,
        roundsAccepted: 0,
        staleDays: 0,
        opened: false,
        suspicious,
      };
      // Clear chat log for this fresh negotiation.
      listing.chatLog = [];
      const opener = `Halo gan, masih ada? Lepas Rp ${offered.toLocaleString("id-ID")} ya? 🙏`;
      listing.chatLog.push({ from: "buyer", text: opener, color: buyer.color, avatar: buyer.avatar });
      listing.negotiationState = "offer-pending";
      if (window.Notifications) {
        if (suspicious) {
          window.Notifications.add({
            type: "scam",
            title: "Warning: Suspicious Buyer Detected!",
            message: `${buyer.name} nawar ${listing.itemSnapshot.name} cuma ${fmt(offered)} (lowball brutal). Hati-hati PHP / scam offer.`,
            actionPage: "inventory",
            actor: buyer.name,
            icon: "user-secret",
          });
        } else {
          window.Notifications.add({
            type: "info",
            title: "New Offer Received",
            message: `${buyer.name} dari ${buyer.location} menawar ${listing.itemSnapshot.name} di ${fmt(offered)}.`,
            actionPage: "inventory",
            actor: buyer.name,
            icon: "comments-dollar",
          });
        }
      }
    });
    window.FlippingTycoon.saveGame();
  }

  /* Count of items needing player's attention. */
  function pendingOfferCount() {
    ensureActiveListings();
    return (S().activeListings || []).filter(
      (l) => l.negotiationState === "offer-pending"
    ).length;
  }


  /* =========================================================
   * UI: Active Listings tab (rendered inside Inventory page)
   * ========================================================= */
  function renderActiveListingsTab() {
    ensureActiveListings();
    const s = S();
    const wrap = document.createElement("div");
    const listings = s.activeListings || [];

    if (listings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl mb-3">
          <i class="fa-solid fa-tag"></i>
        </div>
        <h3>Belum ada listing aktif</h3>
        <p class="text-sm text-gray-500">Klik "List on Marketplace" pada tab Owned untuk mulai jualan.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    listings.forEach((listing) => wrap.appendChild(renderListingCard(listing)));
    return wrap;
  }




  function renderListingCard(listing) {
    const it = listing.itemSnapshot;
    const accent = it.accent || "#1c1c1e";
    const iconName = it.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    const card = document.createElement("div");
    card.className = "active-listing-card" + (it.isExInter ? " ex-inter" : "");

    const ratio = listing.askingPrice / listing.suggestedPrice;
    const priceClass = ratio <= 1.0 ? "fair" : ratio <= 1.2 ? "stretch" : "greedy";
    const priceLabel = ratio <= 1.0 ? "Fair price" : ratio <= 1.2 ? "Stretch" : "Greedy";

    // Walk-in eligibility hint when a storefront is rented (Part 6).
    const re = S().realEstate;
    const storeRented = !!(re && re.rented);
    const walkInEligible = storeRented && ratio <= 1.10;

    let statusBlock = "";
    if (listing.negotiationState === "offer-pending" && listing.currentOffer) {
      const o = listing.currentOffer;
      statusBlock = `
        <div class="al-offer-banner">
          <div class="al-offer-avatar" style="background:${o.buyer.color}">${o.buyer.avatar}</div>
          <div class="al-offer-text">
            <p class="font-semibold text-sm">${o.buyer.name} menawar</p>
            <p class="text-xs text-gray-500">${o.buyer.location} &middot; Listed Day ${listing.listedDay}</p>
          </div>
          <div class="text-right ml-auto">
            <p class="text-xs text-gray-500">Tawaran</p>
            <p class="font-bold text-emerald-700">${fmt(o.offeredPrice)}</p>
          </div>
        </div>
        <button class="al-open-chat-btn" data-id="${listing.listingId}">
          <i class="fa-brands fa-facebook-messenger"></i> Open Chat with Buyer
        </button>
      `;
    } else {
      statusBlock = `
        <div class="al-status-row">
          <i class="fa-solid fa-hourglass-half"></i>
          <span>Menunggu pembeli...</span>
          <span class="ml-auto text-xs text-gray-500">${listing.daysListed} hari listed</span>
        </div>
      `;
    }

    // Walk-in banner: tells the player this listing will be auto-bought next day.
    let walkInBanner = "";
    if (walkInEligible && listing.negotiationState !== "offer-pending") {
      walkInBanner = `
        <div class="al-walkin-banner">
          <i class="fa-solid fa-shop"></i>
          <span>Walk-in eligible: bakal disambar pelanggan toko di Next Day (asking ≤ 110% suggested).</span>
        </div>
      `;
    } else if (storeRented && ratio > 1.10 && listing.negotiationState !== "offer-pending") {
      walkInBanner = `
        <div class="al-walkin-banner not-eligible">
          <i class="fa-solid fa-shop-slash"></i>
          <span>Tidak walk-in eligible (asking ${Math.round((ratio - 1) * 100)}% di atas suggested).</span>
        </div>
      `;
    }

    // Snapshot-side IMEI/Ex-Inter badges
    const extraBadges = [];
    if (it.isExInter) extraBadges.push(`<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>`);
    if (it.imeiStatus === "blocked") extraBadges.push(`<span class="market-badge bg-red-200 text-red-800"><i class="fa-solid fa-signal-slash"></i> IMEI Terblokir</span>`);
    else if (it.imeiStatus === "unlocked") extraBadges.push(`<span class="market-badge bg-emerald-100 text-emerald-700"><i class="fa-solid fa-shield-halved"></i> IMEI Aman</span>`);

    card.innerHTML = `
      <div class="al-thumb">
        <i class="fa-solid fa-${iconName} text-5xl" style="color:${accent}"></i>
        <span class="al-thumb-tag">${it.brand || "—"}</span>
        <span class="al-price-tag al-price-${priceClass}">${priceLabel}</span>
        ${it.isExInter ? `<span class="ex-inter-tag small"><i class="fa-solid fa-skull-crossbones"></i> No Pajak</span>` : ""}
      </div>
      <div class="al-body">
        <p class="al-title">${it.name}</p>
        <p class="al-meta">${it.specs.ram}/${it.specs.rom} &middot; ${it.specs.color} &middot; ${it.defect.short}</p>
        ${extraBadges.length ? `<div class="inv-badges" style="margin-top:4px">${extraBadges.join("")}</div>` : ""}
        <div class="al-prices">
          <div><span>Asking</span><b>${fmt(listing.askingPrice)}</b></div>
          <div><span>Suggested</span><span>${fmt(listing.suggestedPrice)}</span></div>
        </div>
        ${walkInBanner}
        ${statusBlock}
        <div class="al-actions">
          <button class="al-cancel-btn" data-id="${listing.listingId}">
            <i class="fa-solid fa-xmark"></i> Cancel Listing
          </button>
        </div>
      </div>
    `;

    const openChatBtn = card.querySelector(".al-open-chat-btn");
    if (openChatBtn) openChatBtn.addEventListener("click", () => openBuyerChat(listing.listingId));
    card.querySelector(".al-cancel-btn").addEventListener("click", () => {
      if (confirm(`Cancel listing ${it.name}? Item akan kembali ke Inventory.`)) {
        cancelListing(listing);
        window.FlippingTycoon.renderActivePage();
      }
    });
    return card;
  }


  /* =========================================================
   * UI: List item modal (custom asking price)
   * ========================================================= */
  function openListModal(item) {
    const modal = document.querySelector("#list-modal");
    const body = modal.querySelector("#list-body");
    const closeBtn = modal.querySelector("#list-cancel");
    const submitBtn = modal.querySelector("#list-submit");

    const suggested = window.Market.computeCurrentMarketPrice(item);
    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold">${item.name} &middot; ${item.specs.ram}/${item.specs.rom}</p>
        <p class="text-xs text-gray-500 mt-2">Suggested Market Price (hari ini)</p>
        <p class="text-xl font-bold">${fmt(suggested)}</p>
        <p class="text-[11px] text-gray-500 mt-1">Asking sama atau di bawah suggested → cepat laku. Terlalu mahal → lowball atau tidak ada penawaran.</p>
      </div>
      <label class="modal-label">Custom Asking Price (IDR)
        <input id="list-price" type="number" min="50000" step="50000" placeholder="${suggested}" value="${suggested}" class="modal-input" />
      </label>
      <div class="list-quickset">
        <button data-pct="0.95" type="button"><span>-5%</span><span>${fmt(Math.round(suggested * 0.95 / 50_000) * 50_000)}</span></button>
        <button data-pct="1.00" type="button"><span>Fair</span><span>${fmt(suggested)}</span></button>
        <button data-pct="1.10" type="button"><span>+10%</span><span>${fmt(Math.round(suggested * 1.10 / 50_000) * 50_000)}</span></button>
        <button data-pct="1.20" type="button"><span>+20%</span><span>${fmt(Math.round(suggested * 1.20 / 50_000) * 50_000)}</span></button>
      </div>
      <p id="list-error" class="text-xs text-rose-600 font-semibold"></p>
    `;

    const priceInput = body.querySelector("#list-price");
    body.querySelectorAll(".list-quickset button").forEach((b) => {
      b.addEventListener("click", () => {
        const pct = parseFloat(b.dataset.pct);
        priceInput.value = Math.round(suggested * pct / 50_000) * 50_000;
      });
    });

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const close = () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    };
    closeBtn.onclick = close;
    submitBtn.onclick = () => {
      const errEl = body.querySelector("#list-error");
      const ask = Math.floor(Number(priceInput.value) || 0);
      if (!ask || ask < 50_000) {
        errEl.textContent = "Asking price minimal Rp 50.000.";
        return;
      }
      listItem(item, Math.round(ask / 50_000) * 50_000);
      close();
      window.FlippingTycoon.renderActivePage();
    };
  }




  /* =========================================================
   * Reverse Messenger Chat with Buyer
   * ========================================================= */
  let currentListingId = null;

  function openBuyerChat(listingId) {
    const listing = (S().activeListings || []).find((l) => l.listingId === listingId);
    if (!listing || !listing.currentOffer) return;

    currentListingId = listingId;
    listing.currentOffer.opened = true;
    window.FlippingTycoon.saveGame();

    const overlay = document.querySelector("#chat-overlay");
    const headerEl = document.querySelector("#chat-header");
    const messagesEl = document.querySelector("#chat-messages");
    const actionsEl = document.querySelector("#chat-actions");

    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    messagesEl.innerHTML = "";
    actionsEl.innerHTML = "";

    const o = listing.currentOffer;
    headerEl.innerHTML = `
      <button id="buyer-chat-close" class="chat-icon-btn" title="Close">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="chat-header-avatar" style="background:${o.buyer.color}">${o.buyer.avatar}</div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${o.buyer.name}</p>
        <p class="text-xs text-emerald-500">
          <i class="fa-solid fa-circle text-[7px]"></i> Active now &middot; ${o.buyer.location}
        </p>
      </div>
      <button class="chat-icon-btn"><i class="fa-solid fa-phone"></i></button>
      <button class="chat-icon-btn"><i class="fa-solid fa-video"></i></button>
      <button class="chat-icon-btn"><i class="fa-solid fa-circle-info"></i></button>
    `;
    headerEl.querySelector("#buyer-chat-close").addEventListener("click", closeBuyerChat);

    listing.chatLog.forEach((msg) => renderBubble(msg));
    renderBuyerActions(listing);
    scrollToBottom();
  }

  function closeBuyerChat() {
    const overlay = document.querySelector("#chat-overlay");
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    currentListingId = null;
  }

  function renderBubble(message) {
    const messagesEl = document.querySelector("#chat-messages");
    const div = document.createElement("div");
    if (message.from === "system") {
      div.className = "chat-row from-system";
      div.innerHTML = `<div class="chat-system">${escapeHtml(message.text)}</div>`;
    } else {
      // buyer = left side (uses .from-seller styling), player = right side
      const isBuyer = message.from === "buyer";
      div.className = "chat-row " + (isBuyer ? "from-seller" : "from-player");
      const avatar = isBuyer
        ? `<div class="chat-bubble-avatar" style="background:${message.color || "#999"}">${message.avatar || "B"}</div>`
        : "";
      const bubble = `<div class="chat-bubble">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>`;
      div.innerHTML = avatar + bubble;
    }
    messagesEl.appendChild(div);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function pushMessage(listing, from, text) {
    const msg = { from, text };
    if (from === "buyer" && listing.currentOffer) {
      msg.color = listing.currentOffer.buyer.color;
      msg.avatar = listing.currentOffer.buyer.avatar;
    }
    listing.chatLog.push(msg);
    renderBubble(msg);
    scrollToBottom();
    window.FlippingTycoon.saveGame();
  }

  function scrollToBottom() {
    const el = document.querySelector("#chat-messages");
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  function showTyping() {
    const messagesEl = document.querySelector("#chat-messages");
    const div = document.createElement("div");
    div.id = "chat-typing";
    div.className = "chat-row from-seller";
    div.innerHTML = `
      <div class="chat-bubble-avatar" style="background:#999">…</div>
      <div class="chat-bubble typing"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }
  function hideTyping() {
    const t = document.getElementById("chat-typing");
    if (t) t.remove();
  }




  /* =========================================================
   * Buyer chat actions (Accept / Counter / Reject)
   * ========================================================= */
  function renderBuyerActions(listing) {
    const actionsEl = document.querySelector("#chat-actions");
    const o = listing.currentOffer;
    if (!o) {
      actionsEl.innerHTML = `
        <button id="buyer-close-btn" class="chat-action accept w-full">
          <i class="fa-solid fa-check-double"></i> Close
        </button>`;
      actionsEl.querySelector("#buyer-close-btn").addEventListener("click", closeBuyerChat);
      return;
    }
    actionsEl.innerHTML = `
      <button id="buyer-accept" class="chat-action accept">
        <i class="fa-solid fa-check"></i>
        Accept ${fmt(o.offeredPrice)}
      </button>
      <button id="buyer-counter" class="chat-action haggle">
        <i class="fa-solid fa-hand-holding-dollar"></i>
        Counter Offer
        <span class="text-xs opacity-80">Tawar harga lain</span>
      </button>
      <button id="buyer-reject" class="chat-action leave">
        <i class="fa-solid fa-xmark"></i> Reject &amp; Leave
      </button>
    `;
    actionsEl.querySelector("#buyer-accept").addEventListener("click", () => onAcceptOffer(listing));
    actionsEl.querySelector("#buyer-counter").addEventListener("click", () => onCounterOffer(listing));
    actionsEl.querySelector("#buyer-reject").addEventListener("click", () => onRejectOffer(listing));
  }

  /* ---------- Accept Offer → bank picker ---------- */
  function onAcceptOffer(listing) {
    const price = listing.currentOffer.offeredPrice;
    const actionsEl = document.querySelector("#chat-actions");
    pushMessage(listing, "player", `Sip, deal ya gan! ${fmt(price)} 🤝`);

    showTyping();
    setTimeout(() => {
      hideTyping();
      pushMessage(listing, "buyer", `Mantap! Saya transfer sekarang. Mau diterima ke rekening apa?`);
      // Render bank-pick row
      const banks = ["Mandiri", "BCA", "BNI"];
      const baseFee = window.Inventory.platformFeeRate
        ? window.Inventory.platformFeeRate()
        : (window.Repair && window.Repair.platformFeeRate ? window.Repair.platformFeeRate() : 0.05);
      const buttons = banks.map((b) => {
        const tier = window.Banking.tierOf(S().bankBalances[b] || 0);
        const isPriority = tier === "priority";
        const feeRate = isPriority ? 0 : baseFee;
        const fee = Math.round(price * feeRate);
        const net = price - fee;
        return `
          <button class="chat-action bank-pick bank-pick-${b.toLowerCase()}" data-bank="${b}">
            <i class="fa-solid fa-building-columns"></i> ${b}
            <span class="text-xs opacity-80">${isPriority ? "Priority -0% fee" : "+" + fmt(net)}</span>
          </button>`;
      }).join("");
      actionsEl.innerHTML = buttons;
      actionsEl.querySelectorAll(".bank-pick").forEach((btn) => {
        btn.addEventListener("click", () => completeSale(listing, btn.dataset.bank));
      });
    }, 600);
  }

  function completeSale(listing, receivingBank) {
    const s = S();
    const price = listing.currentOffer.offeredPrice;
    const tier = window.Banking.tierOf(s.bankBalances[receivingBank] || 0);
    const isPriority = tier === "priority";
    const baseFee = window.Inventory.platformFeeRate
      ? window.Inventory.platformFeeRate()
      : 0.05;
    const feeRate = isPriority ? 0 : baseFee;
    const fee = Math.round(price * feeRate);
    const net = price - fee;
    const buyerName = listing.currentOffer.buyer.name;
    const itemName = listing.itemSnapshot.name;

    s.bankBalances[receivingBank] += net;
    s.bankHistories[receivingBank].push({
      type: "CREDIT",
      amount: net,
      balanceAfter: s.bankBalances[receivingBank],
      description: `Sale of ${itemName} to ${buyerName}` + (isPriority ? " (Priority - 0% fee)" : ` (after ${(baseFee*100).toFixed(0)}% platform fee${s.upgrades && s.upgrades.fbPaidAds ? " via FB Ads" : ""})`),
      category: "sale",
      day: s.currentDay,
      ts: Date.now(),
    });

    s.activeListings = s.activeListings.filter((l) => l.listingId !== listing.listingId);
    listing.negotiationState = "sold";
    window.FlippingTycoon.saveGame();

    pushMessage(listing, "system", `✅ Terjual ke ${buyerName}! +${fmt(net)} masuk ke ${receivingBank}.`);
    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "Sold!",
        message: `${itemName} terjual ke ${buyerName} di ${fmt(price)}. +${fmt(net)} masuk ${receivingBank}.`,
        actionPage: "banking",
        actor: "Marketplace",
        icon: "sack-dollar",
      });
    }
    const actionsEl = document.querySelector("#chat-actions");
    actionsEl.innerHTML = `
      <button id="buyer-done" class="chat-action accept w-full">
        <i class="fa-solid fa-check-double"></i> Close & Refresh
      </button>`;
    actionsEl.querySelector("#buyer-done").addEventListener("click", () => {
      closeBuyerChat();
      window.FlippingTycoon.renderActivePage();
    });
  }

  /* ---------- Counter Offer flow ---------- */
  function onCounterOffer(listing) {
    const modal = document.querySelector("#counter-modal");
    const body = modal.querySelector("#counter-body");
    const closeBtn = modal.querySelector("#counter-cancel");
    const submitBtn = modal.querySelector("#counter-submit");
    const o = listing.currentOffer;

    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Tawaran pembeli saat ini</p>
        <p class="text-xl font-bold">${fmt(o.offeredPrice)}</p>
        <p class="text-xs text-gray-500 mt-2">Asking price kamu</p>
        <p class="font-semibold">${fmt(listing.askingPrice)}</p>
      </div>
      <label class="modal-label">Counter Offer (IDR)
        <input id="counter-price" type="number" min="50000" step="50000" placeholder="${listing.askingPrice}" value="${listing.askingPrice}" class="modal-input" />
      </label>
      <p class="text-xs text-gray-500 mt-1">Tip: terlalu jauh dari tawaran pembeli akan bikin mereka kabur 😅</p>
      <p id="counter-error" class="text-xs text-rose-600 font-semibold"></p>
    `;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const close = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    closeBtn.onclick = close;
    submitBtn.onclick = () => {
      const err = body.querySelector("#counter-error");
      const newPrice = Math.floor(Number(body.querySelector("#counter-price").value) || 0);
      if (!newPrice || newPrice < 50_000) { err.textContent = "Counter minimal Rp 50.000."; return; }
      close();
      doCounter(listing, Math.round(newPrice / 50_000) * 50_000);
    };
  }




  function doCounter(listing, newPrice) {
    const o = listing.currentOffer;
    pushMessage(listing, "player", `Saya counter ${fmt(newPrice)} ya gan, fair lah ya 😉`);
    showTyping();

    setTimeout(() => {
      hideTyping();
      const result = rollCounterResponse(newPrice, o.offeredPrice);
      if (result.outcome === "accept") {
        o.offeredPrice = newPrice;
        o.roundsAccepted = (o.roundsAccepted || 0) + 1;
        pushMessage(listing, "buyer", `Wah oke deh, ${fmt(newPrice)} saya ambil! Deal 🤝`);
        window.FlippingTycoon.saveGame();
        renderBuyerActions(listing);
      } else if (result.outcome === "counter") {
        o.offeredPrice = result.newOffer;
        pushMessage(listing, "buyer", `Hmm ${fmt(newPrice)} masih ketinggian. Saya naikin dikit jadi ${fmt(result.newOffer)}, gimana?`);
        window.FlippingTycoon.saveGame();
        renderBuyerActions(listing);
      } else {
        // leave
        pushMessage(listing, "buyer", `Aduh ketinggian banget. Saya cabut dulu deh, kalau berubah pikiran chat aja 👋`);
        listing.currentOffer = null;
        listing.negotiationState = "waiting";
        listing.chatLog.push({ from: "system", text: "Pembeli pergi. Listing kembali menunggu pembeli baru." });
        renderBubble(listing.chatLog[listing.chatLog.length - 1]);
        window.FlippingTycoon.saveGame();
        const actionsEl = document.querySelector("#chat-actions");
        actionsEl.innerHTML = `
          <button id="buyer-done" class="chat-action accept w-full">
            <i class="fa-solid fa-arrow-left"></i> Close
          </button>`;
        actionsEl.querySelector("#buyer-done").addEventListener("click", () => {
          closeBuyerChat();
          window.FlippingTycoon.renderActivePage();
        });
      }
    }, 900);
  }

  /* ---------- Reject & Leave ---------- */
  function onRejectOffer(listing) {
    pushMessage(listing, "player", `Maaf gan, harga segitu kurang cocok buat saya. Cari yang lain aja yah 🙏`);
    showTyping();
    setTimeout(() => {
      hideTyping();
      pushMessage(listing, "buyer", `Yah sayang ya. Oke deh, saya cari yang lain. 👋`);
      listing.currentOffer = null;
      listing.negotiationState = "waiting";
      pushMessage(listing, "system", `Listing tetap aktif, menunggu pembeli baru.`);
      window.FlippingTycoon.saveGame();
      const actionsEl = document.querySelector("#chat-actions");
      actionsEl.innerHTML = `
        <button id="buyer-done" class="chat-action accept w-full">
          <i class="fa-solid fa-arrow-left"></i> Close
        </button>`;
      actionsEl.querySelector("#buyer-done").addEventListener("click", () => {
        closeBuyerChat();
        window.FlippingTycoon.renderActivePage();
      });
    }, 700);
  }


  /* ---------- Public API ---------- */
  window.Selling = {
    openListModal,
    cancelListing,
    listItem,
    processNextDayOffers,
    renderActiveListingsTab,
    pendingOfferCount,
    openBuyerChat,
  };
})();
