/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Audio — Centralized BGM + SFX manager (Vanilla, no libs)
 *
 * Native HTML5 Audio only (no Howler.js) to keep the Capacitor
 * bundle tiny. Exposes a single global: window.AudioManager.
 *
 * Responsibilities:
 *   - Preload BGM + SFX so playback has zero latency in-game.
 *   - Respect browser autoplay policy: nothing plays until the
 *     first real user gesture "unlocks" the audio engine.
 *   - Independent BGM (low, looping) and SFX (punchy) volumes.
 *   - Persist mute prefs into the existing save state
 *     (State.data.settings.bgmMuted / sfxMuted) so they survive
 *     reloads and "Next Day".
 *   - Own its little topbar UI (two icon buttons).
 *
 * ----------------------------------------------------------
 * AUDIO ASSETS REQUIRED (drop your own files here):
 *   assets/audio/bgm-lofi.mp3       (looping lo-fi/synthwave)
 *   assets/audio/cash-register.mp3
 *   assets/audio/chat-pop.mp3
 *   assets/audio/error-buzz.mp3
 *   assets/audio/click.mp3
 * Missing files fail SILENTLY (every play() is guarded) so the
 * game never breaks if an asset is absent.
 * ========================================================= */

window.AudioManager = (function () {
  "use strict";

  /* ---------- Config ---------- */
  // Keep BGM low so it sits *under* the gameplay; SFX punch through.
  const BGM_VOLUME = 0.25;
  const SFX_VOLUME = 0.8;

  const ASSET_BASE = "assets/audio/";
  const BGM_SRC = ASSET_BASE + "bgm-lofi.mp3";

  // SFX registry: key -> filename. Add new one-shots here.
  const SFX_FILES = {
    cash:  ASSET_BASE + "cash-register.mp3", // gadget sold / cash in
    chat:  ASSET_BASE + "chat-pop.mp3",      // AI reseller / COD reply
    error: ASSET_BASE + "error-buzz.mp3",    // invalid action
    click: ASSET_BASE + "click.mp3",         // generic UI tap
  };

  /* ---------- Internal state ---------- */
  let _bgm = null;             // single looping <audio> element
  const _sfx = {};             // key -> preloaded template <audio>
  let _unlocked = false;       // true once a user gesture has primed playback
  let _inApp = false;          // true once the player is past the home screen
  let _initialized = false;

  /* ---------- Settings bridge (single source of truth = save state) ----------
   * We read/write straight into State.data.settings so the player's choice
   * is persisted by the game's normal saveGame() pipeline. A tiny local
   * fallback covers the brief window before the state module is ready. */
  const _fallback = { bgmMuted: false, sfxMuted: false };

  function getSettings() {
    const ft = window.FlippingTycoon;
    if (ft && ft.State && ft.State.data) {
      if (!ft.State.data.settings || typeof ft.State.data.settings !== "object") {
        ft.State.data.settings = { ..._fallback };
      }
      return ft.State.data.settings;
    }
    return _fallback;
  }

  function persist() {
    if (window.FlippingTycoon && typeof window.FlippingTycoon.saveGame === "function") {
      window.FlippingTycoon.saveGame();
    }
  }

  function isBgmMuted() { return !!getSettings().bgmMuted; }
  function isSfxMuted() { return !!getSettings().sfxMuted; }

  /* ---------- Preloading ----------
   * Build every Audio element up front with preload="auto" so the
   * browser fetches + decodes them while the splash screen is showing. */
  function preload() {
    // BGM (single, looping, low volume).
    _bgm = new Audio(BGM_SRC);
    _bgm.loop = true;
    _bgm.volume = BGM_VOLUME;
    _bgm.preload = "auto";

    // SFX templates. We clone these on play so rapid hits can overlap
    // without cutting each other off (cheap because the file is cached).
    Object.keys(SFX_FILES).forEach((key) => {
      const a = new Audio(SFX_FILES[key]);
      a.preload = "auto";
      a.volume = SFX_VOLUME;
      _sfx[key] = a;
    });
  }

  /* ---------- Autoplay unlock ----------
   * Browsers block audio until the user interacts. The FIRST gesture
   * (tap / click / key) flips _unlocked = true; from then on every
   * programmatic play() is allowed. We also kick off BGM here if the
   * player is already in-app and hasn't muted it. */
  function unlock() {
    if (_unlocked) return;
    _unlocked = true;
    if (_inApp && !isBgmMuted()) playBGM();
  }

  function armUnlockListeners() {
    const handler = () => unlock();
    // capture:true => fires before bubbling button handlers, so the very
    // first click both unlocks AND can still play its own click SFX.
    ["pointerdown", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(evt, handler, { once: true, capture: true });
    });
  }

  /* ---------- Background Music ---------- */
  function playBGM() {
    if (!_bgm || isBgmMuted()) return;
    if (!_unlocked) return;            // wait for the unlock gesture
    const p = _bgm.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* autoplay/asset miss */ });
  }

  function pauseBGM() {
    if (_bgm) _bgm.pause();
  }

  function stopBGM() {
    if (!_bgm) return;
    _bgm.pause();
    try { _bgm.currentTime = 0; } catch (e) { /* not seekable yet */ }
  }

  /* ---------- Sound Effects ----------
   * Clone-and-play lets identical SFX overlap (e.g. rapid clicks) with
   * no latency since the underlying media is already cached. */
  function playSFX(key) {
    if (!_unlocked || isSfxMuted()) return;
    const tpl = _sfx[key];
    if (!tpl) return;
    try {
      const node = tpl.cloneNode(true);
      node.volume = SFX_VOLUME;
      const p = node.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* swallow — audio must never break gameplay */ }
  }

  // Named "dopamine hit" helpers (the public SFX API).
  function playCashRegister() { playSFX("cash"); }  // gadget sold / cash in
  function playChatPop()      { playSFX("chat"); }  // reseller / COD reply
  function playErrorBuzz()    { playSFX("error"); } // invalid action
  function playClick()        { playSFX("click"); } // generic UI tap

  /* ---------- Toggles (persisted) ---------- */
  function toggleBGM() {
    const s = getSettings();
    s.bgmMuted = !s.bgmMuted;
    if (s.bgmMuted) pauseBGM();
    else playBGM();
    persist();
    refreshUI();
    return !s.bgmMuted; // returns "is now ON"
  }

  function toggleSFX() {
    const s = getSettings();
    s.sfxMuted = !s.sfxMuted;
    persist();
    refreshUI();
    if (!s.sfxMuted) playClick(); // immediate audible confirmation
    return !s.sfxMuted;
  }

  /* ---------- UI: two topbar icon buttons ----------
   * fa-music / fa-volume-high = ON   |   fa-volume-xmark = OFF (muted) */
  function refreshUI() {
    const bgmBtn  = document.querySelector("#topbar-bgm-btn");
    const bgmIcon = document.querySelector("#topbar-bgm-icon");
    const sfxBtn  = document.querySelector("#topbar-sfx-btn");
    const sfxIcon = document.querySelector("#topbar-sfx-icon");

    if (bgmIcon) {
      // Music note when ON, muted speaker when OFF.
      bgmIcon.classList.remove("fa-music", "fa-volume-xmark");
      bgmIcon.classList.add(isBgmMuted() ? "fa-volume-xmark" : "fa-music");
    }
    if (bgmBtn) {
      bgmBtn.classList.toggle("audio-off", isBgmMuted());
      bgmBtn.title = isBgmMuted() ? "Music: OFF" : "Music: ON";
    }
    if (sfxIcon) {
      sfxIcon.classList.remove("fa-volume-high", "fa-volume-xmark");
      sfxIcon.classList.add(isSfxMuted() ? "fa-volume-xmark" : "fa-volume-high");
    }
    if (sfxBtn) {
      sfxBtn.classList.toggle("audio-off", isSfxMuted());
      sfxBtn.title = isSfxMuted() ? "Sounds: OFF" : "Sounds: ON";
    }
  }

  function bindUI() {
    const bgmBtn = document.querySelector("#topbar-bgm-btn");
    const sfxBtn = document.querySelector("#topbar-sfx-btn");
    if (bgmBtn) bgmBtn.addEventListener("click", toggleBGM);
    if (sfxBtn) sfxBtn.addEventListener("click", toggleSFX);

    // Generic UI click sound: one delegated listener for the whole app.
    // Opt out on any element with data-no-sfx (e.g. silent controls).
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, [role='button'], .sidebar-link, .chat-action");
      if (!btn || btn.hasAttribute("data-no-sfx")) return;
      playClick();
    });
  }

  /* ---------- Lifecycle ---------- */
  // Called once on DOMContentLoaded.
  function init() {
    if (_initialized) return;
    _initialized = true;
    preload();
    armUnlockListeners();
    bindUI();
    refreshUI();
  }

  // Called from enterApp() once the player is in the game proper.
  function onEnterApp() {
    _inApp = true;
    refreshUI();      // reflect persisted prefs on the freshly-shown topbar
    if (!isBgmMuted()) playBGM();
  }

  // Pause music when the tab/app is backgrounded; resume on return.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBGM();
    else if (_inApp && !isBgmMuted()) playBGM();
  });

  /* ---------- Public API ---------- */
  return {
    init,
    onEnterApp,
    // BGM
    playBGM,
    pauseBGM,
    stopBGM,
    toggleBGM,
    // SFX (the dopamine hits)
    playCashRegister,
    playChatPop,
    playErrorBuzz,
    playClick,
    playSFX,
    toggleSFX,
    // State helpers / UI
    isBgmMuted,
    isSfxMuted,
    refreshUI,
  };
})();
