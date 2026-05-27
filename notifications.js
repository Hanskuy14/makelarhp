/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 8 — Notification Center (bell badge + dropdown + nav)
 * ========================================================= */

(function () {
  function S() { return window.FlippingTycoon.State.data; }
  function uid() { return "n-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36); }

  const MAX_KEEP = 60; // hard cap; older notifications get trimmed

  /* ---------- Type → icon/color map ---------- */
  const TYPE_META = {
    success: { icon: "circle-check",          color: "#059669", bg: "#d1fae5" },
    alert:   { icon: "circle-exclamation",    color: "#b91c1c", bg: "#fee2e2" },
    warning: { icon: "triangle-exclamation",  color: "#b45309", bg: "#fef3c7" },
    info:    { icon: "circle-info",           color: "#1d4ed8", bg: "#dbeafe" },
    social:  { icon: "user-group",            color: "#7e22ce", bg: "#ede9fe" },
    scam:    { icon: "user-secret",           color: "#9f1239", bg: "#ffe4e6" },
  };
  function metaFor(type) { return TYPE_META[type] || TYPE_META.info; }

  function ensureArray() {
    const s = S();
    if (!Array.isArray(s.notifications)) s.notifications = [];
  }

  /* =========================================================
   * Public API
   * ========================================================= */

  /**
   * @param {Object} opts
   * @param {string} opts.message
   * @param {"success"|"alert"|"warning"|"info"|"social"|"scam"} [opts.type]
   * @param {string} [opts.actionPage]       Page id to navigate to on click.
   * @param {Object} [opts.actionData]       Optional context (e.g., { listingId }).
   * @param {string} [opts.icon]             Override Font Awesome icon name (without `fa-`).
   * @param {string} [opts.title]            Optional bold heading line.
   * @param {string} [opts.actor]            Source label (e.g., "Repair Center", "Andre Reseller").
   */
  function add(opts) {
    if (!opts || !opts.message) return null;
    ensureArray();
    const s = S();
    const note = {
      id: uid(),
      message: opts.message,
      title: opts.title || null,
      type: opts.type || "info",
      isRead: false,
      timestamp: Date.now(),
      day: s.currentDay,
      actionPage: opts.actionPage || null,
      actionData: opts.actionData || null,
      icon: opts.icon || null,
      actor: opts.actor || null,
    };
    s.notifications.unshift(note);
    if (s.notifications.length > MAX_KEEP) s.notifications.length = MAX_KEEP;
    if (window.FlippingTycoon && window.FlippingTycoon.saveGame) {
      window.FlippingTycoon.saveGame();
    }
    refreshBadge();
    refreshDropdownIfOpen();
    return note.id;
  }

  function markRead(id) {
    ensureArray();
    const note = S().notifications.find((n) => n.id === id);
    if (note && !note.isRead) {
      note.isRead = true;
      window.FlippingTycoon.saveGame();
      refreshBadge();
    }
  }

  function markAllRead() {
    ensureArray();
    let changed = false;
    S().notifications.forEach((n) => {
      if (!n.isRead) { n.isRead = true; changed = true; }
    });
    if (changed) {
      window.FlippingTycoon.saveGame();
      refreshBadge();
      refreshDropdownIfOpen();
    }
  }

  function clearAll() {
    ensureArray();
    S().notifications = [];
    window.FlippingTycoon.saveGame();
    refreshBadge();
    refreshDropdownIfOpen();
  }

  function unreadCount() {
    ensureArray();
    return S().notifications.filter((n) => !n.isRead).length;
  }

  function recent(limit = 30) {
    ensureArray();
    return S().notifications.slice(0, limit);
  }

  /* =========================================================
   * Bell badge updater
   * ========================================================= */
  function refreshBadge() {
    const badge = document.querySelector("#notif-badge");
    if (!badge) return;
    const n = unreadCount();
    if (n > 0) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.classList.remove("hidden");
      badge.classList.add("notif-badge-pop");
      setTimeout(() => badge.classList.remove("notif-badge-pop"), 320);
    } else {
      badge.classList.add("hidden");
    }
  }

  /* =========================================================
   * Dropdown overlay
   * ========================================================= */
  let _outsideHandler = null;
  let _escHandler = null;

  function isOpen() {
    const dd = document.querySelector("#notif-dropdown");
    return dd && !dd.classList.contains("hidden");
  }

  function open() {
    const dd = document.querySelector("#notif-dropdown");
    if (!dd) return;
    renderDropdownInto(dd);
    dd.classList.remove("hidden");
    requestAnimationFrame(() => dd.classList.add("show"));

    // Outside click to close
    _outsideHandler = (e) => {
      if (dd.contains(e.target)) return;
      if (e.target.closest("#notif-bell-btn")) return;
      close();
    };
    setTimeout(() => document.addEventListener("mousedown", _outsideHandler), 0);

    _escHandler = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", _escHandler);
  }

  function close() {
    const dd = document.querySelector("#notif-dropdown");
    if (!dd) return;
    dd.classList.remove("show");
    setTimeout(() => dd.classList.add("hidden"), 150);
    if (_outsideHandler) {
      document.removeEventListener("mousedown", _outsideHandler);
      _outsideHandler = null;
    }
    if (_escHandler) {
      document.removeEventListener("keydown", _escHandler);
      _escHandler = null;
    }
  }

  function toggle() { isOpen() ? close() : open(); }

  function refreshDropdownIfOpen() {
    if (!isOpen()) return;
    const dd = document.querySelector("#notif-dropdown");
    if (dd) renderDropdownInto(dd);
  }

  function renderDropdownInto(dd) {
    const list = recent(40);
    const unread = unreadCount();
    dd.innerHTML = `
      <div class="notif-dd-header">
        <div>
          <p class="notif-dd-title">Notifications</p>
          <p class="notif-dd-sub">${unread > 0 ? `${unread} unread` : "All caught up"}</p>
        </div>
        <div class="notif-dd-tools">
          <button class="notif-tool" id="notif-mark-all" title="Mark all as read">
            <i class="fa-solid fa-check-double"></i>
          </button>
          <button class="notif-tool" id="notif-clear" title="Clear all">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
      <div class="notif-dd-list">
        ${list.length === 0
          ? `<div class="notif-empty">
               <div class="notif-empty-icon"><i class="fa-regular fa-bell-slash"></i></div>
               <p>Belum ada notifikasi.</p>
               <p class="text-xs text-gray-500">Aktivitas game (repair, kargo, sale, dll.) akan muncul di sini.</p>
             </div>`
          : list.map(renderItemHTML).join("")}
      </div>
    `;
    dd.querySelectorAll(".notif-item").forEach((row) => {
      const id = row.dataset.id;
      row.addEventListener("click", () => onItemClick(id));
    });
    const ma = dd.querySelector("#notif-mark-all");
    if (ma) ma.addEventListener("click", (e) => { e.stopPropagation(); markAllRead(); });
    const cl = dd.querySelector("#notif-clear");
    if (cl) cl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Bersihkan semua notifikasi?")) clearAll();
    });
  }

  function renderItemHTML(n) {
    const meta = metaFor(n.type);
    const icon = n.icon || meta.icon;
    return `
      <div class="notif-item ${n.isRead ? "read" : "unread"}" data-id="${n.id}">
        <div class="notif-item-icon" style="background:${meta.bg};color:${meta.color}">
          <i class="fa-solid fa-${icon}"></i>
        </div>
        <div class="notif-item-body">
          ${n.title ? `<p class="notif-item-title">${escapeHTML(n.title)}</p>` : ""}
          <p class="notif-item-msg">${escapeHTML(n.message)}</p>
          <p class="notif-item-meta">
            ${n.actor ? `<span class="notif-item-actor">${escapeHTML(n.actor)}</span> &middot; ` : ""}
            Day ${n.day} &middot; ${formatRelative(n.timestamp)}
          </p>
        </div>
        ${!n.isRead ? `<span class="notif-item-dot"></span>` : ""}
      </div>
    `;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatRelative(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return `${m}m lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}j lalu`;
    const d = Math.floor(h / 24);
    return `${d}h lalu`;
  }

  function onItemClick(id) {
    const note = S().notifications.find((n) => n.id === id);
    if (!note) return;
    markRead(id);
    if (note.actionPage) {
      // Stash action context so target page can use it (e.g., open a specific listing).
      S().notificationContext = note.actionData || null;
      close();
      window.FlippingTycoon.setActivePage(note.actionPage);
    } else {
      // Just mark read; rerender dropdown.
      refreshDropdownIfOpen();
    }
  }


  /* =========================================================
   * Bell wiring (called from script.js after DOM ready)
   * ========================================================= */
  function attachBellHandler() {
    const bell = document.querySelector("#notif-bell-btn");
    if (!bell) return;
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    refreshBadge();
  }

  /* ---------- Public API ---------- */
  window.Notifications = {
    add,
    markRead,
    markAllRead,
    clearAll,
    unreadCount,
    recent,
    open,
    close,
    toggle,
    refreshBadge,
    attachBellHandler,
  };
})();
