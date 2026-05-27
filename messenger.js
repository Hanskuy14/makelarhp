/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 10 — Messenger Overlay
 *
 * Top-bar Messenger button opens a Facebook-style chat list:
 *   Active Chats   = ongoing negotiations (live & resumable)
 *     - Buyer chats: marketplace listings the player has talked to
 *     - Seller chats: the player's listings with offer-pending state
 *   Archived Chats = closed conversations (sold, walked away, etc.)
 *
 * Click an active chat → opens the live chat overlay.
 * Click an archived chat → opens a read-only archive viewer.
 * ========================================================= */

(function () {
  function S()   { return window.FlippingTycoon.State.data; }
  function fmt(n) { return window.Market ? window.Market.formatRupiah(n) : ("Rp " + (n || 0).toLocaleString("id-ID")); }

  let messengerView = "active"; // "active" | "archived"

  /* =========================================================
   * Open / close
   * ========================================================= */
  function attachButtonHandler() {
    const btn = document.querySelector("#messenger-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOverlay();
    });
    document.addEventListener("click", (e) => {
      const dropdown = document.querySelector("#messenger-dropdown");
      if (!dropdown || dropdown.classList.contains("hidden")) return;
      if (dropdown.contains(e.target) || (btn && btn.contains(e.target))) return;
      closeOverlay();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeOverlay();
    });
  }

  function toggleOverlay() {
    const dd = document.querySelector("#messenger-dropdown");
    if (!dd) return;
    if (dd.classList.contains("hidden")) openOverlay();
    else closeOverlay();
  }

  function openOverlay() {
    const dd = document.querySelector("#messenger-dropdown");
    if (!dd) return;
    refreshOverlay();
    dd.classList.remove("hidden");
    requestAnimationFrame(() => dd.classList.add("show"));
    refreshUnreadBadge(true);
  }

  function closeOverlay() {
    const dd = document.querySelector("#messenger-dropdown");
    if (!dd) return;
    dd.classList.remove("show");
    setTimeout(() => dd.classList.add("hidden"), 160);
  }

  /* =========================================================
   * Unread badge (top-bar)
   * ========================================================= */
  function refreshUnreadBadge(reset) {
    const badge = document.querySelector("#messenger-badge");
    if (!badge) return;
    const count = countAttention();
    if (reset || count === 0) {
      badge.classList.add("hidden");
      badge.textContent = "0";
      return;
    }
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.classList.remove("hidden");
    badge.classList.remove("notif-badge-pop"); void badge.offsetWidth;
    badge.classList.add("notif-badge-pop");
  }

  /** Active chats that need attention (= seller-side offer-pending). */
  function countAttention() {
    const s = S();
    return (s.activeListings || []).filter(
      (l) => l.negotiationState === "offer-pending" && l.currentOffer && !l.currentOffer.opened
    ).length;
  }

  /* =========================================================
   * Active / Archived data sources
   * ========================================================= */

  /** Buyer-side: listings the player has chatted on the marketplace. */
  function activeBuyerChats() {
    const s = S();
    return (s.dailyListings || [])
      .filter((l) => Array.isArray(l.chatLog) && l.chatLog.length > 0)
      .map((l) => ({
        kind: "buyer",
        listingId: l.listingId,
        counterparty: {
          name:   l.seller.name,
          avatar: l.seller.avatar,
          color:  l.seller.color,
          location: l.seller.location || null,
        },
        gadget: {
          name: l.name,
          icon: l.icon,
          accent: l.accent,
          brand: l.brand,
          isExInter: !!l.isExInter,
        },
        lastMessage: lastMessage(l.chatLog),
        priceLabel: "Asking " + fmt(l.haggleState === "accepted" ? l.currentPrice : l.finalPrice),
        urgent: false,
        dayUpdated: s.currentDay,
      }));
  }

  /** Seller-side: player's listings with active negotiation. */
  function activeSellerChats() {
    const s = S();
    return (s.activeListings || [])
      .filter((l) => l.negotiationState === "offer-pending" && l.currentOffer)
      .map((l) => ({
        kind: "seller",
        listingId: l.listingId,
        counterparty: {
          name:   l.currentOffer.buyer.name,
          avatar: l.currentOffer.buyer.avatar,
          color:  l.currentOffer.buyer.color,
          location: l.currentOffer.buyer.location || null,
        },
        gadget: {
          name: l.itemSnapshot.name,
          icon: l.itemSnapshot.icon,
          accent: l.itemSnapshot.accent,
          brand: l.itemSnapshot.brand,
          isExInter: !!l.itemSnapshot.isExInter,
        },
        lastMessage: lastMessage(l.chatLog),
        priceLabel: "Offer " + fmt(l.currentOffer.offeredPrice),
        urgent: !l.currentOffer.opened,
        dayUpdated: l.listedDay + (l.daysListed || 0),
      }));
  }

  function lastMessage(chatLog) {
    if (!Array.isArray(chatLog) || chatLog.length === 0) return null;
    const last = chatLog[chatLog.length - 1];
    return {
      from: last.from,
      text: (last.text || "").slice(0, 80),
    };
  }

  /* =========================================================
   * Render
   * ========================================================= */
  function refreshOverlay() {
    const dd = document.querySelector("#messenger-dropdown");
    if (!dd) return;
    const active = [...activeSellerChats(), ...activeBuyerChats()];
    const archived = (S().chatArchive || []);

    dd.innerHTML = `
      <div class="messenger-header">
        <div>
          <p class="messenger-title">Chats</p>
          <p class="messenger-sub">${active.length} active &middot; ${archived.length} archived</p>
        </div>
        <div class="messenger-tools">
          <button class="messenger-tool" title="New chat" type="button"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="messenger-tool" title="Settings" type="button"><i class="fa-solid fa-gear"></i></button>
          <button class="messenger-tool" title="Close" type="button" id="messenger-close-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="messenger-tabs">
        <button class="messenger-tab ${messengerView === "active" ? "active" : ""}" data-view="active" type="button">
          <i class="fa-solid fa-circle-dot"></i> Active
          ${active.length ? `<span class="messenger-tab-count">${active.length}</span>` : ""}
        </button>
        <button class="messenger-tab ${messengerView === "archived" ? "active" : ""}" data-view="archived" type="button">
          <i class="fa-solid fa-box-archive"></i> Archived
          ${archived.length ? `<span class="messenger-tab-count">${archived.length}</span>` : ""}
        </button>
      </div>
      <div id="messenger-list" class="messenger-list"></div>
    `;

    // Wire tabs
    dd.querySelectorAll(".messenger-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        messengerView = btn.dataset.view;
        refreshOverlay();
      });
    });
    const closeBtn = dd.querySelector("#messenger-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeOverlay);

    const list = dd.querySelector("#messenger-list");
    if (messengerView === "active") {
      if (active.length === 0) {
        list.appendChild(renderEmpty("Tidak ada chat aktif", "Chat aktif muncul saat ada pembeli menawar atau saat kamu nego seller di Marketplace."));
      } else {
        active.forEach((row) => list.appendChild(renderActiveRow(row)));
      }
    } else {
      if (archived.length === 0) {
        list.appendChild(renderEmpty("Belum ada chat ter-arsip", "Chat yang sudah selesai (deal sukses, batal, atau ditinggal) akan masuk ke sini."));
      } else {
        archived.forEach((arc) => list.appendChild(renderArchivedRow(arc)));
      }
    }
  }

  function renderEmpty(title, subtitle) {
    const div = document.createElement("div");
    div.className = "messenger-empty";
    div.innerHTML = `
      <div class="messenger-empty-icon"><i class="fa-brands fa-facebook-messenger"></i></div>
      <p class="font-semibold">${title}</p>
      <p class="messenger-empty-sub">${subtitle}</p>
    `;
    return div;
  }

  function renderActiveRow(row) {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "messenger-row" + (row.urgent ? " urgent" : "");
    const lastTxt = row.lastMessage
      ? (row.lastMessage.from === "player" ? "You: " : "")
        + (row.lastMessage.text || "")
      : "";
    const iconName = row.gadget.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    div.innerHTML = `
      <div class="messenger-avatar" style="background:${row.counterparty.color || "#9ca3af"}">
        ${escapeHtml(row.counterparty.avatar || "?")}
        <span class="messenger-avatar-status"></span>
      </div>
      <div class="messenger-row-body">
        <div class="messenger-row-top">
          <p class="messenger-row-name">${escapeHtml(row.counterparty.name)}</p>
          <span class="messenger-row-tag ${row.kind}">${row.kind === "buyer" ? "Marketplace" : "Buyer Offer"}</span>
        </div>
        <p class="messenger-row-snippet">
          ${row.lastMessage ? escapeHtml(lastTxt) : "(belum ada chat)"}
        </p>
        <div class="messenger-row-meta">
          <span><i class="fa-solid fa-${iconName}" style="color:${row.gadget.accent || "#1c1c1e"}"></i> ${escapeHtml(row.gadget.name)}</span>
          <span class="messenger-row-price">${escapeHtml(row.priceLabel)}</span>
        </div>
      </div>
      ${row.urgent ? `<span class="messenger-row-dot"></span>` : ""}
    `;
    div.addEventListener("click", () => {
      closeOverlay();
      if (row.kind === "buyer") {
        if (window.Chat) window.Chat.openWithListing(row.listingId);
      } else {
        if (window.Selling) window.Selling.openBuyerChat(row.listingId);
      }
    });
    return div;
  }

  function renderArchivedRow(arc) {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "messenger-row archived";
    const iconName = arc.gadget && arc.gadget.icon === "tablet" ? "tablet-screen-button" : "mobile-screen-button";
    const outcomeBadge = ({
      "sold":       { label: "SOLD",      cls: "outcome-sold" },
      "purchased":  { label: "PURCHASED", cls: "outcome-sold" },
      "cancelled":  { label: "CANCELLED", cls: "outcome-cancelled" },
      "left":       { label: "LEFT",      cls: "outcome-left" },
      "walked-out": { label: "GONE",      cls: "outcome-cancelled" },
    }[arc.outcome] || { label: "ARCHIVED", cls: "outcome-left" });
    const lastMsg = arc.chatLog && arc.chatLog.length
      ? (arc.chatLog[arc.chatLog.length - 1].from === "player" ? "You: " : "")
        + (arc.chatLog[arc.chatLog.length - 1].text || "").slice(0, 80)
      : "(no messages)";
    div.innerHTML = `
      <div class="messenger-avatar" style="background:${arc.counterparty.color || "#9ca3af"}; opacity:0.8">
        ${escapeHtml(arc.counterparty.avatar || "?")}
      </div>
      <div class="messenger-row-body">
        <div class="messenger-row-top">
          <p class="messenger-row-name">${escapeHtml(arc.counterparty.name)}</p>
          <span class="messenger-row-tag outcome ${outcomeBadge.cls}">${outcomeBadge.label}</span>
        </div>
        <p class="messenger-row-snippet">${escapeHtml(lastMsg)}</p>
        <div class="messenger-row-meta">
          <span><i class="fa-solid fa-${iconName}" style="color:${arc.gadget && arc.gadget.accent || "#1c1c1e"}"></i> ${escapeHtml(arc.gadget && arc.gadget.name || "—")}</span>
          <span class="messenger-row-price">Day ${arc.day}${arc.finalPrice != null ? " &middot; " + fmt(arc.finalPrice) : ""}</span>
        </div>
      </div>
    `;
    div.addEventListener("click", () => openArchiveModal(arc.id));
    return div;
  }

  /* =========================================================
   * Archived chat read-only modal
   * ========================================================= */
  function openArchiveModal(archiveId) {
    closeOverlay();
    const s = S();
    const arc = (s.chatArchive || []).find((a) => a.id === archiveId);
    if (!arc) return;
    const modal = document.querySelector("#archive-chat-overlay");
    if (!modal) return;
    const header = modal.querySelector("#archive-chat-header");
    const body = modal.querySelector("#archive-chat-messages");
    const meta = modal.querySelector("#archive-chat-meta");

    const outcomeText = ({
      "sold":       "Sold to " + arc.counterparty.name,
      "purchased":  "Purchased from " + arc.counterparty.name,
      "cancelled":  "Cancelled",
      "left":       "Closed without deal",
      "walked-out": "Counterparty walked out",
    }[arc.outcome] || "Archived");

    header.innerHTML = `
      <button class="chat-icon-btn" id="archive-chat-close" type="button" title="Close">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="chat-header-avatar" style="background:${arc.counterparty.color || "#9ca3af"}">
        ${escapeHtml(arc.counterparty.avatar || "?")}
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${escapeHtml(arc.counterparty.name)}</p>
        <p class="text-xs text-gray-500">
          <i class="fa-solid fa-box-archive"></i> Archived &middot; Day ${arc.day}
        </p>
      </div>
      <button class="chat-icon-btn" type="button" title="Info"><i class="fa-solid fa-circle-info"></i></button>
    `;
    header.querySelector("#archive-chat-close").addEventListener("click", closeArchiveModal);

    meta.innerHTML = `
      <div class="archive-meta">
        <div><i class="fa-solid fa-tag"></i> ${escapeHtml(arc.gadget ? arc.gadget.name : "—")}</div>
        <div><i class="fa-solid fa-flag-checkered"></i> ${escapeHtml(outcomeText)}${arc.finalPrice != null ? " &middot; " + fmt(arc.finalPrice) : ""}</div>
      </div>
    `;

    body.innerHTML = "";
    (arc.chatLog || []).forEach((m) => {
      const div = document.createElement("div");
      if (m.from === "system") {
        div.className = "chat-row from-system";
        div.innerHTML = `<div class="chat-system">${escapeHtml(m.text || "")}</div>`;
      } else {
        const isCounterparty = (m.from === "seller" || m.from === "buyer");
        const isPlayer = m.from === "player";
        div.className = "chat-row " + (isPlayer ? "from-player" : "from-seller");
        const avatar = isCounterparty
          ? `<div class="chat-bubble-avatar" style="background:${m.color || arc.counterparty.color || "#999"}">${escapeHtml(m.avatar || arc.counterparty.avatar || "?")}</div>`
          : "";
        const bubble = `<div class="chat-bubble">${escapeHtml(m.text || "").replace(/\n/g, "<br>")}</div>`;
        div.innerHTML = avatar + bubble;
      }
      body.appendChild(div);
    });
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeArchiveModal() {
    const modal = document.querySelector("#archive-chat-overlay");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---------- Public API ---------- */
  window.Messenger = {
    attachButtonHandler,
    refreshUnreadBadge,
    openOverlay,
    closeOverlay,
  };
})();
