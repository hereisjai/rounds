CREATE TABLE IF NOT EXISTS laundry_sales (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  customer TEXT NOT NULL,
  service TEXT NOT NULL,
  pieces INTEGER NOT NULL,
  weight_kg REAL,
  amount_paise INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS laundry_sales_date ON laundry_sales (occurred_on);

CREATE TABLE IF NOT EXISTS laundry_expenses (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  category TEXT NOT NULL,
  payee TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS laundry_expenses_date ON laundry_expenses (occurred_on);
