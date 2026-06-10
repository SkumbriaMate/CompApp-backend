# WhatsApp setup (staging / production)

No ngrok. Meta webhooks need a **public HTTPS URL** — use **Railway** for the backend. Test the full app on **Vercel staging**.

## Architecture

```
Vercel (frontend)  →  Railway (backend + webhook)  →  Supabase
                              ↑
                         Meta WhatsApp
```

| Local (`localhost`) | Staging / production |
|---------------------|----------------------|
| Web app UI | ✅ Vercel |
| API + WhatsApp webhook | ❌ use Railway URL |
| Incoming WhatsApp messages | ❌ Meta can't reach localhost |

**Local dev:** dashboard, login, invites — all work. WhatsApp **incoming** messages only work once backend is on Railway.

---

## 1. Meta Developer account

1. [developers.facebook.com](https://developers.facebook.com) → **Create App** → **Business**
2. **Add product** → **WhatsApp** → **API Setup**
3. Copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **Access token** (temporary 24h for testing) → `WHATSAPP_ACCESS_TOKEN`
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
4. **Add your phone** as a test recipient (required in Development mode)

---

## 2. Railway (staging backend)

1. [railway.app](https://railway.app) → deploy `backend/` from GitHub
2. **Generate domain** → e.g. `https://comp-app-staging.up.railway.app`
3. Set env vars:

```env
NODE_ENV=production
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
FRONTEND_URL=https://your-app-staging.vercel.app

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=pick-a-secret-string
WHATSAPP_BUSINESS_ACCOUNT_ID=...
```

4. Check: `https://YOUR-RAILWAY-URL/api/whatsapp/status`

---

## 3. Vercel (staging frontend)

1. Import repo, root directory **`frontend`**
2. Env var:

```env
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-URL
```

3. Deploy → e.g. `https://comp-app-staging.vercel.app`
4. Update Railway `FRONTEND_URL` to this Vercel URL → redeploy Railway (CORS)

**Tip:** Vercel **Preview** deployments per branch work too — set `FRONTEND_URL` on Railway to your main staging URL, or use a dedicated `staging` branch.

---

## 4. Meta webhook (one-time)

Meta → **WhatsApp** → **Configuration**:

| Field | Value |
|--------|--------|
| Callback URL | `https://YOUR-RAILWAY-URL/api/whatsapp/webhook` |
| Verify token | same as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |

Click **Verify and save** → subscribe to **messages**.

Same webhook URL for staging and production (or use separate Meta apps if you prefer).

---

## 5. Test on staging

1. Open `https://your-app-staging.vercel.app/ka/register`
2. Register company + sections
3. Dashboard → **Invitations** → invite email
4. Invite link uses `FRONTEND_URL` from Railway (must be Vercel staging URL)
5. Accept invite → name + WhatsApp number (must be in Meta test list)
6. WhatsApp: pick section → send receipt
7. Dashboard shows upload

---

## 6. Bot commands

| User sends | Bot does |
|------------|----------|
| `MENU` / `sections` / `start` | Section picker |
| Section button | Ask for receipt photo |
| Photo | Saves to dashboard |
| Unknown number | "Open invite link first" |

---

## 7. Common issues

| Problem | Fix |
|---------|-----|
| Webhook verify fails | Verify token must match exactly in Meta + Railway |
| No WhatsApp messages | Phone not in Meta test recipients list |
| CORS error on Vercel | Railway `FRONTEND_URL` must match Vercel URL exactly |
| Invite link goes to localhost | Set `FRONTEND_URL` on Railway to Vercel staging URL |
| OTP not in email | Check Railway logs — code printed when `NODE_ENV=production` too until email provider added |

---

## 8. Go live (production)

Duplicate staging setup with production URLs, or point same Railway/Vercel projects to production env vars. Submit Meta app for review when you need real users outside test numbers.

See `DEPLOYMENT.md` for full deploy checklist.
