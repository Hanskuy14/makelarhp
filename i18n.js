/* =========================================================
 * Flipping Tycoon: Gadget Broker
 * Part 36 — Internationalization (i18n) — TOTAL OVERHAUL
 *
 * A tiny, zero-dependency bilingual engine (English + Bahasa
 * Indonesia). No React / Vue / i18next — just a dictionary
 * object and a key-lookup function, so the bundle stays small.
 *
 * Design goals of this overhaul:
 *   1. NOTHING dynamic stores a raw human string anymore. Game
 *      state stores translation KEYS + PARAMS, and the UI maps
 *      them through t() at render time. Switching language
 *      re-renders every screen instantly — even historical data
 *      (newsfeed posts, chat logs) flips language live.
 *   2. Save-file safe: legacy saves that still hold raw strings
 *      keep rendering via graceful fallbacks (key resolvers map
 *      old `type` strings back to stable keys).
 *
 * Public API:
 *   window.t(key, params)             -> translated string
 *   window.i18n.t(key, params)        -> same as above
 *   window.i18n.tr(keys[], params)    -> translate a RANDOM key (variety)
 *   window.i18n.getLang()             -> "id" | "en"
 *   window.i18n.switchLanguage(code)  -> set lang + save + re-render
 *   window.switchLanguage(code)       -> global alias
 *   window.i18n.translateDOM(root)    -> translate [data-i18n] nodes
 *   window.i18n.applyStaticDom(root)  -> alias of translateDOM
 *   window.i18n.conditionKey(obj)     -> stable key for a completeness obj
 *   window.i18n.defectKey(obj)        -> stable key for a defect obj
 *   window.i18n.taxKey(listingOrItem) -> "official" | "ex_inter" | ...
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
   * Keys are grouped by domain. Reference any string with a
   * dotted path, e.g. t("conditions.batangan.label") or
   * t("chat.opener_price", { price: "Rp 10.000.000" }).
   * ========================================================= */
  const DICT = {
    /* ------------------------------------------------------ */
    /* ENGLISH                                                */
    /* ------------------------------------------------------ */
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
        completeness: "Completeness",
        defect: "Defect",
        all: "All",
        search: "Search",
        today: "Today",
        items: "items",
        units: "units",
        multiplier: "multiplier",
      },
      nav: {
        newsFeed: "News Feed",
        marketplace: "Marketplace",
        inventory: "Inventory",
        ecommerce: "E-commerce",
        banking: "Bank",
        repair: "Repair Center",
        batam: "Batam Supplier",
        logistics: "Cargo / Logistics",
        profile: "Profile",
        settings: "Settings",
      },
      market: {
        title: "Marketplace",
        subtitle: "Today's listings · Day {day} · {count} items",
        newDaily: "New listings every day",
        buyButton: "Buy Now",
        sellButton: "Sell",
        haggle: "Haggle",
        suggestedPrice: "Suggested Price",
        marketPrice: "Market Price",
        baseMarket: "Base Market",
        sellerAsks: "Seller Asks",
        brand: "Brand",
        model: "Model",
        ram: "RAM",
        storage: "Storage",
        color: "Color",
        releaseYear: "Release Year",
        outOfStock: "Sold Out",
        messageSeller: "Message Seller",
        backToMarket: "Back to Marketplace",
        details: "Details",
        description: "Description",
        listedOn: "Listed on Day {day} in {city}",
        sellerInfo: "Seller info · Joined Day {day}",
        online: "Online",
        capNote: "Showing the top {cap} of {total} items to keep things smooth.",
        forSale: "For sale: {brand} {model} {ram}/{rom}, {color}.",
        descCompleteness: "Completeness: {completeness} — {desc}",
        descCondition: "Condition: {defect} — {desc}",
        descReleased: "Released {year}. COD around town, or shipped via courier (buyer pays).",
        descSerious: "Serious buyers PM me directly, no lowballers no time-wasters please 🙏",
        descFoldableNote: "⚠️ NOTE: this foldable has a heavy defect \"{defect}\". {desc}",
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
        day: "Day",
        dayBriefing: "Day {day} Briefing",
        briefingWelcome: "Welcome back, Broker. Markets are open. Here is your morning summary.",
        totalBank: "Total Bank",
        inventoryCount: "Inventory",
        composerPrompt: "What gadget are you flipping today, {name}?",
      },

      /* --- Interactive onboarding tutorial (Part 43) --- */
      tutorial: {
        progress:        "Step {current} of {total}",
        next:            "Next",
        prev:            "Previous",
        skip:            "Skip",
        finish:          "Finish",
        welcome_title:   "Welcome to Flipping Tycoon! 👋",
        welcome_desc:    "You're a gadget broker: buy low, fix things up, and flip phones for profit. This quick tour walks you through the core loop. You can skip anytime.",
        market_title:    "Marketplace",
        market_desc:     "Start here. Buy used gadgets and Batam cargo at low prices. Compare the suggested price vs. the market price to spot a profitable flip.",
        inventory_title: "Inventory & Repair",
        inventory_desc:  "Inspect everything you own here. Send defective units to the Repair Center to fix them, then list them for sale at a higher price.",
        ecommerce_title: "Seller Center & Ads",
        ecommerce_desc:  "Open a store from here, run ad campaigns, and grow your shop toward a 1500+ rating to unlock Star Seller traffic and faster online sales.",
        nextday_title:   "Advance the Day",
        nextday_desc:    "When you're done trading, hit Next Day to process sales, buyer offers, ad spend, rent, and salaries. This is how time moves forward.",
      },

      /* --- Generic input placeholders (commonly-missed i18n leaks) --- */
      placeholders: {
        searchNetbook:  "Search Netbook",
        searchGadgets:  "Search gadgets...",
        enterAmount:    "Enter amount...",
        amountZero:     "0",
        offerIdr:       "Offer how much? (IDR)",
        counterIdr:     "Counter how much? (IDR)",
        customPrice:    "Custom asking price (IDR)",
        serviceFee:     "Service fee (IDR)",
        bankHolder:     "Account holder name",
        playerNameEg:   "e.g. Hans Broker",
        storeNameEg:    "e.g. Hans Counter",
        writePost:      "Write something...",
        pickBank:       "Select Bank...",
        pickOption:     "Select an option...",
      },

      /* --- Alerts / confirms / toast notifications --- */
      alerts: {
        notEnoughMoney:   "Not enough money!",
        insufficientBank: "{bank} balance is not enough.",
        itemSold:         "Item sold!",
        itemBought:       "Item added to inventory!",
        actionFailed:     "Action failed!",
        saved:            "Saved!",
        invalidAmount:    "Please enter a valid amount.",
        confirmClearAll:  "Clear all notifications?",
        notFound:         "Item not found.",
        itemLocked:       "Item is locked (repair / IMEI). Cannot move it.",
        warehouseFull:    "Warehouse is full ({usage}/{cap}).",
        alreadyFullset:   "This item is already a Fullset.",
        comingSoon:       "Coming soon!",
        rent_warning:     "Warning: Rent is due tomorrow!",
      },

      /* --- Empty states --- */
      empty: {
        inventory:    "No items in inventory",
        market:       "No listings available right now",
        news:         "No news today",
        feed:         "Nothing in your feed yet",
        notifications:"No notifications",
        chat:         "No messages yet",
        warehouse:    "Warehouse is empty",
        results:      "No results found",
        transactions: "No transactions yet",
      },

      /* --- Property / storefront rent (Part 6) --- */
      property: {
        per_month: "/ Month",
        rent_due:  "Next rent due in {days} day(s)",
      },

      /* --- Staff Room: roles & daily wages (Part 9) --- */
      staff: {
        customer_service: "Customer Service",
        technician:       "Technician",
        head_of_logistic: "Head of Logistics",
        perDay:           "/ Day",
        dailyWage:        "Daily wage",
        hire:             "Hire",
      },

      /* --- Gadget completeness (set) --- */
      conditions: {
        fullset:  { label: "Fullset", short: "Fullset",
          desc: "Complete with box, charger and all original accessories." },
        batangan: { label: "Unit Only (Batangan)", short: "Batangan",
          desc: "Unit only, no box or bundled accessories." },
      },

      /* --- Gadget defects / minus --- */
      defects: {
        mulus:            { label: "Flawless / No Minus", short: "Flawless",
          desc: "Mint condition, no minus, all functions normal." },
        scratched_screen: { label: "Scratched Screen", short: "Screen Scratch",
          desc: "Thin scratches on the screen, touch still works fine." },
        battery_drop:     { label: "Battery Health Drop", short: "Battery Drop",
          desc: "Battery health under 85%, may need a replacement." },
        sensor_off:       { label: "Face ID / Fingerprint Off", short: "Sensor Off",
          desc: "Face ID or fingerprint sensor not working." },
        cracked_screen:   { label: "Cracked Screen", short: "LCD Cracked",
          desc: "Cracked screen / broken LCD, needs service or LCD swap." },
        /* foldable-only extreme defects */
        loose_hinge:      { label: "Loose Hinge", short: "Loose Hinge",
          desc: "Hinge is loose/wobbly, screen won't close flush. Hinge module replacement required." },
        inner_screen_leak:{ label: "Inner Screen Leak", short: "Inner Leak",
          desc: "Inner folding screen leaking — black ink blob along the crease. Very expensive panel swap." },
        dead_pixel:       { label: "Crease Dead Pixels", short: "Dead Pixel",
          desc: "A line of dead pixels right on the fold. Can't be partially fixed, needs a full screen." },
      },

      /* --- Tax / import provenance --- */
      tax_status: {
        official:    { label: "Official", short: "Official", tag: "Official", warning: "" },
        ex_inter:    { label: "Ex-Inter", short: "Ex-Inter", tag: "Ex-Inter",
          warning: "Cheap (-30%) but this unit came through unofficial channels. Each day carries a 15% risk the IMEI gets blocked & signal dies." },
        black_market:{ label: "Black Market (No Pajak)", short: "No Pajak", tag: "No Pajak",
          warning: "Off-the-books unit. Bargain price, but the IMEI can be blacklisted at any time. No returns, no warranty." },
      },

      /* --- AI chat / negotiation lines --- */
      chat: {
        opener_intro:     "Hey there! 👋 I'm selling a {name} {ram}/{rom} in {color}.",
        opener_condition: "Completeness {completeness}, condition {defect}.",
        opener_exinter:   "Heads up, this is an Ex-Inter unit, no tax — that's why the price is so low. You know the risk, right? 😏",
        opener_price:     "Net price {price}. Serious to buy? 🙏",
        player_offer:     "I'll offer {price}, deal? 🙏",
        counter_1:        "Not quite, mate. Make it {price} and it's yours 🤝",
        counter_2:        "Hmm still too high for me. How about {price}? Final if you're in.",
        counter_3:        "I'll drop a bit more to {price}. Can't go lower than that bro 😅",
        counter_4:        "Okay slim margin, {price} flat. If it works, let's COD/transfer.",
        accept_1:         "Alright then, {price} it is! Deal 🤝",
        accept_2:         "Fine, {price} locked, nice haggling 😅",
        accept_3:         "Done, {price} it is, processing now bro.",
        ragequit_1:       "Forget it, you're lowballing! 😤 Go find another one.",
        ragequit_2:       "I'm done negotiating bro, your offers make no sense. Out! 👋",
        ragequit_3:       "Nah, way too much haggling. Closing this chat 🙏",
        deal:             "Awesome! Transfer to my account and the item ships / we COD. Thanks bro 📦✨",
        exinter_system:   "⚠️ This listing is Ex-Inter / No Tax. Cheap, but the IMEI can get signal-blocked.",
        offer_min_error:  "Minimum offer is Rp 50,000.",
        accept_label:     "Accept {price}",
        leave:            "Leave Chat",
        sendOffer:        "Send",
        offerPlaceholder: "Offer how much? (IDR)",
        locked:           "Seller is done negotiating — chat locked.",
        activeNow:        "Active now",
        /* purchase flow */
        player_interested:    "Okay, I'll take it bro. What payment method works best?",
        seller_method:        "Bank Transfer or COD meetup. Which one?",
        player_pick_transfer: "I'll just transfer, faster that way 💸",
        player_pick_cod:      "COD it is, I want to check the unit first 🔍",
        method_transfer:      "Bank Transfer",
        method_transfer_hint: "Fast & direct",
        method_cod:           "COD (Meetup)",
        method_cod_hint:      "Inspect first",
        cancel:               "Cancel",
        doneClose:            "Close & Back to Marketplace",
        bank_insufficient_tag:"(short)",
        bank_insufficient:    "{bank} balance is not enough.",
        player_pay:           "Done, transferring from {bank} bro. {price} 💸",
        txn_success:          "✅ Transaction complete. {price} debited from {bank} via {method}. Item added to Inventory.",
        /* inspection */
        inspect_clean:        "🔍 Inspection result: item matches the description.",
        seller_clean:         "See? All clean. Which bank are you paying from?",
        hidden_found:         "⚠️ Hidden defect found: {defect}",
        player_cancel_hidden: "Whoa, hidden defect: {defect}. Sorry bro, I'll pass.",
        seller_cancel:        "Alright then. Maybe next time 🙏",
        player_nego_hidden:   "Since there's a hidden defect ({defect}), I'll knock 15% off our deal, so {price}.",
        seller_nego_hidden:   "Hmm... okay fair enough, from {prev} down to {price}. Which bank?",
        inspect_foldable:     "⚠️ COD inspection: {defect} found! {desc}",
        player_cancel_foldable:"Whoa, {defect} bro, repairs cost millions. I'll pass for now 🙏",
        seller_cancel_foldable:"Ahh... alright, no problem 🙏",
        player_nego_foldable: "There's {defect}, repair is super expensive. Drop it to {price} please bro.",
        seller_nego_foldable: "Ugh... fine, {price} it is. Which bank?",
        /* hidden defect pool (COD blind-spot finds) */
        hidden: {
          back_glass:    "Found a hidden scratch on the back glass.",
          true_tone:     "True Tone is off / color sensor error.",
          speaker:       "Bottom speaker crackles at high volume.",
          charging_port: "Charging connector is wobbly, needs service.",
          battery_cycle: "Battery cycle count is over 800 (very high).",
          board_repair:  "Signs of a previous mainboard repair.",
          ultrawide:     "Ultrawide camera is blurry, faulty sensor.",
        },
      },

      /* --- Dynamic Newsfeed posts ---
       * Each entry has a headline + blurb. {pct} = absolute % move. */
      news: {
        source: "Netbook News",
        stableTag: "Stable Market",
        pearphone_rumor: { headline: "PearPhone 17 rumored to launch next month!",
          blurb: "Used PearPhone market is buzzing, prices jump {pct}%." },
        ios_battery_bug:  { headline: "New iOS bug drains PearPhone battery badly.",
          blurb: "Many dumping their PearPhones, prices crash {pct}% today." },
        pear_tradein:     { headline: "Pear announces a big PearPad trade-in.",
          blurb: "Used PearPads flood the marketplace, prices drop {pct}%." },
        sumsang_update:   { headline: "Sumsang One UI 7 runs buttery on older units!",
          blurb: "Used Universe demand rises {pct}% after the slick update." },
        sumsang_overheat: { headline: "Universe S Series hit by overheating issue.",
          blurb: "Lots of trade-ins, used prices fall {pct}%." },
        foldable_viral:   { headline: "Z Fold/Flip goes viral on TikTok, foldable demand explodes.",
          blurb: "Sumsang foldables are the hot pick, up {pct}%." },
        siaomi_dxomark:   { headline: "Siaomi 14 tops DxOMark, collectors are hunting.",
          blurb: "Used Siaomi up {pct}% on camera hype." },
        siaomi_discount:  { headline: "Siaomi launches a mass discount on the Note series.",
          blurb: "Stock floods the market, prices drop {pct}%." },
        ope_leak:         { headline: "Ope Reno 12 leak: design similar to the old series.",
          blurb: "Owners reluctant to upgrade, used Ope up {pct}%." },
        ope_recall:       { headline: "Ope Find X recalled over a screen defect.",
          blurb: "Brand trust dips, used prices fall {pct}%." },
        pipo_camera:      { headline: "Pipo X100 Pro named best camera phone of the year.",
          blurb: "Pipo flagship surges {pct}% on the used market." },
        pipo_sale:        { headline: "Pipo Y Series goes on a huge bank-promo sale.",
          blurb: "Used Y Series pressured by promo discounts, down {pct}%." },
        market_stable:    { headline: "Gadget market is calm, no price swings.",
          blurb: "A stable day. Time to scout deals in the Marketplace." },
      },

      /* --- Part 39: dynamic Social Feed posts --- */
      feed: {
        sectionTitle: "Activity Feed",
        // NPC milestones ({name} = the friend's name)
        milestone: {
          source: "Milestones",
          priority_tier:  "{name} just hit Priority Tier at the bank! 💳",
          kiosk:          "{name} just rented a Kiosk to start flipping! 🏪",
          ruko:           "{name} leveled up to a full Ruko storefront! 🏢",
          first_million:  "{name} booked their first Rp 1,000,000 profit! 🤑",
          hired_staff:    "{name} hired their first SPG for the store. 🧑‍💼",
          branch:         "{name} opened a second branch in another city! 🌆",
          star_seller:    "{name} unlocked the Star Seller badge ⭐",
          big_flip:       "{name} flipped a foldable for a fat margin today. 📈",
        },
        // Immersive community chatter (no params)
        chatter: {
          source: "Community Group",
          scam_cod:    "Just got scammed at a COD meetup... always check the IMEI first, guys. 😡",
          imei_check:  "PSA: a 'mulus' unit means nothing if the IMEI is blocked. Always verify!",
          harga_naik:  "Anyone else notice second-hand prices creeping up this week? 📈",
          nostalgia:   "Found my old PearPhone in a drawer, still boots up. Memories. 🥲",
          batangan:    "Batangan (unit-only) deals are the best margin if you can resell the box separately.",
          afgan:       "Buyer offered me 50% off a fresh fullset. The audacity. 💀",
          flipper_tip: "Pro tip: buy on a price-crash news day, sell when the hype returns. 🧠",
          coffee:      "Counting today's profit over kopi. The grind never stops. ☕",
        },
        // Friend-listing card (a friend selling a gadget)
        listing: {
          source: "Marketplace · Friends",
          reason_bu:    "{name} is selling (BU — need cash fast):",
          reason_cash:  "{name} needs quick cash, letting this go cheap:",
          reason_move:  "{name} is moving and clearing out gadgets:",
          reason_upgrade:"{name} is upgrading and flipping the old one:",
          askingLabel:  "Asking",
          negotiate:    "Negotiate / Tawar",
          sold:         "Already Sold",
          postedBy:     "Posted by {name}",
        },
        // Generic feed actions
        like: "Like",
        comment: "Comment",
        share: "Share",
      },
    },

    /* ------------------------------------------------------ */
    /* BAHASA INDONESIA                                       */
    /* ------------------------------------------------------ */
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
        completeness: "Kelengkapan",
        defect: "Minus",
        all: "Semua",
        search: "Cari",
        today: "Hari ini",
        items: "barang",
        units: "unit",
        multiplier: "pengali",
      },
      nav: {
        newsFeed: "Beranda",
        marketplace: "Marketplace",
        inventory: "Inventaris",
        ecommerce: "E-commerce",
        banking: "Bank",
        repair: "Pusat Servis",
        batam: "Supplier Batam",
        logistics: "Kargo / Logistik",
        profile: "Profil",
        settings: "Pengaturan",
      },
      market: {
        title: "Marketplace",
        subtitle: "Listing hari ini · Hari {day} · {count} barang",
        newDaily: "Listing baru tiap hari",
        buyButton: "Beli Sekarang",
        sellButton: "Jual",
        haggle: "Nego",
        suggestedPrice: "Harga Saran",
        marketPrice: "Harga Pasar",
        baseMarket: "Harga Pasar Dasar",
        sellerAsks: "Harga Penjual",
        brand: "Merek",
        model: "Model",
        ram: "RAM",
        storage: "Penyimpanan",
        color: "Warna",
        releaseYear: "Tahun Rilis",
        outOfStock: "Terjual",
        messageSeller: "Chat Penjual",
        backToMarket: "Kembali ke Marketplace",
        details: "Detail",
        description: "Deskripsi",
        listedOn: "Diposting Hari {day} di {city}",
        sellerInfo: "Info penjual · Gabung Hari {day}",
        online: "Online",
        capNote: "Menampilkan {cap} barang teratas dari total {total} barang untuk menjaga performa.",
        forSale: "Dijual {brand} {model} {ram}/{rom} warna {color}.",
        descCompleteness: "Kelengkapan: {completeness} — {desc}",
        descCondition: "Kondisi: {defect} — {desc}",
        descReleased: "Tahun rilis {year}. Bisa COD area kota, atau kirim pakai ekspedisi (ongkir DTG).",
        descSerious: "Serius minat boleh PM langsung, no afgan no php ya bro/sis 🙏",
        descFoldableNote: "⚠️ CATATAN: Unit foldable ini ada minus berat \"{defect}\". {desc}",
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
        day: "Hari",
        dayBriefing: "Briefing Hari {day}",
        briefingWelcome: "Selamat datang lagi, Broker. Pasar sudah buka. Ini ringkasan pagimu.",
        totalBank: "Total Bank",
        inventoryCount: "Inventaris",
        composerPrompt: "Lagi flipping gadget apa hari ini, {name}?",
      },

      /* --- Tutorial onboarding interaktif (Part 43) --- */
      tutorial: {
        progress:        "Langkah {current} dari {total}",
        next:            "Lanjut",
        prev:            "Kembali",
        skip:            "Lewati",
        finish:          "Selesai",
        welcome_title:   "Selamat datang di Flipping Tycoon! 👋",
        welcome_desc:    "Kamu seorang broker gadget: beli murah, perbaiki, lalu jual lagi untuk untung. Tur singkat ini menjelaskan alur intinya. Bisa dilewati kapan saja.",
        market_title:    "Marketplace",
        market_desc:     "Mulai dari sini. Beli gadget bekas dan kargo Batam dengan harga murah. Bandingkan harga saran vs harga pasar untuk cari flip yang cuan.",
        inventory_title: "Inventory & Repair",
        inventory_desc:  "Periksa semua barang milikmu di sini. Kirim unit yang rusak ke Repair Center untuk diperbaiki, lalu jual dengan harga lebih tinggi.",
        ecommerce_title: "Seller Center & Iklan",
        ecommerce_desc:  "Buka toko dari sini, jalankan kampanye iklan, dan kembangkan toko hingga rating 1500+ untuk membuka traffic Star Seller dan penjualan online lebih cepat.",
        nextday_title:   "Lanjut ke Hari Berikutnya",
        nextday_desc:    "Kalau sudah selesai berdagang, tekan Next Day untuk memproses penjualan, tawaran pembeli, biaya iklan, sewa, dan gaji. Begini cara waktu berjalan.",
      },

      /* --- Placeholder input (kebocoran i18n yang sering terlewat) --- */
      placeholders: {
        searchNetbook:  "Cari di Netbook",
        searchGadgets:  "Cari gadget...",
        enterAmount:    "Masukkan jumlah...",
        amountZero:     "0",
        offerIdr:       "Tawar berapa? (IDR)",
        counterIdr:     "Counter berapa? (IDR)",
        customPrice:    "Harga jual custom (IDR)",
        serviceFee:     "Biaya Servis (IDR)",
        bankHolder:     "Nama pemilik rekening",
        playerNameEg:   "Misal: Hans Broker",
        storeNameEg:    "Misal: Hans Counter",
        writePost:      "Tulis sesuatu...",
        pickBank:       "Pilih Bank...",
        pickOption:     "Pilih salah satu...",
      },

      /* --- Alert / konfirmasi / notifikasi toast --- */
      alerts: {
        notEnoughMoney:   "Saldo tidak cukup!",
        insufficientBank: "Saldo {bank} tidak cukup.",
        itemSold:         "Barang terjual!",
        itemBought:       "Barang masuk ke inventaris!",
        actionFailed:     "Aksi gagal!",
        saved:            "Tersimpan!",
        invalidAmount:    "Masukkan jumlah yang valid.",
        confirmClearAll:  "Bersihkan semua notifikasi?",
        notFound:         "Barang tidak ditemukan.",
        itemLocked:       "Barang sedang dikunci (repair / IMEI). Tidak bisa dipindah.",
        warehouseFull:    "Warehouse penuh ({usage}/{cap}).",
        alreadyFullset:   "Item ini sudah Fullset.",
        comingSoon:       "Segera hadir!",
        rent_warning:     "Peringatan: Bayar sewa ruko besok!",
      },

      /* --- Empty state --- */
      empty: {
        inventory:    "Inventaris kosong",
        market:       "Belum ada listing saat ini",
        news:         "Belum ada berita hari ini",
        feed:         "Belum ada aktivitas di beranda",
        notifications:"Tidak ada notifikasi",
        chat:         "Belum ada pesan",
        warehouse:    "Warehouse kosong",
        results:      "Tidak ada hasil ditemukan",
        transactions: "Belum ada transaksi",
      },

      /* --- Properti / sewa ruko (Part 6) --- */
      property: {
        per_month: "/ Bulan",
        rent_due:  "Sewa berikutnya {days} hari lagi",
      },

      /* --- Staff Room: peran & gaji harian (Part 9) --- */
      staff: {
        customer_service: "Customer Service",
        technician:       "Technician",
        head_of_logistic: "Head of Logistics",
        perDay:           "/ Hari",
        dailyWage:        "Gaji harian",
        hire:             "Rekrut",
      },

      conditions: {
        fullset:  { label: "Fullset", short: "Fullset",
          desc: "Lengkap dengan dus, charger, dan kelengkapan asli." },
        batangan: { label: "HP Only (Batangan)", short: "Batangan",
          desc: "Unit only, tanpa dus dan aksesori bawaan." },
      },

      defects: {
        mulus:            { label: "Mulus / No Minus", short: "Mulus",
          desc: "Kondisi mulus, tidak ada minus, normal semua fungsi." },
        scratched_screen: { label: "Layar Baret", short: "Baret Layar",
          desc: "Ada baret tipis di layar, tidak mengganggu fungsi sentuh." },
        battery_drop:     { label: "Battery Health Drop", short: "Battery Drop",
          desc: "Battery health di bawah 85%, mungkin perlu ganti baterai." },
        sensor_off:       { label: "FaceID/Fingerprint Off", short: "Sensor Off",
          desc: "Face ID atau sensor sidik jari tidak berfungsi." },
        cracked_screen:   { label: "Layar Retak", short: "LCD Retak",
          desc: "Layar retak / LCD pecah, perlu service / ganti LCD." },
        loose_hinge:      { label: "Engsel Longgar", short: "Engsel Longgar",
          desc: "Engsel (hinge) sudah oblak/longgar, layar tidak menutup rapat. Wajib ganti modul engsel." },
        inner_screen_leak:{ label: "Layar Lipat Bocor", short: "Inner Bocor",
          desc: "Inner screen (layar lipat dalam) bocor — blob tinta hitam di garis lipatan. Ganti panel super mahal." },
        dead_pixel:       { label: "Dead Pixel Lipatan", short: "Dead Pixel",
          desc: "Garis dead pixel tepat di lipatan layar. Tidak bisa diperbaiki parsial, harus ganti layar utuh." },
      },

      tax_status: {
        official:    { label: "Resmi", short: "Resmi", tag: "Resmi", warning: "" },
        ex_inter:    { label: "Ex-Inter", short: "Ex-Inter", tag: "Ex-Inter",
          warning: "Harga miring (-30%) tapi unit ini masuk dari jalur tidak resmi. Setiap hari ada risiko 15% IMEI diblokir & sinyal mati." },
        black_market:{ label: "Black Market (No Pajak)", short: "No Pajak", tag: "No Pajak",
          warning: "Unit dari jalur tidak resmi. Harga miring tapi IMEI bisa kena blokir sewaktu-waktu. No retur, no garansi." },
      },

      chat: {
        opener_intro:     "Halo bro/sis! 👋 Saya jual {name} {ram}/{rom} warna {color}.",
        opener_condition: "Kelengkapan {completeness}, kondisi {defect}.",
        opener_exinter:   "Ini barang Ex-Inter ya bro, no pajak — makanya harga miring banget. Tau resikonya kan? 😏",
        opener_price:     "Harga net {price} ya. Serius minat? 🙏",
        player_offer:     "Saya tawar {price} ya bro. Dikasih gak? 🙏",
        counter_1:        "Belum dapet gan. Kalau {price} langsung bungkus deh 🤝",
        counter_2:        "Hmm masih ketinggian buat saya. Gimana kalo {price}? Fix ya kalau mau.",
        counter_3:        "Saya turunin lagi nih ke {price}. Lebih murah lagi gak bisa bro 😅",
        counter_4:        "Oke nego tipis, {price} aja. Kalau cocok langsung COD/transfer.",
        accept_1:         "Wah oke deh kakak, {price} saya iyain! Deal 🤝",
        accept_2:         "Yaudah {price} fix ya, mantap nego nya 😅",
        accept_3:         "Sip {price} sah ya, langsung diproses bro.",
        ragequit_1:       "Males ah, nego afgan! 😤 Cari yang lain aja gan.",
        ragequit_2:       "Udah cape nego nya bro, kasih harga gak masuk akal terus. Cabut! 👋",
        ragequit_3:       "Males lah, nego afgan banget. Saya tutup ya chatnya 🙏",
        deal:             "Sip mantap! Transfer ke rekening saya ya, barang langsung dikirim/COD. Makasih bro 📦✨",
        exinter_system:   "⚠️ Listing ini Ex-Inter / No Pajak. Murah, tapi IMEI bisa kena blokir signal.",
        offer_min_error:  "Tawaran minimal Rp 50.000.",
        accept_label:     "Terima {price}",
        leave:            "Tutup Chat",
        sendOffer:        "Kirim",
        offerPlaceholder: "Tawar berapa? (IDR)",
        locked:           "Seller udah males nego — chat dikunci.",
        activeNow:        "Aktif sekarang",
        /* purchase flow */
        player_interested:    "Oke, saya minat ambil bro. Pakai metode apa enaknya?",
        seller_method:        "Bisa Bank Transfer atau COD ketemuan langsung. Pilih mana?",
        player_pick_transfer: "Saya transfer aja ya, biar cepat 💸",
        player_pick_cod:      "COD aja deh, mau cek dulu kondisinya 🔍",
        method_transfer:      "Bank Transfer",
        method_transfer_hint: "Cepat & langsung",
        method_cod:           "COD (Meetup)",
        method_cod_hint:      "Bisa cek barang dulu",
        cancel:               "Batal",
        doneClose:            "Tutup & Kembali ke Marketplace",
        bank_insufficient_tag:"(kurang)",
        bank_insufficient:    "Saldo {bank} tidak cukup.",
        player_pay:           "Sip, transfer dari {bank} ya bro. {price} 💸",
        txn_success:          "✅ Transaksi sukses. {price} ditarik dari {bank} via {method}. Item masuk ke Inventory.",
        /* inspection */
        inspect_clean:        "🔍 Hasil inspeksi: Barang sesuai deskripsi.",
        seller_clean:         "Tuh kan, bersih semua. Bayar pakai bank apa?",
        hidden_found:         "⚠️ Hidden defect ditemukan: {defect}",
        player_cancel_hidden: "Wah ada minus tersembunyi: {defect}. Sorry bro, batal aja.",
        seller_cancel:        "Ya udah deh. Mungkin lain kali 🙏",
        player_nego_hidden:   "Karena ada minus tersembunyi ({defect}), saya tawar -15% dari harga deal kita ya bro. Jadi {price}.",
        seller_nego_hidden:   "Hmm... oke deh, fair lah dari {prev} jadi {price}. Bayar pakai bank apa?",
        inspect_foldable:     "⚠️ Inspeksi COD: {defect} ditemukan! {desc}",
        player_cancel_foldable:"Wah {defect} bro, servisnya bisa jutaan. Batal dulu deh 🙏",
        seller_cancel_foldable:"Yah... ya udah, no problem 🙏",
        player_nego_foldable: "Ada {defect} nih, servisnya mahal banget. Minta turun ke {price} ya bro.",
        seller_nego_foldable: "Aduh... yaudah deh {price} fix. Bayar pakai bank apa?",
        /* hidden defect pool (COD blind-spot finds) */
        hidden: {
          back_glass:    "Ada baret tersembunyi di kaca belakang.",
          true_tone:     "True Tone mati / sensor warna error.",
          speaker:       "Speaker bawah pecah saat volume tinggi.",
          charging_port: "Konektor charging goyang, perlu service.",
          battery_cycle: "Battery cycle ternyata lewat 800 (sangat tinggi).",
          board_repair:  "Ada bekas servis di mainboard.",
          ultrawide:     "Kamera ultrawide ngeblur, sensor bermasalah.",
        },
      },

      news: {
        source: "Netbook News",
        stableTag: "Pasar Stabil",
        pearphone_rumor: { headline: "PearPhone 17 dirumorkan rilis bulan depan!",
          blurb: "Pasar second PearPhone ramai diserbu, harga melambung {pct}%." },
        ios_battery_bug:  { headline: "Bug iOS terbaru bikin baterai PearPhone boros parah.",
          blurb: "Banyak yang lepas PearPhone-nya, harga anjlok {pct}% hari ini." },
        pear_tradein:     { headline: "Pear umumkan Trade-in besar untuk PearPad.",
          blurb: "PearPad bekas membanjir Marketplace, harga turun {pct}%." },
        sumsang_update:   { headline: "Sumsang One UI 7 menyala mulus di seri lama!",
          blurb: "Demand Universe second naik {pct}% setelah update memukau." },
        sumsang_overheat: { headline: "Universe S Series ditemukan masalah panas berlebih.",
          blurb: "Banyak user trade-in, harga second turun {pct}%." },
        foldable_viral:   { headline: "Z Fold/Flip viral di TikTok, demand foldable meledak.",
          blurb: "Foldable Sumsang jadi rebutan, naik {pct}%." },
        siaomi_dxomark:   { headline: "Siaomi 14 raih juara DxOMark, kolektor berburu.",
          blurb: "Siaomi second naik {pct}% karena hype kamera." },
        siaomi_discount:  { headline: "Siaomi luncurkan diskon massal seri Note.",
          blurb: "Stok membanjir pasar, harga turun {pct}%." },
        ope_leak:         { headline: "Ope Reno 12 leak: desain mirip seri lama.",
          blurb: "Pengguna lama enggan upgrade, second Ope naik {pct}%." },
        ope_recall:       { headline: "Ope Find X ditarik karena cacat layar.",
          blurb: "Kepercayaan brand turun, harga second jatuh {pct}%." },
        pipo_camera:      { headline: "Pipo X100 Pro terpilih HP kamera terbaik tahun ini.",
          blurb: "Pipo flagship melejit {pct}% di pasar second." },
        pipo_sale:        { headline: "Pipo Y Series obral besar-besaran via promo bank.",
          blurb: "Y Series second tertekan diskon promo, harga drop {pct}%." },
        market_stable:    { headline: "Pasar gadget tenang, tidak ada gejolak harga.",
          blurb: "Hari yang stabil. Saatnya scout deal di Marketplace." },
      },

      /* --- Part 39: post Social Feed dinamis --- */
      feed: {
        sectionTitle: "Beranda Aktivitas",
        milestone: {
          source: "Pencapaian",
          priority_tier:  "{name} baru naik ke Priority Tier di bank! 💳",
          kiosk:          "{name} baru sewa Kios buat mulai jualan! 🏪",
          ruko:           "{name} naik kelas ke Ruko beneran! 🏢",
          first_million:  "{name} cuan pertama Rp 1.000.000! 🤑",
          hired_staff:    "{name} merekrut SPG pertama buat tokonya. 🧑‍💼",
          branch:         "{name} buka cabang kedua di kota lain! 🌆",
          star_seller:    "{name} unlock badge Star Seller ⭐",
          big_flip:       "{name} flipping foldable dengan margin tebal hari ini. 📈",
        },
        chatter: {
          source: "Grup Komunitas",
          scam_cod:    "Baru aja kena tipu pas COD... cek IMEI dulu ya gengs sebelum bayar. 😡",
          imei_check:  "Inget: unit 'mulus' percuma kalau IMEI keblokir. Wajib cek dulu!",
          harga_naik:  "Ada yang ngerasa harga second naik terus minggu ini? 📈",
          nostalgia:   "Nemu PearPhone lama di laci, masih nyala. Kenangan. 🥲",
          batangan:    "Deal batangan (HP only) margin paling cuan kalau dusnya bisa dijual terpisah.",
          afgan:       "Ada buyer nawar fullset baru setengah harga. Sadis bener. 💀",
          flipper_tip: "Tips: beli pas hari berita harga anjlok, jual pas hype balik. 🧠",
          coffee:      "Ngitung cuan hari ini sambil ngopi. Grind terus. ☕",
        },
        listing: {
          source: "Marketplace · Teman",
          reason_bu:    "{name} lagi jual (BU — butuh dana cepet):",
          reason_cash:  "{name} butuh duit cepet, dilepas murah:",
          reason_move:  "{name} mau pindahan, bersih-bersih gadget:",
          reason_upgrade:"{name} mau upgrade, lepas yang lama:",
          askingLabel:  "Nego dari",
          negotiate:    "Tawar Barang",
          sold:         "Sudah Laku",
          postedBy:     "Diposting oleh {name}",
        },
        like: "Suka",
        comment: "Komentar",
        share: "Bagikan",
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
   * t(key, params) — translate a dotted key with variable interpolation.
   * Fallback chain: activeLang -> English -> the key string itself
   * (so a missing key shows the key, never "undefined").
   *
   *   t("chat.opener_price", { price: "Rp 10.000.000" })
   *   t("conditions.batangan.label")
   */
  function t(key, params) {
    if (!key || typeof key !== "string") return "";
    const lang = getLang();

    // 1) Try the active language tree first.
    let str = lookup(DICT[lang], key);

    // 2) FAILSAFE: if the key is missing from the ENGLISH ('en') dictionary,
    //    warn loudly so missing translations are easy to spot in the console.
    //    English is the canonical/complete dictionary, so a key absent there
    //    is almost always a genuine "leak" that needs adding.
    const enStr = lookup(DICT[FALLBACK_LANG], key);
    if (enStr === undefined) {
      if (window.console && console.warn) {
        console.warn("Missing translation for key: " + key);
      }
    }

    // 3) Graceful fallback chain: activeLang -> English -> the key itself,
    //    so the UI NEVER renders "undefined" and never breaks.
    if (str === undefined && lang !== FALLBACK_LANG) {
      str = enStr; // graceful English fallback
    }
    if (str === undefined) {
      // Final safety net: return the key so nothing renders as "undefined".
      return key;
    }
    return interpolate(str, params);
  }

  /**
   * tr(keys, params) — translate ONE randomly-picked key from an array.
   * Used by the chat AI so the seller's counter/accept/rage lines vary,
   * while staying fully translatable. Accepts an array of keys OR a
   * "prefix" + count via tr("chat.counter_", 4, params).
   */
  function tr(keys, a, b) {
    let arr, params;
    if (typeof keys === "string") {
      const count = a | 0;
      params = b;
      arr = [];
      for (let i = 1; i <= count; i++) arr.push(keys + i);
    } else {
      arr = Array.isArray(keys) ? keys : [keys];
      params = a;
    }
    const key = arr[Math.floor(Math.random() * arr.length)];
    return t(key, params);
  }

  /* =========================================================
   * 3. KEY RESOLVERS (save-file-safe bridges)
   *
   * Dynamic game data should now store stable keys directly
   * (completeness.key / defect.key). For OLD saves that only
   * have the legacy `type` string, these resolvers map the
   * string back to a stable key so rendering still translates.
   * ========================================================= */

  const LEGACY_CONDITION_BY_TYPE = {
    "Fullset": "fullset",
    "HP Only / Batangan": "batangan",
  };
  const LEGACY_CONDITION_BY_SHORT = {
    "Fullset": "fullset",
    "Batangan": "batangan",
  };

  const LEGACY_DEFECT_BY_TYPE = {
    "Mulus / No Minus": "mulus",
    "Layar Baret": "scratched_screen",
    "Battery Health Drop": "battery_drop",
    "FaceID/Fingerprint Off": "sensor_off",
    "Layar Retak": "cracked_screen",
    "Engsel Longgar": "loose_hinge",
    "Layar Lipat Bocor": "inner_screen_leak",
    "Dead Pixel Lipatan": "dead_pixel",
  };

  /** Stable key for a completeness object (prefers explicit .key). */
  function conditionKey(obj) {
    if (!obj) return "fullset";
    if (obj.key) return obj.key;
    return LEGACY_CONDITION_BY_TYPE[obj.type] ||
           LEGACY_CONDITION_BY_SHORT[obj.short] ||
           "fullset";
  }

  /** Stable key for a defect object (prefers explicit .key). */
  function defectKey(obj) {
    if (!obj) return "mulus";
    if (obj.key) return obj.key;
    return LEGACY_DEFECT_BY_TYPE[obj.type] || "mulus";
  }

  /** Tax/provenance key for a listing or inventory item. */
  function taxKey(itemOrListing) {
    if (!itemOrListing) return "official";
    if (itemOrListing.taxKey) return itemOrListing.taxKey;
    return itemOrListing.isExInter ? "ex_inter" : "official";
  }

  /* =========================================================
   * 4. STATE + PERSISTENCE
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
   * 5. UI INTEGRATION — switcher + static-DOM translation
   * ========================================================= */

  /**
   * switchLanguage(code) — set the language, persist it, then trigger
   * a full UI re-render so every translated string updates instantly.
   * Static DOM is re-translated AND the dynamic render functions run,
   * so newsfeed posts, gadget cards and chat logs all flip live.
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

    // 1) Re-translate any static (non-rendered) DOM + switcher labels.
    translateDOM(document);
    updateSwitcherLabels();

    // 2) Full re-render of the app so dynamic content re-maps via t().
    try {
      const FT = window.FlippingTycoon;
      if (FT && typeof FT.renderAllPages === "function") FT.renderAllPages();
      else if (FT && typeof FT.renderAll === "function") FT.renderAll();
      else if (FT && typeof FT.renderActivePage === "function") FT.renderActivePage();
    } catch (e) {}

    // 3) If a chat overlay is open, re-render it so the live conversation flips too.
    try {
      if (window.Chat && typeof window.Chat.refreshOpen === "function") {
        window.Chat.refreshOpen();
      }
    } catch (e) {}

    return true;
  }

  /** Toggle between the two shipped languages (EN <-> ID). */
  function toggleLanguage() {
    return switchLanguage(getLang() === "id" ? "en" : "id");
  }

  /**
   * translateDOM(root) — translate static markup. Supports:
   *   <span data-i18n="banking.transfer"></span>           -> textContent
   *   <p data-i18n-html="game.exInter"></p>                -> innerHTML
   *   <input data-i18n-placeholder="common.search" />      -> placeholder
   *   <input data-i18n-attr="placeholder:common.search" /> -> attribute(s)
   *   <option data-i18n="banking.pickBank"></option>       -> textContent
   * Multiple attrs: data-i18n-attr="placeholder:common.search,title:nav.banking"
   *
   * data-i18n-params='{"day":5}' can supply interpolation params as JSON.
   */
  function translateDOM(root) {
    root = root || document;

    function paramsOf(el) {
      const raw = el.getAttribute("data-i18n-params");
      if (!raw) return undefined;
      try { return JSON.parse(raw); } catch (e) { return undefined; }
    }

    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"), paramsOf(el));
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"), paramsOf(el));
    });

    // NEW: dedicated placeholder sweep. Catches the most commonly missed
    // "leak" — <input>/<textarea> placeholder attributes left in Indonesian.
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"), paramsOf(el));
    });

    // NEW: generic title/aria-label sweep so tooltips & a11y labels translate too.
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title"), paramsOf(el)));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label"), paramsOf(el)));
    });

    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(",").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key, paramsOf(el)));
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
   * 6. BOOTSTRAP
   * ========================================================= */
  function init() {
    try { document.documentElement.setAttribute("lang", getLang()); } catch (e) {}
    translateDOM(document);
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
    translateDOM(document);
    bindSwitchers();
  });

  /* =========================================================
   * 7. PUBLIC API
   * ========================================================= */
  window.i18n = {
    DICT,
    t,
    tr,
    getLang,
    switchLanguage,
    toggleLanguage,
    translateDOM,
    applyStaticDom: translateDOM, // backward-compatible alias
    bindSwitchers,
    updateSwitcherLabels,
    // key resolvers (save-file-safe bridges)
    conditionKey,
    defectKey,
    taxKey,
    available: ["id", "en"],
    DEFAULT_LANG,
  };

  // Global shortcuts for terse use inside render functions.
  window.t = t;
  window.tr = tr;
  window.switchLanguage = switchLanguage;
})();
