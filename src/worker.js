// ╔═══════════════════════════════════════════════════════╗
// ║          PurrfectHub – Cloudflare Worker v5           ║
// ║  D1 DB · R2 BUCKET · Unsplash API · Workers AI       ║
// ╚═══════════════════════════════════════════════════════╝

const POLLINATIONS = 'https://image.pollinations.ai/prompt';
const UNSPLASH_API = 'https://api.unsplash.com';

import dashboardHTML from './index.html';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === '/' || path === '/index.html') {
        return new Response(dashboardHTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...CORS,
          },
        });
      }

      if (path.startsWith('/r2/')) {
        const key = path.slice(4);
        const obj = await env.BUCKET.get(key);

        if (!obj) return new Response('Not Found', { status: 404 });

        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            ...CORS,
          },
        });
      }

      if (path.startsWith('/api/')) {
        const body = await routeAPI(path, req, env);
        return new Response(JSON.stringify(body), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS,
          },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response(
        JSON.stringify({
          ok: false,
          error: err.message || 'Internal error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...CORS,
          },
        }
      );
    }
  },
};

async function routeAPI(path, req, env) {
  const seg = path.split('/').filter(Boolean);
  const ep = seg[1];

  switch (ep) {
    case 'auth':
      return apiAuth(req, env);

    case 'feed':
      return apiFeed(req, env);

    case 'memes':
      return apiMemes(req, env);

    case 'upload':
      return apiUpload(req, env);

    case 'save':
      return apiSave(req, env, seg);

    case 'like':
      return apiLike(req, env);

    case 'saves':
      return apiGetSaves(req, env);

    case 'ensure-cat':
      return apiEnsureCat(req, env);

    case 'meme-save':
      return apiMemeSave(req, env);

    case 'ai-image':
      return apiAIImage(req, env);

    case 'meme-text':
      return apiMemeText(req, env);

    case 'fact':
      return apiFact(env);

    case 'captions':
      return apiCaptions(req, env);

    case 'stats':
      return apiStats(env);

    default:
      return { ok: false, error: 'Unknown endpoint' };
  }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function cleanUsername(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 40);
}

function cleanTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map(t => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12)
      .join(',');
  }

  return String(tags || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)
    .join(',');
}

function extFromContentType(contentType) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

function publicR2Url(key) {
  return `/r2/${key}`;
}

async function getUser(env, userId) {
  if (!userId) return null;

  return env.DB.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(userId).first();
}

