# 🐱 PurrfectHub - Your Ultimate Cat Paradise

> A lightning-fast, feature-rich cat website built entirely on Cloudflare's edge infrastructure. Browse thousands of cat images, create custom memes, discover breeds, and more!

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Cloudflare](https://img.shields.io/badge/cloudflare-workers-orange.svg)

## ✨ Features

### 🎨 Core Features

- **🎲 Random Cat Generator** - Get random cat images instantly
- **✏️ Custom Text Memes** - Add text to any cat image
- **🏷️ Smart Tag Filtering** - Search cats by tags with autocomplete
- **😊 Mood-Based Finder** - Find cats that match your current mood
- **📊 HTTP Status Cats** - Browse all HTTP status codes as cats
- **🐈 Breed Explorer** - Discover different cat breeds with details
- **💡 Cat Facts** - Learn fascinating facts about cats
- **📤 Upload Section** - Contribute your own cat photos

### ⚡ Technical Features

- **Edge Computing** - Runs on Cloudflare's global network (300+ cities)
- **Sub-100ms Response Times** - Lightning fast, worldwide
- **D1 Database** - SQLite at the edge for tags and uploads
- **R2 Storage** - Unlimited image storage
- **Rate Limiting** - Built-in protection against abuse
- **Lazy Loading** - Images load as you scroll
- **Progressive Enhancement** - Works without JavaScript
- **Mobile First** - Responsive design for all devices
- **Zero Configuration** - Deploy in minutes

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works!)
- 5 minutes of your time

### Installation

```bash
# Install Wrangler
npm install -g wrangler

# Clone repository
git clone https://github.com/yourusername/purrfect-hub.git
cd purrfect-hub

# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create purrfect-hub-db

# Update wrangler.toml with your database ID
# Then run migrations
wrangler d1 execute purrfect-hub-db --file=./src/db/schema.sql

# Create R2 bucket for uploads
wrangler r2 bucket create purrfect-hub-uploads

# Deploy!
npm run deploy
```

## 📖 Detailed Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions.

## 🎯 API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cats/random` | GET | Get random cat image |
| `/api/cats/with-text/:text` | GET | Cat with custom text |
| `/api/cats/by-tag/:tag` | GET | Cat filtered by tag |
| `/api/cats/gif` | GET | Random cat GIF |
| `/api/tags` | GET | Get all available tags |
| `/api/tags/search?q=:query` | GET | Search tags (autocomplete) |
| `/api/breeds` | GET | Get cat breeds |
| `/api/fact` | GET | Random cat fact |
| `/api/mood/:mood` | GET | Cat by mood (happy/sad/etc) |
| `/api/http-cats/:code` | GET | HTTP status cat |

### Protected Endpoints (Rate Limited)

| Endpoint | Method | Rate Limit | Description |
|----------|--------|------------|-------------|
| `/api/upload` | POST | 50/hour | Upload cat image |
| `/api/favorite` | POST | 100/hour | Save favorite cat |

## 💾 Database Schema

```sql
-- Core tables
tags              -- CATAAS API tags with counts
uploads           -- User-uploaded cat images
rate_limits       -- Rate limiting counters
cat_facts         -- Cached cat facts
favorites         -- User favorite cats
analytics         -- Usage analytics (optional)
```

## 🎨 Tech Stack

