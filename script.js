/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 1+3 — Foundations + News pulse + module routing
 * ========================================================= */

/* ---------- 1. Constants ---------- */
const STORAGE_KEY = "flippingTycoon.save.v1";
const STARTING_BALANCES = {
  Mandiri: 10_000_000, // updated in Part 3
  BCA: 0,
  BNI: 5_000_000,      // updated in Part 3
};

/* ---------- 2. Default State factory ---------- */
function createDefaultState() {
  return {
    meta: {
      version: 8,
      createdAt: Date.now(),
      lastSavedAt: null,
    },
    currentDay: 1,
    player: { name: "Player Broker", cash: 0 },
    bankBalances: { ...STARTING_BALANCES },
    bankHistories: { Mandiri: [], BCA: [], BNI: [] },
    inventory: [],
    marketPrices: {},
    dailyListings: [],
    lastListingDay: 0,
    marketView: { mode: "grid", selectedListingId: null },
    activePage: "news-feed",
    todayNews: null,
    newsHistory: [],
    bankingView: { activeBank: "Mandiri" },
    upgrades: { premiumTools: false, fbPaidAds: false },
    repairView: { activeTab: "repairs" },
    activeListings: [],                 // Part 5: items the player put up for sale
    inventoryView: { activeTab: "owned" },
    realEstate: {                       // Part 6: storefront rental
      rented: false,
      store: null,
      rentSince: null,
      daysRented: 0,
      totalPaid: 0,
      evictedOnDay: null,
      walkInsHistory: [],
    },
    batamCargo: [],                     // Part 7: Batam Supplier shipments
    batamHistory: [],                   // Part 7: confiscation / delivered log
    notifications: [],                  // Part 8: Notification Center entries
    notificationContext: null,          // Part 8: transient context from clicked notification
    friends: [],                        // Part 8: followed broker IDs
    friendsActivity: [],                // Part 8: activity feed posts (capped 30)
    friendsView: { tab: "suggestions" },// Part 8: friends page tab state
  };
}

/* ---------- 3. Global State ---------- */
const State = {
  data: createDefaultState(),

  reset() {
    this.data = createDefaultState();
    this.save();
  },

  hasSave() {
    return !!localStorage.getItem(STORAGE_KEY);
  },

  save() {
    try {
      this.data.meta.lastSavedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.error("[FlippingTycoon] saveGame failed:", err);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.data = Object.assign(createDefaultState(), parsed);
      this._migrate(parsed);
      return true;
    } catch (err) {
      console.error("[FlippingTycoon] loadGame failed:", err);
      this.data = createDefaultState();
      return false;
    }
  },

  _migrate(parsed) {
    const version = (parsed.meta && parsed.meta.version) || 1;
    if (version < 3) {
      if ((this.data.bankBalances.Mandiri || 0) < STARTING_BALANCES.Mandiri) {
        this.data.bankBalances.Mandiri = STARTING_BALANCES.Mandiri;
      }
      if ((this.data.bankBalances.BNI || 0) < STARTING_BALANCES.BNI) {
        this.data.bankBalances.BNI = STARTING_BALANCES.BNI;
      }
      this.data.meta.version = 3;
    }
    if (version < 4) {
      if (!this.data.upgrades) this.data.upgrades = { premiumTools: false, fbPaidAds: false };
      if (!this.data.repairView) this.data.repairView = { activeTab: "repairs" };
      this.data.meta.version = 4;
    }
    if (version < 5) {
      if (!Array.isArray(this.data.activeListings)) this.data.activeListings = [];
      if (!this.data.inventoryView) this.data.inventoryView = { activeTab: "owned" };
      this.data.meta.version = 5;
    }
    if (version < 6) {
      if (!this.data.realEstate) {
        this.data.realEstate = {
          rented: false,
          store: null,
          rentSince: null,
          daysRented: 0,
          totalPaid: 0,
          evictedOnDay: null,
          walkInsHistory: [],
        };
      }
      // Backfill IMEI fields for legacy inventory items.
      (this.data.inventory || []).forEach((it) => {
        if (typeof it.isExInter === "undefined") it.isExInter = false;
        if (typeof it.imeiStatus === "undefined") it.imeiStatus = it.isExInter ? "ok" : null;
      });
      // Backfill snapshots in active listings.
      (this.data.activeListings || []).forEach((l) => {
        if (l.itemSnapshot) {
          if (typeof l.itemSnapshot.isExInter === "undefined") l.itemSnapshot.isExInter = false;
          if (typeof l.itemSnapshot.imeiStatus === "undefined") {
            l.itemSnapshot.imeiStatus = l.itemSnapshot.isExInter ? "ok" : null;
          }
        }
      });
      this.data.meta.version = 6;
    }
    if (version < 7) {
      if (!Array.isArray(this.data.batamCargo)) this.data.batamCargo = [];
      if (!Array.isArray(this.data.batamHistory)) this.data.batamHistory = [];
      this.data.meta.version = 7;
    }
    if (version < 8) {
      if (!Array.isArray(this.data.notifications))   this.data.notifications = [];
      if (!Array.isArray(this.data.friends))         this.data.friends = [];
      if (!Array.isArray(this.data.friendsActivity)) this.data.friendsActivity = [];
      if (!this.data.friendsView)                    this.data.friendsView = { tab: "suggestions" };
      this.data.meta.version = 8;
    }
  },
};

