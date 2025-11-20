const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// 修改點：根據你提供的文件，切換至 gemini-2.5-flash
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body);
    const userPrompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];

    if (!userPrompt && (!images || images.length === 0)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing parameters' }) };
    }

    const parts = [];
    if (systemPrompt) parts.push({ text: systemPrompt });
    if (userPrompt) parts.push({ text: userPrompt });
    
    if (images && Array.isArray(images)) {
      images.forEach(img => {
        // 移除 Base64 前綴，確保乾淨的數據傳給 Google
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
        // 錯誤處理：如果 2.5 還在 Preview，可能會顯示具體的錯誤
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
