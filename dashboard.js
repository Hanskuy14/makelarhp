/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Seller Dashboard & Daily Financial Recap
 *
 * Adds an e-commerce "Seller Center" to the Ruko/Store tab and a
 * receipt-style Daily Financial Recap modal to the Next Day flow.
 *
 * Public API: window.Dashboard
 *   - renderSellerDashboard()   -> HTMLElement (injected into Real Estate page)
 *   - onSaleRecorded(sale)      -> hook from Analytics.recordSale (ratings + revenue)
 *   - processDailyFinances()    -> hook from advanceToNextDay (builds recap, charges ads)
 *   - showRecapModal()          -> hook from advanceToNextDay (renders the recap modal)
 *   - updateAdPerformance()     -> recompute traffic/conversion from active ad tier
 *   - setAdBudget(tier)         -> player allocates a daily marketing budget
 *   - getAdSaleRateBonus()      -> walk-in sale-rate bonus from active ad tier
 *   - getHaggleResistanceBonus()-> chance buyers skip aggressive haggling
 *
 * Strictly Vanilla JS. All currency rendered with IDR (Rp) formatting.
 * ========================================================= */

(function () {
  /* ---------- shared helpers (match the rest of the codebase) ---------- */
  function S() { return window.FlippingTycoon.State.data; }
  function fmt(n) {
    if (window.FlippingTycoon && window.FlippingTycoon.formatRupiah) {
      return window.FlippingTycoon.formatRupiah(n);
    }
    if (window.Market && window.Market.formatRupiah) return window.Market.formatRupiah(n);
    let v = Number(n);
    if (!isFinite(v)) v = 0;
    return "Rp " + v.toLocaleString("id-ID");
  }
  function saveGame() { return window.FlippingTycoon.saveGame(); }
  function toast(msg, type) {
    if (window.FlippingTycoon && window.FlippingTycoon.showToast) {
      window.FlippingTycoon.showToast(msg, type);
    }
  }
  function esc(raw) {
    return String(raw == null ? "" : raw)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* =========================================================
   * Config
   * ========================================================= */
  const RATING_TARGET = 1500;        // Star Seller / VIP milestone
  const DEFAULT_SHOP_NAME = "Toko FDS";

  /* Marketing budget ladder. `costPerDay` is debited from Mandari each
   * Next Day. `saleRateBonus` is added to the Ruko walk-in sale rate.
   * `haggleResistance` is the chance a buyer accepts the asking price
   * without haggling aggressively (consumed by the Selling module). */
  const AD_TIERS = [
    {
      tier: 0, key: "off", label: "Tanpa Iklan", costPerDay: 0,
      saleRateBonus: 0.00, haggleResistance: 0.00,
      icon: "ban", accent: "#94a3b8",
      blurb: "Organik aja. Konversi apa adanya.",
    },
    {
      tier: 1, key: "basic", label: "Basic Boost", costPerDay: 50_000,
      saleRateBonus: 0.10, haggleResistance: 0.10,
      icon: "bullhorn", accent: "#3b82f6",
      blurb: "Promo ringan. +10% kecepatan jual, sedikit lebih sedikit nego.",
    },
    {
      tier: 2, key: "growth", label: "Growth Ads", costPerDay: 150_000,
      saleRateBonus: 0.25, haggleResistance: 0.25,
      icon: "rocket", accent: "#8b5cf6",
      blurb: "Iklan terarah. +25% kecepatan jual, lebih banyak buyer serius.",
    },
    {
      tier: 3, key: "aggressive", label: "Flagship Campaign", costPerDay: 500_000,
      saleRateBonus: 0.50, haggleResistance: 0.45,
      icon: "fire", accent: "#f59e0b",
      blurb: "Gas pol. +50% kecepatan jual, mayoritas buyer gak nawar sadis.",
    },
  ];

  /* =========================================================
   * State (idempotent self-heal — mirrors the createDefaultState
   * block + the v18 migration so this module is safe even if it
   * loads before a save is migrated).
   * ========================================================= */
  function ensureState() {
    const s = S();
    if (!s.ecommerce || typeof s.ecommerce !== "object") {
      s.ecommerce = {};
    }
    const e = s.ecommerce;
    if (typeof e.shopName !== "string" || !e.shopName.trim()) e.shopName = DEFAULT_SHOP_NAME;
    if (typeof e.ratings !== "number") e.ratings = 0;
    if (typeof e.ratingTarget !== "number") e.ratingTarget = RATING_TARGET;
    if (typeof e.starSeller !== "boolean") e.starSeller = false;
    if (typeof e.activeAdBudget !== "number") e.activeAdBudget = 0;
    if (typeof e.adTier !== "number") e.adTier = 0;
    if (typeof e.dailyRevenue !== "number") e.dailyRevenue = 0;
    if (typeof e.dailyExpenses !== "number") e.dailyExpenses = 0;
    if (typeof e.dailyFees !== "number") e.dailyFees = 0;
    if (typeof e.salesToday !== "number") e.salesToday = 0;
    if (typeof e.profileViewsToday !== "number") e.profileViewsToday = 0;
    if (typeof e.conversionRate !== "number") e.conversionRate = 0;
    if (typeof e.totalAdSpend !== "number") e.totalAdSpend = 0;
    if (typeof e.lastRecapDay !== "number") e.lastRecapDay = 0;
    if (!e.lastRecap || typeof e.lastRecap !== "object") e.lastRecap = null;
    // Part 38 — online E-commerce auto-sell engine.
    // dailySalesReport: rows for the day being processed (built by
    //   processEcommerceSales, surfaced on the recap + dashboard).
    // lastEcommerceReport: snapshot of the most recent closed day.
    if (!Array.isArray(e.dailySalesReport)) e.dailySalesReport = [];
    if (!Array.isArray(e.lastEcommerceReport)) e.lastEcommerceReport = [];
    return e;
  }

  function tierMeta(tier) {
    return AD_TIERS.find((t) => t.tier === tier) || AD_TIERS[0];
  }

  /* =========================================================
   * Ad budget allocation
   * ========================================================= */
  function setAdBudget(tier) {
    const e = ensureState();
    const meta = tierMeta(Number(tier) || 0);
    e.adTier = meta.tier;
    e.activeAdBudget = meta.costPerDay;
    updateAdPerformance(true);
    saveGame();
    if (meta.tier === 0) {
      toast("Iklan dimatikan — kembali ke trafik organik.", "info");
    } else {
      toast(`📣 ${meta.label} aktif — ${fmt(meta.costPerDay)}/hari (ditagih tiap Next Day).`, "success");
    }
    return e.adTier;
  }

  /* Sale-rate bonus consumed by RealEstate.processWalkInSales(). */
  function getAdSaleRateBonus() {
    const e = ensureState();
    return tierMeta(e.adTier).saleRateBonus || 0;
  }

  /* Chance (0..1) a buyer skips aggressive haggling. Optional hook for
   * the Selling module's offer generator. */
  function getHaggleResistanceBonus() {
    const e = ensureState();
    return tierMeta(e.adTier).haggleResistance || 0;
  }

  /* =========================================================
   * updateAdPerformance()
   *
   * Recomputes the mock Traffic & Conversion metrics from the active
   * ad tier, the player's rating standing, and how many sales closed
   * today. Cheap + deterministic-ish (small RNG band) so the dashboard
   * always has fresh-looking numbers.
   * ========================================================= */
  function updateAdPerformance(rollTraffic) {
    const e = ensureState();
    const meta = tierMeta(e.adTier);

    // (Re)roll the day's profile views only when explicitly asked (new
    // day / ad-tier change) or when we have none yet. During the day we
    // keep views STABLE and only recompute conversion, so the tile
    // doesn't jump on every single sale.
    if (rollTraffic || !e.profileViewsToday) {
      const ratingFactor = 1 + Math.min(1.5, e.ratings / 1000); // up to +150%
      const base = 40 * ratingFactor;
      // Each ad tier multiplies reach. Tier 0 = x1, tier 3 ~ x4.
      const adMultiplier = 1 + meta.tier * 1.0 + meta.saleRateBonus;
      const noise = 0.85 + Math.random() * 0.3; // +/- 15%
      e.profileViewsToday = Math.max(1, Math.round(base * adMultiplier * noise));
    }
    // Views can never trail actual sales (keeps conversion <= 100%).
    if (e.salesToday > e.profileViewsToday) e.profileViewsToday = e.salesToday;

    // Conversion = sales today / views, clamped to 100%. With no sales yet
    // we show a plausible projected rate based on the active ad tier.
    if (e.profileViewsToday > 0 && e.salesToday > 0) {
      const realConv = (e.salesToday / e.profileViewsToday) * 100;
      e.conversionRate = Number(Math.min(100, realConv).toFixed(1));
    } else if (e.profileViewsToday > 0) {
      e.conversionRate = Number((2 + meta.tier * 1.5).toFixed(1)); // projected
    } else {
      e.conversionRate = 0;
    }
    return { views: e.profileViewsToday, conversion: e.conversionRate };
  }

  /* =========================================================
   * grantRatings(n)
   *
   * Adds positive ratings and trips the Star Seller milestone exactly
   * once when crossing RATING_TARGET. Per-sale gains are silent; only
   * the milestone fires a toast + notification.
   * ========================================================= */
  function grantRatings(n) {
    const e = ensureState();
    const add = Math.max(0, Math.round(Number(n) || 0));
    if (add === 0) return;
    const before = e.ratings;
    e.ratings += add;

    if (!e.starSeller && before < e.ratingTarget && e.ratings >= e.ratingTarget) {
      e.starSeller = true;
      toast(`⭐ STAR SELLER unlocked! ${e.shopName} tembus ${e.ratingTarget.toLocaleString("id-ID")} rating positif.`, "success");
      if (window.Notifications) {
        window.Notifications.add({
          type: "success",
          title: "Star Seller / VIP Unlocked!",
          message: `${e.shopName} resmi jadi Star Seller setelah ${e.ratings.toLocaleString("id-ID")} rating positif. Badge VIP aktif & trafik naik.`,
          actionPage: "real-estate",
          actor: "Netbook Marketplace",
          icon: "award",
        });
      }
      // Small reputation kicker for hitting the milestone.
      if (window.Reputation && window.Reputation.applyDelta) {
        window.Reputation.applyDelta(10, "Star Seller milestone");
      }
    }
  }

  /* =========================================================
   * onSaleRecorded(sale)
   *
   * Central hook fired from Analytics.recordSale() for EVERY sale type
   * (walk-in, offer, auto-accept, branch, corporate, fjb, wa-vip,
   * wholesale). Accumulates the day's gross revenue + platform fees and
   * grants customer ratings.
   * ========================================================= */
  function onSaleRecorded(sale) {
    if (!sale) return;
    const e = ensureState();
    const price = Math.max(0, Number(sale.salePrice) || 0);
    const fee = Math.max(0, Number(sale.feePaid) || 0);

    e.dailyRevenue += price;
    e.dailyFees += fee;
    e.salesToday += 1;

    // Ratings: +1 for any closed sale, +1 bonus for a premium ticket
    // (>= Rp 3jt) and +1 more for a high-value flagship sale (>= Rp 8jt).
    let stars = 1;
    if (price >= 3_000_000) stars += 1;
    if (price >= 8_000_000) stars += 1;
    grantRatings(stars);

    // Keep the conversion/traffic figures live as sales close.
    updateAdPerformance();
  }

  /* =========================================================
   * Expense helpers (display figures for the recap).
   * Rent + salaries are deducted by their own modules; here we only
   * MIRROR the amounts for the receipt. Ad spend is the one cost this
   * module actually charges.
   * ========================================================= */
  function computeStoreRent() {
    const s = S();
    if (s.realEstate && s.realEstate.rented && s.realEstate.store) {
      const monthly = Number(s.realEstate.store.monthlyRent != null ? s.realEstate.store.monthlyRent : s.realEstate.store.dailyRent) || 0;
      // Monthly billing: only mirrored on the receipt on the 30-day tick.
      return (s.currentDay % 30 === 0) ? monthly : 0;
    }
    return 0;
  }

  function computeSalaries() {
    const s = S();
    let total = 0;
    // Ruko staff (SPG / Teknisi / Sosmed)
    const ruko = (s.realEstate && s.realEstate.rukoStaff) || [];
    ruko.forEach((x) => { total += Number(x.salaryPerDay) || 0; });
    // HQ staff (CS / Tech / Head of Logistics)
    if (window.Staff && window.Staff.STAFF_META && s.staff) {
      Object.keys(window.Staff.STAFF_META).forEach((role) => {
        if (s.staff[role] && s.staff[role].hired) {
          total += Number(window.Staff.STAFF_META[role].dailySalary) || 0;
        }
      });
    }
    return total;
  }

  /* =========================================================
   * Part 38 — ONLINE E-COMMERCE ENGINE (the missing sales loop)
   *
   * Bridges:  Ad Budget  ->  Daily Traffic  ->  Conversion Rate
   *           ->  per-listing RNG roll  ->  Auto-Sell at Next Day.
   *
   * This is the ONLINE store (always open — no Ruko rental needed,
   * unlike RealEstate.processWalkInSales which is the PHYSICAL store).
   * It sells from the same `state.activeListings` pool, so an item can
   * only ever be sold through ONE channel: whichever pass removes it
   * first. All money/ratings/analytics flow through the SAME pipeline
   * the rest of the game uses (bank credit + Analytics.recordSale ->
   * Dashboard.onSaleRecorded), so there is no double-counting.
   * ========================================================= */

  /* Reference daily traffic that maps to a "pressure" of 1.0 in the
   * conversion math below. ~400 views/day = a healthy organic+basic store. */
  const TRAFFIC_BASELINE = 400;

  /**
   * calculateDailyTraffic(adBudget)
   *
   * Turns the player's daily marketing spend (Rp) into a number of
   * profile views for the day. Higher tiers buy exponentially more reach.
   * Ranges are randomized within each band so the dashboard feels alive.
   *
   *   No Ads (Rp 0)        ->   50 – 100 views   (organic only)
   *   Basic  (< Rp 150k)   ->  300 – 500 views
   *   Growth (< Rp 500k)   ->  700 – 1,200 views
   *   Flagship (>= Rp 500k)-> 1,000 – 2,000 views
   *
   * Store ratings add a small organic tailwind (trusted shops surface
   * more), capped at +40% so ads remain the dominant lever.
   */
  function calculateDailyTraffic(adBudget) {
    const budget = Math.max(0, Number(adBudget) || 0);
    let lo, hi;
    if (budget <= 0)            { lo = 50;   hi = 100;  }   // organic
    else if (budget < 150_000)  { lo = 300;  hi = 500;  }   // Basic Boost
    else if (budget < 500_000)  { lo = 700;  hi = 1200; }   // Growth Ads
    else                        { lo = 1000; hi = 2000; }   // Flagship Campaign

    const e = ensureState();
    // Trust tailwind: up to +40% organic reach from accumulated ratings.
    const ratingTailwind = 1 + Math.min(0.40, (e.ratings || 0) / 1500 * 0.40);

    const roll = lo + Math.random() * (hi - lo);
    return Math.max(1, Math.round(roll * ratingTailwind));
  }

  /**
   * calculateConversionRate(storeRating)
   *
   * Per-buyer purchase probability, driven by trust (ratings).
   *   base 1%  ->  scales linearly  ->  5% at >= 1,500 ratings.
   * Returned as a fraction (0.01 .. 0.05).
   */
  function calculateConversionRate(storeRating) {
    const r = Math.max(0, Number(storeRating) || 0);
    const progress = Math.min(1, r / RATING_TARGET); // 0..1 at 1500
    return 0.01 + progress * 0.04;                   // 1% .. 5%
  }

  /* Listings priced far above today's suggested market price convert
   * worse. Returns a multiplier applied to the per-item sell chance. */
  function priceAttractiveness(listing) {
    const suggested = Number(listing.suggestedPrice) || 0;
    const asking = Number(listing.askingPrice) || 0;
    if (suggested <= 0 || asking <= 0) return 1; // unknown -> neutral
    const ratio = asking / suggested;
    if (ratio <= 0.95) return 1.25; // underpriced — flies off the shelf
    if (ratio <= 1.10) return 1.00; // fair
    if (ratio <= 1.30) return 0.50; // a bit greedy
    if (ratio <= 1.50) return 0.20; // overpriced
    return 0.04;                    // way overpriced — basically won't sell
  }

  /**
   * processEcommerceSales()
   *
   * THE CORE FIX. Called from advanceToNextDay() (see script.js) AFTER
   * the ad budget is charged for the day. Steps:
   *   1. Compute the day's traffic from the active ad budget.
   *   2. Compute the base conversion rate from store ratings.
   *   3. For every eligible online listing, roll RNG against an
   *      effective per-item probability (conversion x traffic-pressure
   *      x price-attractiveness). On success the item is SOLD.
   *   4. Batch-commit: remove sold listings, credit the net proceeds to
   *      the bank, and push each sale through Analytics.recordSale so the
   *      existing pipeline grants ratings + accumulates daily revenue.
   *
   * Returns the day's sales report array (also stored on
   * `ecommerce.dailySalesReport`).
   */
  function processEcommerceSales() {
    const s = S();
    const e = ensureState();
    if (!Array.isArray(s.activeListings)) s.activeListings = [];

    // ---- 1. Traffic for the day (REAL number the dashboard will show) ----
    const traffic = calculateDailyTraffic(e.activeAdBudget);
    e.profileViewsToday = traffic;

    // ---- 2. Conversion rate from store trust ----
    const baseConv = calculateConversionRate(e.ratings);

    const report = [];
    const listings = s.activeListings;

    if (listings.length === 0) {
      // Nothing listed: show the projected conversion and bail.
      e.conversionRate = Number((baseConv * 100).toFixed(1));
      e.dailySalesReport = report;
      return report;
    }

    // Busier storefronts give each listing more exposure (more "shots").
    const trafficPressure = traffic / TRAFFIC_BASELINE;

    // Platform fee model — identical to walk-in sales for consistency.
    const receivingBank = "Mandari";
    const isPriority = !!(window.Banking && window.Banking.tierOf &&
      window.Banking.tierOf(s.bankBalances[receivingBank] || 0) === "priority");
    const baseFee = (window.Inventory && window.Inventory.platformFeeRate)
      ? window.Inventory.platformFeeRate()
      : (window.Repair && window.Repair.platformFeeRate ? window.Repair.platformFeeRate() : 0.05);
    const feeRate = isPriority ? 0 : baseFee;

    // ---- 3. Per-item conversion roll ----
    const soldIds = new Set();
    const soldListings = [];
    let grossSum = 0, feeSum = 0, netSum = 0;

    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      // Skip items currently mid-negotiation (a human buyer is on them).
      if (l.negotiationState === "offer-pending") continue;

      const chance = Math.min(
        0.90,
        baseConv * trafficPressure * priceAttractiveness(l)
      );
      if (Math.random() < chance) {
        const price = Math.max(0, Number(l.askingPrice) || 0);
        const fee = Math.round(price * feeRate);
        soldIds.add(l.listingId);
        soldListings.push(l);
        grossSum += price;
        feeSum   += fee;
        netSum   += (price - fee);
      }
    }

    if (soldListings.length === 0) {
      // Had stock + traffic but nothing converted today. Show real (0%)
      // conversion against the projected baseline so the tile isn't blank.
      e.conversionRate = 0;
      e.dailySalesReport = report;
      return report;
    }

    // ---- 4a. Single inventory mutation: drop all sold listings at once ----
    s.activeListings = s.activeListings.filter((l) => !soldIds.has(l.listingId));

    // ---- 4b. ONE batched bank credit + ledger entry ----
    s.bankBalances[receivingBank] = (s.bankBalances[receivingBank] || 0) + netSum;
    if (!Array.isArray(s.bankHistories[receivingBank])) s.bankHistories[receivingBank] = [];
    s.bankHistories[receivingBank].push({
      type: "CREDIT",
      amount: netSum,
      balanceAfter: s.bankBalances[receivingBank],
      description: `E-commerce batch: ${soldListings.length} unit terjual online` +
        (isPriority ? " (Priority - 0% fee)" : ` (after ${(baseFee * 100).toFixed(0)}% fee)`),
      category: "ecommerce-sale-batch",
      day: s.currentDay,
      ts: Date.now(),
    });

    // ---- 4c. Per-item: record sale (ratings + revenue + conversion flow
    //          through Analytics.recordSale -> Dashboard.onSaleRecorded) ----
    soldListings.forEach((l) => {
      const snap = l.itemSnapshot || {};
      const price = Math.max(0, Number(l.askingPrice) || 0);
      const fee = Math.round(price * feeRate);

      report.push({
        listingId: l.listingId,
        name: snap.name || "Unit",
        brand: snap.brand || "",
        salePrice: price,
        net: price - fee,
        day: s.currentDay,
      });

      if (window.Analytics && window.Analytics.recordSale) {
        window.Analytics.recordSale({
          saleType: "ecommerce",
          gadget: {
            gadgetId: snap.gadgetId, name: snap.name, brand: snap.brand,
            specs: snap.specs, completeness: snap.completeness, defect: snap.defect,
            isExInter: !!snap.isExInter, accent: snap.accent, icon: snap.icon,
          },
          purchaseCost: snap.buyPrice || 0,
          repairCost:   snap.totalRepairCost || 0,
          salePrice:    price,
          feePaid:      fee,
          buyer:        "Online Buyer (" + e.shopName + ")",
          receivingBank,
        });
      } else {
        // Defensive fallback if Analytics is unavailable: keep revenue +
        // ratings consistent so the dashboard still reflects the sale.
        e.dailyRevenue += price;
        e.dailyFees += fee;
        e.salesToday += 1;
        grantRatings(1);
      }
    });

    // Conversion = sales today / views (kept <= 100%). onSaleRecorded
    // already recomputes this, but set it explicitly for the no-Analytics path.
    if (e.profileViewsToday > 0) {
      e.conversionRate = Number(
        Math.min(100, (e.salesToday / e.profileViewsToday) * 100).toFixed(1)
      );
    }

    e.dailySalesReport = report;
    return report;
  }

  /* =========================================================
   * chargeAdBudget()
   *
   * Part 38 — extracted from processDailyFinances so the ad budget is
   * DEBITED FIRST (at the start of the Next Day transition, before sales
   * are calculated). If Mandari can't cover it, the campaign auto-pauses
   * (tier -> 0) so traffic this day reflects the un-funded state. The
   * computed charge is stashed on `ecommerce._adChargeToday` for the
   * recap to itemize — guaranteeing the budget is never charged twice.
   * ========================================================= */
  function chargeAdBudget() {
    const s = S();
    const e = ensureState();
    const adMeta = tierMeta(e.adTier);
    let adSpend = Math.round(e.activeAdBudget || 0);
    let adChargeNote = "";

    if (adSpend > 0) {
      const mandiri = s.bankBalances.Mandari || 0;
      if (mandiri >= adSpend) {
        s.bankBalances.Mandari -= adSpend;
        if (!Array.isArray(s.bankHistories.Mandari)) s.bankHistories.Mandari = [];
        s.bankHistories.Mandari.push({
          type: "DEBIT",
          amount: adSpend,
          balanceAfter: s.bankBalances.Mandari,
          description: `Marketing / Ads — ${adMeta.label} (Day ${s.currentDay})`,
          category: "ads",
          day: s.currentDay,
          ts: Date.now(),
        });
        e.totalAdSpend = (e.totalAdSpend || 0) + adSpend;
      } else {
        // Can't afford the campaign — auto-pause so the player isn't
        // silently overdrawn. No traffic boost this day.
        adChargeNote = "Saldo Mandari kurang — kampanye iklan di-pause.";
        adSpend = 0;
        e.adTier = 0;
        e.activeAdBudget = 0;
        if (window.Notifications) {
          window.Notifications.add({
            type: "warning",
            title: "Iklan Dipause",
            message: `Saldo Mandari gak cukup buat biaya iklan harian. Kampanye dimatikan otomatis.`,
            actionPage: "real-estate",
            actor: "Marketing",
            icon: "triangle-exclamation",
          });
        }
      }
    }

    e._adChargeToday = { adSpend, adChargeNote, label: adMeta.label };
    return e._adChargeToday;
  }

  /* =========================================================
   * processDailyFinances()
   *
   * Called from advanceToNextDay() near the END of the heavy block
   * (after all sale ticks ran, so dailyRevenue already includes the
   * walk-in + e-commerce batch). It:
   *   1. Snapshots the closing day's gross revenue + fees.
   *   2. Mirrors rent + salaries for the receipt.
   *   3. Reads the ad spend already charged by chargeAdBudget().
   *   4. Computes Net Profit and stores `ecommerce.lastRecap`.
   *   5. Resets the daily counters and simulates the new day's traffic.
   *
   * Returns the recap object (also stashed on state.ecommerce.lastRecap).
   * ========================================================= */
  function processDailyFinances() {
    const s = S();
    const e = ensureState();

    // After advanceToNextDay incremented currentDay, the day that just
    // ended is currentDay - 1, and we're about to start currentDay.
    const closedDay = Math.max(1, (s.currentDay || 1) - 1);
    const nextDay = s.currentDay || (closedDay + 1);

    const grossRevenue = Math.round(e.dailyRevenue || 0);
    const adminFees = Math.round(e.dailyFees || 0);
    const storeRent = computeStoreRent();
    const salaries = computeSalaries();

    // Ad budget was already debited this transition by chargeAdBudget().
    // Fall back to charging here if (defensively) it wasn't called.
    const charge = e._adChargeToday || chargeAdBudget();
    const adSpend = Math.round(charge.adSpend || 0);
    const adChargeNote = charge.adChargeNote || "";
    e._adChargeToday = null; // consume so it can't leak into another day

    const totalDeductions = adSpend + storeRent + salaries + adminFees;
    const netProfit = grossRevenue - totalDeductions;

    // Snapshot the online sales report for this closed day.
    const ecommerceReport = Array.isArray(e.dailySalesReport) ? e.dailySalesReport.slice() : [];
    const ecommerceUnits = ecommerceReport.length;
    const ecommerceNet = ecommerceReport.reduce((a, r) => a + (Number(r.net) || 0), 0);

    const recap = {
      shopName: e.shopName,
      closedDay,
      nextDay,
      grossRevenue,
      deductions: [
        { label: "Biaya Iklan (Ads)", amount: adSpend, icon: "bullhorn", note: adChargeNote },
        { label: "Sewa Toko", amount: storeRent, icon: "store" },
        { label: "Gaji Karyawan", amount: salaries, icon: "users" },
        { label: "Biaya Admin Platform", amount: adminFees, icon: "percent" },
      ],
      totalDeductions,
      netProfit,
      ratings: e.ratings,
      starSeller: e.starSeller,
      salesCount: e.salesToday,
      profileViews: e.profileViewsToday,
      conversionRate: e.conversionRate,
      // Part 38 — online channel breakdown for the receipt.
      ecommerceUnits,
      ecommerceNet,
    };

    e.lastRecap = recap;
    e.lastRecapDay = closedDay;
    e.lastEcommerceReport = ecommerceReport;

    // ---- Reset daily counters for the new day, then re-simulate traffic ----
    e.dailyRevenue = 0;
    e.dailyFees = 0;
    e.dailyExpenses = totalDeductions; // last-known daily burn (info only)
    e.salesToday = 0;
    e.dailySalesReport = [];
    updateAdPerformance(true);

    saveGame();
    return recap;
  }

  /* =========================================================
   * Daily Financial Recap modal (receipt style)
   * ========================================================= */
  function ensureModalRoot() {
    let root = document.getElementById("ft-recap-modal");
    if (root) return root;
    root = document.createElement("div");
    root.id = "ft-recap-modal";
    root.className = "hidden fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm items-center justify-center p-4";
    document.body.appendChild(root);
    return root;
  }

  function closeRecapModal() {
    const root = document.getElementById("ft-recap-modal");
    if (!root) return;
    root.classList.add("hidden");
    root.classList.remove("flex");
    root.innerHTML = "";
  }

  function showRecapModal() {
    const e = ensureState();
    const recap = e.lastRecap;
    if (!recap) return;

    const root = ensureModalRoot();
    const positive = recap.netProfit >= 0;
    const netColor = positive ? "text-emerald-600" : "text-rose-600";
    const netBg = positive ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-rose-50 dark:bg-rose-900/20";
    const netIcon = positive ? "fa-arrow-trend-up" : "fa-arrow-trend-down";

    const deductionRows = recap.deductions.map((d) => `
      <div class="flex items-center justify-between py-2 border-b border-dashed border-slate-200 dark:border-slate-700">
        <span class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <i class="fa-solid fa-${d.icon} w-4 text-center text-slate-400"></i>${esc(d.label)}
          ${d.note ? `<span class="text-[10px] text-rose-500">(${esc(d.note)})</span>` : ""}
        </span>
        <span class="font-medium text-slate-700 dark:text-slate-200 tabular-nums">- ${fmt(d.amount)}</span>
      </div>
    `).join("");

    root.innerHTML = `
      <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
        <!-- Header -->
        <div class="bg-gradient-to-br from-slate-900 to-blue-900 text-white px-6 py-5 text-center relative">
          <div class="w-14 h-14 mx-auto mb-2 rounded-2xl bg-white/10 flex items-center justify-center text-2xl">
            <i class="fa-solid fa-receipt"></i>
          </div>
          <h3 class="text-lg font-bold tracking-tight">Rekap Harian — ${esc(recap.shopName)}</h3>
          <p class="text-xs text-blue-200/90">Laporan keuangan Day ${recap.closedDay}</p>
        </div>

        <!-- Body -->
        <div class="px-6 py-5">
          <!-- Gross -->
          <div class="flex items-center justify-between pb-3 mb-1">
            <span class="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
              <i class="fa-solid fa-cash-register text-emerald-500"></i> Gross Revenue
            </span>
            <span class="font-bold text-emerald-600 tabular-nums">${fmt(recap.grossRevenue)}</span>
          </div>

          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Potongan</p>
          ${deductionRows}
          <div class="flex items-center justify-between py-2 mt-1">
            <span class="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Potongan</span>
            <span class="font-semibold text-rose-500 tabular-nums">- ${fmt(recap.totalDeductions)}</span>
          </div>

          <!-- Net -->
          <div class="${netBg} rounded-xl px-4 py-3 mt-3 flex items-center justify-between">
            <span class="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-100">
              <i class="fa-solid ${netIcon} ${netColor}"></i> Net Profit
            </span>
            <span class="text-xl font-extrabold ${netColor} tabular-nums">${fmt(recap.netProfit)}</span>
          </div>
          <p class="text-[10px] text-slate-400 mt-1.5 text-center leading-snug">
            Net = revenue − biaya operasional harian. Belum termasuk modal barang (COGS) — cek tab Analytics buat gross profit.
          </p>

          ${recap.ecommerceUnits > 0 ? `
          <div class="mt-3 flex items-center justify-between rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
            <span class="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-cart-shopping"></i> Terjual Online (Ads)
            </span>
            <span class="text-sm font-bold text-blue-700 dark:text-blue-300 tabular-nums">
              ${recap.ecommerceUnits} unit &middot; ${fmt(recap.ecommerceNet)}
            </span>
          </div>` : ""}

          <!-- Mini KPIs -->
          <div class="grid grid-cols-3 gap-2 mt-4 text-center">
            <div class="bg-slate-50 dark:bg-slate-700/40 rounded-lg py-2">
              <p class="text-[10px] text-slate-400 uppercase">Sales</p>
              <p class="font-bold text-slate-700 dark:text-slate-100">${recap.salesCount}</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-700/40 rounded-lg py-2">
              <p class="text-[10px] text-slate-400 uppercase">Rating</p>
              <p class="font-bold text-amber-500">${recap.ratings.toLocaleString("id-ID")}${recap.starSeller ? " ⭐" : ""}</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-700/40 rounded-lg py-2">
              <p class="text-[10px] text-slate-400 uppercase">Konversi</p>
              <p class="font-bold text-blue-500">${recap.conversionRate}%</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 pb-6">
          <button id="ft-recap-ack" class="w-full py-3 rounded-xl bg-[#1877F2] hover:bg-[#155fc4] active:scale-[0.98] transition-all text-white font-bold flex items-center justify-center gap-2">
            <i class="fa-solid fa-check"></i> Acknowledge — Start Day ${recap.nextDay}
          </button>
        </div>
      </div>
    `;

    root.classList.remove("hidden");
    root.classList.add("flex");

    const ackBtn = root.querySelector("#ft-recap-ack");
    if (ackBtn) ackBtn.onclick = closeRecapModal;
    // Click on the dark backdrop (not the card) also closes. Using onclick
    // (assignment, not addEventListener) so listeners can't stack across days.
    root.onclick = (ev) => { if (ev.target === root) closeRecapModal(); };
  }

  /* =========================================================
   * Seller Center dashboard (injected into the Ruko/Store tab)
   * ========================================================= */
  function renderSellerDashboard() {
    const e = ensureState();
    // Make sure the traffic numbers exist before first paint.
    if (!e.profileViewsToday) updateAdPerformance();

    const wrap = document.createElement("div");
    wrap.className = "fb-card";
    wrap.style.padding = "0";
    wrap.style.overflow = "hidden";

    const pct = Math.min(100, Math.round((e.ratings / e.ratingTarget) * 100));
    const remaining = Math.max(0, e.ratingTarget - e.ratings);

    const adButtons = AD_TIERS.map((t) => {
      const active = t.tier === e.adTier;
      return `
        <button class="ft-ad-tier text-left rounded-xl border p-3 transition-all ${active
          ? "border-transparent ring-2 ring-offset-1 shadow-md"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:shadow-sm"}"
          style="${active ? `--tw-ring-color:${t.accent};background:${t.accent}12;` : ""}"
          data-tier="${t.tier}">
          <div class="flex items-center justify-between mb-1">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style="background:${t.accent}">
              <i class="fa-solid fa-${t.icon}"></i>
            </span>
            ${active ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style="background:${t.accent}">AKTIF</span>` : ""}
          </div>
          <p class="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-tight">${esc(t.label)}</p>
          <p class="text-xs font-bold mt-0.5" style="color:${t.accent}">${t.costPerDay === 0 ? "Gratis" : fmt(t.costPerDay) + "/hari"}</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">${esc(t.blurb)}</p>
        </button>
      `;
    }).join("");

    wrap.innerHTML = `
      <!-- Seller Center header -->
      <div class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-shop-lock"></i>
            </div>
            <div class="min-w-0">
              <p class="text-[11px] uppercase tracking-wide text-blue-100/80">Seller Center</p>
              <h3 class="text-lg font-bold leading-tight truncate flex items-center gap-2">
                <span id="ft-shop-name">${esc(e.shopName)}</span>
                ${e.starSeller ? `<span class="text-[10px] bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">⭐ STAR</span>` : ""}
                <button id="ft-shop-rename" class="text-blue-100/70 hover:text-white text-xs" title="Ganti nama toko"><i class="fa-solid fa-pen"></i></button>
              </h3>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="text-[11px] text-blue-100/80">Saldo Toko (Mandari)</p>
            <p class="font-bold tabular-nums">${fmt((S().bankBalances && S().bankBalances.Mandari) || 0)}</p>
          </div>
        </div>
      </div>

      <div class="p-4 space-y-4">
        <!-- Metric 1: Customer Ratings -->
        <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-star text-amber-400"></i> Customer Ratings
            </h4>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
              ${e.ratings.toLocaleString("id-ID")} <span class="text-slate-400 font-normal">/ ${e.ratingTarget.toLocaleString("id-ID")}</span>
            </span>
          </div>
          <div class="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style="width:${pct}%"></div>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            ${e.starSeller
              ? `🏆 <b class="text-amber-500">Star Seller</b> aktif — badge VIP & trafik premium.`
              : `<b>${remaining.toLocaleString("id-ID")}</b> rating lagi untuk unlock <b class="text-amber-500">Star Seller (VIP)</b>.`}
          </p>
        </div>

        <!-- Metric 2: Ads Performance & Optimization -->
        <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div class="flex items-center justify-between mb-1">
            <h4 class="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-bullhorn text-blue-500"></i> Ads Optimization
            </h4>
            <span class="text-xs text-slate-500 dark:text-slate-400">Budget harian</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Makin tinggi tier, makin cepat stok kejual & makin sedikit buyer yang nawar sadis. Ditagih otomatis tiap Next Day.
          </p>
          <div class="grid grid-cols-2 gap-2">${adButtons}</div>
        </div>

        <!-- Metric 3: Traffic & Conversion -->
        <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h4 class="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
            <i class="fa-solid fa-chart-line text-emerald-500"></i> Traffic & Conversion
          </h4>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="w-9 h-9 mx-auto mb-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center"><i class="fa-solid fa-eye"></i></div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">${e.profileViewsToday.toLocaleString("id-ID")}</p>
              <p class="text-[11px] text-slate-400">Profile Views</p>
            </div>
            <div>
              <div class="w-9 h-9 mx-auto mb-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center"><i class="fa-solid fa-arrow-trend-up"></i></div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">${e.conversionRate}%</p>
              <p class="text-[11px] text-slate-400">Conversion</p>
            </div>
            <div>
              <div class="w-9 h-9 mx-auto mb-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center"><i class="fa-solid fa-bag-shopping"></i></div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">${e.salesToday.toLocaleString("id-ID")}</p>
              <p class="text-[11px] text-slate-400">Sales Today</p>
            </div>
          </div>
          <p class="text-[11px] text-slate-400 mt-3 leading-snug">
            <i class="fa-solid fa-circle-info"></i>
            Trafik & konversi dihitung dari budget iklan + rating toko tiap <b>Next Day</b>. Makin tinggi keduanya, makin banyak listing kejual otomatis secara online.
          </p>
        </div>
      </div>
    `;

    // ---- wire interactions ----
    wrap.querySelectorAll(".ft-ad-tier").forEach((btn) => {
      btn.addEventListener("click", () => {
        setAdBudget(Number(btn.dataset.tier));
        window.FlippingTycoon.renderActivePage();
      });
    });

    const renameBtn = wrap.querySelector("#ft-shop-rename");
    if (renameBtn) {
      renameBtn.addEventListener("click", () => {
        const next = prompt("Nama toko online:", e.shopName);
        if (next && next.trim()) {
          e.shopName = next.trim().slice(0, 32);
          saveGame();
          window.FlippingTycoon.renderActivePage();
        }
      });
    }

    return wrap;
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.Dashboard = {
    // rendering
    renderSellerDashboard,
    showRecapModal,
    closeRecapModal,
    // hooks
    onSaleRecorded,
    processDailyFinances,
    chargeAdBudget,            // Part 38 — debit ad budget before sales
    processEcommerceSales,     // Part 38 — online auto-sell loop
    // ads / metrics
    setAdBudget,
    updateAdPerformance,
    calculateDailyTraffic,     // Part 38 — ads -> traffic math
    calculateConversionRate,   // Part 38 — ratings -> conversion math
    grantRatings,
    getAdSaleRateBonus,
    getHaggleResistanceBonus,
    // misc
    ensureState,
    AD_TIERS,
    RATING_TARGET,
  };
})();
