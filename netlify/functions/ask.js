// netlify/functions/ask.js — BrotherGEV Unified /ask
// 統一後端入口，支援多模式 AI 分析

const admin = require('firebase-admin');

// ★ PLAN_CONFIG：統一管理所有方案的配額
const PLAN_CONFIG = {
  guest:  { dailyLimit: 1 },
  free:   { dailyLimit: 5 },
  pro:    { dailyLimit: 20 },
  master: { dailyLimit: 50 },
};

// ★ 動態季節計算
function getCurrentSeasonContext() {
  const month = new Date().getMonth() + 1; // 1-12
  let season = "";
  let trendKeywords = "";

  if (month >= 3 && month <= 5) {
    season = "春季/換季/梅雨";
    trendKeywords = "除濕機, 收納, 母親節禮物, 野餐, 春裝";
  } else if (month >= 6 && month <= 8) {
    season = "夏季/暑假/鬼月";
    trendKeywords = "涼感, 手持風扇, 防曬, 普渡供品, 旅遊eSIM, 比基尼";
  } else if (month >= 9 && month <= 11) {
    season = "秋季/開學/雙11";
    trendKeywords = "開學用品, iPhone新機周邊, 萬聖節, 雙11囤貨, 護手霜";
  } else { // 12, 1, 2
    season = "冬季/聖誕/過年";
    trendKeywords = "暖暖包, 發熱衣, 電暖器, 火鍋湯底, 聖誕禮物, 年貨, 掃除用品";
  }
  return { season, trendKeywords, month };
}

// ★ Shopee Prompt：Free/Pro 分流（季節感知版）
function getShopeePrompt(plan) {
  const { season, trendKeywords, month } = getCurrentSeasonContext();
  
  const baseContext = `
你現在是 BrotherG 的「老司機選品顧問」。

【環境參數 - 你必須知道現在是什麼時候】
- 現在月份：${month}月
- 季節判斷：${season}
- 當下熱搜關鍵字：${trendKeywords}

你的任務是展現「你懂現在市場在搶什麼」。絕對不能推薦反季節商品。
選品時，請務必將【環境參數】與【用戶提問】結合。

例如：現在是 ${month} 月，不管用戶問什麼，你腦中都要有「${trendKeywords.split(',')[0]}」的潛在連結。
`;

  if (plan === 'pro' || plan === 'master') {
    return baseContext + `
---
【Pro 版：精準季節選品，直接給爆款】

1. **結合季節＋隱藏硬指標**：
   - 找出符合現在「${season}」需求，且價格在 300-500 元、銷量破萬的具體商品。

2. **具體推薦格式**：

📊 **市場嗅覺**（1 段，點破現在時機）

🎯 **C-A-B 排品策略**
- **C軌（誘餌）**：3 個具體商品，說明為什麼吸睛
- **A軌（利潤）**：3 個具體商品，說明為什麼賺錢
- **B軌（湊單）**：3 個具體商品，說明為什麼必帶

🎤 **戰術話術**（開場 + 促單各 30 秒，可以直接念）

📌 **本週行動清單**（3 點）

3. **話術範例**：
   - 「這東西剛需，天氣一冷成交率自動變高，不用太多話術，直接上架就對了。」
`;
  } else {
    return baseContext + `
---
【Free 版：嗅覺敏銳，但只給香味】

1. **先秀你的市場嗅覺**：開頭直接點破現在的時機點。
   - 範例：「老闆，現在都 ${month} 月了，你如果還沒備貨『${season.split('/')[1]}』相關的東西，這波流量就浪費了！」

2. **輸出格式**：

🎯 **時機點評**（1 段，展現你懂市場）

🛒 **大方向指引**（指出該賣什麼類目，但不給具體型號）
- 類目1 — 為什麼現在該賣
- 類目2 — 為什麼現在該賣
- 類目3 — 為什麼現在該賣

🎤 **開場話術**（30 秒，可以直接念）

💎 **想要更多？**（1 句誘餌，引導升級 Pro）
- 範例：「具體哪幾款是現在蝦皮熱搜前三名？那個數據我都在 Pro 版報告裡整理好了。」

3. **規則**：
- 不要給具體商品型號
- 不要提到 C-A-B 框架
- 用「你」稱呼，像老司機在聊天
`;
  }
}

