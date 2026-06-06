/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 36 — Internationalization (i18n)
 *
 * A tiny, zero-dependency bilingual engine (English + Bahasa
 * Indonesia). No React / Vue / i18next — just a dictionary
 * object and a key-lookup function, so the bundle stays small.
 *
 * Public API:
 *   window.t(key, params)             -> translated string
 *   window.i18n.t(key, params)        -> same as above
 *   window.i18n.getLang()             -> "id" | "en"
 *   window.i18n.switchLanguage(code)  -> set lang + save + re-render
 *   window.switchLanguage(code)       -> global alias
 *   window.i18n.applyStaticDom(root)  -> translate [data-i18n] nodes
 *   window.i18n.DICT                  -> the raw dictionary
 *
 * Load order: this file MUST be included FIRST in index.html
 * (before gadgets.js / all other modules / script.js) so every
 * render function can safely call t().
 * ========================================================= */

(function () {
  "use strict";

  const DEFAULT_LANG  = "id"; // game ships Indonesian-first
  const FALLBACK_LANG = "en"; // graceful fallback when a key is missing
  const LANG_MIRROR_KEY = "ft-lang"; // lightweight localStorage mirror

  /* =========================================================
   * 1. THE TRANSLATION DICTIONARY
   *
   * Keys are grouped by domain (common, nav, market, banking,
   * inventory, vipChat, settings, game). Reference any string
   * with a dotted path, e.g. t("banking.transfer").
   * ========================================================= */
  const DICT = {
    en: {
      common: {
        buy: "Buy",
        sell: "Sell",
        nextDay: "Next Day",
        cancel: "Cancel",
        confirm: "Confirm",
        save: "Save",
        close: "Close",
        yes: "Yes",
        no: "No",
        back: "Back",
        loading: "Loading...",
        total: "Total",
        price: "Price",
        value: "Value",
        condition: "Condition",
        all: "All",
        search: "Search",
      },
      nav: {
        newsFeed: "News Feed",
        marketplace: "Marketplace",
        inventory: "Inventory",
        banking: "Banking",
        repair: "Repair Center",
        batam: "Batam Supplier",
        logistics: "Cargo / Logistics",
        settings: "Settings",
      },
      market: {
        title: "Marketplace",
        buyButton: "Buy Now",
        sellButton: "Sell",
        haggle: "Haggle",
        suggestedPrice: "Suggested Price",
        marketPrice: "Market Price",
        brand: "Brand",
        model: "Model",
        outOfStock: "Sold Out",
      },
      banking: {
        title: "Banking",
        transfer: "Transfer",
        deposit: "Deposit",
        withdraw: "Withdraw",
        balance: "Balance",
        totalBalance: "Total balance",
        accountName: "Account / Bank Name",
        transferFee: "Transfer fee",
        save: "Save",
      },
      inventory: {
        title: "Inventory",
        empty: "Your inventory is empty.",
        sellNow: "Sell Now",
        listForSale: "List for Sale",
        repair: "Repair",
        buyPrice: "Buy Price",
        holdingCost: "Holding Cost",
        units: "{count} units",
      },
      vipChat: {
        title: "VIP Reseller Group",
        joinFee: "Join Fee",
        makeOffer: "Make Offer",
        accept: "Accept",
        decline: "Decline",
        dealClosed: "Deal closed!",
        nego: "Nego",
      },
      settings: {
        language: "Language",
        languageName: "English",
        darkMode: "Dark Mode",
      },
      game: {
        reputation: "Reputation",
        netWorth: "Net Worth",
        batangan: "Unit Only (Batangan)",
        fullset: "Fullset",
        mulus: "Flawless",
        exInter: "Ex-Inter",
        jackpot: "JACKPOT",
        mysteryPallet: "Mystery Pallet",
        day: "Day",
      },
    },

    id: {
      common: {
        buy: "Beli",
        sell: "Jual",
        nextDay: "Hari Berikutnya",
        cancel: "Batal",
        confirm: "Konfirmasi",
        save: "Simpan",
        close: "Tutup",
        yes: "Ya",
        no: "Tidak",
        back: "Kembali",
        loading: "Memuat...",
        total: "Total",
        price: "Harga",
        value: "Nilai",
        condition: "Kondisi",
        all: "Semua",
        search: "Cari",
      },
      nav: {
        newsFeed: "Beranda",
        marketplace: "Marketplace",
        inventory: "Inventaris",
        banking: "Perbankan",
        repair: "Pusat Servis",
        batam: "Supplier Batam",
        logistics: "Kargo / Logistik",
        settings: "Pengaturan",
      },
      market: {
        title: "Marketplace",
        buyButton: "Beli Sekarang",
        sellButton: "Jual",
        haggle: "Nego",
        suggestedPrice: "Harga Saran",
        marketPrice: "Harga Pasar",
        brand: "Merek",
        model: "Model",
        outOfStock: "Terjual",
      },
      banking: {
        title: "Perbankan",
        transfer: "Transfer",
        deposit: "Setor",
        withdraw: "Tarik",
        balance: "Saldo",
        totalBalance: "Total saldo",
        accountName: "Nama Rekening / Bank",
        transferFee: "Biaya transfer",
        save: "Simpan",
      },
      inventory: {
        title: "Inventaris",
        empty: "Inventaris kamu kosong.",
        sellNow: "Jual Sekarang",
        listForSale: "Pasang Iklan",
        repair: "Servis",
        buyPrice: "Harga Beli",
        holdingCost: "Biaya Simpan",
        units: "{count} unit",
      },
      vipChat: {
        title: "Grup Reseller VIP",
        joinFee: "Biaya Gabung",
        makeOffer: "Ajukan Penawaran",
        accept: "Terima",
        decline: "Tolak",
        dealClosed: "Deal!",
        nego: "Nego",
      },
      settings: {
        language: "Bahasa",
        languageName: "Bahasa Indonesia",
        darkMode: "Mode Gelap",
      },
      game: {
        reputation: "Reputasi",
        netWorth: "Kekayaan Bersih",
        batangan: "HP Only (Batangan)",
        fullset: "Fullset",
        mulus: "Mulus",
        exInter: "Ex-Inter",
        jackpot: "JACKPOT",
        mysteryPallet: "Mystery Pallet",
        day: "Hari",
      },
    },
  };

  /* In-module cache of the active language. getLang() prefers the
   * game State (single source of truth) but falls back to this cache
   * and the localStorage mirror so t() works even before the save
   * has finished loading (e.g. splash screen / very first paint). */
  let _lang = (function readMirror() {
    try {
      const m = localStorage.getItem(LANG_MIRROR_KEY);
      if (m && DICT[m]) return m;
    } catch (e) {}
    return DEFAULT_LANG;
  })();

  /* =========================================================
   * 2. THE TRANSLATION ENGINE
   * ========================================================= */

  /** Read the active language. State wins when available & valid. */
  function getLang() {
    try {
      const fromState =
        window.FlippingTycoon &&
        window.FlippingTycoon.State &&
        window.FlippingTycoon.State.data &&
        window.FlippingTycoon.State.data.settings &&
        window.FlippingTycoon.State.data.settings.language;
      if (fromState && DICT[fromState]) {
        _lang = fromState;
        return fromState;
      }
    } catch (e) {}
    return DICT[_lang] ? _lang : DEFAULT_LANG;
  }

  /** Walk a dotted key path inside a language tree. Returns undefined if absent. */
  function lookup(langTree, key) {
    if (!langTree) return undefined;
    let node = langTree;
    const parts = key.split(".");
    for (let i = 0; i < parts.length; i++) {
      if (node == null || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return typeof node === "string" ? node : undefined;
  }

  /** Replace {placeholders} in a template with values from params. */
  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m
    );
  }

  /**
   * t(key, params) — translate a dotted key.
   * Fallback chain: activeLang -> English -> the key string itself
   * (so a missing key shows the key, never "undefined").
   */
  function t(key, params) {
    if (!key || typeof key !== "string") return "";
    const lang = getLang();

    let str = lookup(DICT[lang], key);
    if (str === undefined && lang !== FALLBACK_LANG) {
      str = lookup(DICT[FALLBACK_LANG], key); // graceful English fallback
    }
    if (str === undefined) {
      // Final safety net: return the key so nothing renders as "undefined".
      if (window.console && console.warn) console.warn("[i18n] missing key:", key);
      return key;
    }
    return interpolate(str, params);
  }

  /* =========================================================
   * 3. STATE + PERSISTENCE
   * ========================================================= */

  /** Persist the chosen language into State (auto-saved) + a fast mirror. */
  function persistLang(code) {
    _lang = code;
    try { localStorage.setItem(LANG_MIRROR_KEY, code); } catch (e) {}

    try {
      const st = window.FlippingTycoon && window.FlippingTycoon.State;
      if (st && st.data) {
        if (!st.data.settings) st.data.settings = {};
        st.data.settings.language = code;
        if (typeof window.FlippingTycoon.saveGame === "function") {
          window.FlippingTycoon.saveGame();
        }
      }
    } catch (e) {}
  }

  /* =========================================================
   * 4. UI INTEGRATION — switcher + static-DOM translation
   * ========================================================= */

  /**
   * switchLanguage(code) — set the language, persist it, then trigger
   * a full UI re-render so every translated string updates instantly.
   */
  function switchLanguage(code) {
    if (!DICT[code]) {
      if (window.console && console.warn) console.warn("[i18n] unknown language:", code);
      return false;
    }
    persistLang(code);

    // Reflect on the document for accessibility + CSS hooks.
    try { document.documentElement.setAttribute("lang", code); } catch (e) {}

    // Friendly click feedback if the audio engine is loaded.
    try { window.AudioManager && window.AudioManager.playClick(); } catch (e) {}

    // Re-translate any static (non-rendered) DOM, refresh switcher labels.
    applyStaticDom(document);
    updateSwitcherLabels();

    // Full re-render of the app. Prefer the broadest re-render available.
    try {
      const FT = window.FlippingTycoon;
      if (FT && typeof FT.renderAllPages === "function") FT.renderAllPages();
      else if (FT && typeof FT.renderAll === "function") FT.renderAll();
      else if (FT && typeof FT.renderActivePage === "function") FT.renderActivePage();
    } catch (e) {}

    return true;
  }

  /** Toggle between the two shipped languages (EN <-> ID). */
  function toggleLanguage() {
    return switchLanguage(getLang() === "id" ? "en" : "id");
  }

  /**
   * applyStaticDom(root) — translate static markup. Supports:
   *   <span data-i18n="banking.transfer"></span>           -> textContent
   *   <p data-i18n-html="game.exInter"></p>                -> innerHTML
   *   <input data-i18n-attr="placeholder:common.search" /> -> attribute(s)
   * Multiple attrs: data-i18n-attr="placeholder:common.search,title:nav.banking"
   */
  function applyStaticDom(root) {
    root = root || document;

    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(",").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }

  /** Refresh the visible language code/labels on every switcher control. */
  function updateSwitcherLabels() {
    const code = getLang().toUpperCase();
    document.querySelectorAll("[data-i18n-code]").forEach((el) => {
      el.textContent = code;
    });
  }

  /** Wire up any [data-i18n-toggle] / [data-i18n-set] controls in the DOM. */
  function bindSwitchers() {
    document.querySelectorAll("[data-i18n-toggle]").forEach((btn) => {
      if (btn.__i18nBound) return;
      btn.__i18nBound = true;
      btn.addEventListener("click", (e) => { e.preventDefault(); toggleLanguage(); });
    });
    document.querySelectorAll("[data-i18n-set]").forEach((btn) => {
      if (btn.__i18nBound) return;
      btn.__i18nBound = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        switchLanguage(btn.getAttribute("data-i18n-set"));
      });
    });
    updateSwitcherLabels();
  }

  /* =========================================================
   * 5. BOOTSTRAP
   * ========================================================= */
  function init() {
    try { document.documentElement.setAttribute("lang", getLang()); } catch (e) {}
    applyStaticDom(document);
    bindSwitchers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* The saved game (and thus settings.language) is restored during the
   * app's own DOMContentLoaded boot, which can run *after* our init().
   * Re-sync the static DOM + switcher labels on window 'load' so a
   * returning player's chosen language is reflected on the very first
   * paint without needing to open a page that re-renders. */
  window.addEventListener("load", function () {
    try {
      document.documentElement.setAttribute("lang", getLang());
    } catch (e) {}
    applyStaticDom(document);
    bindSwitchers();
  });

  /* =========================================================
   * 6. PUBLIC API
   * ========================================================= */
  window.i18n = {
    DICT,
    t,
    getLang,
    switchLanguage,
    toggleLanguage,
    applyStaticDom,
    bindSwitchers,
    updateSwitcherLabels,
    available: ["id", "en"],
    DEFAULT_LANG,
  };

  // Global shortcuts for terse use inside render functions.
  window.t = t;
  window.switchLanguage = switchLanguage;
})();
