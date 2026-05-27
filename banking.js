/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 3 — Banking: 3 banks, debit cards, history, transfers
 * ========================================================= */

(function () {
  const TRANSFER_FEE = 2_500;

  const BANK_META = {
    Mandiri: {
      name: "Bank Mandiri",
      short: "Mandiri",
      number: "1370 0099 8842 11",
      logo: "M",
      themeClass: "bank-mandiri",   // navy + yellow
    },
    BCA: {
      name: "Bank Central Asia",
      short: "BCA",
      number: "8451 7220 9135",
      logo: "B",
      themeClass: "bank-bca",       // blue + white
    },
    BNI: {
      name: "Bank Negara Indonesia",
      short: "BNI",
      number: "0312 4567 8900",
      logo: "N",
      themeClass: "bank-bni",       // teal + orange
    },
  };

  function fmt(n) { return window.Market.formatRupiah(n); }
  function S() { return window.FlippingTycoon.State.data; }

  /* ---------- Tier resolver ---------- */
  function tierOf(balance) {
    if (balance > 500_000_000) return "priority";
    if (balance >= 50_000_000) return "platinum";
    return "regular";
  }
  function tierLabel(tier) {
    return { regular: "Regular", platinum: "Platinum", priority: "Priority" }[tier];
  }



  /* ---------- Page renderer ---------- */
  function renderBankingPage() {
    const wrap = document.createElement("div");

    // Header card with summary
    const total = S().bankBalances.Mandiri + S().bankBalances.BCA + S().bankBalances.BNI;
    const header = document.createElement("div");
    header.className = "fb-card";
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2"><i class="fa-solid fa-building-columns text-indigo-500"></i> Banking</h3>
          <p class="text-sm text-gray-500">Total saldo: <b>${fmt(total)}</b></p>
        </div>
        <button id="open-transfer" class="message-seller-btn" style="margin-top:0">
          <i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer
        </button>
      </div>
    `;
    wrap.appendChild(header);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "bank-tabs";
    Object.keys(BANK_META).forEach((bankKey) => {
      const meta = BANK_META[bankKey];
      const isActive = S().bankingView.activeBank === bankKey;
      const btn = document.createElement("button");
      btn.className = `bank-tab ${meta.themeClass} ${isActive ? "active" : ""}`;
      btn.dataset.bank = bankKey;
      btn.innerHTML = `<span class="bank-tab-logo">${meta.logo}</span><span>${meta.short}</span>`;
      btn.addEventListener("click", () => {
        S().bankingView.activeBank = bankKey;
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    // Active bank panel
    const activeKey = S().bankingView.activeBank || "Mandiri";
    wrap.appendChild(renderBankPanel(activeKey));

    // Wire transfer button
    setTimeout(() => {
      const btn = document.querySelector("#open-transfer");
      if (btn) btn.addEventListener("click", () => openTransferModal(activeKey));
    }, 0);

    return wrap;
  }



  /* ---------- Per-bank panel: debit card + history ---------- */
  function renderBankPanel(bankKey) {
    const meta = BANK_META[bankKey];
    const balance = S().bankBalances[bankKey] || 0;
    const tier = tierOf(balance);
    const history = S().bankHistories[bankKey] || [];

    const wrap = document.createElement("div");
    wrap.className = `bank-panel ${meta.themeClass}`;

    // Debit card visual
    wrap.appendChild(renderDebitCard(bankKey, meta, balance, tier));

    // Tier explainer + transfer fee notice
    const tierCard = document.createElement("div");
    tierCard.className = "fb-card";
    tierCard.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs text-gray-500">Card Tier</p>
          <p class="font-bold text-lg">${tierLabel(tier)}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-500">Saldo</p>
          <p class="font-bold text-lg">${fmt(balance)}</p>
        </div>
      </div>
      <div class="tier-rules">
        <span class="tier-pill ${tier === 'regular' ? 'on' : ''}">Regular &lt; ${fmt(50_000_000)}</span>
        <span class="tier-pill ${tier === 'platinum' ? 'on' : ''}">Platinum ${fmt(50_000_000)}–${fmt(500_000_000)}</span>
        <span class="tier-pill ${tier === 'priority' ? 'on' : ''}">Priority &gt; ${fmt(500_000_000)}</span>
      </div>
      ${tier === "priority" ? `<p class="text-xs text-emerald-700 mt-2 font-semibold">✦ Priority benefit: Platform fee 0% saat menerima penjualan.</p>` : ""}
    `;
    wrap.appendChild(tierCard);

    // Transaction history
    const hist = document.createElement("div");
    hist.className = "fb-card";
    hist.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3>Mutasi Rekening</h3>
        <div class="flex items-center gap-2">
          <button id="export-monthly-profit" class="export-btn" title="Export Monthly Gross Profit Report">
            <i class="fa-solid fa-file-arrow-down"></i> Export
          </button>
          <span class="text-xs text-gray-500">${history.length} transaksi</span>
        </div>
      </div>
      <div class="history-list">
        ${history.length === 0
          ? `<p class="text-sm text-gray-500 text-center py-6">Belum ada transaksi di rekening ini.</p>`
          : history.slice().reverse().map(renderHistoryRow).join("")}
      </div>
    `;
    wrap.appendChild(hist);

    // Wire export button
    setTimeout(() => {
      const exportBtn = document.querySelector("#export-monthly-profit");
      if (exportBtn) exportBtn.addEventListener("click", () => {
        if (window.Analytics && window.Analytics.exportMonthlyReport) {
          window.Analytics.exportMonthlyReport();
        }
      });
    }, 0);

    return wrap;
  }

  function renderHistoryRow(entry) {
    const isCredit = entry.type === "CREDIT";
    const sign = isCredit ? "+" : "-";
    return `
      <div class="history-row">
        <div class="history-icon ${isCredit ? "credit" : "debit"}">
          <i class="fa-solid ${isCredit ? "fa-arrow-down" : "fa-arrow-up"}"></i>
        </div>
        <div class="history-body">
          <p class="history-desc">${entry.description}</p>
          <p class="history-meta">Day ${entry.day} &middot; Saldo: ${fmt(entry.balanceAfter)}</p>
        </div>
        <p class="history-amount ${isCredit ? "credit" : "debit"}">${sign}${fmt(entry.amount)}</p>
      </div>
    `;
  }



  /* ---------- Debit card visual ---------- */
  function renderDebitCard(bankKey, meta, balance, tier) {
    const card = document.createElement("div");
    card.className = `debit-card ${meta.themeClass} tier-${tier}`;
    card.innerHTML = `
      <div class="dc-shine"></div>
      <div class="dc-row dc-top">
        <div class="dc-bank">
          <span class="dc-logo">${meta.logo}</span>
          <span class="dc-bank-name">${meta.name}</span>
        </div>
        <span class="dc-tier-badge">${tierLabel(tier).toUpperCase()}</span>
      </div>
      <div class="dc-chip">
        <i class="fa-solid fa-microchip"></i>
      </div>
      <div class="dc-number">${meta.number}</div>
      <div class="dc-row dc-bottom">
        <div>
          <p class="dc-label">Card Holder</p>
          <p class="dc-holder">${S().player.name.toUpperCase()}</p>
        </div>
        <div class="text-right">
          <p class="dc-label">Balance</p>
          <p class="dc-balance">${fmt(balance)}</p>
        </div>
      </div>
      <div class="dc-network">
        <i class="fa-brands fa-cc-visa"></i>
      </div>
    `;
    return card;
  }

  /* ---------- Transfer modal ---------- */
  function openTransferModal(defaultFrom) {
    const modal = document.querySelector("#transfer-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const fromSel = modal.querySelector("#transfer-from");
    const toSel = modal.querySelector("#transfer-to");
    const amountInput = modal.querySelector("#transfer-amount");
    const feeText = modal.querySelector("#transfer-fee");
    const errText = modal.querySelector("#transfer-error");
    const submitBtn = modal.querySelector("#transfer-submit");
    const cancelBtn = modal.querySelector("#transfer-cancel");

    // Populate selects
    const banks = ["Mandiri", "BCA", "BNI"];
    fromSel.innerHTML = banks.map((b) => `<option value="${b}" ${b === defaultFrom ? "selected" : ""}>${b} — ${fmt(S().bankBalances[b] || 0)}</option>`).join("");
    function refreshTo() {
      const from = fromSel.value;
      toSel.innerHTML = banks.filter((b) => b !== from).map((b) => `<option value="${b}">${b}</option>`).join("");
    }
    refreshTo();
    fromSel.onchange = refreshTo;

    amountInput.value = "";
    errText.textContent = "";
    feeText.textContent = `Admin fee: ${fmt(TRANSFER_FEE)} per transfer.`;

    const close = () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    };
    cancelBtn.onclick = close;

    submitBtn.onclick = () => {
      errText.textContent = "";
      const from = fromSel.value;
      const to = toSel.value;
      const amount = Math.floor(Number(amountInput.value) || 0);
      if (!amount || amount <= 0) {
        errText.textContent = "Masukkan jumlah transfer yang valid.";
        return;
      }
      const totalDebit = amount + TRANSFER_FEE;
      if ((S().bankBalances[from] || 0) < totalDebit) {
        errText.textContent = `Saldo ${from} kurang. Butuh ${fmt(totalDebit)} (termasuk fee).`;
        return;
      }
      executeTransfer(from, to, amount);
      close();
      window.FlippingTycoon.renderActivePage();
    };
  }



  /* ---------- Execute interbank transfer with admin fee ---------- */
  function executeTransfer(from, to, amount) {
    const s = S();
    // Debit principal
    s.bankBalances[from] -= amount;
    s.bankHistories[from].push({
      type: "DEBIT",
      amount: amount,
      balanceAfter: s.bankBalances[from],
      description: `Transfer ke ${to}`,
      category: "transfer-out",
      day: s.currentDay,
      ts: Date.now(),
    });
    // Admin fee debit
    s.bankBalances[from] -= TRANSFER_FEE;
    s.bankHistories[from].push({
      type: "DEBIT",
      amount: TRANSFER_FEE,
      balanceAfter: s.bankBalances[from],
      description: `Biaya admin transfer antar bank`,
      category: "transfer-fee",
      day: s.currentDay,
      ts: Date.now(),
    });
    // Credit destination
    s.bankBalances[to] += amount;
    s.bankHistories[to].push({
      type: "CREDIT",
      amount: amount,
      balanceAfter: s.bankBalances[to],
      description: `Transfer masuk dari ${from}`,
      category: "transfer-in",
      day: s.currentDay,
      ts: Date.now(),
    });
    window.FlippingTycoon.saveGame();
  }

  /* ---------- Public API ---------- */
  window.Banking = {
    renderBankingPage,
    tierOf,
    tierLabel,
    BANK_META,
    TRANSFER_FEE,
  };
})();
