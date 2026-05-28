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
      version: 11,
      createdAt: Date.now(),
      lastSavedAt: null,
    },
    currentDay: 1,
    player: {
      name: "Player Broker",
      storeName: "Player Counter",
      cash: 0,
      followers: 0,
      reputation: 5.0,
      totalGadgetsSold: 0,
      startingCapital: 15_000_000,
      joinedDay: 1,
      bio: "Buy low, sell high. Toko broker gadget profesional di Gadgetbook Marketplace.",
      avatar: "P",
      avatarColor: "#1877f2",
    },
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
    salesHistory: [],                   // Part 9: finalized sale records (capped 200)
    staff: {                            // Part 9: hired employees & bulk operation log
      cs:   { hired: false, hiredOnDay: null, totalPaid: 0, autoAcceptThreshold: 95 },
      tech: { hired: false, hiredOnDay: null, totalPaid: 0 },
      bulkLog: [],
    },
    staffView:     { tab: "roster" },   // Part 9: staff page tab state
    analyticsView: {},                  // Part 9: analytics page state (reserved)
    lastSolvencyWarnDay: 0,             // Part 9: anti-spam guard for solvency alerts
    profilePosts: [],                   // Part 10: auto-posts from listings (capped 50)
    chatArchive: [],                    // Part 10: closed conversations for Messenger archive (capped 60)
    onboardingComplete: false,          // Part 10: gates the setup modal on first launch
    warehouse: [],                      // Part 11: secured stock (capacity 500)
    warehouseView: { activeTab: "stock" }, // Part 11
    wholesaleOrders: [],                // Part 11: open + in-transit B2B orders
    wholesaleHistory: [],               // Part 11: completed/cancelled orders log (capped 60)
    wholesaleView: { tab: "open" },     // Part 11
    lastWholesaleGenDay: 0,             // Part 11: last day bulk orders auto-generated
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
      // Persist any migration repairs immediately so a refresh doesn't
      // re-run the same fixups (and so future bug-reports show clean data).
      try {
        this.data.meta.lastSavedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) { /* non-fatal */ }
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
    if (version < 9) {
      if (!Array.isArray(this.data.salesHistory)) this.data.salesHistory = [];
      if (!this.data.staff) {
        this.data.staff = {
          cs:   { hired: false, hiredOnDay: null, totalPaid: 0, autoAcceptThreshold: 95 },
          tech: { hired: false, hiredOnDay: null, totalPaid: 0 },
          bulkLog: [],
        };
      } else {
        if (!this.data.staff.cs)   this.data.staff.cs   = { hired: false, hiredOnDay: null, totalPaid: 0, autoAcceptThreshold: 95 };
        if (!this.data.staff.tech) this.data.staff.tech = { hired: false, hiredOnDay: null, totalPaid: 0 };
        if (!Array.isArray(this.data.staff.bulkLog)) this.data.staff.bulkLog = [];
        if (typeof this.data.staff.cs.autoAcceptThreshold !== "number") this.data.staff.cs.autoAcceptThreshold = 95;
      }
      if (!this.data.staffView)     this.data.staffView     = { tab: "roster" };
      if (!this.data.analyticsView) this.data.analyticsView = {};
      if (typeof this.data.lastSolvencyWarnDay !== "number") this.data.lastSolvencyWarnDay = 0;
      // Backfill totalRepairCost on legacy inventory + listing snapshots.
      (this.data.inventory || []).forEach((it) => {
        if (typeof it.totalRepairCost !== "number") it.totalRepairCost = 0;
      });
      (this.data.activeListings || []).forEach((l) => {
        if (l.itemSnapshot && typeof l.itemSnapshot.totalRepairCost !== "number") {
          l.itemSnapshot.totalRepairCost = 0;
        }
      });
      this.data.meta.version = 9;
    }
    if (version < 10) {
      // Backfill profile fields onto existing player.
      if (!this.data.player) this.data.player = { name: "Player Broker", cash: 0 };
      const p = this.data.player;
      if (!p.storeName)                       p.storeName        = (p.name || "Player").split(/\s+/)[0] + " Counter";
      if (typeof p.followers          !== "number") p.followers          = 0;
      if (typeof p.reputation         !== "number") p.reputation         = 5.0;
      if (typeof p.totalGadgetsSold   !== "number") p.totalGadgetsSold   = (this.data.salesHistory || []).length;
      if (typeof p.startingCapital    !== "number") p.startingCapital    = 15_000_000;
      if (typeof p.joinedDay          !== "number") p.joinedDay          = 1;
      if (typeof p.bio                !== "string") p.bio                = "Buy low, sell high. Toko broker gadget profesional di Gadgetbook Marketplace.";
      if (!p.avatar)                  p.avatar                          = (p.name || "P").charAt(0).toUpperCase();
      if (!p.avatarColor)              p.avatarColor                    = "#1877f2";

      if (!Array.isArray(this.data.profilePosts)) this.data.profilePosts = [];
      if (!Array.isArray(this.data.chatArchive))  this.data.chatArchive  = [];
      if (typeof this.data.onboardingComplete !== "boolean") this.data.onboardingComplete = true; // legacy saves skip onboarding
      this.data.meta.version = 10;
    }
    if (version < 11) {
      if (!Array.isArray(this.data.warehouse))        this.data.warehouse        = [];
      if (!Array.isArray(this.data.wholesaleOrders))  this.data.wholesaleOrders  = [];
      if (!Array.isArray(this.data.wholesaleHistory)) this.data.wholesaleHistory = [];
      if (!this.data.warehouseView) this.data.warehouseView = { activeTab: "stock" };
      if (!this.data.wholesaleView) this.data.wholesaleView = { tab: "open" };
      if (typeof this.data.lastWholesaleGenDay !== "number") this.data.lastWholesaleGenDay = 0;
      // Backfill new logistics staff slot.
      if (this.data.staff && !this.data.staff.logistics) {
        this.data.staff.logistics = {
          hired: false,
          hiredOnDay: null,
          totalPaid: 0,
          totalCommission: 0,
          defaultPartner: "JNE",
        };
      }
      this.data.meta.version = 11;
    }

    /* ------------------------------------------------------------------
     * v12 — Part 16 hot-fix: repair legacy partnership / wholesale items
     * whose `defect` object was generated WITHOUT a `multiplier` field
     * and whose `completeness.type` was set to `undefined`. Those items
     * cause "Rp NaN" in the List-on-Marketplace modal because the price
     * formula multiplies by `defect.multiplier` (=undefined → NaN).
     *
     * We walk every container (inventory, warehouse, activeListings
     * snapshots) and run normalizeInventoryItem() on each so the saved
     * data is repaired in place, then re-saved.
     * ------------------------------------------------------------------ */
    if (version < 12) {
      let touched = 0;
      (this.data.inventory || []).forEach((it) => { if (normalizeInventoryItem(it)) touched++; });
      (this.data.warehouse || []).forEach((it) => { if (normalizeInventoryItem(it)) touched++; });
      (this.data.activeListings || []).forEach((l) => {
        if (l && l.itemSnapshot && normalizeInventoryItem(l.itemSnapshot)) touched++;
      });
      if (touched > 0) {
        console.log("[FlippingTycoon] Part 16 migration repaired", touched, "inventory item(s).");
      }
      this.data.meta.version = 12;
    }

    /* ------------------------------------------------------------------
     * v13 — Part 34 retroactive heal: re-walk every container with the
     * upgraded normalizeInventoryItem() so any item where buyPrice ended
     * up >= Suggested Market Price (the flat-allocation partnership bug)
     * gets its buyPrice clamped to basePrice * 0.75. Players who already
     * migrated to v12 still need this pass because the v12 normalizer
     * didn't yet have the buyPrice clamp.
     * ------------------------------------------------------------------ */
    if (version < 13) {
      let healed = 0;
      const inv = this.data.inventory || [];
      const wh  = this.data.warehouse || [];
      const al  = this.data.activeListings || [];
      inv.forEach((it) => { if (normalizeInventoryItem(it)) healed++; });
      wh.forEach((it)  => { if (normalizeInventoryItem(it)) healed++; });
      al.forEach((l)   => { if (l && l.itemSnapshot && normalizeInventoryItem(l.itemSnapshot)) healed++; });
      if (healed > 0) {
        console.log("[FlippingTycoon] Part 34 migration healed", healed, "item(s) — buyPrice >= suggested fixed.");
      }
      this.data.meta.version = 13;
    }
  },
};

