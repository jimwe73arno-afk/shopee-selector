// netlify/functions/verify-code.js
// 開通碼驗證（後端驗證 + 更新 Firestore）

const admin = require('firebase-admin');

// 開通碼對應表（後端驗證）
const ACTIVATION_CODES = {
  'bg888': 'pro',
  'bg688': 'pro',
  'bg1688': 'master',
  'bg588': 'master',
  'brotherg2024': 'pro',  // 額外備用碼
};

// 初始化 Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
      console.log('✅ Firebase Admin 已初始化 (verify-code)');
    }
  } catch (error) {
    console.error('❌ Firebase Admin 初始化失敗:', error.message);
  }
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ valid: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { code, userId, email } = body;

    if (!code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: '開通碼不能為空' })
      };
    }

    // 驗證開通碼（不區分大小寫）
    const normalizedCode = code.toLowerCase().trim();
    const plan = ACTIVATION_CODES[normalizedCode];

    if (plan) {
      console.log(`✅ 開通碼驗證成功: ${normalizedCode} → ${plan} | 用戶: ${userId || 'anonymous'}`);
      
      // ★ 更新 Firestore（如果有 userId）
      if (userId && admin.apps.length) {
        try {
          const db = admin.firestore();
          await db.collection('users').doc(userId).set({
            tier: plan,
            activatedAt: admin.firestore.FieldValue.serverTimestamp(),
            activationCode: normalizedCode,
            email: email || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`✅ Firestore 已更新: ${userId} → ${plan}`);
        } catch (dbError) {
          console.error('❌ Firestore 更新失敗:', dbError.message);
          // 不影響回傳，前端會自己更新
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          plan: plan
        })
      };
    } else {
      console.log(`❌ 開通碼驗證失敗: ${normalizedCode} | 用戶: ${userId || 'anonymous'}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: '開通碼無效'
        })
      };
    }

  } catch (error) {
    console.error('❌ 驗證開通碼錯誤:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        valid: false,
        error: error.message || '服務器錯誤'
      })
    };
  }
};

