// netlify/functions/ask.js — BrotherGEV Unified /ask
// 統一後端入口，支援多模式 AI 分析

const admin = require('firebase-admin');
const { loadPrompt, isValidMode } = require('../../lib/router');

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

// 取得每日配額上限（依 plan）
function getDailyLimitForPlan(plan) {
  if (plan === 'pro') return 20;
  if (plan === 'master') return 50;
  return 5; // free
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
    const lastUsedDate = data.last_used ? new Date(data.last_used.seconds * 1000).toISOString().slice(0, 10) : null;

    // 檢查是否需要重置每日用量
    if (lastUsedDate !== todayKey) {
      await ref.update({
        daily_count: 0,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      data.daily_count = 0;
      console.log('✅ 每日配額已重置:', uid);
    }

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

    // 使用次數控制（非 guest 用戶）
    if (uid !== 'guest') {
      const user = await getUserProfile(uid);
      const limit = getDailyLimitForPlan(user.plan || 'free');
      const dailyCount = user.daily_count || 0;

      if (dailyCount >= limit) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: `使用次數已達上限（${dailyCount}/${limit}），請升級方案或明日再試。`,
            mode,
            uid,
          }),
        };
      }
    }

    // 載入對應 prompt
    const systemPrompt = loadPrompt(mode);
    console.log(`🚀 載入 mode: ${mode} | uid: ${uid}`);

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
        maxOutputTokens: 1024,
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
    if (uid !== 'guest') {
      await updateUsage(uid);
    }

    console.log(`✅ 成功產生分析: mode=${mode}, uid=${uid}, length=${output.length}`);
    console.log(`✅ 回傳預覽:`, output.slice(0, 300));

    // 統一回傳格式：同時提供 answer 和 output（前端可能讀任一個）
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        mode,
        uid,
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

