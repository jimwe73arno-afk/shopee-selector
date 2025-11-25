# Netlify Deployment Checklist ✅

## Critical Fixes Applied

> **Reminder:** `netlify/functions/analyze.js` 已標記為舊版。請確保前端僅呼叫 `/.netlify/functions/ask`（Shopee 模式需傳 `mode: "shopee"`）。

### ✅ 1. Backend File Location
- **Primary Function**: `netlify/functions/ask.js` ✅
- **Legacy Reference**: `netlify/functions/analyze.js`（僅保留備查）
- **Size**: 11KB (385 lines)
- **Status**: Functions 皆位於 Netlify 預期的 `netlify/functions` 目錄

### ✅ 2. Netlify Configuration (`netlify.toml`)
```toml
[build]
  command = ""
  publish = "public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  included_files = ["netlify/functions/**", "lib/**", "prompts/**"]

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Key Points:**
- ✅ Functions directory properly configured
- ✅ 不再需要 `/api/*` 轉址，直接呼叫 `/.netlify/functions/ask`
- ✅ SPA fallback routing 保持

### ✅ 3. Package Dependencies (`package.json`)
```json
{
  "dependencies": {},
  "_note": "Using native fetch() API - @google/generative-ai SDK not required",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Note:** Code uses native `fetch()` API (available in Node.js 18+), so **no additional dependencies required**. The `@google/generative-ai` SDK is not needed since we're calling the REST API directly.

### ✅ 4. Frontend API Call
Frontend should call: `POST /.netlify/functions/ask`（Body 需包含 `mode`、`q`）

## Deployment Steps

1. **Commit Changes:**
   ```bash
   git add .
   git commit -m "fix: Configure Netlify functions deployment"
   git push origin main
   ```

2. **Set Environment Variable (Netlify Dashboard):**
   - Go to: Site settings → Environment variables
   - Add: `GOOGLE_GENERATIVE_AI_API_KEY` = `your_api_key_here`

3. **Verify Deployment:**
   - Check Netlify Deploy Logs
   - Should see: "Functions detected: ask"
   - Test endpoint: `https://your-site.netlify.app/.netlify/functions/ask`

## Expected Deploy Output

```
Deploying functions...
Functions detected:
  - ask
Deploy complete!
```

## Troubleshooting

### If "No functions deployed" error persists:

1. **Check file path:** Must be exactly `netlify/functions/analyze.js`
2. **Check netlify.toml:** Must have `[build] functions = "netlify/functions"`
3. **Check file syntax:** Run `node -c netlify/functions/analyze.js`
4. **Check logs:** Look for "Functions detected" in deploy logs

### If API call fails:

1. **確認前端路徑：** 必須呼叫 `/.netlify/functions/ask`
2. **Check function name:** Must match file name (`ask.js` → `ask`)
3. **Test direct URL:** Try `/.netlify/functions/ask` directly
4. **Check CORS:** Function includes CORS headers

## Verification Commands

```bash
# Check file exists
ls -lh netlify/functions/ask.js

# Check syntax
node -c netlify/functions/ask.js

# Check config
cat netlify.toml

# Verify structure
tree netlify/functions/
```

