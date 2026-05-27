/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 2 — Gadget Database, Completeness & Defect tables
 *
 * Prices are realistic Indonesian second-hand market values
 * (IDR), tuned for a "broker / flipper" simulation.
 * ========================================================= */

const GADGET_DATABASE = [
  // ===== APPLE — iPhone =====
  { id: "iphone-x",     brand: "Apple", model: "iPhone X",          specs: { ram: "3GB",  rom: "64GB",  color: "Space Gray" },    basePrice:  2_300_000, year: 2017, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-xr",    brand: "Apple", model: "iPhone XR",         specs: { ram: "3GB",  rom: "128GB", color: "Black" },         basePrice:  3_300_000, year: 2018, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-11",    brand: "Apple", model: "iPhone 11",         specs: { ram: "4GB",  rom: "128GB", color: "White" },         basePrice:  4_500_000, year: 2019, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-11-pm", brand: "Apple", model: "iPhone 11 Pro Max", specs: { ram: "4GB",  rom: "256GB", color: "Midnight Green" },basePrice:  6_500_000, year: 2019, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-12",    brand: "Apple", model: "iPhone 12",         specs: { ram: "4GB",  rom: "128GB", color: "Blue" },          basePrice:  6_000_000, year: 2020, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-12-pm", brand: "Apple", model: "iPhone 12 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Pacific Blue" },  basePrice:  9_000_000, year: 2020, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-13",    brand: "Apple", model: "iPhone 13",         specs: { ram: "4GB",  rom: "128GB", color: "Pink" },          basePrice:  7_800_000, year: 2021, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-13-pm", brand: "Apple", model: "iPhone 13 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Sierra Blue" },   basePrice: 11_500_000, year: 2021, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-14-pm", brand: "Apple", model: "iPhone 14 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Deep Purple" },   basePrice: 15_000_000, year: 2022, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-15",    brand: "Apple", model: "iPhone 15",         specs: { ram: "6GB",  rom: "128GB", color: "Pink" },          basePrice: 12_500_000, year: 2023, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-15-pm", brand: "Apple", model: "iPhone 15 Pro Max", specs: { ram: "8GB",  rom: "256GB", color: "Natural Titanium" }, basePrice: 18_500_000, year: 2023, icon: "phone", accent: "#1c1c1e" },
  { id: "iphone-16-pm", brand: "Apple", model: "iPhone 16 Pro Max", specs: { ram: "8GB",  rom: "256GB", color: "Desert Titanium" },  basePrice: 22_000_000, year: 2024, icon: "phone", accent: "#1c1c1e" },

  // ===== APPLE — iPad =====
  { id: "ipad-mini-6",  brand: "Apple", model: "iPad Mini 6",       specs: { ram: "4GB",  rom: "256GB", color: "Starlight" },     basePrice:  7_500_000, year: 2021, icon: "tablet", accent: "#1c1c1e" },
  { id: "ipad-air-5",   brand: "Apple", model: "iPad Air 5",        specs: { ram: "8GB",  rom: "256GB", color: "Blue" },          basePrice:  9_000_000, year: 2022, icon: "tablet", accent: "#1c1c1e" },
  { id: "ipad-pro-m2",  brand: "Apple", model: "iPad Pro M2 11\"",  specs: { ram: "8GB",  rom: "256GB", color: "Space Gray" },    basePrice: 14_500_000, year: 2022, icon: "tablet", accent: "#1c1c1e" },

  // ===== SAMSUNG — Galaxy S =====
  { id: "s21",          brand: "Samsung", model: "Galaxy S21",       specs: { ram: "8GB",  rom: "128GB", color: "Phantom Gray" },  basePrice:  4_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "s21-ultra",    brand: "Samsung", model: "Galaxy S21 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Phantom Black" }, basePrice:  6_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "s22",          brand: "Samsung", model: "Galaxy S22",       specs: { ram: "8GB",  rom: "128GB", color: "Pink Gold" },     basePrice:  6_000_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "s22-ultra",    brand: "Samsung", model: "Galaxy S22 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Burgundy" },      basePrice:  9_500_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "s23",          brand: "Samsung", model: "Galaxy S23",       specs: { ram: "8GB",  rom: "256GB", color: "Lavender" },      basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "s23-ultra",    brand: "Samsung", model: "Galaxy S23 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Cream" },         basePrice: 14_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "s24",          brand: "Samsung", model: "Galaxy S24",       specs: { ram: "8GB",  rom: "256GB", color: "Onyx Black" },    basePrice: 12_500_000, year: 2024, icon: "phone", accent: "#1428a0" },
  { id: "s24-ultra",    brand: "Samsung", model: "Galaxy S24 Ultra", specs: { ram: "12GB", rom: "512GB", color: "Titanium Black" },basePrice: 18_000_000, year: 2024, icon: "phone", accent: "#1428a0" },

  // ===== SAMSUNG — Z Series =====
  { id: "z-flip-3",     brand: "Samsung", model: "Galaxy Z Flip 3",  specs: { ram: "8GB",  rom: "128GB", color: "Cream" },         basePrice:  4_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "z-flip-4",     brand: "Samsung", model: "Galaxy Z Flip 4",  specs: { ram: "8GB",  rom: "256GB", color: "Bora Purple" },   basePrice:  6_500_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "z-flip-5",     brand: "Samsung", model: "Galaxy Z Flip 5",  specs: { ram: "8GB",  rom: "256GB", color: "Mint" },          basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "z-fold-4",     brand: "Samsung", model: "Galaxy Z Fold 4",  specs: { ram: "12GB", rom: "256GB", color: "Phantom Black" }, basePrice: 12_000_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "z-fold-5",     brand: "Samsung", model: "Galaxy Z Fold 5",  specs: { ram: "12GB", rom: "512GB", color: "Icy Blue" },      basePrice: 16_500_000, year: 2023, icon: "phone", accent: "#1428a0" },

  // ===== SAMSUNG — Note + Tab =====
  { id: "note-20-ultra",brand: "Samsung", model: "Galaxy Note 20 Ultra", specs: { ram: "8GB", rom: "256GB", color: "Mystic Bronze" }, basePrice: 6_000_000, year: 2020, icon: "phone",  accent: "#1428a0" },
  { id: "tab-s9",       brand: "Samsung", model: "Galaxy Tab S9",       specs: { ram: "8GB", rom: "128GB", color: "Graphite" },     basePrice: 9_500_000, year: 2023, icon: "tablet", accent: "#1428a0" },

  // ===== XIAOMI / POCO =====
  { id: "redmi-note-12",   brand: "Xiaomi", model: "Redmi Note 12",      specs: { ram: "6GB",  rom: "128GB", color: "Onyx Gray" },    basePrice:  1_800_000, year: 2023, icon: "phone", accent: "#ff6900" },
  { id: "redmi-note-13p",  brand: "Xiaomi", model: "Redmi Note 13 Pro",  specs: { ram: "8GB",  rom: "256GB", color: "Forest Green" }, basePrice:  3_500_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "redmi-note-13pp", brand: "Xiaomi", model: "Redmi Note 13 Pro+", specs: { ram: "12GB", rom: "256GB", color: "Aurora Purple" },basePrice:  4_500_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "xiaomi-13t-pro",  brand: "Xiaomi", model: "Xiaomi 13T Pro",     specs: { ram: "12GB", rom: "512GB", color: "Alpine Blue" },  basePrice:  7_500_000, year: 2023, icon: "phone", accent: "#ff6900" },
  { id: "xiaomi-14",       brand: "Xiaomi", model: "Xiaomi 14",          specs: { ram: "12GB", rom: "256GB", color: "Jade Green" },   basePrice: 11_000_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "poco-x6-pro",     brand: "Xiaomi", model: "POCO X6 Pro",        specs: { ram: "12GB", rom: "512GB", color: "Yellow" },       basePrice:  4_800_000, year: 2024, icon: "phone", accent: "#ff6900" },

  // ===== OPPO =====
  { id: "oppo-reno-10p",   brand: "Oppo",  model: "Reno 10 Pro",         specs: { ram: "12GB", rom: "256GB", color: "Glossy Purple" },basePrice:  5_500_000, year: 2023, icon: "phone", accent: "#10b981" },
  { id: "oppo-reno-11p",   brand: "Oppo",  model: "Reno 11 Pro",         specs: { ram: "12GB", rom: "512GB", color: "Pearl White" },  basePrice:  7_500_000, year: 2024, icon: "phone", accent: "#10b981" },
  { id: "oppo-find-x6p",   brand: "Oppo",  model: "Find X6 Pro",         specs: { ram: "12GB", rom: "256GB", color: "Cosmic Black" }, basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#10b981" },
  { id: "oppo-a98",        brand: "Oppo",  model: "A98",                 specs: { ram: "8GB",  rom: "256GB", color: "Cool Black" },   basePrice:  2_800_000, year: 2023, icon: "phone", accent: "#10b981" },

  // ===== VIVO =====
  { id: "vivo-v29",        brand: "Vivo",  model: "V29",                 specs: { ram: "12GB", rom: "256GB", color: "Velvet Red" },   basePrice:  4_500_000, year: 2023, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-v30-pro",    brand: "Vivo",  model: "V30 Pro",             specs: { ram: "12GB", rom: "512GB", color: "Bloom White" },  basePrice:  6_500_000, year: 2024, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-x100-pro",   brand: "Vivo",  model: "X100 Pro",            specs: { ram: "12GB", rom: "256GB", color: "Asteroid Black" },basePrice: 11_500_000, year: 2024, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-y36",        brand: "Vivo",  model: "Y36",                 specs: { ram: "8GB",  rom: "256GB", color: "Meteor Black" }, basePrice:  2_500_000, year: 2023, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-y100",       brand: "Vivo",  model: "Y100",                specs: { ram: "8GB",  rom: "256GB", color: "Pacific Blue" }, basePrice:  3_200_000, year: 2024, icon: "phone", accent: "#7c3aed" },
];