function saveGame() { return State.save(); }
function loadGame() { return State.load(); }

/* ---------- 4. Utility helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatRupiah(n) {
  if (typeof n !== "number") n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }



/* =========================================================
 * 5. News pulse (Part 3)
 * ========================================================= */

const NEWS_TEMPLATES = [
  { headline: "iPhone 17 dirumorkan rilis bulan depan!",                  brand: "Apple",   multiplier: 1.10, blurb: "Pasar second iPhone ramai diserbu, harga melambung 10%." },
  { headline: "Bug iOS terbaru bikin baterai iPhone boros parah.",        brand: "Apple",   multiplier: 0.92, blurb: "Banyak yang lepas iPhone-nya, harga anjlok 8% hari ini." },
  { headline: "Apple umumkan Trade-in besar untuk iPad.",                 brand: "Apple",   multiplier: 0.94, blurb: "iPad bekas membanjir Marketplace, harga turun 6%." },
  { headline: "Samsung One UI 7 menyala mulus di seri lama!",             brand: "Samsung", multiplier: 1.08, blurb: "Demand Galaxy second naik 8% setelah update memukau." },
  { headline: "Galaxy S Series ditemukan masalah panas berlebih.",        brand: "Samsung", multiplier: 0.90, blurb: "Banyak user trade-in, harga second turun 10%." },
  { headline: "Z Fold/Flip viral di TikTok, demand foldable meledak.",    brand: "Samsung", multiplier: 1.07, blurb: "Foldable Samsung jadi rebutan, naik 7%." },
  { headline: "Xiaomi 14 raih juara DxOMark, kolektor berburu.",          brand: "Xiaomi",  multiplier: 1.09, blurb: "Xiaomi second naik 9% karena hype kamera." },
  { headline: "Xiaomi luncurkan diskon massal seri Redmi.",               brand: "Xiaomi",  multiplier: 0.93, blurb: "Stok Redmi membanjir pasar, harga turun 7%." },
  { headline: "Oppo Reno 12 leak: desain mirip seri lama.",               brand: "Oppo",    multiplier: 1.06, blurb: "Pengguna lama enggan upgrade, second Oppo naik 6%." },
  { headline: "Oppo Find X ditarik karena cacat layar.",                  brand: "Oppo",    multiplier: 0.88, blurb: "Kepercayaan brand turun, harga second jatuh 12%." },
  { headline: "Vivo X100 Pro terpilih HP kamera terbaik tahun ini.",      brand: "Vivo",    multiplier: 1.10, blurb: "Vivo flagship melejit 10% di pasar second." },
  { headline: "Vivo Y Series obral besar-besaran via promo bank.",        brand: "Vivo",    multiplier: 0.92, blurb: "Y Series second tertekan diskon promo, harga drop 8%." },
  { headline: "Pasar gadget tenang, tidak ada gejolak harga.",            brand: null,      multiplier: 1.00, blurb: "Hari yang stabil. Saatnya scout deal di Marketplace." },
];

