/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 34 — In-Game Editor Pack (Premium Unlock / IAP)
 *
 * Three concerns live in this module:
 *
 *   1. BrandMap engine (display-only)
 *      A canonical-string -> player-customized-string substitution
 *      that runs at the DOM layer. Internal state.inventory items,
 *      branch filters, partnership BRAND_GROUPS, etc. all keep
 *      using the canonical brand strings ("Pear", "Sumsang", ...)
 *      so gameplay logic is unchanged. Only what the user SEES on
 *      screen gets rewritten via a TreeWalker + MutationObserver.
 *
 *   2. In-App Purchase (IAP) placeholder
 *      triggerInAppPurchase(productId) attempts to call a native
 *      JS bridge (window.NativeBridge.purchase or similar). If
 *      no bridge is installed we fall back to a confirm() mock so
 *      the UX flow can still be demoed in a plain browser.
 *      On success we set state.isEditorUnlocked = true (persistent,
 *      single-purchase flag — non-consumable).
 *
 *   3. UI: Premium Unlocks page + In-Game Editor modal
 *      Two distinct sidebar entry points. The Editor entry only
 *      shows after the player owns the unlock.
 *
 * Public:
 *   window.BrandMap         — { transform, displayBrand, apply,
 *                               refresh, getMapping, hasAnyOverride,
 *                               BRAND_PARODIES }
 *   window.PremiumUnlocks   — { renderPremiumUnlocksPage,
 *                               triggerInAppPurchase, buyEditorPack }
 *   window.Editor           — { openEditorModal, closeEditorModal,
 *                               applyEditorChanges }
 * ========================================================= */

