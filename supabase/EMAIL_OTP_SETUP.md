# Riders Path — Supabase 6-Digit Email OTP & URL Configuration Guide

Riders Path verifies student signups and password resets using **6-digit email OTP codes** verified via Supabase Auth `verifyOtp({ email, token, type: 'email' })` rather than confirmation links (`{{ .ConfirmationURL }}`).

> **Important:** The live Supabase Dashboard settings must be updated manually by the project owner. Code changes alone cannot modify the hosted email templates in your Supabase project (`gwaevmtgiiyqpteuftnx`).

---

## 1. Confirm Signup Email Template (`{{ .Token }}`)

1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/gwaevmtgiiyqpteuftnx).
2. Navigate to **Authentication → Email Templates → Confirm signup**.
3. Update the template to display `{{ .Token }}` (the 6-digit OTP code) instead of `{{ .ConfirmationURL }}`:

### Recommended Subject
```text
Your Riders Path verification code: {{ .Token }}
```

### Recommended Body (HTML)
```html
<h2>Confirm your Riders Path student account</h2>
<p>Enter the 6-digit verification code below in the Riders Path verification screen to activate your account:</p>
<p style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 12px 16px; background: #F7F6F2; border: 1px solid #E5E4DE; border-radius: 8px; display: inline-block;">
  {{ .Token }}
</p>
<p>This code expires shortly. If you did not create a Riders Path account, you can safely ignore this email.</p>
```

---

## 2. Reset Password Email Template (`{{ .Token }}`)

1. In **Authentication → Email Templates → Reset Password**, ensure the template also uses `{{ .Token }}`:

### Recommended Subject
```text
Your Riders Path password recovery code: {{ .Token }}
```

### Recommended Body (HTML)
```html
<h2>Reset your Riders Path password</h2>
<p>Enter the 6-digit recovery code below on the Riders Path password reset screen:</p>
<p style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 12px 16px; background: #F7F6F2; border: 1px solid #E5E4DE; border-radius: 8px; display: inline-block;">
  {{ .Token }}
</p>
<p>If you did not request a password reset, you can safely ignore this email.</p>
```

---

## 3. Email Provider OTP Settings

1. Navigate to **Authentication → Providers → Email**.
2. Verify the following settings:
   - **Enable Email provider**: Enabled
   - **Confirm email**: Enabled
   - **Mailer OTP Length**: `6` digits
   - **Mailer OTP Expiration**: `3600` seconds (or your preferred expiry window, e.g., `900`–`3600` seconds)

---

## 4. URL & Redirect Configuration (Local Development vs. Production)

1. Navigate to **Authentication → URL Configuration**:
   - **Local Development / Preview**:
     - Set **Site URL** (or add to **Redirect URLs**) to the actual running application URL (e.g., `http://localhost:3000` for local development or your active Cloud Run preview URL).
     - Set `APP_URL="http://localhost:3000"` (or the running preview URL) in `.env`.
   - **Before Production Deployment**:
     - Update **Site URL** in Supabase Dashboard → **Authentication → URL Configuration** to your production domain (e.g., `https://your-production-domain.com`).
     - Add your production URL to **Redirect URLs** in Supabase Dashboard.
     - Set `APP_URL` in your production environment variables to match the deployed production URL.
