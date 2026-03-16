# How NavBot auth works

## Overview

Auth is handled by **[better-auth](https://better-auth.com)**. The **web app** (port 5173) talks to the **auth server** (port 3000) via the better-auth client. The server stores users and sessions in a **SQLite** database.

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web app       │  HTTP   │  Auth server      │  read/  │  SQLite DB      │
│   (React)       │ ──────► │  (Express +       │ ──────► │  (navbot.db)    │
│   auth-client   │         │   better-auth)    │  write  │  at repo root   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

- **Web**: `apps/web/src/lib/auth-client.ts` — `createAuthClient({ baseURL: "http://localhost:3000" })`. All sign-in/sign-up/sign-out calls go to the auth server.
- **Server**: `apps/server/src/auth.ts` — configures better-auth (database, email+password, Google/GitHub). `apps/server/src/index.ts` mounts `app.all("/api/auth/*", toNodeHandler(auth))`, so every path under `/api/auth/*` is handled by better-auth (e.g. `/api/auth/sign-in/email`, `/api/auth/sign-in/social`, `/api/auth/callback/google`).
- **Database**: Single shared SQLite file **`navbot.db`** at the repo root. Both the auth server and the API server connect to this database. Auth tables (`user`, `session`, `account`, `verification`) and site metadata (`site`) all live here.

---

## Where credentials are stored

### 1. Your app’s database (SQLite) — **users and sessions**

| What | Where | Notes |
|------|--------|------|
| **User record** | `navbot.db` → table `user` | `id`, `name`, `email`, `emailVerified`, `image`, timestamps. One row per user. |
| **Password hash** | Same DB → table `account` | Only for **email/password** sign-in. Column `password` stores a **hash** (better-auth uses a secure hash), not plain text. |
| **Session** | Same DB → table `session` | `token`, `userId`, `expiresAt`, etc. Used to know who is logged in. |
| **OAuth link** | Same DB → table `account` | For Google/GitHub: `providerId` (e.g. `"google"`), `accountId`, `userId`. No password stored; the provider’s tokens may be stored for API calls. |

So: **credentials** (password hash and OAuth links) are stored **only on your server**, in **`navbot.db`** at the repo root. The browser only gets a **session cookie/token** after sign-in.

### 2. OAuth provider credentials (Google / GitHub)

These are **not** stored in your app. They live in:

- **Google**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — Client ID and Client Secret. You put them in **`apps/server/.env`** as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **GitHub**: [GitHub Developer Settings](https://github.com/settings/developers) — OAuth App Client ID and Secret. You put them in **`apps/server/.env`** as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

The server uses these only to talk to Google/GitHub during the OAuth redirect flow; they are not written into SQLite.

---

## Sign-in with vs without sign-up

### Email + password

- **Sign-up**: User uses the “Sign Up” tab and submits email, password, and name. The auth server creates a row in `user` and a row in `account` with the **hashed password**.
- **Sign-in**: User uses the “Sign In” tab and submits email + password. The server checks the hash; if it matches, it creates a session.  
So for email/password, **sign-up is required first**; you cannot sign in without an account.

### Google / GitHub (OAuth)

- **First time** (“Continue with Google”):  
  - User is sent to Google, signs in there, and is redirected back to your server.  
  - better-auth **creates a new user** (and an `account` row linking that user to Google) **automatically**.  
  - No separate “Sign up with Google” step; the first click is both “sign-up” and “sign-in”.
- **Next times**: Same button. better-auth finds the existing user linked to that Google account and creates a new session.  
So for Google/GitHub, **sign-in is allowed without a prior sign-up**: the first OAuth sign-in **is** the sign-up.

Summary:

| Method        | Sign-up required before sign-in? | What happens on first use        |
|---------------|-----------------------------------|-----------------------------------|
| Email/password| Yes                               | Must use “Sign Up” first          |
| Google/GitHub | No                                | First click creates user + signs in |

---

## Flow summary

1. **Email sign-up** → POST to auth server → insert `user` + `account` (hashed password) → session created.  
2. **Email sign-in** → POST to auth server → verify password hash → session created.  
3. **Google sign-in** → redirect to Google → user signs in at Google → redirect to `/api/auth/callback/google` → better-auth creates or finds user and `account` row → session created.  
4. **Session** → stored in `session` table; the client receives a session cookie/token and uses it for `getSession()` and protected routes (e.g. dashboard).  
5. **Sign-out** → client calls `authClient.signOut()` → server invalidates the session.

All persistent credential-related data (hashed passwords, OAuth account links, sessions) lives in **`navbot.db`** at the repo root; the only “credentials” in the repo are the **OAuth app secrets** in **`apps/server/.env`** (which should not be committed).
