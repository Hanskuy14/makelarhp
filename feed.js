/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 39 — Dynamic Social Feed
 *
 * Turns the static "Netbook News" tab into a living social feed with
 * FOUR weighted post types:
 *
 *   news           → market rumours / price pulses (reuses todayNews,
 *                    which also drives marketplace pricing)
 *   milestone      → NPC progression ("Zacky hit Priority Tier!")
 *   social_chatter → immersive community filler ("Got scammed at COD…")
 *   friend_listing → an NPC friend selling a REAL, interactive gadget.
 *                    Tapping "Negotiate" bridges straight into the
 *                    EXISTING Chat/COD negotiation (window.Chat).
 *
 * 100% i18n: feed items store { type, translationKey, params, ... } in
 * state — never rendered strings — and resolve through window.t() at
 * render time, so the whole feed flips language instantly (Part 36).
 *
 * State (self-healed here, no migration needed):
 *   data.socialFeed   : array of feed items, newest-first (capped)
 *   data.feedListings : registry of full listing objects for the
 *                       friend_listing posts (so chat.getListing() can
 *                       resolve them — see chat.js Part 39 patch)
 *   data.lastFeedDay  : day the feed was last (re)generated
 *
 * Public API: window.Feed
 *   - ensureDailyFeed()      → generate today's feed if stale
 *   - generateDailyFeed()    → force (re)generate today's feed
 *   - renderFeed()           → DocumentFragment of feed post cards
 *   - openNegotiation(id)    → bridge a friend listing into Chat
 *
 * Load order: AFTER market.js + chat.js (uses Market.buildRandomListing
 * and Chat.openWithListing). Everything else runs at render time, so its
 * position relative to script.js does not matter.
 * ========================================================= */

