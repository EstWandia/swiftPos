const { query, queryOne, run, transaction } = require('../config/database');

function genOrderNum(businessId) {
  const d = new Date();
  const dt = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dt}-${rnd}`;
}

const OrderModel = {
  async create({ business_id, cashier_id, customer_id=null, items,
                 payment_method='cash', discount_type=null, discount_value=0,
                 discount_code=null, amount_tendered=null, notes=null }) {
    return transaction(async ({ q, one }) => {
      // ── Calc totals ─────────────────────────────────────────────────────
      let subtotal = 0, tax_total = 0;
      const lineItems = items.map(item => {
        const tax_rate  = parseFloat(item.tax_rate) || 10;
        const pre_tax   = parseFloat(item.price) * parseInt(item.quantity);
        const tax_amt   = +(pre_tax * (tax_rate / 100)).toFixed(2);
        const line_tot  = +(pre_tax + tax_amt).toFixed(2);
        subtotal  += pre_tax;
        tax_total += tax_amt;
        return { ...item, tax_rate, tax_amount: tax_amt, line_total: line_tot };
      });
      subtotal  = +subtotal.toFixed(2);
      tax_total = +tax_total.toFixed(2);

      let disc_amt = 0;
      if (discount_type === 'percent') disc_amt = +((subtotal+tax_total)*(discount_value/100)).toFixed(2);
      else if (discount_type === 'fixed') disc_amt = +Math.min(discount_value, subtotal+tax_total).toFixed(2);

      const total        = +(subtotal + tax_total - disc_amt).toFixed(2);
      const change_amt   = amount_tendered != null ? +(parseFloat(amount_tendered) - total).toFixed(2) : null;
      const order_number = genOrderNum(business_id);

      // ── Insert order ────────────────────────────────────────────────────
      const orderRes = await q(
        `INSERT INTO orders (business_id,order_number,customer_id,cashier_id,status,payment_method,
           subtotal,tax_total,discount_type,discount_value,discount_amount,discount_code,
           total,amount_tendered,change_amount,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [business_id,order_number,customer_id,cashier_id,'completed',payment_method,
         subtotal,tax_total,discount_type||null,discount_value||0,disc_amt,discount_code||null,
         total,amount_tendered||null,change_amt,notes||null]
      );
      const order_id = orderRes.insertId;

      // Get cashier name
      const cashier = await one('SELECT name FROM users WHERE id=?', [cashier_id]);

      // ── Insert line items ───────────────────────────────────────────────
      for (const li of lineItems) {
        await q(
          `INSERT INTO order_items (business_id,order_id,item_id,name,sku,price,quantity,tax_rate,tax_amount,line_total)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [business_id,order_id,li.item_id,li.name,li.sku,li.price,li.quantity,li.tax_rate,li.tax_amount,li.line_total]
        );

        // sold_items log
        const fullItem = await one('SELECT i.*,c.name AS cat_name FROM items i JOIN categories c ON c.id=i.category_id WHERE i.id=? AND i.business_id=?', [li.item_id, business_id]);
        await q(
          `INSERT INTO sold_items (business_id,item_id,order_id,order_number,cashier_id,cashier_name,item_name,item_sku,category_name,quantity,unit_price,line_total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [business_id,li.item_id,order_id,order_number,cashier_id,cashier?.name||'Unknown',li.name,li.sku,fullItem?.cat_name||'',li.quantity,li.price,li.line_total]
        );

        // stock
        if (fullItem?.track_stock) {
          await q('UPDATE items SET stock_qty=stock_qty-?, popularity=popularity+? WHERE id=? AND business_id=?',
                  [li.quantity, li.quantity, li.item_id, business_id]);
          await q('INSERT INTO stock_movements (business_id,item_id,type,quantity,reference,user_id) VALUES (?,?,?,?,?,?)',
                  [business_id,li.item_id,'sale',-li.quantity,order_number,cashier_id]);
        }
      }

      // customer loyalty
      if (customer_id) {
        await q('UPDATE customers SET total_spent=total_spent+?,visit_count=visit_count+1,loyalty_pts=loyalty_pts+?,updated_at=NOW() WHERE id=? AND business_id=?',
                [total, Math.floor(total), customer_id, business_id]);
      }

      return { order_id, order_number, total, subtotal, tax_total, discount_amount: disc_amt, change_amount: change_amt };
    });
  },

  async getById(id, business_id) {
    const order = await queryOne(
      `SELECT o.*, u.name AS cashier_name, c.name AS customer_name
       FROM orders o JOIN users u ON u.id=o.cashier_id LEFT JOIN customers c ON c.id=o.customer_id
       WHERE o.id=? AND o.business_id=?`, [id, business_id]);
    if (!order) return null;
    order.items = await query(
      `SELECT oi.*, i.emoji FROM order_items oi LEFT JOIN items i ON i.id=oi.item_id WHERE oi.order_id=? AND oi.business_id=?`,
      [id, business_id]);
    return order;
  },

  async getByNumber(order_number, business_id) {
    const order = await queryOne(
      `SELECT o.*, u.name AS cashier_name, c.name AS customer_name
       FROM orders o JOIN users u ON u.id=o.cashier_id LEFT JOIN customers c ON c.id=o.customer_id
       WHERE o.order_number=? AND o.business_id=?`, [order_number, business_id]);
    if (!order) return null;
    order.items = await query('SELECT oi.*, i.emoji FROM order_items oi LEFT JOIN items i ON i.id=oi.item_id WHERE oi.order_id=? AND oi.business_id=?', [order.id, business_id]);
    return order;
  },

  async getAll(business_id, { status, cashier_id, date_from, date_to, limit=50, offset=0 } = {}) {
    let where = 'WHERE o.business_id=?';
    const params = [business_id];
    if (status)     { where += ' AND o.status=?';              params.push(status); }
    if (cashier_id) { where += ' AND o.cashier_id=?';          params.push(cashier_id); }
    if (date_from)  { where += ' AND DATE(o.created_at)>=?';   params.push(date_from); }
    if (date_to)    { where += ' AND DATE(o.created_at)<=?';   params.push(date_to); }

    const rows = await query(
      `SELECT o.id, o.business_id, o.order_number, o.customer_id, o.cashier_id,
              o.status, o.payment_method, o.subtotal, o.tax_total,
              o.discount_type, o.discount_value, o.discount_amount, o.discount_code,
              o.total, o.amount_tendered, o.change_amount, o.notes,
              o.receipt_printed, o.created_at, o.updated_at,
              u.name AS cashier_name,
              c.name AS customer_name,
              COUNT(oi.id) AS item_count
       FROM orders o
       JOIN users u ON u.id=o.cashier_id
       LEFT JOIN customers c ON c.id=o.customer_id
       LEFT JOIN order_items oi ON oi.order_id=o.id AND oi.business_id=o.business_id
       ${where}
       GROUP BY o.id, o.business_id, o.order_number, o.customer_id, o.cashier_id,
                o.status, o.payment_method, o.subtotal, o.tax_total,
                o.discount_type, o.discount_value, o.discount_amount, o.discount_code,
                o.total, o.amount_tendered, o.change_amount, o.notes,
                o.receipt_printed, o.created_at, o.updated_at,
                u.name, c.name
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]);

    const countRes = await queryOne(
      `SELECT COUNT(*) AS n FROM orders o ${where}`, params);
    return { rows, total: countRes?.n || 0 };
  },

  async updateStatus(id, business_id, status) {
    return run('UPDATE orders SET status=?,updated_at=NOW() WHERE id=? AND business_id=?', [status, id, business_id]);
  },

  async getDailySummary(business_id, { date_from, date_to } = {}) {
    const today = new Date().toISOString().split('T')[0];
    const df = date_from || today;
    const dt = date_to   || today;
    return queryOne(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(total),0) AS revenue,
              COALESCE(SUM(tax_total),0) AS tax_collected,
              COALESCE(SUM(discount_amount),0) AS discounts_given,
              COALESCE(AVG(total),0) AS avg_order_value
       FROM orders WHERE business_id=? AND DATE(created_at)>=? AND DATE(created_at)<=? AND status='completed'`,
      [business_id, df, dt]);
  },

  async getTopItems(business_id, { limit=10, date_from, date_to } = {}) {
    let where = "WHERE o.status='completed' AND o.business_id=?";
    const params = [business_id];
    if (date_from) { where += ' AND DATE(o.created_at)>=?'; params.push(date_from); }
    if (date_to)   { where += ' AND DATE(o.created_at)<=?'; params.push(date_to); }
    return query(
      `SELECT oi.item_id, oi.name, oi.sku, i.emoji,
              SUM(oi.quantity) AS total_qty,
              SUM(oi.line_total) AS total_revenue,
              c.name AS category
       FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       JOIN items i ON i.id=oi.item_id
       JOIN categories c ON c.id=i.category_id
       ${where}
       GROUP BY oi.item_id, oi.name, oi.sku, i.emoji, c.name
       ORDER BY total_qty DESC LIMIT ?`,
      [...params, parseInt(limit)]);
  }
};
module.exports = OrderModel;