// netlify/functions/analyze.js
// Shopee Analyst 穩定版：整合 Firebase 驗證身份與配額

const admin = require('firebase-admin');

// 初始化 Firebase Admin（如果還沒初始化）
if (!admin.apps.length) {
  try {
    // 從環境變數讀取 Firebase Service Account（JSON 字串）
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
      console.log('✅ Firebase Admin 已初始化');
    } else {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT 環境變數未設置，將跳過 Firebase 驗證');
    }
  } catch (error) {
    console.error('❌ Firebase Admin 初始化失敗:', error.message);
  }
}

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = 'v1beta';
const MODEL = 'gemini-2.5-flash';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// 白名單（只有這些 email 才能使用 MASTER）
const WHITELIST_EMAILS = ['jimwe73arno@gmail.com'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const email = (body.email || '').trim();
    const textPrompt = (body.textPrompt || '').trim();

    if (!API_KEY) {
      throw new Error('Missing GOOGLE_API_KEY');
    }
    if (!textPrompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Empty prompt' })
      };
    }

    let userTier = 'FREE';
    let quota = 5;
    let usedToday = 0;
    let canUse = true;

    // 🧩 Firebase 驗證（如果有設置）
    if (admin.apps.length && email) {
      try {
        const db = admin.firestore();
        const userRef = db.collection('users').doc(email);
        const userDoc = await userRef.get();

        const today = new Date().toISOString().slice(0, 10);

        if (!userDoc.exists) {
          // 新用戶 → 建立為 FREE
          await userRef.set({
            tier: 'FREE',
            quota: 5,
            usedToday: 0,
            lastReset: today,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log('✅ 新用戶已建立:', email);
          // 新用戶默認可以繼續使用
        } else {
          const userData = userDoc.data();
          
          // 檢查是否需要重置每日配額
          if (userData.lastReset !== today) {
            await userRef.update({
              usedToday: 0,
              lastReset: today,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            userData.usedToday = 0;
            userData.lastReset = today;
          }

          userTier = userData.tier || 'FREE';
          quota = userData.tier === 'PRO' ? 20 : 5;
          usedToday = userData.usedToday || 0;

          // 白名單檢查（只有白名單用戶才能使用 MASTER）
          const isWhitelisted = WHITELIST_EMAILS.includes(email);
          if (userTier === 'MASTER' && !isWhitelisted) {
            console.warn(`⚠️ 用戶 ${email} 試圖使用 MASTER 但不在白名單，降級為 PRO`);
            userTier = 'PRO';
            quota = 20;
          } else if (isWhitelisted && userTier !== 'MASTER') {
            // 白名單用戶自動升級為 MASTER
            userTier = 'MASTER';
            quota = 50; // Master 配額更高
          } else if (userTier === 'MASTER') {
            quota = 50; // Master 配額更高
          }

          // 檢查配額（只有當配額真的用完時才阻擋）
          if (usedToday >= quota) {
            canUse = false;
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                result: `⚠️ 今日已用完 ${quota} 次額度，請明日再試或升級方案。\n\n（剩餘配額：${quota - usedToday}/${quota}）`
              })
            };
          }
        }
      } catch (firebaseError) {
        console.error('❌ Firebase 操作錯誤:', firebaseError);
        console.warn('⚠️ 繼續使用默認值（FREE tier，允許使用）');
        // Firebase 錯誤不阻擋，繼續使用默認值（允許免費使用）
        userTier = 'FREE';
        quota = 5;
        usedToday = 0;
        canUse = true;
      }
    } else {
      // 沒有 Firebase 或沒有 email，使用默認值（允許使用）
      console.warn('⚠️ Firebase 未初始化或無 email，使用默認 FREE tier');
      userTier = 'FREE';
      quota = 5;
      usedToday = 0;
      canUse = true;
    }

    // 🧩 Master 鎖死（如果前端傳來的 tier 是 MASTER 但不在白名單）
    if (body.tier === 'MASTER' && email && !WHITELIST_EMAILS.includes(email)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          result: '🚧 Master 模式暫未開放，請升級 PRO 專業版。'
        })
      };
    }

    console.log(`📥 Request: ${email || 'anonymous'} | Tier: ${userTier} | Used: ${usedToday}/${quota}`);

    // 統一用「Pro 等級」的指令
    const systemInstruction = `
你是 BrotherG 的【Shopee 直播選品戰術顧問】。

請把下面的賣家自述，整理成一張「直播決策卡」，語氣要有能量、但非常務實。

請用 Markdown 格式輸出，結構如下：

### 📊 市場判斷（一句話總結）
- 用一句話點出這個賣家的核心問題與機會。

### 🎯 C-A-B 排品策略
- 🪝 **C 軌（引流款）**：寫出 1–2 種適合當流量款的品類／價格帶，說明為什麼。
- 💰 **A 軌（利潤款）**：寫出 1–2 種適合當毛利款的品類／價格帶，說明利潤邏輯。
- 📦 **B 軌（湊單款）**：寫出 1–2 種適合當湊單／加價購的商品，說明搭配思路。

### 🗣️ 主播話術示範（約 120–180 字）
- 幫他寫一段可以直接在直播講的口播稿，口氣像「藍教主」：有節奏、有畫面感，但不要太誇張吹噓。

### ✅ 下一步行動建議
- 用條列列出 3 個「今天就可以做」的具體動作（例如：先把哪 3 個品類拉出來，怎麼排在貨架上，直播怎麼先測試）。
`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemInstruction}\n\n【賣家輸入】:\n${textPrompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: userTier === 'MASTER' ? 8192 : 900,
        temperature: userTier === 'FREE' ? 0.65 : 0.75,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    console.log(`🚀 Calling Gemini API: ${MODEL} | Tier: ${userTier}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Gemini API Error (${response.status}):`, text);
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    const resultText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '目前沒有產生內容，請稍後再試。';

    // 🧩 扣減配額（如果有 Firebase）
    if (admin.apps.length && email && canUse) {
      try {
        const db = admin.firestore();
        const userRef = db.collection('users').doc(email);
        await userRef.update({
          usedToday: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ 配額已扣減:', email);
      } catch (firebaseError) {
        console.error('❌ 扣減配額失敗:', firebaseError);
      }
    }

    console.log(`✅ Response generated: ${resultText.length} characters`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: resultText }),
    };
  } catch (err) {
    console.error('🔥 analyze error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        result: `⚠️ 分析服務暫時忙碌，請稍後再試。\n\n錯誤訊息：${err.message}`,
      }),
    };
  }
};
