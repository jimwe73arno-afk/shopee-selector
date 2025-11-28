// netlify/functions/check-ad-status.js
// 檢查用戶今天是否已看過廣告

const admin = require('firebase-admin');

// 初始化 Firebase Admin（如果還沒初始化）
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

  try {
    // 支援 GET 和 POST
    let userId;
    
    if (event.httpMethod === 'GET') {
      userId = event.queryStringParameters?.userId;
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      userId = body.userId;
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

    if (!userDoc.exists) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true, 
          hasWatchedAdToday: false,
          today
        })
      };
    }

    const userData = userDoc.data();
    const adUnlock = userData.adUnlock || {};
    const todayUnlock = adUnlock[today] || {};
    
    // 檢查今天是否解鎖了 tesla_q10
    const hasWatchedAdToday = todayUnlock.tesla_q10 === true;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        hasWatchedAdToday,
        today,
        isPro: userData.tier === 'pro'
      })
    };

  } catch (error) {
    console.error('[check-ad-status] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

