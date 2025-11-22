const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ✅ 使用正確的模型
const MODEL_IMAGE = 'gemini-3-pro-preview';
const MODEL_TEXT = 'gemini-2.5-flash';

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
    if (!GEMINI_API_KEY) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    const body = JSON.parse(event.body || '{}');
    const images = body.images || [];
    const prompt = body.prompt || body.userPrompt || '';
    const systemPrompt = body.systemPrompt || '';

    const MAX_IMAGES = 6;
    
    if (!prompt && images.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '請提供文字或圖片' })
      };
    }

    if (images.length > MAX_IMAGES) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `最多 ${MAX_IMAGES} 張圖片` })
      };
    }

    const hasImages = images.length > 0;
    const model = hasImages ? MODEL_IMAGE : MODEL_TEXT;
    
    console.log(`🤖 模型: ${model}, 圖片: ${images.length}`);

    // 準備 parts
    const parts = [];
    
    let combinedPrompt = '';
    if (systemPrompt) {
      combinedPrompt = systemPrompt + '\n\n' + prompt;
    } else {
      combinedPrompt = prompt;
    }
    
    if (combinedPrompt) {
      parts.push({ text: combinedPrompt });
    }

    // 加入圖片
    if (hasImages) {
      images.slice(0, MAX_IMAGES).forEach((imgBase64) => {
        const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
        let mimeType = 'image/jpeg';
        if (imgBase64.includes('data:image/png')) mimeType = 'image/png';
        else if (imgBase64.includes('data:image/webp')) mimeType = 'image/webp';

        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        });
      });
    }

    const requestBody = {
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
    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '無回應';

    console.log(`✅ 完成 (${responseTime}ms)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        result: result,
        modelUsed: model,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Unknown error'
      })
    };
  }
};
