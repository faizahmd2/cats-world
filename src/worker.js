import dashboardHTML from './index.html';

const CATAAS_API = 'https://cataas.com';
const CAT_API = 'https://api.thecatapi.com/v1';

// Rate limiting configuration
const RATE_LIMITS = {
  api: { requests: 100, window: 60 }, // 100 req/min
  upload: { requests: 50, window: 3600 }, // 50 req/hour
  sync: { requests: 10, window: 3600 } // 10 req/hour
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Serve static HTML for root
      if (path === '/' || path === '/index.html') {
        return new Response(dashboardHTML, {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      // API routes
      if (path.startsWith('/api/')) {
        const response = await handleAPI(path, request, env);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Serve static assets
      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  // Scheduled task to sync tags
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncTagsFromCataas(env));
  }
};

// API Handler
async function handleAPI(path, request, env) {
  const segments = path.split('/').filter(Boolean);
  const endpoint = segments[1]; // 'api' is segments[0]

  // Rate limiting
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limitType = endpoint === 'upload' ? 'upload' : 'api';
  
  const rateLimitPassed = await checkRateLimit(env, clientIP, limitType);
  if (!rateLimitPassed) {
    return {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: RATE_LIMITS[limitType].window
      }
    };
  }

  // Route handling
  switch (endpoint) {
    case 'tags':
      return await handleTags(segments, request, env);
    case 'upload':
      return await handleUpload(request, env);
    case 'breeds':
      return await handleBreeds(env);
    case 'fact':
      return await handleFact(env);
    case 'http-cats':
      return await handleHTTPCats(segments);
    case 'favorite':
      return await handleFavorite(request, env);
    default:
      return { success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } };
  }
}

