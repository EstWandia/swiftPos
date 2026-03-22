const { query, queryOne, run } = require('../config/database');
const bcrypt = require('bcryptjs');

const UserModel = {
  async getById(id) {
    return queryOne('SELECT id,business_id,name,email,role,is_active,created_at FROM users WHERE id=?', [id]);
  },
  async getByEmail(email) {
    return queryOne('SELECT * FROM users WHERE email=? AND is_active=1', [email.trim().toLowerCase()]);
  },
  async getAll(business_id) {
    return query('SELECT id,name,email,role,is_active,created_at FROM users WHERE business_id=? ORDER BY name', [business_id]);
  },
  async create({ business_id, name, email, password, role = 'cashier' }) {
    const hash = await bcrypt.hash(password, 12);
    return run('INSERT INTO users (business_id,name,email,password,role) VALUES (?,?,?,?,?)',
               [business_id, name, email.toLowerCase(), hash, role]);
  },
  async verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  },
  async updateLastLogin(id) {
    return run('UPDATE users SET last_login=NOW() WHERE id=?', [id]);
  },
  async update(id, business_id, { name, email, role, is_active }) {
    return run('UPDATE users SET name=?,email=?,role=?,is_active=?,updated_at=NOW() WHERE id=? AND business_id=?',
               [name, email, role, is_active, id, business_id]);
  },
  async changePassword(id, newPassword) {
    const hash = await bcrypt.hash(newPassword, 12);
    return run('UPDATE users SET password=? WHERE id=?', [hash, id]);
  }
};
module.exports = UserModel;
