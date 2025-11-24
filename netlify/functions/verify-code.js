// netlify/functions/verify-code.js
// 開通碼驗證（後端驗證，不暴露開通碼）

// 開通碼對應表（後端驗證）
const ACTIVATION_CODES = {
  'bg888': 'PRO',
  'bg688': 'PRO',
  'bg1688': 'MASTER',
  'bg588': 'MASTER'
};

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
    const { code, userId } = body;

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
      
      // TODO: 這裡應該記錄到數據庫，標記該開通碼已被使用
      // TODO: 記錄 userId 和 plan 的對應關係
      
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

