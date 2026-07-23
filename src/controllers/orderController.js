const OrderModel = require('../models/OrderModel');
const DiscountModel = require('../models/DiscountModel');
const SoldItemModel = require('../models/SoldItemModel');
const ItemModel = require('../models/ItemModel');

const bid = req => req.session.user.business_id;

const OrderController = {
  async createOrder(req, res) {
    const { items, payment_method, customer_id, discount_code,
      discount_type, discount_value, amount_tendered, amount_paid_now,
      debt_customer_name, notes } = req.body;

    if (!items || !items.length)
      return res.status(400).json({ error: 'No items in order' });

    if (payment_method === 'debt' && !(debt_customer_name || '').trim())
      return res.status(400).json({ error: 'Please enter a customer name to track this debt' });

    try {
      // Server-side stock check — never trust the cart totals sent from the client.
      // Combine quantities in case the same item appears more than once in the payload.
      const qtyByItem = {};
      for (const i of items) {
        qtyByItem[i.item_id] = (qtyByItem[i.item_id] || 0) + parseFloat(i.quantity);
      }
      for (const itemId of Object.keys(qtyByItem)) {
        const dbItem = await ItemModel.getById(parseInt(itemId), bid(req));
        if (!dbItem) return res.status(400).json({ error: `Item ${itemId} not found` });
        if (dbItem.track_stock && qtyByItem[itemId] > parseFloat(dbItem.stock_qty)) {
          return res.status(400).json({
            error: `Not enough stock for ${dbItem.name} — only ${dbItem.stock_qty} left, ${qtyByItem[itemId]} requested`
          });
        }
      }

      let dc = null, dv = 0, dt = null;

      if (discount_code?.trim()) {
        const subtotal = items.reduce((s, i) => s + parseFloat(i.price) * parseFloat(i.quantity), 0);
        const check = await DiscountModel.validate(bid(req), discount_code.trim().toUpperCase(), subtotal);
        if (!check.valid) return res.status(400).json({ error: check.message });
        dt = check.discount.type;
        dv = parseFloat(check.discount.value);
        dc = discount_code.trim().toUpperCase();
        await DiscountModel.use(bid(req), dc);
      } else if (discount_type && parseFloat(discount_value) > 0) {
        dt = discount_type;
        dv = parseFloat(discount_value);
      }

      const result = await OrderModel.create({
        business_id: bid(req),
        cashier_id: req.session.user.id,
        customer_id: customer_id ? parseInt(customer_id) : null,
        items,
        payment_method: payment_method || 'cash',
        discount_type: dt,
        discount_value: dv,
        discount_code: dc,
        amount_tendered: amount_tendered ? parseFloat(amount_tendered) : null,
        amount_paid_now: amount_paid_now != null ? parseFloat(amount_paid_now) : null,
        debt_customer_name: debt_customer_name ? debt_customer_name.trim() : null,
        notes
      });

      res.status(201).json({ success: true, ...result });
    } catch (e) {
      console.error('Order error:', e);
      res.status(500).json({ error: e.message });
    }
  },

  async getOrders(req, res) {
    try {
      const status = req.query.status || null;
      const date_from = req.query.date_from || null;
      const date_to = req.query.date_to || null;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const cashier_id = req.session.user.role === 'cashier' ? req.session.user.id : null;
      const result = await OrderModel.getAll(bid(req), { status, cashier_id, date_from, date_to, limit, offset });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  },

  async getOrder(req, res) {
    try {
      const order = await OrderModel.getById(parseInt(req.params.id), bid(req));
      if (!order) return res.status(404).json({ error: 'Order not found' });
      res.json({ order });
    } catch (e) { res.status(500).json({ error: e.message }); }
  },

  async getOrderByNumber(req, res) {
    try {
      const order = await OrderModel.getByNumber(req.params.num, bid(req));
      if (!order) return res.status(404).json({ error: 'Order not found' });
      res.json({ order });
    } catch (e) { res.status(500).json({ error: e.message }); }
  },

  async getDailySummary(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Support both ?date=X (single day) and ?date_from=X&date_to=Y (range)
      const date_from = req.query.date_from || req.query.date || today;
      const date_to = req.query.date_to || req.query.date || today;

      const summary = await OrderModel.getDailySummary(bid(req), { date_from, date_to });
      const topItems = await OrderModel.getTopItems(bid(req), { limit: 10, date_from, date_to });
      const catBreakdown = await SoldItemModel.getCategoryBreakdown(bid(req), { date_from, date_to });
      res.json({ summary, topItems, catBreakdown });
    } catch (e) { res.status(500).json({ error: e.message }); }
  },

  async validateDiscount(req, res) {
    try {
      const { code, total = 0 } = req.query;
      if (!code) return res.status(400).json({ error: 'Code required' });
      const result = await DiscountModel.validate(bid(req), code, parseFloat(total));
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      if (!['completed', 'cancelled', 'refunded', 'hold'].includes(status))
        return res.status(400).json({ error: 'Invalid status' });
      await OrderModel.updateStatus(parseInt(req.params.id), bid(req), status);

      if (status === 'refunded') {
        await SoldItemModel.markOrderItemsReturned(
          bid(req),
          parseInt(req.params.id),
          req.session.user.id
        );
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
};

module.exports = OrderController;