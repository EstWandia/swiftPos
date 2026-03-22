const ItemModel     = require('../models/ItemModel');
const CategoryModel = require('../models/CategoryModel');

const bid = req => req.session.user.business_id;

const ItemController = {
  async getItems(req, res) {
    try {
      const { q, category_id, subcategory_id, sort='popular' } = req.query;
      let items;
      if (q?.trim()) items = await ItemModel.search(bid(req), q.trim());
      else items = await ItemModel.getAll(bid(req), {
        category_id: category_id ? parseInt(category_id) : null,
        subcategory_id: subcategory_id ? parseInt(subcategory_id) : null, sort
      });
      res.json({ items });
    } catch(e) { res.status(500).json({ error: e.message }); }
  },

  async getItem(req, res) {
    try {
      const item = await ItemModel.getById(parseInt(req.params.id), bid(req));
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json({ item });
    } catch(e) { res.status(500).json({ error: e.message }); }
  },

  async getBySku(req, res) {
    try {
      const item = await ItemModel.getBySku(req.params.sku, bid(req));
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json({ item });
    } catch(e) { res.status(500).json({ error: e.message }); }
  },

  async createItem(req, res) {
    try {
      const result = await ItemModel.create(bid(req), req.body);
      res.status(201).json({ success: true, id: result.insertId });
    } catch(e) { res.status(400).json({ error: e.message }); }
  },

  async updateItem(req, res) {
    try {
      await ItemModel.update(parseInt(req.params.id), bid(req), req.body);
      res.json({ success: true });
    } catch(e) { res.status(400).json({ error: e.message }); }
  },

  async deleteItem(req, res) {
    try {
      await ItemModel.delete(parseInt(req.params.id), bid(req));
      res.json({ success: true });
    } catch(e) { res.status(400).json({ error: e.message }); }
  },

  async getCategories(req, res) {
    try {
      const categories = await CategoryModel.getWithSubcategories(bid(req));
      res.json({ categories });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
};

module.exports = ItemController;
