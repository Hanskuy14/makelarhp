/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 9 — Performance Analytics Dashboard
 *
 * Tracks every finalized sale (Accept Offer / Walk-in / Auto-Accept)
 * and surfaces a Gross Profit Report:
 *     profit = SalePrice - PurchaseCost - RepairCost - FeePaid
 * Renders a sidebar page with totals, a recent-sales list, and
 * an inline SVG bar chart of the last N sales' profit.
 * ========================================================= */

(function () {
  function S()  { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }
  function uid() { return "sale-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36); }

  const MAX_HISTORY = 200;

  function ensureHistory() {
    const s = S();
    if (!Array.isArray(s.salesHistory)) s.salesHistory = [];
  }

  /* =========================================================
   * Public: record a finalized sale
   * ========================================================= */
  function recordSale(opts) {
    ensureHistory();
    const s = S();
    const purchaseCost = Math.max(0, opts.purchaseCost || 0);
    const repairCost   = Math.max(0, opts.repairCost   || 0);
    const salePrice    = Math.max(0, opts.salePrice    || 0);
    const feePaid      = Math.max(0, opts.feePaid      || 0);
    const netReceived  = salePrice - feePaid;
    const grossProfit  = salePrice - feePaid - purchaseCost - repairCost;

    const g = opts.gadget || {};
    const sale = {
      id: uid(),
      saleType: opts.saleType || "offer", // "offer" | "walk-in" | "auto-accept"
      gadget: {
        gadgetId: g.gadgetId || null,
        name: g.name || "(unknown)",
        brand: g.brand || null,
        specs: g.specs || null,
        completeness: g.completeness ? { type: g.completeness.type, short: g.completeness.short } : null,
        defect:       g.defect       ? { type: g.defect.type,       short: g.defect.short       } : null,
        isExInter: !!g.isExInter,
        accent: g.accent || null,
        icon: g.icon || null,
      },
      purchaseCost, repairCost, salePrice, feePaid,
      netReceived, grossProfit,
      buyer: opts.buyer || null,
      receivingBank: opts.receivingBank || null,
      day: s.currentDay,
      timestamp: Date.now(),
    };
    s.salesHistory.unshift(sale);
    if (s.salesHistory.length > MAX_HISTORY) s.salesHistory.length = MAX_HISTORY;
    window.FlippingTycoon.saveGame();
    return sale;
  }

  /* =========================================================
   * Aggregations
   * ========================================================= */
  function computeTotals() {
    ensureHistory();
    const list = S().salesHistory;
    let revenue = 0, fees = 0, costs = 0, repairs = 0, profit = 0;
    list.forEach((s) => {
      revenue += s.salePrice;
      fees    += s.feePaid;
      costs   += s.purchaseCost;
      repairs += s.repairCost;
      profit  += s.grossProfit;
    });
    return { count: list.length, revenue, fees, costs, repairs, profit };
  }

  /** Group sales by day window (size = days). Returns rows sorted oldest-first. */
  function aggregateByPeriod(periodDays = 7) {
    ensureHistory();
    const list = S().salesHistory.slice().reverse(); // oldest first
    if (list.length === 0) return [];
    const startDay = list[0].day;
    const buckets = new Map(); // bucketKey -> {dayFrom, dayTo, profit, revenue, count}
    list.forEach((s) => {
      const offset = Math.floor((s.day - startDay) / periodDays);
      const key = "p" + offset;
      let b = buckets.get(key);
      if (!b) {
        b = {
          dayFrom: startDay + offset * periodDays,
          dayTo:   startDay + offset * periodDays + (periodDays - 1),
          profit: 0, revenue: 0, count: 0,
        };
        buckets.set(key, b);
      }
      b.profit  += s.grossProfit;
      b.revenue += s.salePrice;
      b.count   += 1;
    });
    return Array.from(buckets.values()).sort((a, b) => a.dayFrom - b.dayFrom);
  }

  /** Per-saleType breakdown for the current full history. */
  function breakdownBySaleType() {
    ensureHistory();
    const out = {
      "offer":       { count: 0, profit: 0, revenue: 0 },
      "walk-in":     { count: 0, profit: 0, revenue: 0 },
      "auto-accept": { count: 0, profit: 0, revenue: 0 },
    };
    S().salesHistory.forEach((s) => {
      const k = out[s.saleType] ? s.saleType : "offer";
      out[k].count   += 1;
      out[k].profit  += s.grossProfit;
      out[k].revenue += s.salePrice;
    });
    return out;
  }

  /* =========================================================
   * Page renderer
   * ========================================================= */
  function renderAnalyticsPage() {
    ensureHistory();
    const s = S();
    const wrap = document.createElement("div");
    const totals = computeTotals();

    // Header card
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-chart-line text-emerald-500"></i> Performance Analytics</h3>
          <p class="text-sm text-gray-500">Laporan Gross Profit untuk semua transaksi yang sudah final.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Tracked sales</p>
          <p class="font-semibold text-sm">${totals.count}</p>
        </div>
      </div>
    `;
    wrap.appendChild(header);

    // Summary KPI grid
    const profitColor = totals.profit > 0 ? "text-emerald-700"
                       : totals.profit < 0 ? "text-rose-700"
                       : "text-gray-700";
    const kpi = document.createElement("div");
    kpi.className = "fb-card";
    kpi.innerHTML = `
      <h3 class="mb-2"><i class="fa-solid fa-coins text-amber-500"></i> Gross Profit Report (All-Time)</h3>
      <div class="analytics-kpi-grid">
        <div class="kpi-tile kpi-profit">
          <p class="kpi-label">Gross Profit</p>
          <p class="kpi-value ${profitColor}">${totals.profit >= 0 ? "+" : ""}${fmt(totals.profit)}</p>
          <p class="kpi-formula">Sale - Purchase - Repair - Fee</p>
        </div>
        <div class="kpi-tile">
          <p class="kpi-label">Revenue</p>
          <p class="kpi-value">${fmt(totals.revenue)}</p>
        </div>
        <div class="kpi-tile">
          <p class="kpi-label">Total Modal Beli</p>
          <p class="kpi-value text-rose-700">-${fmt(totals.costs)}</p>
        </div>
        <div class="kpi-tile">
          <p class="kpi-label">Total Repair / Repack</p>
          <p class="kpi-value text-rose-700">-${fmt(totals.repairs)}</p>
        </div>
        <div class="kpi-tile">
          <p class="kpi-label">Platform Fees</p>
          <p class="kpi-value text-rose-700">-${fmt(totals.fees)}</p>
        </div>
        <div class="kpi-tile">
          <p class="kpi-label">Avg / Sale</p>
          <p class="kpi-value">${fmt(totals.count ? Math.round(totals.profit / totals.count) : 0)}</p>
        </div>
      </div>
    `;
    wrap.appendChild(kpi);

    // Sale type breakdown
    const bd = breakdownBySaleType();
    const bdCard = document.createElement("div");
    bdCard.className = "fb-card";
    bdCard.innerHTML = `
      <h3 class="mb-2"><i class="fa-solid fa-tags text-blue-500"></i> Channel Breakdown</h3>
      <div class="analytics-channels">
        ${[
          { key: "offer",       label: "Accept Offer",  icon: "comments-dollar", accent: "#1d4ed8" },
          { key: "walk-in",     label: "Walk-in Toko",  icon: "shop",            accent: "#059669" },
          { key: "auto-accept", label: "Auto-Accept",   icon: "robot",           accent: "#7e22ce" },
        ].map((c) => {
          const x = bd[c.key];
          return `
            <div class="channel-tile" style="border-left:4px solid ${c.accent}">
              <div class="channel-icon" style="background:${c.accent}22;color:${c.accent}">
                <i class="fa-solid fa-${c.icon}"></i>
              </div>
              <div class="channel-body">
                <p class="channel-label">${c.label}</p>
                <p class="channel-stat"><b>${x.count}</b> sale${x.count === 1 ? "" : "s"} &middot; revenue ${fmt(x.revenue)}</p>
                <p class="channel-stat ${x.profit >= 0 ? "text-emerald-700" : "text-rose-700"}">Profit ${x.profit >= 0 ? "+" : ""}${fmt(x.profit)}</p>
              </div>
            </div>`;
        }).join("")}
      </div>
    `;
    wrap.appendChild(bdCard);

    // Chart: last 20 sales' profit, oldest left → newest right
    if (s.salesHistory.length > 0) {
      const chartCard = document.createElement("div");
      chartCard.className = "fb-card";
      chartCard.innerHTML = `
        <h3 class="mb-2"><i class="fa-solid fa-chart-column text-indigo-500"></i> Recent Sales Profit (terbaru di kanan)</h3>
        ${renderProfitBarChart(s.salesHistory.slice(0, 20).slice().reverse())}
      `;
      wrap.appendChild(chartCard);
    }

    // Recent sales list (sorted by date desc, which is the natural order since we unshift)
    const listCard = document.createElement("div");
    listCard.className = "fb-card";
    listCard.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3><i class="fa-solid fa-receipt text-fuchsia-500"></i> Sales History</h3>
        <span class="text-xs text-gray-500">${s.salesHistory.length} entri</span>
      </div>
    `;
    if (s.salesHistory.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-center py-8";
      empty.innerHTML = `
        <div class="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 text-xl mb-2">
          <i class="fa-solid fa-chart-line"></i>
        </div>
        <p class="font-semibold">Belum ada penjualan tercatat</p>
        <p class="text-xs text-gray-500">Setelah ada Accept Offer / Walk-in / Auto-Accept, datanya muncul di sini.</p>
      `;
      listCard.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "sales-history-list";
      s.salesHistory.slice(0, 50).forEach((sale) => list.appendChild(renderSaleRow(sale)));
      listCard.appendChild(list);
    }
    wrap.appendChild(listCard);

    return wrap;
  }

  function renderSaleRow(sale) {
    const row = document.createElement("div");
    const profitClass = sale.grossProfit > 0 ? "text-emerald-700"
                      : sale.grossProfit < 0 ? "text-rose-700" : "text-gray-700";
    const typeMeta = {
      "offer":       { icon: "comments-dollar", label: "Offer",       color: "#1d4ed8", bg: "#dbeafe" },
      "walk-in":     { icon: "shop",            label: "Walk-in",     color: "#059669", bg: "#d1fae5" },
      "auto-accept": { icon: "robot",           label: "Auto-Accept", color: "#7e22ce", bg: "#ede9fe" },
    }[sale.saleType] || { icon: "tag", label: "Sale", color: "#6b7280", bg: "#f3f4f6" };

    const accent = sale.gadget.accent || "#1c1c1e";
    const iconName = sale.gadget.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";

    row.className = "sales-history-row";
    row.innerHTML = `
      <div class="sh-icon"><i class="fa-solid fa-${iconName} text-2xl" style="color:${accent}"></i></div>
      <div class="sh-body">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="sh-title">${sale.gadget.name}</p>
          <span class="sh-type-tag" style="background:${typeMeta.bg};color:${typeMeta.color}">
            <i class="fa-solid fa-${typeMeta.icon}"></i> ${typeMeta.label}
          </span>
          ${sale.gadget.isExInter ? `<span class="market-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-skull-crossbones"></i> Ex-Inter</span>` : ""}
        </div>
        <p class="sh-meta">
          ${sale.gadget.specs ? `${sale.gadget.specs.ram}/${sale.gadget.specs.rom} &middot; ` : ""}
          ${sale.gadget.completeness ? sale.gadget.completeness.short + " &middot; " : ""}
          ${sale.gadget.defect ? sale.gadget.defect.short : ""}
        </p>
        <p class="sh-meta">
          Day ${sale.day}${sale.buyer ? ` &middot; ke ${sale.buyer}` : ""}${sale.receivingBank ? ` &middot; ${sale.receivingBank}` : ""}
        </p>
        <div class="sh-breakdown">
          <span>Sale ${fmt(sale.salePrice)}</span>
          <span>- Beli ${fmt(sale.purchaseCost)}</span>
          <span>- Repair ${fmt(sale.repairCost)}</span>
          <span>- Fee ${fmt(sale.feePaid)}</span>
        </div>
      </div>
      <div class="sh-profit ${profitClass}">
        ${sale.grossProfit >= 0 ? "+" : ""}${fmt(sale.grossProfit)}
      </div>
    `;
    return row;
  }

  /* ---------- Inline SVG bar chart ---------- */
  function renderProfitBarChart(sales) {
    if (!sales || sales.length === 0) return "";
    const W = 600, H = 160, P = 18;
    const innerW = W - P * 2;
    const innerH = H - P * 2;
    const profits = sales.map((s) => s.grossProfit);
    const maxAbs = Math.max(1, ...profits.map((v) => Math.abs(v)));
    const barW = innerW / sales.length;
    const zeroY = P + innerH / 2;

    const bars = sales.map((s, i) => {
      const x = P + i * barW + 2;
      const w = Math.max(2, barW - 4);
      const h = (Math.abs(s.grossProfit) / maxAbs) * (innerH / 2);
      const y = s.grossProfit >= 0 ? zeroY - h : zeroY;
      const fill = s.grossProfit >= 0 ? "#10b981" : "#ef4444";
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}">
        <title>Day ${s.day} ${s.gadget.name} ${s.grossProfit >= 0 ? "+" : ""}${fmt(s.grossProfit)}</title>
      </rect>`;
    }).join("");

    return `
      <div class="profit-chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="profit-chart-svg">
          <line x1="${P}" y1="${zeroY}" x2="${W - P}" y2="${zeroY}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,3"/>
          ${bars}
        </svg>
        <div class="profit-chart-axis">
          <span>${sales.length > 0 ? "Day " + sales[0].day : ""}</span>
          <span>Day ${sales[sales.length - 1].day}</span>
        </div>
      </div>
    `;
  }

  /* =========================================================
   * Monthly export (called from Banking history tab)
   *
   * "Month" is simulated as a 30-day window (calendar-aligned to
   * the player's currentDay). Generates a downloadable text/CSV
   * summarizing gross profit per 30-day period.
   * ========================================================= */
  function buildMonthlyReportText() {
    ensureHistory();
    const s = S();
    const totals = computeTotals();
    const periods = aggregateByPeriod(30);
    const lines = [];
    lines.push("FLIPPING TYCOON — MONTHLY GROSS PROFIT REPORT");
    lines.push("=".repeat(54));
    lines.push(`Generated on Day ${s.currentDay} (Game time)`);
    lines.push(`Total tracked sales: ${totals.count}`);
    lines.push("");
    lines.push("ALL-TIME TOTALS");
    lines.push("-".repeat(54));
    lines.push(`Revenue (Sale Price)      : ${fmt(totals.revenue)}`);
    lines.push(`(-) Purchase Cost         : ${fmt(totals.costs)}`);
    lines.push(`(-) Repair / Repack Cost  : ${fmt(totals.repairs)}`);
    lines.push(`(-) Platform Fees         : ${fmt(totals.fees)}`);
    lines.push(`Gross Profit              : ${totals.profit >= 0 ? "+" : ""}${fmt(totals.profit)}`);
    lines.push("");
    lines.push("MONTHLY BREAKDOWN (per 30-day window)");
    lines.push("-".repeat(54));
    if (periods.length === 0) {
      lines.push("(no sales recorded yet)");
    } else {
      lines.push("Period                | Sales | Revenue          | Gross Profit");
      lines.push("-".repeat(72));
      periods.forEach((p) => {
        const period = `Day ${String(p.dayFrom).padStart(3)}-${String(p.dayTo).padStart(3)}`;
        const cnt    = String(p.count).padStart(3);
        const rev    = fmt(p.revenue).padStart(16);
        const prof   = (p.profit >= 0 ? "+" : "") + fmt(p.profit);
        lines.push(`${period.padEnd(21)} | ${cnt}   | ${rev} | ${prof}`);
      });
    }
    lines.push("");
    lines.push("RECENT SALES (latest 25)");
    lines.push("-".repeat(54));
    s.salesHistory.slice(0, 25).forEach((sale) => {
      const t = sale.saleType.padEnd(12);
      const p = (sale.grossProfit >= 0 ? "+" : "") + fmt(sale.grossProfit);
      lines.push(`Day ${String(sale.day).padStart(3)} | ${t} | ${sale.gadget.name.padEnd(28).slice(0,28)} | sale ${fmt(sale.salePrice).padStart(15)} | profit ${p}`);
    });
    lines.push("");
    lines.push("End of report.");
    return lines.join("\n");
  }

  function exportMonthlyReport() {
    const text = buildMonthlyReportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flipping-tycoon-profit-report-day${S().currentDay}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("📊 Monthly profit report di-export!");
  }

  /* ---------- Toast ---------- */
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
  window.Analytics = {
    renderAnalyticsPage,
    recordSale,
    computeTotals,
    aggregateByPeriod,
    breakdownBySaleType,
    exportMonthlyReport,
    buildMonthlyReportText,
  };
})();
