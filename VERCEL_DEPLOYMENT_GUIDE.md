# Deploying Riders Path to Vercel

Riders Path is pre-configured for deployment on **Vercel** with full-stack capabilities:
- **Frontend**: Vite + React SPA built to static HTML/JS/CSS assets.
- **Backend**: Express API running as serverless functions in `/api/index.ts` with transparent routing for all `/api/*` endpoints.
- **AI Vision Pipeline**: Google Gemini 2.5 Flash document verification for student driving licenses and IDs.
- **Persistence**: Auto-configured database loading from repo seed and `/tmp` in serverless execution environments.

---

## Quick Deployment Steps

### Option A: Via Vercel Web Dashboard (Recommended)

1. **Push Code to Git**:
   Push this project to your GitHub, GitLab, or Bitbucket repository.

2. **Import into Vercel**:
   - Go to [vercel.com](https://vercel.com) and log into your account.
   - Click **"Add New..."** > **"Project"**.
   - Select your repository and click **"Import"**.

3. **Configure Project Settings**:
   - **Framework Preset**: `Vite` (Vercel will detect this automatically).
   - **Root Directory**: `./` (leave default).
   - **Build Command**: `vite build` (defined in `vercel.json`).
   - **Output Directory**: `dist` (defined in `vercel.json`).

4. **Add Environment Variables**:
   In the **Environment Variables** section, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key (obtained from [Google AI Studio](https://aistudio.google.com/)).
   *(Optional)*:
   - `APP_URL`: Your Vercel production domain (e.g., `https://riders-path.vercel.app`).
   - `SMTP_HOST` / `RESEND_API_KEY`: If using automated email notifications.
   - `WHATSAPP_API_KEY`: If using automated WhatsApp gateway (otherwise, 1-click WhatsApp links are generated automatically).

5. **Deploy**:
   Click **"Deploy"**. Vercel will build the frontend assets, bundle the serverless `/api` handler, and provide your live URL in ~1 minute!

---

### Option B: Via Vercel CLI

If you have the Vercel CLI installed on your computer:

```bash
# 1. Install Vercel CLI (if not already installed)
npm i -g vercel

# 2. Login to your Vercel account
vercel login

# 3. Deploy to preview
vercel

# 4. Deploy to production
vercel --prod
```

When prompted:
- Set up and deploy: **Y**
- Link to existing project: **N**
- Project name: `riders-path` (or your choice)
- In which directory is your code located: `./`
- Want to modify settings: **N** (our `vercel.json` already provides the optimal build settings)

---

## Configuration Architecture

### 1. Routing (`vercel.json`)
```json
{
  "version": 2,
  "framework": "vite",
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```
- `/api/*` routes are handled by the serverless function `api/index.ts`.
- Non-API URLs rewrite to `/index.html` allowing React Router to handle client-side URLs (`/fleet`, `/admin`, `/my-bookings`, etc.).

### 2. Serverless Function (`api/index.ts`)
- Exports the Express application directly as a standard request listener.
- Contains all campus fleet inventory endpoints, booking validation, and AI document verification.

### 3. Administrator Access
- Default admin password: `riderspath210`
- Access portal: `https://<your-project>.vercel.app/admin` (or click "Admin Portal" in navigation bar).
