# Lineside

A UK railway spotting PWA. Log spots, browse the map, collect units, and share your finds.

Built with Node.js, Express, EJS, Supabase, Cloudflare R2, and MapLibre GL.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema applied
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket with a public custom domain
- A [Resend](https://resend.com) account for transactional email (verification, password reset)
- A [Sentry](https://sentry.io) project for error tracking
- (Optional) A [Sightengine](https://sightengine.com) account for automated image moderation

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/hfaulk/spotter.git
cd spotter

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set BASE_URL=http://localhost:3000 and NODE_ENV=development

# 4. Start dev server (with auto-restart)
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Deployment

### 1. Provision infrastructure

- Create a Supabase project and apply the schema from `supabase/schema.sql` via the SQL editor or Supabase CLI.
- Create a Cloudflare R2 bucket, enable public access, and point a custom domain at it.
- Set up a Resend sending domain and verify DNS records.
- Create a Sentry Node.js project and copy the DSN.

### 2. Configure environment

On your server (or in your hosting platform's environment settings):

```bash
cp .env.example .env
# Fill in all values — see .env.example for descriptions
```

Set `NODE_ENV=production` and `BASE_URL` to your public domain.

### 3. Install and start

```bash
npm install --omit=dev
npm start
```

Or with PM2 for process management:

```bash
npm install -g pm2
pm2 start server.js --name lineside --node-args="--import ./instrument.js"
pm2 save
pm2 startup
```

> **Note:** `instrument.js` must be loaded before `server.js` for Sentry to initialise correctly. The `npm start` script in `package.json` already handles this via `--import`.

### 4. Reverse proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Service worker / PWA cache busting

After each deploy, increment the cache version string in `public/sw.js` to force clients to fetch fresh assets.

---

## Environment Variables

See [`.env.example`](.env.example) for a full annotated list of all required and optional variables.

---

## Project Structure

```
spotter/
├── instrument.js          # Sentry initialisation (must load first)
├── server.js              # Express app entry point
├── public/                # Static assets (CSS, JS, icons, manifest)
│   ├── css/
│   ├── js/
│   ├── icons/
│   ├── manifest.json
│   └── sw.js              # Service worker
├── src/
│   ├── config/            # Supabase & R2 clients
│   ├── controllers/       # Route handlers
│   ├── middleware/        # Auth, rate limiters
│   ├── models/            # Database queries
│   ├── routes/            # Express routers
│   └── views/             # EJS templates
│       └── partials/      # Shared layout fragments
└── scripts/               # Build / utility scripts
```

---

## Legal

- [Privacy Policy](/privacy)
- [Terms of Service](/tos)

Data Controller: Harry Faulkner, United Kingdom.