// ★ 其他模式的 Prompt
const PROMPTS = {
  tesla: `你是 Brother G 決策顧問，專精 Tesla 汽車購買決策。
回答格式：【結論→依據→風險→行動】。
請根據用戶問題，結合 Model 3/Y/S/X 車型差異、預算、場景、家充條件給建議。`,

  travel: `你是 Brother G AI 旅遊規劃師，幫用戶生成行程、飯店、美食。
回答請用【結論→依據→風險→行動】。`,

  esim: `你是 Brother G eSIM 顧問，協助用戶選擇最適合的 eSIM 方案。
回答請用【結論→依據→風險→行動】。`,

  image: `你是 Brother G 圖像生成顧問，協助用戶優化文字提示詞。
回答請用【結論→依據→風險→行動】。`,

  landlord: `你是 Brother G 房東管家 AI，協助租金管理、催繳提示。
回答請用【結論→依據→風險→行動】。`,
};

const ALLOWED_MODES = ['tesla', 'travel', 'shopee', 'esim', 'image', 'landlord'];

// ★ 根據 mode 和 plan 載入對應 Prompt
function loadPrompt(mode, plan = 'free') {
  if (mode === 'shopee') {
    // Shopee 模式：Free/Pro 分流（季節感知版）
    return getShopeePrompt(plan);
  }
  return PROMPTS[mode] || getShopeePrompt('free');
}

function isValidMode(mode) {
  return ALLOWED_MODES.includes(mode);
}

// ★ 解析用戶 plan（優先讀取 tier，向後兼容 plan）
function resolvePlan(userDoc, isLoggedIn) {
  if (!isLoggedIn) return 'guest';
  // 優先讀取 tier（新欄位），其次 plan（舊欄位）
  const rawTier = userDoc?.tier || userDoc?.plan || 'free';
  // 統一轉小寫
  return rawTier.toLowerCase();
}

// 初始化 Firebase Admin（如果還沒初始化）
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
      console.log('✅ Firebase Admin 已初始化');
    } else {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT 環境變數未設置');
    }
  } catch (error) {
    console.error('❌ Firebase Admin 初始化失敗:', error.message);
  }
}

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = 'v1beta';
const MODEL = 'gemini-2.5-flash';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// 取得今日日期字串（YYYY-MM-DD）
function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 取得每日配額上限（依 plan，使用 PLAN_CONFIG）
function getDailyLimitForPlan(plan) {
  return PLAN_CONFIG[plan]?.dailyLimit || PLAN_CONFIG.free.dailyLimit;
}

