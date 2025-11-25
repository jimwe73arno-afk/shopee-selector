// lib/router.js — BrotherGEV Mode Router
// 多模式路由層（核心模組）

const fs = require('fs');
const path = require('path');

// 模式白名單（六大功能）
const ALLOWED_MODES = ['tesla', 'travel', 'shopee', 'esim', 'image', 'landlord'];

// 動態載入對應 prompt
function loadPrompt(mode = 'tesla') {
  try {
    if (!ALLOWED_MODES.includes(mode)) {
      console.warn(`⚠️ 無效的 mode: ${mode}，使用預設 tesla`);
      mode = 'tesla';
    }

    const promptPath = path.resolve(__dirname, `../prompts/${mode}.txt`);
    
    if (!fs.existsSync(promptPath)) {
      console.warn(`⚠️ Prompt 檔案不存在: ${promptPath}，使用預設提示`);
      return '你是 Brother G 決策顧問，回答請用【結論→依據→風險→行動】格式。';
    }

    return fs.readFileSync(promptPath, 'utf8').trim();
  } catch (err) {
    console.error('⚠️ 無法載入 Prompt:', err.message);
    return '你是 Brother G 決策顧問，回答請用【結論→依據→風險→行動】格式。';
  }
}

// 驗證 mode 是否有效
function isValidMode(mode) {
  return ALLOWED_MODES.includes(mode);
}

module.exports = {
  loadPrompt,
  isValidMode,
  ALLOWED_MODES,
};

