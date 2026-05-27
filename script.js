/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 1 — Foundations: state, save/load, screens, Next Day
 * ========================================================= */

/* ---------- 1. Constants ---------- */
const STORAGE_KEY = "flippingTycoon.save.v1";
const STARTING_BALANCES = {
  Mandiri: 5_000_000,
  BCA: 0,
  BNI: 0,
};

/* ---------- 2. Default State factory ---------- */
function createDefaultState() {
  return {
    meta: {
      version: 2,
      createdAt: Date.now(),
      lastSavedAt: null,
    },
    currentDay: 1,
    player: {
      name: "Player Broker",
      cash: 0, // physical cash on hand (not in any bank)
    },
    bankBalances: {
      Mandiri: STARTING_BALANCES.Mandiri,
      BCA: STARTING_BALANCES.BCA,
      BNI: STARTING_BALANCES.BNI,
    },
    bankHistories: {
      Mandiri: [],
      BCA: [],
      BNI: [],
    },
    inventory: [],     // [{ id, gadgetId, name, brand, specs, completeness, defect, buyPrice, buyDay, sourceBank }]
    marketPrices: {},  // reserved for future market trend tracking
    dailyListings: [], // current day's marketplace listings (5-8)
    lastListingDay: 0, // day on which dailyListings were generated
    marketView: { mode: "grid", selectedListingId: null }, // "grid" | "detail"
    activePage: "news-feed",
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
      // Shallow-merge with defaults so future fields don't break old saves.
      this.data = Object.assign(createDefaultState(), parsed);
      return true;
    } catch (err) {
      console.error("[FlippingTycoon] loadGame failed:", err);
      this.data = createDefaultState();
      return false;
    }
  },
};

// Convenience aliases per spec.
function saveGame() { return State.save(); }
function loadGame() { return State.load(); }

/* ---------- 4. Utility helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatRupiah(n) {
  if (typeof n !== "number") n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ---------- 5. Screen flow ---------- */
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
  enterApp();
}

function continueGame() {
  if (!loadGame()) {
    // No save / corrupted -> start fresh.
    State.reset();
  }
  enterApp();
}

