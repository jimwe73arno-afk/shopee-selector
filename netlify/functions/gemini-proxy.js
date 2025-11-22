const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ✅ 使用 2.5-flash：快速 + 高質量
const MODEL = 'gemini-2.5-flash';

const withTimeout = (promise, timeoutMs = 25000) => {  // ✅ 縮短到 25 秒
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
};

async function callGemini(contents) {
  const url = `${GEMINI_ENDPOINT}/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  console.log(`🤖 呼叫模型: ${MODEL}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API 錯誤:`, errorText);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('');
}

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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const body = JSON.parse(event.body);
    const userPrompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];

    const MAX_IMAGES = 10;
    
    if (!userPrompt && (!images || images.length === 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '請至少上傳 1 張圖片或輸入文字' })
      };
    }

    if (images.length > MAX_IMAGES) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `一次最多上傳 ${MAX_IMAGES} 張圖片` })
      };
    }

    const hasImages = images && images.length > 0;
    console.log(`📊 分析模式: ${hasImages ? '🎯 圖片' : '⚡ 文字'}`);
    console.log(`📷 圖片數量: ${images.length}`);

    const startTime = Date.now();

    // 準備 parts
    const parts = [];
    
    // 組合提示詞
    let combinedPrompt = '';
    if (systemPrompt) {
      combinedPrompt = systemPrompt + '\n\n' + userPrompt;
    } else {
      combinedPrompt = userPrompt;
    }
    
    parts.push({ text: combinedPrompt });

    // 加入圖片（如果有）
    if (hasImages) {
      const imagesToProcess = images.slice(0, MAX_IMAGES);
      
      imagesToProcess.forEach((imgBase64, index) => {
        try {
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

          console.log(`✅ 圖片 ${index + 1} (${mimeType})`);
        } catch (err) {
          console.error(`❌ 圖片 ${index + 1} 錯誤`);
        }
      });
    }

    // ✅ 單階段處理：快速完成
    const finalResponse = await withTimeout(
      callGemini([
        {
          role: "user",
          parts: parts
        }
      ]),
      25000  // ✅ 25 秒內完成，避免 Inactivity Timeout
    );

    const responseTime = Date.now() - startTime;
    console.log(`✅ 完成 (${finalResponse.length} 字元, ${responseTime}ms)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: finalResponse,
        modelUsed: MODEL,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    let errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('timeout')) {
      errorMessage = '處理時間過長，請減少圖片數量或稍後再試';
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = '環境變數未配置';
    } else if (errorMessage.includes('404')) {
      errorMessage = '模型不存在';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        details: error.toString()
      })
    };
  }
};
