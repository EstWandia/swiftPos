/**
 * SwiftPOS — MySQL Schema Migration
 * Run: node src/utils/migrate.js
 * 
 * MULTI-TENANT: every business-owned table has business_id FK.
 * All queries MUST include WHERE business_id = ? for security.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

async function migrate() {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    const dbName = process.env.DB_NAME || 'swiftpos';
    console.log(`\n🔧 Creating database '${dbName}' if not exists...`);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${dbName}\``);
    console.log('🔧 Running migrations...\n');

    await conn.query(`
      /* ── BUSINESSES (tenants) ───────────────────── */
      CREATE TABLE IF NOT EXISTS businesses (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(120)  NOT NULL,
        slug          VARCHAR(80)   NOT NULL UNIQUE,
        type          ENUM('restaurant','retail','pharmacy','bar','cafe','other') NOT NULL DEFAULT 'retail',
        address       TEXT,
        phone         VARCHAR(40),
        email         VARCHAR(120),
        logo_url      VARCHAR(255),
        currency      VARCHAR(10)   NOT NULL DEFAULT 'EUR',
        currency_sym  VARCHAR(5)    NOT NULL DEFAULT '€',
        tax_rate      DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
        receipt_footer TEXT,
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── USERS ─────────────────────────────────── */
      CREATE TABLE IF NOT EXISTS users (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id   INT UNSIGNED,              -- NULL = super admin
        name          VARCHAR(100) NOT NULL,
        email         VARCHAR(150) NOT NULL,
        password      VARCHAR(255) NOT NULL,
        role          ENUM('superadmin','admin','manager','cashier') NOT NULL DEFAULT 'cashier',
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        last_login    DATETIME,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_email (email),
        CONSTRAINT fk_user_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── CATEGORIES ────────────────────────────── */
      CREATE TABLE IF NOT EXISTS categories (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id   INT UNSIGNED NOT NULL,
        name          VARCHAR(100) NOT NULL,
        slug          VARCHAR(100) NOT NULL,
        emoji         VARCHAR(10)  NOT NULL DEFAULT '🏷️',
        description   TEXT,
        sort_order    INT          NOT NULL DEFAULT 0,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cat_slug (business_id, slug),
        CONSTRAINT fk_cat_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── SUBCATEGORIES ─────────────────────────── */
      CREATE TABLE IF NOT EXISTS subcategories (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id   INT UNSIGNED NOT NULL,
        category_id   INT UNSIGNED NOT NULL,
        name          VARCHAR(100) NOT NULL,
        slug          VARCHAR(100) NOT NULL,
        sort_order    INT          NOT NULL DEFAULT 0,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sub_slug (business_id, category_id, slug),
        CONSTRAINT fk_sub_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_sub_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── ITEMS ─────────────────────────────────── */
      CREATE TABLE IF NOT EXISTS items (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id     INT UNSIGNED NOT NULL,
        category_id     INT UNSIGNED NOT NULL,
        subcategory_id  INT UNSIGNED,
        name            VARCHAR(150) NOT NULL,
        description     TEXT,
        sku             VARCHAR(80)  NOT NULL,
        barcode         VARCHAR(80),
        price           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        cost_price      DECIMAL(10,2),
        sale_price      DECIMAL(10,2),
        on_sale         TINYINT(1)   NOT NULL DEFAULT 0,
        stock_qty       INT          NOT NULL DEFAULT 0,
        low_stock_alert INT          NOT NULL DEFAULT 10,
        track_stock     TINYINT(1)   NOT NULL DEFAULT 1,
        emoji           VARCHAR(10)  NOT NULL DEFAULT '🛒',
        is_active       TINYINT(1)   NOT NULL DEFAULT 1,
        is_popular      TINYINT(1)   NOT NULL DEFAULT 0,
        popularity      INT          NOT NULL DEFAULT 0,
        tax_rate        DECIMAL(5,2) NOT NULL DEFAULT 10.00,
        badge           ENUM('hot','new','sale') DEFAULT NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_item_sku (business_id, sku),
        KEY idx_item_cat (business_id, category_id),
        KEY idx_item_active (business_id, is_active),
        KEY idx_item_barcode (business_id, barcode),
        CONSTRAINT fk_item_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_item_cat FOREIGN KEY (category_id) REFERENCES categories(id),
        CONSTRAINT fk_item_sub FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── CUSTOMERS ─────────────────────────────── */
      CREATE TABLE IF NOT EXISTS customers (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id   INT UNSIGNED NOT NULL,
        name          VARCHAR(120) NOT NULL,
        email         VARCHAR(150),
        phone         VARCHAR(40),
        address       TEXT,
        notes         TEXT,
        loyalty_pts   INT          NOT NULL DEFAULT 0,
        total_spent   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        visit_count   INT          NOT NULL DEFAULT 0,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_cust_biz (business_id),
        CONSTRAINT fk_cust_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── ORDERS ────────────────────────────────── */
      CREATE TABLE IF NOT EXISTS orders (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id     INT UNSIGNED NOT NULL,
        order_number    VARCHAR(30)  NOT NULL,
        customer_id     INT UNSIGNED,
        cashier_id      INT UNSIGNED NOT NULL,
        status          ENUM('pending','completed','cancelled','refunded','hold') NOT NULL DEFAULT 'pending',
        payment_method  ENUM('cash','card','qr','mixed') NOT NULL DEFAULT 'cash',
        subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        tax_total       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        discount_type   ENUM('percent','fixed')  DEFAULT NULL,
        discount_value  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        discount_code   VARCHAR(40),
        total           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        amount_tendered DECIMAL(12,2),
        change_amount   DECIMAL(12,2),
        notes           TEXT,
        receipt_printed TINYINT(1)   NOT NULL DEFAULT 0,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_order_num (business_id, order_number),
        KEY idx_order_biz_date (business_id, created_at),
        KEY idx_order_status (business_id, status),
        KEY idx_order_cashier (business_id, cashier_id),
        CONSTRAINT fk_order_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_cashier FOREIGN KEY (cashier_id) REFERENCES users(id),
        CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── ORDER ITEMS ───────────────────────────── */
      CREATE TABLE IF NOT EXISTS order_items (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id   INT UNSIGNED NOT NULL,
        order_id      INT UNSIGNED NOT NULL,
        item_id       INT UNSIGNED NOT NULL,
        name          VARCHAR(150) NOT NULL,
        sku           VARCHAR(80)  NOT NULL,
        price         DECIMAL(10,2) NOT NULL,
        quantity      INT          NOT NULL DEFAULT 1,
        tax_rate      DECIMAL(5,2) NOT NULL DEFAULT 10.00,
        tax_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        line_total    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        notes         TEXT,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_oi_order (order_id),
        KEY idx_oi_biz (business_id),
        CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_oi_item  FOREIGN KEY (item_id)  REFERENCES items(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── SOLD ITEMS (denormalised for fast reports) */
      CREATE TABLE IF NOT EXISTS sold_items (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id     INT UNSIGNED NOT NULL,
        item_id         INT UNSIGNED NOT NULL,
        order_id        INT UNSIGNED NOT NULL,
        order_number    VARCHAR(30)  NOT NULL,
        cashier_id      INT UNSIGNED NOT NULL,
        cashier_name    VARCHAR(100) NOT NULL,
        item_name       VARCHAR(150) NOT NULL,
        item_sku        VARCHAR(80)  NOT NULL,
        category_name   VARCHAR(100) NOT NULL,
        quantity        INT          NOT NULL,
        unit_price      DECIMAL(10,2) NOT NULL,
        line_total      DECIMAL(12,2) NOT NULL,
        sold_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_si_biz_date (business_id, sold_at),
        KEY idx_si_item (item_id),
        CONSTRAINT fk_si_biz   FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_si_order FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── DISCOUNTS ─────────────────────────────── */
      CREATE TABLE IF NOT EXISTS discounts (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id     INT UNSIGNED NOT NULL,
        code            VARCHAR(50)  NOT NULL,
        description     VARCHAR(255),
        type            ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
        value           DECIMAL(10,2) NOT NULL,
        min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        max_uses        INT,
        uses_count      INT          NOT NULL DEFAULT 0,
        valid_from      DATETIME,
        valid_until     DATETIME,
        is_active       TINYINT(1)   NOT NULL DEFAULT 1,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_disc_code (business_id, code),
        CONSTRAINT fk_disc_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      /* ── STOCK MOVEMENTS ───────────────────────── */
      CREATE TABLE IF NOT EXISTS stock_movements (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        business_id INT UNSIGNED NOT NULL,
        item_id     INT UNSIGNED NOT NULL,
        type        ENUM('sale','restock','adjustment','return') NOT NULL,
        quantity    INT          NOT NULL,
        reference   VARCHAR(60),
        user_id     INT UNSIGNED,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sm_biz (business_id),
        CONSTRAINT fk_sm_biz  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_sm_item FOREIGN KEY (item_id)     REFERENCES items(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ All tables created/verified\n');
    console.log('Now run:  npm run seed\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.end();
  }
}

migrate();
