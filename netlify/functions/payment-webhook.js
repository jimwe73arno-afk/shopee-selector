/**
 * Netlify Function: Payment Webhook
 * 接收 ECPay 的 Server-to-Server 通知
 * 這是最重要的部分 - 處理付款成功後的用戶開通邏輯
 */

const { validateCheckMacValue } = require('./ecpay-utils');

exports.handler = async (event, context) => {
  // 設置 callbackWaitsForEmptyEventLoop 為 false
  context.callbackWaitsForEmptyEventLoop = false;

  // 只接受 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Method Not Allowed',
    };
  }

  try {
    // ECPay 會以 application/x-www-form-urlencoded 格式發送數據
    // 需要解析表單數據
    const params = {};
    
    if (event.body) {
      // 解析 URL encoded form data
      const formData = event.body.split('&');
      formData.forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[key] = decodeURIComponent(value);
        }
      });
    }

    console.log('📨 收到 ECPay Webhook:', {
      MerchantTradeNo: params.MerchantTradeNo,
      RtnCode: params.RtnCode,
      RtnMsg: params.RtnMsg,
      PaymentDate: params.PaymentDate,
      CustomField1: params.CustomField1,
    });

    // 驗證 CheckMacValue（確保是真正的 ECPay 發送的）
    const isValid = validateCheckMacValue(params);
    
    if (!isValid) {
      console.error('❌ CheckMacValue 驗證失敗！可能是偽造的請求');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Invalid checksum',
      };
    }

    // 檢查付款是否成功 (RtnCode === '1' 表示成功)
    if (params.RtnCode === '1') {
      const userId = params.CustomField1 || 'anonymous';
      const orderId = params.MerchantTradeNo;
      const paymentAmount = params.TradeAmt;

      console.log(`✅ 付款成功！訂單: ${orderId} | 用戶: ${userId} | 金額: ${paymentAmount}`);

      // TODO: 在這裡實現用戶開通邏輯
      // 1. 根據 userId 更新用戶的訂閱狀態
      // 2. 根據付款金額判斷是 PRO ($688) 還是 MASTER ($1688)
      // 3. 設置訂閱到期時間（例如：30天後）
      // 4. 發送確認郵件或通知
      
      // 範例（使用 Prisma）：
      // const tier = paymentAmount === '688' ? 'pro' : 'master';
      // await prisma.user.update({
      //   where: { id: userId },
      //   data: {
      //     tier: tier,
      //     subscriptionStatus: 'active',
      //     subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天後
      //   }
      // });
      //
      // await prisma.order.update({
      //   where: { orderId: orderId },
      //   data: { status: 'completed', paidAt: new Date() }
      // });

      // 回傳給 ECPay 確認收到（重要！必須回傳 "1|OK"）
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: '1|OK',
      };
    } else {
      // 付款失敗
      console.warn(`⚠️ 付款失敗: ${params.RtnMsg}`);
      
      // TODO: 處理付款失敗的情況
      // 例如：記錄失敗原因、通知用戶等

      // 仍然回傳 "1|OK" 告訴 ECPay 我們已經收到通知
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: '1|OK',
      };
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    
    // 發生錯誤時，也回傳 "1|OK" 避免 ECPay 重複發送
    // 但應該記錄錯誤以便後續排查
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: '1|OK',
    };
  }
};

