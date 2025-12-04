# Deployment Guide

## GitHub Setup

1. Create a new repository on GitHub (don't initialize with README, .gitignore, or license)

2. Push your code to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## Vercel Deployment

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account

2. Click "New Project" and import your GitHub repository

3. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build` (should auto-detect)
   - **Output Directory**: `dist` (should auto-detect)

4. Add Environment Variables:
   - Go to Project Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL` = your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

5. Click "Deploy"

6. After deployment, your site will be live at `https://your-project.vercel.app`

## Database Setup

Before deploying, make sure you've run the SQL migration to add the username column:

```sql
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS username TEXT;
```

Run this in your Supabase SQL editor.