- **Runtime**: Cloudflare Workers (V8 isolates)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Frontend**: Vanilla JavaScript + Modern CSS
- **APIs**: 
  - [CATAAS](https://cataas.com) - Cat images with text
  - [HTTP.cat](https://http.cat) - HTTP status cats
  - [The Cat API](https://thecatapi.com) - Cat breeds

## 🏗️ Project Structure

```
purrfect-hub/
├── src/
│   ├── worker.js              # Main Cloudflare Worker
│   ├── handlers/              # API route handlers
│   │   ├── api.js
│   │   ├── cats.js
│   │   ├── tags.js
│   │   └── upload.js
│   ├── db/
│   │   ├── schema.sql        # Database schema
│   │   └── migrations/       # DB migrations
│   └── utils/
│       ├── cache.js          # Caching utilities
│       └── helpers.js        # Helper functions
├── public/
│   ├── index.html            # Frontend HTML
│   ├── styles.css            # CSS styles
│   └── app.js               # Frontend JavaScript
├── scripts/
│   └── sync-tags.js         # Sync tags from CATAAS
├── wrangler.toml            # Cloudflare config
├── package.json             # Dependencies
├── DEPLOYMENT.md            # Deployment guide
└── README.md                # This file
```

## 🔐 Security

- ✅ Rate limiting on all endpoints
- ✅ IP address hashing for privacy
- ✅ File type and size validation
- ✅ CORS properly configured
- ✅ Input sanitization
- ✅ No user passwords/auth (by design)

## 📊 Performance

- **Response Time**: < 100ms globally
- **Image Loading**: Lazy loaded with progressive enhancement
- **Database Queries**: Optimized with indexes
- **Caching**: Multi-layer (edge + browser)
- **Bundle Size**: < 50KB (minified)

## 🌍 Free Tier Limits

Perfect for personal projects! Cloudflare's free tier includes:

| Service | Free Tier Limit |
|---------|-----------------|
| Workers | 100,000 requests/day |
| D1 Database | 5GB storage + 5M reads/day |
| R2 Storage | 10GB storage |
| Bandwidth | Unlimited |

**This supports ~3,300 users per day!**

## 🎮 Usage Examples

### Get Random Cat
```javascript
fetch('/api/cats/random')
  .then(res => res.json())
  .then(data => console.log(data.data.url));
```

### Create Cat Meme
```javascript
fetch('/api/cats/with-text/Hello World')
  .then(res => res.json())
  .then(data => displayCat(data.data.url));
```

### Search Tags (Autocomplete)
```javascript
fetch('/api/tags/search?q=cut')
  .then(res => res.json())
  .then(data => console.log(data.data)); // ['cute', 'cuteness', ...]
```

### Upload Image
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('tags', 'cute,fluffy');

fetch('/api/upload', {
  method: 'POST',
  body: formData
}).then(res => res.json());
```

## 🛠️ Development

### Local Development

```bash
# Start local dev server
npm run dev

# View logs
npm run logs

# Run migrations
npm run db:migrate:local
```

### Commands

```bash
npm run dev              # Start local development
npm run deploy           # Deploy to production
npm run deploy:staging   # Deploy to staging
npm run db:migrate       # Run database migrations
npm run db:backup        # Backup database
npm run sync:tags        # Sync tags from CATAAS
npm run logs             # View production logs
npm run clean            # Clean build artifacts
```

## 🎨 Customization

### Colors

Update CSS variables in `public/index.html`:

```css
:root {
  --primary: #9D84B7;
  --secondary: #FFB347;
  --accent: #A8E6CF;
  --bg: #FFF9F0;
}
```

### Branding

- Logo: Update `.logo` class
- Favicon: Add to `public/`
- Title: Update in HTML `<title>` tag

### Features

Enable/disable features in `worker.js`:

```javascript
const FEATURES = {
  uploads: true,
  favorites: true,
  analytics: false
};
```

## 🐛 Known Issues

- None at the moment! 🎉

## 📝 Changelog

### v1.0.0 (2024)
- Initial release
- Random cat generator
- Tag filtering with autocomplete
- HTTP status cats
- Breed explorer
- Upload functionality
- Rate limiting
- Mobile responsive design

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [CATAAS](https://cataas.com) - Cat as a Service API
- [HTTP.cat](https://http.cat) - HTTP Status Cats
- [The Cat API](https://thecatapi.com) - Cat Breeds Database
- [Cloudflare Workers](https://workers.cloudflare.com) - Edge Computing Platform
- All cat lovers worldwide 🐱❤️

## 📞 Support

- **Documentation**: [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/purrfect-hub/issues)
- **Email**: your.email@example.com
- **Twitter**: [@yourhandle](https://twitter.com/yourhandle)

## 🌟 Show Your Support

Give a ⭐️ if this project helped you!

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/yourusername/purrfect-hub)
![GitHub forks](https://img.shields.io/github/forks/yourusername/purrfect-hub)
![GitHub issues](https://img.shields.io/github/issues/yourusername/purrfect-hub)

---

**Made with ❤️ and 🐱 by cat enthusiasts, for cat enthusiasts**

*P.S. - No cats were harmed in the making of this website. They were given extra treats instead.* 😸
