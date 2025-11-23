/**
 * ECPay Utility Module
 * 處理綠界金流的工具函數
 */

const ecpay_aio = require('ecpay_aio_nodejs');

// ECPay 配置
const ECPAY_CONFIG = {
  OperationMode: 'Production', // Production or Test
  MercProfile: {
    MerchantID: process.env.ECPAY_MERCHANT_ID || '',
    HashKey: process.env.ECPAY_HASH_KEY || '',
    HashIV: process.env.ECPAY_HASH_IV || '',
  },
  IgnorePayment: [],
  IsProjectContractor: false,
};

// 創建 ECPay 實例
let ecpayInstance = null;

function getEcpayInstance() {
  if (!ecpayInstance) {
    ecpayInstance = new ecpay_aio(ECPAY_CONFIG, null);
  }
  return ecpayInstance;
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
  const ecpay = getEcpayInstance();
  const hostUrl = process.env.HOST_URL || 'http://localhost:8888';

  const baseParam = {
    MerchantTradeNo: orderId,
    MerchantTradeDate: new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
    PaymentType: 'aio',
    TotalAmount: amount,
    TradeDesc: `BrotherG AI - ${planName} 方案訂閱`,
    ItemName: `BrotherG AI - ${planName} 方案`,
    ReturnURL: `${hostUrl}/.netlify/functions/payment-webhook`, // Server-to-Server
    ClientBackURL: `${hostUrl}/payment/success`, // User redirect
    ChoosePayment: 'Credit',
    EncryptType: 1,
    CustomField1: userId || '', // 重要：用來追蹤是誰付款
  };

  // 生成付款表單 HTML
  const formHtml = ecpay.payment_client.aio_check_out_all(baseParam);
  return formHtml;
}

/**
 * 驗證 ECPay 回傳的 Checksum
 * @param {object} params - ECPay 回傳的參數
 * @returns {boolean} 是否驗證通過
 */
function validateCheckMacValue(params) {
  const ecpay = getEcpayInstance();
  try {
    // 使用 ECPay SDK 驗證
    return ecpay.helper.check_mac_value(params);
  } catch (error) {
    console.error('❌ CheckMacValue 驗證失敗:', error);
    return false;
  }
}

module.exports = {
  generatePaymentForm,
  validateCheckMacValue,
  getEcpayInstance,
};

