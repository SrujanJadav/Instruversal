# Instruversal — Production Deployment Guide

This guide walks through every step to deploy **Instruversal v1** to **Cloudflare Pages** and configure the production backend on **Supabase**.

---

## 1. Cloudflare Pages Setup

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, navigate to **Compute (Workers) > Workers & Pages**.
3. Click **Create application**, then select the **Pages** tab.
4. Click **Connect to Git**.
5. Select your GitHub account and choose repository: `SrujanJadav/Instruversal`.
6. Configure the deployment build settings:
   - **Project name**: `instruversal` (or your preferred name)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (leave empty or default)
7. Do not deploy yet — proceed to add the Environment Variables first.

---

## 2. Production Environment Variables

In the Cloudflare Pages project setup (or under **Settings > Environment variables > Production**), add the following variables:

| Variable Name | Production Value | Description |
| :--- | :--- | :--- |
| `NODE_VERSION` | `22` | Node.js runtime version (matches `.nvmrc`) |
| `VITE_SITE_URL` | `https://instruversal.pages.dev` | Canonical public live URL (or custom domain `https://instruversal.app`) |
| `VITE_SUPABASE_URL` | `https://<your-project-id>.supabase.co` | Your Supabase project URL (from Supabase Project Settings > API) |
| `VITE_SUPABASE_ANON_KEY` | `<your-publishable-anon-key>` | Public anon key (from Supabase Project Settings > API) |
| `VITE_ENABLE_STUDIO` | `false` | Keeps multi-track Song Studio hidden until launch readiness |
| `VITE_ENABLE_GARDEN` | `true` | Enables living procedural Type Garden title on start screen |

> [!IMPORTANT]
> Never put `service_role` or secret keys in Cloudflare Pages build variables. Only publishable anonymous keys belong in client builds.

Click **Save and Deploy**.

---

## 3. Supabase Authentication & URL Configuration

