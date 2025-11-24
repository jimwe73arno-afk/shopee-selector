// netlify/functions/analyze.js
// Shopee Analyst 穩定版：統一使用 gemini-1.5-flash

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = 'v1beta';
const MODEL = 'gemini-2.5-flash';

const commonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: commonHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: commonHeaders, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { textPrompt } = body;

    if (!API_KEY) {
      throw new Error('Missing Google API key');
    }
    if (!textPrompt || !textPrompt.trim()) {
      throw new Error('Empty text prompt');
    }

    const systemInstruction = `
你現在是 BrotherG 的「蝦皮直播戰術分析師」。
針對賣家的問題，輸出一份實戰「直播決策卡」。

請用 Markdown 格式回覆，結構如下：

### 📊 市場判斷
- 用 1~2 句話犀利點評現在的盤面。

### 🎯 C-A-B 排品策略
- 🪝 **C 軌 (引流款)：** 產品 & 理由
- 💰 **A 軌 (利潤款)：** 產品 & 理由
- 📦 **B 軌 (湊單款)：** 產品 & 理由

### 🗣️ 主播話術
- 寫一段約 150 字的口播稿，語氣興奮、有帶動氣氛。

### ✅ 下一步行動建議
- 用條列列出 3 個「今天就可以做」的具體動作。
`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${API_KEY}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemInstruction },
              { text: `【賣家輸入】：${textPrompt}` },
            ],
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
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '目前無法產生建議，請稍後再試。';

    console.log(`✅ Response generated: ${text.length} characters`);

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({ result: text }),
    };
  } catch (err) {
    console.error('Analyze error:', err);
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({
        result: `⚠️ 分析服務暫時忙碌，請稍後再試。\n錯誤訊息: ${err.message}`,
      }),
    };
  }
};
