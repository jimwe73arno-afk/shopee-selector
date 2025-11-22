const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// 使用 Gemini 3.0 Pro 預覽版 (增強推理能力)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

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
        const cleanBase64 = img.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inline_data: { mime_type: "image/jpeg", data: cleanBase64 } });
      });
    }
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: { 
          temperature: 1.0,  // Gemini 3.0 Pro 預設值 - 最佳效能
          topK: 40, 
          topP: 0.95, 
          maxOutputTokens: 8192
          // Note: thinkingLevel parameter not yet supported in API
        }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API Error:", errText);
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ response: generatedText }) 
    };
    
  } catch (error) {
    console.error("Handler Error:", error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        error: 'Processing failed', 
        details: error.message 
      }) 
    };
  }
};
