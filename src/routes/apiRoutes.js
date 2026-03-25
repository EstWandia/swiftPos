const express       = require('express');
const router        = express.Router();
const ItemCtrl      = require('../controllers/itemController');
const OrderCtrl     = require('../controllers/orderController');
const CustomerModel = require('../models/CustomerModel');
const SoldItemModel = require('../models/SoldItemModel');
const { requireAdmin, requireSuperAdmin } = require('../middlewares/authMiddleware');
const { query, queryOne, run } = require('../config/database');

const bid = req => req.session.user.business_id;

// ── Me ─────────────────────────────────────────────────────────────────
router.get('/me', (req, res) => res.json({ user: req.session.user }));

// ── Categories ─────────────────────────────────────────────────────────
router.get('/categories', ItemCtrl.getCategories);
 
router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { name, slug, emoji='🏷️', description=null, sort_order=0 } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
    const r = await run(
      'INSERT INTO categories (business_id,name,slug,emoji,description,sort_order) VALUES (?,?,?,?,?,?)',
      [bid(req), name, slug, emoji, description, sort_order]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A category with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});
 
router.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, slug, emoji='🏷️', description=null, sort_order=0, is_active=1 } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
    await run(
      'UPDATE categories SET name=?,slug=?,emoji=?,description=?,sort_order=?,is_active=? WHERE id=? AND business_id=?',
      [name, slug, emoji, description, sort_order, is_active, req.params.id, bid(req)]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
 
router.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    await run('UPDATE categories SET is_active=0 WHERE id=? AND business_id=?', [req.params.id, bid(req)]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
 
// ── Subcategories ───────────────────────────────────────────────────────
router.post('/categories/:catId/subcategories', requireAdmin, async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
    // Verify the category belongs to this business
    const cat = await queryOne('SELECT id FROM categories WHERE id=? AND business_id=?', [req.params.catId, bid(req)]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const r = await run(
      'INSERT INTO subcategories (business_id,category_id,name,slug) VALUES (?,?,?,?)',
      [bid(req), req.params.catId, name, slug]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That subcategory already exists' });
    res.status(500).json({ error: e.message });
  }
});
 
router.delete('/subcategories/:id', requireAdmin, async (req, res) => {
  try {
    await run('UPDATE subcategories SET is_active=0 WHERE id=? AND business_id=?', [req.params.id, bid(req)]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// ── Analytics ──────────────────────────────────────────────────────────
 
// 1. Daily Report — sale_date, sale_day, total_profit, total_sale, quantity
router.get('/analytics/daily', requireAdmin, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const df = date_from || today.slice(0,8) + '01';
    const dt = date_to   || today;
    const rows = await query(`
      SELECT
        DATE(si.sold_at)                                        AS sale_date,
        DAYNAME(si.sold_at)                                     AS sale_day,
        COALESCE(SUM(si.line_total),0)                          AS total_sale,
        COALESCE(SUM(si.quantity),0)                            AS quantity,
        COALESCE(SUM(si.line_total - (COALESCE(i.cost_price,0) * si.quantity)),0) AS total_profit,
        MIN(si.sold_at)                                         AS created_at
      FROM sold_items si
      LEFT JOIN items i ON i.id = si.item_id
      WHERE si.business_id = ?
        AND DATE(si.sold_at) >= ? AND DATE(si.sold_at) <= ?
        AND si.state = 0
      GROUP BY DATE(si.sold_at), DAYNAME(si.sold_at)
      ORDER BY sale_date DESC
    `, [bid(req), df, dt]);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
 
// 2. Most Moving — item name, qty sold, profit, created_at
router.get('/analytics/most-moving', requireAdmin, async (req, res) => {
  try {
    const { date_from, date_to, limit = 50 } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const df = date_from || today.slice(0,8) + '01';
    const dt = date_to   || today;
    const rows = await query(`
      SELECT
        si.item_name,
        si.item_sku,
        si.category_name,
        SUM(si.quantity)                                              AS qty_sold,
        SUM(si.line_total)                                            AS total_sale,
        SUM(si.line_total - (COALESCE(i.cost_price,0) * si.quantity)) AS profit,
        MIN(si.sold_at)                                               AS created_at
      FROM sold_items si
      LEFT JOIN items i ON i.id = si.item_id
      WHERE si.business_id = ?
        AND DATE(si.sold_at) >= ? AND DATE(si.sold_at) <= ?
        AND si.state = 0
      GROUP BY si.item_id, si.item_name, si.item_sku, si.category_name
      ORDER BY qty_sold DESC
      LIMIT ?
    `, [bid(req), df, dt, parseInt(limit)]);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
 
// 3. Dead Stock — items never sold or not sold in selected period
router.get('/analytics/dead-stock', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const rows = await query(`
      SELECT
        i.name        AS item_name,
        i.sku         AS item_sku,
        i.emoji,
        c.name        AS category_name,
        i.stock_qty,
        i.price,
        MAX(si.sold_at) AS last_sold,
        i.created_at
      FROM items i
      JOIN categories c ON c.id = i.category_id
      LEFT JOIN sold_items si ON si.item_id = i.id AND si.business_id = i.business_id
      WHERE i.business_id = ?
        AND i.is_active = 1
        AND i.track_stock = 1
      GROUP BY i.id, i.name, i.sku, i.emoji, c.name, i.stock_qty, i.price, i.created_at
      HAVING last_sold IS NULL OR last_sold < DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY last_sold ASC, i.name ASC
    `, [bid(req), parseInt(days)]);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
 
// 4. Returned Items — orders with status=refunded + sold_items with state=1
router.get('/analytics/returned', requireAdmin, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const df = date_from || today.slice(0,8) + '01';
    const dt = date_to   || today;
    // Items in refunded orders
    const rows = await query(`
      SELECT
        oi.name        AS item_name,
        oi.sku         AS item_sku,
        i.emoji,
        c.name         AS category_name,
        oi.quantity,
        oi.price       AS unit_price,
        oi.line_total,
        o.order_number,
        o.status,
        u.name         AS cashier_name,
        o.notes        AS return_reason,
        o.updated_at   AS returned_at,
        o.created_at
      FROM order_items oi
      JOIN orders o      ON o.id = oi.order_id
      JOIN items i       ON i.id = oi.item_id
      JOIN categories c  ON c.id = i.category_id
      JOIN users u       ON u.id = o.cashier_id
      WHERE o.business_id = ?
        AND o.status = 'refunded'
        AND DATE(o.updated_at) >= ? AND DATE(o.updated_at) <= ?
      ORDER BY o.updated_at DESC
    `, [bid(req), df, dt]);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Items ──────────────────────────────────────────────────────────────
router.get('/items',          ItemCtrl.getItems);
router.get('/items/sku/:sku', ItemCtrl.getBySku);
router.get('/items/:id',      ItemCtrl.getItem);
router.post('/items',         requireAdmin, ItemCtrl.createItem);
router.put('/items/:id',      requireAdmin, ItemCtrl.updateItem);
router.delete('/items/:id',   requireAdmin, ItemCtrl.deleteItem);

// ── Orders ─────────────────────────────────────────────────────────────
router.post('/orders',                  OrderCtrl.createOrder);
router.get('/orders',                   OrderCtrl.getOrders);
router.get('/orders/summary/today',     OrderCtrl.getDailySummary);
router.get('/orders/validate-discount', OrderCtrl.validateDiscount);
router.get('/orders/number/:num',       OrderCtrl.getOrderByNumber);
router.get('/orders/:id',               OrderCtrl.getOrder);
router.put('/orders/:id/status',        OrderCtrl.updateStatus);


// ── Customers ──────────────────────────────────────────────────────────
router.post('/users', requireSuperAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');

    const { business_id, name, email, password, role } = req.body;

    const hashed = await bcrypt.hash(password, 12);

    const r = await run(
      `INSERT INTO users (business_id, name, email, password, role)
       VALUES (?, ?, ?, ?, ?)`,
      [business_id, name, email, hashed, role]
    );

    res.status(201).json({
      success: true,
      id: r.insertId
    });

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Customers ──────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  try {
    const { q } = req.query;
    const list = q ? await CustomerModel.search(bid(req), q)
                   : await CustomerModel.getAll(bid(req));
    res.json({ customers: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers', async (req, res) => {
  try {
    const r = await CustomerModel.create(bid(req), req.body);
    res.status(201).json({ success: true, id: r.insertId });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Sold items ─────────────────────────────────────────────────────────
router.get('/sold-items', async (req, res) => {
  try {
    const { date_from, date_to, limit, offset } = req.query;
    res.json(await SoldItemModel.getAll(bid(req), { date_from, date_to, limit, offset }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/sold-items/daily', async (req, res) => {
  try {
    res.json({ items: await SoldItemModel.getDailyBreakdown(bid(req), req.query.date) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Settings (business-scoped) ─────────────────────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const b = await queryOne('SELECT * FROM businesses WHERE id=?', [bid(req)]);
    res.json({ settings: b });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, currency, currency_sym, tax_rate, receipt_footer } = req.body;
    await run('UPDATE businesses SET name=?,address=?,phone=?,email=?,currency=?,currency_sym=?,tax_rate=?,receipt_footer=?,updated_at=NOW() WHERE id=?',
              [name, address, phone, email, currency, currency_sym, tax_rate, receipt_footer, bid(req)]);
    // Refresh session business info
    req.session.user.business = await queryOne('SELECT id,name,slug,type,currency,currency_sym,tax_rate,receipt_footer FROM businesses WHERE id=?', [bid(req)]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Super admin: list all businesses ───────────────────────────────────
router.get('/businesses', requireSuperAdmin, async (req, res) => {
  try {
    const businesses = await query('SELECT b.*, COUNT(u.id) AS user_count FROM businesses b LEFT JOIN users u ON u.business_id=b.id GROUP BY b.id ORDER BY b.created_at DESC');
    res.json({ businesses });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/businesses', requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, type, currency='EUR', currency_sym='€', tax_rate=10, address, email, phone } = req.body;
    const r = await run('INSERT INTO businesses (name,slug,type,currency,currency_sym,tax_rate,address,email,phone) VALUES (?,?,?,?,?,?,?,?,?)',
                        [name, slug, type, currency, currency_sym, tax_rate, address, email, phone]);
    res.status(201).json({ success: true, id: r.insertId });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/businesses/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { name, is_active } = req.body;
    await run('UPDATE businesses SET name=?,is_active=?,updated_at=NOW() WHERE id=?', [name, is_active, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Discounts ──────────────────────────────────────────────────────────
const DiscountModel = require('../models/DiscountModel');
router.get('/discounts', requireAdmin, async (req, res) => {
  try { res.json({ discounts: await DiscountModel.getAll(bid(req)) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/discounts', requireAdmin, async (req, res) => {
  try { const r = await DiscountModel.create(bid(req), req.body); res.status(201).json({ success:true, id:r.insertId }); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/discounts/:id/toggle', requireAdmin, async (req, res) => {
  try { await DiscountModel.toggle(parseInt(req.params.id), bid(req)); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Inventory stock adjust ─────────────────────────────────────────────
const ItemModel = require('../models/ItemModel');
router.post('/items/:id/stock', requireAdmin, async (req, res) => {
  try {
    const { delta, notes } = req.body;
    await ItemModel.adjustStock(parseInt(req.params.id), bid(req), parseInt(delta), notes, req.session.user.id, 'restock');
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