async function createCatFromBlob(env, opts) {
  const {
    blob,
    contentType = 'image/jpeg',
    creatorId = null,
    source = 'upload',
    type = 'cat',
    tags = '',
    title = '',
    caption = '',
    sourceUrl = '',
    memeTop = '',
    memeBottom = '',
    memePosition = '',
  } = opts;

  const id = crypto.randomUUID();
  const ext = extFromContentType(contentType);
  const folder = type === 'meme'
    ? 'memes'
    : type === 'upload'
      ? 'uploads'
      : type === 'generated'
        ? 'generated'
        : 'cats';

  const key = `${folder}/${id}.${ext}`;
  const arr = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();

  await env.BUCKET.put(key, arr, {
    httpMetadata: { contentType },
  });

  const imageUrl = publicR2Url(key);

  await env.DB.prepare(
    `INSERT INTO cats (
      id, creator_id, r2_key, image_url, source_url, source, type,
      tags, title, caption, meme_top, meme_bottom, meme_position,
      likes, views, status, created_at, modified_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    creatorId,
    key,
    imageUrl,
    sourceUrl || imageUrl,
    source,
    type,
    cleanTags(tags),
    title,
    caption,
    memeTop,
    memeBottom,
    memePosition
  ).run();

  return {
    id,
    creator_id: creatorId,
    r2_key: key,
    image_url: imageUrl,
    source_url: sourceUrl || imageUrl,
    source,
    type,
    tags: cleanTags(tags),
    title,
    caption,
    likes: 0,
  };
}

async function createCatFromExternalUrl(env, opts) {
  const {
    url,
    creatorId,
    tags = '',
    source = 'cataas',
    type = 'cat',
    title = '',
    caption = '',
  } = opts;

  if (!url) throw new Error('Image URL required');

  const imgRes = await fetch(url, {
    headers: {
      'User-Agent': 'PurrfectHub/1.0',
    },
  });

  if (!imgRes.ok) {
    throw new Error(`Could not fetch image: HTTP ${imgRes.status}`);
  }

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  if (!contentType.startsWith('image/')) {
    throw new Error('URL did not return an image');
  }

  const arr = await imgRes.arrayBuffer();

  return createCatFromBlob(env, {
    blob: arr,
    contentType,
    creatorId,
    source,
    type,
    tags,
    title,
    caption,
    sourceUrl: url,
  });
}

async function ensureStableCat(env, body) {
  const userId = body.userId || body.creatorId || null;

  if (userId) {
    const user = await getUser(env, userId);
    if (!user) throw new Error('Invalid user. Please sign in again.');
  }

  const catId = body.catId || '';

  if (catId && !String(catId).startsWith('live-')) {
    const existing = await env.DB.prepare(
      `SELECT id, creator_id, r2_key, image_url, source_url, source, type,
              tags, title, caption, likes, views, status, created_at, modified_at
       FROM cats
       WHERE id = ? AND status = 'active'`
    ).bind(catId).first();

    if (existing) return existing;
  }

  const catUrl = body.catUrl || body.imageUrl || '';

  if (!catUrl) {
    throw new Error('catUrl required');
  }

  // If frontend sends a blob/form to /api/upload or /api/meme-save, those endpoints create directly.
  // This path is for action on external API image URL.
  return createCatFromExternalUrl(env, {
    url: catUrl,
    creatorId: userId,
    tags: body.tags || '',
    source: body.source || 'cataas',
    type: body.type || 'cat',
    title: body.title || '',
    caption: body.caption || '',
  });
}

function rowToCat(row) {
  return {
    id: row.id,
    creatorId: row.creator_id || null,
    creatorUsername: row.creator_username || null,
    url: row.image_url,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    source: row.source,
    type: row.type,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    title: row.title || '',
    caption: row.caption || '',
    memeTop: row.meme_top || '',
    memeBottom: row.meme_bottom || '',
    memePosition: row.meme_position || '',
    likes: row.likes || 0,
    views: row.views || 0,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    stable: true,
    fromApi: false,
    userLiked: false,
    userSaved: false,
  };
}

// ═══════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════

async function apiAuth(req, env) {
  if (req.method !== 'POST') return { ok: false, error: 'POST only' };

  const body = await req.json().catch(() => ({}));
  const username = cleanUsername(body.username);
  const password = String(body.password || '').trim();

  if (!username) return { ok: false, error: 'Username required' };
  if (!password) return { ok: false, error: 'Password required' };

  const existing = await env.DB.prepare(
    'SELECT id, username, password FROM users WHERE username = ?'
  ).bind(username).first();

  if (existing) {
    if (existing.password !== password) {
      return {
        ok: false,
        code: 'PASSWORD_INCORRECT',
        error: 'Password is incorrect. Choose a different username or enter the correct password.',
      };
    }

    await env.DB.prepare(
      'UPDATE users SET modified_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(existing.id).run();

    return {
      ok: true,
      data: {
        id: existing.id,
        username: existing.username,
      },
    };
  }

  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users (id, username, password)
     VALUES (?, ?, ?)`
  ).bind(id, username, password).run();

  return {
    ok: true,
    data: {
      id,
      username,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// Feed
// ═══════════════════════════════════════════════════════════

// Pick a random caption from DB captions table
async function getRandomCaption(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT original_text FROM cat_captions WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1`
    ).first();
    return row?.original_text || '';
  } catch {
    return '';
  }
}

// Fetch multiple captions at once for efficiency
async function getRandomCaptions(env, count) {
  try {
    const res = await env.DB.prepare(
      `SELECT original_text FROM cat_captions WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?`
    ).bind(count).all();
    return (res.results || []).map(r => r.original_text).filter(Boolean);
  } catch {
    return [];
  }
}

// Normalize an Unsplash photo object to our feed item shape
function unsplashToFeedItem(photo, caption) {
  const tags = [];
  // Derive tags from alt_description and description
  const desc = (photo.alt_description || photo.description || '').toLowerCase();
  for (const kw of ['kitten', 'fluffy', 'orange', 'black', 'white', 'sleeping', 'cute', 'funny', 'tabby', 'calico', 'ginger', 'stray']) {
    if (desc.includes(kw)) tags.push(kw);
  }
  if (!tags.length) tags.push('cat');

  return {
    id: `unsplash-${photo.id}`,
    url: photo.urls?.regular || photo.urls?.small || '',
    imageUrl: photo.urls?.regular || photo.urls?.small || '',
    sourceUrl: photo.links?.html || '',
    source: 'unsplash',
    type: 'cat',
    tags,
    title: photo.alt_description || 'Cat photo',
    caption: caption || photo.description || '',
    likes: photo.likes || 0,
    views: photo.views || 0,
    stable: false,            // must be uploaded to R2 before meme/like
    fromApi: true,
    unsplashId: photo.id,
    photographer: photo.user?.name || '',
    photographerUrl: photo.user?.links?.html || '',
  };
}

async function apiFeed(req, env) {
  const url = new URL(req.url);
  const tag = url.searchParams.get('tag') || '';
  const lim = Math.min(40, Math.max(4, parseInt(url.searchParams.get('limit') || '20')));
  const userId = url.searchParams.get('userId') || '';

  // ── 1. DB items (up to half the limit) ──────────────────
  let rows = [];
  try {
    if (tag) {
      const res = await env.DB.prepare(
        `SELECT c.*, u.username AS creator_username FROM cats c
         LEFT JOIN users u ON u.id = c.creator_id
         WHERE c.status = 'active' AND c.type != 'meme' AND c.tags LIKE ?
         ORDER BY RANDOM() LIMIT ?`
      ).bind(`%${tag}%`, lim).all();
      rows = res.results || [];
    } else {
      const res = await env.DB.prepare(
        `SELECT c.*, u.username AS creator_username FROM cats c
         LEFT JOIN users u ON u.id = c.creator_id
         WHERE c.status = 'active' AND c.type != 'meme'
         ORDER BY RANDOM() LIMIT ?`
      ).bind(lim).all();
      rows = res.results || [];
    }
  } catch { rows = []; }

  // Limit DB to at most half so there's always room for API items
  const dbHalf = Math.min(rows.length, Math.ceil(lim / 2));
  const dbRows = rows.slice(0, dbHalf);
  let dbItems = dbRows.map(rowToCat);

  // ── 2. Fetch user's liked/saved cat IDs if logged in ────
  let likedIds = new Set();
  let savedIds = new Set();
  if (userId) {
    try {
      const [likedRes, savedRes] = await Promise.all([
        env.DB.prepare(
          `SELECT cat_id FROM favorites WHERE user_id = ? AND status = 'liked'`
        ).bind(userId).all(),
        env.DB.prepare(
          `SELECT cat_id FROM favorites WHERE user_id = ? AND status = 'active'`
        ).bind(userId).all(),
      ]);
      likedIds = new Set((likedRes.results || []).map(r => r.cat_id));
      savedIds = new Set((savedRes.results || []).map(r => r.cat_id));
    } catch { /* non-fatal */ }
  }

  // Attach userLiked / userSaved to DB items
  dbItems = dbItems.map(item => ({
    ...item,
    userLiked: likedIds.has(item.id),
    userSaved: savedIds.has(item.id),
  }));

  // ── 3. Unsplash items ────────────────────────────────────
  const apiCount = lim - dbItems.length;
  let apiItems = [];

  if (apiCount > 0 && env.unsplash_client_id) {
    try {
      const query = tag && tag !== 'All' ? `cats ${tag}` : 'cats';
      const unsplashUrl = `${UNSPLASH_API}/photos/random?client_id=${env.unsplash_client_id}&count=${apiCount}&query=${encodeURIComponent(query)}`;
      const res = await fetch(unsplashUrl, { headers: { 'Accept-Version': 'v1' } });

      if (res.ok) {
        const photos = await res.json();
        const captions = await getRandomCaptions(env, Math.max(photos.length, 1));
        apiItems = photos.map((photo, i) => ({
          ...unsplashToFeedItem(photo, captions[i % captions.length] || ''),
          // Always 0 for API items — real likes only tracked after upload to DB
          likes: 0,
          userLiked: false,
          userSaved: false,
        }));
      }
    } catch { /* silently skip */ }
  }

  // ── 4. Merge + shuffle ───────────────────────────────────
  const merged = [...dbItems, ...apiItems];
  merged.sort(() => Math.random() - 0.5);

  return {
    ok: true,
    data: merged,
    hasMore: true,
  };
}

async function apiMemes(req, env) {
  const url = new URL(req.url);
  const lim = Math.min(30, Math.max(6, parseInt(url.searchParams.get('limit') || '18')));
  const userId = url.searchParams.get('userId') || '';

  const res = await env.DB.prepare(
    `SELECT c.*, u.username AS creator_username
     FROM cats c
     LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.status = 'active' AND c.type = 'meme'
     ORDER BY c.created_at DESC
     LIMIT ?`
  ).bind(lim).all();

  let items = (res.results || []).map(rowToCat);

  if (userId) {
    try {
      const [likedRes, savedRes] = await Promise.all([
        env.DB.prepare(`SELECT cat_id FROM favorites WHERE user_id = ? AND status = 'liked'`).bind(userId).all(),
        env.DB.prepare(`SELECT cat_id FROM favorites WHERE user_id = ? AND status = 'active'`).bind(userId).all(),
      ]);
      const likedIds = new Set((likedRes.results || []).map(r => r.cat_id));
      const savedIds = new Set((savedRes.results || []).map(r => r.cat_id));
      items = items.map(item => ({ ...item, userLiked: likedIds.has(item.id), userSaved: savedIds.has(item.id) }));
    } catch { /* non-fatal */ }
  }

  return { ok: true, data: items };
}

// ═══════════════════════════════════════════════════════════
// Upload
// ═══════════════════════════════════════════════════════════

async function apiUpload(req, env) {
  if (req.method !== 'POST') return { ok: false, error: 'POST only' };

  const form = await req.formData();
  const file = form.get('file');
  const userId = String(form.get('userId') || '');
  const tags = String(form.get('tags') || '');
  const title = String(form.get('title') || '');
  const caption = String(form.get('caption') || form.get('note') || '');

  if (!file) return { ok: false, error: 'No file provided' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Images only' };
  if (file.size > 6 * 1024 * 1024) return { ok: false, error: 'File too large. Max 6 MB.' };

  if (userId) {
    const user = await getUser(env, userId);
    if (!user) return { ok: false, error: 'Invalid user. Please sign in again.' };
  }

  const cat = await createCatFromBlob(env, {
    blob: file,
    contentType: file.type || 'image/jpeg',
    creatorId: userId || null,
    source: 'upload',
    type: 'upload',
    tags,
    title,
    caption,
  });

  return {
    ok: true,
    data: rowToCat({
      ...cat,
      creator_id: cat.creator_id,
      image_url: cat.image_url,
      source_url: cat.source_url,
      meme_top: '',
      meme_bottom: '',
      meme_position: '',
      views: 0,
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
    }),
  };
}

// ═══════════════════════════════════════════════════════════
// Ensure external API cat becomes stable R2 cat
// ═══════════════════════════════════════════════════════════

async function apiEnsureCat(req, env) {
  if (req.method !== 'POST') return { ok: false, error: 'POST only' };

  try {
    const body = await req.json().catch(() => ({}));
    const cat = await ensureStableCat(env, body);

    return {
      ok: true,
      data: rowToCat({
        ...cat,
        meme_top: cat.meme_top || '',
        meme_bottom: cat.meme_bottom || '',
        meme_position: cat.meme_position || '',
        created_at: cat.created_at || new Date().toISOString(),
        modified_at: cat.modified_at || new Date().toISOString(),
      }),
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || 'Could not save cat',
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Like + Save
// ═══════════════════════════════════════════════════════════

async function apiLike(req, env) {
  if (req.method !== 'POST') return { ok: false, error: 'POST only' };

  const body = await req.json().catch(() => ({}));
  const userId = body.userId || '';

  if (!userId) return { ok: false, error: 'Login required' };

  const user = await getUser(env, userId);
  if (!user) return { ok: false, error: 'Invalid user. Please sign in again.' };

  const cat = await ensureStableCat(env, { ...body, userId });

  // Check for existing 'liked' row (likes are separate from saves)
  const existingLike = await env.DB.prepare(
    `SELECT id, status FROM favorites WHERE user_id = ? AND cat_id = ? AND status = 'liked'`
  ).bind(userId, cat.id).first();

  if (existingLike) {
    // Toggle off — unlike
    await env.DB.prepare(
      `DELETE FROM favorites WHERE id = ?`
    ).bind(existingLike.id).run();

    await env.DB.prepare(
      `UPDATE cats SET likes = MAX(0, COALESCE(likes, 0) - 1), modified_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(cat.id).run();

    const updated = await env.DB.prepare(`SELECT * FROM cats WHERE id = ?`).bind(cat.id).first();
    return { ok: true, data: { ...rowToCat(updated), userLiked: false, unliked: true } };
  }

  // Like
  await env.DB.prepare(
    `INSERT OR IGNORE INTO favorites (id, user_id, cat_id, status) VALUES (?, ?, ?, 'liked')`
  ).bind(crypto.randomUUID(), userId, cat.id).run();

  await env.DB.prepare(
    `UPDATE cats SET likes = COALESCE(likes, 0) + 1, modified_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(cat.id).run();

  const updated = await env.DB.prepare(`SELECT * FROM cats WHERE id = ?`).bind(cat.id).first();
  return { ok: true, data: { ...rowToCat(updated), userLiked: true } };
}

async function apiSave(req, env, seg) {
  if (req.method === 'DELETE') {
    const favId = seg[2];
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || '';

    if (!favId || !userId) {
      return { ok: false, error: 'favorite id and userId required' };
    }

    const fav = await env.DB.prepare(
      `SELECT cat_id FROM favorites
       WHERE id = ? AND user_id = ? AND status = 'active'`
    ).bind(favId, userId).first();

    if (fav) {
      await env.DB.prepare(
        `UPDATE favorites SET status = 'removed'
         WHERE id = ? AND user_id = ?`
      ).bind(favId, userId).run();
    }

    return { ok: true };
  }

  if (req.method !== 'POST') return { ok: false, error: 'POST or DELETE only' };

  const body = await req.json().catch(() => ({}));
  const userId = body.userId || '';

  if (!userId) return { ok: false, error: 'Login required' };

  const user = await getUser(env, userId);
  if (!user) return { ok: false, error: 'Invalid user. Please sign in again.' };

  const cat = await ensureStableCat(env, { ...body, userId });

  // Only look at 'active' saves, not 'liked' rows
  const existing = await env.DB.prepare(
    `SELECT id, status FROM favorites
     WHERE user_id = ? AND cat_id = ? AND status IN ('active', 'removed')`
  ).bind(userId, cat.id).first();

  if (existing) {
    if (existing.status === 'active') {
      const updated = await env.DB.prepare(`SELECT * FROM cats WHERE id = ?`).bind(cat.id).first();
      return { ok: true, data: { favoriteId: existing.id, ...rowToCat(updated), alreadySaved: true } };
    }
    // Re-activate removed save
    await env.DB.prepare(
      `UPDATE favorites SET status = 'active' WHERE id = ?`
    ).bind(existing.id).run();

    const updated = await env.DB.prepare(`SELECT * FROM cats WHERE id = ?`).bind(cat.id).first();
    return { ok: true, data: { favoriteId: existing.id, ...rowToCat(updated), alreadySaved: false } };
  }

  const favId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO favorites (id, user_id, cat_id, status) VALUES (?, ?, ?, 'active')`
  ).bind(favId, userId, cat.id).run();

  const updated = await env.DB.prepare(`SELECT * FROM cats WHERE id = ?`).bind(cat.id).first();
  return { ok: true, data: { favoriteId: favId, ...rowToCat(updated) } };
}

async function apiGetSaves(req, env) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';

  if (!userId) {
    return { ok: true, data: [] };
  }

  const res = await env.DB.prepare(
    `SELECT
       f.id AS favorite_id,
       f.created_at AS favorite_created_at,
       c.*
     FROM favorites f
     JOIN cats c ON c.id = f.cat_id
     WHERE f.user_id = ?
       AND f.status = 'active'
       AND c.status = 'active'
     ORDER BY f.created_at DESC
     LIMIT 200`
  ).bind(userId).all();

  const data = (res.results || []).map(row => ({
    favoriteId: row.favorite_id,
    favoriteCreatedAt: row.favorite_created_at,
    ...rowToCat(row),
  }));

  return {
    ok: true,
    data,
  };
}

// ═══════════════════════════════════════════════════════════
// Meme save
// ═══════════════════════════════════════════════════════════

async function apiMemeSave(req, env) {
  if (req.method !== 'POST') return { ok: false, error: 'POST only' };

  const form = await req.formData();
  const file = form.get('file');
  const userId = String(form.get('userId') || '');
  const baseCatId = String(form.get('baseCatId') || '');
  const tags = String(form.get('tags') || 'meme,funny,cat');
  const title = String(form.get('title') || 'Fresh cat meme');
  const caption = String(form.get('caption') || '');
  const memeTop = String(form.get('memeTop') || '');
  const memeBottom = String(form.get('memeBottom') || '');
  const memePosition = String(form.get('memePosition') || 'classic');

  if (!file) return { ok: false, error: 'No meme image provided' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Images only' };

  if (userId) {
    const user = await getUser(env, userId);
    if (!user) return { ok: false, error: 'Invalid user. Please sign in again.' };
  }

  const cat = await createCatFromBlob(env, {
    blob: file,
    contentType: file.type || 'image/jpeg',
    creatorId: userId || null,
    source: 'meme',
    type: 'meme',
    tags,
    title,
    caption,
    memeTop,
    memeBottom,
    memePosition,
  });

  if (userId) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO favorites (id, user_id, cat_id, status)
       VALUES (?, ?, ?, 'active')`
    ).bind(crypto.randomUUID(), userId, cat.id).run();
  }

  return {
    ok: true,
    data: {
      ...cat,
      baseCatId,
      url: cat.image_url,
      imageUrl: cat.image_url,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// AI image
// ═══════════════════════════════════════════════════════════

async function apiAIImage(req, env) {
  const url = new URL(req.url);
  const prompt = (url.searchParams.get('prompt') || 'cute cat').slice(0, 300);
  const full = `cat, ${prompt}`;
  const imgUrl = `${POLLINATIONS}/${encodeURIComponent(full)}?width=768&height=768&nologo=true&seed=${Date.now()}`;

  return {
    ok: true,
    data: {
      url: imgUrl,
      prompt,
    },
  };
}

async function apiMemeText(req, env) {
  const url = new URL(req.url);
  const tags = url.searchParams.get('tags') || 'cute cat';

  let top = '';
  let bottom = '';

  try {
    const ai = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [{
        role: 'user',
        content: `Write a funny two-line cat meme caption for a photo tagged: ${tags}.
Reply ONLY with JSON: {"top":"<top text>","bottom":"<bottom text>"}
Keep each line under 8 words. All caps. No quotes in the text.`,
      }],
      max_tokens: 80,
    });

    const txt = ai.response || '';
    const json = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}');
    top = String(json.top || '').slice(0, 60);
    bottom = String(json.bottom || '').slice(0, 60);
  } catch {
    const fallbacks = [
      ['ME AT 2AM', 'DEBUGGING ONE CSS BUG'],
      ['WHEN FOOD OPENS', 'I TELEPORT'],
      ['I AM NOT LAZY', 'I AM ENERGY EFFICIENT'],
      ['DESI CAT MODE', 'FULL NAWABI ATTITUDE'],
    ];
    const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    top = pick[0];
    bottom = pick[1];
  }

  return {
    ok: true,
    data: {
      top,
      bottom,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// Captions – pure DB read; lulcat is pre-processed by sync.js
// ═══════════════════════════════════════════════════════════

async function apiCaptions(req, env) {
  // Read from the cat_captions table which was populated by:
  //   node scripts/sync.js captions [--remote]
  // Both original_text and lul_text are stored there so the
  // Worker never has to call the popcat API at runtime.
  const res = await env.DB.prepare(
    `SELECT original_text, lul_text
     FROM cat_captions
     WHERE is_active = 1
     ORDER BY RANDOM()
     LIMIT 100`
  ).all();

  const rows = res.results || [];

  // Send both lists separately so the frontend can choose freely
  const captions = rows.map(r => r.original_text).filter(Boolean);
  const lulcats  = rows.map(r => r.lul_text).filter(t => t && t.trim());

  return {
    ok: true,
    data: { captions, lulcats },
  };
}

// ═══════════════════════════════════════════════════════════
// Facts + stats
// ═══════════════════════════════════════════════════════════

async function apiFact(env) {
  const r = await env.DB.prepare(
    `SELECT fact
     FROM cat_facts
     WHERE is_active = 1
     ORDER BY RANDOM()
     LIMIT 1`
  ).first();

  return {
    ok: true,
    data: {
      fact: r?.fact || 'Cats are liquid 🐱',
    },
  };
}

async function apiStats(env) {
  const [cats, memes, favs, users] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM cats WHERE status = 'active'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM cats WHERE status = 'active' AND type = 'meme'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM favorites WHERE status = 'active'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM users`).first(),
  ]);

  return {
    ok: true,
    data: {
      cats: cats?.n || 0,
      memes: memes?.n || 0,
      saves: favs?.n || 0,
      users: users?.n || 0,
    },
  };
}