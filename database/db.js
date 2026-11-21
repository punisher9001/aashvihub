const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const STORE_PATH = path.join(__dirname, 'local_store.json');

const INITIAL_DATA = {
  settings: [
    { k: 'shop_name', v: 'Aashvi Hub' },
    { k: 'owner_name', v: 'Dr Mukul Kumar' },
    { k: 'owner_phone', v: '8988227729' },
    { k: 'owner_whatsapp', v: '918988227729' },
    { k: 'owner_title', v: 'Founder & Chief Medical Consultant' },
    { k: 'origin_pincode', v: '110001' },
    { k: 'delivery_fee', v: '40' },
    { k: 'free_delivery_above', v: '499' },
    { k: 'remote_prefixes', v: '18,19,744,78,79' },
    { k: 'theme_mode', v: 'auto' },
    { k: 'support_email', v: 'support@aashvihub.com' },
    { k: 'shop_address', v: 'Aashvi Hub Central Hub, Medical Enclave, New Delhi - 110001' }
  ],
  delivery_zones: [
    { zone_key: 'local', label: 'Same City / Priority Express', min_days: 1, max_days: 2 },
    { zone_key: 'regional', label: 'Same State / Regional Express', min_days: 2, max_days: 3 },
    { zone_key: 'national', label: 'National Delivery (All India)', min_days: 3, max_days: 5 },
    { zone_key: 'remote', label: 'Special & Remote Areas (J&K, NE, Islands)', min_days: 5, max_days: 8 }
  ],
  themes: [
    { id: 1, theme_key: 'default', name: 'Aashvi Hub • Curated by Dr Mukul Kumar', start_date: null, end_date: null },
    { id: 2, theme_key: 'diwali', name: '🪔 Happy Diwali Festive Grand Sale • Extra Savings!', start_date: '2026-10-20', end_date: '2026-11-05' },
    { id: 3, theme_key: 'eid', name: '🌙 Eid Mubarak • Special Festive Offerings', start_date: null, end_date: null },
    { id: 4, theme_key: 'holi', name: '🎨 Happy Holi Festival • Vibrant Health & Festive Joy', start_date: null, end_date: null },
    { id: 5, theme_key: 'navratri', name: '🌸 Shubh Navratri • Pure Fasting & Healthy Living', start_date: null, end_date: null },
    { id: 6, theme_key: 'christmas', name: '🎄 Merry Christmas & Year-End Mega Savings', start_date: '2026-12-20', end_date: '2026-12-31' },
    { id: 7, theme_key: 'independence', name: '🇮🇳 Happy Independence Day • Proudly Indian', start_date: '2026-08-10', end_date: '2026-08-18' },
    { id: 8, theme_key: 'newyear', name: '✨ Happy New Year 2027 • Healthy Beginnings', start_date: '2026-12-31', end_date: '2027-01-05' }
  ],
  categories: [
    { id: 1, name: 'Foods', icon: '🍱', sort_order: 1, is_available: 1 },
    { id: 2, name: 'Masale & Spices', icon: '🌶️', sort_order: 2, is_available: 1 },
    { id: 3, name: 'Clothes', icon: '👕', sort_order: 3, is_available: 1 },
    { id: 4, name: 'Electric Parts', icon: '🔌', sort_order: 4, is_available: 1 },
    { id: 5, name: 'Fresh Vegetables', icon: '🥦', sort_order: 5, is_available: 1 }
  ],
  subcategories: [
    { id: 1, category_id: 1, name: 'Jams', image: 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 2, category_id: 1, name: 'Biscuits', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 3, category_id: 1, name: 'Namkeens', image: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 4, category_id: 1, name: 'Handmade Chocolates', image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=500&q=80', is_available: 1 },

    { id: 5, category_id: 2, name: 'Chai Masala', image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 6, category_id: 2, name: 'Chaat Masala', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 7, category_id: 2, name: 'Garam Masala', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 8, category_id: 2, name: 'Sabzi & Curry Masale', image: 'https://images.unsplash.com/photo-1505253758473-96b3015f27eb?auto=format&fit=crop&w=500&q=80', is_available: 1 },

    { id: 9, category_id: 3, name: 'Men', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 10, category_id: 3, name: 'Women', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 11, category_id: 3, name: 'Boys', image: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 12, category_id: 3, name: 'Girls', image: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=500&q=80', is_available: 1 },

    { id: 13, category_id: 4, name: 'Cables & Chargers', image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 14, category_id: 4, name: 'Switches & Sockets', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 15, category_id: 4, name: 'LED Lights & Bulbs', image: 'https://images.unsplash.com/photo-1550524514-c923380b2a3a?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 16, category_id: 4, name: 'Tools & Components', image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80', is_available: 1 },

    { id: 17, category_id: 5, name: 'Daily Fresh Vegetables', image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 18, category_id: 5, name: 'Leafy Greens', image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=500&q=80', is_available: 1 },
    { id: 19, category_id: 5, name: 'Seasonal & Salad Veggies', image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=500&q=80', is_available: 1 }
  ],
  products: [
    {
      id: 1,
      subcategory_id: 1,
      name: 'Handcrafted Mixed Fruit Jam (Real Fruit Chunks)',
      description: 'Rich artisanal spread made from farm fresh strawberries, apples, and mangoes with zero artificial colours.',
      details: '100% natural fruit pulp cooked in small batches. Perfect spread for toasts, rotis, and pancakes.\n• Real Fruit Pulp 65%\n• No High-Fructose Corn Syrup\n• Owner Verified: Dr Mukul Kumar',
      image: 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?auto=format&fit=crop&w=600&q=80',
      mrp: 160,
      price: 125,
      unit: '500 g glass jar',
      stock: 80,
      is_available: 1
    },
    {
      id: 2,
      subcategory_id: 1,
      name: 'Organic Wild Strawberry Jam',
      description: 'Luscious mountain strawberry jam sweetened with natural cane sugar.',
      details: 'Prepared from ripe Himalayan strawberries. Smooth texture with whole berry pieces.\n• Zero gelatin, 100% vegetarian',
      image: 'https://images.unsplash.com/photo-1590487988256-9ed24133863e?auto=format&fit=crop&w=600&q=80',
      mrp: 190,
      price: 145,
      unit: '350 g glass jar',
      stock: 65,
      is_available: 1
    },
    {
      id: 3,
      subcategory_id: 2,
      name: 'Bakery Special Butter Kaju Biscuits',
      description: 'Melt-in-mouth bakery cookies enriched with roasted cashews and pure creamery butter.',
      details: 'Freshly baked daily. Traditional recipe with crisp crunch and golden baked crust.',
      image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80',
      mrp: 140,
      price: 110,
      unit: '400 g box',
      stock: 90,
      is_available: 1
    },
    {
      id: 4,
      subcategory_id: 2,
      name: 'Handmade Roasted Almond Cookies',
      description: 'Crunchy whole wheat cookies loaded with California roasted almonds and green cardamom.',
      details: 'No palm oil, no artificial essences. wholesome and nutritious tea-time biscuit.',
      image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80',
      mrp: 175,
      price: 135,
      unit: '300 g sealed pack',
      stock: 70,
      is_available: 1
    },
    {
      id: 5,
      subcategory_id: 3,
      name: 'Royal Bikaneri Bhujia Namkeen',
      description: 'Crispy traditional moth bean flour bhujia seasoned with black pepper and clove.',
      details: 'Authentic taste from Bikaner. Fried in high-grade groundnut oil for signature crunch.',
      image: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=600&q=80',
      mrp: 120,
      price: 95,
      unit: '400 g pouch',
      stock: 110,
      is_available: 1
    },
    {
      id: 6,
      subcategory_id: 3,
      name: 'Crispy Ratlami Spicy Sev',
      description: 'Famous Malwa sev infused with laung (clove), hing, and spicy peppery punch.',
      details: 'Perfect companion for poha, chaats, and evening tea. 100% fresh batch.',
      image: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=600&q=80',
      mrp: 115,
      price: 90,
      unit: '400 g pouch',
      stock: 95,
      is_available: 1
    },
    {
      id: 7,
      subcategory_id: 4,
      name: 'Artisanal Dark Chocolate Bar (Handmade 70% Cocoa)',
      description: 'Full handmade single-origin cocoa bean chocolate with velvety smooth melt.',
      details: 'Handcrafted by local chocolatiers. Rich in natural cocoa flavanols with subtle fruit undertones.\n• 100% Handmade\n• No chemical preservatives\n• Curated by Dr Mukul Kumar',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80',
      mrp: 220,
      price: 160,
      unit: '150 g bar',
      stock: 85,
      is_available: 1
    },
    {
      id: 8,
      subcategory_id: 4,
      name: 'Handmade Roasted Almond Chocolate Truffles Box',
      description: 'Delightful assortment of handmade chocolate truffles topped with crunchy roasted dry fruits.',
      details: 'Hand-rolled and dipped in premium milk and dark chocolate. Ideal for gifts and celebrations.',
      image: 'https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=600&q=80',
      mrp: 280,
      price: 210,
      unit: '200 g luxury box',
      stock: 60,
      is_available: 1
    },
    {
      id: 9,
      subcategory_id: 5,
      name: 'Royal Shahi Chai Masala (Aromatic Herbal Blend)',
      description: 'Stone-ground blend of green cardamom, ginger, cinnamon, clove, and nutmeg for royal tea.',
      details: 'Elevate your daily morning tea with rich authentic Indian spices.\n• Just 1/4 tsp per cup\n• Boosts immunity and digestion\n• Checked by Dr Mukul Kumar (8988227729)',
      image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80',
      mrp: 160,
      price: 120,
      unit: '100 g sealed jar',
      stock: 100,
      is_available: 1
    },
    {
      id: 10,
      subcategory_id: 6,
      name: 'Zesty Chatpata Chaat Masala Sprinkler',
      description: 'Tangy, spicy, and savory blend with black salt, amchur, cumin, and mint.',
      details: 'Instantly livens up fruit salads, sandwiches, pakodas, and raitas. Easy sprinkler container.',
      image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
      mrp: 85,
      price: 65,
      unit: '100 g sprinkler bottle',
      stock: 140,
      is_available: 1
    },
    {
      id: 11,
      subcategory_id: 7,
      name: 'Authentic Shahi Garam Masala (Slow Roasted)',
      description: 'Traditional blend of 16 whole spices roasted on iron kadhai and coarsely ground.',
      details: 'Rich fragrance and deep warming flavor without excessive chilli powder.\n• Pure whole spices: Badi Elaichi, Cinnamon, Star Anise, Mace, Clove, Black Pepper.',
      image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80',
      mrp: 145,
      price: 110,
      unit: '100 g aroma-lock pouch',
      stock: 120,
      is_available: 1
    },
    {
      id: 12,
      subcategory_id: 8,
      name: 'Kitchen King Universal Curry Masala',
      description: 'All-purpose fragrant spice blend for paneer, dal tadka, mixed vegetables, and gravies.',
      details: 'Adds hotel-style rich aroma and balanced taste to any everyday home cooked curry.',
      image: 'https://images.unsplash.com/photo-1505253758473-96b3015f27eb?auto=format&fit=crop&w=600&q=80',
      mrp: 95,
      price: 75,
      unit: '100 g pack',
      stock: 115,
      is_available: 1
    },
    {
      id: 13,
      subcategory_id: 9,
      name: 'Men\'s Pure Cotton Casual Linen Shirt',
      description: 'Breathable cotton linen shirt with mandarin collar and comfortable tailored fit.',
      details: 'High quality fabric, pre-shrunk, skin friendly. Suitable for casual and festive occasions.',
      image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=80',
      mrp: 899,
      price: 499,
      unit: 'Sizes: M, L, XL, XXL',
      stock: 45,
      is_available: 1
    },
    {
      id: 14,
      subcategory_id: 10,
      name: 'Women\'s Embroidered Cotton Kurti & Pant Set',
      description: 'Elegant cotton kurti with delicate Lucknowi thread embroidery and matching trousers.',
      details: 'Soft 100% cambric cotton, fade-resistant dyes, extremely comfortable for all day wear.',
      image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80',
      mrp: 1199,
      price: 599,
      unit: 'Sizes: S, M, L, XL',
      stock: 40,
      is_available: 1
    },
    {
      id: 15,
      subcategory_id: 11,
      name: 'Kids Boys Cotton Graphic T-Shirt & Shorts Set',
      description: 'Playful, super-soft 100% bio-washed cotton t-shirt with elasticated drawstring shorts.',
      details: 'Durable stitching for active play, non-toxic baby-safe colours.',
      image: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?auto=format&fit=crop&w=600&q=80',
      mrp: 599,
      price: 349,
      unit: 'Age: 4-12 Years',
      stock: 50,
      is_available: 1
    },
    {
      id: 16,
      subcategory_id: 12,
      name: 'Kids Girls Floral Party Wear Cotton Frock',
      description: 'Charming flared floral frock with soft cotton inner lining and matching hair ribbon.',
      details: 'Lightweight, breathable, perfect for parties and birthdays.',
      image: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=600&q=80',
      mrp: 699,
      price: 399,
      unit: 'Age: 3-10 Years',
      stock: 45,
      is_available: 1
    },
    {
      id: 17,
      subcategory_id: 13,
      name: 'Fast Charging 65W Braided Type-C to Type-C Cable',
      description: 'Heavy-duty nylon braided fast data and charging cable for phones, tablets and laptops.',
      details: 'Supports 65W PD fast charging, 480 Mbps data transfer, reinforced metal alloy connectors.',
      image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
      mrp: 399,
      price: 189,
      unit: '1.5 Meter Cable',
      stock: 90,
      is_available: 1
    },
    {
      id: 18,
      subcategory_id: 14,
      name: '4-Way Modular Extension Board with Surge Protector',
      description: 'Safety surge protected 4-socket multi-plug board with individual master switch and LED indicator.',
      details: 'Heavy duty fire-retardant grade PVC body with 2-metre copper cable.',
      image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80',
      mrp: 499,
      price: 299,
      unit: '1 Unit (2m Wire)',
      stock: 55,
      is_available: 1
    },
    {
      id: 19,
      subcategory_id: 15,
      name: 'Philips 12W Cool Daylight B22 LED Bulb (Pack of 2)',
      description: 'Bright energy saving 12W LED bulb with 1200 Lumens output and eye-comfort technology.',
      details: 'Saves up to 85% electricity compared to traditional bulbs. 25,000 hours lifespan.',
      image: 'https://images.unsplash.com/photo-1550524514-c923380b2a3a?auto=format&fit=crop&w=600&q=80',
      mrp: 340,
      price: 199,
      unit: 'Pack of 2 Bulbs',
      stock: 80,
      is_available: 1
    },
    {
      id: 20,
      subcategory_id: 16,
      name: 'Digital Multimeter with Testing Probes',
      description: 'Accurate pocket digital multimeter for measuring AC/DC voltage, DC current, and resistance.',
      details: 'Essential tool for electricians, electronics repair, and home DIY. Includes 9V battery and leads.',
      image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
      mrp: 550,
      price: 299,
      unit: '1 Kit with Probes',
      stock: 40,
      is_available: 1
    },
    {
      id: 21,
      subcategory_id: 17,
      name: 'Farm Fresh Desi Potatoes (Aloo 1 kg)',
      description: 'Naturally grown firm new-crop potatoes, cleaned and sorted for everyday cooking.',
      details: 'Directly procured from local agricultural farms. Zero chemicals or artificial polish.',
      image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80',
      mrp: 38,
      price: 30,
      unit: '1 kg net',
      stock: 150,
      is_available: 1
    },
    {
      id: 22,
      subcategory_id: 17,
      name: 'Fresh Red Onions (Pyaaz 1 kg)',
      description: 'Crisp and pungent fresh red onions, sun-dried skin for longer storage life.',
      details: 'Grade-A medium to large onions. Essential staple for Indian curries, salads, and gravies.',
      image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80',
      mrp: 45,
      price: 35,
      unit: '1 kg net',
      stock: 140,
      is_available: 1
    },
    {
      id: 23,
      subcategory_id: 18,
      name: 'Fresh Tender Palak (Spinach Bunch 250g)',
      description: 'Hand-picked green baby spinach leaves rich in natural iron, calcium, and vitamins.',
      details: 'Harvested fresh every morning. Crisp tender stems and vibrant green leaves.',
      image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80',
      mrp: 28,
      price: 20,
      unit: '250 g bunch',
      stock: 70,
      is_available: 1
    },
    {
      id: 24,
      subcategory_id: 19,
      name: 'Fresh Green Bell Peppers (Shimla Mirch 500g)',
      description: 'Crisp and juicy thick-walled green capsicum, farm harvested and graded.',
      details: 'Great for stir-fries, curries, pizzas, and salads. High in Vitamin C.',
      image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=600&q=80',
      mrp: 55,
      price: 40,
      unit: '500 g net',
      stock: 65,
      is_available: 1
    }
  ],

  offers: [
    { id: 1, code: 'WELCOME10', description: '10% OFF on all orders above ₹300', discount_percent: 10, min_order: 300, active: 1 },
    { id: 2, code: 'DRMUKUL20', description: 'Special 20% OFF Doctor Curated Wellness (Orders ₹999+)', discount_percent: 20, min_order: 999, active: 1 },
    { id: 3, code: 'FREESHIP', description: 'Free shipping coupon across all orders', discount_percent: 5, min_order: 250, active: 1 }
  ],
  admins: [
    {
      id: 1,
      username: process.env.ADMIN_USER || 'admin',
      password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
      name: 'Dr Mukul Kumar',
      phone: '8988227729'
    },
    {
      id: 2,
      username: 'drmukul',
      password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
      name: 'Dr Mukul Kumar',
      phone: '8988227729'
    }
  ],
  orders: [],
  order_items: []
};

class LocalDatabase {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[DB] Failed reading local store, resetting to initial data:', e.message);
    }
    this.save(INITIAL_DATA);
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  reload() {
    this.data = this.load();
    return this.data;
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Failed saving local store:', e.message);
    }
  }

  async getSettings() {
    const o = {};
    for (const item of (this.data.settings || [])) o[item.k] = item.v;
    return o;
  }

  async setSetting(k, v) {
    if (!this.data.settings) this.data.settings = [];
    const idx = this.data.settings.findIndex(s => s.k === k);
    if (idx >= 0) this.data.settings[idx].v = String(v);
    else this.data.settings.push({ k, v: String(v) });
    this.save();
    return true;
  }

  async getAdminByUsername(username) {
    const q = String(username).toLowerCase().trim();
    if (!this.data.admins || !this.data.admins.length) {
      this.data.admins = JSON.parse(JSON.stringify(INITIAL_DATA.admins));
    }
    return this.data.admins.find(a =>
      a.username.toLowerCase() === q ||
      (a.phone && a.phone.trim() === q)
    );
  }

  async getCategories() {
    return this.data.categories
      .filter(c => c.is_available)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  async getSubcategories() {
    return this.data.subcategories.filter(s => s.is_available);
  }

  async getCatalog() {
    const cats = await this.getCategories();
    const subs = await this.getSubcategories();
    return cats.map(c => ({
      ...c,
      subs: subs.filter(s => s.category_id === c.id)
    }));
  }

  async getProducts({ cat, sub, q } = {}) {
    let list = this.data.products.filter(p => p.is_available);
    if (sub) {
      list = list.filter(p => p.subcategory_id === Number(sub));
    } else if (cat) {
      const allowedSubs = this.data.subcategories
        .filter(s => s.category_id === Number(cat))
        .map(s => s.id);
      list = list.filter(p => allowedSubs.includes(p.subcategory_id));
    }
    if (q) {
      const term = String(q).toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
      );
    }
    return list.map(p => ({
      ...p,
      available: p.is_available && p.stock > 0,
      mrp: Number(p.mrp),
      price: Number(p.price)
    }));
  }

  async getProductById(id) {
    return this.data.products.find(p => p.id === Number(id));
  }

  async getCoupon(code) {
    return this.data.offers.find(o => o.code.toUpperCase() === String(code).toUpperCase() && o.active);
  }

  async getDeliveryZone(key) {
    return this.data.delivery_zones.find(z => z.zone_key === key);
  }

  async getDeliveryZones() {
    return this.data.delivery_zones;
  }

  async updateDeliveryZone(key, data) {
    const z = this.data.delivery_zones.find(x => x.zone_key === key);
    if (z) {
      Object.assign(z, data);
      this.save();
    }
    return true;
  }

  async getActiveTheme() {
    const s = await this.getSettings();
    if (s.theme_mode && s.theme_mode !== 'auto') {
      const t = this.data.themes.find(x => x.theme_key === s.theme_mode);
      return t || { theme_key: 'default', name: s.shop_name || 'Aashvi Hub' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const active = this.data.themes.find(t => t.start_date && t.end_date && t.start_date <= today && t.end_date >= today);
    if (active) return active;
    const def = this.data.themes.find(t => t.theme_key === 'default');
    return def || { theme_key: 'default', name: s.shop_name || 'Aashvi Hub' };
  }

  async createOrder({ customer, items, subtotal, discount, delivery_fee, total, coupon, method, etaText, razorpayOrderId, deliveryPin }) {
    const nextId = (this.data.orders.reduce((max, o) => Math.max(max, o.id || 0), 0)) + 1;
    const pin = deliveryPin || String(Math.floor(1000 + Math.random() * 9000));
    const payMethod = String(method || 'COD').toUpperCase();
    const payStatus = payMethod === 'ONLINE' ? 'Paid' : 'Pending';

    const order = {
      id: nextId,
      customer_name: customer.name,
      phone: customer.phone,
      address: customer.address,
      pincode: customer.pincode,
      subtotal,
      discount,
      delivery_fee,
      total,
      coupon,
      payment_method: payMethod,
      payment_status: payStatus,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: null,
      status: 'Placed',
      order_status: 'Placed',
      delivery_pin: pin,
      eta_text: etaText || '2-4 business days',
      created_at: new Date().toISOString()
    };

    // Deduct stock and record items
    for (const it of items) {
      const p = this.data.products.find(x => x.id === it.id);
      if (p) {
        p.stock = Math.max(0, p.stock - it.qty);
        this.data.order_items.push({
          id: (this.data.order_items.reduce((max, i) => Math.max(max, i.id || 0), 0)) + 1,
          order_id: nextId,
          product_id: p.id,
          name: p.name,
          price: p.price,
          qty: it.qty
        });
      }
    }

    this.data.orders.unshift(order);
    this.save();
    return order;
  }

  async verifyDeliveryPin(id, pin) {
    const o = this.data.orders.find(x => x.id === Number(id));
    if (!o) return { success: false, error: 'Order not found' };
    const entered = String(pin || '').trim();
    if (!entered || String(o.delivery_pin).trim() !== entered) {
      return { success: false, error: 'Incorrect 4-digit Delivery PIN' };
    }
    o.status = 'Delivered';
    o.order_status = 'Delivered';
    o.payment_status = 'Paid';
    this.save();
    return { success: true, order: o };
  }

  async getOrder(id) {
    const o = this.data.orders.find(x => x.id === Number(id));
    if (!o) return null;
    const items = this.data.order_items.filter(i => i.order_id === o.id);
    return { ...o, itemsList: items };
  }

  async findOrdersByQuery(query) {
    const q = String(query).trim().toLowerCase();
    return this.data.orders.filter(o =>
      String(o.id) === q ||
      o.phone.includes(q) ||
      o.customer_name.toLowerCase().includes(q)
    );
  }

  async updateOrderPayment(id, { payment_id, status = 'paid' }) {
    const o = this.data.orders.find(x => x.id === Number(id));
    if (o) {
      o.payment_status = status;
      if (status === 'paid') {
        o.status = 'confirmed';
        o.razorpay_payment_id = payment_id;
      }
      this.save();
      return true;
    }
    return false;
  }

  async updateOrderStatus(id, status, paymentStatus) {
    const o = this.data.orders.find(x => x.id === Number(id));
    if (o) {
      o.status = status;
      o.order_status = status;
      if (paymentStatus) o.payment_status = paymentStatus;
      this.save();
      return true;
    }
    return false;
  }

  async getOffers() {
    return this.data.offers || [];
  }

  async createOffer(offer) {
    if (!this.data.offers) this.data.offers = [];
    const nextId = (this.data.offers.reduce((max, o) => Math.max(max, o.id || 0), 0)) + 1;
    const newOffer = {
      id: nextId,
      code: String(offer.code || '').toUpperCase().trim(),
      description: String(offer.description || '').trim(),
      discount_percent: Number(offer.discount_percent || 0),
      min_order: Number(offer.min_order || 0),
      active: offer.active !== undefined ? (offer.active ? 1 : 0) : 1
    };
    this.data.offers.push(newOffer);
    this.save();
    return newOffer;
  }

  async deleteOffer(id) {
    if (!this.data.offers) return false;
    this.data.offers = this.data.offers.filter(o => o.id !== Number(id));
    this.save();
    return true;
  }

  async getThemes() {
    return this.data.themes || [];
  }

  // Admin generic CRUD helpers
  async getTable(table) {
    if (table === 'orders') {
      return this.data.orders.map(o => {
        const items = this.data.order_items
          .filter(i => i.order_id === o.id)
          .map(i => `${i.name} x${i.qty}`)
          .join(', ');
        return { ...o, items };
      });
    }
    return this.data[table] || [];
  }

  async insertTable(table, row) {
    if (!this.data[table]) this.data[table] = [];
    const nextId = (this.data[table].reduce((max, r) => Math.max(max, Number(r.id) || 0), 0)) + 1;
    const newRecord = { id: nextId, ...row };
    this.data[table].push(newRecord);
    this.save();
    return nextId;
  }

  async updateTable(table, id, fields) {
    if (!this.data[table]) return false;
    const row = this.data[table].find(r => String(r.id ?? r.k ?? r.zone_key) === String(id));
    if (row) {
      Object.assign(row, fields);
      this.save();
      return true;
    }
    return false;
  }

  async deleteTable(table, id) {
    if (!this.data[table]) return false;
    this.data[table] = this.data[table].filter(r => String(r.id ?? r.k ?? r.zone_key) !== String(id));
    this.save();
    return true;
  }
}

// Singleton database instance
const localDb = new LocalDatabase();

let mysqlPool = null;
let useMysql = false;

async function checkMysqlConnection() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'aashvi_hub';

  try {
    const testPool = mysql.createPool({
      host,
      user,
      password,
      database,
      connectTimeout: 2000,
      waitForConnections: true,
      connectionLimit: 5,
      dateStrings: true,
      charset: 'utf8mb4'
    });
    const [res] = await testPool.query('SELECT 1 as test');
    if (res && res[0] && res[0].test === 1) {
      mysqlPool = testPool;
      useMysql = true;
      console.log('✓ Successfully connected to MySQL database:', database);
      return true;
    }
  } catch (err) {
    console.log(`ℹ MySQL not reachable (${err.message}). Using resilient embedded JSON database.`);
    useMysql = false;
  }
  return false;
}

module.exports = {
  localDb,
  checkMysqlConnection,
  get useMysql() { return useMysql; },
  get mysqlPool() { return mysqlPool; },
  getUseMysql: () => useMysql,
  getMysqlPool: () => mysqlPool
};

