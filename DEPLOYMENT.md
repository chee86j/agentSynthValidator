# AgentSynthValidator Dashboard - Deployment Guide

## Quick Recommendation

**Best choice: Render.com (your free account)**
- No credit card required
- Perfect for this Node.js app
- Auto-deploys from GitHub
- Free tier includes 750 hours/month

**Second choice: Railway.app** (if you want more resources)
- Better performance than free tier
- $5-10/month typical cost
- Instant deploys, no spindown

**Not recommended: Vercel**
- Vercel is optimized for Next.js/serverless
- This is a traditional Node.js HTTP server
- Would require restructuring

---

## Deploy to Render.com (Free)

### Step 1: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 2: Create package.json
In the repo root, add:

```json
{
  "name": "agent-synth-validator",
  "version": "1.0.0",
  "description": "Matrix-themed synthetic user testing dashboard",
  "main": "dashboard_server.mjs",
  "type": "module",
  "scripts": {
    "start": "node dashboard_server.mjs"
  },
  "engines": {
    "node": "20.x"
  },
  "keywords": ["synthetic", "testing", "dashboard"],
  "author": "",
  "license": "MIT"
}
```

### Step 3: Push to GitHub
```bash
git add package.json
git commit -m "Add deployment configuration for Render"
git push origin main
```

### Step 4: Deploy on Render
1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub repo (`chee86j/agentSynthValidator`)
4. Fill in:
   - **Name:** `agent-synth-validator`
   - **Region:** Auto (closest to you)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** (leave blank)
   - **Start Command:** `node dashboard_server.mjs`
   - **Plan:** Free tier
5. Click **Create Web Service**

Render will auto-deploy and give you:
```
https://agent-synth-validator.onrender.com
```

⚠️ **Free tier note:** Services spin down after 15 min inactivity. First request wakes them up (~30s delay).

---

## Deploy to Railway.app (Paid ~$5-10/mo)

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub
3. Authorize Railway

### Step 2: Add package.json (same as above)

### Step 3: Deploy
1. Railway Dashboard → **New Project**
2. **Deploy from GitHub repo**
3. Select `chee86j/agentSynthValidator`
4. Railway auto-detects Node.js from package.json
5. Click **Deploy**

Railway provides:
- Instant deploys
- No spindown delays
- Better uptime SLA
- ~$5-10/month (Pay as you go)

URL:
```
https://agent-synth-validator.up.railway.app
```

---

## Option Comparison

| Feature | Render Free | Railway | Vercel |
|---------|------------|---------|--------|
| Cost | Free (750h/mo) | $5-10/mo | Free (but not ideal) |
| Node.js Support | ✅ Excellent | ✅ Excellent | ⚠️ Serverless only |
| Deployment | Auto from GitHub | Auto from GitHub | Auto from GitHub |
| Spindown | Yes (15 min) | No | N/A |
| HTTPS | ✅ Auto | ✅ Auto | ✅ Auto |
| Custom Domain | ✅ | ✅ | ✅ |

**Verdict:** Use **Render** for free testing, **Railway** for production with better uptime.

---

## Important: Mock Data

**Current state:** Dashboard has a built-in mock `/api` backend.

It generates synthetic test data on-the-fly. Perfect for:
- ✅ Demos
- ✅ UI/UX testing
- ✅ Understanding the dashboard

For **production real testing**, you would:
1. Replace `/api/run/start` with real test runner
2. Connect to your actual test infrastructure
3. Feed real synthetic test results

For now, deployed version works great as a **demo/prototype**.

---

## Deployment Steps (Complete)

### Create package.json
```bash
cd ~/path/to/agentSynthValidator
cat > package.json << 'EOF'
{
  "name": "agent-synth-validator",
  "version": "1.0.0",
  "description": "Matrix-themed synthetic user testing dashboard",
  "main": "dashboard_server.mjs",
  "type": "module",
  "scripts": {
    "start": "node dashboard_server.mjs"
  },
  "engines": {
    "node": "20.x"
  },
  "keywords": ["synthetic", "testing", "dashboard"],
  "author": "",
  "license": "MIT"
}
EOF
```

### Push to GitHub
```bash
git add package.json
git commit -m "Add deployment config"
git push origin main
```

### Then Deploy
- **Render:** https://dashboard.render.com → New Web Service → Select repo → Deploy
- **Railway:** https://railway.app → New Project → GitHub repo → Deploy

---

## Verify Deployment Works

After deploy, visit your URL and:
1. Click **Start 20-user run**
2. Watch the Nexus globe populate with agents
3. See the mission control top-bar update
4. Check left/right panels for personas and diagnostics

If it works locally at `http://localhost:5055`, it will work deployed.

---

## Support & Debugging

**Render.com logs:** Dashboard → Logs tab
**Railway logs:** Dashboard → Logs tab

Most issues:
- `package.json` missing → Add it and push
- Wrong Node version → Render/Railway auto-detect from `engines` field
- Port issue → Code uses `process.env.PORT || 3000`, both platforms set PORT automatically

EOF
cat /tmp/agentSynthValidator/DEPLOYMENT.md
