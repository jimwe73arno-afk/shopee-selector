# BrotherG AI - Shopee Analyst

> **Note:** 本文件原先描述舊版 `netlify/functions/analyze.js`。目前所有前端頁面都應呼叫 `/.netlify/functions/ask` 並加上對應 `mode`（Shopee 頁面為 `shopee`）。

## Map-Reduce Architecture for Image Analysis

### Architecture Overview

This Netlify Function implements a **Map-Reduce** pattern to handle image analysis efficiently:

1. **MAP Phase**: Parallel processing of images using `gemini-1.5-flash` (fast vision)
2. **REDUCE Phase**: Deep reasoning using `gemini-1.5-pro` (strategic analysis)

### API Endpoint

- **URL**: `/.netlify/functions/ask`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Request Format

```json
{
  "textPrompt": "User's question...",
  "images": ["base64_string_1", "base64_string_2", ...]
}
```

### Response Format

```json
{
  "summary": "Detailed strategic analysis...",
  "recommendations": ["Actionable Step 1", "Actionable Step 2", "Actionable Step 3"],
  "plan": "7-Day Execution Plan..."
}
```

### User Tiers

#### Free Tier
- ✅ Text-only analysis
- ❌ No images allowed
- Model: `gemini-1.5-flash`

#### Pro Tier
- ✅ Text analysis
- ✅ Up to 1 image
- Model: `gemini-1.5-flash` (vision) → `gemini-1.5-pro` (reasoning)

#### Master Tier
- ✅ Text analysis
- ✅ Up to 10 images (batch processing)
- Model: Parallel `gemini-1.5-flash` → `gemini-1.5-pro`

### Environment Variables

Set in Netlify Dashboard:
- `GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`)

### User Tier Detection

Currently uses mock implementation. To implement real tier checking:

1. **JWT Token**: Decode `Authorization` header
2. **Custom Header**: Check `X-User-Tier` header
3. **Database**: Query user tier from database

Modify `checkUserTier(event)` function in `netlify/functions/analyze.js`.

### Deployment

1. Push to GitHub
2. Netlify auto-deploys
3. Set environment variables in Netlify dashboard
4. Function available at: `https://your-site.netlify.app/.netlify/functions/ask`

### Timeout Configuration

- Function timeout: 60 seconds (configured in `netlify.toml`)
- Map phase: Parallel processing (faster)
- Reduce phase: Single deep reasoning call

### Error Handling

- Invalid JSON: 400
- Missing API key: 500
- Tier limit exceeded: 403
- Gemini API errors: 500 (with error message)

