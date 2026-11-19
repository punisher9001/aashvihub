CREATE DATABASE IF NOT EXISTS aashvi_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aashvi_hub;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(20) DEFAULT '',
  sort_order INT DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  image VARCHAR(500) DEFAULT '',
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategory_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  details TEXT,
  image VARCHAR(500) DEFAULT '',
  mrp DECIMAL(10,2) NOT NULL DEFAULT 0,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(40) DEFAULT '',
  stock INT NOT NULL DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(200) DEFAULT '',
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS themes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  theme_key VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL
);

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(50) PRIMARY KEY,
  v VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  zone_key VARCHAR(20) PRIMARY KEY,
  label VARCHAR(60) NOT NULL,
  min_days INT NOT NULL,
  max_days INT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  address VARCHAR(500) NOT NULL,
  pincode CHAR(6) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  coupon VARCHAR(30) NULL,
  payment_method ENUM('online','cod') NOT NULL,
  payment_status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  razorpay_order_id VARCHAR(60) NULL,
  razorpay_payment_id VARCHAR(60) NULL,
  status ENUM('pending','confirmed','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  eta_text VARCHAR(60) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  name VARCHAR(200) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  qty INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ---------- Starting data (everything below is editable from the admin panel) ----------

INSERT IGNORE INTO settings (k, v) VALUES
 ('shop_name', 'Aashvi Hub'),
 ('origin_pincode', ''),
 ('delivery_fee', '40'),
 ('free_delivery_above', '499'),
 ('remote_prefixes', '18,19,744,78,79'),
 ('theme_mode', 'auto');

-- Starting delivery-day values. These are NOT Amazon/Flipkart's real numbers; set what your courier actually gives you.
INSERT IGNORE INTO delivery_zones (zone_key, label, min_days, max_days) VALUES
 ('local', 'Same city / nearby', 1, 2),
 ('regional', 'Same region', 2, 4),
 ('national', 'Rest of India', 4, 7),
 ('remote', 'Remote areas (J&K, North-East, Andaman)', 7, 10);

-- Festival dates change every year, so dates are left empty. Set them in Admin > Themes.
INSERT IGNORE INTO themes (theme_key, name) VALUES
 ('default', 'Aashvi Hub'),
 ('diwali', 'Happy Diwali'),
 ('eid', 'Eid Mubarak'),
 ('holi', 'Happy Holi'),
 ('navratri', 'Happy Navratri'),
 ('christmas', 'Merry Christmas'),
 ('independence', 'Happy Independence Day'),
 ('newyear', 'Happy New Year');

INSERT INTO categories (name, icon, sort_order) VALUES
 ('Food', '🍱', 1), ('Electronics', '🔌', 2), ('Clothes', '👕', 3), ('Vegetables', '🥦', 4);

INSERT INTO subcategories (category_id, name) SELECT id, 'Jams' FROM categories WHERE name='Food';
INSERT INTO subcategories (category_id, name) SELECT id, 'Namkeens' FROM categories WHERE name='Food';
INSERT INTO subcategories (category_id, name) SELECT id, 'Biscuits' FROM categories WHERE name='Food';
INSERT INTO subcategories (category_id, name) SELECT id, 'Mobile Accessories' FROM categories WHERE name='Electronics';
INSERT INTO subcategories (category_id, name) SELECT id, 'Home Appliances' FROM categories WHERE name='Electronics';
INSERT INTO subcategories (category_id, name) SELECT id, 'Men' FROM categories WHERE name='Clothes';
INSERT INTO subcategories (category_id, name) SELECT id, 'Women' FROM categories WHERE name='Clothes';
INSERT INTO subcategories (category_id, name) SELECT id, 'Kids' FROM categories WHERE name='Clothes';
INSERT INTO subcategories (category_id, name) SELECT id, 'Fresh Vegetables' FROM categories WHERE name='Vegetables';
INSERT INTO subcategories (category_id, name) SELECT id, 'Leafy Greens' FROM categories WHERE name='Vegetables';

-- Placeholder products only to show how the shop looks. Replace/delete them in Admin > Products.
INSERT INTO products (subcategory_id, name, description, details, mrp, price, unit, stock)
SELECT id, 'Sample Mixed Fruit Jam', 'Placeholder product', 'Replace this with your real product details.', 120, 99, '500 g', 50 FROM subcategories WHERE name='Jams';
INSERT INTO products (subcategory_id, name, description, details, mrp, price, unit, stock)
SELECT id, 'Sample Strawberry Jam', 'Placeholder product', 'Replace this with your real product details.', 150, 130, '500 g', 50 FROM subcategories WHERE name='Jams';
INSERT INTO products (subcategory_id, name, description, details, mrp, price, unit, stock)
SELECT id, 'Sample Aloo Bhujia', 'Placeholder product', 'Replace this with your real product details.', 60, 55, '200 g', 50 FROM subcategories WHERE name='Namkeens';

INSERT INTO offers (code, description, discount_percent, min_order, active)
VALUES ('WELCOME10', '10% off on orders above 300', 10, 300, 1);
