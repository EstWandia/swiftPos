const { query, queryOne, run } = require('../config/database');
const CustomerModel = {
  async search(business_id, q) {
    const like=`%${q}%`;
    return query('SELECT * FROM customers WHERE business_id=? AND is_active=1 AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20', [business_id,like,like,like]);
  },
  async getById(id, business_id) { return queryOne('SELECT * FROM customers WHERE id=? AND business_id=?', [id,business_id]); },
  async getAll(business_id, { limit=50, offset=0 }={}) { return query('SELECT * FROM customers WHERE business_id=? AND is_active=1 ORDER BY name LIMIT ? OFFSET ?', [business_id,limit,offset]); },
  async create(business_id, { name,email=null,phone=null,address=null,notes=null }) { return run('INSERT INTO customers (business_id,name,email,phone,address,notes) VALUES (?,?,?,?,?,?)', [business_id,name,email,phone,address,notes]); },
  async update(id, business_id, d) { return run('UPDATE customers SET name=?,email=?,phone=?,address=?,notes=?,updated_at=NOW() WHERE id=? AND business_id=?', [d.name,d.email,d.phone,d.address,d.notes,id,business_id]); },
  async delete(id, business_id) { return run('UPDATE customers SET is_active=0 WHERE id=? AND business_id=?', [id,business_id]); }
};
module.exports = CustomerModel;
