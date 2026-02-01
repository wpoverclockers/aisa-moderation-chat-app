# Railway Dependencies Fix

## Problem
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express' imported from /app/backend/src/server.js
```

Railway isn't installing backend dependencies before starting.

## Solution Applied

Updated root `package.json` build script to install backend dependencies:

```json
"build": "cd frontend && npm install && npm run build && cd ../backend && npm install"
```

This ensures:
1. Frontend dependencies installed
2. Frontend built
3. Backend dependencies installed
4. Then backend starts

## Railway Configuration

Make sure Railway settings:

1. **Root Directory:** `.` (project root)
2. **Build Command:** `npm run build` (or blank - uses railway.json)
3. **Start Command:** `npm start` (or blank - uses railway.json)

## How It Works

1. Railway runs `npm run build`:
   - Installs frontend deps
   - Builds frontend → `frontend/dist`
   - Installs backend deps → `backend/node_modules`

2. Railway runs `npm start`:
   - Changes to `backend/`
   - Runs `npm start` (which runs `node src/server.js`)
   - Backend has access to `node_modules`

## Verify

After redeploy, check Railway logs:

**Build logs should show:**
```
> chat-moderation-app@1.0.0 build
> cd frontend && npm install && npm run build && cd ../backend && npm install
[frontend install output]
[frontend build output]
[backend install output]
```

**Start logs should show:**
```
> chat-moderation-app@1.0.0 start
> cd backend && npm start
> chat-moderation-backend@1.0.0 start
> node src/server.js
🚀 Server running on port...
```

## Alternative: Railway Auto-Detection

Railway's NIXPACKS builder should auto-detect and install dependencies, but if it doesn't:

1. **Check Railway detects Node.js:**
   - Should see "Detected Node.js" in build logs
   - Should auto-run `npm install` in detected directories

2. **Manual override:**
   - Use the build script we created (already done)

## If Still Failing

Check Railway build logs for:
- `npm install` output in backend folder
- Any errors during dependency installation
- Whether `backend/node_modules` exists after build

The build script now explicitly installs backend dependencies, so this should fix it!
