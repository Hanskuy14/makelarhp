/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 19 — FJB (Forum Jual Beli) Group Feed
 *
 * A scrolling Facebook-Group-style feed where AI users post
 * two kinds of deals every Next Day:
 *
 *   - BU (Butuh Uang)  : A unit priced 30%-40% BELOW market.
 *                        Player must hit "PM" fast or another AI
 *                        will snipe it ("Sold to me gan, makasih").
 *
 *   - WTB (Want To Buy): An AI looking for a specific gadget.
 *                        If the player has the EXACT model in
 *                        Inventory, a "Tawarkan" button appears
 *                        for instant sale at the AI's budget.
 *
 * State stored on:
 *   data.fjb     = { posts: [...], lastGenDay: number }
 *   data.fjbView = { tab: "feed" }
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 10); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }


  /* ---------- AI persona pools ---------- */
  const FIRST_NAMES = [
    "Andre", "Budi", "Citra", "Dimas", "Eka", "Farah", "Galih", "Hendra",
    "Indra", "Joko", "Kevin", "Lina", "Maya", "Nanda", "Oka", "Putri",
    "Rizky", "Sari", "Tono", "Vina", "Wahyu", "Yusuf", "Zahra",
  ];
  const LAST_INITIALS = ["A.", "B.", "S.", "P.", "K.", "W.", "M.", "R.", "F.", "T."];
  const CITIES = [
    "Jakarta", "Bandung", "Surabaya", "Bekasi", "Tangerang", "Depok",
    "Yogyakarta", "Semarang", "Medan", "Makassar", "Bali", "Bogor",
  ];
  const AVATAR_COLORS = [
    "#ef4444", "#f59e0b", "#10b981", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  ];

  function makeAuthor() {
    const name = pick(FIRST_NAMES) + " " + pick(LAST_INITIALS);
    return {
      name,
      avatar: name.charAt(0).toUpperCase(),
      color: pick(AVATAR_COLORS),
      city: pick(CITIES),
    };
  }

  /* ---------- BU post copywriting ---------- */
  const BU_OPENERS = [
    "BU bro/sis, butuh duit cepet buat bayar kontrakan 😭",
    "BU sis, dananya buat biaya rumah sakit. Tolong yang serius aja",
    "BU gan, buat tutup utang kartu kredit. Murah deh!",
    "BU banget, jual cepat HP kesayangan. Kondisi mulus",
    "JUAL CEPAT BU — duitnya buat modal usaha mendadak",
    "BU urgent, dijual cepet karena mau pulang kampung 🙏",
  ];
  const BU_CLOSERS = [
    "Yg minat PM langsung yaa, no afgan no PHP 🙏",
    "Pertama PM, pertama dapet. COD/transfer aja ya",
    "Cepetan ya, banyak yg minat soalnya",
    "Serius minat langsung gas, harga net gak nego banyak",
    "Yg cepet yg dapet, no nego sadis ya 😅",
  ];

  /* ---------- WTB post copywriting ---------- */
  const WTB_OPENERS = [
    "WTB", "Cari", "Hunting", "WTB urgent", "Cari santai",
  ];
  const WTB_CLOSERS = [
    "COD area Jaksel aja. Yg deket monggo PM 🙏",
    "Bisa COD/transfer, tergantung lokasi. PM aja yaa",
    "Yg punya stock, langsung PM saya ya",
    "Buat hadiah istri, butuh cepet. PM dengan foto unit ya",
    "Serius mau beli, no PHP. PM langsung",
  ];


  /* ---------- State init ---------- */
  function ensureState() {
    const s = S();
    if (!s.fjb) {
      s.fjb = { posts: [], lastGenDay: -1 };
    }
    if (!Array.isArray(s.fjb.posts)) s.fjb.posts = [];
    if (typeof s.fjb.lastGenDay !== "number") s.fjb.lastGenDay = -1;
    if (!s.fjbView) s.fjbView = { tab: "feed" };
  }

  /* =========================================================
   * Post generation
   * ========================================================= */

  /** Generate one BU post for a randomly-picked gadget. */
  function generateBUPost() {
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    const COMP = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
    const DEF  = (window.GadgetData && window.GadgetData.DEFECT_OPTIONS) || [];
    if (GD.length === 0) return null;

    const gadget = pick(GD);
    // BU stock leans Mulus / light defect — these are good deals, not scams.
    const completeness = pick(COMP) || { type: "Fullset", short: "Fullset", multiplier: 1.0 };
    const defectPool = DEF.filter((d) => (d.severity || 0) <= 1);
    const defect = (defectPool.length > 0 ? pick(defectPool) : DEF[0]) ||
                   { type: "Mulus / No Minus", short: "Mulus", multiplier: 1.0, severity: 0, haggleAcceptRate: 0.10 };

    // Compute "fair" market price for the unit, then price it 30%-40% under.
    const fairPrice = window.Market
      ? window.Market.computeCurrentMarketPrice({
          gadgetId: gadget.id,
          basePrice: gadget.basePrice,
          completeness, defect,
          imeiStatus: null,
        })
      : (gadget.basePrice * (completeness.multiplier || 1) * (defect.multiplier || 1));

    if (!fairPrice || fairPrice <= 0) return null;
    const discountPct = 0.30 + Math.random() * 0.10;        // 30%-40% off
    const askingPrice = Math.max(50_000,
      Math.round((fairPrice * (1 - discountPct)) / 50_000) * 50_000);

    const author = makeAuthor();
    const text =
      `${pick(BU_OPENERS)}\n\n` +
      `Dijual ${gadget.brand} ${gadget.model} ${gadget.specs.ram}/${gadget.specs.rom} ${gadget.specs.color}.\n` +
      `Kondisi: ${defect.type} • Kelengkapan: ${completeness.type}.\n\n` +
      `💰 Harga BU: ${fmt(askingPrice)}  (Pasaran ${fmt(fairPrice)})\n\n` +
      pick(BU_CLOSERS);

    return {
      id: uid("bu"),
      kind: "BU",
      author,
      postedDay: S().currentDay,
      postedTimestamp: Date.now(),
      gadgetId: gadget.id,
      gadgetName: gadget.brand + " " + gadget.model,
      brand: gadget.brand,
      icon: gadget.icon,
      accent: gadget.accent,
      specs: { ...gadget.specs },
      completeness: { ...completeness },
      defect: { ...defect },
      basePrice: gadget.basePrice,
      fairPrice,
      askingPrice,
      discountPct,
      text,
      // Sniper deadline: 60-180 seconds of real time. After this another
      // AI auto-wins the post unless the player clicks PM first.
      sniperDeadlineMs: Date.now() + (60 + Math.floor(Math.random() * 120)) * 1000,
      status: "open",         // open | sniped | reserved
      reservedListingId: null,
      comments: [],
    };
  }


  /** Generate one WTB post for a randomly-picked gadget. */
  function generateWTBPost() {
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    if (GD.length === 0) return null;
    const gadget = pick(GD);

    // Buyer's stated budget: 105%-115% of basePrice (slightly above market
    // so the player is incentivized to sell instantly rather than list).
    const budgetMultiplier = 1.05 + Math.random() * 0.10;
    const budget = Math.max(50_000,
      Math.round((gadget.basePrice * budgetMultiplier) / 50_000) * 50_000);

    const author = makeAuthor();
    const text =
      `${pick(WTB_OPENERS)} ${gadget.brand} ${gadget.model} ${gadget.specs.ram}/${gadget.specs.rom}.\n` +
      `Budget ${fmt(budget)} (nego tipis OK).\n\n` +
      pick(WTB_CLOSERS);

    return {
      id: uid("wtb"),
      kind: "WTB",
      author,
      postedDay: S().currentDay,
      postedTimestamp: Date.now(),
      gadgetId: gadget.id,
      gadgetName: gadget.brand + " " + gadget.model,
      brand: gadget.brand,
      icon: gadget.icon,
      accent: gadget.accent,
      specs: { ...gadget.specs },
      budget,
      text,
      // WTB posts live for 2-3 in-game days
      expiresOnDay: S().currentDay + randInt(2, 3),
      status: "open",         // open | fulfilled | expired
      comments: [],
    };
  }

  /* =========================================================
   * Sweeping (snipe BU, expire WTB) and daily generation
   * ========================================================= */

  /** Mark a BU as sniped + push the canonical "Sold to me gan" comment. */
  function snipePost(post) {
    if (post.status !== "open") return;
    post.status = "sniped";
    const sniper = makeAuthor();
    const lines = [
      "Sold to me gan, makasih 🙏",
      "Udah saya bungkus ya bro, makasih banyak 🤝",
      "Pertama saya ya gan, lagi otw COD",
      "Mantap deal sama saya. Thanks bro!",
    ];
    post.comments.push({
      author: sniper,
      text: pick(lines),
      timestamp: Date.now(),
    });
  }

  /** Real-time sniper sweep — call on every render. */
  function snipeSweep() {
    const s = S();
    const now = Date.now();
    s.fjb.posts.forEach((p) => {
      if (p.kind === "BU" && p.status === "open" && now >= p.sniperDeadlineMs) {
        snipePost(p);
      }
    });
  }


  /** Hook from advanceToNextDay: snipe stale BUs, expire stale WTBs,
   *  then generate fresh posts for the new day. */
  function advanceDay() {
    ensureState();
    const s = S();

    // 1. Auto-snipe any open BU older than today (the day rolled, so the
    //    deal is ancient — definitely sniped by another AI).
    s.fjb.posts.forEach((p) => {
      if (p.kind === "BU" && p.status === "open") snipePost(p);
    });

    // 2. Expire stale WTBs
    s.fjb.posts.forEach((p) => {
      if (p.kind === "WTB" && p.status === "open" && s.currentDay > p.expiresOnDay) {
        p.status = "expired";
      }
    });

    // 3. Trim history to the most recent 30 posts so save data doesn't bloat
    s.fjb.posts.sort((a, b) => b.postedTimestamp - a.postedTimestamp);
    if (s.fjb.posts.length > 30) s.fjb.posts.length = 30;

    // 4. Generate 2-3 BU posts and 1-2 WTB posts for the new day.
    //    Part 20 — Reputation: Suhu sellers get +1 extra BU spawn (priority).
    const fresh = [];
    const repBonus = (window.Reputation && window.Reputation.getFjbBuPriority)
      ? Number(window.Reputation.getFjbBuPriority()) || 0
      : 0;
    const buCount  = randInt(2, 3) + repBonus;
    const wtbCount = randInt(1, 2);
    for (let i = 0; i < buCount; i++) {
      const post = generateBUPost();
      if (post) fresh.push(post);
    }
    for (let i = 0; i < wtbCount; i++) {
      const post = generateWTBPost();
      if (post) fresh.push(post);
    }
    // Shuffle so BU and WTB are interleaved in the feed
    shuffle(fresh).forEach((p) => s.fjb.posts.unshift(p));
    s.fjb.lastGenDay = s.currentDay;
    window.FlippingTycoon.saveGame();
  }

  /* Lazy first-day generation: if the player visits FJB before any
   * Next Day has happened, give them at least one batch to interact with. */
  function ensureFirstBatch() {
    const s = S();
    if (s.fjb.lastGenDay < 0 || s.fjb.posts.length === 0) {
      advanceDay();
    }
  }


  /* =========================================================
   * BU action: open chat with the seller
   * ========================================================= */

  /** Convert a BU post into a Market-listing object that chat.js can drive. */
  function buildBUListing(post) {
    const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
    const gadget = GD.find((g) => g.id === post.gadgetId);
    if (!gadget) return null;

    return {
      listingId: "fjb-" + post.id,
      gadgetId: gadget.id,
      name: gadget.model,
      brand: gadget.brand,
      specs: { ...gadget.specs },
      basePrice: gadget.basePrice,
      year: gadget.year,
      icon: gadget.icon,
      accent: gadget.accent,
      completeness: { ...post.completeness },
      defect: { ...post.defect },
      isExInter: false,
      finalPrice: post.askingPrice,
      seller: {
        name: post.author.name,
        avatar: post.author.avatar,
        color: post.author.color,
        location: post.author.city,
      },
      description:
        `Posting BU dari ${post.author.name} (Grup FJB).\n` +
        `Harga: ${fmt(post.askingPrice)} (di bawah pasaran ~${Math.round(post.discountPct * 100)}%).\n` +
        `Yg minat langsung gas, no PHP 🙏`,
      haggleState: null,
      currentPrice: post.askingPrice,
      // Tag so we can match on close/render
      sourcePostId: post.id,
      source: "fjb-bu",
    };
  }

  /** Player clicked PM on a BU post — open Messenger chat with the seller. */
  function openBUChat(postId) {
    ensureState();
    const s = S();
    const post = s.fjb.posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.status !== "open") {
      showToast("Postingan ini sudah tidak available.");
      return;
    }
    const listing = buildBUListing(post);
    if (!listing) { showToast("Stok tidak ditemukan di database."); return; }

    // Inject into dailyListings so chat.js can find it via getListing()
    if (!Array.isArray(s.dailyListings)) s.dailyListings = [];
    if (!s.dailyListings.some((l) => l.listingId === listing.listingId)) {
      s.dailyListings.push(listing);
    }
    post.status = "reserved";
    post.reservedListingId = listing.listingId;
    window.FlippingTycoon.saveGame();

    if (window.Chat && window.Chat.openWithListing) {
      window.Chat.openWithListing(listing.listingId);
    } else {
      showToast("Chat module belum siap.");
    }
  }


  /* =========================================================
   * WTB action: instant sale to AI buyer
   * ========================================================= */

  /** Returns the first inventory item matching the WTB post's gadgetId
   *  AND in good condition (Mulus / no IMEI block / not in repair). */
  function findOwnedItemForWTB(post) {
    const s = S();
    const inv = (s.inventory || []).filter((it) =>
      it.gadgetId === post.gadgetId &&
      (!it.repair || !it.repair.completesOnDay) &&
      !it.imeiUnlock &&
      it.imeiStatus !== "blocked"
    );
    // Prefer Mulus units for instant sale
    inv.sort((a, b) => (a.defect?.severity || 0) - (b.defect?.severity || 0));
    return inv[0] || null;
  }

  function openWTBOffer(postId) {
    ensureState();
    const s = S();
    const post = s.fjb.posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.status !== "open") { showToast("Postingan ini sudah tidak available."); return; }

    const item = findOwnedItemForWTB(post);
    if (!item) { showToast("Kamu gak punya unit yg dia cari."); return; }

    const modal = document.querySelector("#fjb-offer-modal");
    if (!modal) { showToast("Modal belum tersedia."); return; }
    const titleEl = modal.querySelector("#fjb-offer-title");
    const body    = modal.querySelector("#fjb-offer-body");
    const cancelBtn = modal.querySelector("#fjb-offer-cancel");

    titleEl.textContent = `Tawarkan ke ${post.author.name}`;
    const banks = ["Mandiri", "BCA", "BNI"];

    body.innerHTML = `
      <div class="mb-3">
        <p class="text-sm text-gray-600">Item: <b>${item.brand} ${item.name}</b> (${item.specs.ram}/${item.specs.rom} ${item.specs.color})</p>
        <p class="text-sm text-gray-600">Modal beli kamu: <b>${fmt(item.buyPrice || 0)}</b></p>
        <p class="text-sm text-gray-600">Budget pembeli: <b class="text-emerald-700">${fmt(post.budget)}</b></p>
        <p class="text-xs ${(post.budget - (item.buyPrice || 0)) > 0 ? "text-emerald-600" : "text-rose-600"} mt-1">
          Estimasi profit: ${fmt(post.budget - (item.buyPrice || 0))}
        </p>
      </div>
      <p class="modal-label" style="margin-bottom:4px">Terima pembayaran ke rekening:</p>
      <div class="partnership-bank-options">
        ${banks.map((b) => `
          <button class="partnership-bank-opt" data-bank="${b}">
            <div class="partnership-bank-opt-left">
              <span class="partnership-bank-logo">${b.charAt(0)}</span>
              <div>
                <p class="font-semibold text-sm">${b}</p>
                <p class="text-xs text-gray-500">Saldo: ${fmt(s.bankBalances[b] || 0)}</p>
              </div>
            </div>
            <span class="text-xs text-emerald-600">+ ${fmt(post.budget)}</span>
          </button>`).join("")}
      </div>
    `;

    body.querySelectorAll(".partnership-bank-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (completeWTBSale(post, item, btn.dataset.bank)) {
          closeOfferModal();
          window.FlippingTycoon.renderActivePage();
        }
      });
    });
    cancelBtn.onclick = closeOfferModal;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeOfferModal() {
    const modal = document.querySelector("#fjb-offer-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }


  /** Execute the WTB sale: remove from inventory, credit bank, log analytics. */
  function completeWTBSale(post, item, bankKey) {
    const s = S();
    const price = post.budget;

    // Remove the item from inventory
    const idx = s.inventory.findIndex((it) => it.id === item.id);
    if (idx === -1) { showToast("Item tidak ditemukan di Inventory."); return false; }
    s.inventory.splice(idx, 1);

    // Credit player's chosen bank (no transfer fee — direct sale)
    s.bankBalances[bankKey] = (s.bankBalances[bankKey] || 0) + price;
    if (!Array.isArray(s.bankHistories[bankKey])) s.bankHistories[bankKey] = [];
    s.bankHistories[bankKey].push({
      type: "CREDIT",
      amount: price,
      balanceAfter: s.bankBalances[bankKey],
      description: `WTB sale (Grup FJB): ${post.gadgetName} ke ${post.author.name}`,
      category: "fjb-wtb-sale",
      day: s.currentDay,
      ts: Date.now(),
    });

    // Mark the post fulfilled with a thank-you comment
    post.status = "fulfilled";
    post.comments.push({
      author: post.author,
      text: `Mantap bro! Udah deal sama ${(s.profile && s.profile.name) || "sis"}, makasih banyak 🙏`,
      timestamp: Date.now(),
    });

    // Record in analytics (Part 9)
    if (window.Analytics && window.Analytics.recordSale) {
      window.Analytics.recordSale({
        saleType: "fjb-wtb",
        gadget: {
          gadgetId: item.gadgetId,
          name: item.name,
          brand: item.brand,
          specs: item.specs,
          completeness: item.completeness,
          defect: item.defect,
          isExInter: !!item.isExInter,
          accent: item.accent,
          icon: item.icon,
        },
        purchaseCost: item.buyPrice || 0,
        repairCost: item.totalRepairCost || 0,
        salePrice: price,
        feePaid: 0,
        buyer: { name: post.author.name, avatar: post.author.avatar, color: post.author.color },
        receivingBank: bankKey,
      });
    }

    if (window.Notifications) {
      window.Notifications.add({
        type: "success",
        title: "WTB Deal Closed",
        message: `${item.brand} ${item.name} terjual ke ${post.author.name} (Grup FJB) seharga ${fmt(price)} masuk ${bankKey}.`,
        actionPage: "fjb",
        actor: "Grup FJB",
        icon: "handshake",
      });
    }
    // Part 43 — Reputation: +3 for completing a chat-driven sale via
    // FJB WTB (player initiated the deal by clicking "Tawarkan").
    if (window.Reputation && window.Reputation.onMarketplaceSale) {
      window.Reputation.onMarketplaceSale({
        reason: `FJB WTB sale: ${item.brand} ${item.name} ke ${post.author.name}`,
      });
    }
    showToast(`✅ ${item.brand} ${item.name} terjual — ${fmt(price)} masuk ${bankKey}.`);
    window.FlippingTycoon.saveGame();
    return true;
  }


  /* =========================================================
   * Page renderer
   * ========================================================= */

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60)   return sec + "s ago";
    const min = Math.floor(sec / 60);
    if (min < 60)   return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr  < 24)   return hr + "h ago";
    const d  = Math.floor(hr / 24);
    return d + "d ago";
  }

  function snipeCountdownLabel(post) {
    if (post.status !== "open") return "";
    const remainSec = Math.max(0, Math.floor((post.sniperDeadlineMs - Date.now()) / 1000));
    if (remainSec <= 0) return "🚨 sniper otw";
    if (remainSec < 30) return `🚨 ${remainSec}s — buruan!`;
    if (remainSec < 60) return `⏱ ${remainSec}s tersisa`;
    const m = Math.floor(remainSec / 60), s = remainSec % 60;
    return `⏱ ${m}m ${s}s tersisa`;
  }

  function renderFJBPage() {
    ensureState();
    ensureFirstBatch();
    snipeSweep();
    const s = S();
    const wrap = document.createElement("div");

    // Header card
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-people-group text-blue-600"></i> Grup FJB Phone Reseller</h3>
          <p class="text-sm text-gray-500">Forum Jual Beli — BU posts (snipe!) dan WTB hunters. Update tiap Next Day.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Total post</p>
          <p class="font-bold text-sm">${s.fjb.posts.length}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Empty state
    const visible = s.fjb.posts.slice(0, 20);
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl mb-3">
          <i class="fa-solid fa-people-group"></i>
        </div>
        <h3>Feed sepi</h3>
        <p class="text-sm text-gray-500">Klik <b>Next Day</b> dan grup bakal rame lagi 🙏</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    visible.forEach((post) => {
      wrap.appendChild(renderPost(post));
    });
    return wrap;
  }


  /* ---------- Single post card ---------- */
  function renderPost(post) {
    const card = document.createElement("article");
    card.className = `fjb-post fjb-post-${post.kind.toLowerCase()} fjb-status-${post.status}`;

    const headerHtml = `
      <header class="fjb-post-header">
        <div class="fjb-avatar" style="background:${post.author.color}">${post.author.avatar}</div>
        <div class="flex-1 min-w-0">
          <p class="fjb-author">${post.author.name}</p>
          <p class="fjb-meta">
            <span>${post.author.city}</span>
            <span>•</span>
            <span>${timeAgo(post.postedTimestamp)}</span>
            <span>•</span>
            <i class="fa-solid fa-earth-asia"></i>
          </p>
        </div>
        <span class="fjb-tag fjb-tag-${post.kind.toLowerCase()}">${post.kind === "BU" ? "BU 🔥" : "WTB"}</span>
      </header>
    `;

    const textHtml = `<div class="fjb-post-body">${escapeHtml(post.text).replace(/\n/g, "<br>")}</div>`;

    let priceBlockHtml = "";
    if (post.kind === "BU") {
      const remainPct = Math.max(0, Math.min(100,
        Math.round((post.sniperDeadlineMs - Date.now()) / ((post.sniperDeadlineMs - post.postedTimestamp) || 1) * 100)));
      priceBlockHtml = `
        <div class="fjb-price-block fjb-price-block-bu">
          <div class="fjb-price-row">
            <span class="fjb-price-label">Harga BU</span>
            <span class="fjb-price-value">${fmt(post.askingPrice)}</span>
          </div>
          <div class="fjb-price-row fjb-price-row-secondary">
            <span class="fjb-price-label">Pasaran</span>
            <span class="fjb-price-strike">${fmt(post.fairPrice)}</span>
          </div>
          <div class="fjb-discount-pill">
            -${Math.round(post.discountPct * 100)}% di bawah pasaran
          </div>
          ${post.status === "open" ? `
            <div class="fjb-snipe-bar" title="Sniper countdown">
              <div class="fjb-snipe-fill" style="width:${remainPct}%"></div>
            </div>
            <p class="fjb-snipe-label">${snipeCountdownLabel(post)}</p>
          ` : ""}
        </div>
      `;
    } else {
      priceBlockHtml = `
        <div class="fjb-price-block fjb-price-block-wtb">
          <div class="fjb-price-row">
            <span class="fjb-price-label">Mencari</span>
            <span class="fjb-price-value">${escapeHtml(post.gadgetName)} ${escapeHtml(post.specs.ram)}/${escapeHtml(post.specs.rom)}</span>
          </div>
          <div class="fjb-price-row">
            <span class="fjb-price-label">Budget</span>
            <span class="fjb-price-value text-emerald-700">${fmt(post.budget)}</span>
          </div>
          <p class="fjb-snipe-label">
            ${post.status === "open"
              ? `⏳ Expired Day ${post.expiresOnDay} (${Math.max(0, post.expiresOnDay - S().currentDay)} hari lagi)`
              : ""}
          </p>
        </div>
      `;
    }

    card.innerHTML = headerHtml + textHtml + priceBlockHtml;
    card.appendChild(renderActionRow(post));
    if (post.comments && post.comments.length > 0) {
      card.appendChild(renderComments(post.comments));
    }
    return card;
  }

  function renderActionRow(post) {
    const row = document.createElement("div");
    row.className = "fjb-actions";

    if (post.kind === "BU") {
      if (post.status === "open") {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-primary" data-act="pm" data-id="${post.id}">
            <i class="fa-solid fa-message"></i> PM Sekarang
          </button>
          <button class="fjb-btn fjb-btn-ghost" data-act="like">
            <i class="fa-regular fa-thumbs-up"></i> Like
          </button>
        `;
      } else if (post.status === "reserved") {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-success" data-act="pm" data-id="${post.id}">
            <i class="fa-solid fa-message"></i> Buka Chat (DM aktif)
          </button>
        `;
      } else { // sniped
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-disabled" disabled>
            <i class="fa-solid fa-lock"></i> Sold — kamu kalah cepat
          </button>
        `;
      }
    } else {
      // WTB
      const owned = post.status === "open" ? findOwnedItemForWTB(post) : null;
      if (post.status === "fulfilled") {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-disabled" disabled>
            <i class="fa-solid fa-check"></i> Deal closed sama kamu ✓
          </button>`;
      } else if (post.status === "expired") {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-disabled" disabled>
            <i class="fa-solid fa-clock-rotate-left"></i> WTB expired
          </button>`;
      } else if (owned) {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-primary" data-act="offer" data-id="${post.id}">
            <i class="fa-solid fa-handshake"></i> Tawarkan ${escapeHtml(owned.brand)} ${escapeHtml(owned.name)}
          </button>
        `;
      } else {
        row.innerHTML = `
          <button class="fjb-btn fjb-btn-ghost" disabled title="Kamu belum punya unit yang dia cari">
            <i class="fa-solid fa-warehouse"></i> Tidak ada di Inventory
          </button>
        `;
      }
    }

    row.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "pm")    openBUChat(btn.dataset.id);
        if (act === "offer") openWTBOffer(btn.dataset.id);
        if (act === "like")  showToast("👍");
      });
    });
    return row;
  }

  function renderComments(comments) {
    const wrap = document.createElement("div");
    wrap.className = "fjb-comments";
    comments.slice(0, 3).forEach((c) => {
      const row = document.createElement("div");
      row.className = "fjb-comment";
      row.innerHTML = `
        <div class="fjb-avatar fjb-avatar-sm" style="background:${c.author.color}">${c.author.avatar}</div>
        <div class="fjb-comment-body">
          <p class="fjb-comment-author">${c.author.name}</p>
          <p class="fjb-comment-text">${escapeHtml(c.text)}</p>
        </div>
      `;
      wrap.appendChild(row);
    });
    return wrap;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function showToast(msg) {
    if (window.Notifications && window.Notifications.toast) {
      window.Notifications.toast(msg);
    } else {
      alert(msg);
    }
  }

  /* ---------- Public API ---------- */
  window.FJB = {
    renderFJBPage,
    advanceDay,
    ensureFirstBatch,
    findOwnedItemForWTB,
    snipeSweep,
  };
})();
