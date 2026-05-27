/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 3 — Inventory: owned items + relist with platform fee
 * ========================================================= */

(function () {
  const PLATFORM_FEE = 0.05; // 5%

  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  function gadgetIconHtml(item, sizeClass = "text-5xl") {
    const accent = (item.accent) || "#1c1c1e";
    const iconName = (item.icon === "tablet") ? "tablet-screen-button" : "mobile-screen-button";
    return `<i class="fa-solid fa-${iconName} ${sizeClass}" style="color:${accent}"></i>`;
  }

  /* ---------- Page ---------- */
  function renderInventoryPage() {
    const wrap = document.createElement("div");
    const items = S().inventory || [];

    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2">
            <i class="fa-solid fa-boxes-stacked text-amber-500"></i> Inventory
          </h3>
          <p class="text-sm text-gray-500">${items.length} barang &middot; Klik "Relist" untuk jual ke marketplace.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Platform fee</p>
          <p class="font-semibold text-sm">5% (0% with Priority)</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fb-card text-center py-12";
      empty.innerHTML = `
        <div class="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-2xl mb-3"><i class="fa-solid fa-box-open"></i></div>
        <h3>Belum punya barang</h3>
        <p class="text-sm text-gray-500">Beli dulu di Marketplace, baru bisa di-flip dari sini.</p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    const grid = document.createElement("div");
    grid.className = "inventory-grid";
    items.forEach((item) => grid.appendChild(renderInventoryCard(item)));
    wrap.appendChild(grid);
    return wrap;
  }



  /* ---------- Single inventory card ---------- */
  function renderInventoryCard(item) {
    const card = document.createElement("div");
    card.className = "inventory-card";

    const marketPrice = window.Market.computeCurrentMarketPrice(item);
    const buyPrice = item.buyPrice || 0;
    const grossProfit = marketPrice - buyPrice;
    const profitClass = grossProfit > 0 ? "text-emerald-600" : grossProfit < 0 ? "text-rose-600" : "text-gray-500";

    card.innerHTML = `
      <div class="inv-thumb">
        ${gadgetIconHtml(item, "text-6xl")}
        <span class="inv-thumb-tag">${item.brand || "—"}</span>
        ${item.hiddenDefect ? `<span class="inv-hidden-defect" title="${item.hiddenDefect}"><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
      </div>
      <div class="inv-body">
        <p class="inv-title">${item.name}</p>
        <p class="inv-meta">${item.specs.ram} / ${item.specs.rom} &middot; ${item.specs.color}</p>
        <div class="inv-badges">
          <span class="market-badge bg-blue-100 text-blue-700">${item.completeness.short}</span>
          <span class="market-badge bg-yellow-100 text-yellow-800">${item.defect.short}</span>
        </div>
        <div class="inv-prices">
          <div><span class="inv-prices-label">Beli (D${item.buyDay})</span><span>${fmt(buyPrice)}</span></div>
          <div><span class="inv-prices-label">Pasar Hari Ini</span><span class="font-bold">${fmt(marketPrice)}</span></div>
          <div><span class="inv-prices-label">Margin Kotor</span><span class="${profitClass} font-semibold">${grossProfit >= 0 ? "+" : ""}${fmt(grossProfit)}</span></div>
        </div>
        <button class="relist-btn" data-id="${item.id}">
          <i class="fa-solid fa-tag"></i> Relist on Marketplace
        </button>
      </div>
    `;
    card.querySelector(".relist-btn").addEventListener("click", () => openRelistModal(item));
    return card;
  }



  /* ---------- Relist modal: pick receiving bank ---------- */
  function openRelistModal(item) {
    const modal = document.querySelector("#relist-modal");
    const body = modal.querySelector("#relist-body");
    const closeBtn = modal.querySelector("#relist-cancel");

    const marketPrice = window.Market.computeCurrentMarketPrice(item);

    // Build per-bank rows showing fee preview based on tier.
    const banks = ["Mandiri", "BCA", "BNI"];
    const rows = banks.map((b) => {
      const balance = S().bankBalances[b] || 0;
      const tier = window.Banking.tierOf(balance);
      const isPriority = tier === "priority";
      const feeRate = isPriority ? 0 : PLATFORM_FEE;
      const fee = Math.round(marketPrice * feeRate);
      const net = marketPrice - fee;
      return `
        <button class="relist-bank-row ${tier}" data-bank="${b}">
          <div class="rb-left">
            <span class="rb-bank">${b}</span>
            <span class="rb-tier">Tier: ${window.Banking.tierLabel(tier)}</span>
          </div>
          <div class="rb-right">
            <span class="rb-fee">${isPriority ? "Fee 0% (Priority)" : `Fee 5% = -${fmt(fee)}`}</span>
            <span class="rb-net"><b>+${fmt(net)}</b></span>
          </div>
        </button>
      `;
    }).join("");

    body.innerHTML = `
      <div class="relist-summary">
        <p class="text-xs text-gray-500">Item</p>
        <p class="font-semibold text-base mb-1">${item.name} &middot; ${item.specs.ram}/${item.specs.rom}</p>
        <p class="text-xs text-gray-500">Estimasi pasar hari ini</p>
        <p class="text-xl font-bold">${fmt(marketPrice)}</p>
      </div>
      <p class="text-sm font-semibold mb-2">Setor hasil ke rekening mana?</p>
      <div class="relist-banks">${rows}</div>
      <p class="text-xs text-gray-500 mt-2">Tip: simpan saldo ≥ Rp 500.000.000 di salah satu rekening untuk mendapat tier <b>Priority</b> dan bebas fee.</p>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const close = () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    };
    closeBtn.onclick = close;

    body.querySelectorAll(".relist-bank-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        executeSale(item, btn.dataset.bank, marketPrice);
        close();
        window.FlippingTycoon.renderActivePage();
      });
    });
  }



  /* ---------- Execute the sale ---------- */
  function executeSale(item, receivingBank, marketPrice) {
    const s = S();
    const balance = s.bankBalances[receivingBank] || 0;
    const tier = window.Banking.tierOf(balance);
    const isPriority = tier === "priority";
    const feeRate = isPriority ? 0 : PLATFORM_FEE;
    const fee = Math.round(marketPrice * feeRate);
    const net = marketPrice - fee;

    // Credit receiving bank.
    s.bankBalances[receivingBank] += net;
    s.bankHistories[receivingBank].push({
      type: "CREDIT",
      amount: net,
      balanceAfter: s.bankBalances[receivingBank],
      description: `Sale of ${item.name}${isPriority ? " (Priority - 0% fee)" : ` (after 5% platform fee)`}`,
      category: "sale",
      day: s.currentDay,
      ts: Date.now(),
    });

    // Remove item from inventory.
    s.inventory = s.inventory.filter((it) => it.id !== item.id);
    window.FlippingTycoon.saveGame();

    // Tiny toast feedback.
    showToast(`Terjual! +${fmt(net)} masuk ke ${receivingBank}.`);
  }

  /* ---------- Toast helper ---------- */
  function showToast(msg) {
    let toast = document.querySelector("#ft-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ft-toast";
      toast.className = "ft-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
  }

  /* ---------- Public API ---------- */
  window.Inventory = {
    renderInventoryPage,
    PLATFORM_FEE,
  };
})();
