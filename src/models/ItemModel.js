const { query, queryOne, run } = require('../config/database');

const ItemModel = {
  async search(business_id, q) {
    const like = `%${q}%`;
    return query(`SELECT i.*, c.name AS category_name, c.emoji AS category_emoji, s.name AS subcategory_name
                  FROM items i
                  JOIN categories c ON c.id=i.category_id
                  LEFT JOIN subcategories s ON s.id=i.subcategory_id
                  WHERE i.business_id=? AND i.is_active=1
                    AND (i.name LIKE ? OR i.sku LIKE ? OR i.barcode LIKE ? OR i.description LIKE ? OR c.name LIKE ?)
                  ORDER BY i.popularity DESC, i.name LIMIT 30`,
                 [business_id, like, like, like, like, like]);
  },
  async getAll(business_id, { category_id, subcategory_id, active_only=true, sort='popular' } = {}) {
    const orderMap = { popular:'i.popularity DESC, i.name', name:'i.name ASC', 'price-asc':'i.price ASC', 'price-desc':'i.price DESC', newest:'i.created_at DESC' };
    const order = orderMap[sort] || orderMap.popular;
    let where = 'WHERE i.business_id=?';
    const params = [business_id];
    if (active_only) { where += ' AND i.is_active=1'; }
    if (category_id)    { where += ' AND i.category_id=?';    params.push(category_id); }
    if (subcategory_id) { where += ' AND i.subcategory_id=?'; params.push(subcategory_id); }
    return query(`SELECT i.*, c.name AS category_name, c.emoji AS category_emoji, s.name AS subcategory_name
                  FROM items i
                  JOIN categories c ON c.id=i.category_id
                  LEFT JOIN subcategories s ON s.id=i.subcategory_id
                  ${where} ORDER BY ${order}`, params);
  },
  async getById(id, business_id) {
    return queryOne(`SELECT i.*, c.name AS category_name, c.emoji AS category_emoji
                     FROM items i JOIN categories c ON c.id=i.category_id
                     WHERE i.id=? AND i.business_id=?`, [id, business_id]);
  },
  async getBySku(sku, business_id) {
    return queryOne(`SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON c.id=i.category_id
                     WHERE (i.sku=? OR i.barcode=?) AND i.business_id=? AND i.is_active=1`, [sku, sku, business_id]);
  },
  async create(business_id, data) {
    const { category_id,subcategory_id=null,name,description=null,sku,barcode=null,price,cost_price=null,sale_price=null,on_sale=0,stock_qty=0,low_stock_alert=10,track_stock=1,emoji='🛒',tax_rate=10,badge=null,is_popular=0 } = data;
    return run(`INSERT INTO items (business_id,category_id,subcategory_id,name,description,sku,barcode,price,cost_price,sale_price,on_sale,stock_qty,low_stock_alert,track_stock,emoji,tax_rate,badge,is_popular)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
               [business_id,category_id,subcategory_id,name,description,sku,barcode,price,cost_price,sale_price,on_sale,stock_qty,low_stock_alert,track_stock,emoji,tax_rate,badge,is_popular]);
  },
  async update(id, business_id, data) {
    const item = await this.getById(id, business_id);
    if (!item) return null;
    const m = { ...item, ...data };
    return run(`UPDATE items SET category_id=?,subcategory_id=?,name=?,description=?,sku=?,barcode=?,price=?,cost_price=?,sale_price=?,on_sale=?,stock_qty=?,low_stock_alert=?,track_stock=?,emoji=?,tax_rate=?,badge=?,is_popular=?,is_active=?,updated_at=NOW() WHERE id=? AND business_id=?`,
               [m.category_id,m.subcategory_id,m.name,m.description,m.sku,m.barcode,m.price,m.cost_price,m.sale_price,m.on_sale,m.stock_qty,m.low_stock_alert,m.track_stock,m.emoji,m.tax_rate,m.badge,m.is_popular,m.is_active,id,business_id]);
  },
  async delete(id, business_id) {
    return run('UPDATE items SET is_active=0 WHERE id=? AND business_id=?', [id, business_id]);
  },
  async adjustStock(id, business_id, delta, ref=null, userId=null, type='adjustment') {
    await run('UPDATE items SET stock_qty=stock_qty+? WHERE id=? AND business_id=?', [delta, id, business_id]);
    await run('INSERT INTO stock_movements (business_id,item_id,type,quantity,reference,user_id) VALUES (?,?,?,?,?,?)',
              [business_id, id, type, delta, ref, userId]);
  }
};
module.exports = ItemModel;
