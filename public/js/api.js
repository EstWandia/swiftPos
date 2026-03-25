/* SwiftPOS v2 — shared API + utilities */

const API = {
  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    // 401 → redirect to login
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  get:    url       => API.request('GET',    url),
  post:   (url, b)  => API.request('POST',   url, b),
  put:    (url, b)  => API.request('PUT',    url, b),
  delete: url       => API.request('DELETE', url),
};

/* ── Toast ─────────────────────────────────────────── */
let _tt;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show';
  el.style.borderColor = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : '';
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ── Formatting ────────────────────────────────────── */
// function fmt(n) {
//   const sym = window._currSym || '£';
//   return sym + parseFloat(n || 0).toFixed(2);
// }
function fmt(n) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);
}
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
function fmtDateTime(s) { return s ? `${fmtDate(s)} ${fmtTime(s)}` : '—'; }

/* ── Clock ─────────────────────────────────────────── */
function startClock(id = 'clock') {
  const el = document.getElementById(id);
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };
  tick(); setInterval(tick, 1000);
}

/* ── Debounce ──────────────────────────────────────── */
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── Nav builder ───────────────────────────────────── */
function buildNav(role, activePath) {
  const links = [
    { href:'/',          label:'🏪 POS',       roles:['admin','manager','cashier'] },
    { href:'/orders',    label:'📋 Orders',    roles:['admin','manager','cashier'] },
    { href:'/reports',   label:'📊 Reports',   roles:['admin','manager'] },
    { href:'/inventory', label:'📦 Inventory', roles:['admin','manager'] },
  ];
  const el = document.getElementById('navLinks');
  if (!el) return;
  el.innerHTML = links
    .filter(l => l.roles.includes(role))
    .map(l => `<a href="${l.href}" class="nav-link ${l.href === activePath ? 'active' : ''}">${l.label}</a>`)
    .join('');
}
