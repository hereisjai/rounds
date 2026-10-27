CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  role TEXT NOT NULL,
  business_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bags (
  business_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

INSERT OR IGNORE INTO businesses (id, name, trade, code) VALUES
  ('biz-milk', 'Ravi Milk Round', 'milk', 'MILK4'),
  ('biz-cool', 'CoolAir Visits', 'service', 'COOL7');

INSERT OR IGNORE INTO users (id, name, phone, pin, role, business_id) VALUES
  ('u-ravi', 'Ravi', '9845000001', '1111', 'owner', 'biz-milk'),
  ('u-suresh', 'Suresh', '9845000002', '2222', 'field', 'biz-milk'),
  ('u-kiran', 'Kiran', '9900000003', '3333', 'owner', 'biz-cool'),
  ('u-imran', 'Imran', '9900000004', '4444', 'field', 'biz-cool');
