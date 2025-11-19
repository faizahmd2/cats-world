// scripts/sync-tags.js
// Fetches all tags from CATAAS API and syncs them to D1 database

const CATAAS_API = 'https://cataas.com';

async function syncTags() {
  console.log('🐱 PurrfectHub Tag Sync Tool');
  console.log('============================\n');
  
  console.log('📡 Fetching tags from CATAAS API...');
  
  try {
    const response = await fetch(`${CATAAS_API}/api/tags`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const tags = await response.json();
    
    console.log(`✅ Successfully fetched ${tags.length} tags!\n`);
    
    // Display sample tags
    console.log('📋 Sample tags:');
    console.log(tags.slice(0, 20).join(', '));
    console.log('\n...');
    
    // Generate SQL insert statement
    console.log('\n💾 Generating SQL insert statement...\n');
    
    const sqlValues = tags.map(tag => `('${tag.replace(/'/g, "''")}')`).join(',\n  ');
    
    const sqlStatement = `INSERT OR IGNORE INTO tags (name) VALUES\n  ${sqlValues};`;
    
    // Save to file
    const fs = require('fs');
    const filename = 'insert-tags.sql';
    fs.writeFileSync(filename, sqlStatement);
    
    console.log(`✅ SQL statement saved to: ${filename}\n`);
    
    // Show command to execute
    console.log('🚀 To insert these tags into your D1 database, run:');
    console.log(`\n  wrangler d1 execute purrfect-hub-db --file=${filename}\n`);
    
    // Or for remote database
    console.log('For production database:');
    console.log(`\n  wrangler d1 execute purrfect-hub-db --file=${filename} --remote\n`);
    
    // Display statistics
    console.log('\n📊 Statistics:');
    console.log(`  Total tags: ${tags.length}`);
    console.log(`  Unique tags: ${new Set(tags).size}`);
    console.log(`  SQL file size: ${(sqlStatement.length / 1024).toFixed(2)} KB`);
    
    // Show popular tag categories
    console.log('\n🏷️  Tag Categories (examples):');
    const categories = {
      'Colors': tags.filter(t => ['black', 'white', 'orange', 'gray', 'brown'].includes(t)),
      'Emotions': tags.filter(t => ['cute', 'funny', 'grumpy', 'happy', 'sad'].includes(t)),
      'Actions': tags.filter(t => ['sleeping', 'playing', 'eating', 'jumping'].includes(t)),
      'Features': tags.filter(t => ['fluffy', 'small', 'big', 'chubby'].includes(t))
    };
    
    for (const [category, categoryTags] of Object.entries(categories)) {
      if (categoryTags.length > 0) {
        console.log(`  ${category}: ${categoryTags.slice(0, 5).join(', ')}`);
      }
    }
    
    console.log('\n✨ Tag sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Error syncing tags:', error.message);
    process.exit(1);
  }
}

// Alternative: Direct wrangler execution
async function syncTagsDirectly() {
  console.log('🔄 Alternative: Direct sync using wrangler API\n');
  console.log('This method requires wrangler to be installed and authenticated.\n');
  
  try {
    const response = await fetch(`${CATAAS_API}/api/tags`);
    const tags = await response.json();
    
    console.log('To sync tags directly, you can use this command:\n');
    
    tags.forEach((tag, index) => {
      if (index < 10) { // Show first 10 as example
        console.log(`wrangler d1 execute purrfect-hub-db --command "INSERT OR IGNORE INTO tags (name) VALUES ('${tag.replace(/'/g, "''")}')"`);
      }
    });
    
    console.log('\n... (and so on for all tags)');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🐱 PurrfectHub Tag Sync Tool

Usage:
  node scripts/sync-tags.js [options]

Options:
  --help, -h     Show this help message
  --direct       Show direct wrangler commands
  
Description:
  Fetches all tags from CATAAS API and generates SQL to insert them
  into your D1 database. Creates an 'insert-tags.sql' file that can
  be executed with wrangler.

Example:
  node scripts/sync-tags.js
  wrangler d1 execute purrfect-hub-db --file=insert-tags.sql --remote
    `);
    process.exit(0);
  }
  
  if (args.includes('--direct')) {
    syncTagsDirectly();
  } else {
    syncTags();
  }
}

module.exports = { syncTags, syncTagsDirectly };