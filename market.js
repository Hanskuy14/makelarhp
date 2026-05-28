/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 2 — Marketplace: daily listings, pricing, UI
 * ========================================================= */

(function () {
  const {
    GADGET_DATABASE,
    COMPLETENESS_OPTIONS,
    DEFECT_OPTIONS,
    SELLER_NAMES,
    AVATAR_COLORS,
  } = window.GadgetData;

  /* ---------- RNG helpers ---------- */
  function randInt(min, maxInclusive) {
    return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffleInPlace(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function uid(prefix = "lst") {
    return prefix + "-" + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- Pricing algorithm (CRUCIAL) ----------
   * finalPrice = basePrice * completeness.multiplier
   *                       * defect.multiplier
   *                       * marketVariance(±5%)
   *                       * exInterMultiplier (0.7 if Ex-Inter, else 1.0)
   * Rounded to nearest Rp 50.000 to feel realistic.
   *
   * Part 15 — All factors are coerced via Number() with a `|| 1` fallback
   * so a malformed inventory item (missing multiplier, etc.) never
   * propagates a NaN into the rendered "Rp NaN" label.
   */
  function computeFinalPrice(basePrice, completeness, defect, brand, isExInter) {
    const variance = 0.95 + Math.random() * 0.10; // 0.95 .. 1.05
    const newsMul = window.FlippingTycoon
      ? window.FlippingTycoon.getNewsMultiplierForBrand(brand)
      : 1.0;
    const exInterMul = isExInter ? 0.70 : 1.0; // Part 6: 30% off basePrice for "No Pajak" units
    const safeBase   = Number(basePrice) || 0;
    const compMul    = (completeness && Number(completeness.multiplier)) || 1;
    const defMul     = (defect && Number(defect.multiplier)) || 1;
    const safeNews   = Number(newsMul) || 1;
    const raw = safeBase * compMul * defMul * variance * safeNews * exInterMul;
    if (!isFinite(raw) || isNaN(raw)) return 0;
    return Math.round(raw / 50_000) * 50_000;
  }

  /** Public: estimate today's resale market price for an inventory item. */
  function computeCurrentMarketPrice(inventoryItem) {
    if (!inventoryItem) return 0;
    const gadget = GADGET_DATABASE.find((g) => g.id === inventoryItem.gadgetId);
    // Prefer the master DB basePrice; fall back to the item-local copy
    // (set by Part 15 fix) and then to buyPrice as a last resort.
    const basePrice = Number(
      (gadget && gadget.basePrice) || inventoryItem.basePrice || inventoryItem.buyPrice
    ) || 0;
    if (basePrice <= 0) return 0;

    const completeness = inventoryItem.completeness || COMPLETENESS_OPTIONS[0] || { multiplier: 1 };
    const defect       = inventoryItem.defect       || DEFECT_OPTIONS[0]       || { multiplier: 1 };
    const compMul = Number(completeness.multiplier) || 1;
    const defMul  = Number(defect.multiplier)       || 1;

    const brand = (gadget && gadget.brand) || inventoryItem.brand || null;
    const newsMul = window.FlippingTycoon
      ? Number(window.FlippingTycoon.getNewsMultiplierForBrand(brand)) || 1
      : 1;

    // Stable resale estimate (no random variance for selling, but apply news + slight scout-buyer bonus)
    let raw = basePrice * compMul * defMul * newsMul * 1.02;
    // Part 6: Blocked IMEI (Ex-Inter) tanks resale value by 60%.
    if (inventoryItem.imeiStatus === "blocked") {
      raw *= 0.40;
    }
    if (!isFinite(raw) || isNaN(raw)) return 0;
    return Math.round(raw / 50_000) * 50_000;
  }

  /* ---------- Build a single listing ---------- */
  function buildListing(gadget) {
    const completeness = pick(COMPLETENESS_OPTIONS);
    const defect = pick(DEFECT_OPTIONS);
    const sellerName = pick(SELLER_NAMES);
    // Part 6: 20% chance the seller is moving Ex-Inter (No Pajak) units.
    const isExInter = Math.random() < 0.20;
    const finalPrice = computeFinalPrice(gadget.basePrice, completeness, defect, gadget.brand, isExInter);
    const avatarColor = AVATAR_COLORS[randInt(0, AVATAR_COLORS.length - 1)];

    return {
      listingId: uid(),
      gadgetId: gadget.id,
      name: gadget.model,
      brand: gadget.brand,
      specs: { ...gadget.specs },
      basePrice: gadget.basePrice,
      year: gadget.year,
      icon: gadget.icon,
      accent: gadget.accent,
      completeness,           // { type, short, multiplier, haggleBonus, desc }
      defect,                 // { type, short, multiplier, severity, haggleAcceptRate, desc }
      isExInter,              // Part 6: black-market unit, IMEI block risk after purchase
      finalPrice,
      seller: {
        name: sellerName,
        avatar: sellerName[0].toUpperCase(),
        color: avatarColor,
        location: pick(["Jakarta", "Bandung", "Surabaya", "Bekasi", "Tangerang", "Depok", "Yogyakarta"]),
      },
      description: makeDescription(gadget, completeness, defect, isExInter),
      haggleState: null,      // null | "accepted" | "rejected"
      currentPrice: finalPrice, // may drop after a successful haggle
    };
  }

  function makeDescription(gadget, completeness, defect, isExInter) {
    const lines = [
      `Dijual ${gadget.brand} ${gadget.model} ${gadget.specs.ram}/${gadget.specs.rom} warna ${gadget.specs.color}.`,
      `Kelengkapan: ${completeness.type} - ${completeness.desc}`,
      `Kondisi: ${defect.type} - ${defect.desc}`,
      `Tahun rilis ${gadget.year}. Bisa COD area kota, atau kirim pakai ekspedisi (ongkir DTG).`,
    ];
    if (isExInter) {
      lines.push(`⚠️ Status: EX-INTER (No Pajak) — masuk dari jalur tidak resmi. Harga miring tapi RESIKO IMEI bisa kena blokir signal sewaktu-waktu. No retur, no garansi.`);
    }
    lines.push(`Serius minat boleh PM langsung, no afgan no php ya bro/sis 🙏`);
    return lines.join("\n");
  }

  /* ---------- Daily listings (5-8 per day) ---------- */
  function generateDailyListings() {
    const count = randInt(5, 8);
    const pool = shuffleInPlace([...GADGET_DATABASE]);
    return pool.slice(0, count).map(buildListing);
  }

  function ensureDailyListings() {
    const s = window.FlippingTycoon.State.data;
    if (s.lastListingDay !== s.currentDay || !Array.isArray(s.dailyListings) || s.dailyListings.length === 0) {
      s.dailyListings = generateDailyListings();
      s.lastListingDay = s.currentDay;
      window.FlippingTycoon.saveGame();
    }
  }

  /* =========================================================
   * UI Rendering
   * ========================================================= */

  function formatRupiah(n) {
    if (typeof n !== "number") n = Number(n) || 0;
    return "Rp " + n.toLocaleString("id-ID");
  }

  function defectBadgeColor(severity) {
    return [
      "bg-emerald-100 text-emerald-700",
      "bg-yellow-100 text-yellow-700",
      "bg-orange-100 text-orange-700",
      "bg-rose-100 text-rose-700",
      "bg-red-200 text-red-800",
    ][severity] || "bg-gray-100 text-gray-700";
  }

  function gadgetIconHtml(listing, sizeClass = "text-5xl") {
    const iconName = listing.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    return `<i class="fa-solid fa-${iconName} ${sizeClass}" style="color:${listing.accent}"></i>`;
  }

  /* ---------- Marketplace grid (default view) ---------- */
  function renderMarketplaceGrid() {
    const s = window.FlippingTycoon.State.data;
    const wrap = document.createElement("div");

    // Header
    const header = document.createElement("div");
    header.className = "fb-card flex items-center justify-between";
    header.innerHTML = `
      <div>
        <h3 class="flex items-center gap-2">
          <i class="fa-solid fa-store text-emerald-500"></i> Marketplace
        </h3>
        <p class="text-sm text-gray-500">Today's listings &middot; Day ${s.currentDay} &middot; ${s.dailyListings.length} items</p>
      </div>
      <div class="text-right">
        <p class="text-xs text-gray-400">New listings every day</p>
      </div>
    `;
    wrap.appendChild(header);

    // Grid
    const grid = document.createElement("div");
    grid.className = "marketplace-grid";

    /* Part 23 — STRICT 50-item DOM cap (no Load More).
     * Drawing 1000 listing cards crashes mobile with OOM. We hard-cap
     * at 50, surface the count in a banner, and trust the search/filter
     * UI to narrow what the player wants to see. */
    const HARD_CAP = 50;
    if (!s.marketView) s.marketView = { mode: "grid", selectedListingId: null };
    const total = s.dailyListings.length;
    const limit = Math.min(HARD_CAP, total);

    s.dailyListings.slice(0, limit).forEach((listing) => {
      const card = document.createElement("div");
      card.className = "marketplace-card" + (listing.isExInter ? " ex-inter" : "");
      card.innerHTML = `
        <div class="marketplace-thumb">
          ${gadgetIconHtml(listing, "text-6xl")}
          <span class="marketplace-thumb-tag">${listing.brand}</span>
          ${listing.isExInter ? `<span class="ex-inter-tag"><i class="fa-solid fa-skull-crossbones"></i> No Pajak</span>` : ""}
        </div>
        <div class="marketplace-card-body">
          <p class="marketplace-price">${formatRupiah(listing.finalPrice)}</p>
          <p class="marketplace-title">${listing.name}</p>
          <p class="marketplace-meta">${listing.specs.ram} / ${listing.specs.rom} &middot; ${listing.specs.color}</p>
          <div class="marketplace-badges">
            <span class="market-badge bg-blue-100 text-blue-700">${listing.completeness.short}</span>
            <span class="market-badge ${defectBadgeColor(listing.defect.severity)}">${listing.defect.short}</span>
            ${listing.isExInter ? `<span class="market-badge bg-rose-100 text-rose-700">Ex-Inter</span>` : ""}
          </div>
          <p class="marketplace-seller">
            <i class="fa-solid fa-location-dot"></i> ${listing.seller.location}
          </p>
        </div>
      `;
      card.addEventListener("click", () => openProductDetail(listing.listingId));
      grid.appendChild(card);
    });

    wrap.appendChild(grid);

    // Strict 50-item warning banner (Part 23)
    if (total > HARD_CAP) {
      const note = document.createElement("p");
      note.className = "ft-render-cap-note";
      note.innerHTML = `
        <i class="fa-solid fa-circle-info"></i>
        Menampilkan <b>${HARD_CAP}</b> barang teratas dari total <b>${total}</b> barang
        untuk menjaga performa.
      `;
      wrap.appendChild(note);
    }
    return wrap;
  }

  /* ---------- Product detail page ---------- */
  function renderProductDetail(listing) {
    const wrap = document.createElement("div");
    wrap.className = "product-detail";

    const priceDisplay = listing.haggleState === "accepted"
      ? `<span class="line-through text-gray-400 text-base mr-2">${formatRupiah(listing.finalPrice)}</span>${formatRupiah(listing.currentPrice)}`
      : formatRupiah(listing.finalPrice);

    wrap.innerHTML = `
      <button class="back-btn" id="pd-back">
        <i class="fa-solid fa-arrow-left"></i> Back to Marketplace
      </button>

      <div class="product-detail-grid">
        <!-- Hero -->
        <div class="product-hero${listing.isExInter ? " ex-inter" : ""}">
          ${gadgetIconHtml(listing, "text-9xl")}
          <span class="product-hero-tag">${listing.brand} &middot; ${listing.year}</span>
          ${listing.isExInter ? `<span class="ex-inter-tag big"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter / No Pajak</span>` : ""}
        </div>

        <!-- Right column -->
        <div class="product-info">
          <p class="product-price">${priceDisplay}</p>
          <h2 class="product-title">${listing.name}</h2>
          <p class="product-listed">Listed on Day ${window.FlippingTycoon.State.data.currentDay} in ${listing.seller.location}</p>

          <div class="product-badges">
            <span class="market-badge bg-blue-100 text-blue-700">${listing.completeness.type}</span>
            <span class="market-badge ${defectBadgeColor(listing.defect.severity)}">${listing.defect.type}</span>
            ${listing.isExInter ? `<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-triangle-exclamation"></i> Ex-Inter</span>` : ""}
          </div>

          ${listing.isExInter ? `
            <div class="ex-inter-warning">
              <i class="fa-solid fa-circle-exclamation"></i>
              <div>
                <p class="font-bold">Black Market Unit</p>
                <p>Harga miring (-30%) tapi unit ini masuk dari jalur ilegal. Setiap hari ada risiko 15% IMEI diblokir & sinyal mati. Bisa "ditembak" di Repair Center kalau kena.</p>
              </div>
            </div>
          ` : ""}

          <button id="pd-message" class="message-seller-btn">
            <i class="fa-brands fa-facebook-messenger"></i> Message Seller
          </button>

          <div class="seller-card">
            <div class="seller-avatar" style="background:${listing.seller.color}">
              ${listing.seller.avatar}
            </div>
            <div>
              <p class="font-semibold">${listing.seller.name}</p>
              <p class="text-xs text-gray-500">Seller info &middot; Joined Day ${Math.max(1, window.FlippingTycoon.State.data.currentDay - randInt(1, 30))}</p>
            </div>
            <div class="ml-auto text-emerald-500 text-xs font-semibold">
              <i class="fa-solid fa-circle text-[8px]"></i> Online
            </div>
          </div>
        </div>
      </div>

      <!-- Specs -->
      <div class="fb-card">
        <h3>Details</h3>
        <div class="spec-grid">
          <div><span class="spec-label">Brand</span><span class="spec-value">${listing.brand}</span></div>
          <div><span class="spec-label">Model</span><span class="spec-value">${listing.name}</span></div>
          <div><span class="spec-label">RAM</span><span class="spec-value">${listing.specs.ram}</span></div>
          <div><span class="spec-label">Storage</span><span class="spec-value">${listing.specs.rom}</span></div>
          <div><span class="spec-label">Color</span><span class="spec-value">${listing.specs.color}</span></div>
          <div><span class="spec-label">Release Year</span><span class="spec-value">${listing.year}</span></div>
          <div><span class="spec-label">Base Market</span><span class="spec-value">${formatRupiah(listing.basePrice)}</span></div>
          <div><span class="spec-label">Seller Asks</span><span class="spec-value">${formatRupiah(listing.finalPrice)}</span></div>
        </div>
      </div>

      <!-- Condition -->
      <div class="fb-card">
        <h3>Condition</h3>
        <div class="condition-row">
          <i class="fa-solid fa-box-open text-blue-500"></i>
          <div>
            <p class="font-semibold">Completeness: ${listing.completeness.type}</p>
            <p class="text-sm text-gray-600">${listing.completeness.desc} <span class="text-gray-400">(${(listing.completeness.multiplier * 100).toFixed(0)}% multiplier)</span></p>
          </div>
        </div>
        <div class="condition-row">
          <i class="fa-solid fa-triangle-exclamation" style="color:${listing.defect.severity >= 3 ? "#ef4444" : "#eab308"}"></i>
          <div>
            <p class="font-semibold">Defect: ${listing.defect.type}</p>
            <p class="text-sm text-gray-600">${listing.defect.desc} <span class="text-gray-400">(${(listing.defect.multiplier * 100).toFixed(0)}% multiplier)</span></p>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="fb-card">
        <h3>Description</h3>
        <p class="text-sm text-gray-700 whitespace-pre-line">${listing.description}</p>
      </div>
    `;

    wrap.querySelector("#pd-back").addEventListener("click", () => {
      window.FlippingTycoon.State.data.marketView = { mode: "grid", selectedListingId: null };
      window.FlippingTycoon.saveGame();
      window.FlippingTycoon.renderActivePage();
    });
    wrap.querySelector("#pd-message").addEventListener("click", () => {
      window.Chat.openWithListing(listing.listingId);
    });

    return wrap;
  }

  function openProductDetail(listingId) {
    window.FlippingTycoon.State.data.marketView = { mode: "detail", selectedListingId: listingId };
    window.FlippingTycoon.saveGame();
    window.FlippingTycoon.renderActivePage();
  }

  /* ---------- Public renderer used by script.js router ---------- */
  function renderMarketplacePage() {
    ensureDailyListings();
    const s = window.FlippingTycoon.State.data;
    const view = s.marketView || { mode: "grid", selectedListingId: null };

    if (view.mode === "detail" && view.selectedListingId) {
      const listing = s.dailyListings.find((l) => l.listingId === view.selectedListingId);
      if (listing) return renderProductDetail(listing);
    }
    return renderMarketplaceGrid();
  }

  /* ---------- Removal helper used by chat.js after purchase ---------- */
  function removeListing(listingId) {
    const s = window.FlippingTycoon.State.data;
    s.dailyListings = (s.dailyListings || []).filter((l) => l.listingId !== listingId);
    s.marketView = { mode: "grid", selectedListingId: null };
  }

  /* Expose */
  window.Market = {
    generateDailyListings,
    ensureDailyListings,
    renderMarketplacePage,
    removeListing,
    formatRupiah,
    computeCurrentMarketPrice,
  };
})();