(function () {
  function S()    { return window.FlippingTycoon.State.data; }
  function save() {
    if (window.FlippingTycoon && window.FlippingTycoon.saveGame) {
      window.FlippingTycoon.saveGame();
    }
  }

  /* ---------- Brand parody registry ----------
   * `id`         lowercase key used for state.brandMapping[id]
   * `canonical`  the parody string baked into gadgets.js / news / etc.
   * `label`      what we show next to the input field in the editor
   * `placeholder` shown in the input when the player hasn't customized
   * ------------------------------------------- */
  const BRAND_PARODIES = [
    { id: "pear",    canonical: "Pear",    label: "Pear / PearPhone", placeholder: "Pear",    hint: "Contoh: Apple" },
    { id: "sumsang", canonical: "Sumsang", label: "Sumsang",          placeholder: "Sumsang", hint: "Contoh: Samsung" },
    { id: "siaomi",  canonical: "Siaomi",  label: "Siaomi",           placeholder: "Siaomi",  hint: "Contoh: Xiaomi" },
    { id: "pipo",    canonical: "Pipo",    label: "Pipo",             placeholder: "Pipo",    hint: "Contoh: Vivo" },
    { id: "ope",     canonical: "Ope",     label: "Ope",              placeholder: "Ope",     hint: "Contoh: Oppo" },
    { id: "netbook", canonical: "NetBook", label: "NetBook",          placeholder: "NetBook", hint: "Contoh: Facebook" },
  ];

  // Longest canonical first so "Sumsang" wins over a (hypothetical) "Sum"
  // and to avoid a customized "Pear" -> "Pearfect" loop when the player
  // types something that contains the canonical token.
  const SORTED_PARODIES = [...BRAND_PARODIES].sort(
    (a, b) => b.canonical.length - a.canonical.length
  );

  /* =========================================================
   * State
   * ========================================================= */
  function ensureState() {
    const s = S();
    if (typeof s.isEditorUnlocked !== "boolean") s.isEditorUnlocked = false;
    if (!s.brandMapping || typeof s.brandMapping !== "object") {
      s.brandMapping = {};
    }
  }

  function getMapping(id) {
    ensureState();
    const v = S().brandMapping[id];
    // Preserve leading/trailing whitespace deliberately — players use
    // it to control model-name spacing (e.g. "Apple " maps "PearPhone"
    // -> "Apple Phone" instead of "ApplePhone"). Only treat fully-empty
    // / whitespace-only values as "no override".
    if (typeof v !== "string" || !v.trim()) return "";
    return v;
  }

  function getEffectiveDisplay(parody) {
    return getMapping(parody.id) || parody.canonical;
  }

  /** Lookup a single canonical brand and return its current display. */
  function displayBrand(canonical) {
    if (!canonical) return canonical;
    const p = BRAND_PARODIES.find((x) =>
      x.canonical === canonical ||
      x.canonical.toLowerCase() === String(canonical).toLowerCase()
    );
    return p ? getEffectiveDisplay(p) : canonical;
  }

  /** Replace ALL canonical parody substrings in `text` with their
   *  customized version. Plain string replace — no word boundary —
   *  so "PearPhone" gracefully becomes "ApplePhone" when the player
   *  maps Pear -> "Apple". */
  function transform(text) {
    if (typeof text !== "string" || !text) return text;
    let out = text;
    for (const p of SORTED_PARODIES) {
      const display = getEffectiveDisplay(p);
      if (display === p.canonical) continue;        // no-op rewrite
      if (out.indexOf(p.canonical) === -1) continue; // fast path
      out = out.split(p.canonical).join(display);
    }
    return out;
  }

  function hasAnyOverride() {
    ensureState();
    const s = S();
    return BRAND_PARODIES.some((p) => {
      const v = s.brandMapping[p.id];
      return typeof v === "string" && v.trim() && v.trim() !== p.canonical;
    });
  }

  /* =========================================================
   * DOM transform — TreeWalker + MutationObserver
   *
   * This is the heart of the "real-time global mapping engine".
   * Every text node under <body> is rewritten the first time we
   * see it, and then the MutationObserver keeps newly-injected
   * subtrees in sync (modal bodies, dropdowns, page renders, ...).
   *
   * To stay safe we explicitly skip:
   *   - <input>, <textarea>, [contenteditable] (would corrupt typing)
   *   - <script>, <style>                       (not user-facing text)
   *   - Anything inside #editor-modal           (editor must show
   *                                              canonical placeholders)
   *   - Any element with [data-no-brand-transform] (opt-out hatch
   *                                                 for help copy
   *                                                 that mentions
   *                                                 "Pear", etc.)
   * ========================================================= */
  const SKIP_SELECTOR =
    "input, textarea, select, script, style, [contenteditable=true], " +
    "#editor-modal, [data-no-brand-transform]";

  function shouldSkip(node) {
    let p = node.parentElement;
    while (p) {
      if (p.matches && p.matches(SKIP_SELECTOR)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function applyToTextNode(tn) {
    const original = tn.nodeValue;
    if (!original) return;
    const transformed = transform(original);
    if (transformed !== original) tn.nodeValue = transformed;
  }

  /** Walk every text node under `root` and apply the brand transform.
   *  Cheap to call repeatedly because we early-exit when no override
   *  is configured AND the inner replace() also early-exits per-token.
   */
  function applyToDOM(root) {
    if (!root || !hasAnyOverride()) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!shouldSkip(root)) applyToTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const queue = [];
    let n;
    while ((n = walker.nextNode())) queue.push(n);
    queue.forEach(applyToTextNode);
  }

  /* MutationObserver keeps re-rendered pages, modals, dropdowns,
   * notifications, chat bubbles in sync with the current mapping. */
  let _observer = null;
  function startObserver() {
    if (_observer || !document.body) return;
    _observer = new MutationObserver((mutations) => {
      if (!hasAnyOverride()) return;
      for (const m of mutations) {
        m.addedNodes.forEach((node) => applyToDOM(node));
      }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  /* =========================================================
   * In-App Purchase — native bridge placeholder
   *
   * Resolves with { productId, success: true } on completion.
   * Rejects on user cancel / error.
   * ========================================================= */
  function triggerInAppPurchase(productId) {
    return new Promise((resolve, reject) => {
      // 1) Try a real native bridge if one is installed.
      try {
        if (window.NativeBridge && typeof window.NativeBridge.purchase === "function") {
          window.NativeBridge.purchase(productId, (success, err) => {
            if (success) resolve({ productId, success: true });
            else reject(new Error(err || "Purchase failed"));
          });
          return;
        }
        // iOS WKWebView style bridge
        if (window.webkit && window.webkit.messageHandlers
            && window.webkit.messageHandlers.iap
            && typeof window.webkit.messageHandlers.iap.postMessage === "function") {
          // Fire-and-forget: a real iOS app would post back via a global
          // callback. We fall through to the mock below if no callback
          // arrives within 250 ms.
          window.webkit.messageHandlers.iap.postMessage({ productId });
        }
      } catch (e) { /* fall through to mock */ }

      // 2) Browser-only fallback: a confirm() mock so the flow stays
      // demonstrable without an actual store backend.
      const ok = window.confirm(
        "[Mock IAP] Beli " + productId + " seharga Rp 29.000?\n\n" +
        "Native bridge tidak tersedia di lingkungan ini — klik OK untuk simulasi sukses, Cancel untuk batal."
      );
      if (!ok) { reject(new Error("User cancelled")); return; }
      setTimeout(() => resolve({ productId, success: true }), 400);
    });
  }

  /* =========================================================
   * Premium Unlocks — page renderer
   * ========================================================= */
  function renderPremiumUnlocksPage() {
    ensureState();
    const s = S();
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.className = "fb-card";
    header.setAttribute("data-no-brand-transform", "true");
    header.innerHTML = `
      <h3 class="flex items-center gap-2">
        <i class="fa-solid fa-gem text-amber-500"></i> Premium Unlocks
      </h3>
      <p class="text-sm text-gray-500 mt-1">
        Bayar pakai uang asli (real money) untuk unlock fitur premium permanent.
        Pembelian satu kali per akun &mdash; tidak memotong saldo bank atau koin in-game.
      </p>
    `;
    wrap.appendChild(header);

    const editorPack = document.createElement("div");
    editorPack.className = "fb-card premium-card";
    editorPack.setAttribute("data-no-brand-transform", "true");
    const unlocked = !!s.isEditorUnlocked;
    editorPack.innerHTML = `
      <div class="premium-card-row">
        <div class="premium-icon" style="background:#fef3c7;color:#d97706">
          <i class="fa-solid fa-pen-to-square"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="premium-card-title">In-Game Editor Pack</h3>
          <p class="text-sm text-gray-600 mt-1">
            Custom-rename semua brand parody di game. Ganti "Pear" jadi "Apple",
            "Sumsang" jadi "Samsung", "Siaomi" jadi "Xiaomi", dan seterusnya.
            Update real-time tanpa restart, tersimpan permanent.
          </p>
          <ul class="premium-perks">
            <li><i class="fa-solid fa-circle-check text-emerald-600"></i>
              Edit nama brand di seluruh game (Inventory, Partnerships, Marketplace, Chat, News).</li>
            <li><i class="fa-solid fa-circle-check text-emerald-600"></i>
              Update real-time &mdash; tidak butuh restart atau Next Day.</li>
            <li><i class="fa-solid fa-circle-check text-emerald-600"></i>
              Permanent unlock &mdash; sekali beli, dipakai selamanya.</li>
            <li><i class="fa-solid fa-circle-check text-emerald-600"></i>
              Tersimpan ke localStorage &mdash; aman walau game di-close.</li>
          </ul>
        </div>
        <div class="premium-cta-col">
          <p class="premium-price-tag">REAL MONEY</p>
          <p class="premium-price">Rp 29.000</p>
          <p class="premium-price-alt">≈ $1.99 USD</p>
          ${unlocked
            ? `<button class="premium-btn-owned" disabled>
                 <i class="fa-solid fa-check"></i> Unlocked / Dimiliki
               </button>`
            : `<button id="premium-buy-editor" class="premium-btn-buy" type="button">
                 <i class="fa-solid fa-gem"></i> Beli (Buy)
               </button>`}
        </div>
      </div>
    `;
    wrap.appendChild(editorPack);

    if (unlocked) {
      const tip = document.createElement("div");
      tip.className = "fb-card premium-tip";
      tip.setAttribute("data-no-brand-transform", "true");
      tip.innerHTML = `
        <p class="text-sm">
          <i class="fa-solid fa-circle-info text-cyan-600"></i>
          Editor sudah aktif &mdash; buka tombol
          <b>In-Game Editor</b> di sidebar kiri untuk custom rename brand.
        </p>
      `;
      wrap.appendChild(tip);
    }

    setTimeout(() => {
      const btn = document.querySelector("#premium-buy-editor");
      if (btn) btn.addEventListener("click", buyEditorPack);
    }, 0);

    return wrap;
  }

  /** Click handler for the "Beli (Buy)" button. */
  function buyEditorPack() {
    triggerInAppPurchase("item_editor_unlock")
      .then((result) => {
        if (!result || !result.success) {
          showToast("❌ Pembelian gagal.");
          return;
        }
        ensureState();
        S().isEditorUnlocked = true;
        save();
        showToast("✅ In-Game Editor Pack berhasil di-unlock!");
        // Re-render so the sidebar exposes the Editor entry and the
        // Premium Unlocks card flips to "Unlocked / Dimiliki".
        if (window.FlippingTycoon && window.FlippingTycoon.renderAll) {
          window.FlippingTycoon.renderAll();
        }
      })
      .catch((e) => {
        showToast("❌ Pembelian dibatalkan.");
        if (e && e.message) console.warn("[IAP] purchase rejected:", e.message);
      });
  }

  /* =========================================================
   * Editor modal — UI + apply logic
   * ========================================================= */
  function openEditorModal() {
    ensureState();
    const s = S();
    if (!s.isEditorUnlocked) {
      showToast("Editor belum di-unlock. Beli dulu di Premium Unlocks.");
      if (window.FlippingTycoon && window.FlippingTycoon.setActivePage) {
        window.FlippingTycoon.setActivePage("premium");
      }
      return;
    }
    const modal = document.querySelector("#editor-modal");
    if (!modal) {
      console.warn("[Editor] #editor-modal not found in DOM");
      return;
    }
    const body = modal.querySelector("#editor-body");
    body.innerHTML = `
      <p class="text-sm text-gray-600 mb-2">
        Custom rename brand parody. Kosongkan field untuk pakai default.
      </p>
      <p class="text-xs text-cyan-700 mb-4">
        <i class="fa-solid fa-circle-info"></i>
        Custom name juga dipakai sebagai prefix model
        (mis. ketik <b>Apple</b> &rarr; "PearPhone X" jadi "ApplePhone X").
        Kalau mau hasil natural, ketik <b>"Apple "</b> dengan spasi di belakang.
      </p>
      <div class="editor-grid">
        ${BRAND_PARODIES.map((p) => {
          const cur = s.brandMapping[p.id] || "";
          return `
            <label class="modal-label editor-row">
              <span class="editor-row-label">${escapeHtml(p.label)} <span class="editor-row-hint">${escapeHtml(p.hint)}</span></span>
              <input type="text"
                     class="modal-input editor-input"
                     data-id="${escapeAttr(p.id)}"
                     value="${escapeAttr(cur)}"
                     placeholder="${escapeAttr(p.placeholder)}"
                     maxlength="32"
                     spellcheck="false"
                     autocomplete="off" />
            </label>`;
        }).join("")}
      </div>
      <p id="editor-error" class="text-xs text-rose-600 font-semibold mt-2"></p>
    `;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const cancelBtn = modal.querySelector("#editor-cancel");
    const resetBtn  = modal.querySelector("#editor-reset");
    const applyBtn  = modal.querySelector("#editor-apply");
    if (cancelBtn) cancelBtn.onclick = closeEditorModal;
    if (resetBtn)  resetBtn.onclick  = () => {
      modal.querySelectorAll(".editor-input").forEach((inp) => { inp.value = ""; });
    };
    if (applyBtn)  applyBtn.onclick  = applyEditorChanges;
  }

  function closeEditorModal() {
    const modal = document.querySelector("#editor-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  function applyEditorChanges() {
    ensureState();
    const s = S();
    const inputs = document.querySelectorAll("#editor-modal .editor-input");
    const newMapping = {};
    inputs.forEach((inp) => {
      const id = inp.dataset.id;
      // Preserve player's leading/trailing spaces (matters for the
      // "Apple " trick that yields "Apple Phone X" instead of
      // "ApplePhone X"), but drop the entry entirely when empty.
      const val = (inp.value || "").replace(/\s+$/, " ").replace(/^\s+/, "");
      if (val.trim()) newMapping[id] = val;
    });
    s.brandMapping = newMapping;
    save();
    closeEditorModal();
    showToast("✅ Custom brand names diterapkan!");

    // Re-render everything so canonical strings flow back through
    // the templates, then let the observer (and a manual sweep) push
    // the new mapping into every text node.
    if (window.FlippingTycoon && window.FlippingTycoon.renderAll) {
      window.FlippingTycoon.renderAll();
    }
    setTimeout(() => applyToDOM(document.body), 0);
  }

  /* =========================================================
   * Helpers
   * ========================================================= */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(str) { return escapeHtml(str); }

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

  /* =========================================================
   * Boot
   * ========================================================= */
  function init() {
    try { ensureState(); } catch (e) { /* state may not be ready yet */ }
    startObserver();
    // First-pass sweep so any text rendered before init also gets
    // remapped (e.g. on a hot reload after the player already has a
    // saved mapping).
    if (document.body) applyToDOM(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* =========================================================
   * Public API
   * ========================================================= */
  window.BrandMap = {
    BRAND_PARODIES,
    transform,
    displayBrand,
    apply: applyToDOM,
    refresh: () => applyToDOM(document.body),
    getMapping,
    hasAnyOverride,
  };

  window.PremiumUnlocks = {
    renderPremiumUnlocksPage,
    triggerInAppPurchase,
    buyEditorPack,
  };

  window.Editor = {
    openEditorModal,
    closeEditorModal,
    applyEditorChanges,
  };
})();