// Rate Limiting
async function checkRateLimit(env, clientIP, type) {
    return true; // Disabled for development
  const key = `${type}:${clientIP}`;
  const limit = RATE_LIMITS[type];
  const now = Date.now();
  
  try {
    const result = await env.DB.prepare(
      'SELECT count, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first();

    if (!result) {
      await env.DB.prepare(
        'INSERT INTO rate_limits (key, count, window_start, last_request) VALUES (?, 1, ?, ?)'
      ).bind(key, now, now).run();
      return true;
    }

    const windowStart = new Date(result.window_start).getTime();
    const windowElapsed = (now - windowStart) / 1000;

    if (windowElapsed > limit.window) {
      // Reset window
      await env.DB.prepare(
        'UPDATE rate_limits SET count = 1, window_start = ?, last_request = ? WHERE key = ?'
      ).bind(now, now, key).run();
      return true;
    }

    if (result.count >= limit.requests) {
      return false;
    }

    await env.DB.prepare(
      'UPDATE rate_limits SET count = count + 1, last_request = ? WHERE key = ?'
    ).bind(now, key).run();
    return true;

  } catch (error) {
    console.error('Rate limit check error:', error);
    return true; // Fail open
  }
}

// Tag Handlers
async function handleTags(segments, request, env) {
  const action = segments[2];

  if (action === 'search') {
    const query = new URL(request.url).searchParams.get('q');
    if (!query) {
      return { success: false, error: { code: 'MISSING_QUERY', message: 'Query is required' } };
    }

    const tags = await env.DB.prepare(
      'SELECT name, count FROM tags WHERE name LIKE ? ORDER BY count DESC LIMIT 10'
    ).bind(`%${query}%`).all();

    return {
      success: true,
      data: tags.results || []
    };
  }

  // Get all tags
  const tags = await env.DB.prepare(
    'SELECT name, count FROM tags ORDER BY count DESC'
  ).all();

  return {
    success: true,
    data: tags.results || [],
    cached: true
  };
}

// Upload Handler
async function handleUpload(request, env) {
  if (request.method !== 'POST') {
    return { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' } };
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const tags = formData.get('tags') || '';

    if (!file) {
      return { success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } };
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 5MB' } };
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return { success: false, error: { code: 'INVALID_TYPE', message: 'Only images allowed' } };
    }

    // Generate unique ID
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop();
    const filename = `${id}.${ext}`;

    // Upload to R2
    await env.BUCKET.put(filename, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    // Store metadata in D1
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await hashIP(clientIP);

    await env.DB.prepare(
      'INSERT INTO uploads (id, filename, tags, ip_hash) VALUES (?, ?, ?, ?)'
    ).bind(id, filename, tags, ipHash).run();

    return {
      success: true,
      data: {
        id: id,
        url: `/uploads/${filename}`,
        message: 'Upload successful!'
      }
    };

  } catch (error) {
    console.error('Upload error:', error);
    return { success: false, error: { code: 'UPLOAD_FAILED', message: 'Upload failed' } };
  }
}

// Breed Handler
async function handleBreeds(env) {
  // Cache breeds for 1 day
  const cached = await env.DB.prepare(
    'SELECT * FROM cat_facts WHERE source = "breeds" AND cached_at > datetime("now", "-1 day")'
  ).first();

  if (cached) {
    return { success: true, data: JSON.parse(cached.fact), cached: true };
  }

  try {
    const response = await fetch(`${CAT_API}/breeds`, {
      headers: { 'x-api-key': env.CAT_API_KEY || '' }
    });
    const breeds = await response.json();

    // Cache in DB
    await env.DB.prepare(
      'INSERT OR REPLACE INTO cat_facts (source, fact) VALUES (?, ?)'
    ).bind('breeds', JSON.stringify(breeds.slice(0, 20))).run();

    return { success: true, data: breeds.slice(0, 20) };
  } catch (error) {
    return { success: false, error: { code: 'API_ERROR', message: 'Failed to fetch breeds' } };
  }
}

// Cat Fact Handler
async function handleFact(env) {
  const facts = [
    "Cats sleep 70% of their lives, which means a 9-year-old cat has been awake for only three years!",
    "A group of cats is called a 'clowder' and a group of kittens is called a 'kindle'.",
    "Cats can rotate their ears 180 degrees and can hear sounds up to 64 kHz!",
    "A cat's nose print is unique, similar to human fingerprints.",
    "Cats have over 20 vocalizations, including the purr, meow, chirp, and hiss.",
    "The first cat in space was French cat Felicette in 1963.",
    "Cats can jump up to six times their length in a single bound!",
    "A cat's whiskers are generally about the same width as their body.",
    "Cats spend nearly 1/3 of their waking hours cleaning themselves.",
    "The oldest known cat lived to be 38 years old!"
  ];

  const randomFact = facts[Math.floor(Math.random() * facts.length)];
  return { success: true, data: { fact: randomFact } };
}

// Mood Handler
async function handleMood(segments, env) {
  const mood = segments[2];
  const moodTags = {
    happy: 'cute,funny',
    sad: 'cute,sleep',
    angry: 'funny,grumpy',
    curious: 'cute',
    sleepy: 'sleep,cute',
    excited: 'funny,cute'
  };

  const tags = moodTags[mood] || 'cute';
  return {
    success: true,
    data: {
      url: `${CATAAS_API}/cat?tags=${tags}`,
      mood: mood,
      tags: tags
    }
  };
}

// HTTP Cats Handler
async function handleHTTPCats(segments) {
  const code = segments[2];
  if (!code) {
    return { success: false, error: { code: 'MISSING_CODE', message: 'Status code required' } };
  }

  return {
    success: true,
    data: {
      url: `https://http.cat/${code}`,
      statusCode: code
    }
  };
}

// Favorite Handler
async function handleFavorite(request, env) {
  if (request.method !== 'POST') {
    return { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' } };
  }

  const body = await request.json();
  const { catUrl, tags } = body;

  if (!catUrl) {
    return { success: false, error: { code: 'MISSING_URL', message: 'Cat URL required' } };
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO favorites (id, cat_url, tags) VALUES (?, ?, ?)'
  ).bind(id, catUrl, tags || '').run();

  return { success: true, data: { id: id, message: 'Favorite saved!' } };
}

// Sync tags from CATAAS (runs on schedule)
async function syncTagsFromCataas(env) {
  try {
    const response = await fetch(`${CATAAS_API}/api/tags`);
    const tags = await response.json();

    for (const tag of tags) {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO tags (name, count, last_synced) VALUES (?, 0, datetime("now"))'
      ).bind(tag).run();
    }

    console.log(`Synced ${tags.length} tags from CATAAS`);
  } catch (error) {
    console.error('Tag sync error:', error);
  }
}

// Utility: Hash IP for privacy
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