/* =========================================================
 * Part 16 — Inventory item normalizer
 *
 * Idempotent: ensures every inventory item has the fields the
 * price math depends on (basePrice, completeness.multiplier,
 * defect.multiplier, specs). Looks up the master GADGET_DATABASE,
 * COMPLETENESS_OPTIONS, and DEFECT_OPTIONS to backfill correct
 * values. Falls back to safe BNIB defaults (1.0 / 1.0) if no
 * canonical match is found.
 *
 * Returns true if the item was mutated, false otherwise.
 * Called from the v12 save migration AND from any code path that
 * accepts items from outside (e.g. partnership purchase, wholesale
 * order fulfillment) so a future regression can't reach storage.
 * ========================================================= */
function normalizeInventoryItem(item) {
  if (!item || typeof item !== "object") return false;
  const GD = (window.GadgetData && window.GadgetData.GADGET_DATABASE) || [];
  const CO = (window.GadgetData && window.GadgetData.COMPLETENESS_OPTIONS) || [];
  const DO = (window.GadgetData && window.GadgetData.DEFECT_OPTIONS) || [];

  let dirty = false;
  const gadget = item.gadgetId ? GD.find((g) => g.id === item.gadgetId) : null;

  // basePrice
  const bp = Number(item.basePrice);
  if (!isFinite(bp) || bp <= 0) {
    const fromMaster = gadget ? Number(gadget.basePrice) : 0;
    const fromBuy    = Number(item.buyPrice) || 0;
    item.basePrice = fromMaster > 0 ? fromMaster : fromBuy;
    dirty = true;
  }

  // brand / icon / accent / year / name — backfill from master if missing
  if (gadget) {
    if (!item.brand)  { item.brand  = gadget.brand;  dirty = true; }
    if (!item.icon)   { item.icon   = gadget.icon;   dirty = true; }
    if (!item.accent) { item.accent = gadget.accent; dirty = true; }
    if (typeof item.year !== "number") { item.year = gadget.year; dirty = true; }
    if (!item.name)   { item.name   = gadget.model;  dirty = true; }
  }

  // specs (must be a real object with ram/rom/color)
  if (!item.specs || typeof item.specs !== "object" || !item.specs.ram || !item.specs.rom) {
    item.specs = gadget && gadget.specs
      ? { ...gadget.specs }
      : { ram: "8GB", rom: "128GB", color: "Black" };
    dirty = true;
  }

  // completeness — must have a numeric .multiplier
  if (!item.completeness || typeof item.completeness !== "object" ||
      !isFinite(Number(item.completeness.multiplier)) || Number(item.completeness.multiplier) <= 0) {
    const fallback = CO.find((c) => c.short === "Fullset") || CO[0] ||
      { type: "Fullset", short: "Fullset", multiplier: 1.0 };
    // Try to preserve the existing `short` label if it was set; otherwise use Fullset.
    const matchByShort = item.completeness && item.completeness.short
      ? CO.find((c) => c.short === item.completeness.short)
      : null;
    const base = matchByShort || fallback;
    item.completeness = { ...base, multiplier: Number(base.multiplier) || 1.0 };
    dirty = true;
  } else if (!item.completeness.type) {
    // Fix the cosmetic `undefined` type label without touching the multiplier.
    const match = CO.find((c) => c.short === item.completeness.short);
    item.completeness.type = (match && match.type) || item.completeness.short || "Fullset";
    dirty = true;
  }

  // defect — must have a numeric .multiplier (THE Rp NaN root cause)
  if (!item.defect || typeof item.defect !== "object" ||
      !isFinite(Number(item.defect.multiplier)) || Number(item.defect.multiplier) <= 0) {
    const fallback = DO.find((d) => d.short === "Mulus") || DO[0] ||
      { type: "Mulus / No Minus", short: "Mulus", multiplier: 1.0, severity: 0 };
    const matchByShort = item.defect && item.defect.short
      ? DO.find((d) => d.short === item.defect.short)
      : null;
    const base = matchByShort || fallback;
    item.defect = { ...base, multiplier: Number(base.multiplier) || 1.0 };
    dirty = true;
  }

  // Misc safe defaults that downstream code relies on
  if (typeof item.totalRepairCost !== "number") { item.totalRepairCost = 0; dirty = true; }
  if (typeof item.isExInter      !== "boolean") { item.isExInter = false;   dirty = true; }
  if (typeof item.imeiStatus     === "undefined"){ item.imeiStatus = item.isExInter ? "ok" : null; dirty = true; }

  /* -----------------------------------------------------------------
   * Part 34 — Margin sanity heal (retroactive)
   *
   * Sweep every item: if buyPrice ended up >= the item's own Suggested
   * Market Price (which can never make sense for a wholesale purchase
   * and was caused by the old "totalCost / quantity" allocation bug),
   * forcibly reset buyPrice to basePrice * 0.75 — the standard 25%
   * wholesale discount — so the player immediately sees a positive
   * Gross Margin in Inventory.
   *
   * Important: this runs AFTER all the other normalization above, so
   * basePrice / completeness.multiplier / defect.multiplier are all
   * guaranteed valid by this point. computeCurrentMarketPrice can be
   * called safely.
   * ----------------------------------------------------------------- */
  const buyPriceNum = Number(item.buyPrice) || 0;
  const basePriceNum = Number(item.basePrice) || 0;
  if (buyPriceNum > 0 && basePriceNum > 0 && window.Market &&
      typeof window.Market.computeCurrentMarketPrice === "function") {
    const suggested = Number(window.Market.computeCurrentMarketPrice(item)) || 0;
    if (suggested > 0 && buyPriceNum >= suggested) {
      const healed = Math.round(basePriceNum * 0.75 / 50_000) * 50_000;
      if (healed > 0 && healed !== buyPriceNum) {
        item.buyPrice = Math.max(50_000, healed);
        dirty = true;
      }
    }
  }

  return dirty;
}

