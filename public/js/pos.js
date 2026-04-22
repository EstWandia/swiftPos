/* ══════════════════════════════════════════════════════
   SwiftPOS v2 — POS Register Logic
   Multi-tenant: all data scoped to logged-in business
══════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────
let allCategories = [];
let curCat        = 'all';
let curSub        = 'all';
let curSort       = 'popular';
let searchQuery   = '';
let ddIdx         = -1;
let viewMode      = 'grid';
let favorites     = new Set();
let recents       = [];
let currentUser   = null;

// Cart state
let cart             = [];
let discountPct      = 0;
let discountAmt      = 0;  // fixed amount
let discountType     = null;
let discountCode     = null;
let selectedCustomer = null;
let payMethod        = 'cash';

// ── Boot ──────────────────────────────────────────────
(async function init() {
  try {
    const { user } = await API.get('/api/me');
    currentUser = user;
    // Set currency from business
    window._currSym = user.business?.currency_sym || '€';
    document.getElementById('userAvatar').textContent = user.name.slice(0,2).toUpperCase();
    document.getElementById('cashierName').textContent = user.name;
    document.getElementById('bizName').textContent = user.business?.name || 'SwiftPOS';
    buildNav(user.role, '/');
  } catch (e) {
    window.location.href = '/login'; return;
  }

  startClock('clock');
  loadFavsRecents();
  await loadCategories();
  await loadProducts();
  renderRecents();
  renderCart();
  updateFab(false);
  setupDragHandle();
})();

function loadFavsRecents() {
  const bizKey = `swiftpos_${currentUser?.business_id}`;
  favorites = new Set(JSON.parse(localStorage.getItem(bizKey + '_favs') || '[]'));
  recents   = JSON.parse(localStorage.getItem(bizKey + '_recents') || '[]');
}
function saveFavs()    { localStorage.setItem(`swiftpos_${currentUser?.business_id}_favs`,    JSON.stringify([...favorites])); }
function saveRecents() { localStorage.setItem(`swiftpos_${currentUser?.business_id}_recents`, JSON.stringify(recents)); }

// ── Categories ────────────────────────────────────────
async function loadCategories() {
  try {
    const { categories } = await API.get('/api/categories');
    allCategories = categories;
    renderCatList();
  } catch(e) { showToast('Failed to load categories', 'error'); }
}

function renderCatList() {
  const list = document.getElementById('catList');
  const total = allCategories.reduce((s,c) => s + (c.item_count || 0), 0);
  list.innerHTML =
    `<div class="cat-item ${curCat==='all'?'active':''}" onclick="selCat('all')">
       <span class="cat-emoji">🏪</span>
       <span class="cat-lbl">All Items</span>
       <span class="cat-cnt">${total}</span>
     </div>` +
    allCategories.map(c =>
      `<div class="cat-item ${curCat===String(c.id)?'active':''}" onclick="selCat('${c.id}')">
         <span class="cat-emoji">${c.emoji}</span>
         <span class="cat-lbl">${c.name}</span>
         <span class="cat-cnt">${c.item_count||0}</span>
       </div>`
    ).join('');
}

function selCat(id) {
  curCat = String(id); curSub = 'all';
  searchQuery = '';
  document.getElementById('searchBox').value = '';
  document.getElementById('scBtn').classList.remove('vis');
  closeSDD();
  renderCatList(); renderSubcats(); loadProducts();
}

function renderSubcats() {
  const bar = document.getElementById('subcatBar');
  if (curCat === 'all') { bar.innerHTML = ''; return; }
  const cat = allCategories.find(c => String(c.id) === curCat);
  if (!cat?.subcategories?.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = [{ id:'all', name:'All' }, ...cat.subcategories].map(s =>
    `<button class="sub-tab ${(s.id==='all'&&curSub==='all')||String(s.id)===curSub?'active':''}"
             onclick="selSub('${s.id}')">${s.name}</button>`
  ).join('');
}

function selSub(id) { curSub = String(id); renderSubcats(); loadProducts(); }

// ── Products ──────────────────────────────────────────
async function loadProducts() {
  document.getElementById('prodGrid').innerHTML = '<div class="spinner"></div>';
  let url = `/api/items?sort=${curSort}`;
  if (curCat !== 'all') url += `&category_id=${curCat}`;
  if (curSub !== 'all') url += `&subcategory_id=${curSub}`;
  if (searchQuery)      url += `&q=${encodeURIComponent(searchQuery)}`;
  try {
    const { items } = await API.get(url);
    renderProducts(items);
  } catch(e) {
    document.getElementById('prodGrid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderProducts(items) {
  const grid  = document.getElementById('prodGrid');
  const isList = viewMode === 'list';
  grid.className = 'prod-grid' + (isList ? ' list' : '');
  document.getElementById('resultCount').innerHTML = `<strong>${items.length}</strong> items`;
  document.getElementById('itemsLoaded').textContent = `${items.length} products`;

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="ei">🔍</div><h3>No items found</h3><p>Try a different search or category</p></div>`;
    return;
  }

  grid.innerHTML = items.map(p => {
    const isFav     = favorites.has(p.id);
    const effPrice  = p.on_sale && p.sale_price ? parseFloat(p.sale_price) : parseFloat(p.price);
    const outOfStock = p.track_stock && parseInt(p.stock_qty) <= 0;

    const priceHtml = p.on_sale && p.sale_price
      ? `<span class="pcard-price stk">${fmt(p.price)}</span><span class="pcard-sale">${fmt(p.sale_price)}</span>`
      : `<span class="pcard-price">${fmt(p.price)}</span>`;

    // Badge: out-of-stock overrides other badges
    const bdg = outOfStock
      ? '<span class="badge badge-oos">❌ Out of Stock</span>'
      : p.badge === 'hot' ? '<span class="badge badge-hot">🔥 HOT</span>'
      : p.badge === 'new' ? '<span class="badge badge-new">✨ NEW</span>'
      : p.on_sale         ? '<span class="badge badge-sale">SALE</span>' : '';

    // Include stock info in payload so addToCart can check it
    const pStr = JSON.stringify({
      id: p.id, name: p.name, sku: p.sku, emoji: p.emoji,
      price: effPrice, tax_rate: p.tax_rate || 10,
      track_stock: p.track_stock, stock_qty: p.stock_qty
    }).replace(/"/g,'&quot;');

    const oosClass = outOfStock ? ' oos' : '';

    if (isList) {
      return `<div class="pcard${oosClass}" onclick="addToCart('${pStr}')">
        <span class="lv-e">${p.emoji}</span>
        <div class="lv-inf">
          <div class="lv-txt"><div class="pcard-name">${hlText(p.name)}</div><div class="pcard-desc">${p.description||''}</div></div>
          <span class="lv-sku">${p.sku}</span>
          ${bdg}
          <div style="display:flex;align-items:center;gap:8px">${priceHtml}
            <button class="add-btn${outOfStock?' add-btn-oos':''}" onclick="event.stopPropagation();addToCart('${pStr}')">+</button>
          </div>
        </div>
      </div>`;
    }

    return `<div class="pcard${oosClass}" onclick="addToCart('${pStr}')">
      <button class="fav-btn ${isFav?'on':''}" onclick="event.stopPropagation();toggleFav(${p.id})">${isFav?'⭐':'☆'}</button>
      <div class="pcard-top">
        <span class="pcard-emoji">${p.emoji}</span>
        <div class="pcard-badges">${bdg}</div>
      </div>
      <div class="pcard-name">${hlText(p.name)}</div>
      <div class="pcard-desc">${p.description||''}</div>
      <div class="pcard-sku">${p.sku}</div>
      <div class="pcard-bot">${priceHtml}
        <button class="add-btn${outOfStock?' add-btn-oos':''}" onclick="event.stopPropagation();addToCart('${pStr}')">+</button>
      </div>
    </div>`;
  }).join('');
}

function hlText(t) {
  if (!searchQuery) return t;
  const re = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return t.replace(re, '<mark style="background:rgba(61,139,255,.28);border-radius:3px;padding:0 2px">$1</mark>');
}

// ── Search ────────────────────────────────────────────
const _debSearch = debounce(q => { searchQuery = q; loadProducts(); }, 280);

// Returns the active dropdown: #mobSdd when mobile overlay is open, else #sdd
function activeSdd() {
  const mob = document.getElementById('mobSearchOverlay');
  return (mob && mob.classList.contains('open'))
    ? document.getElementById('mobSdd')
    : document.getElementById('sdd');
}

async function onSearch(val) {
  const q = val.trim();
  // keep desktop clear button in sync
  const scBtn = document.getElementById('scBtn');
  if (scBtn) scBtn.classList.toggle('vis', q.length > 0);
  if (q) { curCat = 'all'; curSub = 'all'; renderCatList(); renderSubcats(); buildSDD(q); }
  else   { closeSDD(); }
  _debSearch(q);
}

async function buildSDD(q) {
  const dd = activeSdd();
  if (!dd) return;
  try {
    const { items } = await API.get(`/api/items?q=${encodeURIComponent(q)}&sort=popular`);
    const top = items.slice(0,8);
    if (!top.length) {
      dd.innerHTML = `<div class="sdd-empty">No results for "<strong>${q}</strong>"</div>`;
    } else {
      dd.innerHTML = '<div class="sdd-sec">Quick Add</div>' + top.map((p,i) => {
        const ep = p.on_sale && p.sale_price ? parseFloat(p.sale_price) : parseFloat(p.price);
        const pStr = JSON.stringify({ id:p.id, name:p.name, sku:p.sku, emoji:p.emoji, price:ep, tax_rate:p.tax_rate||10 }).replace(/"/g,'&quot;');
        return `<div class="sdd-item" id="sdi-${i}" onclick="addToCart('${pStr}');closeSDD();closeMobSearch()">
          <span class="sdd-e">${p.emoji}</span>
          <div class="sdd-inf"><div class="sdd-n">${p.name}</div><div class="sdd-m">${p.category_name||''}</div></div>
          <span class="sdd-sku">${p.sku}</span>
          <span class="sdd-p">${fmt(ep)}</span>
        </div>`;
      }).join('');
    }
    dd.classList.add('open'); ddIdx = -1;
  } catch(_) {}
}

function openSDD()  { if (searchQuery) buildSDD(searchQuery); }
function closeSDD() {
  document.getElementById('sdd')?.classList.remove('open');
  document.getElementById('mobSdd')?.classList.remove('open');
}
function clearSearch() {
  searchQuery = '';
  const sb = document.getElementById('searchBox');
  const ms = document.getElementById('mobSearchInput');
  if (sb) sb.value = '';
  if (ms) ms.value = '';
  document.getElementById('scBtn')?.classList.remove('vis');
  closeSDD();
  loadProducts();
}
function searchKeyNav(e) {
  const items = document.querySelectorAll('.sdd-item');
  if      (e.key === 'ArrowDown')  { ddIdx = Math.min(ddIdx+1, items.length-1); highlightDD(items); e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { ddIdx = Math.max(ddIdx-1, -1); highlightDD(items); e.preventDefault(); }
  else if (e.key === 'Enter' && ddIdx >= 0) items[ddIdx]?.click();
  else if (e.key === 'Escape')     { closeSDD(); clearSearch(); closeMobSearch(); }
}
function highlightDD(items) {
  items.forEach((el,i) => el.classList.toggle('sel', i === ddIdx));
  if (ddIdx >= 0) items[ddIdx]?.scrollIntoView({ block:'nearest' });
}

// ── Mobile floating search ────────────────────────────
function openMobSearch() {
  const overlay = document.getElementById('mobSearchOverlay');
  overlay.classList.add('open');
  // Sync value from desktop box if any
  const desktopVal = document.getElementById('searchBox')?.value || '';
  const inp = document.getElementById('mobSearchInput');
  inp.value = desktopVal;
  // Focus after slide-in animation
  setTimeout(() => { inp.focus(); inp.select(); }, 220);
}

function closeMobSearch(e) {
  // If click was on the box itself, don't close
  if (e && e.target !== document.getElementById('mobSearchOverlay')) return;
  const overlay = document.getElementById('mobSearchOverlay');
  overlay.classList.remove('open');
  closeSDD();
  // Sync mobile search value back to desktop hidden input and state
  const mobVal = document.getElementById('mobSearchInput')?.value || '';
  const sb = document.getElementById('searchBox');
  if (sb) sb.value = mobVal;
  // If cleared, reset products
  if (!mobVal) { searchQuery = ''; loadProducts(); }
}

// scanMode() is defined in scanner.js

function setView(v) {
  viewMode = v;
  document.getElementById('btnGrid').classList.toggle('active', v==='grid');
  document.getElementById('btnList').classList.toggle('active', v==='list');
  loadProducts();
}
function onSortChange(v) { curSort = v; loadProducts(); }

// ── Favorites ─────────────────────────────────────────
function toggleFav(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavs(); loadProducts();
}

// ── Recents ───────────────────────────────────────────
function renderRecents() {
  const wrap = document.getElementById('recentsChips');
  if (!wrap || !recents.length) return;
  wrap.innerHTML = recents.slice(0,8).map(p => {
    const pStr = JSON.stringify(p).replace(/"/g,'&quot;');
    return `<div class="rec-chip" onclick="addToCart('${pStr}')"><span>${p.emoji}</span>${p.name}</div>`;
  }).join('');
}

// ── Cart ──────────────────────────────────────────────
function addToCart(product) {
  if (typeof product === 'string') product = JSON.parse(product);

  // Block if tracked and stock is zero
  if (product.track_stock && parseInt(product.stock_qty) <= 0) {
    showToast(`❌ ${product.name} is out of stock`, 'error');
    return;
  }

  const ex = cart.find(i => i.id === product.id);
  if (ex) { ex.qty++; }
  else cart.push({ id: product.id, name: product.name, sku: product.sku,
                   emoji: product.emoji, price: parseFloat(product.price),
                   tax_rate: parseFloat(product.tax_rate) || 10, qty: 1 });

  // Update recents (business-scoped)
  const slim = { id:product.id, name:product.name, emoji:product.emoji, price:parseFloat(product.price), sku:product.sku, tax_rate:parseFloat(product.tax_rate)||10 };
  recents = [slim, ...recents.filter(r => r.id !== product.id)].slice(0,8);
  saveRecents(); renderRecents();

  renderCart();
  updateFab(true);
  showToast(`${product.emoji} ${product.name} added`, 'success');
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  renderCart(); updateFab(false);
}

function removeItem(id) {
  cart = cart.filter(i => i.id !== id);
  renderCart(); updateFab(false);
}

function clearCart() {
  if (!cart.length) return;
  if (!confirm('Clear all items from this order?')) return;
  cart = []; discountPct = 0; discountAmt = 0; discountType = null; discountCode = null; selectedCustomer = null;
  document.getElementById('discIn').value = '';
  document.getElementById('custName').textContent = 'Walk-in Customer';
  document.getElementById('custSub').textContent  = 'Tap to assign';
  renderCart(); updateFab(false);
}

// ── Core totals calculator ────────────────────────────
function calcTotals() {
  const subtotal = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const taxTotal = cart.reduce((s,i) => s + i.price * i.qty * ((i.tax_rate || 10) / 100), 0);
  let discAmt = 0;
  if (discountType === 'percent') discAmt = (subtotal + taxTotal) * (discountPct / 100);
  else if (discountType === 'fixed') discAmt = Math.min(discountAmt, subtotal + taxTotal);
  const grand = subtotal + taxTotal - discAmt;
  return {
    subtotal:  +subtotal.toFixed(2),
    taxTotal:  +taxTotal.toFixed(2),
    discAmt:   +discAmt.toFixed(2),
    grand:     +grand.toFixed(2),
    qty:       cart.reduce((s,i) => s + i.qty, 0)
  };
}

function renderCart() {
  const { subtotal, taxTotal, discAmt, grand, qty } = calcTotals();

  // Update footer totals
  const g = id => document.getElementById(id);
  g('odBadge').textContent   = qty + ' item' + (qty !== 1 ? 's' : '');
  g('tSub').textContent      = fmt(subtotal);
  g('tTax').textContent      = fmt(taxTotal);
  g('tDisc').textContent     = discAmt > 0 ? '-' + fmt(discAmt) : fmt(0);
  g('tDisc').style.color     = discAmt > 0 ? 'var(--green)' : '';
  g('tTotal').textContent    = fmt(grand);
  g('chargeAmt').textContent = fmt(grand);
  g('chargeBtn').disabled    = cart.length === 0;
  calcChange();

  // #cartEmpty is a SIBLING of #odItems — toggle class, never moves in DOM
  // This prevents the null crash where innerHTML wiped it as a child
  const emptyEl = g('cartEmpty');
  if (emptyEl) emptyEl.classList.toggle('visible', cart.length === 0);

  // Safely overwrite only #odItems content (no child elements are permanent here)
  g('odItems').innerHTML = cart.map(function(item) {
    const lineTotal = item.price * item.qty;
    return '<div class="oline">'
      + '<span class="ol-e">' + item.emoji + '</span>'
      + '<div class="ol-inf">'
      +   '<div class="ol-name">' + item.name + '</div>'
      +   '<div class="ol-line2">'
      +     '<span class="ol-price">' + fmt(lineTotal) + '</span>'
      +     '<span class="ol-unit">' + fmt(item.price) + ' x ' + item.qty + '</span>'
      +   '</div>'
      + '</div>'
      + '<div class="ol-qty">'
      +   '<button class="qb" onclick="changeQty(' + item.id + ', -1)">-</button>'
      +   '<span class="qv">' + item.qty + '</span>'
      +   '<button class="qb" onclick="changeQty(' + item.id + ', 1)">+</button>'
      + '</div>'
      + '<button class="ol-del" onclick="removeItem(' + item.id + ')" title="Remove">x</button>'
      + '</div>';
  }).join('');
}

// ── FAB ───────────────────────────────────────────────
function updateFab(pulse) {
  const { qty, grand } = calcTotals();
  document.getElementById('fabBadge').textContent = qty;
  document.getElementById('fabTotal').textContent = fmt(grand);
  if (pulse) {
    const f = document.getElementById('fab');
    f.classList.remove('pulse'); void f.offsetWidth; f.classList.add('pulse');
    setTimeout(() => f.classList.remove('pulse'), 600);
  }
}

// ── Order Drawer open/close ───────────────────────────
function openOrder() {
  document.getElementById('orderDrawer').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function closeOrder() {
  document.getElementById('orderDrawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

function setupDragHandle() {
  let startY = 0, dragging = false;
  const handle = document.getElementById('odHandle');
  if (!handle) return;
  handle.addEventListener('pointerdown', e => { startY = e.clientY; dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (dy > 0) document.getElementById('orderDrawer').style.transform = `translateY(${dy}px)`;
  });
  handle.addEventListener('pointerup', e => {
    if (!dragging) return; dragging = false;
    document.getElementById('orderDrawer').style.transform = '';
    if (e.clientY - startY > 90) closeOrder();
  });
}

// ── Discount ──────────────────────────────────────────
async function applyDiscount() {
  const val = document.getElementById('discIn').value.trim();
  if (!val) { discountType=null; discountPct=0; discountAmt=0; discountCode=null; renderCart(); updateFab(false); return; }

  const num = parseFloat(val.replace('%',''));
  if (!isNaN(num) && val.endsWith('%') && num >= 0 && num <= 100) {
    discountType = 'percent'; discountPct = num; discountAmt = 0; discountCode = null;
    renderCart(); updateFab(false);
    showToast(`✅ ${num}% discount applied`, 'success'); return;
  }
  if (!isNaN(num) && num > 0 && num < 1000) {
    discountType = 'fixed'; discountAmt = num; discountPct = 0; discountCode = null;
    renderCart(); updateFab(false);
    showToast(`✅ Fixed ${fmt(num)} discount applied`, 'success'); return;
  }

  // Try as promo code
  const { subtotal } = calcTotals();
  try {
    const res = await API.get(`/api/orders/validate-discount?code=${encodeURIComponent(val.toUpperCase())}&total=${subtotal}`);
    if (res.valid) {
      discountType = res.discount.type;
      discountPct  = res.discount.type === 'percent' ? parseFloat(res.discount.value) : 0;
      discountAmt  = res.discount.type === 'fixed'   ? parseFloat(res.discount.value) : 0;
      discountCode = val.toUpperCase();
      renderCart(); updateFab(false);
      showToast(`✅ ${res.discount.description || 'Code applied'}`, 'success');
    } else showToast(res.message || 'Invalid code', 'error');
  } catch(e) { showToast(e.message, 'error'); }
}

// ── Payment ───────────────────────────────────────────
function setPay(el) {
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  payMethod = el.dataset.method;
  document.getElementById('cashRow').classList.toggle('show', payMethod === 'cash');
  calcChange();
}

function calcChange() {
  const { grand } = calcTotals();
  const tendered  = parseFloat(document.getElementById('tenderedIn')?.value) || 0;
  const el        = document.getElementById('changeDisplay');
  if (!el) return;
  if (tendered > 0) {
    const change = tendered - grand;
    el.textContent = change >= 0 ? `Change: ${fmt(change)}` : `⚠ Short by ${fmt(-change)}`;
    el.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
  } else el.textContent = '';
}

// ── Checkout ──────────────────────────────────────────
async function checkout() {
  if (!cart.length) return;
  const btn = document.getElementById('chargeBtn');
  btn.disabled = true;
  document.getElementById('chargeBtnLabel').textContent = 'Processing…';

  const { grand } = calcTotals();

  const payload = {
    items: cart.map(i => ({
      item_id:  i.id,
      name:     i.name,
      sku:      i.sku,
      price:    i.price,
      quantity: i.qty,
      tax_rate: i.tax_rate || 10,
    })),
    payment_method:  payMethod,
    customer_id:     selectedCustomer?.id || null,
    discount_code:   discountCode || null,
    discount_type:   discountType || null,
    discount_value:  discountType === 'percent' ? discountPct : (discountType === 'fixed' ? discountAmt : 0),
    amount_tendered: payMethod === 'cash' ? (parseFloat(document.getElementById('tenderedIn').value) || null) : null,
  };

  try {
    const result = await API.post('/api/orders', payload);

    // ✅ Success flash
    const flash = document.getElementById('successFlash');
    document.getElementById('sfOrderNum').textContent = result.order_number;
    document.getElementById('sfAmt').textContent      = fmt(result.total);
    if (result.change_amount > 0) {
      document.getElementById('sfChange').textContent  = `Change: ${fmt(result.change_amount)}`;
      document.getElementById('sfChange').style.display = '';
    } else {
      document.getElementById('sfChange').style.display = 'none';
    }
    flash.classList.add('show');

    setTimeout(() => {
      flash.classList.remove('show');
      // Reset cart
      cart = []; discountPct=0; discountAmt=0; discountType=null; discountCode=null; selectedCustomer=null;
      document.getElementById('discIn').value      = '';
      document.getElementById('tenderedIn').value  = '';
      document.getElementById('cashRow').classList.remove('show');
      document.getElementById('custName').textContent = 'Walk-in Customer';
      document.getElementById('custSub').textContent  = 'Tap to assign';
      renderCart(); updateFab(false);
      closeOrder();
      btn.disabled = false;
      document.getElementById('chargeBtnLabel').textContent = '✓  Complete Order';
    }, 2800);
  } catch(e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    document.getElementById('chargeBtnLabel').textContent = '✓  Complete Order';
  }
}

// ── Customer ──────────────────────────────────────────
function openCustomerSearch() {
  document.getElementById('custModal').classList.add('open');
  document.getElementById('custSearchIn').value = '';
  document.getElementById('custResults').innerHTML = '';
  setTimeout(() => document.getElementById('custSearchIn').focus(), 100);
}
function closeCustSearch() { document.getElementById('custModal').classList.remove('open'); }

const _custSrch = debounce(async q => {
  if (!q.trim()) { document.getElementById('custResults').innerHTML = ''; return; }
  try {
    const { customers } = await API.get(`/api/customers?q=${encodeURIComponent(q)}`);
    const wrap = document.getElementById('custResults');
    if (!customers.length) { wrap.innerHTML = '<div class="empty-state" style="padding:20px"><p>No customers found</p></div>'; return; }
    wrap.innerHTML = customers.map(c => {
      const cStr = JSON.stringify({ id:c.id, name:c.name, phone:c.phone||'', loyalty_pts:c.loyalty_pts||0 }).replace(/"/g,'&quot;');
      return `<div class="cm-item" onclick="selectCustomer('${cStr}')">
        <div class="cust-av">👤</div>
        <div class="cust-info">
          <div class="cust-name">${c.name}</div>
          <div class="cust-sub">${c.phone || c.email || ''} · ⭐ ${c.loyalty_pts||0} pts</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { showToast(e.message, 'error'); }
}, 300);

function searchCustomers(v) { _custSrch(v); }

function selectCustomer(c) {
  if (typeof c === 'string') c = JSON.parse(c);
  selectedCustomer = c;
  document.getElementById('custName').textContent = c.name;
  document.getElementById('custSub').textContent  = `⭐ ${c.loyalty_pts||0} loyalty pts`;
  closeCustSearch();
}

function openNewCustomer() {
  const name = prompt('Customer name:');
  if (!name?.trim()) return;
  const phone = prompt('Phone (optional):') || null;
  API.post('/api/customers', { name: name.trim(), phone }).then(r => {
    selectCustomer({ id: r.id, name: name.trim(), phone: phone||'', loyalty_pts: 0 });
    closeCustSearch();
    showToast('✅ Customer created', 'success');
  }).catch(e => showToast(e.message, 'error'));
}