const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || 'P@ssW0rd',
  database:           process.env.DB_NAME     || 'swiftposv2',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           'Z',
  charset:            'utf8mb4',
});

console.log('Connecting to MySQL with:', {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD ? '***' : '(empty)',
  database: process.env.DB_NAME     || 'swiftposv2',
});

// READ queries — use text protocol (pool.query) to avoid prepared-statement
// type-binding failures with COALESCE(SUM(decimal),0) and other aggregates.
async function query(sql, params = []) {
  const safe = params.map(p => (p === undefined || (typeof p === 'number' && isNaN(p))) ? null : p);
  const [rows] = await pool.query(sql, safe);
  return rows;
}

// Returns first row or null
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// WRITE queries — use execute (prepared statements) for insert/update/delete.
async function run(sql, params = []) {
  const safe = params.map(p => (p === undefined || (typeof p === 'number' && isNaN(p))) ? null : p);
  const [result] = await pool.execute(sql, safe);
  return result;
}

// Atomic transaction
async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  const safe = p => (p || []).map(v => (v === undefined || (typeof v === 'number' && isNaN(v))) ? null : v);
  const q   = (sql, p=[]) => conn.query(sql, safe(p)).then(([r]) => Array.isArray(r) ? r : r);
  const one = (sql, p=[]) => conn.query(sql, safe(p)).then(([r]) => (Array.isArray(r) ? r[0] : null) || null);
  try {
    const result = await fn({ q, one });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Test connection
pool.getConnection()
  .then(c => { console.log('✅ MySQL connected'); c.release(); })
  .catch(e => { console.error('❌ MySQL connection failed:', e.message); });

module.exports = { pool, query, queryOne, run, transaction };