1. Log into the [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. Go to **Authentication > URL Configuration**.
3. Set **Site URL**:
   - `https://instruversal.pages.dev` (or your production domain).
4. Add the following to **Redirect URLs**:
   - `https://instruversal.pages.dev/**`
   - `https://instruversal.app/**` (if using custom domain)
   - `http://localhost:5173/**` (for local development testing)
5. Click **Save**.

---

## 4. Google OAuth Sign-In & Troubleshooting

> [!NOTE]
> **Why clicking "Continue with Google" returned:**
> `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
> This error occurs because Google OAuth is currently **Disabled** by default in your Supabase project.

You have two simple options for launch:

### Option A: Use Email Magic Link (Zero Configuration Required)
Users can sign in immediately using their email address without configuring Google Cloud Console. Supabase sends a secure one-click sign-in link.

### Option B: Enable Google Sign-In
To enable Google sign-in:
1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and go to **Authentication > Providers > Google**.
2. Toggle Google to **Enabled**.
3. Copy the **Callback URL (for OAuth)** shown in Supabase (e.g. `https://<your-project-id>.supabase.co/auth/v1/callback`).
4. In the [Google Cloud Console](https://console.cloud.google.com/):
   - Select or create a project.
   - Go to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth Client ID** (select Application Type: **Web application**).
   - Under **Authorized JavaScript origins**, add:
     - `https://instruversal.pages.dev`
     - `http://localhost:5173`
   - Under **Authorized redirect URIs**, paste the Supabase Callback URL from step 3.
   - Click **Create** and copy the **Client ID** and **Client Secret**.
5. Back in the Supabase Dashboard:
   - Paste the **Client ID** and **Client Secret**.
   - Click **Save**.
6. **OAuth Consent Screen**: In Google Cloud Console, if your app is set to **Testing**, only test user email addresses added in the Google Console can sign in. Once you are ready for everyone to sign in, click **Publish App** on the OAuth consent screen.

---

## 5. Custom SMTP Settings in Supabase (Recommended Setup)

Supabase includes a default built-in email service, but it is strictly rate-limited to **3–4 emails per hour**. For a public launch, you should configure custom SMTP.

### Recommended Choice 1: Gmail SMTP (Best if you do NOT have a custom domain)
If you are deploying on `instruversal.pages.dev` and do not own a custom domain, Gmail SMTP is completely free, allows **500 emails/day**, and requires **no DNS or domain verification**:

1. Go to your [Google Account Security Settings](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned ON.
3. Search for or navigate to **App passwords** (or visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Create an App Password with the name `Supabase Auth`. Copy the 16-character generated password (e.g. `abcd efgh ijkl mnop`).
5. In Supabase Dashboard, go to **Authentication > SMTP Settings**:
   - Toggle **Enable Custom SMTP**: **ON**
   - **Sender email**: `your-email@gmail.com`
   - **Sender name**: `Instruversal`
   - **Host**: `smtp.gmail.com`
   - **Port**: `587`
   - **Minimum TLS version**: `TLSv1.2`
   - **Username**: `your-email@gmail.com`
   - **Password**: `<your-16-character-app-password>` (remove spaces)
6. Click **Save** and click **Send test email** to confirm.

### Recommended Choice 2: Resend (Best if you purchase a custom domain later)
If you ever connect a custom domain:
1. Create a free account at [Resend](https://resend.com) (3,000 emails/month free, 100/day).
2. Add and verify your domain DNS records in Resend.
3. In Resend, go to **API Keys** and generate a new key.
4. In Supabase **Authentication > SMTP Settings**:
   - **Sender email**: `auth@yourdomain.com`
   - **Sender name**: `Instruversal`
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (SSL) or `587` (TLS)
   - **Username**: `resend`
   - **Password**: `re_your_api_key_here`
5. Click **Save**.


---

## 6. Database Migrations Order

Open the Supabase **SQL Editor** and run the migration files located in `supabase/migrations/` in this exact sequence:

1. **`001_creations.sql`**: Creates `creations` table, indexes, and initial Row Level Security (RLS) policies.
2. **`002_per_colour_keys.sql`**: Adds per-color key mappings to `creations`.
3. **`002_songs.sql`**: Creates `songs` table, indexes, and owner RLS policies.
4. **`003_loop_length.sql`**: Adds `loop_length_bars` column to `creations`.
5. **`004_songs.sql`**: Adds song remix columns and public link security policies.

> [!NOTE]
> Skip any migration you have already run previously. After running, verify that **Row Level Security (RLS)** is enabled on both `creations` and `songs` tables under **Database > Tables**.

---

## 7. Post-Deploy Verification Checklist

After Cloudflare finishes the build and deploy:

1. **Start Screen**:
   - The living Type Garden animated typography ("Instruverse") with procedural vines and roses displays smoothly.
   - Switching between light and dark modes swaps colors seamlessly without flashes or black boxes.
2. **Audio Initialization**:
   - Tapping "Tap to start" starts Web Audio cleanly (`Tone.start()` triggered on user gesture).
3. **Drawing & Playhead**:
   - Drawing strokes on canvas registers normalized coordinates.
   - Vertical playhead travels at tempo, looping smoothly and sounding the notes on hit points.
4. **Tooling & Persistence**:
   - Color picker, eraser, lasso selection, duplicate, nudge, undo/redo work reliably.
   - Untitled sketches save to IndexedDB/localStorage and sync to Supabase when signed in.
5. **Song Studio Launch Guard**:
   - "Open Studio" link is hidden on the start screen.
   - "Studio" button is hidden in the header.
   - "Add to song" option is hidden in Share modal.
   - "Songs" tab is hidden in the Library modal.
   - Song Studio keyboard shortcuts are hidden in the `?` sheet.
   - Navigating directly to `#/studio` renders the friendly placeholder: *"Song Studio is coming soon."* with a "Back to home" button.
6. **Public Sharing**:
   - Sharing a sketch via public link generates a `#project=` or `#/c/<slug>` URL that loads properly in private/incognito browsing.
   - Public song player `#/s/<slug>` plays shared songs without error.
7. **PWA & Offline**:
   - Service worker registers (`/sw.js`) and manifest loads (`/manifest.webmanifest`).
8. **Browser Console**:
   - No errors or unhandled promise rejections.

---

## 8. Rollback Procedure

If any issue arises in production:

1. In Cloudflare Dashboard, go to **Workers & Pages > instruversal**.
2. Click the **Deployments** tab.
3. Locate the previous successful deployment.
4. Click the three dots menu `...` on that deployment and select **Rollback to this deployment**.
5. The previous build becomes active instantly worldwide.

---

## 9. Anon Key Rotation

If you ever need to rotate the Supabase anon key:

1. In Supabase Dashboard, go to **Project Settings > API**.
2. Generate a new API key.
3. In Cloudflare Pages, go to **Settings > Environment variables > Production**.
4. Update `VITE_SUPABASE_ANON_KEY` with the new key value.
5. In `public/_headers`, confirm the Supabase connect URL matches the project URL.
6. Trigger a new deployment: **Deployments > Retry deployment** (or push a commit).
7. Test the live site; once verified working, revoke the old anon key in Supabase.

---

## 10. Supabase Keepalive Ping

To prevent Supabase free projects from pausing due to inactivity after 7 days:

1. In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
2. Add the repository secrets matching `.github/workflows/keepalive.yml`:
   - `SUPABASE_URL`: Your Supabase URL (e.g. `https://zcogvuzgrtojztsjjrnc.supabase.co`)
   - `SUPABASE_ANON_KEY`: Your publishable anon key
3. The automated GitHub Actions workflow will ping the endpoint every Sunday at 00:00 UTC to maintain active database status.

---

## 11. Enabling Song Studio Later

When you are ready to launch the full Song Studio:

1. In Cloudflare Pages, go to **Settings > Environment variables > Production**.
2. Edit `VITE_ENABLE_STUDIO` and set its value to `true`.
3. In your local repository, you can test it locally by running `VITE_ENABLE_STUDIO=true npm run dev`.
4. Trigger a new Cloudflare deployment. All Studio entry points ("Open Studio" link, header button, timeline arranger, mixer panel, and song export) will automatically become active.
