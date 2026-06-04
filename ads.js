/* =========================================================
 * Flipping Tycoon: Monetization Engine (AdMob)
 * UPDATE: Fix Reward Trigger & Event Listeners
 * ========================================================= */

const { AdMob } = Capacitor.Plugins;
let currentShipmentId = null;

async function initAdMob() {
    try {
        await AdMob.initialize({
            initializeForTesting: true, // Wajib TRUE selama masa tes
        });
        console.log("✅ AdMob Berhasil Disiapkan!");

        // Pasang "Telinga" (Listener) untuk mendengarkan hadiah dari Google
        // Kita pasang dua nama event sekaligus untuk memastikan dukungan versi Capacitor lama & baru
        AdMob.addListener('onRewardedVideoAdReward', berikanHadiah);
        AdMob.addListener('rewardedVideoReward', berikanHadiah);

        // Listener saat iklan ditutup
        AdMob.addListener('onRewardedVideoAdDismissed', () => {
            console.log("Iklan ditutup pemain.");
            currentShipmentId = null; // Reset ID agar tidak error
        });

    } catch (error) {
        console.warn("AdMob tidak tersedia. Mode Simulasi Web aktif.");
    }
}

// Fungsi Inti yang memotong waktu Kargo
function berikanHadiah(rewardItem) {
    console.log("💰 Iklan selesai ditonton! Mengeksekusi hadiah...", rewardItem);
    
    if (!currentShipmentId || !window.FlippingTycoon) return;

    const s = window.FlippingTycoon.State.data;
    const ship = s.activeShipments.find(x => x.id === currentShipmentId);
    
    if (ship && window.Logistics) {
        const remaining = window.Logistics.getRemainingMs(ship);
        
        if (ship.adWatches === 0) {
            // Iklan pertama: Potong 50%
            ship.durationMs = Math.max(0, ship.durationMs - Math.floor(remaining / 2));
            ship.adWatches = 1;
            showToastAd("⚡ Waktu kargo dipotong 50%!");
        } else if (ship.adWatches === 1) {
            // Iklan kedua: Langsung selesai (0 ms)
            ship.durationMs = Math.max(0, Date.now() - Number(ship.startedAt || 0));
            ship.adWatches = 2;
            showToastAd("⚡⚡ Instan sampai! Tinggal klaim.");
        }
        
        // Simpan progress dan segarkan layar
        window.FlippingTycoon.saveGame();
        window.FlippingTycoon.renderActivePage();
    }
    
    // Kosongkan ID setelah hadiah diberikan
    currentShipmentId = null;
}

// Fungsi yang dipanggil oleh tombol di Logistics.js
async function playRewardedAd(shipmentId) {
    currentShipmentId = shipmentId;
    try {
        // Coba tampilkan iklan asli (ID Test)
        await AdMob.prepareRewardVideoAd({
            adId: 'ca-app-pub-3940256099942544/5224354917', 
            isTesting: true
        });
        await AdMob.showRewardVideoAd();
    } catch (error) {
        // JIKA GAGAL (Atau dimainkan di Web), pakai Iklan Simulasi bawaan gamenya
        console.log("Memutar Iklan Simulasi (Fallback)...");
        if (window.Logistics && typeof window.Logistics.showRewardedAd === 'function') {
            window.Logistics.showRewardedAd(shipmentId);
        }
    }
}

function showToastAd(msg) {
    let toast = document.querySelector("#ft-toast");
    if (toast) {
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2400);
    }
}

// Jalankan inisialisasi saat game dibuka
window.addEventListener('DOMContentLoaded', initAdMob);

window.AdsEngine = {
    playRewardedAd
};