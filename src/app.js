require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const morgan     = require('morgan');
const helmet     = require('helmet');
const path       = require('path');

const authRoutes = require('./routes/authRoutes');
const apiRoutes  = require('./routes/apiRoutes');
const viewRoutes = require('./routes/viewRoutes');
const { requireAuth } = require('./middlewares/authMiddleware');

const app = express();

// ── Trust proxy (important for HTTPS behind Railway) ────────────────
app.set('trust proxy', 1);  // <--- ADD THIS BEFORE app.use(session)

// ── Security headers ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── Logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ── Body parsers ──────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Session ───────────────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'swiftpos_dev_change_me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: false,        // block JS access to cookie
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  }
}));

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api',  requireAuth, apiRoutes);
app.use('/',     viewRoutes);

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.redirect('/');
});

// ── Error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  res.redirect('/');
});

module.exports = app;
