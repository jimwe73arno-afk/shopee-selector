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

    const uid = params.uid || params.userId || 'guest';
    const mode = (params.mode || params.m || 'shopee').toLowerCase();
    const input = params.q || params.query || params.textPrompt || params.input || '';

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

    // 呼叫 Gemini API
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: `【用戶輸入】: ${input}` },
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
    };

    // 🚀 [ASK] 調用前日誌
    console.log("🚀 [ASK] 模式:", mode);
    console.log("🚀 [ASK] 問題:", input);
    console.log("🚀 [ASK] URL:", url.replace(API_KEY, '***KEY***'));
    console.log("🚀 [ASK] Payload:", JSON.stringify(payload).slice(0, 500));

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log("🚀 [ASK] 響應狀態:", resp.status, resp.statusText);

    if (!resp.ok) {
      const text = await resp.text();
      console.error("❌ [ASK] Gemini API 錯誤:", resp.status, text);
      throw new Error(`Gemini API error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    console.log("✅ [Gemini 回傳成功]", JSON.stringify(data).slice(0, 400));
    
    const output = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    console.log("✅ [ASK] 輸出長度:", output.length);

    if (!output) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'AI 回覆為空，請稍後再試。',
          mode,
          uid,
        }),
      };
    }

    // 成功產生分析 → 更新使用次數
    if (uid !== 'guest') {
      await updateUsage(uid);
    }

    console.log(`✅ 成功產生分析: mode=${mode}, uid=${uid}, length=${output.length}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        mode,
        uid,
        output,
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