(function () {
  "use strict";

  /* ---------- shared helpers ---------- */
  function S() { return window.FlippingTycoon.State.data; }
  function save() { return window.FlippingTycoon.saveGame(); }
  function fmt(n) {
    return (window.Market && window.Market.formatRupiah)
      ? window.Market.formatRupiah(n)
      : "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }
  function esc(raw) {
    return String(raw == null ? "" : raw)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function uid(prefix) { return (prefix || "feed") + "-" + Math.random().toString(36).slice(2, 9); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  const FEED_CAP = 24; // keep the feed bounded for save size + perf

  /* ---------- NPC friend pool (the "social graph") ---------- */
  const AVATAR_COLORS = [
    "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#a855f7",
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#ec4899",
  ];
  const FRIEND_NAMES = [
    "Zacky", "Hadi", "Budi", "Rina", "Dewi", "Tomi", "Vino",
    "Sari", "Galih", "Putra", "Bayu", "Nadia", "Reza", "Fitri",
  ];
  function makeFriend() {
    const name = pick(FRIEND_NAMES);
    return {
      name,
      avatar: name.charAt(0).toUpperCase(),
      color: pick(AVATAR_COLORS),
    };
  }

  /* Dictionary key pools (the leaf keys under feed.*). Kept here so the
   * generator picks a key — never a raw string — keeping i18n intact. */
  const MILESTONE_KEYS = [
    "priority_tier", "kiosk", "ruko", "first_million",
    "hired_staff", "branch", "star_seller", "big_flip",
  ];
  const CHATTER_KEYS = [
    "scam_cod", "imei_check", "harga_naik", "nostalgia",
    "batangan", "afgan", "flipper_tip", "coffee",
  ];
  const LISTING_REASON_KEYS = [
    "reason_bu", "reason_cash", "reason_move", "reason_upgrade",
  ];

  /* =========================================================
   * State self-heal
   * ========================================================= */
  function ensureState() {
    const s = S();
    if (!Array.isArray(s.socialFeed))   s.socialFeed = [];
    if (!Array.isArray(s.feedListings)) s.feedListings = [];
    if (typeof s.lastFeedDay !== "number") s.lastFeedDay = 0;
    return s;
  }

  /* =========================================================
   * Item factories — each stores translationKey + params, NOT text.
   * ========================================================= */
  function makeNewsItem(s) {
    // Mirror today's market news into the feed (it also powers pricing).
    const n = s.todayNews;
    if (!n) return null;
    return {
      id: "feedNews-" + (n.id || uid()),
      day: n.day != null ? n.day : s.currentDay,
      type: "news",
      translationKey: n.translationKey || null,
      params: n.params || null,
      brand: n.brand || null,
      multiplier: typeof n.multiplier === "number" ? n.multiplier : 1,
      // legacy fallback for very old saves that stored raw strings
      headline: n.headline || null,
      blurb: n.blurb || null,
    };
  }

  function makeMilestoneItem(s) {
    const friend = makeFriend();
    return {
      id: uid("ms"),
      day: s.currentDay,
      type: "milestone",
      translationKey: "feed.milestone." + pick(MILESTONE_KEYS),
      params: { name: friend.name },
      actor: friend,
    };
  }

  function makeChatterItem(s) {
    const friend = makeFriend();
    return {
      id: uid("ch"),
      day: s.currentDay,
      type: "social_chatter",
      translationKey: "feed.chatter." + pick(CHATTER_KEYS),
      params: null,
      actor: friend,
    };
  }

  function makeFriendListingItem(s) {
    if (!window.Market || !window.Market.buildRandomListing) return null;
    const friend = makeFriend();
    // Build a REAL listing (identical shape to a marketplace listing) and
    // stamp the NPC friend as the seller so the chat header shows them.
    const listing = window.Market.buildRandomListing({
      name: friend.name,
      avatar: friend.avatar,
      color: friend.color,
      location: pick(["Jakarta", "Bandung", "Surabaya", "Bekasi", "Depok"]),
    });
    // Register so chat.getListing() can resolve it on "Negotiate".
    s.feedListings.push(listing);
    return {
      id: uid("fl"),
      day: s.currentDay,
      type: "friend_listing",
      listingId: listing.listingId,
      reasonKey: "feed.listing." + pick(LISTING_REASON_KEYS),
      params: { name: friend.name },
      actor: friend,
    };
  }

  /* =========================================================
   * Daily generation (weighted pool)
   *   - exactly ONE market-news post (if news exists)
   *   - ONE guaranteed friend_listing (the interactive hook is always
   *     visible)
   *   - 2..4 extra posts drawn from a weighted bag
   * ========================================================= */
  function rollExtraType() {
    // weights: chatter 50%, milestone 30%, friend_listing 20%
    const r = Math.random();
    if (r < 0.50) return "social_chatter";
    if (r < 0.80) return "milestone";
    return "friend_listing";
  }

  function generateDailyFeed() {
    const s = ensureState();
    const todays = [];

    const news = makeNewsItem(s);
    if (news) todays.push(news);

    // Guarantee one interactive friend listing every day.
    const guaranteed = makeFriendListingItem(s);
    if (guaranteed) todays.push(guaranteed);

    const extra = randInt(2, 4);
    for (let i = 0; i < extra; i++) {
      let item = null;
      switch (rollExtraType()) {
        case "milestone":      item = makeMilestoneItem(s); break;
        case "friend_listing": item = makeFriendListingItem(s); break;
        default:               item = makeChatterItem(s); break;
      }
      if (item) todays.push(item);
    }

    // Newest day on top; keep older posts beneath, capped.
    s.socialFeed = todays.concat(s.socialFeed).slice(0, FEED_CAP);
    s.lastFeedDay = s.currentDay;

    pruneFeedListings(s);
    save();
    return s.socialFeed;
  }

  /* Drop registered listings that are no longer referenced by any feed
   * item (aged out of the cap) so feedListings can't grow unbounded.
   * Listings removed by a purchase are already gone (Market.removeListing). */
  function pruneFeedListings(s) {
    const live = new Set();
    s.socialFeed.forEach((it) => {
      if (it.type === "friend_listing" && it.listingId) live.add(it.listingId);
    });
    s.feedListings = (s.feedListings || []).filter((l) => live.has(l.listingId));
  }

  function ensureDailyFeed() {
    const s = ensureState();
    if (s.lastFeedDay !== s.currentDay || s.socialFeed.length === 0) {
      generateDailyFeed();
    }
  }

  /* =========================================================
   * The Negotiation Bridge (the whole point of friend_listing)
   *
   * Connects the feed's "Negotiate" button to the EXISTING chat system.
   * The listing already lives in s.feedListings, and chat.getListing()
   * (Part 39 patch) searches that pool, so opening is a one-liner — the
   * player haggles exactly as if they found it on the marketplace.
   * ========================================================= */
  function openNegotiation(listingId) {
    const s = ensureState();
    const exists = s.feedListings.some((l) => l.listingId === listingId);
    if (!exists) {
      // Sold (or aged out) — nothing to negotiate.
      if (window.FlippingTycoon && window.FlippingTycoon.showToast) {
        window.FlippingTycoon.showToast(t("feed.listing.sold"), "info");
      }
      return;
    }
    if (window.AudioManager) window.AudioManager.playClick();
    window.Chat.openWithListing(listingId); // ← bridge into existing flow
  }

  /* =========================================================
   * Rendering
   * ========================================================= */
  function defectBadgeColor(severity) {
    return [
      "bg-emerald-100 text-emerald-700",
      "bg-yellow-100 text-yellow-700",
      "bg-orange-100 text-orange-700",
      "bg-rose-100 text-rose-700",
      "bg-red-200 text-red-800",
    ][severity] || "bg-gray-100 text-gray-700";
  }

  function gadgetIcon(listing, sizeClass) {
    const iconName = listing.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    return `<i class="fa-solid fa-${iconName} ${sizeClass || "text-4xl"}" style="color:${listing.accent || "#64748b"}"></i>`;
  }

  function feedActionsBar() {
    return `
      <div class="fb-post-actions">
        <button><i class="fa-regular fa-thumbs-up"></i> ${t("feed.like")}</button>
        <button><i class="fa-regular fa-comment"></i> ${t("feed.comment")}</button>
        <button><i class="fa-solid fa-share"></i> ${t("feed.share")}</button>
      </div>`;
  }

  /* --- milestone post (Trophy) --- */
  function renderMilestone(item) {
    const post = document.createElement("div");
    post.className = "fb-post";
    const a = item.actor || { name: "?", avatar: "?", color: "#f59e0b" };
    post.innerHTML = `
      <div class="fb-post-header">
        <div class="fb-post-avatar" style="background:${a.color}"><i class="fa-solid fa-trophy"></i></div>
        <div>
          <p class="font-semibold leading-tight">${esc(a.name)}</p>
          <p class="text-xs text-gray-500">${t("feed.milestone.source")} &middot; ${t("game.day")} ${item.day}</p>
        </div>
        <div class="ml-auto text-amber-400 text-lg"><i class="fa-solid fa-medal"></i></div>
      </div>
      <div class="fb-post-body">
        <p class="text-[15px] text-slate-800 dark:text-slate-100">${esc(t(item.translationKey, item.params))}</p>
      </div>
      ${feedActionsBar()}
    `;
    return post;
  }

  /* --- social chatter post (Comment bubble) --- */
  function renderChatter(item) {
    const post = document.createElement("div");
    post.className = "fb-post";
    const a = item.actor || { name: "?", avatar: "?", color: "#3b82f6" };
    post.innerHTML = `
      <div class="fb-post-header">
        <div class="fb-post-avatar" style="background:${a.color}">${esc(a.avatar)}</div>
        <div>
          <p class="font-semibold leading-tight">${esc(a.name)}</p>
          <p class="text-xs text-gray-500"><i class="fa-solid fa-comment-dots text-blue-400"></i> ${t("feed.chatter.source")} &middot; ${t("game.day")} ${item.day}</p>
        </div>
      </div>
      <div class="fb-post-body">
        <p class="text-[15px] text-slate-700 dark:text-slate-200 italic">“${esc(t(item.translationKey, item.params))}”</p>
      </div>
      ${feedActionsBar()}
    `;
    return post;
  }

  /* --- friend listing post (interactive — Phone/Cart + Negotiate) --- */
  function renderFriendListing(item) {
    const s = ensureState();
    const a = item.actor || { name: "?", avatar: "?", color: "#10b981" };
    const listing = s.feedListings.find((l) => l.listingId === item.listingId);
    const post = document.createElement("div");
    post.className = "fb-post";

    // Listing may have been sold (removed) or aged out.
    if (!listing) {
      post.innerHTML = `
        <div class="fb-post-header">
          <div class="fb-post-avatar" style="background:${a.color}">${esc(a.avatar)}</div>
          <div>
            <p class="font-semibold leading-tight">${esc(a.name)}</p>
            <p class="text-xs text-gray-500"><i class="fa-solid fa-store text-emerald-500"></i> ${t("feed.listing.source")} &middot; ${t("game.day")} ${item.day}</p>
          </div>
        </div>
        <div class="fb-post-body">
          <p class="text-sm text-gray-500">${esc(t(item.reasonKey, item.params))}</p>
          <div class="mt-2 flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-700/40 py-4 text-slate-400 font-semibold">
            <i class="fa-solid fa-circle-check"></i> ${t("feed.listing.sold")}
          </div>
        </div>
      `;
      return post;
    }

    const I = window.i18n;
    const cKey = I.conditionKey(listing.completeness);
    const dKey = I.defectKey(listing.defect);

    post.innerHTML = `
      <div class="fb-post-header">
        <div class="fb-post-avatar" style="background:${a.color}">${esc(a.avatar)}</div>
        <div>
          <p class="font-semibold leading-tight">${esc(a.name)}</p>
          <p class="text-xs text-gray-500"><i class="fa-solid fa-store text-emerald-500"></i> ${t("feed.listing.source")} &middot; ${t("game.day")} ${item.day}</p>
        </div>
        <div class="ml-auto text-emerald-500 text-lg"><i class="fa-solid fa-cart-shopping"></i></div>
      </div>
      <div class="fb-post-body">
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${esc(t(item.reasonKey, item.params))}</p>

        <!-- Gadget mini-card -->
        <div class="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/40">
          <div class="w-16 h-16 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shrink-0">
            ${gadgetIcon(listing, "text-3xl")}
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-800 dark:text-slate-100 truncate">${esc(listing.name)}</p>
            <p class="text-xs text-slate-500">${esc(listing.specs.ram)} / ${esc(listing.specs.rom)} &middot; ${esc(listing.specs.color)}</p>
            <div class="flex flex-wrap gap-1 mt-1">
              <span class="market-badge bg-blue-100 text-blue-700">${t("conditions." + cKey + ".short")}</span>
              <span class="market-badge ${defectBadgeColor(listing.defect.severity)}">${t("defects." + dKey + ".short")}</span>
              ${listing.isExInter ? `<span class="market-badge bg-rose-100 text-rose-700">${t("tax_status.ex_inter.label")}</span>` : ""}
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="text-[10px] uppercase tracking-wide text-slate-400">${t("feed.listing.askingLabel")}</p>
            <p class="font-extrabold text-emerald-600 leading-tight">${fmt(listing.finalPrice)}</p>
          </div>
        </div>

        <!-- THE interactive bridge -->
        <button class="ft-feed-negotiate mt-3 w-full py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#1463cf] active:scale-[0.97] transition-all text-white font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md">
          <i class="fa-solid fa-comments"></i> ${t("feed.listing.negotiate")}
        </button>
      </div>
      ${feedActionsBar()}
    `;

    const btn = post.querySelector(".ft-feed-negotiate");
    if (btn) btn.addEventListener("click", () => openNegotiation(item.listingId));
    return post;
  }

  /* --- master renderer: a DocumentFragment of all feed cards --- */
  function renderFeed() {
    ensureDailyFeed();
    const s = S();
    const frag = document.createDocumentFragment();

    s.socialFeed.forEach((item) => {
      let el = null;
      switch (item.type) {
        case "news":
          // Reuse the existing i18n news renderer from script.js.
          if (typeof window.renderNewsPost === "function") {
            el = window.renderNewsPost(item, item.day === s.currentDay);
          }
          break;
        case "milestone":      el = renderMilestone(item); break;
        case "social_chatter": el = renderChatter(item); break;
        case "friend_listing": el = renderFriendListing(item); break;
      }
      if (el) frag.appendChild(el);
    });

    return frag;
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Feed = {
    ensureDailyFeed,
    generateDailyFeed,
    renderFeed,
    openNegotiation,
    ensureState,
  };
})();
