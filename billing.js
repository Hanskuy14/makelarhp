/* =========================================================
 * Flipping Tycoon: In-App Purchase Engine (Cordova Purchase)
 * ========================================================= */

const PRODUCT_ID_EDITOR = "item_editor_unlock";

function initBilling() {
    if (typeof store === "undefined") {
        console.warn("IAP Store tidak tersedia di browser PC. Mode Simulasi aktif.");
        return;
    }

    // Daftarkan produk ke kasir store
    store.register({
        id:    PRODUCT_ID_EDITOR,
        type:  store.NON_CONSUMABLE
    });

    // Jalankan sinkronisasi dengan Google Play
    store.refresh();
}

function beliInGameEditor() {
    console.log("Mencoba memanggil pembayaran...");

    if (typeof store !== "undefined") {
        // Panggil order resmi Google Play
        store.order(PRODUCT_ID_EDITOR);

        // Ketika transaksi sukses berhasil terverifikasi
        store.when(PRODUCT_ID_EDITOR).approved((p) => {
            console.log("💰 Pembayaran Berhasil!");
            
            if (window.FlippingTycoon) {
                window.FlippingTycoon.State.data.isEditorUnlocked = true;
                window.FlippingTycoon.saveGame();
                window.FlippingTycoon.showToast("Terima kasih! Fitur In-Game Editor terbuka selamanya.", "success");
                window.FlippingTycoon.renderAll();
            }
            
            p.finish(); // Selesaikan antrean transaksi di Google Play
        });
    } else {
        // Jalankan simulasi jika di browser PC
        simulasiBeliEditorWeb();
    }
}

function simulasiBeliEditorWeb() {
    const konfirmasi = confirm("[Mode Simulasi Web]\nSeharusnya muncul popup Google Play Rp 29.000 di sini.\nSimulasikan pembelian berhasil?");
    if (konfirmasi) {
        if (window.FlippingTycoon) {
            window.FlippingTycoon.State.data.isEditorUnlocked = true;
            window.FlippingTycoon.saveGame();
            window.FlippingTycoon.showToast("✅ [Simulasi] In-Game Editor berhasil dibuka!", "success");
            window.FlippingTycoon.renderAll();
        }
    }
}

window.addEventListener('DOMContentLoaded', initBilling);

window.BillingEngine = {
    beliInGameEditor
};