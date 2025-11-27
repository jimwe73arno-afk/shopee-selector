/**
 * Netlify Function: PayPal Checkout
 * 處理 PayPal 付款請求
 */

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'AY7wfWC5-yUou1ah2heHIBJ836KOr1sdpOjncNp2iThy9nsUjDIdDJpkOoYiPVqZn0H45IRhWniyAy2y';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || 'EP539RDDowO8zT9zgamrQdEs6RtKVCZAq6eyhun2SyHpuKBifEv9ygR8OuiXbTeFxzID63imfAOmmtYY';

// PayPal API Base URL (使用 sandbox 測試，正式環境改成 api-m.paypal.com)
const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

// 產品定價表
const PRODUCTS = {
  'TESLA_PRO': {
    name: 'Tesla Pro 決策檔案',
    description: '永久保存你的 Tesla 購車決策紀錄',
    price: '1.99',
    currency: 'USD'
  },
  'SHOPEE_PRO': {
    name: 'Shopee Pro 選品會員',
    description: '每日 20 次深度選品分析',
    price: '19.99',
    currency: 'USD'
  },
  'PRO': {
    name: 'BrotherGAi Pro 會員',
    description: '解鎖全部 Pro 功能',
    price: '19.99',
    currency: 'USD'
  }
};

// 獲取 PayPal Access Token
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal auth error:', error);
    throw new Error('Failed to get PayPal access token');
  }

  const data = await response.json();
  return data.access_token;
}

// 創建 PayPal 訂單
async function createPayPalOrder(product, returnUrl, cancelUrl) {
  const accessToken = await getPayPalAccessToken();
  
  const orderData = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: `${product.name}_${Date.now()}`,
      description: product.description,
      amount: {
        currency_code: product.currency,
        value: product.price
      }
    }],
    application_context: {
      brand_name: 'BrotherGAi',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl
    }
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderData)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal create order error:', error);
    throw new Error('Failed to create PayPal order');
  }

  return await response.json();
}

exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // 處理 OPTIONS 請求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // 只接受 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { product, returnUrl, cancelUrl, userId } = body;

    // 驗證產品
    const productInfo = PRODUCTS[product];
    if (!productInfo) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          ok: false, 
          error: `Invalid product. Available: ${Object.keys(PRODUCTS).join(', ')}` 
        }),
      };
    }

    console.log(`📝 創建 PayPal 訂單: ${product} | 價格: ${productInfo.price} ${productInfo.currency} | 用戶: ${userId || 'anonymous'}`);

    // 設定返回 URL
    const baseUrl = event.headers.origin || event.headers.referer || 'https://monumental-taiyaki-e878bd.netlify.app';
    const finalReturnUrl = returnUrl || `${baseUrl}/payment/success?product=${product}`;
    const finalCancelUrl = cancelUrl || `${baseUrl}/payment/cancel?product=${product}`;

    // 創建 PayPal 訂單
    const order = await createPayPalOrder(productInfo, finalReturnUrl, finalCancelUrl);

    // 找到付款連結
    const approveLink = order.links?.find(link => link.rel === 'approve');
    
    if (!approveLink) {
      throw new Error('No approval link in PayPal response');
    }

    console.log(`✅ PayPal 訂單創建成功: ${order.id}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        orderId: order.id,
        checkoutUrl: approveLink.href,
        product: product,
        price: productInfo.price,
        currency: productInfo.currency
      }),
    };

  } catch (error) {
    console.error('❌ PayPal checkout error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};

