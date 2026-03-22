/**
 * Auth middleware — all protected routes go through requireAuth.
 * business_id is automatically scoped from session.
 */
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Unauthorized — please log in' });
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  const role = req.session?.user?.role;
  if (role === 'admin' || role === 'manager' || role === 'superadmin') return next();
  if (req.path.startsWith('/api')) return res.status(403).json({ error: 'Forbidden — admin/manager only' });
  res.redirect('/');
}

function requireSuperAdmin(req, res, next) {
  if (req.session?.user?.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Forbidden — super admin only' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.session?.user?.role)) return next();
    return res.status(403).json({ error: `Forbidden — requires role: ${roles.join(' or ')}` });
  };
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireRole };
