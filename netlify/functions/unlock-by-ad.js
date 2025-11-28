// netlify/functions/unlock-by-ad.js
// 記錄用戶今天已看過廣告，解鎖 Q10 決策卡

const admin = require('firebase-admin');

// 初始化 Firebase Admin（如果還沒初始化）
if (!admin.apps.length) {
  // 使用環境變數中的 service account
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // 備用：使用預設憑證（在 Firebase 環境中）
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

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, scene = 'tesla_q10' } = body;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing userId' })
      };
    }

    const today = getTodayKey();
    const userRef = db.collection('users').doc(userId);
    
    // 更新用戶的廣告解鎖狀態
    await userRef.set({
      adUnlock: {
        [today]: {
          [scene]: true,
          unlockedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[unlock-by-ad] User ${userId} unlocked ${scene} on ${today}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        today,
        scene,
        message: 'Ad unlock recorded successfully'
      })
    };

  } catch (error) {
    console.error('[unlock-by-ad] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

