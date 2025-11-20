const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // --- 🔍 X光除錯區 ---
    console.log("================ NEW REQUEST ================");
    console.log("收到 Body:", event.body); 
    // 這是關鍵！去 Netlify Logs 看這一行。
    // 如果看到 { "contents": ... } 代表前端還是舊的。
    // 如果看到 { "prompt": ... } 代表前端是新的。
    // --------------------

    const body = JSON.parse(event.body);
    const userPrompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];

    // 嚴格檢查並印出 log
    if (!userPrompt && (!images || images.length === 0)) {
      console.error("❌ 參數檢查失敗: Prompt與Images皆空");
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing parameters (Prompt or Image required)' }) };
    }

    const parts = [];
    if (systemPrompt) parts.push({ text: systemPrompt });
    if (userPrompt) parts.push({ text: userPrompt });
    
    if (images && Array.isArray(images)) {
      images.forEach(img => {
        // 相容處理：無論前端傳完整的 data:url 還是純 base64
        const cleanBase64 = img.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inlineData: { mimeType: "image/jpeg", data: cleanBase64 } });
      });
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 8192 }
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Google API Error:", errText);
        throw new Error(`Gemini API Refused: ${errText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    return { statusCode: 200, headers, body: JSON.stringify({ response: generatedText }) };

  } catch (error) {
    console.error("Server Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Processing failed', details: error.message }) };
  }
};
