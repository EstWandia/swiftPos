# ⚡ SwiftPOS v2

**Multi-tenant Point of Sale** — Node.js + MySQL + Vanilla JS  
One installation, unlimited businesses. Each business sees **only its own data**.

---

## 🚀 Setup in 5 Steps

### Step 1 — Prerequisites

- **Node.js v18+**: https://nodejs.org
- **MySQL 8+**: https://dev.mysql.com/downloads/

Verify:
```bash
node --version    # v18+
mysql --version   # 8+
```

### Step 2 — Install packages

```bash
cd POS
npm install
```

### Step 3 — Configure `.env`

```bash
# Windows
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Open `.env` and fill in your MySQL credentials:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=swiftpos

SESSION_SECRET=change_this_to_a_long_random_string

SUPER_ADMIN_EMAIL=superadmin@swiftpos.com
SUPER_ADMIN_PASSWORD=SuperAdmin123!
```

### Step 4 — Run migrations (creates all tables)

```bash
npm run migrate
```

You should see:
```
✅ All tables created/verified
Now run:  npm run seed
```

### Step 5 — Seed demo data

```bash
npm run seed
```

This creates **3 demo businesses**, each with their own categories, products, users and discounts:

```
SUPER ADMIN:
  superadmin@swiftpos.com / SuperAdmin123!

BUSINESS LOGINS (password: demo123):
  Nadia's Bistro  →  admin@nadiasbistro.com
  City Pharmacy   →  admin@citypharmacy.com
  Corner Retail   →  admin@cornerretail.com
```

### Start the server

```bash
npm start          # production
npm run dev        # development with auto-restart
```

Open **http://localhost:3000**

---

## 🏢 Multi-Tenant Architecture

Every table in the database has a `business_id` column.  
**Every query is automatically scoped** to the logged-in user's business.

```
businesses          ← one row per shop/restaurant/pharmacy
  └── users         ← each user belongs to one business
  └── categories    ← each business has its own categories
  └── items         ← each business has its own products
  └── orders        ← orders are private to each business
  └── customers     ← customers belong to one business
  └── discounts     ← promo codes per business
  └── sold_items    ← sales log per business
```

**Security guarantee**: A cashier or admin at "Nadia's Bistro" can never see, modify or access data from "City Pharmacy". All API routes enforce this at the server level — not just the frontend.

---

## 📱 Pages

| Page | Path | Access |
|------|------|--------|
| POS Register | `/` | All roles |
| Orders History | `/orders` | All roles (cashiers see own orders only) |
| Sales Reports | `/reports` | Admin + Manager |
| Inventory | `/inventory` | Admin + Manager |

---

## 🔑 Roles

| Role | POS | Orders | Reports | Inventory | Add Items |
|------|-----|--------|---------|-----------|-----------|
| cashier | ✅ | ✅ own | ❌ | ❌ | ❌ |
| manager | ✅ | ✅ all | ✅ | ✅ | ✅ |
| admin   | ✅ | ✅ all | ✅ | ✅ | ✅ |
| superadmin | ✅ | ✅ | ✅ | ✅ | ✅ + manage businesses |

---

## 🛒 Order Panel — How It Works

1. Tap any product card → item added to cart (FAB counter updates)
2. Tap the **🛒 Order** FAB at the bottom to open the drawer
3. Adjust quantities with **+/−** buttons, or ✕ to remove
4. Optionally enter a **discount code** or type `10%` for manual discount
5. Select **payment method**: Cash / Card / QR
6. For cash: enter amount tendered → change is calculated automatically
7. Tap **✓ Complete Order** → order saved, stock updated, customer loyalty updated
8. Success animation shows order number + change due

---

## 🗄️ Database Tables

| Table | Purpose |
|-------|---------|
| `businesses` | Tenant registry — one row per shop |
| `users` | All users across all businesses |
| `categories` | Product categories (scoped per business) |
| `subcategories` | Sub-groups within categories |
| `items` | Products with price, SKU, stock, emoji |
| `customers` | Customer profiles with loyalty points |
| `orders` | Order headers with totals + payment info |
| `order_items` | Line items with price snapshot |
| `sold_items` | Denormalised log for fast reporting |
| `discounts` | Promo codes per business |
| `stock_movements` | Full audit trail of every stock change |

---

## 🌐 API Reference

### Auth
```
POST /auth/login        { email, password }
GET  /auth/logout
```

### Items
```
GET  /api/items                     ?q= &category_id= &sort=
GET  /api/items/sku/:sku            barcode or SKU lookup
GET  /api/items/:id
POST /api/items                     admin/manager only
PUT  /api/items/:id                 admin/manager only
GET  /api/categories                with subcategories
```

### Orders
```
POST /api/orders                    place order
GET  /api/orders                    ?status= &date_from= &date_to=
GET  /api/orders/:id
GET  /api/orders/summary/today      ?date_from= &date_to=
GET  /api/orders/validate-discount  ?code= &total=
PUT  /api/orders/:id/status
```

### Customers / Reports
```
GET  /api/customers?q=
POST /api/customers
GET  /api/sold-items
GET  /api/sold-items/daily
GET  /api/settings                  admin only
PUT  /api/settings                  admin only
```

### Super Admin
```
GET  /api/businesses
POST /api/businesses
PUT  /api/businesses/:id
```

---

## 💡 Add a New Business

```bash
# Via API (as superadmin):
curl -X POST http://localhost:3000/api/businesses \
  -H "Content-Type: application/json" \
  -b "connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "name": "My New Shop",
    "slug": "my-new-shop",
    "type": "retail",
    "currency": "GBP",
    "currency_sym": "£",
    "tax_rate": 20
  }'
```

Then create a user for that business (with the returned business id):
```bash
curl -X POST http://localhost:3000/api/users \
  -d '{ "business_id": 4, "name": "Shop Admin", "email": "admin@mynewshop.com", "password": "SecurePass1", "role": "admin" }'
```

---

## 🔐 Security Features

- **bcryptjs** password hashing (cost factor 12)
- **Session-based auth** with HttpOnly, SameSite cookies
- **business_id scoping** on every single DB query
- **Role-based access** enforced server-side
- **Helmet.js** security headers
- **Parameterised queries** throughout — no SQL injection possible
- Sessions expire after 8 hours

---

## 🛠 Production Tips

1. Set `NODE_ENV=production` in `.env`
2. Use a strong random `SESSION_SECRET` (32+ chars)
3. Use `pm2`: `pm2 start src/index.js --name swiftpos`
4. Put Nginx in front for SSL termination
5. Set `cookie.secure = true` (already automatic when `NODE_ENV=production`)
6. Back up MySQL regularly: `mysqldump swiftpos > backup.sql`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v18+ |
| Framework | Express 4 |
| Database | MySQL 8 via mysql2/promise |
| Auth | express-session + bcryptjs |
| Frontend | Vanilla JS (zero dependencies) |
| Fonts | Syne + JetBrains Mono |

MIT License
