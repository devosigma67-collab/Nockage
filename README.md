# Nockage — Real Free Full-Stack Setup

This is the real Nockage website build: the frontend is static and the backend is Supabase (Auth + Postgres + Storage).

## What is real
- real user accounts
- username/password login without requiring Gmail
- real database
- real video uploads
- real public/unlisted/private video records
- real likes, subscriptions, comments and reposts
- real Nockage Studio statistics
- responsive PC/Mac/iOS/Android browser UI
- Nockage logo included

## Free limits
This build is designed around Supabase's Free plan. The current free plan includes 50,000 MAU, 500 MB database, 1 GB file storage, and 5 GB cached + 5 GB uncached egress. The upload UI limits individual videos to 50 MB to stay inside the free storage product limits.

## IMPORTANT
Do not put a Supabase service-role key in this project. Only use the public anon/publishable browser key.

## Setup
1. Create a Supabase project on the Free plan.
2. In Supabase Authentication, enable Email provider and turn OFF email confirmation if you want username-only accounts with no email verification.
3. Open SQL Editor and run `schema.sql`.
4. Create these Storage buckets:
   - public-videos — PUBLIC
   - private-videos — PRIVATE
   - thumbnails — PUBLIC
5. Open Project Settings -> API and copy the Project URL and public anon/publishable key.
6. Edit `app.js` and replace:
   PASTE_YOUR_SUPABASE_URL_HERE
   PASTE_YOUR_SUPABASE_ANON_KEY_HERE
7. Upload the folder to a static host such as GitHub Pages.
8. Keep the project on the Free plan. Do not add billing.

## Google
The project includes indexable title/description/robots metadata. Once it has a public URL, submit the homepage to Google Search Console and submit a sitemap. Google says indexing is not instant and can take days or longer.

## Security note
For a real production platform, add moderation, rate limiting, abuse reporting, file scanning, stronger account recovery, and stricter storage policies before opening it to a large audience.

## Storage note
Supabase Free Storage has a 1 GB quota and 50 MB max file upload on the Free plan. This is suitable for testing/early users, not a YouTube-scale service.
