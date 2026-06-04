/* =========================================================
 * Flipping Tycoon: Monetization Engine (AdMob)
 *
 * Thin native-ads adapter. On a real device (Cordova/Capacitor)
 * it shows a Google AdMob rewarded video; on the web (or if the
 * plugin is missing) it transparently falls back to the built-in
 * 2-second mock ad in logistics.js.
 *
 * IMPORTANT: the actual "reward" (cut the cargo timer) lives in
 * ONE place — window.Logistics.applyAdReward(shipmentId) — so the
 * native and web paths can never drift apart.
 * ========================================================= */

(function () {
  // Safely resolve the AdMob plugin. In a browser `Capacitor` is
  // undefined, so guard every access — otherwise this whole file
  // would throw at load time and window.AdsEngine would be missing.
  function getAdMob() {
    try {
      if (typeof Capacitor !== "undefined" && Capacitor && Capacitor.Plugins) {
        return Capacitor.Plugins.AdMob || null;
      }
    } catch (e) { /* not running under Capacitor */ }
    return null;
  }

  let currentShipmentId = null;

  async function initAdMob() {
    const AdMob = getAdMob();
    if (!AdMob) {
      console.warn("AdMob tidak tersedia. Mode Simulasi Web aktif.");
      return;
    }
    try {
      await AdMob.initialize({ initializeForTesting: true });
      console.log("✅ AdMob siap.");

      // Listen for the reward callback (support old + new event names).
      AdMob.addListener("onRewardedVideoAdReward", grantReward);
      AdMob.addListener("rewardedVideoReward", grantReward);
      AdMob.addListener("onRewardedVideoAdDismissed", () => {
        currentShipmentId = null;
      });
    } catch (error) {
      console.warn("AdMob init gagal, fallback ke simulasi web.", error);
    }
  }

  // Reward callback from Google → apply the shared 2-step math.
  function grantReward() {
    if (!currentShipmentId) return;
    if (window.Logistics && typeof window.Logistics.applyAdReward === "function") {
      window.Logistics.applyAdReward(currentShipmentId);
    }
    currentShipmentId = null;
  }

  // Called by the "Tonton Iklan" button in logistics.js.
  async function playRewardedAd(shipmentId) {
    currentShipmentId = shipmentId;
    const AdMob = getAdMob();

    if (!AdMob) {
      // Web / no plugin → built-in 2-second mock ad (which itself
      // calls Logistics.applyAdReward on completion).
      if (window.Logistics && typeof window.Logistics.showRewardedAd === "function") {
        window.Logistics.showRewardedAd(shipmentId);
      }
      currentShipmentId = null;
      return;
    }

    try {
      await AdMob.prepareRewardVideoAd({
        adId: "ca-app-pub-3940256099942544/5224354917", // Google test unit
        isTesting: true,
      });
      await AdMob.showRewardVideoAd();
      // The reward itself is granted by the grantReward() listener.
    } catch (error) {
      console.log("Gagal memutar iklan asli, memutar simulasi...", error);
      if (window.Logistics && typeof window.Logistics.showRewardedAd === "function") {
        window.Logistics.showRewardedAd(shipmentId);
      }
      currentShipmentId = null;
    }
  }

  window.addEventListener("DOMContentLoaded", initAdMob);

  window.AdsEngine = { playRewardedAd };
})();
