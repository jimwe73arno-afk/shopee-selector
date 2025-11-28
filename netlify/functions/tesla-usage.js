// netlify/functions/tesla-usage.js
// Tesla 專用：取得/更新用戶今日使用量（讓前端能同步狀態）

const admin = require('firebase-admin');

// 初始化 Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

// 取得今天日期字串（YYYY-MM-DD）
function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const TESLA_FREE_LIMIT = 10; // Q1-Q10 免費
const TESLA_PRO_LIMIT = 30;  // Pro 每天 30 題

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 支援 GET（取得狀態）和 POST（更新用量）
    let userId, action;
    
    if (event.httpMethod === 'GET') {
      userId = event.queryStringParameters?.userId;
      action = 'get';
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      userId = body.userId;
      action = body.action || 'get'; // 'get' | 'increment'
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing userId' })
      };
    }

    const today = getTodayKey();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    // 取得用戶資料
    const userData = userDoc.exists ? userDoc.data() : {};
    const isPro = userData.tier === 'pro';
    const dailyLimit = isPro ? TESLA_PRO_LIMIT : TESLA_FREE_LIMIT;

    // Tesla 專用今日用量（分開計算，不影響 Shopee）
    const teslaUsage = userData.teslaUsage || {};
    let todayUsed = teslaUsage[today] || 0;

    // 如果是新的一天，重置用量
    if (!teslaUsage[today] && Object.keys(teslaUsage).length > 0) {
      // 清除舊日期的用量記錄
      console.log(`[tesla-usage] New day ${today}, resetting usage for user ${userId}`);
    }

    // 如果是 increment action
    if (action === 'increment') {
      // 檢查是否超過限制
      if (todayUsed >= dailyLimit) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: false,
            errorCode: 'OVER_LIMIT',
            todayUsed,
            dailyLimit,
            isPro,
            remaining: 0
          })
        };
      }

      // 增加用量
      todayUsed += 1;
      await userRef.set({
        teslaUsage: {
          [today]: todayUsed
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`[tesla-usage] User ${userId} used ${todayUsed}/${dailyLimit} on ${today}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        todayUsed,
        dailyLimit,
        remaining: Math.max(0, dailyLimit - todayUsed),
        isPro,
        today
      })
    };

  } catch (error) {
    console.error('[tesla-usage] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