function saveGame() { return State.save(); }
function loadGame() { return State.load(); }

/* ---------- 4. Utility helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatRupiah(n) {
  // Part 15 — never render "Rp NaN". Coerce, fall back to 0 for any
  // non-finite value (NaN, Infinity, undefined, null, "", "abc", ...).
  let v = Number(n);
  if (!isFinite(v) || isNaN(v)) v = 0;
  return "Rp " + v.toLocaleString("id-ID");
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
  // Don't wipe the existing save until the player actually submits the onboarding
  // form. If they click "Back", we want to return them to the home screen with their
  // previous save intact.
  showOnboardingModal();
}

function continueGame() {
  if (!loadGame()) State.reset();
  if (!State.data.todayNews) generateDailyNews();
  // Legacy saves are auto-marked onboardingComplete during migration.
  if (!State.data.onboardingComplete) {
    showOnboardingModal();
    return;
  }
  enterApp();
}

/* ---------- Onboarding modal (Part 10) ---------- */
function showOnboardingModal() {
  const modal = $("#onboarding-modal");
  if (!modal) {
    // Fallback: skip onboarding if the modal is missing (shouldn't happen).
    State.reset();
    if (!State.data.todayNews) generateDailyNews();
    enterApp();
    return;
  }
  $("#home-screen").classList.add("hidden");
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  // Reset values
  const nameInput  = modal.querySelector("#ob-name");
  const storeInput = modal.querySelector("#ob-store");
  const errEl      = modal.querySelector("#ob-error");
  const submitBtn  = modal.querySelector("#ob-submit");
  const cancelBtn  = modal.querySelector("#ob-cancel");
  const capButtons = modal.querySelectorAll(".ob-capital-option");

  nameInput.value  = "";
  storeInput.value = "";
  errEl.textContent = "";

  // Default capital selection: 10M
  let chosenCapital = 10_000_000;
  capButtons.forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.capital) === chosenCapital);
    btn.onclick = () => {
      chosenCapital = Number(btn.dataset.capital);
      capButtons.forEach((b) => b.classList.toggle("selected", b === btn));
    };
  });

  // Auto-suggest store name as the user types player name.
  let storeManuallyEdited = false;
  storeInput.addEventListener("input", () => { storeManuallyEdited = !!storeInput.value.trim(); }, { once: false });
  nameInput.addEventListener("input", () => {
    if (!storeManuallyEdited) {
      const first = (nameInput.value.trim().split(/\s+/)[0] || "").trim();
      storeInput.value = first ? first + " Counter" : "";
    }
  });

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    // Existing save (if any) is still intact since we deferred reset to submit.
    showHomeScreen();
  };

  submitBtn.onclick = () => {
    errEl.textContent = "";
    const playerName  = nameInput.value.trim();
    const storeName   = storeInput.value.trim() || (playerName.split(/\s+/)[0] + " Counter");
    if (!playerName) { errEl.textContent = "Nama Player wajib diisi."; return; }
    if (playerName.length < 2) { errEl.textContent = "Nama Player minimal 2 karakter."; return; }
    if (storeName.length < 2)  { errEl.textContent = "Nama Toko minimal 2 karakter.";  return; }
    if (!window.Profile) { errEl.textContent = "Profile module belum siap, coba lagi."; return; }

    // Commit: now wipe any prior save & start fresh.
    State.reset();
    if (!State.data.todayNews) generateDailyNews();
    window.Profile.applyOnboarding({ playerName, storeName, startingCapital: chosenCapital });
    State.data.onboardingComplete = true;
    saveGame();

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    enterApp();
  };
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
  if (window.Messenger) window.Messenger.refreshUnreadBadge();
  // Dynamic avatar in topbar profile button + sidebar profile row.
  const p = State.data.player || {};
  const tbAv = document.querySelector("#topbar-avatar");
  if (tbAv) {
    tbAv.textContent = p.avatar || (p.name ? p.name.charAt(0).toUpperCase() : "P");
    tbAv.style.background = p.avatarColor || "linear-gradient(135deg,#fb923c,#ec4899)";
  }
  const sbAv = document.querySelector("#sidebar-profile-avatar");
  if (sbAv) {
    sbAv.textContent = p.avatar || (p.name ? p.name.charAt(0).toUpperCase() : "P");
    sbAv.style.background = p.avatarColor || "linear-gradient(135deg,#fb923c,#ec4899)";
  }
  const sbName = document.querySelector("#sidebar-profile-name");
  if (sbName) sbName.textContent = p.name || "Player Broker";

  // Part 20 — Reputation badge in topbar
  const repMount = document.querySelector("#topbar-rep-mount");
  if (repMount && window.Reputation) {
    repMount.innerHTML = "";
    repMount.appendChild(window.Reputation.renderReputationBadge());
  }
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
  // Part 11: fulfillable bulk orders badge on Wholesale link
  const wsBtn = document.querySelector('.sidebar-nav[data-page="wholesale"]');
  if (wsBtn) {
    let badge = wsBtn.querySelector(".sidebar-badge");
    const ready = window.Wholesale ? window.Wholesale.fulfillableOpenCount() : 0;
    if (ready > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "sidebar-badge";
        wsBtn.appendChild(badge);
      }
      badge.textContent = ready;
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
    case "analytics":
      container.appendChild(window.Analytics ? window.Analytics.renderAnalyticsPage() : renderPlaceholder("Performance Analytics", "chart-line", "Loading..."));
      break;
    case "staff":
      container.appendChild(window.Staff ? window.Staff.renderStaffRoomPage() : renderPlaceholder("Staff Room", "user-tie", "Loading..."));
      break;
    case "warehouse":
      container.appendChild(window.Warehouse ? window.Warehouse.renderWarehousePage() : renderPlaceholder("Warehouse", "warehouse", "Loading..."));
      break;
    case "wholesale":
      container.appendChild(window.Wholesale ? window.Wholesale.renderWholesalePage() : renderPlaceholder("Wholesale", "truck-fast", "Loading..."));
      break;
    case "partnerships":
      container.appendChild(window.Partnerships ? window.Partnerships.renderPartnershipsPage() : renderPlaceholder("Partnership Hub", "handshake", "Loading..."));
      break;
    case "fjb":
      container.appendChild(window.FJB ? window.FJB.renderFJBPage() : renderPlaceholder("Grup FJB", "people-group", "Loading..."));
      break;
    case "profile":
      container.appendChild(window.Profile ? window.Profile.renderProfilePage() : renderPlaceholder("Profile", "user", "Loading..."));
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
  const composerAvatarColor = (s.player && s.player.avatarColor) || "#1877f2";
  const composerAvatar = (s.player && s.player.avatar) || (s.player && s.player.name ? s.player.name.charAt(0).toUpperCase() : "P");
  const safeName = String(s.player && s.player.name ? s.player.name : "Player Broker")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeAvatar = String(composerAvatar).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  composer.innerHTML = `
    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style="background:${composerAvatarColor}">${safeAvatar}</div>
    <input type="text" placeholder="What gadget are you flipping today, ${safeName}?" />
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

/**
 * Part 9 — Tax/Admin Alert
 *
 * Estimate Mandiri-only debits that the next Next-Day will deduct
 * (rent + staff salaries). Returns null if no warning needed, otherwise
 * an object describing the shortfall.
 */
function estimateNextDayMandiriDebits() {
  const s = State.data;
  let total = 0;
  const items = [];
  // Storefront rent
  if (s.realEstate && s.realEstate.rented && s.realEstate.store) {
    const r = s.realEstate.store.dailyRent || 0;
    total += r;
    items.push({ label: "Sewa toko (" + s.realEstate.store.name + ")", amount: r });
  }
  // Staff salaries
  if (window.Staff && s.staff) {
    Object.keys(window.Staff.STAFF_META).forEach((role) => {
      if (s.staff[role] && s.staff[role].hired) {
        const meta = window.Staff.STAFF_META[role];
        total += meta.dailySalary;
        items.push({ label: "Gaji " + meta.title, amount: meta.dailySalary });
      }
    });
  }
  // Customs fines that hit deadline next day
  (s.batamCargo || []).forEach((cargo) => {
    if (cargo.status === "customs-hold" && cargo.customs && !cargo.customs.paid) {
      const remaining = cargo.customs.deadlineDay - s.currentDay;
      if (remaining <= 1) {
        // Note: customs gets confiscated rather than auto-debited, but warn anyway.
        items.push({ label: "Customs deadline cargo " + cargo.id.slice(-4), amount: cargo.customs.fineAmount, note: "akan disita kalau tidak dibayar" });
      }
    }
  });

  const mandiri = s.bankBalances.Mandiri || 0;
  const projected = mandiri - total;
  if (projected < 0 && total > 0) {
    return { mandiri, total, projected, items };
  }
  return null;
}

function showSolvencyAlert(report) {
  if (!window.Notifications) return;
  const fmt = (n) => "Rp " + n.toLocaleString("id-ID");
  const breakdown = report.items.map((i) => `${i.label}: ${fmt(i.amount)}`).join(" + ");
  window.Notifications.add({
    type: "warning",
    title: "Solvency Warning: Mandiri Bisa Minus!",
    message: `Estimasi debit Next Day ${fmt(report.total)} (${breakdown}) melebihi saldo Mandiri ${fmt(report.mandiri)}. Risiko: gaji staf walkout, sewa eviction, atau debt collector. Top-up dulu sebelum lanjut.`,
    actionPage: "banking",
    actor: "Treasury",
    icon: "triangle-exclamation",
  });
}

async function advanceToNextDay() {
  // Tax/Admin Alert pre-flight: warn if Mandiri can't cover the day's debits.
  const report = estimateNextDayMandiriDebits();
  if (report && State.data.lastSolvencyWarnDay !== State.data.currentDay) {
    showSolvencyAlert(report);
    State.data.lastSolvencyWarnDay = State.data.currentDay;
    saveGame();
    const fmt = (n) => "Rp " + n.toLocaleString("id-ID");
    const proceed = confirm(
      "⚠️ Mandiri akan minus Next Day!\n\n" +
      "Estimasi debit: " + fmt(report.total) + "\n" +
      "Saldo Mandiri:  " + fmt(report.mandiri) + "\n" +
      "Proyeksi:       " + fmt(report.projected) + "\n\n" +
      "Risiko: staff walkout, eviction toko, debt collector.\n" +
      "Tetap lanjut Next Day?"
    );
    if (!proceed) return;
  }

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
  if (window.Staff) window.Staff.processDailySalaries();        // Part 9: deduct salaries / walkout
  if (window.RealEstate) window.RealEstate.processWalkInSales();// instant-sell qualifying listings
  if (window.Selling) window.Selling.processNextDayOffers(); // roll inbound buyer offers
  if (window.Staff) window.Staff.processAutoAcceptOffers();     // Part 9: CS auto-accept fair offers
  if (window.Wholesale) window.Wholesale.processDailyShipments();      // Part 11: deliver in-transit B2B orders
  if (window.Wholesale) window.Wholesale.expireOpenOrders();            // Part 11: drop expired open orders
  if (window.Staff && window.Staff.processAutoAcceptWholesale) window.Staff.processAutoAcceptWholesale(); // Part 11: HoL auto-accept fulfillable orders
  if (window.Wholesale) window.Wholesale.generateDailyOrders();         // Part 11: spawn fresh bulk orders for the new day
  if (window.Friends) window.Friends.processDailyActivity();    // Part 8: followed brokers post activity
  if (window.FJB) window.FJB.advanceDay();                      // Part 19: snipe stale BUs, expire WTBs, generate fresh posts
  if (window.Reputation) window.Reputation.advanceDay();        // Part 20: Suhu DM rolls for inbound resellers
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
    btn.addEventListener("click", () => {
      setActivePage(btn.dataset.page);
      // Auto-close the off-canvas mobile menu when an item is tapped
      if (btn.classList.contains("mobile-menu-link")) closeMobileMenu();
    });
  });
  $("#next-day-btn").addEventListener("click", advanceToNextDay);

  // ---- Part 13: Mobile hamburger menu ----
  const menuToggle = document.querySelector("#mobile-menu-toggle");
  const menuClose  = document.querySelector("#mobile-menu-close");
  const menuBg     = document.querySelector("#mobile-menu-overlay");
  if (menuToggle) menuToggle.addEventListener("click", openMobileMenu);
  if (menuClose)  menuClose.addEventListener("click", closeMobileMenu);
  if (menuBg)     menuBg.addEventListener("click", closeMobileMenu);
}

function openMobileMenu() {
  const panel   = document.querySelector("#mobile-menu-panel");
  const overlay = document.querySelector("#mobile-menu-overlay");
  if (!panel || !overlay) return;
  overlay.classList.remove("hidden");
  panel.classList.add("is-open");
  document.body.style.overflow = "hidden";
  // Sync header avatar/name with current profile
  const p = (State.data && State.data.profile) || {};
  const avEl = document.querySelector("#mobile-menu-avatar");
  const nmEl = document.querySelector("#mobile-menu-name");
  if (avEl) {
    const initial = (p.name || "P").charAt(0).toUpperCase();
    avEl.textContent = initial;
  }
  if (nmEl) nmEl.textContent = p.name || "Player Broker";
}

function closeMobileMenu() {
  const panel   = document.querySelector("#mobile-menu-panel");
  const overlay = document.querySelector("#mobile-menu-overlay");
  if (!panel || !overlay) return;
  overlay.classList.add("hidden");
  panel.classList.remove("is-open");
  document.body.style.overflow = "";
}

/* =========================================================
 * Part 14 — Dark Mode
 * ========================================================= */
const THEME_KEY = "ft-theme";

function initDarkMode() {
  // Honor previously saved preference; otherwise fall back to OS.
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  setTheme(theme, /*persist*/ false);

  // Topbar button
  const topBtn = document.querySelector("#topbar-darkmode-btn");
  if (topBtn) topBtn.addEventListener("click", toggleTheme);

  // Hamburger menu row toggle
  const menuToggle = document.querySelector("#mobile-darkmode-toggle");
  if (menuToggle) {
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTheme();
    });
  }
}

function getCurrentTheme() {
  return document.body.classList.contains("dark") ? "dark" : "light";
}

function toggleTheme() {
  setTheme(getCurrentTheme() === "dark" ? "light" : "dark", true);
}

function setTheme(theme, persist) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("dark", isDark);
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  // Sync the topbar icon (sun when dark, moon when light)
  const icon = document.querySelector("#topbar-darkmode-icon");
  if (icon) {
    icon.classList.toggle("fa-moon", !isDark);
    icon.classList.toggle("fa-sun", isDark);
  }
}

/* =========================================================
 * Part 14 — PWA Service Worker registration
 * ========================================================= */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // file:// won't work for service workers; skip in that case.
  if (location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("service-worker.js")
      .then((reg) => console.log("[SW] registered:", reg.scope))
      .catch((err) => console.warn("[SW] registration failed:", err));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Part 14: PWA service worker
  registerServiceWorker();
  // Part 14: Dark mode init + wire toggles
  initDarkMode();

  wireUpEvents();
  if (window.Notifications) window.Notifications.attachBellHandler();
  if (window.Messenger) window.Messenger.attachButtonHandler();
  // Topbar profile button → jump to Profile page.
  const topbarProfileBtn = document.querySelector("#topbar-profile-btn");
  if (topbarProfileBtn) {
    topbarProfileBtn.addEventListener("click", () => setActivePage("profile"));
  }
  // Sidebar profile row → jump to Profile page (in addition to dedicated nav button).
  const sbRow = document.querySelector("#sidebar-profile-row");
  if (sbRow) sbRow.addEventListener("click", () => setActivePage("profile"));
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
  // Part 16 — exposed so generators (partnerships, wholesale, batam,
  // etc.) can normalize fresh items before they hit storage.
  normalizeInventoryItem,
};
