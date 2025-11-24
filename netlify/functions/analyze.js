// netlify/functions/analyze.js
// Shopee Analyst 穩定版：統一使用 gemini-1.5-flash，回傳 success flag

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = 'v1beta';
const MODEL = 'gemini-1.5-flash';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: '' };
  }

  try {
    if (!API_KEY) {
      throw new Error('Missing GOOGLE_API_KEY');
    }

    const body = JSON.parse(event.body || '{}');
    const { textPrompt } = body;

    if (!textPrompt || typeof textPrompt !== 'string') {
      throw new Error('Missing textPrompt');
    }

    const systemInstruction = `
你現在是 BrotherG 的【蝦皮直播戰術分析師】。
請針對用戶輸入，產出高含金量的「直播決策卡」。

格式 (Markdown)：
### 📊 市場判斷 (一句話犀利點評)
### 🎯 C-A-B 黃金排品
* 🪝 **C軌 (誘餌):** [品名] - 為什麼吸睛?
* 💰 **A軌 (利潤):** [品名] - 為什麼賺錢?
* 📦 **B軌 (湊單):** [品名] - 為什麼必帶?
### 🗣️ 金牌主播話術 (直接寫出約 150 字口播稿)

語氣：興奮、專業、帶有急迫感。
`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${API_KEY}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n【用戶輸入】: ${textPrompt}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Gemini API error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!text) {
      // 認定為失敗，不扣次
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          result: '⚠️ 分析服務忙碌中，請稍後再試。（空回覆）',
        }),
      };
    }

    // 成功產生分析
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        result: text,
      }),
    };
  } catch (err) {
    console.error('🔥 analyze error:', err);
    return {
      statusCode: 200, // 前端好處理
      headers,
      body: JSON.stringify({
        success: false,
        result: `⚠️ 分析服務忙碌中，請稍後再試。\n錯誤：${err.message}`,
      }),
    };
  }
};
