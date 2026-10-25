# Deploying Riders Path to GitHub Pages

Riders Path has been configured for GitHub Pages static hosting and full feature parity with the AI Studio Preview environment.

---

## What Was Fixed to Prevent the Blank Screen

1. **Relative Asset Base Path (`base: './'`) in `vite.config.ts`**:
   - **Root Cause**: By default, Vite generates absolute asset paths (`/assets/index.js`), which breaks when hosted under a GitHub repository path (e.g. `https://<username>.github.io/<repo>/`), causing 404 script loading errors and a blank white screen.
   - **Resolution**: Set `base: './'` so all script and stylesheet tags resolve relatively to the current page under any repository name or custom domain.

2. **Dual-Mode Backend/Client Storage Engine (`src/services/localDb.ts` & `src/services/api.ts`)**:
   - **Root Cause**: GitHub Pages is purely static and cannot run a Node.js Express server. Standard network calls to `/api/*` fail with 404, causing fleet lists and dashboard metrics to fail or show empty screens.
   - **Resolution**: Implemented a transparent in-browser storage engine pre-seeded with all 7 ICFAI campus bikes, 3 campus hubs, student profiles, active bookings, and platform configuration. If the backend API is unreachable, the application seamlessly uses the client database in `localStorage` so the **entire dashboard, fleet management, and booking flows remain 100% functional**!

3. **SPA Deep-Linking & 404 Redirection (`public/404.html`)**:
   - Included a universal redirect in `public/404.html` (bundled to `dist/404.html`) so refreshing on subpaths or direct links does not trigger GitHub's generic 404 page.

4. **URL Hash Routing (`#admin`, `#bikes`, `#student-dashboard`)**:
   - Synchronizes view state with `window.location.hash`, enabling direct linking to the Admin Portal (`#admin`), browser back/forward buttons, and state preservation on page reload.

5. **Universal ErrorBoundary (`src/components/ErrorBoundary.tsx`)**:
   - Protects the user interface against unexpected runtime errors, providing clear diagnostics and instant recovery buttons instead of a blank white screen.

---

## How to Deploy to GitHub Pages

### Option 1: Automatic Deployment via GitHub Actions (Recommended)

The repository includes a ready-to-run GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Fix GitHub Pages deployment and dashboard compatibility"
   git push origin main
   ```

2. **Enable GitHub Pages in your Repository**:
   - Open your GitHub repository in your browser.
   - Go to **Settings** > **Pages** (in the left sidebar).
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.

3. **View your Live Site**:
   - GitHub Actions will automatically run the `Deploy Riders Path to GitHub Pages` workflow.
   - Once completed (takes ~1 minute), your site URL will be displayed under **Settings** > **Pages** (e.g. `https://<your-username>.github.io/<repo-name>/`).

---

### Option 2: Manual Deployment from `gh-pages` Branch

If you prefer building locally and pushing the `dist` directory:

```bash
# 1. Build the production bundle
npm run build

# 2. Deploy dist folder to gh-pages branch using git
npx gh-pages -d dist
```

Then in GitHub **Settings** > **Pages**, set **Source** to `Deploy from a branch` and select `gh-pages` / `root`.

---

## Admin Portal Access on GitHub Pages
- **URL**: `https://<your-username>.github.io/<repo-name>/#admin`
- **Default Password**: `riderspath210`
- Features available on GitHub Pages:
  - Live Fleet Metrics (available bikes, active rentals, total revenue)
  - Fleet Inventory (add/edit/delete bikes, synchronized hourly/daily pricing, brand selection)
  - Campus Hubs (manage ICFAI Main Gate, Socials Gaming Zone, Kaka's Hotel)
  - Fast Handover & Return modal with physical inspection records
  - Direct 1-click WhatsApp web notifications (`wa.me`) and email audit logging
