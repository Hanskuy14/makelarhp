/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 10 — Player Profile (Facebook-style)
 *
 * Owns:
 *   - profilePosts (auto-generated when listing items, marked
 *     "sold" / "cancelled" when state changes)
 *   - player social stats (followers, reputation, totalSold)
 *   - chatArchive: closed chats surfaced by Messenger
 * ========================================================= */

(function () {
  function S()   { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 10); }

  /* =========================================================
   * Defaults / migration helpers
   * ========================================================= */
  function ensureProfileFields() {
    const s = S();
    if (!s.player) s.player = { name: "Player Broker", cash: 0 };
    if (!s.player.storeName)        s.player.storeName       = derivedStoreName(s.player.name);
    if (typeof s.player.followers          !== "number") s.player.followers          = 0;
    if (typeof s.player.reputation         !== "number") s.player.reputation         = 5.0;
    if (typeof s.player.totalGadgetsSold   !== "number") s.player.totalGadgetsSold   = (s.salesHistory || []).length;
    if (typeof s.player.startingCapital    !== "number") s.player.startingCapital    = 15_000_000;
    if (typeof s.player.joinedDay          !== "number") s.player.joinedDay          = s.currentDay || 1;
    if (typeof s.player.bio                !== "string") s.player.bio                = defaultBio(s.player);
    if (!s.player.avatar)            s.player.avatar           = (s.player.name || "P").trim().charAt(0).toUpperCase() || "P";
    if (!s.player.avatarColor)       s.player.avatarColor      = pickAvatarColor(s.player.name);
    if (!Array.isArray(s.profilePosts)) s.profilePosts = [];
    if (!Array.isArray(s.chatArchive))  s.chatArchive  = [];
  }

  function derivedStoreName(name) {
    if (!name) return "Player Counter";
    return name.split(/\s+/)[0] + " Counter";
  }

  function defaultBio(player) {
    return `Buy low, sell high. ${player.storeName || "Toko"} — broker gadget profesional di Gadgetbook Marketplace.`;
  }

  function pickAvatarColor(name) {
    const palette = ["#1877f2", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#0ea5e9", "#ef4444", "#14b8a6"];
    let hash = 0;
    for (let i = 0; i < (name || "P").length; i++) hash = (hash * 31 + (name || "P").charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  /** Apply onboarding form values to state. */
  function applyOnboarding({ playerName, storeName, startingCapital }) {
    const s = S();
    const cleanName  = (playerName  || "Player Broker").trim().slice(0, 32) || "Player Broker";
    const cleanStore = (storeName   || "Player Counter").trim().slice(0, 40) || "Player Counter";
    const cap = [10_000_000, 25_000_000, 50_000_000].includes(startingCapital) ? startingCapital : 10_000_000;

    s.player.name          = cleanName;
    s.player.storeName     = cleanStore;
    s.player.startingCapital = cap;
    s.player.avatar        = cleanName.charAt(0).toUpperCase();
    s.player.avatarColor   = pickAvatarColor(cleanName);
    s.player.bio           = defaultBio(s.player);
    s.player.joinedDay     = s.currentDay || 1;
    s.player.followers     = 0;
    s.player.reputation    = 5.0;
    s.player.totalGadgetsSold = 0;

    // Distribute capital across Mandiri / BNI for that classic multi-bank feel.
    if (cap === 10_000_000) {
      s.bankBalances.Mandiri = 7_000_000;
      s.bankBalances.BNI     = 3_000_000;
    } else if (cap === 25_000_000) {
      s.bankBalances.Mandiri = 17_000_000;
      s.bankBalances.BNI     =  8_000_000;
    } else if (cap === 50_000_000) {
      s.bankBalances.Mandiri = 35_000_000;
      s.bankBalances.BNI     = 15_000_000;
    }
    s.bankBalances.BCA = 0;
    s.bankHistories.Mandiri = [];
    s.bankHistories.BCA     = [];
    s.bankHistories.BNI     = [];

    // Seed onboarding "Welcome" post so the profile feed isn't empty.
    s.profilePosts = [{
      id: uid("post"),
      type: "welcome",
      day: s.currentDay || 1,
      timestamp: Date.now(),
      text: `🎉 ${cleanName} bergabung di Gadgetbook Marketplace dengan toko <b>${cleanStore}</b>. Modal awal ${fmt(cap)}. Ayo flipping!`,
    }];

    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * Profile posts
   * ========================================================= */
  const MAX_POSTS = 50;

  /** Called from selling.js when player creates a new listing. */
  function recordListingPost(listing) {
    ensureProfileFields();
    const s = S();
    const it = listing.itemSnapshot;
    const post = {
      id:        uid("post"),
      type:      "listing",
      listingId: listing.listingId,
      day:       listing.listedDay,
      timestamp: Date.now(),
      askingPrice: listing.askingPrice,
      gadget: {
        gadgetId:     it.gadgetId,
        name:         it.name,
        brand:        it.brand,
        specs:        it.specs ? { ram: it.specs.ram, rom: it.specs.rom, color: it.specs.color } : null,
        completeness: it.completeness ? { type: it.completeness.type, short: it.completeness.short } : null,
        defect:       it.defect       ? { type: it.defect.type,       short: it.defect.short       } : null,
        accent:       it.accent,
        icon:         it.icon,
        isExInter:    !!it.isExInter,
      },
      status:    "active",
      finalPrice: null,
      buyer:      null,
      saleType:   null,
    };
    s.profilePosts.unshift(post);
    if (s.profilePosts.length > MAX_POSTS) s.profilePosts.length = MAX_POSTS;
    window.FlippingTycoon.saveGame();
    return post;
  }

  function markPostSold(listingId, opts) {
    ensureProfileFields();
    const s = S();
    const post = (s.profilePosts || []).find((p) => p.listingId === listingId && p.status === "active");
    if (!post) return null;
    post.status     = "sold";
    post.finalPrice = opts && opts.finalPrice != null ? opts.finalPrice : null;
    post.buyer      = opts && opts.buyer ? opts.buyer : null;
    post.saleType   = opts && opts.saleType ? opts.saleType : "offer";
    post.soldOnDay  = s.currentDay;
    return post;
  }

  function markPostCancelled(listingId) {
    ensureProfileFields();
    const s = S();
    const post = (s.profilePosts || []).find((p) => p.listingId === listingId && p.status === "active");
    if (!post) return null;
    post.status        = "cancelled";
    post.cancelledOnDay = s.currentDay;
    return post;
  }

  /* =========================================================
   * Stat updates (called from sale paths)
   * ========================================================= */

  /** Player closes a sale (Accept Offer / Walk-in / Auto-Accept). */
  function recordSale(opts) {
    ensureProfileFields();
    const s = S();
    s.player.totalGadgetsSold = (s.player.totalGadgetsSold || 0) + 1;
    // Each sale wins +1..+3 followers (more for ex-inter -> "edgy" reputation).
    const rare = opts && opts.gadget && opts.gadget.isExInter;
    const bump = rare ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    s.player.followers = (s.player.followers || 0) + bump;
    // Reputation drifts toward 5.0 when sales are clean.
    const rep = clamp(s.player.reputation || 5.0, 1.0, 5.0);
    s.player.reputation = Math.round((rep * 0.8 + 5.0 * 0.2) * 10) / 10;
    return { followersGained: bump };
  }

  /** Player completes a purchase (buyer-side, from chat.js). */
  function recordPurchase(opts) {
    ensureProfileFields();
    const s = S();
    // Small follower bump from being seen as an active marketplace participant.
    if (Math.random() < 0.5) {
      s.player.followers = (s.player.followers || 0) + 1;
    }
  }

  /** Negative event (cancelled deal, blocked IMEI, etc.) nudges reputation down. */
  function applyReputationDelta(delta) {
    ensureProfileFields();
    const s = S();
    const rep = (s.player.reputation || 5.0) + delta;
    s.player.reputation = Math.round(clamp(rep, 1.0, 5.0) * 10) / 10;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* =========================================================
   * Chat archive (consumed by Messenger module)
   * ========================================================= */
  const MAX_ARCHIVE = 60;

  /**
   * @param entry {
   *   role: "buyer" | "seller",
   *   counterparty: { name, avatar, color, location? },
   *   gadget: { name, icon, accent, brand },
   *   chatLog: [],
   *   outcome: "sold"|"cancelled"|"left"|"walked-out",
   *   finalPrice?: number,
   *   itemKey?: string,        // for de-dupe
   * }
   */
  function archiveChat(entry) {
    ensureProfileFields();
    const s = S();
    if (!entry || !Array.isArray(entry.chatLog) || entry.chatLog.length === 0) return null;
    // De-dupe: same itemKey/outcome+chatLog length already archived recently?
    if (entry.itemKey) {
      const idx = (s.chatArchive || []).findIndex((a) => a.itemKey === entry.itemKey);
      if (idx >= 0) {
        // Replace with most-recent log so the messenger reflects reality.
        s.chatArchive.splice(idx, 1);
      }
    }
    s.chatArchive.unshift({
      id: uid("arc"),
      day: s.currentDay,
      timestamp: Date.now(),
      role: entry.role || "seller",
      counterparty: entry.counterparty || { name: "Unknown", avatar: "?", color: "#9ca3af" },
      gadget: entry.gadget || null,
      chatLog: entry.chatLog.slice(),
      outcome: entry.outcome || "left",
      finalPrice: typeof entry.finalPrice === "number" ? entry.finalPrice : null,
      itemKey: entry.itemKey || null,
    });
    if (s.chatArchive.length > MAX_ARCHIVE) s.chatArchive.length = MAX_ARCHIVE;
    window.FlippingTycoon.saveGame();
  }

  /* =========================================================
   * Profile page renderer (FB-style)
   * ========================================================= */
  function renderProfilePage() {
    ensureProfileFields();
    const s = S();
    const p = s.player;
    const wrap = document.createElement("div");

    // ----- Cover + identity -----
    const header = document.createElement("div");
    header.className = "profile-card";
    header.innerHTML = `
      <div class="profile-cover">
        <div class="profile-cover-glow"></div>
        <button class="profile-cover-edit" type="button" title="Edit cover">
          <i class="fa-solid fa-camera"></i> Edit Cover
        </button>
      </div>
      <div class="profile-identity">
        <div class="profile-pic" style="background:${p.avatarColor}">
          ${escapeHtml(p.avatar)}
        </div>
        <div class="profile-identity-body">
          <h2 class="profile-name">${escapeHtml(p.name)}</h2>
          <p class="profile-store">
            <i class="fa-solid fa-store"></i> ${escapeHtml(p.storeName)}
          </p>
          <p class="profile-bio">${escapeHtml(p.bio)}</p>
          <div class="profile-meta">
            <span><i class="fa-solid fa-calendar"></i> Joined Day ${p.joinedDay}</span>
            <span><i class="fa-solid fa-coins"></i> Modal awal ${fmt(p.startingCapital || 0)}</span>
          </div>
        </div>
      </div>
      <div class="profile-actions">
        <button class="profile-action primary" type="button"><i class="fa-solid fa-plus"></i> Add to Story</button>
        <button class="profile-action" type="button"><i class="fa-solid fa-pen"></i> Edit Profile</button>
        <button class="profile-action" type="button"><i class="fa-solid fa-ellipsis"></i></button>
      </div>
    `;
    wrap.appendChild(header);

    // ----- Stats row -----
    const statsCard = document.createElement("div");
    statsCard.className = "fb-card profile-stats-card";
    statsCard.innerHTML = `
      <div class="profile-stats-grid">
        <div class="profile-stat">
          <div class="profile-stat-icon" style="background:#dbeafe;color:#1d4ed8">
            <i class="fa-solid fa-user-group"></i>
          </div>
          <div>
            <p class="profile-stat-value">${(p.followers || 0).toLocaleString("id-ID")}</p>
            <p class="profile-stat-label">Followers</p>
          </div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-icon" style="background:#fef3c7;color:#b45309">
            <i class="fa-solid fa-star"></i>
          </div>
          <div>
            <p class="profile-stat-value">${(p.reputation || 5.0).toFixed(1)} <span class="text-sm text-gray-500">/ 5.0</span></p>
            <p class="profile-stat-label">Reputation Rating</p>
          </div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-icon" style="background:#dcfce7;color:#166534">
            <i class="fa-solid fa-mobile-screen-button"></i>
          </div>
          <div>
            <p class="profile-stat-value">${(p.totalGadgetsSold || 0).toLocaleString("id-ID")}</p>
            <p class="profile-stat-label">Total Gadgets Sold</p>
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(statsCard);

    // Part 20 — Reputation card (Tingkat Kepercayaan)
    if (window.Reputation && window.Reputation.renderReputationCard) {
      wrap.appendChild(window.Reputation.renderReputationCard());
    }

    // Part 20 — Inbound Reseller DMs (Suhu-only feed)
    const leads = (S().inboundLeads || []).filter((l) => l.status !== "dismissed");
    if (leads.length > 0) {
      const dmCard = document.createElement("div");
      dmCard.className = "fb-card";
      dmCard.innerHTML = `
        <h3 class="mb-3"><i class="fa-solid fa-envelope text-purple-600"></i> DM Reseller (Inbound Leads)</h3>
        <div class="rep-leads-list">
          ${leads.slice(0, 6).map((l) => `
            <div class="rep-lead-row">
              <div class="rep-lead-avatar" style="background:${l.color}">${escapeHtml(l.avatar)}</div>
              <div class="rep-lead-body">
                <p class="rep-lead-author">${escapeHtml(l.name)} <span class="rep-lead-day">D${l.day}</span></p>
                <p class="rep-lead-text">${escapeHtml(l.text)}</p>
              </div>
              <span class="rep-lead-tag ${l.status === "unread" ? "unread" : ""}">${l.status === "unread" ? "Unread" : "Replied"}</span>
            </div>
          `).join("")}
        </div>
        <p class="text-xs text-gray-500 mt-3">DM ini muncul karena kamu tier <b>Suhu</b>. Mereka siap nampung stok kamu.</p>
      `;
      wrap.appendChild(dmCard);
    }

    // ----- Posts section -----
    const postsHeader = document.createElement("div");
    postsHeader.className = "fb-card profile-posts-header";
    postsHeader.innerHTML = `
      <div class="flex items-center justify-between">
        <h3>Posts</h3>
        <span class="text-xs text-gray-500">${(s.profilePosts || []).length} posts</span>
      </div>
      <p class="text-sm text-gray-500 mt-1">
        Setiap kali ${escapeHtml(p.storeName)} list barang di Marketplace, otomatis muncul di sini.
      </p>
    `;
    wrap.appendChild(postsHeader);

    const posts = s.profilePosts || [];
    if (posts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl mb-3">
          <i class="fa-solid fa-newspaper"></i>
        </div>
        <h3>Belum ada postingan</h3>
        <p class="text-sm text-gray-500">List barang di Marketplace untuk auto-publish post di sini.</p>
      `;
      wrap.appendChild(empty);
    } else {
      posts.forEach((post) => wrap.appendChild(renderPost(post)));
    }
    return wrap;
  }

  function renderPost(post) {
    const s = S();
    const p = s.player;
    const post_div = document.createElement("div");
    post_div.className = "fb-post profile-post";

    const dayAgo = Math.max(0, s.currentDay - post.day);
    const ago = dayAgo === 0 ? "Today" : dayAgo === 1 ? "Yesterday" : `${dayAgo} days ago`;

    // ---- Header (always the same: player + storeName) ----
    const headerHtml = `
      <div class="fb-post-header">
        <div class="fb-post-avatar" style="background:${p.avatarColor}">${escapeHtml(p.avatar)}</div>
        <div>
          <p class="font-semibold leading-tight">${escapeHtml(p.storeName)}</p>
          <p class="text-xs text-gray-500">
            ${escapeHtml(p.name)} &middot; Day ${post.day} ${ago === "Today" ? "&middot; <b>Today</b>" : `&middot; ${ago}`} &middot; <i class="fa-solid fa-globe-asia"></i>
          </p>
        </div>
      </div>
    `;

    if (post.type === "welcome") {
      post_div.innerHTML = `
        ${headerHtml}
        <div class="fb-post-body">
          <p class="font-semibold">Welcome to Gadgetbook Marketplace!</p>
          <p class="text-sm text-gray-600 mt-1">${post.text}</p>
        </div>
        <div class="fb-post-actions">
          <button><i class="fa-regular fa-thumbs-up"></i> Like</button>
          <button><i class="fa-regular fa-comment"></i> Comment</button>
          <button><i class="fa-solid fa-share"></i> Share</button>
        </div>
      `;
      return post_div;
    }

    // type === "listing"
    const g = post.gadget || {};
    const accent = g.accent || "#1c1c1e";
    const iconName = g.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";

    const statusBadge =
      post.status === "sold"      ? `<span class="profile-post-status sold">SOLD</span>`
    : post.status === "cancelled" ? `<span class="profile-post-status cancelled">CANCELLED</span>`
    :                                `<span class="profile-post-status active">FOR SALE</span>`;

    const ctaBtn =
      post.status === "active"
        ? `<button class="profile-post-cta active" data-listing="${post.listingId}">
             <i class="fa-solid fa-tag"></i> View Listing
           </button>`
        : post.status === "sold"
          ? `<button class="profile-post-cta done" disabled>
               <i class="fa-solid fa-check-double"></i> Sold ${post.finalPrice != null ? "@ " + fmt(post.finalPrice) : ""}
             </button>`
          : `<button class="profile-post-cta cancelled" disabled>
               <i class="fa-solid fa-xmark"></i> Listing dibatalkan
             </button>`;

    const captionStatus =
      post.status === "sold"
        ? (post.buyer ? `Sold to ${escapeHtml(post.buyer)} ${post.saleType === "walk-in" ? "(walk-in)" : post.saleType === "auto-accept" ? "(auto-accept)" : ""}` : "Sold!")
      : post.status === "cancelled"
        ? "Listing dibatalkan."
        : "Lagi cari pembeli yang serius.";

    const exInterTag = g.isExInter
      ? `<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>`
      : "";

    post_div.innerHTML = `
      ${headerHtml}
      <div class="fb-post-body">
        <p class="font-semibold">📱 Just Listed: ${escapeHtml(g.name)}</p>
        <p class="text-sm text-gray-600 mt-1">${escapeHtml(captionStatus)}</p>
      </div>
      <div class="profile-post-image">
        <i class="fa-solid fa-${iconName}" style="color:${accent}"></i>
        <div class="profile-post-image-tag">${escapeHtml(g.brand || "Gadget")}</div>
        ${statusBadge}
        ${g.isExInter ? `<span class="ex-inter-tag big"><i class="fa-solid fa-skull-crossbones"></i> No Pajak</span>` : ""}
      </div>
      <div class="profile-post-meta">
        <div>
          <p class="profile-post-name">${escapeHtml(g.name)}</p>
          <p class="profile-post-spec">
            ${g.specs ? `${g.specs.ram}/${g.specs.rom} &middot; ${escapeHtml(g.specs.color || "")} &middot; ` : ""}
            ${g.completeness ? escapeHtml(g.completeness.short) : ""}
            ${g.defect ? " &middot; " + escapeHtml(g.defect.short) : ""}
          </p>
          <div class="profile-post-badges">
            ${exInterTag}
          </div>
        </div>
        <div class="profile-post-price">
          <p class="profile-post-price-label">Asking</p>
          <p class="profile-post-price-value">${fmt(post.askingPrice)}</p>
        </div>
      </div>
      <div class="profile-post-cta-row">
        ${ctaBtn}
      </div>
      <div class="fb-post-actions">
        <button><i class="fa-regular fa-thumbs-up"></i> Like</button>
        <button><i class="fa-regular fa-comment"></i> Comment</button>
        <button><i class="fa-solid fa-share"></i> Share</button>
      </div>
    `;

    const cta = post_div.querySelector(".profile-post-cta.active");
    if (cta) {
      cta.addEventListener("click", () => {
        // Pop into Inventory > Active Listings tab so the player can see the live listing.
        const ss = S();
        ss.activePage = "inventory";
        if (!ss.inventoryView) ss.inventoryView = { activeTab: "owned" };
        ss.inventoryView.activeTab = "active";
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderAll();
      });
    }
    return post_div;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---------- Public API ---------- */
  window.Profile = {
    ensureProfileFields,
    applyOnboarding,
    recordListingPost,
    markPostSold,
    markPostCancelled,
    recordSale,
    recordPurchase,
    applyReputationDelta,
    archiveChat,
    renderProfilePage,
  };
})();
