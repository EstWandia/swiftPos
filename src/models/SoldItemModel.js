const { query, queryOne } = require('../config/database');
const SoldItemModel = {
  async getAll(business_id, { item_id,cashier_id,date_from,date_to,limit=100,offset=0 }={}) {
    let where='WHERE business_id=?'; const p=[business_id];
    if (item_id)    { where+=' AND item_id=?';          p.push(item_id); }
    if (cashier_id) { where+=' AND cashier_id=?';       p.push(cashier_id); }
    if (date_from)  { where+=' AND DATE(sold_at)>=?';   p.push(date_from); }
    if (date_to)    { where+=' AND DATE(sold_at)<=?';   p.push(date_to); }
    const rows  = await query(`SELECT * FROM sold_items ${where} ORDER BY sold_at DESC LIMIT ? OFFSET ?`, [...p,parseInt(limit),parseInt(offset)]);
    const total = await queryOne(`SELECT COUNT(*) AS n FROM sold_items ${where}`, p);
    return { rows, total: total?.n || 0 };
  },
  async getDailyBreakdown(business_id, date) {
    const d = date || new Date().toISOString().split('T')[0];
    return query('SELECT item_name,item_sku,category_name,SUM(quantity) AS qty_sold,SUM(line_total) AS revenue FROM sold_items WHERE business_id=? AND DATE(sold_at)=? GROUP BY item_id,item_name,item_sku,category_name ORDER BY qty_sold DESC', [business_id,d]);
  },
  async getCategoryBreakdown(business_id, { date_from,date_to }={}) {
    let where='WHERE business_id=?'; const p=[business_id];
    if (date_from) { where+=' AND DATE(sold_at)>=?'; p.push(date_from); }
    if (date_to)   { where+=' AND DATE(sold_at)<=?'; p.push(date_to); }
    return query(`SELECT category_name,SUM(quantity) AS qty_sold,SUM(line_total) AS revenue FROM sold_items ${where} GROUP BY category_name ORDER BY revenue DESC`, p);
  }
};
module.exports = SoldItemModel;