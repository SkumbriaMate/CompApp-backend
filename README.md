# CompApp Backend

Express API for CompApp — Telegram webhooks, server-side logic, and Supabase service-role access.

## Structure

```
src/
├── index.ts           # Server entry
├── app.ts             # Express app setup
├── routes/            # Route handlers
├── middleware/        # Auth, error handling
├── services/          # Business logic (expenses, telegram, etc.)
└── lib/
    └── supabase.ts    # Supabase admin client (service role)
```

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Runs at [http://localhost:4000](http://localhost:4000).

## Endpoints (planned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/telegram/webhook` | Telegram bot updates |
| … | `/api/expenses` | Expense CRUD (later) |

## Notes

- Use **service role** key only on the server — never in the frontend.
- Database schemas live in `../database/` — run SQL manually in Supabase.
