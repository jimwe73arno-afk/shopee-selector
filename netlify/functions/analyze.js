// netlify/functions/analyze.js
// Shopee Analyst 穩定版：全部用 gemini-2.5-flash（文字版）

const API_KEY =
  process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const API_VERSION = 'v1beta';
const MODEL = 'gemini-2.5-flash';

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const textPrompt = (body.textPrompt || '').trim();
    const tier = (body.tier || 'FREE').toUpperCase();

    if (!API_KEY) {
      console.error('❌ Missing GOOGLE_API_KEY');
      throw new Error('Missing GOOGLE_API_KEY');
    }
    if (!textPrompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Empty prompt' })
      };
    }

    console.log('📥 Request:', { tier, hasPrompt: !!textPrompt });

    // 統一用「Pro 等級」的指令，Master 先不上線
    const systemInstruction = `
你是 BrotherG 的【Shopee 直播選品戰術顧問】。

請把下面的賣家自述，整理成一張「直播決策卡」，語氣要有能量、但非常務實。

請用 Markdown 格式輸出，結構如下：

### 📊 市場判斷（一句話總結）
- 用一句話點出這個賣家的核心問題與機會。

### 🎯 C-A-B 排品策略
- 🪝 **C 軌（引流款）**：寫出 1–2 種適合當流量款的品類／價格帶，說明為什麼。
- 💰 **A 軌（利潤款）**：寫出 1–2 種適合當毛利款的品類／價格帶，說明利潤邏輯。
- 📦 **B 軌（湊單款）**：寫出 1–2 種適合當湊單／加價購的商品，說明搭配思路。

### 🗣️ 主播話術示範（約 120–180 字）
- 幫他寫一段可以直接在直播講的口播稿，口氣像「藍教主」：有節奏、有畫面感，但不要太誇張吹噓。

### ✅ 下一步行動建議
- 用條列列出 3 個「今天就可以做」的具體動作（例如：先把哪 3 個品類拉出來，怎麼排在貨架上，直播怎麼先測試）。
`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemInstruction}\n\n【賣家輸入】:\n${textPrompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 900, // 控制在安全長度內，避免 MAX_TOKENS
        temperature: tier === 'FREE' ? 0.65 : 0.75,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    console.log(`🚀 Calling Gemini API: ${MODEL} | Tier: ${tier}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Gemini API Error (${response.status}):`, text);
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    const resultText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '目前沒有產生內容，請稍後再試。';

    console.log(`✅ Response generated: ${resultText.length} characters`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: resultText }),
    };
  } catch (err) {
    console.error('🔥 analyze error:', err);
    return {
      statusCode: 200, // 前端一律當成功處理，只是提示錯誤訊息
      headers,
      body: JSON.stringify({
        result: `⚠️ 分析服務暫時忙碌，請稍後再試。\n\n錯誤訊息：${err.message}`,
      }),
    };
  }
};