function generateDailyNews() {
  const tpl = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
  const news = {
    id: "news-" + Math.random().toString(36).slice(2, 8),
    day: State.data.currentDay,
    timestamp: Date.now(),
    ...tpl,
  };
  State.data.todayNews = news;
  State.data.newsHistory.unshift(news);
  if (State.data.newsHistory.length > 12) State.data.newsHistory.pop();
  return news;
}

/** Returns the current day's brand multiplier (used by market.js). */
function getNewsMultiplierForBrand(brand) {
  const n = State.data.todayNews;
  if (!n || !n.brand) return 1.0;
  return n.brand === brand ? n.multiplier : 1.0;
}

/* =========================================================
 * 6. Screen flow
 * ========================================================= */
async function runSplash() {
  const splash = $("#splash-screen");
  await delay(2000);
  splash.classList.add("fade-out");
  await delay(700);
  splash.style.display = "none";
  showHomeScreen();
}

function showHomeScreen() {
  $("#home-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
  if (State.hasSave()) {
    $("#continue-game-btn").classList.remove("hidden");
    $("#reset-game-btn").classList.remove("hidden");
  }
}

function startNewGame() {
  State.reset();
  if (!State.data.todayNews) generateDailyNews();
  enterApp();
}

function continueGame() {
  if (!loadGame()) State.reset();
  if (!State.data.todayNews) generateDailyNews();
  enterApp();
}

function enterApp() {
  $("#home-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  if (window.Market) window.Market.ensureDailyListings();
  renderAll();
}



/* =========================================================
 * 7. Rendering
 * ========================================================= */
function renderAll() {
  renderTopbar();
  renderSidebar();
  renderActivePage();
}

function renderTopbar() {
  $("#topbar-day").textContent = State.data.currentDay;
  if (window.Notifications) window.Notifications.refreshBadge();
}

function renderSidebar() {
  $$(".sidebar-nav").forEach((btn) => {
    const page = btn.dataset.page;
    btn.classList.toggle("active", page === State.data.activePage);
  });
  // Inbox notification badge on Inventory link
  const invBtn = document.querySelector('.sidebar-nav[data-page="inventory"]');
  if (invBtn) {
    let badge = invBtn.querySelector(".sidebar-badge");
    const pending = window.Selling ? window.Selling.pendingOfferCount() : 0;
    if (pending > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "sidebar-badge";
        invBtn.appendChild(badge);
      }
      badge.textContent = pending;
    } else if (badge) {
      badge.remove();
    }
  }
  // Customs alert badge on Batam Supplier link
  const batamBtn = document.querySelector('.sidebar-nav[data-page="batam"]');
  if (batamBtn) {
    let badge = batamBtn.querySelector(".sidebar-badge");
    const customs = window.Batam ? window.Batam.customsAlertCount() : 0;
    if (customs > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "sidebar-badge";
        batamBtn.appendChild(badge);
      }
      badge.textContent = customs;
    } else if (badge) {
      badge.remove();
    }
  }
}

function setActivePage(page) {
  State.data.activePage = page;
  saveGame();
  renderSidebar();
  renderActivePage();
}