// 取得或建立用戶資料
async function getUserProfile(uid) {
  if (!admin.apps.length || !uid || uid === 'guest') {
    return { plan: 'free', daily_count: 0 };
  }

  try {
    const db = admin.firestore();
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();

    if (!snap.exists()) {
      // 新用戶 → 建立為 free
      const data = {
        plan: 'free',
        daily_count: 0,
        last_used: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(data);
      console.log('✅ 新用戶已建立:', uid);
      return data;
    }

    const data = snap.data();
    const todayKey = getTodayKey();
    
    // 支援多種日期欄位格式
    let lastUsedDate = null;
    if (data.last_used?.seconds) {
      lastUsedDate = new Date(data.last_used.seconds * 1000).toISOString().slice(0, 10);
    } else if (data.lastUsageDate) {
      lastUsedDate = data.lastUsageDate;
    }

    // 檢查是否需要重置每日用量
    if (lastUsedDate !== todayKey) {
      await ref.update({
        daily_count: 0,
        usedToday: 0,  // 同時重置新欄位
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      data.daily_count = 0;
      data.usedToday = 0;
      console.log('✅ 每日配額已重置:', uid);
    }

    // ★ 確保返回 tier 欄位（用於 resolvePlan）
    console.log('📋 用戶資料:', { uid, tier: data.tier, plan: data.plan, daily_count: data.daily_count });
    return data;
  } catch (error) {
    console.error('❌ getUserProfile 錯誤:', error);
    return { plan: 'free', daily_count: 0 };
  }
}

// 更新使用次數
async function updateUsage(uid) {
  if (!admin.apps.length || !uid || uid === 'guest') {
    return;
  }

  try {
    const db = admin.firestore();
    const ref = db.collection('users').doc(uid);
    const todayKey = getTodayKey();

    await ref.update({
      daily_count: admin.firestore.FieldValue.increment(1),
      last_used: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ 用量已更新:', uid);
  } catch (error) {
    console.error('❌ updateUsage 錯誤:', error);
  }
}

exports.handler = async (event) => {
  // 🚀 調用診斷日誌
  console.log("🚀 Function invoked:", event.path || event.rawUrl);
  console.log("🚀 Method:", event.httpMethod);
  console.log("🚀 Body preview:", (event.body || '').slice(0, 300));

  // OPTIONS 請求（CORS preflight）
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 支援 GET 和 POST
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    if (!API_KEY) {
      throw new Error('Missing GOOGLE_API_KEY / GEMINI_API_KEY');
    }

    // 解析請求參數（支援 GET query 或 POST body）
    let params = {};
    if (event.httpMethod === 'GET') {
      params = event.queryStringParameters || {};
    } else {
      params = JSON.parse(event.body || '{}');
    }

    const uid = params.uid || params.userId || params.userEmail || 'guest';
    const mode = (params.mode || params.m || 'shopee').toLowerCase();
    const input = params.q || params.query || params.textPrompt || params.input || '';

    console.log('🚀 ASK invoked', {
      mode,
      uid,
      preview: input ? input.slice(0, 60) : ''
    });

    if (!input || !input.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing input (q/query/textPrompt/input)' }),
      };
    }

    // 驗證 mode
    if (!isValidMode(mode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Invalid mode. Allowed: ${['tesla', 'travel', 'shopee', 'esim', 'image', 'landlord'].join(', ')}` }),
      };
    }

    // ★ 判斷是否已登入 & 解析 plan
    const isLoggedIn = uid && uid !== 'guest' && uid !== '';
    let userDoc = null;
    let plan = 'guest';
    let dailyCount = 0;
    let dailyLimit = PLAN_CONFIG.guest.dailyLimit;

    if (isLoggedIn) {
      userDoc = await getUserProfile(uid);
      plan = resolvePlan(userDoc, isLoggedIn);
      dailyLimit = getDailyLimitForPlan(plan);
      dailyCount = userDoc.daily_count || 0;
    } else {
      // Guest 用戶：使用 localStorage（前端控制），後端只給 1 次
      plan = 'guest';
      dailyLimit = PLAN_CONFIG.guest.dailyLimit;
    }

    console.log(`🚀 Plan 解析: uid=${uid}, isLoggedIn=${isLoggedIn}, plan=${plan}, usage=${dailyCount}/${dailyLimit}`);

    // 使用次數檢查
    if (dailyCount >= dailyLimit) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: `使用次數已達上限（${dailyCount}/${dailyLimit}），請升級方案或明日再試。`,
          mode,
          uid,
          plan,
          usage: { used: dailyCount, limit: dailyLimit },
        }),
      };
    }

    // ★ 載入對應 prompt（Shopee 會根據 plan 分流）
    const systemPrompt = loadPrompt(mode, plan);
    console.log(`🚀 載入 mode: ${mode} | uid: ${uid} | plan: ${plan}`);

    // 建立 Gemini 請求 Payload
    const createPayload = (prompt, userQuery) => ({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { text: `【用戶輸入】: ${userQuery}` },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 4096,  // ★ 增加到 4096，避免被 thinking 吃掉
        temperature: 0.7,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    });

    // 封裝呼叫 Gemini 的函式
    async function callGemini(modelName) {
      const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${modelName}:generateContent?key=${API_KEY}`;
      console.log(`📤 [Gemini] 嘗試呼叫模型: ${modelName}`);
      console.log(`📤 [Gemini] URL: ${url.replace(API_KEY, '***')}`);

      const payload = createPayload(systemPrompt, input);
      console.log(`📤 [Gemini] Payload preview:`, JSON.stringify(payload).slice(0, 400));

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log(`📥 [Gemini] 響應狀態: ${resp.status} ${resp.statusText}`);

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`❌ [Gemini] API 錯誤: ${resp.status}`, text.slice(0, 500));
        throw new Error(`Gemini API error (${modelName}): ${resp.status} ${text}`);
      }

      const data = await resp.json();
      
      // ★ 統一把 Gemini 回傳轉成純文字 answer
      let answerText = "";

      try {
        // 標準格式：candidates[0].content.parts[0].text
        if (data.candidates && data.candidates.length > 0) {
          const parts = data.candidates[0].content?.parts || [];
          answerText = parts.map(p => p.text || "").join("");
        } 
        // 備用格式：output 陣列
        else if (Array.isArray(data.output) && data.output.length > 0) {
          answerText = data.output.map(p => p.text || "").join("");
        } 
        // 備用格式：直接 text 字串
        else if (typeof data.text === "string") {
          answerText = data.text;
        }

        if (!answerText) {
          console.warn("[Gemini] Empty answer parsed, raw data:", JSON.stringify(data).slice(0, 600));
          answerText = ""; // 讓外層處理
        }
      } catch (e) {
        console.error("[Gemini] parse error:", e, JSON.stringify(data).slice(0, 400));
        answerText = "";
      }

      console.log(`📥 [Gemini] 回傳內容長度: ${answerText.length}`);
      console.log(`📥 [Gemini] 回傳預覽:`, answerText.slice(0, 300));
      
      return answerText.trim();
    }

    let output = '';

    // 🔒 固定使用 gemini-2.5-flash（用戶指定，不要亂改）
    try {
      output = await callGemini('gemini-2.5-flash');
    } catch (err) {
      console.warn('⚠️ gemini-2.5-flash 失敗:', err.message);
      
      // 備用模型：gemini-2.0-flash（不要用已棄用的 1.5-flash）
      console.log('🔄 切換至備用模型 gemini-2.0-flash...');
      try {
        output = await callGemini('gemini-2.0-flash');
      } catch (err2) {
        console.error('❌ 備用模型 gemini-2.0-flash 也失敗:', err2.message);
        throw err2;
      }
    }

    // ★ 如果 output 為空，給一個 fallback 訊息（而非直接報錯）
    if (!output) {
      console.warn('⚠️ Gemini 回傳為空，使用 fallback 訊息');
      output = '目前 AI 沒有給出明確內容，請稍後再試或換個問法。';
    }

    // 成功產生分析 → 更新使用次數
    let newUsedCount = dailyCount;
    if (isLoggedIn) {
      await updateUsage(uid);
      newUsedCount = dailyCount + 1;
    }

    console.log(`✅ 成功產生分析: mode=${mode}, uid=${uid}, plan=${plan}, length=${output.length}`);
    console.log(`✅ 回傳預覽:`, output.slice(0, 300));

    // ★ 統一回傳格式：包含 plan 和 usage 資訊
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        mode,
        uid,
        plan,                           // ★ 回傳 plan
        usage: {                        // ★ 回傳 usage 資訊
          used: newUsedCount,
          limit: dailyLimit,
        },
        answer: output,   // ★ 前端可能讀 answer
        output: output,   // ★ 前端可能讀 output
        result: output,   // ★ 前端可能讀 result
        timestamp: Date.now(),
      }),
    };
  } catch (err) {
    console.error('🔥 ask.js error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: `服務暫時忙碌，請稍後再試。\n錯誤：${err.message}`,
        timestamp: Date.now(),
      }),
    };
  }
};

