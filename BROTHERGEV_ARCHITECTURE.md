# 🧱 BrotherGEV Multi-Mode 固化架構 v1.0

> 三層：Router（路由）＋ Prompts（角色）＋ Firestore（資料流）
> 可直接部署 Netlify、對接 Firebase、Gemini、支援多模式擴展

---

## 📁 目錄結構

```
shopee-selector-deploy/
├── netlify/
│   └── functions/
│       ├── ask.js           # 統一後端入口（支援多模式）
│       └── analyze.js       # 原有 Shopee 分析（保留）
├── lib/
│   └── router.js            # 多模式路由層（核心模組）
├── prompts/
│   ├── tesla.txt           # Tesla 決策 AI
│   ├── travel.txt          # 旅遊規劃 AI
│   ├── shopee.txt          # 直播戰術 AI
│   ├── esim.txt            # eSIM 助手
│   ├── image.txt           # 圖像生成顧問
│   └── landlord.txt        # 房東管家 AI
├── netlify.toml
├── package.json
└── BROTHERGEV_ARCHITECTURE.md
```

---

## 🔧 核心架構

### 1. Router 層 (`lib/router.js`)

- **職責**：動態載入對應模式的 prompt
- **白名單**：`tesla`, `travel`, `shopee`, `esim`, `image`, `landlord`
- **擴充方式**：新增 `.txt` 檔案到 `prompts/` 目錄即可

### 2. Prompts 層 (`prompts/*.txt`)

- **職責**：定義每個 AI 角色的系統提示詞
- **獨立性**：每個 `.txt` 可獨立修改，無需改程式碼
- **格式**：純文字，可包含 Markdown

### 3. Firestore 層

- **資料結構**：`users/{uid}`
  - `plan`: `"free" | "pro" | "master"`
  - `daily_count`: number（當日使用次數）
  - `last_used`: timestamp（最後使用時間）
  - `created_at`, `updated_at`: timestamp

---

## 🚀 API 使用方式

### 端點：`/.netlify/functions/ask`

### 請求方式

**GET 請求**：
```
/.netlify/functions/ask?uid=user123&mode=shopee&q=請幫我分析這個產品
```

**POST 請求**：
```json
{
  "uid": "user123",
  "mode": "shopee",
  "q": "請幫我分析這個產品"
}
```

### 參數說明

| 參數 | 必填 | 說明 | 預設值 |
|------|------|------|--------|
| `uid` | 否 | 用戶 ID | `"guest"` |
| `mode` | 否 | 模式（見下表） | `"shopee"` |
| `q` / `query` / `textPrompt` / `input` | 是 | 用戶輸入的問題 | - |

### 支援的模式

| mode | 功能 | 說明 |
|------|------|------|
| `tesla` | 特斯拉決策 AI | Model 3/Y/S/X 購買建議 |
| `travel` | 旅遊規劃 AI | 行程、飯店、美食建議 |
| `shopee` | 直播戰術 AI | C-A-B 排品策略 |
| `esim` | eSIM 助手 | 方案建議與安裝教學 |
| `image` | 圖像生成顧問 | 文字提示詞優化 |
| `landlord` | 房東管家 AI | 租金管理、催繳提示 |

### 回應格式

**成功**：
```json
{
  "success": true,
  "mode": "shopee",
  "uid": "user123",
  "output": "AI 生成的回覆內容...",
  "timestamp": 1701234567890
}
```

**失敗**：
```json
{
  "success": false,
  "error": "錯誤訊息",
  "mode": "shopee",
  "uid": "user123",
  "timestamp": 1701234567890
}
```

---

## 🔒 使用次數控制

| plan | 每日配額 | 說明 |
|------|---------|------|
| `free` | 5 次 | 免費版 |
| `pro` | 20 次 | 專業版 |
| `master` | 50 次 | 大師版（預留） |

- 每日自動重置（根據 `last_used` 日期判斷）
- `guest` 用戶不受限制（用於測試）

---

## 📝 前端整合範例

```javascript
// 統一 API 呼叫函數
async function askAI(uid, mode, question) {
  const API_URL = '/.netlify/functions/ask';
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uid,
        mode: mode,
        q: question
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      return data.output;
    } else {
      throw new Error(data.error || '分析失敗');
    }
  } catch (err) {
    console.error('askAI error:', err);
    throw err;
  }
}

// 使用範例
const result = await askAI('user123', 'shopee', '請幫我分析這個產品');
console.log('AI 回覆:', result);
```

---

## 🔧 擴充新模式

1. **新增 prompt 檔案**：
   ```
   prompts/newmode.txt
   ```

2. **更新白名單**（`lib/router.js`）：
   ```javascript
   const ALLOWED_MODES = ['tesla', 'travel', 'shopee', 'esim', 'image', 'landlord', 'newmode'];
   ```

3. **完成！** 無需修改其他程式碼

---

## ⚙️ 環境變數

在 Netlify Dashboard 設置：

| 變數名 | 說明 | 必填 |
|--------|------|------|
| `GOOGLE_API_KEY` 或 `GEMINI_API_KEY` | Gemini API 金鑰 | ✅ |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK JSON（單行） | ❌（guest 模式可選） |

---

## 🧪 測試方式

### 1. 本地測試

```bash
# 安裝依賴
npm install

# 啟動 Netlify Dev
netlify dev
```

### 2. API 測試

```bash
# GET 請求
curl "http://localhost:8888/.netlify/functions/ask?uid=test123&mode=shopee&q=測試問題"

# POST 請求
curl -X POST http://localhost:8888/.netlify/functions/ask \
  -H "Content-Type: application/json" \
  -d '{"uid":"test123","mode":"shopee","q":"測試問題"}'
```

---

## ✅ 架構優勢

1. **可擴充性**：新增模式只需新增 `.txt` 檔案
2. **可維護性**：prompt 與程式碼分離
3. **統一介面**：所有模式共用同一個 API endpoint
4. **使用控制**：Firestore 統一管理配額
5. **向後兼容**：保留原有 `analyze.js`，不影響現有功能

---

## 🚦 判斷標準

| 狀態 | 說明 | 狀態 |
|------|------|------|
| ✅ `mode` 分明、prompt 分離 | 正確架構 | 🟢 |
| ❌ prompt 寫死在 `ask.js` | 錯誤 | 🔴 |
| ✅ 有 `uid/daily_count` 控制 | 正確 | 🟢 |
| ✅ `.env` 與 Firebase 同步 | 正確 | 🟢 |

---

## 🎯 下一步

1. 測試各模式是否正常運作
2. 根據實際需求調整各模式的 prompt
3. 新增更多模式（如需要）
4. 優化使用次數控制邏輯

---

**版本**：v1.0  
**最後更新**：2025-11-24

