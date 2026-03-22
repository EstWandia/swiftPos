const UserModel     = require('../models/UserModel');
const { queryOne }  = require('../config/database');
const path          = require('path');

const AuthController = {
  showLogin(req, res) {
    if (req.session?.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../views/login.html'));
  },

  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    try {
      const user = await UserModel.getByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });

      const ok = await UserModel.verifyPassword(password, user.password);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

      // Load business info (null for superadmin)
      let business = null;
      if (user.business_id) {
        business = await queryOne('SELECT id,name,slug,type,currency,currency_sym,tax_rate,receipt_footer,logo_url FROM businesses WHERE id=? AND is_active=1', [user.business_id]);
        if (!business) return res.status(403).json({ error: 'Your business account is inactive' });
      }

      await UserModel.updateLastLogin(user.id);

      req.session.user = {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        business_id: user.business_id || null,
        business:    business,
      };

      res.json({ success: true, user: req.session.user });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: 'Login failed — please try again' });
    }
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/login'));
  }
};

module.exports = AuthController;