/* ---------- Completeness & Defect tables ----------
 * `multiplier` is applied to basePrice.
 * `haggleBonus` is added to defect.haggleAcceptRate when picked.
 */
const COMPLETENESS_OPTIONS = [
  { type: "Fullset",          short: "Fullset",  multiplier: 1.00, haggleBonus: 0.00,
    desc: "Lengkap dengan dus, charger, dan kelengkapan asli." },
  { type: "HP Only / Batangan", short: "Batangan", multiplier: 0.85, haggleBonus: 0.10,
    desc: "Unit only, tanpa dus dan aksesori bawaan." },
];

const DEFECT_OPTIONS = [
  { type: "Mulus / No Minus",       short: "Mulus",        multiplier: 1.00, severity: 0, haggleAcceptRate: 0.10,
    desc: "Kondisi mulus, tidak ada minus, normal semua fungsi." },
  { type: "Layar Baret",            short: "Baret Layar",  multiplier: 0.90, severity: 1, haggleAcceptRate: 0.30,
    desc: "Ada baret tipis di layar, tidak mengganggu fungsi sentuh." },
  { type: "Battery Health Drop",    short: "Battery Drop", multiplier: 0.85, severity: 2, haggleAcceptRate: 0.50,
    desc: "Battery health di bawah 85%, mungkin perlu ganti baterai." },
  { type: "FaceID/Fingerprint Off", short: "Sensor Off",   multiplier: 0.80, severity: 3, haggleAcceptRate: 0.70,
    desc: "Face ID atau sensor sidik jari tidak berfungsi." },
  { type: "Layar Retak",            short: "LCD Retak",    multiplier: 0.70, severity: 4, haggleAcceptRate: 0.85,
    desc: "Layar retak / LCD pecah, perlu service / ganti LCD." },
];

/* ---------- Seller name pool (FB Messenger contacts) ---------- */
const SELLER_NAMES = [
  "Andre Reseller", "Budi Counter HP", "Citra Gadget", "Dimas Second", "Eka Importir",
  "Fauzan Phone Hub", "Gita Galaxy", "Hadi Hape Bekas", "Indra iStore", "Jaka Cell",
  "Kiki Konter", "Lina Lapak HP", "Maman MobileMart", "Nina Nusa Phone", "Oka Outlet HP",
];

/* ---------- Avatar background palette for sellers ---------- */
const AVATAR_COLORS = [
  "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#a855f7",
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#ec4899",
];

/* Expose for other modules (we are not using ES modules) */
window.GadgetData = {
  GADGET_DATABASE,
  COMPLETENESS_OPTIONS,
  DEFECT_OPTIONS,
  SELLER_NAMES,
  AVATAR_COLORS,
};
