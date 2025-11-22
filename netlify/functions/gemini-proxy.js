const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ✅ 使用 3.0 Pro - 最強模型
const MODEL_IMAGE = 'gemini-3-pro-preview';    // 圖片分析
const MODEL_TEXT = 'gemini-2.5-flash';          // 文字分析

exports.handler = async (event, context) => {
  // ✅ 關鍵：設置不等待事件循環
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

    const MAX_IMAGES = 6;  // ✅ 支援 6 張圖片
    
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
    const model = hasImages ? MODEL_IMAGE : MODEL_TEXT;
    
    console.log(`📊 模式: ${hasImages ? '🎯 3.0 Pro 圖片' : '⚡ 2.5 Flash 文字'}`);
    console.log(`📷 圖片數量: ${images.length}`);
    console.log(`🤖 模型: ${model}`);

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

    // 加入圖片
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

    // ✅ 關鍵優化：精簡 3.0 Pro 的配置
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: parts
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096  // ✅ 減少 tokens 加快速度
      }
    };

    console.log(`🚀 呼叫 ${model}...`);
    const startTime = Date.now();

    // ✅ 使用更長的 timeout - 給 3.0 Pro 足夠時間
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);  // 50 秒

    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ ${responseTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '無回應';

    console.log(`✅ 完成 (${generatedText.length} 字元)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: generatedText,
        modelUsed: model,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    let errorMessage = error.message || 'Unknown error';
    if (error.name === 'AbortError') {
      errorMessage = '處理時間過長，請稍後再試';
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
