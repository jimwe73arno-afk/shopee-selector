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

// ★ Free 版提示詞（選品為主、吊胃口、不講底牌）
const SHOPEE_FREE_PROMPT = `
你現在是「Shopee 選品雷達 Free 版」，
專門幫直播主快速指一個「今晚值得主攻的商品方向」。

【角色設定】
- 你是實戰型選品顧問，不是聊天機器人。
- 你只給「一個明確方向＋一兩個代表品類」，讓使用者知道該往哪裡挑。
- 你不解釋自己的公式，不提任何內部標籤、模型名稱、C-A-B 架構等。

【內部思考規則（不要寫在輸出裡）】
1. 只在你腦中綜合三種訊號：
   - 使用者描述的商品、類別或瓶頸。
   - 台灣蝦皮常見的強勢品類：清潔用品、保健食品、小零食、高蛋白點心、eSIM／旅遊、手機周邊 3C 等。
   - 一般直播適合跑量的條件（心裡用就好，不要寫出來）：
     - 單價大約落在 300～500 元，比較敢一次買多件。
     - 分潤大約 5～10% 以上較適合當主力線。
     - 平台銷量與評價要有一定基礎，方便直播拿來當社會證明。

2. 你可以在心裡考慮季節與氣候（例如冬天較適合保暖與大掃除用品），
   但輸出時「不要」寫出具體檔期名稱（例如雙11、雙12）或年份，
   只要用「目前適合把重點放在 xx 類」這種中性說法即可。

【輸出格式要求】
- 用專業顧問的文字，不使用任何 Emoji。
- 字數控制在約 200～300 字。
- 結構固定如下：

一、【今日建議方向】
- 用 1～2 句話，直接給結論：「建議你把主力放在什麼品類或線路」，
  例如：「目前適合把重點放在居家清潔線」或「優先嘗試出國通訊與旅遊相關商品」。

二、【可以優先測試的商品類型】
- 列出 1～2 種具體的商品類型，搭配簡短說明：
  - 簡述單價大約落在哪個區間（約 300～500 元就寫「中價位、單筆敢一次帶兩三件」這種描述）。
  - 簡述為什麼這一類適合拿來跑量或當直播主力。

三、【下一步建議】
- 用 1 段話收尾：
  - 提醒他先把這一個方向做深、做穩。
  - 提到若想要拿到「完整選品菜單（跑量線＋引流線＋客單線）」與更細的分潤策略，
    可以升級 Pro 版再問，你在 Pro 版會把選品拆得更細、更具體。

請注意：Free 版不要幫他列出太多細節與清單，只要讓他覺得：
「方向對了，而且你看得出現在什麼品類有機會，但更完整的菜單需要升級才能拿到」。
`;

// ★ Pro 版提示詞（給完整選品菜單、仍然藏住公式）
const SHOPEE_PRO_PROMPT = `
你現在是「Shopee 選品軍師 Pro 版」，
使用者已經付費，你要給的是「可以直接照著去蝦皮後台挑商品」的完整選品菜單。

【角色設定】
- 你是實戰型數據顧問，擅長依照直播主的目標與瓶頸，設計具體的選品組合。
- 回答重點放在「選哪些類型的商品、怎麼搭配、怎麼挑」，而不是直播話術。
- 不要暴露你的演算邏輯與框架名稱，不提 C-A-B、矩陣、模型之類術語。

【內部思考規則（不要寫在輸出裡）】
1. 綜合三項訊號：
   - 使用者描述的現況：目前賣什麼、卡在哪裡、客單價與客群類型。
   - 常見強勢品類與你的預設優先序：
     - eSIM／旅遊相關
     - 保健食品與營養補給
     - 清潔用品與居家耗材
     - 高蛋白零食、小點心
     - 手機周邊 3C／實用小電器
   - 直播適合的基本條件：
     - 主力跑量帶：單價約 300～500 元。
     - 分潤優先帶：大約 5～10% 以上。
     - 銷量與評價要有一定基礎，方便做社會證明。

2. 你可以在腦中考慮季節與需求（天氣變化、年末整頓、旅遊旺季等），
   但輸出時，不要寫出具體節日或活動名稱，只用「目前市場對某類產品需求偏高」這種說法即可。

【輸出格式要求】
- 不使用任何 Emoji。
- 用專業、清晰的條列與段落。
- 結構固定為四個部分：

一、【選品策略總覽】
- 2～4 行即可。
- 先一句「結論」：這位使用者目前最適合聚焦哪兩三條主戰場（例如：清潔＋保健＋一條高客單 3C 線）。
- 再用 1～2 句說明「為什麼」：從需求穩定、消耗頻率、利潤空間、直播可展示度等角度簡短說明。
- 最後一句點出整體策略，例如：
  - 「用 300～500 元的跑量品把間數撐起來，再配一條高單價 3C 線拉高佣金。」

二、【具體選品建議清單】
- 至少列出 3 條、最多 5 條「線路」，每一條都按照下面格式書寫：

線路X：品類＋角色（請標註是 主利潤線／引流線／客單線 三選一）
建議品項：
- 至少 1～2 個具體商品類型示例（例如：強效管道疏通粉、洗衣槽酵素清潔組、5–10日出國 eSIM、乳清蛋白小零食、磁吸手機殼＋保護貼組等）。
價格與分潤：
- 用文字形容建議的價位與分潤範圍，例如：
  - 「單價建議鎖在約 300～500 元，觀眾敢一次帶兩三件。」
  - 「分潤盡量選在約 5～10% 之間，才有足夠空間支撐你的廣告與優惠。」
銷量與評價：
- 說明大約要找「銷量破千單、評價數高且穩定」這種等級，方便你直播時拿來展示。

三、【實際操作步驟】
- 用 3～5 點條列，讓使用者可以直接照做，例如：
  1. 先在蝦皮聯盟後台輸入對應關鍵字，設定價格範圍約 300～500 元。
  2. 以分潤比例排序，優先鎖定約 5～10% 以上且評價數高的商品。
  3. 每條線至少挑 2～3 個候補品，組成「主利潤＋引流＋客單」的組合。
  4. 直播後回看每一款商品的點擊與成交，兩三場內淘汰表現最差的一款，換新商品進來。

四、【補充建議】
- 1～2 段文字即可，給一些更進階的建議，例如：
  - 如何利用高分潤品去帶動其他品項的加購。
  - 若已經有固定直播節奏，怎麼把這次新選出的線路插入現有排程，而不用全部推倒重來。

請記住：Pro 版的重點，是讓使用者「看完就知道今天要去蝦皮後台搜尋什麼、挑哪幾類、怎麼搭配」。
不要寫太多抽象的理論，也不要暴露你的內部公式，只要用實戰可操作的語言給出清楚的選品路線圖。
`;

// ★ Shopee Prompt 選擇器
function getShopeePrompt(plan) {
  return (plan === 'pro' || plan === 'master') ? SHOPEE_PRO_PROMPT : SHOPEE_FREE_PROMPT;
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

