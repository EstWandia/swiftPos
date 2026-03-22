const express = require('express');
const router  = express.Router();
const path    = require('path');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

const V = f => path.join(__dirname, '../views', f);

router.get('/login',     (req, res) => res.sendFile(V('login.html')));
router.get('/logout',    (req, res) => { req.session.destroy(() => res.redirect('/login')); });
router.get('/',          requireAuth, (req, res) => res.sendFile(V('pos.html')));
router.get('/orders',    requireAuth, (req, res) => res.sendFile(V('orders.html')));
router.get('/reports',   requireAuth, requireAdmin, (req, res) => res.sendFile(V('reports.html')));
router.get('/inventory', requireAuth, requireAdmin, (req, res) => res.sendFile(V('inventory.html')));

module.exports = router;
