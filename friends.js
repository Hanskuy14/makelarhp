/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 8 — Friends / Follow System
 *
 * AI broker network. Player follows competitors; each Next Day,
 * followed brokers post activity (listing big items / closing rare
 * sales) which fires Notifications and drives Marketplace check-ins.
 * ========================================================= */

(function () {
  function S() { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + n.toLocaleString("id-ID")); }

  /* =========================================================
   * AI broker roster
   * ========================================================= */
  const BROKERS = [
    { id: "br-andre",   name: "Andre Reseller",   handle: "@andrejakflip",     avatar: "A", color: "#06b6d4", specialty: "iPhone Pro Max",     followers:  18_400, location: "Jakarta",  bio: "Spesialis iPhone bekas garansi resmi. Fast deal." },
    { id: "br-budi",    name: "Budi Counter HP",  handle: "@budicounter",      avatar: "B", color: "#d946ef", specialty: "Samsung Foldable",   followers:  24_900, location: "Bandung",  bio: "Counter ITC, ratusan transaksi per bulan." },
    { id: "br-citra",   name: "Citra Gadget",     handle: "@citragadget",      avatar: "C", color: "#84cc16", specialty: "Xiaomi & Poco",      followers:   9_700, location: "Surabaya", bio: "Bandar Xiaomi second second2nd. Jujur, ramah, ngotot." },
    { id: "br-dimas",   name: "Dimas Second",     handle: "@dimassecondhand",  avatar: "D", color: "#f97316", specialty: "iPad & Tablet",      followers:  31_200, location: "Bekasi",   bio: "iPad Pro / Air, langganan content creator." },
    { id: "br-eka",     name: "Eka Importir",     handle: "@ekaimport_btm",    avatar: "E", color: "#a855f7", specialty: "Ex-Inter (Batam)",   followers:  47_500, location: "Batam",    bio: "Connection langsung ke pelabuhan. No pajak no problem." },
    { id: "br-fauzan",  name: "Fauzan Phone Hub", handle: "@fauzanphonehub",   avatar: "F", color: "#ef4444", specialty: "Galaxy S Flagship",  followers:   6_200, location: "Tangerang", bio: "Newcomer, harga kompetitif." },
    { id: "br-gita",    name: "Gita Galaxy",      handle: "@gitagalaxyid",     avatar: "G", color: "#3b82f6", specialty: "Galaxy Note & Z",    followers:  88_300, location: "Yogyakarta", bio: "Influencer review HP, 88k+ followers." },
    { id: "br-hadi",    name: "Hadi Hape Bekas",  handle: "@hadihapebekas",    avatar: "H", color: "#10b981", specialty: "Vivo & Oppo",        followers:   4_100, location: "Depok",    bio: "Counter rumahan, fokus brand China." },
    { id: "br-indra",   name: "Indra iStore",     handle: "@indraistore",      avatar: "I", color: "#f59e0b", specialty: "Apple Premium",      followers: 152_000, location: "Jakarta",  bio: "Apple-only, fullset original. Konsumen ribet welcome." },
    { id: "br-kiki",    name: "Kiki Konter",      handle: "@kikikonter",       avatar: "K", color: "#ec4899", specialty: "Xiaomi Flagship",    followers:  12_400, location: "Medan",    bio: "Mantan teknisi service, tau dalemannya." },
    { id: "br-maman",   name: "Maman MobileMart", handle: "@mamanmobilemart",  avatar: "M", color: "#8b5cf6", specialty: "Mid-range All Brand", followers:   7_900, location: "Bekasi",   bio: "Stok banyak, varian lengkap." },
    { id: "br-oka",     name: "Oka Outlet HP",    handle: "@okaoutlethp",      avatar: "O", color: "#0ea5e9", specialty: "Foldable Samsung",   followers:  22_600, location: "Bali",     bio: "Outlet di Denpasar, sering bawa unit langka." },
  ];

  /* ---------- State helpers ---------- */
  function ensureFriends() {
    const s = S();
    if (!Array.isArray(s.friends))         s.friends = [];          // followed broker IDs
    if (!Array.isArray(s.friendsActivity)) s.friendsActivity = [];  // recent posts feed (max 30)
    if (!s.friendsView) s.friendsView = { tab: "suggestions" };
  }

  function isFollowing(brokerId) {
    ensureFriends();
    return S().friends.includes(brokerId);
  }

  function follow(brokerId) {
    ensureFriends();
    const s = S();
    if (s.friends.includes(brokerId)) return;
    s.friends.push(brokerId);
    const b = BROKERS.find((x) => x.id === brokerId);
    window.FlippingTycoon.saveGame();
    if (b && window.Notifications) {
      window.Notifications.add({
        type: "social",
        title: `Mengikuti ${b.name}`,
        message: `Sekarang kamu akan dapat update aktivitas dari ${b.handle}.`,
        actionPage: "friends",
        actor: "Friend Network",
        icon: "user-plus",
      });
    }
  }

  function unfollow(brokerId) {
    ensureFriends();
    const s = S();
    s.friends = s.friends.filter((id) => id !== brokerId);
    window.FlippingTycoon.saveGame();
  }

  function followingCount() {
    ensureFriends();
    return S().friends.length;
  }

  function getBroker(id) {
    return BROKERS.find((b) => b.id === id) || null;
  }

  /* =========================================================
   * Daily activity simulator
   *
   * For each followed broker, roll a chance they did something
   * notable today. Bigger / rarer actions fire a notification.
   * ========================================================= */
  const ACTIVITY_KINDS = [
    { kind: "listed-flagship",  weight: 30, rare: false },
    { kind: "listed-rare",      weight: 12, rare: true  },
    { kind: "sold-flagship",    weight: 18, rare: false },
    { kind: "sold-rare",        weight:  8, rare: true  },
    { kind: "price-drop",       weight: 14, rare: false },
    { kind: "shoutout",         weight: 10, rare: false },
    { kind: "warning-blocklist", weight: 4, rare: true  },
  ];

  const FLAGSHIP_POOL = [
    "iPhone 15 Pro Max", "iPhone 16 Pro Max", "iPhone 14 Pro Max",
    "Galaxy S24 Ultra", "Galaxy S23 Ultra", "Galaxy Z Fold 5",
    "Galaxy Z Flip 5", "iPad Pro M2", "Xiaomi 14", "Vivo X100 Pro",
  ];
  const RARE_POOL = [
    "iPhone 15 Pro Max 1TB Natural Titanium",
    "Galaxy Z Fold 5 1TB BNIB Sealed",
    "iPhone 16 Pro Max Desert Titanium 256GB ex-resmi",
    "iPad Pro M2 11\" Cellular 2TB",
    "Galaxy S24 Ultra Titanium Yellow Korea spec",
    "Xiaomi 14 Ultra Photography Kit",
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function rollActivity() {
    const total = ACTIVITY_KINDS.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const a of ACTIVITY_KINDS) { if ((r -= a.weight) <= 0) return a; }
    return ACTIVITY_KINDS[0];
  }

  function buildActivity(broker) {
    const a = rollActivity();
    const isRare = a.rare;
    const item = isRare ? pick(RARE_POOL) : pick(FLAGSHIP_POOL);
    // Realistic-ish prices; flagship tier 8M-22M, rare 18M-30M.
    const price = isRare
      ? Math.round((18 + Math.random() * 12) * 1_000_000 / 50_000) * 50_000
      : Math.round(( 6 + Math.random() * 16) * 1_000_000 / 50_000) * 50_000;

    let text = "";
    let cta = null;
    switch (a.kind) {
      case "listed-flagship":
        text = `Listed ${item} di Marketplace, harga ${fmt(price)}. Cek dulu sebelum keduluan.`;
        cta = { type: "info", title: `${broker.name} listed ${item}`, page: "marketplace" };
        break;
      case "listed-rare":
        text = `🔥 RARE listing: ${item} — ${fmt(price)}. Jarang banget di pasar second!`;
        cta = { type: "alert", title: `Rare drop dari ${broker.name}`, page: "marketplace" };
        break;
      case "sold-flagship":
        text = `Just closed ${item} di ${fmt(price)}. Buyer happy, gua happy 🤝`;
        break;
      case "sold-rare":
        text = `🏆 SOLD: ${item} di ${fmt(price)}. Jangan lupa rate the seller, bro 😎`;
        cta = { type: "social", title: `${broker.name} clutch sale`, page: "friends" };
        break;
      case "price-drop":
        text = `Price drop! ${item} sekarang ${fmt(price)}. Sisa beberapa unit aja.`;
        cta = { type: "info", title: `${broker.name} price drop`, page: "marketplace" };
        break;
      case "shoutout":
        text = pick([
          "Buat yang nyari rekomendasi flipping HP minggu ini, DM ya.",
          "Workshop reseller weekend ini, slot terbatas.",
          "Update stok malam ini di story, follow biar nggak ketinggalan.",
          "Thanks 100+ followers baru bulan ini! 🙏",
        ]);
        break;
      case "warning-blocklist":
        text = `⚠️ Hati-hati buyer ${pick(["Reza", "Tommy", "Aldi", "Yoga"])} ${pick(["P.", "S.", "K."])} — banyak laporan PHP & lowball brutal. Spread the word.`;
        cta = { type: "scam", title: `Scam alert dari ${broker.name}`, page: "inventory" };
        break;
      default:
        text = "Posted something.";
    }

    return {
      id: "act-" + Math.random().toString(36).slice(2, 10),
      brokerId: broker.id,
      brokerName: broker.name,
      brokerHandle: broker.handle,
      brokerAvatar: broker.avatar,
      brokerColor: broker.color,
      day: S().currentDay,
      ts: Date.now(),
      kind: a.kind,
      rare: isRare,
      text,
      price,
      itemLabel: item,
      cta,
    };
  }

  /** Rolled once per Next Day: each followed broker has ~55% chance to post. */
  function processDailyActivity() {
    ensureFriends();
    const s = S();
    if (s.friends.length === 0) return;

    s.friends.forEach((id) => {
      const broker = getBroker(id);
      if (!broker) return;
      if (Math.random() > 0.55) return; // not active today

      const act = buildActivity(broker);
      s.friendsActivity.unshift(act);
      if (s.friendsActivity.length > 30) s.friendsActivity.length = 30;

      if (act.cta && window.Notifications) {
        window.Notifications.add({
          type: act.cta.type,
          title: act.cta.title,
          message: act.text,
          actionPage: act.cta.page,
          actor: broker.name,
          icon: act.rare ? "fire-flame-curved" : null,
        });
      }
    });
    window.FlippingTycoon.saveGame();
  }


  /* =========================================================
   * Page renderer (sidebar nav data-page="friends")
   * ========================================================= */
  function renderFriendsPage() {
    ensureFriends();
    const s = S();
    const wrap = document.createElement("div");

    // Header
    const followingIds = new Set(s.friends);
    const followingList = BROKERS.filter((b) => followingIds.has(b.id));
    const suggestions   = BROKERS.filter((b) => !followingIds.has(b.id));

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-user-group text-indigo-500"></i> Friends &amp; Following</h3>
          <p class="text-sm text-gray-500">Follow broker lain buat lihat update Marketplace mereka real-time.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Following</p>
          <p class="font-semibold text-sm">${followingList.length} / ${BROKERS.length}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Sub-tabs
    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    [
      { id: "suggestions", label: `Suggestions (${suggestions.length})`, icon: "user-plus" },
      { id: "following",   label: `Following (${followingList.length})`, icon: "user-check" },
      { id: "feed",        label: `Activity (${(s.friendsActivity || []).length})`, icon: "newspaper" },
    ].forEach((t) => {
      const btn = document.createElement("button");
      btn.className = `subtab ${s.friendsView.tab === t.id ? "active" : ""}`;
      btn.innerHTML = `<i class="fa-solid fa-${t.icon}"></i> ${t.label}`;
      btn.addEventListener("click", () => {
        s.friendsView.tab = t.id;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.friendsView.tab === "feed") {
      wrap.appendChild(renderActivityFeed());
    } else if (s.friendsView.tab === "following") {
      wrap.appendChild(renderBrokerGrid(followingList, /*followed=*/true));
    } else {
      wrap.appendChild(renderBrokerGrid(suggestions, /*followed=*/false));
    }
    return wrap;
  }

  function renderBrokerGrid(list, followed) {
    const wrap = document.createElement("div");
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 text-2xl mb-3">
          <i class="fa-solid fa-${followed ? "user-check" : "user-plus"}"></i>
        </div>
        <h3>${followed ? "Belum follow siapa-siapa" : "Semua broker sudah di-follow"}</h3>
        <p class="text-sm text-gray-500">${followed ? "Buka tab Suggestions buat mulai networking." : "Mantap, kamu udah connect ke semua broker."}</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = document.createElement("div");
    grid.className = "broker-grid";
    list.forEach((b) => grid.appendChild(renderBrokerCard(b, followed)));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderBrokerCard(b, followed) {
    const card = document.createElement("div");
    card.className = "broker-card" + (followed ? " followed" : "");
    const followerLabel =
      b.followers >= 100_000 ? `${(b.followers / 1000).toFixed(0)}k`
      : b.followers >= 10_000 ? `${(b.followers / 1000).toFixed(1)}k`
      : `${b.followers}`;
    card.innerHTML = `
      <div class="broker-banner" style="background: linear-gradient(135deg, ${b.color}cc 0%, ${b.color}66 100%);"></div>
      <div class="broker-avatar" style="background:${b.color}">${b.avatar}</div>
      <div class="broker-body">
        <p class="broker-name">${b.name}</p>
        <p class="broker-handle">${b.handle}</p>
        <p class="broker-bio">${b.bio}</p>
        <div class="broker-stats">
          <span><i class="fa-solid fa-users"></i> ${followerLabel} followers</span>
          <span><i class="fa-solid fa-location-dot"></i> ${b.location}</span>
        </div>
        <div class="broker-stats">
          <span class="broker-specialty"><i class="fa-solid fa-bolt"></i> ${b.specialty}</span>
        </div>
      </div>
      <button class="broker-btn ${followed ? "unfollow" : "follow"}" data-id="${b.id}">
        <i class="fa-solid ${followed ? "fa-user-minus" : "fa-user-plus"}"></i>
        ${followed ? "Unfollow" : "Follow"}
      </button>
    `;
    card.querySelector(".broker-btn").addEventListener("click", () => {
      if (followed) unfollow(b.id);
      else follow(b.id);
      window.FlippingTycoon.renderActivePage();
    });
    return card;
  }

  function renderActivityFeed() {
    const s = S();
    const wrap = document.createElement("div");
    const feed = s.friendsActivity || [];
    if (feed.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 text-2xl mb-3">
          <i class="fa-solid fa-newspaper"></i>
        </div>
        <h3>Belum ada aktivitas</h3>
        <p class="text-sm text-gray-500">Follow beberapa broker, lalu klik Next Day. Aktivitas mereka akan muncul di sini.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }
    feed.forEach((act) => {
      const post = document.createElement("div");
      post.className = "fb-post broker-post";
      post.innerHTML = `
        <div class="fb-post-header">
          <div class="fb-post-avatar" style="background:${act.brokerColor}">${act.brokerAvatar}</div>
          <div>
            <p class="font-semibold leading-tight">${act.brokerName}
              ${act.rare ? `<span class="broker-rare-tag"><i class="fa-solid fa-fire-flame-curved"></i> RARE</span>` : ""}
            </p>
            <p class="text-xs text-gray-500">${act.brokerHandle} &middot; Day ${act.day} &middot; <i class="fa-solid fa-earth-asia"></i></p>
          </div>
        </div>
        <div class="fb-post-body">
          <p class="text-sm">${escapeHTML(act.text)}</p>
        </div>
        <div class="fb-post-actions">
          <button><i class="fa-regular fa-thumbs-up"></i> Like</button>
          <button><i class="fa-regular fa-comment"></i> Comment</button>
          <button data-page="${(act.cta && act.cta.page) || "marketplace"}" class="broker-jump-btn">
            <i class="fa-solid fa-up-right-from-square"></i> ${
              act.cta && act.cta.page === "marketplace" ? "Cek Marketplace" :
              act.cta && act.cta.page === "inventory"   ? "Cek Inventory"   :
              "Lihat detail"
            }
          </button>
        </div>
      `;
      const jump = post.querySelector(".broker-jump-btn");
      if (jump) jump.addEventListener("click", () => {
        window.FlippingTycoon.setActivePage(jump.dataset.page);
      });
      wrap.appendChild(post);
    });
    return wrap;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }


  /* ---------- Public API ---------- */
  window.Friends = {
    BROKERS,
    renderFriendsPage,
    follow,
    unfollow,
    isFollowing,
    followingCount,
    processDailyActivity,
  };
})();
