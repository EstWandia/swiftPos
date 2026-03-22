const { query, queryOne, run } = require('../config/database');

const CategoryModel = {
  async getAll(business_id) {
    return query(`SELECT c.*, COUNT(i.id) AS item_count
                  FROM categories c
                  LEFT JOIN items i ON i.category_id=c.id AND i.is_active=1 AND i.business_id=?
                  WHERE c.business_id=? AND c.is_active=1
                  GROUP BY c.id ORDER BY c.sort_order, c.name`, [business_id, business_id]);
  },
  async getWithSubcategories(business_id) {
    const cats = await this.getAll(business_id);
    const subs = await query(`SELECT s.*, COUNT(i.id) AS item_count
                              FROM subcategories s
                              LEFT JOIN items i ON i.subcategory_id=s.id AND i.business_id=?
                              WHERE s.business_id=? AND s.is_active=1
                              GROUP BY s.id ORDER BY s.sort_order, s.name`, [business_id, business_id]);
    return cats.map(c => ({ ...c, subcategories: subs.filter(s => s.category_id === c.id) }));
  },
  async create(business_id, { name, slug, emoji='🏷️', description, sort_order=0 }) {
    return run('INSERT INTO categories (business_id,name,slug,emoji,description,sort_order) VALUES (?,?,?,?,?,?)',
               [business_id, name, slug, emoji, description, sort_order]);
  },
  async update(id, business_id, data) {
    return run('UPDATE categories SET name=?,slug=?,emoji=?,description=?,sort_order=?,is_active=?,updated_at=NOW() WHERE id=? AND business_id=?',
               [data.name,data.slug,data.emoji,data.description,data.sort_order,data.is_active,id,business_id]);
  }
};
module.exports = CategoryModel;
