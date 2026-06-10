# Deploy — Vercel + Railway

No ngrok. WhatsApp webhooks go straight to Railway.

## Staging (recommended first)

Use this to test everything including WhatsApp before production.

| Step | Service | Action |
|------|---------|--------|
| 1 | **Supabase** | Same project or a staging project — run `database/*.sql`, create `receipts` bucket |
| 2 | **Railway** | New project → deploy `backend/` → get public URL |
| 3 | **Vercel** | Deploy `frontend/` → set `NEXT_PUBLIC_API_URL` = Railway URL |
| 4 | **Railway** | Set `FRONTEND_URL` = Vercel staging URL → redeploy |
| 5 | **Meta** | Webhook → `https://RAILWAY-URL/api/whatsapp/webhook` |

### Railway env (staging)

```env
PORT=4000
NODE_ENV=production

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

FRONTEND_URL=https://comp-app-staging.vercel.app

OTP_EXPIRY_MINUTES=10
SESSION_DAYS=7

WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-secret
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

### Vercel env (staging)

```env
NEXT_PUBLIC_API_URL=https://comp-app-staging.up.railway.app
```

### Verify

- `https://RAILWAY-URL/api/health` → OK
- `https://RAILWAY-URL/api/whatsapp/status` → configured
- Register + login on Vercel URL
- Meta webhook shows green ✓

WhatsApp details: `WHATSAPP-SETUP.md`

---

## Production

Same as staging with production URLs (or separate Railway/Vercel projects).

| Service | Host |
|---------|------|
| Frontend | Vercel |
| Backend + webhook | Railway |
| Database | Supabase |

### Railway (production)

```env
FRONTEND_URL=https://your-app.vercel.app
# ... same vars as staging, production Supabase if separate
```

### Vercel (production)

```env
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
```

---

## Local development

| Works locally | Needs staging |
|---------------|---------------|
| UI, login, dashboard, invites | WhatsApp incoming webhook |
| API at `localhost:4000` | Meta → public Railway URL |

Keep local `.env`:

**frontend/.env**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**backend/.env**
```env
FRONTEND_URL=http://localhost:3000
# WhatsApp vars optional locally — outgoing messages log as [WhatsApp mock]
```

---

## Checklist

- [ ] Supabase tables + `receipts` bucket
- [ ] Railway backend live with public URL
- [ ] Vercel frontend with `NEXT_PUBLIC_API_URL`
- [ ] Railway `FRONTEND_URL` = Vercel URL (CORS)
- [ ] Meta webhook verified on Railway URL
- [ ] Test phone added in Meta (Development mode)

## Code

No extra deploy code. Frontend → `NEXT_PUBLIC_API_URL` only. Secrets stay on Railway.

Optional later: email for OTP, Meta app review, custom domains.
