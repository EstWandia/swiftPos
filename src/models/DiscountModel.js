const { queryOne, run, query } = require('../config/database');
const DiscountModel = {
  async validate(business_id, code, orderTotal=0) {
    const d = await queryOne(
      `SELECT * FROM discounts WHERE business_id=? AND code=? AND is_active=1
       AND (max_uses IS NULL OR uses_count < max_uses)
       AND (valid_from IS NULL OR NOW() >= valid_from)
       AND (valid_until IS NULL OR NOW() <= valid_until)`,
      [business_id, code.toUpperCase()]);
    if (!d) return { valid:false, message:'Invalid or expired discount code' };
    if (parseFloat(orderTotal) < parseFloat(d.min_order_value))
      return { valid:false, message:`Minimum order value ${d.min_order_value} required` };
    return { valid:true, discount:d };
  },
  async use(business_id, code) { return run('UPDATE discounts SET uses_count=uses_count+1 WHERE business_id=? AND code=?', [business_id,code]); },
  async getAll(business_id) { return query('SELECT * FROM discounts WHERE business_id=? ORDER BY created_at DESC', [business_id]); },
  async create(business_id, d) { return run('INSERT INTO discounts (business_id,code,description,type,value,min_order_value,max_uses,valid_from,valid_until) VALUES (?,?,?,?,?,?,?,?,?)', [business_id,d.code,d.description,d.type,d.value,d.min_order_value||0,d.max_uses||null,d.valid_from||null,d.valid_until||null]); },
  async toggle(id, business_id) { return run('UPDATE discounts SET is_active=1-is_active WHERE id=? AND business_id=?', [id,business_id]); }
};
module.exports = DiscountModel;