function enterApp() {
  $("#home-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  // Make sure marketplace listings exist for the current day.
  if (window.Market) window.Market.ensureDailyListings();
  renderAll();
}

/* ---------- 6. Rendering ---------- */
function renderAll() {
  renderTopbar();
  renderSidebar();
  renderActivePage();
}

function renderTopbar() {
  $("#topbar-day").textContent = State.data.currentDay;
}

function renderSidebar() {
  $$(".sidebar-nav").forEach((btn) => {
    const page = btn.dataset.page;
    btn.classList.toggle("active", page === State.data.activePage);
  });
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
  // Force reflow to restart animation.
  void container.offsetWidth;
  container.classList.add("page-fade-in");

  switch (State.data.activePage) {
    case "news-feed":   container.appendChild(renderNewsFeedPage()); break;
    case "marketplace":
      if (window.Market) container.appendChild(window.Market.renderMarketplacePage());
      else container.appendChild(renderPlaceholderPage("Marketplace", "store", "Loading market..."));
      break;
    case "inventory":   container.appendChild(renderPlaceholderPage("Inventory", "boxes-stacked", "Track every gadget you own, condition, and cost basis.")); break;
    case "banking":     container.appendChild(renderPlaceholderPage("Banking", "building-columns", "Manage Mandiri, BCA, and BNI accounts. Transfers come next.")); break;
    default:            container.appendChild(renderNewsFeedPage());
  }
}

/* ----- News Feed (default landing page) ----- */
function renderNewsFeedPage() {
  const wrap = document.createElement("div");

  // Composer mock
  const composer = document.createElement("div");
  composer.className = "composer";
  composer.innerHTML = `
    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
      P
    </div>
    <input type="text" placeholder="What gadget are you flipping today, Player Broker?" />
    <button class="text-[#1877F2] text-xl"><i class="fa-regular fa-image"></i></button>
  `;
  wrap.appendChild(composer);

  // Day summary card
  const summary = document.createElement("div");
  summary.className = "fb-card";
  const totalBank =
    State.data.bankBalances.Mandiri +
    State.data.bankBalances.BCA +
    State.data.bankBalances.BNI;
  summary.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3>Day ${State.data.currentDay} Briefing</h3>
      <span class="text-xs text-gray-500">
        ${new Date().toLocaleDateString("en-US", { weekday: "long" })}
      </span>
    </div>
    <p class="text-sm text-gray-600 mb-3">
      Welcome back, Broker. Markets are open. Here is your morning summary.
    </p>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="p-3 bg-blue-50 rounded-lg">
        <p class="text-gray-500 text-xs">Total Bank</p>
        <p class="font-bold text-[#1877F2]">${formatRupiah(totalBank)}</p>
      </div>
      <div class="p-3 bg-amber-50 rounded-lg">
        <p class="text-gray-500 text-xs">Inventory Items</p>
        <p class="font-bold text-amber-600">${State.data.inventory.length}</p>
      </div>
      <div class="p-3 bg-emerald-50 rounded-lg">
        <p class="text-gray-500 text-xs">Mandiri</p>
        <p class="font-bold text-emerald-700">${formatRupiah(State.data.bankBalances.Mandiri)}</p>
      </div>
      <div class="p-3 bg-indigo-50 rounded-lg">
        <p class="text-gray-500 text-xs">BCA / BNI</p>
        <p class="font-bold text-indigo-700">${formatRupiah(State.data.bankBalances.BCA + State.data.bankBalances.BNI)}</p>
      </div>
    </div>
  `;
  wrap.appendChild(summary);

  // Sample "post"
  const post = document.createElement("div");
  post.className = "fb-post";
  post.innerHTML = `
    <div class="fb-post-header">
      <div class="fb-post-avatar">G</div>
      <div>
        <p class="font-semibold leading-tight">Gadgetbook News</p>
        <p class="text-xs text-gray-500">Day ${State.data.currentDay} &middot; <i class="fa-solid fa-earth-asia"></i></p>
      </div>
    </div>
    <div class="fb-post-body">
      The market opens with mixed signals today. Rumor has it a new flagship
      launch is shaking up second-hand prices. Smart brokers are checking
      <b>Marketplace</b> early.
    </div>
    <div class="fb-post-actions">
      <button><i class="fa-regular fa-thumbs-up"></i> Like</button>
      <button><i class="fa-regular fa-comment"></i> Comment</button>
      <button><i class="fa-solid fa-share"></i> Share</button>
    </div>
  `;
  wrap.appendChild(post);

  return wrap;
}

/* ----- Generic placeholder for not-yet-implemented pages ----- */
function renderPlaceholderPage(title, icon, subtitle) {
  const card = document.createElement("div");
  card.className = "fb-card text-center py-12";
  card.innerHTML = `
    <div class="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-[#1877F2] text-2xl mb-4">
      <i class="fa-solid fa-${icon}"></i>
    </div>
    <h3 class="text-xl mb-1">${title}</h3>
    <p class="text-sm text-gray-500 max-w-sm mx-auto">${subtitle}</p>
    <p class="text-xs text-gray-400 mt-4">Coming in a later part.</p>
  `;
  return card;
}

/* ---------- 7. Next Day flow ---------- */
async function advanceToNextDay() {
  const overlay = $("#loading-overlay");
  const nextDay = State.data.currentDay + 1;
  $("#loading-day-text").textContent = `Day ${nextDay}`;
  overlay.classList.remove("hidden");

  await delay(1500);

  State.data.currentDay = nextDay;
  // Regenerate today's marketplace listings.
  if (window.Market) window.Market.ensureDailyListings();
  // Reset detail view so the user lands on the fresh grid.
  State.data.marketView = { mode: "grid", selectedListingId: null };
  saveGame();
  renderAll();

  overlay.classList.add("hidden");
}

/* ---------- 8. Wire up event listeners ---------- */
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

/* ---------- 9. Boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  wireUpEvents();
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
};