function renderActivePage() {
  const container = $("#page-container");
  container.innerHTML = "";
  container.classList.remove("page-fade-in");
  void container.offsetWidth;
  container.classList.add("page-fade-in");

  switch (State.data.activePage) {
    case "news-feed":   container.appendChild(renderNewsFeedPage()); break;
    case "marketplace":
      container.appendChild(window.Market ? window.Market.renderMarketplacePage() : renderPlaceholder("Marketplace", "store", "Loading..."));
      break;
    case "inventory":
      container.appendChild(window.Inventory ? window.Inventory.renderInventoryPage() : renderPlaceholder("Inventory", "boxes-stacked", "Loading..."));
      break;
    case "banking":
      container.appendChild(window.Banking ? window.Banking.renderBankingPage() : renderPlaceholder("Banking", "building-columns", "Loading..."));
      break;
    case "repair":
      container.appendChild(window.Repair ? window.Repair.renderRepairCenterPage() : renderPlaceholder("Repair Center", "screwdriver-wrench", "Loading..."));
      break;
    case "real-estate":
      container.appendChild(window.RealEstate ? window.RealEstate.renderRealEstatePage() : renderPlaceholder("Real Estate", "shop", "Loading..."));
      break;
    case "batam":
      container.appendChild(window.Batam ? window.Batam.renderBatamPage() : renderPlaceholder("Batam Supplier", "ship", "Loading..."));
      break;
    case "accessories":
      container.appendChild(window.Accessories ? window.Accessories.renderAccessoriesPage() : renderPlaceholder("Toko Aksesoris", "box-open", "Loading..."));
      break;
    case "friends":
      container.appendChild(window.Friends ? window.Friends.renderFriendsPage() : renderPlaceholder("Friends", "user-group", "Loading..."));
      break;
    default: container.appendChild(renderNewsFeedPage());
  }
}

