/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 2 — Gadget Database, Completeness & Defect tables
 *
 * Prices are realistic Indonesian second-hand market values
 * (IDR), tuned for a "broker / flipper" simulation.
 * ========================================================= */

const GADGET_DATABASE = [
  // ===== APPLE — PearPhone =====
  { id: "iphone-x",     brand: "Pear", model: "PearPhone X",          specs: { ram: "3GB",  rom: "64GB",  color: "Space Gray" },    basePrice:  2_300_000, year: 2017, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-xr",    brand: "Pear", model: "PearPhone XR",         specs: { ram: "3GB",  rom: "128GB", color: "Black" },         basePrice:  3_300_000, year: 2018, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-11",    brand: "Pear", model: "PearPhone 11",         specs: { ram: "4GB",  rom: "128GB", color: "White" },         basePrice:  4_500_000, year: 2019, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-11-pm", brand: "Pear", model: "PearPhone 11 Pro Max", specs: { ram: "4GB",  rom: "256GB", color: "Midnight Green" },basePrice:  6_500_000, year: 2019, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-12",    brand: "Pear", model: "PearPhone 12",         specs: { ram: "4GB",  rom: "128GB", color: "Blue" },          basePrice:  6_000_000, year: 2020, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-12-pm", brand: "Pear", model: "PearPhone 12 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Pacific Blue" },  basePrice:  9_000_000, year: 2020, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-13",    brand: "Pear", model: "PearPhone 13",         specs: { ram: "4GB",  rom: "128GB", color: "Pink" },          basePrice:  7_800_000, year: 2021, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-13-pm", brand: "Pear", model: "PearPhone 13 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Sierra Blue" },   basePrice: 11_500_000, year: 2021, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-14-pm", brand: "Pear", model: "PearPhone 14 Pro Max", specs: { ram: "6GB",  rom: "256GB", color: "Deep Purple" },   basePrice: 15_000_000, year: 2022, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-15",    brand: "Pear", model: "PearPhone 15",         specs: { ram: "6GB",  rom: "128GB", color: "Pink" },          basePrice: 12_500_000, year: 2023, icon: "phone",  accent: "#1c1c1e" },
  { id: "iphone-15-pm", brand: "Pear", model: "PearPhone 15 Pro Max", specs: { ram: "8GB",  rom: "256GB", color: "Natural Titanium" }, basePrice: 18_500_000, year: 2023, icon: "phone", accent: "#1c1c1e" },
  { id: "iphone-16-pm", brand: "Pear", model: "PearPhone 16 Pro Max", specs: { ram: "8GB",  rom: "256GB", color: "Desert Titanium" },  basePrice: 22_000_000, year: 2024, icon: "phone", accent: "#1c1c1e" },

  // ===== APPLE — PearPad =====
  { id: "ipad-mini-6",  brand: "Pear", model: "PearPad Mini 6",       specs: { ram: "4GB",  rom: "256GB", color: "Starlight" },     basePrice:  7_500_000, year: 2021, icon: "tablet", accent: "#1c1c1e" },
  { id: "ipad-air-5",   brand: "Pear", model: "PearPad Air 5",        specs: { ram: "8GB",  rom: "256GB", color: "Blue" },          basePrice:  9_000_000, year: 2022, icon: "tablet", accent: "#1c1c1e" },
  { id: "ipad-pro-m2",  brand: "Pear", model: "PearPad Pro M2 11\"",  specs: { ram: "8GB",  rom: "256GB", color: "Space Gray" },    basePrice: 14_500_000, year: 2022, icon: "tablet", accent: "#1c1c1e" },

  // ===== SAMSUNG — Universe S =====
  { id: "s21",          brand: "Sumsang", model: "Universe S21",       specs: { ram: "8GB",  rom: "128GB", color: "Phantom Gray" },  basePrice:  4_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "s21-ultra",    brand: "Sumsang", model: "Universe S21 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Phantom Black" }, basePrice:  6_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "s22",          brand: "Sumsang", model: "Universe S22",       specs: { ram: "8GB",  rom: "128GB", color: "Pink Gold" },     basePrice:  6_000_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "s22-ultra",    brand: "Sumsang", model: "Universe S22 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Burgundy" },      basePrice:  9_500_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "s23",          brand: "Sumsang", model: "Universe S23",       specs: { ram: "8GB",  rom: "256GB", color: "Lavender" },      basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "s23-ultra",    brand: "Sumsang", model: "Universe S23 Ultra", specs: { ram: "12GB", rom: "256GB", color: "Cream" },         basePrice: 14_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "s24",          brand: "Sumsang", model: "Universe S24",       specs: { ram: "8GB",  rom: "256GB", color: "Onyx Black" },    basePrice: 12_500_000, year: 2024, icon: "phone", accent: "#1428a0" },
  { id: "s24-ultra",    brand: "Sumsang", model: "Universe S24 Ultra", specs: { ram: "12GB", rom: "512GB", color: "Titanium Black" },basePrice: 18_000_000, year: 2024, icon: "phone", accent: "#1428a0" },

  // ===== SAMSUNG — Z Series =====
  { id: "z-flip-3",     brand: "Sumsang", model: "Universe Z Flip 3",  specs: { ram: "8GB",  rom: "128GB", color: "Cream" },         basePrice:  4_500_000, year: 2021, icon: "phone", accent: "#1428a0" },
  { id: "z-flip-4",     brand: "Sumsang", model: "Universe Z Flip 4",  specs: { ram: "8GB",  rom: "256GB", color: "Bora Purple" },   basePrice:  6_500_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "z-flip-5",     brand: "Sumsang", model: "Universe Z Flip 5",  specs: { ram: "8GB",  rom: "256GB", color: "Mint" },          basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#1428a0" },
  { id: "z-fold-4",     brand: "Sumsang", model: "Universe Z Fold 4",  specs: { ram: "12GB", rom: "256GB", color: "Phantom Black" }, basePrice: 12_000_000, year: 2022, icon: "phone", accent: "#1428a0" },
  { id: "z-fold-5",     brand: "Sumsang", model: "Universe Z Fold 5",  specs: { ram: "12GB", rom: "512GB", color: "Icy Blue" },      basePrice: 16_500_000, year: 2023, icon: "phone", accent: "#1428a0" },

  // ===== SAMSUNG — Note + Tab =====
  { id: "note-20-ultra",brand: "Sumsang", model: "Universe Note 20 Ultra", specs: { ram: "8GB", rom: "256GB", color: "Mystic Bronze" }, basePrice: 6_000_000, year: 2020, icon: "phone",  accent: "#1428a0" },
  { id: "tab-s9",       brand: "Sumsang", model: "Universe Tab S9",       specs: { ram: "8GB", rom: "128GB", color: "Graphite" },     basePrice: 9_500_000, year: 2023, icon: "tablet", accent: "#1428a0" },

  // ===== XIAOMI / POTO =====
  { id: "redmi-note-12",   brand: "Siaomi", model: "Note 12",      specs: { ram: "6GB",  rom: "128GB", color: "Onyx Gray" },    basePrice:  1_800_000, year: 2023, icon: "phone", accent: "#ff6900" },
  { id: "redmi-note-13p",  brand: "Siaomi", model: "Note 13 Pro",  specs: { ram: "8GB",  rom: "256GB", color: "Forest Green" }, basePrice:  3_500_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "redmi-note-13pp", brand: "Siaomi", model: "Note 13 Pro+", specs: { ram: "12GB", rom: "256GB", color: "Aurora Purple" },basePrice:  4_500_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "xiaomi-13t-pro",  brand: "Siaomi", model: "Siaomi 13T Pro",     specs: { ram: "12GB", rom: "512GB", color: "Alpine Blue" },  basePrice:  7_500_000, year: 2023, icon: "phone", accent: "#ff6900" },
  { id: "xiaomi-14",       brand: "Siaomi", model: "Siaomi 14",          specs: { ram: "12GB", rom: "256GB", color: "Jade Green" },   basePrice: 11_000_000, year: 2024, icon: "phone", accent: "#ff6900" },
  { id: "poco-x6-pro",     brand: "Siaomi", model: "POTO X6 Pro",        specs: { ram: "12GB", rom: "512GB", color: "Yellow" },       basePrice:  4_800_000, year: 2024, icon: "phone", accent: "#ff6900" },

  // ===== OPPO =====
  { id: "oppo-reno-10p",   brand: "Ope",  model: "Reno 10 Pro",         specs: { ram: "12GB", rom: "256GB", color: "Glossy Purple" },basePrice:  5_500_000, year: 2023, icon: "phone", accent: "#10b981" },
  { id: "oppo-reno-11p",   brand: "Ope",  model: "Reno 11 Pro",         specs: { ram: "12GB", rom: "512GB", color: "Pearl White" },  basePrice:  7_500_000, year: 2024, icon: "phone", accent: "#10b981" },
  { id: "oppo-find-x6p",   brand: "Ope",  model: "Find X6 Pro",         specs: { ram: "12GB", rom: "256GB", color: "Cosmic Black" }, basePrice:  9_500_000, year: 2023, icon: "phone", accent: "#10b981" },
  { id: "oppo-a98",        brand: "Ope",  model: "A98",                 specs: { ram: "8GB",  rom: "256GB", color: "Cool Black" },   basePrice:  2_800_000, year: 2023, icon: "phone", accent: "#10b981" },

  // ===== VIVO =====
  { id: "vivo-v29",        brand: "Pipo",  model: "V29",                 specs: { ram: "12GB", rom: "256GB", color: "Velvet Red" },   basePrice:  4_500_000, year: 2023, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-v30-pro",    brand: "Pipo",  model: "V30 Pro",             specs: { ram: "12GB", rom: "512GB", color: "Bloom White" },  basePrice:  6_500_000, year: 2024, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-x100-pro",   brand: "Pipo",  model: "X100 Pro",            specs: { ram: "12GB", rom: "256GB", color: "Asteroid Black" },basePrice: 11_500_000, year: 2024, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-y36",        brand: "Pipo",  model: "Y36",                 specs: { ram: "8GB",  rom: "256GB", color: "Meteor Black" }, basePrice:  2_500_000, year: 2023, icon: "phone", accent: "#7c3aed" },
  { id: "vivo-y100",       brand: "Pipo",  model: "Y100",                specs: { ram: "8GB",  rom: "256GB", color: "Pacific Blue" }, basePrice:  3_200_000, year: 2024, icon: "phone", accent: "#7c3aed" },
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

/* ---------- Seller name pool (NB Messenger contacts) ---------- */
const SELLER_NAMES = [
  "Andre Reseller", "Budi Counter HP", "Citra Gadget", "Dimas Second", "Eka Importir",
  "Fauzan Phone Hub", "Gita Universe", "Hadi Hape Bekas", "Indra iStore", "Jaka Cell",
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
