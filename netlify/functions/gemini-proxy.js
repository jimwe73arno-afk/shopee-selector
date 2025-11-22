// ✅ Node.js 18+ 原生支援 fetch，不需要 import
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ✅ 正確的模型名稱
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3-pro-preview';  // 不是 gemini-3.0-pro

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const images = body.images || [];
    const prompt = body.prompt || '';
    const systemPrompt = body.systemPrompt || '';

    if (!GEMINI_API_KEY) {
      return { 
        statusCode: 500, 
        headers,
        body: JSON.stringify({ error: 'Missing GEMINI_API_KEY' })
      };
    }

    if (images.length === 0 && !prompt) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: '請提供圖片或文字' })
      };
    }

    console.log(`🤖 模型: ${MODEL}, 圖片數: ${images.length}`);

    // 準備 parts
    const parts = [];
    
    // 文字提示
    let combinedPrompt = systemPrompt ? systemPrompt + '\n\n' + prompt : prompt;
    if (combinedPrompt) {
      parts.push({ text: combinedPrompt || "請幫我分析這些圖片" });
    }

    // ✅ 正確的圖片格式：inlineData (camelCase)
    images.forEach((img) => {
      const cleanBase64 = img.replace(/^data:image\/\w+;base64,/, '');
      let mimeType = 'image/jpeg';
      
      if (img.includes('data:image/png')) {
        mimeType = 'image/png';
      } else if (img.includes('data:image/webp')) {
        mimeType = 'image/webp';
      }

      parts.push({
        inlineData: {  // ✅ camelCase
          mimeType: mimeType,  // ✅ camelCase
          data: cleanBase64
        }
      });
    });

    // ✅ 正確的 payload 結構
    const payload = {
      contents: [{
        role: "user",
        parts: parts
      }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096
      }
    };

    const startTime = Date.now();

    // ✅ 正確的 fetch 語法
    const url = `${GEMINI_ENDPOINT}/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const res = await fetch(url, {  // ✅ 修正語法錯誤
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseTime = Date.now() - startTime;

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Gemini API error:', errorText);
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '無回應';

    console.log(`✅ 完成 (${responseTime}ms, ${result.length} 字元)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        result: result,
        modelUsed: MODEL,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (err) {
    console.error('❌ Gemini proxy error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
