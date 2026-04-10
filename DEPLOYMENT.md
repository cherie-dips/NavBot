# NavBot Deployment Guide

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web (Vercel)  │────▶│  API (Railway)   │◀───▶│ Auth (Railway)  │
│   Dashboard +   │     │  Chat, RAG,      │     │ better-auth     │
│   Marketing     │     │  Crawling, Widget │     │ Google OAuth    │
└─────────────────┘     └────────┬─────────┘     └────────┬────────┘
                               │                         │
                          /data/navbot.db ◀──── shared volume
                               │
                        ChromaDB Cloud
```

## Step 1: Deploy API + Auth on Railway

### 1.1 Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Empty Project"

### 1.2 Add a persistent volume

1. In the project, click "New" → "Volume"
2. Mount path: `/data`
3. This volume will be shared between API and Auth services

### 1.3 Deploy the API service

1. Click "New" → "GitHub Repo" → select your NavBot repo
2. In service settings:
   - **Root Directory**: `/` (repo root — Dockerfile handles paths)
   - **Dockerfile Path**: `apps/api/Dockerfile`
   - **Port**: `3001`
3. Add environment variables:
   ```
   PORT=3001
   DATABASE_PATH=/data/navbot.db
   SARVAM_API_KEY=<your key>
   CHROMA_HOST=api.trychroma.com
   CHROMA_API_KEY=<your key>
   CHROMA_TENANT=<your tenant>
   CHROMA_DATABASE=navbot
   SERPER_API_KEY=<your key>
   ```
4. Attach the volume (mount at `/data`)

### 1.4 Deploy the Auth service

1. Click "New" → "GitHub Repo" → select the same repo again
2. In service settings:
   - **Root Directory**: `/` (repo root)
   - **Dockerfile Path**: `apps/server/Dockerfile`
   - **Port**: `3000`
3. Add environment variables:
   ```
   PORT=3000
   DATABASE_PATH=/data/navbot.db
   BETTER_AUTH_SECRET=<generate a random string>
   BETTER_AUTH_URL=https://<your-auth-service>.railway.app
   GOOGLE_CLIENT_ID=<your Google OAuth client ID>
   GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>
   CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
   TRUSTED_ORIGINS=https://<your-vercel-domain>.vercel.app
   ```
4. Attach the **same** volume (mount at `/data`)

### 1.5 Note down your Railway URLs

After deployment, Railway gives you public URLs like:
- API: `https://navbot-api-production.up.railway.app`
- Auth: `https://navbot-auth-production.up.railway.app`

## Step 2: Deploy Web on Vercel

1. Go to [vercel.com](https://vercel.com) → "Add New Project" → import NavBot repo
2. **Framework Preset**: Vite
3. **Root Directory**: `apps/web`
4. **Build Command**: `cd ../.. && pnpm install && pnpm --filter web build`
5. **Output Directory**: `dist`
6. Add environment variables:
   ```
   VITE_API_URL=https://<your-api>.railway.app
   VITE_AUTH_URL=https://<your-auth>.railway.app
   ```
7. Deploy

## Step 3: Update Google OAuth

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth client ID
3. Add to **Authorized redirect URIs**:
   - `https://<your-auth>.railway.app/api/auth/callback/google`
4. Add to **Authorized JavaScript origins**:
   - `https://<your-vercel-domain>.vercel.app`

## Step 4: Widget Integration (for end users)

Once deployed, users embed the widget with:

```html
<!-- NavBot Chat Widget -->
<script>
  window.NAVBOT_CONFIG = {
    apiBase: "https://<your-api>.railway.app",
    siteId: "their-website.com"
  };
</script>
<script src="https://<your-api>.railway.app/widget/chat-widget.iife.js"></script>
```

**Console snippet** (for quick testing):
```js
(function(){window.NAVBOT_CONFIG={apiBase:"https://<your-api>.railway.app",siteId:"their-website.com"};var s=document.createElement("script");s.src="https://<your-api>.railway.app/widget/chat-widget.iife.js";document.body.appendChild(s);})();
```

## Environment Variables Summary

### API (Railway)
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | `3001` |
| `DATABASE_PATH` | Yes | `/data/navbot.db` |
| `SARVAM_API_KEY` | Yes | Sarvam AI for LLM + speech |
| `CHROMA_HOST` | Yes | ChromaDB cloud host |
| `CHROMA_API_KEY` | Yes | ChromaDB API key |
| `CHROMA_TENANT` | Yes | ChromaDB tenant ID |
| `CHROMA_DATABASE` | Yes | ChromaDB database name |
| `SERPER_API_KEY` | No | Serper.dev for social search |
| `WIDGET_DIST_PATH` | No | Custom path to widget dist |

### Auth Server (Railway)
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | `3000` |
| `DATABASE_PATH` | Yes | `/data/navbot.db` |
| `BETTER_AUTH_SECRET` | Yes | Random secret string |
| `BETTER_AUTH_URL` | Yes | Public URL of auth service |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth |
| `CORS_ORIGIN` | Yes | Vercel web URL |
| `TRUSTED_ORIGINS` | Yes | Vercel web URL |

### Web (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Railway API URL |
| `VITE_AUTH_URL` | Yes | Railway Auth URL |
