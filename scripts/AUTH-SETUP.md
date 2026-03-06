# Fixing "Failed to sign in with Google"

Google (and GitHub) sign-in need the **auth server** running and OAuth credentials set.

## 1. Run the auth server

From the repo root:

```bash
pnpm --filter server dev
```

This starts the server on **http://localhost:3000**. The web app (port 5173) talks to it for sign-in.

## 2. Configure Google OAuth

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create **OAuth 2.0 Client ID** (Web application).
3. Add **Authorized redirect URI**:  
   `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID and Client Secret.

Create `apps/server/.env` (or add to it):

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

Restart the server (`pnpm --filter server dev`).

## 3. Try again

With the server running and `.env` set, use **Continue with Google** on the sign-in page.  
If it still fails, the page will show a clearer error (e.g. "Sign-in service unavailable" if the server isn’t reachable).

## Optional: GitHub sign-in

In `apps/server/.env` add:

```env
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

Create an OAuth App in [GitHub Developer Settings](https://github.com/settings/developers) and set **Authorization callback URL** to:  
`http://localhost:3000/api/auth/callback/github`

## Email sign-in

Email/password sign-in works without OAuth. Use the **Sign In** form with your email and password (after signing up once).
