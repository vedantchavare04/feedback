# Tourmate Feedback

One feedback page for Tourmate.ai, Solo2Squad and Group Finder.
Static page + one Vercel serverless function. Saves to Neon (Postgres), emails through Resend.

```
index.html  style.css  app.js  favicon.svg     the page
api/feedback.js                                validation, rate limit, Neon insert, Resend email
schema.sql                                     optional: table is created automatically
.env.example                                   the only thing you edit
```

## 1. Neon (database)
1. neon.tech > create a project.
2. Dashboard > Connect > copy the connection string.
3. That is `DATABASE_URL`. The `feedback` table is created automatically on the first submission
   (or paste `schema.sql` into the Neon SQL Editor yourself).

## 2. Resend (email)
1. resend.com > API Keys > create a key. That is `RESEND_API_KEY`.
2. Testing: keep `FEEDBACK_FROM_EMAIL=Tourmate Feedback <onboarding@resend.dev>` and set `FEEDBACK_TO_EMAIL`
   to the same email you signed up to Resend with (Resend only delivers the test sender to that address).
3. Real use: Resend > Domains > add and verify your domain, then use e.g. `Tourmate Feedback <feedback@yourdomain.com>`.

## 3. Run locally
```
npm install
npm i -g vercel
copy .env.example .env.local        # then fill in the values (macOS/Linux: cp)
vercel dev                           # http://localhost:3000
```

### Using VS Code Live Server instead?
Live Server only serves static files, so `/api/feedback` returns 405. Either use `vercel dev` (above), or deploy once
(step 4), then set `<meta name="api-base" content="https://YOUR-FEEDBACK.vercel.app">` in `index.html` while testing on
`http://127.0.0.1:5500`. Remove the value again before deploying.

## 4. Deploy
Push to GitHub, import the repo in Vercel (Framework: Other, no build command), then add the
environment variables from `.env.example` under Settings > Environment Variables and redeploy.

## 5. Link it from your three apps
```
https://YOUR-FEEDBACK.vercel.app/?project=tourmate
https://YOUR-FEEDBACK.vercel.app/?project=solo2squad
https://YOUR-FEEDBACK.vercel.app/?project=groupfinder
```
Optional: add `&back=https://your-app-url` so the Back link returns to the app the person came from.

## If you get a 500 error
Open `https://YOUR-FEEDBACK.vercel.app/api/health`. It lists which variables are set and whether Neon is reachable,
with a plain-English hint. The form also shows a short code on failure (for example `DB_AUTH`).
After changing any variable in Vercel, redeploy (Deployments > latest > Redeploy).
`DATABASE_URL` must be only the `postgresql://...` value (no `psql`, no quotes).

## Reading the feedback
Neon > SQL Editor:
```sql
SELECT id, created_at, project, category, rating, left(message, 80) AS message, email FROM feedback ORDER BY created_at DESC LIMIT 50;
SELECT project, count(*) AS n, round(avg(rating), 2) AS avg_rating FROM feedback GROUP BY project;
```

## Safeguards built in
- Server-side validation of every field; messages capped at 2000 characters.
- Hidden honeypot field catches simple bots.
- Rate limit: 5 submissions per hour per visitor (IP is stored only as a salted hash).
- Email failure never loses feedback: it is saved first and flagged `emailed = false`.
- HTML in messages is escaped before it goes into the email.
