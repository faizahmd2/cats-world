-- Run:
--   wrangler d1 execute purrfect-hub-db --file=./src/db/schema.sql
--   wrangler d1 execute purrfect-hub-db --file=./src/db/schema.sql --remote

-- Simple flexible users
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS cats (
  id            TEXT PRIMARY KEY,
  -- first user who saved/uploaded/generated this cat
  creator_id    TEXT,
  -- R2 object key
  r2_key        TEXT NOT NULL,
  -- stable app URL, usually /r2/<key>
  image_url     TEXT NOT NULL,
  -- original external URL if it came from API/generator
  source_url    TEXT,
  -- cataas/upload/pollinations/meme/thecatapi/etc
  source        TEXT DEFAULT 'upload',
  -- cat/upload/generated/meme
  type          TEXT DEFAULT 'cat',
  -- comma separated tags: cute,funny,orange
  tags          TEXT,
  title         TEXT,
  caption       TEXT,
  -- meme-specific optional fields
  meme_top      TEXT,
  meme_bottom   TEXT,
  meme_position TEXT,
  likes         INTEGER DEFAULT 0,
  views         INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'active',

  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cats_creator  ON cats(creator_id);
CREATE INDEX IF NOT EXISTS idx_cats_type     ON cats(type);
CREATE INDEX IF NOT EXISTS idx_cats_source   ON cats(source);
CREATE INDEX IF NOT EXISTS idx_cats_status   ON cats(status);
CREATE INDEX IF NOT EXISTS idx_cats_likes    ON cats(likes DESC);
CREATE INDEX IF NOT EXISTS idx_cats_created  ON cats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cats_modified ON cats(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_cats_tags     ON cats(tags);

-- User favourites / saves
CREATE TABLE IF NOT EXISTS favorites (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  cat_id     TEXT NOT NULL,
  status     TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, cat_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_user   ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_cat    ON favorites(cat_id);
CREATE INDEX IF NOT EXISTS idx_fav_status ON favorites(status);
CREATE INDEX IF NOT EXISTS idx_fav_date   ON favorites(created_at DESC);

-- Cat facts can stay because it powers your random facts UI.
CREATE TABLE IF NOT EXISTS cat_facts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  fact      TEXT NOT NULL,
  source    TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_facts_active ON cat_facts(is_active);

-- Pre-processed captions: original text + lulcat variant, synced by scripts/sync.js
-- Never call the lulcat API at runtime – just read from this table.
CREATE TABLE IF NOT EXISTS cat_captions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  original_text TEXT NOT NULL UNIQUE,
  lul_text      TEXT NOT NULL DEFAULT '',
  synced_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active     INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_captions_active ON cat_captions(is_active);

INSERT OR IGNORE INTO cat_facts (fact, source) VALUES
  ('Cats sleep 70% of their lives — a 9-year-old cat has only been awake for 3 years!','general'),
  ('A group of cats is called a "clowder".','general'),
  ('Cats can rotate their ears 180° and hear up to 64 kHz!','general'),
  ('A cat''s nose print is unique, like a fingerprint.','general'),
  ('The first cat in space was French: Félicette, 1963.','history'),
  ('Cats can jump up to 6× their body length in one bound!','abilities'),
  ('A cat''s purr vibrates at 25–150 Hz — a frequency that promotes healing.','health'),
  ('Cats have 230 bones; humans only 206.','anatomy'),
  ('Isaac Newton invented the cat flap.','history'),
  ('Cats walk like camels and giraffes — right feet first, then left.','behavior'),
  ('Most female cats are right-pawed; most males are left-pawed.','behavior'),
  ('Cats can''t taste sweetness — they lack sweet taste receptors.','anatomy'),
  ('A cat''s brain is 90% similar to a human brain in structure.','anatomy'),
  ('Cats rub their faces on things to mark territory with scent glands.','behavior'),
  ('A cat''s heart beats 110–140 times per minute.','anatomy'),
  ('Cats spend 30–50% of waking hours grooming themselves.','behavior'),
  ('The oldest known cat lived to be 38 years old.','records'),
  ('Cats have over 100 vocalizations — dogs only about 10.','general'),
  ('Cats can see in just 1/6 the light humans need.','abilities'),
  ('A group of kittens is called a "kindle".','general');