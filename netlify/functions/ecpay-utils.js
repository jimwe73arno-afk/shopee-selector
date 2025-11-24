/**
 * ECPay Utility Module - Native Implementation
 * 使用原生方式生成綠界金流付款表單，不依賴 SDK
 */

const crypto = require('crypto');

// ECPay 配置
const ECPAY_CONFIG = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '3401733',
  HashKey: process.env.ECPAY_HASH_KEY || 'XRnEytVbHLPn8RGi',
  HashIV: process.env.ECPAY_HASH_IV || 'FHoRJRm7HVvxF2Px',
};

/**
 * 生成 CheckMacValue (綠界金流驗證碼)
 */
function generateCheckMacValue(params) {
  const sortedKeys = Object.keys(params).sort();
  const checkString = sortedKeys
    .filter(key => params[key] !== '')
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const hashString = `HashKey=${ECPAY_CONFIG.HashKey}&${checkString}&HashIV=${ECPAY_CONFIG.HashIV}`;
  const encodedString = encodeURIComponent(hashString)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
  
  const hash = crypto.createHash('sha256').update(encodedString).digest('hex').toUpperCase();
  return hash;
}

/**
 * 生成付款表單 HTML
 * @param {string} orderId - 訂單編號
 * @param {string} planName - 方案名稱 ('PRO' | 'MASTER')
 * @param {number} amount - 金額
 * @param {string} userId - 用戶 ID (會放在 CustomField1)
 * @returns {string} HTML 表單
 */
function generatePaymentForm(orderId, planName, amount, userId) {
  const hostUrl = process.env.HOST_URL || 'https://monumental-taiyaki-e878bd.netlify.app';
  
  // 生成交易時間（格式：yyyyMMddHHmmss）
  const now = new Date();
  const merchantTradeDate = now.toISOString()
    .replace(/[-:]/g, '')
    .split('.')[0]
    .replace('T', '');

  // ECPay 付款參數
  const params = {
    MerchantID: ECPAY_CONFIG.MerchantID,
    MerchantTradeNo: orderId,
    MerchantTradeDate: merchantTradeDate,
    PaymentType: 'aio',
    TotalAmount: amount.toString(),
    TradeDesc: `BrotherG AI - ${planName} 方案訂閱`,
    ItemName: `BrotherG AI - ${planName} 方案`,
    ReturnURL: `${hostUrl}/.netlify/functions/payment-webhook`,
    ClientBackURL: `${hostUrl}/payment/success`,
    ChoosePayment: 'Credit',
    EncryptType: '1',
    CustomField1: userId || '',
    OrderResultURL: `${hostUrl}/payment/success`,
  };

  // 生成 CheckMacValue
  params.CheckMacValue = generateCheckMacValue(params);

  // ECPay 正式環境 URL
  const ecpayUrl = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

  // 生成 HTML 表單
  const formHtml = `
    <form id="__ecpayForm" method="post" action="${ecpayUrl}">
      ${Object.keys(params).map(key => 
        `<input type="hidden" name="${key}" value="${params[key]}">`
      ).join('\n      ')}
    </form>
    <script>
      document.getElementById('__ecpayForm').submit();
    </script>
  `;

  return formHtml;
}

/**
 * 驗證 ECPay 回傳的 CheckMacValue
 * @param {object} params - ECPay 回傳的參數
 * @returns {boolean} 是否驗證通過
 */
function validateCheckMacValue(params) {
  try {
    const receivedCheckMacValue = params.CheckMacValue || '';
    delete params.CheckMacValue;
    
    const calculatedCheckMacValue = generateCheckMacValue(params);
    return receivedCheckMacValue === calculatedCheckMacValue;
  } catch (error) {
    console.error('❌ CheckMacValue 驗證失敗:', error);
    return false;
  }
}

module.exports = {
  generatePaymentForm,
  validateCheckMacValue,
};