/* ----- News Feed (with dynamic news post) ----- */
function renderNewsFeedPage() {
  const wrap = document.createElement("div");
  const s = State.data;

  // Composer
  const composer = document.createElement("div");
  composer.className = "composer";
  composer.innerHTML = `
    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">P</div>
    <input type="text" placeholder="What gadget are you flipping today, Player Broker?" />
    <button class="text-[#1877F2] text-xl"><i class="fa-regular fa-image"></i></button>
  `;
  wrap.appendChild(composer);

  // Day briefing
  const totalBank = s.bankBalances.Mandiri + s.bankBalances.BCA + s.bankBalances.BNI;
  const summary = document.createElement("div");
  summary.className = "fb-card";
  summary.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3>Day ${s.currentDay} Briefing</h3>
      <span class="text-xs text-gray-500">${new Date().toLocaleDateString("en-US", { weekday: "long" })}</span>
    </div>
    <p class="text-sm text-gray-600 mb-3">Welcome back, Broker. Markets are open. Here is your morning summary.</p>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="p-3 bg-blue-50 rounded-lg"><p class="text-gray-500 text-xs">Total Bank</p><p class="font-bold text-[#1877F2]">${formatRupiah(totalBank)}</p></div>
      <div class="p-3 bg-amber-50 rounded-lg"><p class="text-gray-500 text-xs">Inventory</p><p class="font-bold text-amber-600">${s.inventory.length} items</p></div>
      <div class="p-3 bg-emerald-50 rounded-lg"><p class="text-gray-500 text-xs">Mandiri</p><p class="font-bold text-emerald-700">${formatRupiah(s.bankBalances.Mandiri)}</p></div>
      <div class="p-3 bg-indigo-50 rounded-lg"><p class="text-gray-500 text-xs">BCA / BNI</p><p class="font-bold text-indigo-700">${formatRupiah(s.bankBalances.BCA + s.bankBalances.BNI)}</p></div>
    </div>
  `;
  wrap.appendChild(summary);

  // Today's news (impactful)
  if (s.todayNews) {
    wrap.appendChild(renderNewsPost(s.todayNews, true));
  }
  // Older news from history (read-only flavor)
  s.newsHistory.slice(1, 4).forEach((n) => wrap.appendChild(renderNewsPost(n, false)));

  return wrap;
}

function renderNewsPost(news, isToday) {
  const post = document.createElement("div");
  post.className = "fb-post";
  const pct = Math.round((news.multiplier - 1) * 100);
  const trendClass = pct > 0 ? "trend-up" : pct < 0 ? "trend-down" : "trend-flat";
  const trendIcon = pct > 0 ? "fa-arrow-trend-up" : pct < 0 ? "fa-arrow-trend-down" : "fa-minus";
  const brandTag = news.brand ? `${news.brand} ${pct >= 0 ? "+" : ""}${pct}%` : "Pasar Stabil";
  post.innerHTML = `
    <div class="fb-post-header">
      <div class="fb-post-avatar">G</div>
      <div>
        <p class="font-semibold leading-tight">Gadgetbook News</p>
        <p class="text-xs text-gray-500">Day ${news.day} ${isToday ? "&middot; <b>Today</b>" : ""} &middot; <i class="fa-solid fa-earth-asia"></i></p>
      </div>
      <div class="ml-auto">
        <span class="news-trend ${trendClass}"><i class="fa-solid ${trendIcon}"></i> ${brandTag}</span>
      </div>
    </div>
    <div class="fb-post-body">
      <p class="font-semibold">${news.headline}</p>
      <p class="text-sm text-gray-600 mt-1">${news.blurb}</p>
    </div>
    <div class="fb-post-actions">
      <button><i class="fa-regular fa-thumbs-up"></i> Like</button>
      <button><i class="fa-regular fa-comment"></i> Comment</button>
      <button><i class="fa-solid fa-share"></i> Share</button>
    </div>
  `;
  return post;
}

function renderPlaceholder(title, icon, subtitle) {
  const card = document.createElement("div");
  card.className = "fb-card text-center py-12";
  card.innerHTML = `
    <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-[#1877F2] text-2xl mb-4"><i class="fa-solid fa-${icon}"></i></div>
    <h3 class="text-xl mb-1">${title}</h3>
    <p class="text-sm text-gray-500 max-w-sm mx-auto">${subtitle}</p>
  `;
  return card;
}



/* =========================================================
 * 8. Next Day flow (regenerates listings + news)
 * ========================================================= */
async function advanceToNextDay() {
  const overlay = $("#loading-overlay");
  const nextDay = State.data.currentDay + 1;
  $("#loading-day-text").textContent = `Day ${nextDay}`;
  overlay.classList.remove("hidden");

  await delay(1500);

  State.data.currentDay = nextDay;
  generateDailyNews();                 // new news first so listings can apply its multiplier
  if (window.Repair) window.Repair.applyDayTickToRepairs(); // finish in-progress repairs
  if (window.Repair) window.Repair.applyDayTickToImeiUnlocks(); // finish IMEI tembak unlocks
  if (window.Repair) window.Repair.processImeiBlockRisk();      // 15% IMEI block roll on Ex-Inter inventory
  if (window.Batam) window.Batam.applyDayTickToCargo();         // Part 7: arrivals + customs deadlines
  if (window.RealEstate) window.RealEstate.processDailyRent();  // deduct rent / evict
  if (window.RealEstate) window.RealEstate.processWalkInSales();// instant-sell qualifying listings
  if (window.Selling) window.Selling.processNextDayOffers(); // roll inbound buyer offers
  if (window.Friends) window.Friends.processDailyActivity();    // Part 8: followed brokers post activity
  if (window.Market) window.Market.ensureDailyListings();
  State.data.marketView = { mode: "grid", selectedListingId: null };
  saveGame();
  renderAll();

  overlay.classList.add("hidden");
}

/* =========================================================
 * 9. Wire up event listeners + boot
 * ========================================================= */
function wireUpEvents() {
  $("#start-game-btn").addEventListener("click", startNewGame);
  $("#continue-game-btn").addEventListener("click", continueGame);
  $("#reset-game-btn").addEventListener("click", () => {
    if (confirm("Delete your saved game? This cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      $("#continue-game-btn").classList.add("hidden");
      $("#reset-game-btn").classList.add("hidden");
    }
  });
  $$(".sidebar-nav").forEach((btn) => {
    btn.addEventListener("click", () => setActivePage(btn.dataset.page));
  });
  $("#next-day-btn").addEventListener("click", advanceToNextDay);
}

document.addEventListener("DOMContentLoaded", () => {
  wireUpEvents();
  if (window.Notifications) window.Notifications.attachBellHandler();
  runSplash();
});

/* Expose for other modules and debugging */
window.FlippingTycoon = {
  State,
  saveGame,
  loadGame,
  renderActivePage,
  renderAll,
  setActivePage,
  formatRupiah,
  generateDailyNews,
  getNewsMultiplierForBrand,
};
