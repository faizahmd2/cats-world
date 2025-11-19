-- PurrfectHub D1 Database Schema
-- File: src/db/schema.sql

-- Tags table (synced from CATAAS API)
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  count INTEGER DEFAULT 0,
  last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_count ON tags(count DESC);

-- User uploads
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  tags TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_hash TEXT,
  status TEXT DEFAULT 'active',
  views INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_date ON uploads(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_ip ON uploads(ip_hash);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_request DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- Cat facts cache
CREATE TABLE IF NOT EXISTS cat_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fact TEXT NOT NULL,
  source TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_cat_facts_active ON cat_facts(is_active);

-- User favorites (session-based or IP-based)
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  cat_url TEXT NOT NULL,
  cat_type TEXT,
  tags TEXT,
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_favorites_ip ON favorites(ip_hash);
CREATE INDEX IF NOT EXISTS idx_favorites_date ON favorites(created_at DESC);

-- Analytics (optional)
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  event_data TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(timestamp DESC);

-- Insert some initial popular tags
INSERT OR IGNORE INTO tags (name, count) VALUES 
  ('cute', 1000),
  ('funny', 800),
  ('grumpy', 500),
  ('sleeping', 600),
  ('kitten', 900),
  ('black', 400),
  ('white', 450),
  ('orange', 350),
  ('playful', 300),
  ('lazy', 250);

-- Insert some initial cat facts
INSERT OR IGNORE INTO cat_facts (fact, source) VALUES 
  ('Cats sleep 70% of their lives, which means a 9-year-old cat has been awake for only three years!', 'general'),
  ('A group of cats is called a "clowder" and a group of kittens is called a "kindle".', 'general'),
  ('Cats can rotate their ears 180 degrees and can hear sounds up to 64 kHz!', 'general'),
  ('A cat''s nose print is unique, similar to human fingerprints.', 'general'),
  ('Cats have over 20 vocalizations, including the purr, meow, chirp, and hiss.', 'general'),
  ('The first cat in space was French cat Felicette in 1963.', 'history'),
  ('Cats can jump up to six times their length in a single bound!', 'abilities'),
  ('A cat''s whiskers are generally about the same width as their body.', 'anatomy'),
  ('Cats spend nearly 1/3 of their waking hours cleaning themselves.', 'behavior'),
  ('The oldest known cat lived to be 38 years old!', 'records'),
  ('Cats have a third eyelid called a "haw" that you rarely see.', 'anatomy'),
  ('A cat can sprint at about 31 miles per hour for short distances.', 'abilities'),
  ('Cats have more than 100 vocal sounds, while dogs have only about 10.', 'behavior'),
  ('A cat''s purr vibrates at a frequency of 25 to 150 Hertz, which can promote healing.', 'health'),
  ('Cats spend 30-50% of their day grooming themselves.', 'behavior'),
  ('A cat has 230 bones in its body, while humans have only 206.', 'anatomy'),
  ('Cats can see in just one-sixth the light level required for human vision.', 'abilities'),
  ('The technical term for a cat''s hairball is "bezoar".', 'general'),
  ('Cats can''t taste sweetness - they lack the taste receptors for it.', 'anatomy'),
  ('A cat''s brain is 90% similar to a human brain.', 'anatomy');