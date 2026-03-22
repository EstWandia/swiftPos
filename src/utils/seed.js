/**
 * SwiftPOS — Seed Script
 * Creates super admin + 3 demo businesses with full data each.
 * Run AFTER migrate.js: npm run seed
 */
require('dotenv').config();
const { query, run, queryOne } = require('../config/database');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('\n🌱  Seeding SwiftPOS (multi-tenant)...\n');

  // ── 1. SUPER ADMIN ─────────────────────────────────────────────────────
  const saEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@swiftpos.com';
  const saPw    = bcrypt.hashSync(process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!', 10);
  await run(`INSERT INTO users (business_id, name, email, password, role) VALUES (NULL, 'Super Admin', ?, ?, 'superadmin')
             ON DUPLICATE KEY UPDATE name='Super Admin'`, [saEmail, saPw]);
  console.log('✅ Super admin:', saEmail);

  // ── 2. DEMO BUSINESSES ─────────────────────────────────────────────────
  const businesses = [
    { name:'Nadia\'s Bistro',  slug:'nadias-bistro',  type:'restaurant', currency:'EUR', sym:'€',  tax:10, address:'12 High Street, Dublin' },
    { name:'City Pharmacy',    slug:'city-pharmacy',  type:'pharmacy',   currency:'GBP', sym:'£',  tax:20, address:'5 King Road, London'     },
    { name:'Corner Retail',    slug:'corner-retail',  type:'retail',     currency:'USD', sym:'$',  tax:8,  address:'99 Main Ave, New York'   },
  ];

  for (const biz of businesses) {
    const existing = await queryOne('SELECT id FROM businesses WHERE slug=?', [biz.slug]);
    if (!existing) {
      await run(`INSERT INTO businesses (name,slug,type,currency,currency_sym,tax_rate,address,receipt_footer)
                 VALUES (?,?,?,?,?,?,?,?)`,
        [biz.name, biz.slug, biz.type, biz.currency, biz.sym, biz.tax, biz.address, `Thank you for visiting ${biz.name}!`]);
    }
    const b = await queryOne('SELECT id FROM businesses WHERE slug=?', [biz.slug]);
    biz.id = b.id;
    console.log(`✅ Business: ${biz.name} (id=${biz.id})`);

    // ── Users per business ────────────────────────────────────────────────
    const pw = bcrypt.hashSync('demo123', 10);
    const slug = biz.slug.replace(/-/g, '');
    const bizUsers = [
      [`Admin ${biz.name}`,   `admin@${slug}.com`,   'admin'],
      [`Manager ${biz.name}`, `manager@${slug}.com`, 'manager'],
      [`Cashier ${biz.name}`, `cashier@${slug}.com`, 'cashier'],
    ];
    for (const [name, email, role] of bizUsers) {
      await run(`INSERT INTO users (business_id,name,email,password,role) VALUES (?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name)`, [biz.id, name, email, pw, role]);
    }
    console.log(`   👥 Users seeded for ${biz.name} (password: demo123)`);

    // ── Categories based on business type ─────────────────────────────────
    let cats;
    if (biz.type === 'restaurant') {
      cats = [
        { name:'Food',     slug:'food',     emoji:'🍔', subs:['Burgers','Pizza','Pasta','Salads','Wraps','Soups','Rice Dishes','Sandwiches'] },
        { name:'Drinks',   slug:'drinks',   emoji:'🥤', subs:['Soft Drinks','Juices','Water','Energy Drinks','Smoothies','Mocktails'] },
        { name:'Coffee',   slug:'coffee',   emoji:'☕', subs:['Espresso','Latte','Cappuccino','Cold Brew','Specialty'] },
        { name:'Alcohol',  slug:'alcohol',  emoji:'🍺', subs:['Beers','Wines','Cocktails','Spirits','Shots'] },
        { name:'Desserts', slug:'desserts', emoji:'🍰', subs:['Cakes','Ice Cream','Pastries','Cookies'] },
        { name:'Snacks',   slug:'snacks',   emoji:'🍿', subs:['Fries','Wings','Nachos','Dips'] },
      ];
    } else if (biz.type === 'pharmacy') {
      cats = [
        { name:'Medications',   slug:'medications',   emoji:'💊', subs:['Pain Relief','Cold & Flu','Antibiotics','Vitamins','Supplements'] },
        { name:'Personal Care', slug:'personal-care', emoji:'🧴', subs:['Skin Care','Hair Care','Oral Care','Body Care'] },
        { name:'First Aid',     slug:'first-aid',     emoji:'🩹', subs:['Bandages','Antiseptics','Equipment'] },
        { name:'Baby & Child',  slug:'baby',          emoji:'🍼', subs:['Diapers','Baby Food','Baby Care'] },
        { name:'Health Foods',  slug:'health-foods',  emoji:'🥗', subs:['Protein','Superfoods','Organic'] },
      ];
    } else {
      cats = [
        { name:'Grocery',     slug:'grocery',     emoji:'🛒', subs:['Dairy','Bakery','Produce','Pantry','Frozen','Snacks'] },
        { name:'Beverages',   slug:'beverages',   emoji:'🥤', subs:['Soft Drinks','Water','Juices','Energy','Alcohol'] },
        { name:'Household',   slug:'household',   emoji:'🏠', subs:['Cleaning','Laundry','Kitchen','Bathroom'] },
        { name:'Personal',    slug:'personal',    emoji:'🧴', subs:['Hygiene','Beauty','Health'] },
        { name:'Electronics', slug:'electronics', emoji:'📱', subs:['Accessories','Batteries','Cables'] },
        { name:'Tobacco',     slug:'tobacco',     emoji:'🚬', subs:['Cigarettes','Cigars','Vape','Pouches'] },
      ];
    }

    const catMap = {}, subMap = {};
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      await run(`INSERT INTO categories (business_id,name,slug,emoji,sort_order) VALUES (?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name)`, [biz.id, c.name, c.slug, c.emoji, i]);
      const row = await queryOne('SELECT id FROM categories WHERE business_id=? AND slug=?', [biz.id, c.slug]);
      catMap[c.slug] = row.id;
      for (const s of c.subs) {
        const ss = s.toLowerCase().replace(/\s+/g, '-');
        await run(`INSERT INTO subcategories (business_id,category_id,name,slug) VALUES (?,?,?,?)
                   ON DUPLICATE KEY UPDATE name=VALUES(name)`, [biz.id, row.id, s, ss]);
        const sr = await queryOne('SELECT id FROM subcategories WHERE business_id=? AND category_id=? AND slug=?', [biz.id, row.id, ss]);
        if (sr) subMap[`${c.slug}:${s}`] = sr.id;
      }
    }
    console.log(`   📂 ${cats.length} categories seeded`);

    // ── Items per business ────────────────────────────────────────────────
    const sub = (cat, s) => subMap[`${cat}:${s}`] || null;
    let items = [];

    if (biz.type === 'restaurant') {
      items = [
        // FOOD
        ['food','Burgers',    'Classic Burger',        'Beef & cheddar',           'BRG001',8.90,  '🍔',95,'hot', 999,0],
        ['food','Burgers',    'Double Smash',           'Double patty stack',       'BRG002',11.50, '🍔',88,'hot', 999,0],
        ['food','Burgers',    'BBQ Burger',             'Smoky BBQ sauce',          'BRG003',10.20, '🍔',75,null,  999,0],
        ['food','Burgers',    'Chicken Burger',         'Crispy golden',            'BRG004',8.50,  '🐔',70,null,  999,0],
        ['food','Burgers',    'Veggie Burger',          'Plant-based patty',        'BRG005',9.00,  '🥦',55,'new', 999,0],
        ['food','Pizza',      'Margherita',             'Tomato & mozzarella',      'PIZ001',11.00, '🍕',90,null,  999,0],
        ['food','Pizza',      'Pepperoni',              'Classic pepperoni',        'PIZ002',12.50, '🍕',93,'hot', 999,0],
        ['food','Pizza',      'BBQ Chicken',            'BBQ sauce & chicken',      'PIZ003',13.00, '🍕',80,null,  999,0],
        ['food','Pizza',      'Veggie Supreme',         '5 vegetables',             'PIZ004',11.50, '🍕',62,'new', 999,0],
        ['food','Pasta',      'Spaghetti Carbonara',    'Pancetta & egg',           'PAS001',10.50, '🍝',82,null,  999,0],
        ['food','Pasta',      'Penne Arrabiata',        'Spicy tomato',             'PAS002',9.00,  '🍝',70,null,  999,0],
        ['food','Pasta',      'Lasagne',                'Beef & béchamel',          'PAS003',11.00, '🍝',75,null,  999,0],
        ['food','Salads',     'Caesar Salad',           'Romaine & croutons',       'SAL001',7.90,  '🥗',64,null,  999,0],
        ['food','Salads',     'Greek Salad',            'Feta & olives',            'SAL002',7.50,  '🥗',55,null,  999,0],
        ['food','Wraps',      'Chicken Wrap',           'Grilled chicken',          'WRP001',8.50,  '🌯',78,null,  999,0],
        ['food','Wraps',      'Falafel Wrap',           'Tahini & veg',             'WRP002',7.90,  '🌯',55,'new', 999,0],
        ['food','Soups',      'Tom Yum Soup',           'Thai spicy prawn',         'SOP001',8.00,  '🍲',58,null,  999,0],
        ['food','Rice Dishes','Chicken Fried Rice',     'Wok style',                'RIC001',9.50,  '🍚',74,null,  999,0],
        // DRINKS
        ['drinks','Soft Drinks','Coca-Cola 500ml',      'Ice cold',                 'SDR001',2.50,  '🥤',95,null,  100,1],
        ['drinks','Soft Drinks','Diet Coke 500ml',      'Zero sugar',               'SDR002',2.50,  '🥤',75,null,  80, 1],
        ['drinks','Soft Drinks','Sprite 500ml',         'Lemon-lime',               'SDR003',2.50,  '🥤',72,null,  80, 1],
        ['drinks','Energy Drinks','Red Bull 250ml',     'Energy boost',             'ENR001',3.50,  '🐂',88,'hot', 60, 1],
        ['drinks','Juices',     'Orange Juice',         'Fresh squeezed',           'JUI001',3.80,  '🍊',70,'new', 40, 1],
        ['drinks','Water',      'Still Water 500ml',    'Mountain spring',          'WAT001',1.50,  '💧',55,null,  100,1],
        ['drinks','Smoothies',  'Strawberry Smoothie',  'Fresh berries',            'SMO001',5.50,  '🍓',74,'new', 20, 1],
        ['drinks','Mocktails',  'Virgin Mojito',        'Mint & lime',              'MOC001',4.50,  '🌿',65,null,  999,0],
        // COFFEE
        ['coffee','Espresso',   'Espresso',             'Single shot',              'ESP001',2.50,  '☕',85,null,  999,0],
        ['coffee','Espresso',   'Americano',            'Espresso & water',         'ESP002',3.00,  '☕',78,null,  999,0],
        ['coffee','Cappuccino', 'Cappuccino',           'Micro-foam milk',          'CAP001',4.00,  '🫖',90,'hot', 999,0],
        ['coffee','Latte',      'Latte',                'Double shot & milk',       'LAT001',4.50,  '🥛',88,null,  999,0],
        ['coffee','Latte',      'Oat Latte',            'Oat milk',                 'LAT002',5.00,  '🌾',72,'new', 999,0],
        ['coffee','Cold Brew',  'Cold Brew',            '12-hour steep',            'CBD001',5.50,  '🧊',76,null,  999,0],
        ['coffee','Specialty',  'Matcha Latte',         'Ceremonial grade',         'SPC001',5.80,  '🍵',62,'new', 999,0],
        // ALCOHOL
        ['alcohol','Beers',    'Heineken 500ml',        'Lager',                    'BER001',5.00,  '🍺',90,'hot', 80, 1],
        ['alcohol','Beers',    'Guinness 440ml',        'Irish stout',              'BER002',5.50,  '🍺',80,null,  60, 1],
        ['alcohol','Beers',    'Corona 355ml',          'With lime',                'BER003',5.20,  '🍺',82,null,  70, 1],
        ['alcohol','Wines',    'House Red Wine',        'Merlot glass',             'WIN001',6.50,  '🍷',78,null,  50, 1],
        ['alcohol','Wines',    'House White Wine',      'Sauvignon Blanc',          'WIN002',6.50,  '🥂',72,null,  50, 1],
        ['alcohol','Cocktails','Mojito',                'Rum mint lime',            'COC001',8.50,  '🍹',88,'hot', 999,0],
        ['alcohol','Cocktails','Aperol Spritz',         'Aperol prosecco',          'COC002',9.00,  '🍊',85,'new', 999,0],
        ['alcohol','Shots',    'Vodka Shot',            'Premium vodka',            'SHT001',4.00,  '🥃',72,null,  999,0],
        // DESSERTS
        ['desserts','Cakes',    'NY Cheesecake',        'Classic baked',            'DSS001',5.50,  '🍰',88,null,  20, 1],
        ['desserts','Cakes',    'Chocolate Brownie',    'Warm fudge',               'DSS002',4.00,  '🍫',85,'hot', 25, 1],
        ['desserts','Cakes',    'Tiramisu',             'Espresso mascarpone',      'DSS003',6.00,  '🍮',80,null,  15, 1],
        ['desserts','Ice Cream','Vanilla Ice Cream',    '2 scoops',                 'ICE001',3.50,  '🍨',72,null,  999,0],
        ['desserts','Pastries', 'Croissant',            'All-butter',               'PST001',3.00,  '🥐',78,null,  30, 1],
        ['desserts','Cookies',  'Choc Chip Cookie',     'Warm & gooey',             'COO001',2.50,  '🍪',80,'hot', 40, 1],
        // SNACKS
        ['snacks','Fries',      'French Fries',         'Crispy golden',            'FRY001',3.50,  '🍟',95,'hot', 999,0],
        ['snacks','Fries',      'Sweet Potato Fries',   'Sea salt',                 'FRY002',4.20,  '🍠',72,'new', 999,0],
        ['snacks','Wings',      'Chicken Wings x6',     'Buffalo or BBQ',           'WNG001',7.50,  '🍗',88,'hot', 999,0],
        ['snacks','Nachos',     'Nachos',               'Cheese & salsa',           'SNK001',5.50,  '🧀',82,null,  999,0],
        ['snacks','Dips',       'Hummus & Pita',        'House hummus',             'DIP001',5.50,  '🫓',60,'new', 30, 1],
      ];
    } else if (biz.type === 'pharmacy') {
      items = [
        ['medications','Pain Relief',  'Paracetamol 500mg',  '24 tablets',              'MED001',3.50, '💊',90,null, 100,1],
        ['medications','Pain Relief',  'Ibuprofen 400mg',    '16 tablets',              'MED002',4.20, '💊',85,null,  80,1],
        ['medications','Pain Relief',  'Aspirin 300mg',      '32 tablets',              'MED003',3.80, '💊',75,null,  70,1],
        ['medications','Cold & Flu',   'Lemsip Max',         'Lemon sachets x10',       'MED004',6.50, '🍋',82,null,  60,1],
        ['medications','Cold & Flu',   'Benylin Cough',      '150ml syrup',             'MED005',7.20, '🍯',70,null,  50,1],
        ['medications','Vitamins',     'Vitamin C 1000mg',   '30 effervescent',         'VIT001',6.50, '🍋',72,null,  80,1],
        ['medications','Vitamins',     'Vitamin D 1000IU',   '60 capsules',             'VIT002',7.80, '☀️',68,'new',60,1],
        ['medications','Vitamins',     'Omega-3 1000mg',     '60 capsules',             'VIT003',9.50, '🐟',60,null,  50,1],
        ['medications','Supplements',  'Zinc 25mg',          '90 tablets',              'SUP001',8.00, '💪',55,null,  40,1],
        ['medications','Supplements',  'Magnesium 375mg',    '60 tablets',              'SUP002',9.50, '💊',50,'new', 40,1],
        ['personal-care','Skin Care',  'Moisturiser SPF30',  '50ml',                    'SKN001',12.99,'🧴',68,'new', 40,1],
        ['personal-care','Skin Care',  'Lip Balm SPF15',     'Cherry flavour',          'SKN002',3.99, '💋',72,null,  60,1],
        ['personal-care','Oral Care',  'Toothpaste 75ml',    'Whitening formula',       'ORL001',4.50, '🦷',80,null,  80,1],
        ['personal-care','Hair Care',  'Anti-Dandruff Shampoo','250ml',                 'HAR001',7.50, '💆',65,null,  50,1],
        ['personal-care','Body Care',  'Hand Cream 75ml',    'Intensive moisture',      'BDY001',5.99, '🙌',60,null,  40,1],
        ['first-aid','Bandages',       'Plasters Assorted',  'Box of 30',               'AID001',3.90, '🩹',65,null,  80,1],
        ['first-aid','Antiseptics',    'Antiseptic Wipes',   'Pack of 15',              'AID002',2.80, '🧻',55,null,  70,1],
        ['first-aid','Antiseptics',    'Hand Sanitiser 50ml','70% alcohol',             'AID003',2.50, '🧴',75,null,  90,1],
        ['first-aid','Equipment',      'Digital Thermometer','Fast & accurate',         'EQP001',14.99,'🌡️',70,'new',30,1],
        ['first-aid','Equipment',      'Blood Pressure Monitor','Home use',             'EQP002',39.99,'❤️',55,null, 15,1],
        ['health-foods','Protein',     'Whey Protein 1kg',   'Vanilla flavour',         'PRO001',35.00,'💪',65,'new', 20,1],
        ['health-foods','Superfoods',  'Chia Seeds 400g',    'Organic',                 'SF001', 6.99, '🌱',52,'new', 30,1],
      ];
    } else {
      items = [
        ['grocery','Dairy',     'Whole Milk 2L',       'Fresh daily',             'GRC001',2.20, '🥛',80,null, 80,1],
        ['grocery','Dairy',     'Cheddar Cheese 400g', 'Mature cheddar',          'GRC002',5.50, '🧀',72,null, 40,1],
        ['grocery','Dairy',     'Butter 250g',         'Unsalted',                'GRC003',3.20, '🧈',65,null, 50,1],
        ['grocery','Dairy',     'Greek Yogurt 500g',   'Full fat',                'GRC004',3.50, '🫙',62,null, 60,1],
        ['grocery','Dairy',     'Free Range Eggs x6',  '6 pack',                  'GRC005',2.80, '🥚',88,null, 70,1],
        ['grocery','Bakery',    'Sourdough Loaf',      'Freshly baked',           'GRC006',4.50, '🍞',75,null, 25,1],
        ['grocery','Bakery',    'Baguette',            'Traditional',             'GRC007',2.00, '🥖',70,null, 30,1],
        ['grocery','Produce',   'Bananas bunch',       'Organic',                 'GRC008',0.99, '🍌',82,null, 80,1],
        ['grocery','Produce',   'Avocado',             'Ripe & ready',            'GRC009',1.20, '🥑',78,'new',60,1],
        ['grocery','Produce',   'Cherry Tomatoes 500g','Vine ripened',            'GRC010',2.50, '🍅',70,null, 50,1],
        ['grocery','Pantry',    'Pasta 500g',          'Spaghetti',               'GRC011',1.50, '🍝',68,null, 80,1],
        ['grocery','Pantry',    'Olive Oil 500ml',     'Extra virgin',            'GRC012',8.50, '🫒',62,null, 30,1],
        ['grocery','Pantry',    'Tinned Tomatoes 400g','Chopped',                 'GRC013',0.99, '🥫',65,null, 80,1],
        ['grocery','Frozen',    'Frozen Peas 900g',    'Garden peas',             'GRC014',2.50, '🫛',58,null, 50,1],
        ['grocery','Frozen',    'Fish Fingers x10',    'Cod fillet',              'GRC015',4.50, '🐟',65,null, 30,1],
        ['grocery','Snacks',    'Crisps 150g',         'Ready salted',            'GRC016',2.20, '🍿',80,null, 60,1],
        ['grocery','Snacks',    'Chocolate Bar',       'Milk chocolate',          'GRC017',1.50, '🍫',85,'hot',80,1],
        ['beverages','Soft Drinks','Coca-Cola 500ml',  'Ice cold',                'BEV001',1.80, '🥤',92,null,120,1],
        ['beverages','Soft Drinks','Pepsi 500ml',      'Ice cold',                'BEV002',1.80, '🥤',80,null,100,1],
        ['beverages','Water',   'Still Water 1.5L',    'Natural mineral',         'BEV003',0.99, '💧',70,null,150,1],
        ['beverages','Juices',  'Orange Juice 1L',     'Not from concentrate',    'BEV004',2.80, '🍊',72,null, 50,1],
        ['beverages','Energy',  'Red Bull 250ml',      'Energy boost',            'BEV005',2.50, '🐂',88,'hot',80,1],
        ['beverages','Energy',  'Monster Energy 500ml','Green original',          'BEV006',2.20, '💚',82,null, 70,1],
        ['beverages','Alcohol', 'Heineken 4-pack',     '330ml cans',              'BEV007',9.50, '🍺',85,'hot',50,1],
        ['beverages','Alcohol', 'House Wine 750ml',    'Red or White',            'BEV008',8.99, '🍷',70,null, 30,1],
        ['household','Cleaning','Washing-Up Liquid',   '500ml',                   'HSH001',2.50, '🧼',75,null, 40,1],
        ['household','Cleaning','Multi-Surface Spray', '750ml',                   'HSH002',3.50, '🧹',68,null, 35,1],
        ['household','Laundry', 'Laundry Capsules x20','Bio',                     'HSH003',8.00, '🫧',72,null, 25,1],
        ['personal','Hygiene',  'Shower Gel 250ml',    'Fresh scent',             'PRS001',3.99, '🚿',70,null, 40,1],
        ['personal','Hygiene',  'Deodorant 150ml',     '48hr protection',         'PRS002',3.50, '💨',75,null, 50,1],
        ['tobacco','Cigarettes','Marlboro Red 20s',    'Regular',                 'TOB001',12.50,'🚬',78,null, 60,0],
        ['tobacco','Cigarettes','Marlboro Gold 20s',   'Light',                   'TOB002',12.50,'🚬',72,null, 60,0],
        ['tobacco','Vape',      'Elf Bar 600',         'Blueberry ice',           'VAP001',6.50, '💨',85,'hot',50,1],
        ['tobacco','Vape',      'Lost Mary 600',       'Strawberry watermelon',   'VAP002',6.50, '💨',80,'new',40,1],
      ];
    }

    const iStmt = `INSERT INTO items 
      (business_id,category_id,subcategory_id,name,description,sku,price,emoji,
       popularity,badge,stock_qty,track_stock,tax_rate,cost_price)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price)`;

    let cnt = 0;
    for (const [c,sc,name,desc,sku,price,emoji,pop,badge,stock,track] of items) {
      const cid = catMap[c];
      const sid = sub(c, sc);
      if (!cid) continue;
      await run(iStmt, [biz.id, cid, sid, name, desc, sku, price, emoji, pop, badge||null, stock, track, biz.tax, +(price*0.6).toFixed(2)]);
      cnt++;
    }
    console.log(`   📦 ${cnt} items seeded`);

    // ── Discounts ─────────────────────────────────────────────────────────
    for (const [code, desc, type, val, minVal] of [
      ['WELCOME10', '10% off any order',      'percent', 10, 0],
      ['SAVE5',     '5 off orders over 30',   'fixed',    5, 30],
    ]) {
      await run(`INSERT INTO discounts (business_id,code,description,type,value,min_order_value) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE description=VALUES(description)`, [biz.id, code, desc, type, val, minVal]);
    }

    // ── Customers ─────────────────────────────────────────────────────────
    for (const [name, email, phone] of [
      ['Alice Johnson', `alice@${slug}.com`, '+1 555 001 0001'],
      ['Bob Smith',     `bob@${slug}.com`,   '+1 555 001 0002'],
    ]) {
      await run(`INSERT INTO customers (business_id,name,email,phone) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name)`, [biz.id, name, email, phone]);
    }
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('─────────────────────────────────────────────');
  console.log('  SUPER ADMIN:');
  console.log(`  superadmin@swiftpos.com / ${process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!'}`);
  console.log('\n  BUSINESS LOGINS (password: demo123)');
  console.log('  Nadia\'s Bistro:  admin@nadiasbistro.com');
  console.log('  City Pharmacy:   admin@citypharmacy.com');
  console.log('  Corner Retail:   admin@cornerretail.com');
  console.log('─────────────────────────────────────────────\n');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
