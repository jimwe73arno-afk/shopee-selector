/**
 * Netlify Function: Payment Checkout
 * 處理結賬請求，生成 ECPay 付款表單
 */

const { generatePaymentForm } = require('./ecpay-utils');

exports.handler = async (event, context) => {
  // 設置 callbackWaitsForEmptyEventLoop 為 false
  context.callbackWaitsForEmptyEventLoop = false;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // 處理 OPTIONS 請求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // 只接受 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: 'Method Not Allowed',
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { plan, userId } = body;

    // 驗證輸入
    if (!plan || !['PRO', 'MASTER'].includes(plan)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid plan. Must be PRO or MASTER',
        }),
      };
    }

    // 確定金額
    const amountMap = {
      PRO: 688,
      MASTER: 1688,
    };
    const amount = amountMap[plan];

    // 生成唯一訂單編號
    const orderId = `BG${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    console.log(`📝 創建訂單: ${orderId} | 方案: ${plan} | 金額: ${amount} | 用戶: ${userId || 'anonymous'}`);

    // TODO: 在這裡應該將訂單信息保存到數據庫
    // 例如：await prisma.order.create({ data: { orderId, plan, amount, userId, status: 'pending' } });

    // 生成付款表單 HTML
    const paymentFormHtml = generatePaymentForm(orderId, plan, amount, userId || 'anonymous');

    // 返回 HTML 表單（前端會自動提交）
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>正在跳轉到付款頁面...</title>
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>正在跳轉到付款頁面...</h2>
            <p>請稍候，即將為您開啟綠界金流付款頁面。</p>
          </div>
          ${paymentFormHtml}
          <script>
            // 自動提交表單
            window.onload = function() {
              document.getElementById('__ecpayForm').submit();
            };
          </script>
        </body>
        </html>
      `,
    };
  } catch (error) {
    console.error('❌ Payment checkout error:', error);
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


