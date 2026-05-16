#!/usr/bin/env node
// scripts/sync.js  –  PurrfectHub data bootstrapper
// Usage:
//   node scripts/sync.js tags             # sync tags from CATAAS
//   node scripts/sync.js facts            # sync facts from catfact.ninja
//   node scripts/sync.js breeds           # sync breed tags from TheCatAPI
//   node scripts/sync.js captions         # sync captions → lulcat → cat_captions table
//   node scripts/sync.js all              # all of the above
//   node scripts/sync.js all --remote     # run against deployed D1
'use strict';

const fs   = require('fs');
const path = require('path');

const DB_NAME = 'purrfect-hub-db';
const args    = process.argv.slice(2);
const remote  = args.includes('--remote');
const type    = args.find(a => !a.startsWith('-')) || 'all';

const flag = remote ? ' --remote' : '';
const esc  = s => String(s).replace(/'/g, "''");

function save(name, sql) {
  fs.writeFileSync(path.resolve(name), sql, 'utf8');
  console.log(`\n✅ ${name}  (${(sql.length / 1024).toFixed(1)} KB)`);
  console.log(`   Run: wrangler d1 execute ${DB_NAME} --file=${name}${flag}\n`);
}

async function syncTags() {
  console.log('🏷️  Fetching tags from CATAAS…');
  const tags = await fetch('https://cataas.com/api/tags').then(r => r.json());
  const vals = [...new Set(tags)].map(t => `('${esc(t)}', 0)`).join(',\n  ');
  save('insert-tags.sql',
    `-- CATAAS tags · ${new Date().toISOString()}\n` +
    `INSERT OR IGNORE INTO tags (name, count) VALUES\n  ${vals};`
  );
}

async function syncFacts() {
  console.log('🧠 Fetching facts from catfact.ninja…');
  const facts = [];
  for (let p = 1; p <= 5; p++) {
    const j = await fetch(`https://catfact.ninja/facts?limit=100&page=${p}`).then(r => r.json());
    facts.push(...(j.data || []).map(f => f.fact));
    if ((j.data || []).length < 100) break;
  }
  const unique = [...new Set(facts)];
  const vals   = unique.map(f => `('${esc(f)}', 'catfact.ninja', 1)`).join(',\n  ');
  save('insert-facts.sql',
    `-- catfact.ninja · ${new Date().toISOString()}\n` +
    `INSERT OR IGNORE INTO cat_facts (fact, source, is_active) VALUES\n  ${vals};`
  );
}

async function syncBreeds() {
  console.log('🐈 Fetching breeds from TheCatAPI…');
  const breeds = await fetch('https://api.thecatapi.com/v1/breeds').then(r => r.json());
  const vals   = breeds
    .map(b => b.name.toLowerCase().trim())
    .filter(Boolean)
    .map(n => `('${esc(n)}', 10)`)
    .join(',\n  ');
  save('insert-breed-tags.sql',
    `-- TheCatAPI breeds · ${new Date().toISOString()}\n` +
    `INSERT OR IGNORE INTO tags (name, count) VALUES\n  ${vals};`
  );
}

// ─────────────────────────────────────────────────────────────
// syncCaptions
//
// Collects every caption source into one unique list, calls the
// popcat lulcat API once per caption (with concurrency limiting
// so we don't hammer the free endpoint), then writes a single
// INSERT OR REPLACE SQL file for the cat_captions table.
//
// Run this offline / in CI – never at runtime in the Worker.
// ─────────────────────────────────────────────────────────────
async function syncCaptions() {
  console.log('💬 Syncing captions → lulcat…');

  // ── 1. Hardcoded seed captions (same list as in index.html CAPTIONS const) ──
  const SEED_CAPTIONS = [
    'Just woke up and already judging everyone.',
    'This is my kingdom. All of it.',
    'I have knocked over 3 glasses today and I will knock over more.',
    'The sun hits different when you own it.',
    'Refusing to explain myself.',
    'My agenda for today: nap, eat, stare at wall, repeat.',
    'I was not moved by your presentation.',
    'CEO of the couch.',
    'Plotting, but make it cute.',
    'Living my soft life unbothered.',
    'This spot is mine. Has always been mine.',
    'Technically I am working from home.',
    'I do not need your validation, I need your treats.',
    'No thoughts, just head empty and vibes immaculate.',
    'I am not saying I hate your music choices, but I am going to scream until you turn it off.',
    'Look at the material. You cannot replicate this fluff.',
    'Another day of being an absolute financial burden.',
    'I saw a bug. It escaped. This house belongs to the bug now.',
    'Fill my bowl. It is half empty and I am starving.',
    'Heard you talking about "vet". Who is he and why are we visiting him?',
    'I practice boundary setting by biting your ankle.',
    'Bombastic side-eye activated.',
    'Serving pure looks and zero attitude adjustments.',
    'In my villain era.',
    'Main character energy.',
    'Existence is paw-some, but napping is better.',
    'Don\'t touch the belly. It is a trap.',
    'I am not fat, I am easy to see.',
    'Billi by birth, Nawab by choice.',
    'Purnea winters call for extra fluff.',
    'Currently out of office (under the sofa).',
    'Professional biscuit maker. 10/10 quality.',
    'I don\'t meow, I make statements.',
    'If I fits, I sits. No exceptions.',
    'You call it laziness, I call it selective participation.',
    'My meow is the only alarm clock you need.',
    'Staring at the ceiling to scare the humans.',
    'I am the "cat" in "catastrophe".',
    'Legend says I am still waiting for that treat.',
    'Treats first, questions never.',
    'Your bed? You mean my secondary nap station?',
    'I heard the fridge open from three rooms away.',
    'Is it me, or is the red dot mocking me?',
    'Just me and my 3 AM zoomies.',
    'Keeping the floor warm for absolutely no one.',
    'Sass levels: Critical.',
    'I didn\'t choose the fluff life, the fluff life chose me.',
    'I\'m not grumpy, I just have a resting cat face.',
    'Currently loading... 99% fluff.',
    'A day without a nap is a day wasted.',
  ];

  let dbCaptions = [];
  try {
    const { execSync } = require('child_process');
    const remoteFlag = remote ? ' --remote' : '';
    const sql = `SELECT DISTINCT caption FROM cats WHERE caption IS NOT NULL AND caption != '' AND status = 'active' LIMIT 200`;
    const out = execSync(
      `wrangler d1 execute ${DB_NAME}${remoteFlag} --command="${sql}" --json`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(out);
    // wrangler --json returns [{ results: [{caption: '…'}, …] }]
    dbCaptions = (parsed?.[0]?.results || [])
      .map(r => r.caption)
      .filter(Boolean);
    console.log(`   ↳ Pulled ${dbCaptions.length} caption(s) from DB`);
  } catch (e) {
    console.warn(`   ↳ Could not query DB (${e.message.split('\n')[0]}), using seed list only`);
  }

  // ── 3. Merge + deduplicate ──
  const all = [...new Set([...SEED_CAPTIONS, ...dbCaptions])];
  console.log(`   ↳ ${all.length} unique captions to process`);

  // ── 4. Call lulcat API with concurrency limit of 5 ──
  const CONCURRENCY = 5;
  const results = []; // { original, lul }

  async function lulcatify(text) {
    try {
      const encoded = encodeURIComponent(text.slice(0, 200));
      const res = await fetch(`https://api.popcat.xyz/v2/lulcat?text=${encoded}`, {
        headers: { 'User-Agent': 'PurrfectHub-Sync/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.message && json.message.text && json.message.text || text;
    } catch (e) {
      console.warn(`   ⚠  lulcat failed for "${text.slice(0, 40)}…": ${e.message}`);
      return text;
    }
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = all.slice(i, i + CONCURRENCY);
    const luls  = await Promise.all(batch.map(lulcatify));
    batch.forEach((orig, idx) => results.push({ original: orig, lul: luls[idx] }));
    process.stdout.write(`\r   ↳ processed ${Math.min(i + CONCURRENCY, all.length)}/${all.length}`);
  }
  
  const vals = results
    .map(r => `('${esc(r.original)}', '${esc(r.lul)}', CURRENT_TIMESTAMP, 1)`)
    .join(',\n  ');

  save('insert-captions.sql',
    `-- cat_captions (original + lulcat) · ${new Date().toISOString()}\n` +
    `-- Generated by: node scripts/sync.js captions\n` +
    `INSERT OR REPLACE INTO cat_captions (original_text, lul_text, synced_at, is_active) VALUES\n  ${vals};`
  );
}

async function main() {
  try {
    if (type === 'tags'     || type === 'all') await syncTags();
    if (type === 'facts'    || type === 'all') await syncFacts();
    if (type === 'breeds'   || type === 'all') await syncBreeds();
    if (type === 'captions' || type === 'all') await syncCaptions();
    console.log('✨ Sync complete!');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
}

main();