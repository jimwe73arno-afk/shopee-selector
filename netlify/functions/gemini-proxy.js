const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const withTimeout = (promise, timeoutMs = 40000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after ' + timeoutMs + 'ms')), timeoutMs)
    )
  ]);
};

// 🎯 智能分流：圖片用 3.0 Pro，文字用 1.5 Flash
const getModelConfig = (hasImages) => {
  if (hasImages) {
    return {
      // ✅ 圖片分析：使用 3.0 Pro
      model: 'gemini-3-pro-preview',
      // ✅ 使用 v1beta endpoint（3.0 Pro 必須）
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent'
    };
  } else {
    return {
      // ✅ 文字分析：使用 1.5 Flash
      model: 'gemini-1.5-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    };
  }
};

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
    const config = getModelConfig(hasImages);
    
    console.log(`📊 模式: ${hasImages ? '🎯 圖片 (3.0 Pro)' : '⚡ 文字 (1.5 Flash)'}`);
    console.log(`📷 圖片數量: ${images.length}`);
    console.log(`🔗 Endpoint: ${config.endpoint}`);

    // ✅ 3.0 Pro 正確的 parts 結構
    const parts = [];
    
    // 組合提示詞（如果有 systemPrompt 和 userPrompt，合併）
    let combinedPrompt = '';
    if (systemPrompt) {
      combinedPrompt = systemPrompt + '\n\n' + userPrompt;
    } else {
      combinedPrompt = userPrompt;
    }
    
    // 先加入文字提示
    if (combinedPrompt) {
      parts.push({ text: combinedPrompt });
    }

    // 再加入圖片（如果有）
    if (hasImages) {
      const imagesToProcess = images.slice(0, MAX_IMAGES);
      
      imagesToProcess.forEach((imgBase64, index) => {
        try {
          // 清理 Base64 字串
          const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
          
          // 檢測圖片格式
          let mimeType = 'image/jpeg';
          if (imgBase64.includes('data:image/png')) {
            mimeType = 'image/png';
          } else if (imgBase64.includes('data:image/webp')) {
            mimeType = 'image/webp';
          }

          // ✅ 3.0 Pro 正確格式：只有 inlineData，沒有其他欄位
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          });

          console.log(`✅ 圖片 ${index + 1} (${mimeType})`);
        } catch (err) {
          console.error(`❌ 圖片 ${index + 1} 錯誤:`, err.message);
        }
      });
    }

    // ✅ 3.0 Pro 正確的 payload 結構
    const requestBody = {
      contents: [
        {
          role: "user",  // ✅ 必須指定 role
          parts: parts   // ✅ parts 陣列
        }
      ],
      // ✅ 駝峰式：generationConfig（不是 generation_config）
      generationConfig: {
        temperature: 0.7,   // ✅ 3.0 Pro 建議 0.7-1.0
        topP: 0.8,
        topK: 40,
        maxOutputTokens: hasImages ? 8192 : 4096
      }
      // ❌ 移除 mediaResolution - 3.0 Pro 不支援
      // ❌ 移除 thinkingLevel - 3.0 Pro 不支援
    };

    console.log(`🚀 呼叫 ${config.model} (timeout: 40s)...`);
    const startTime = Date.now();

    // ✅ 使用正確的 endpoint
    const response = await withTimeout(
      fetch(`${config.endpoint}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }),
      40000
    );

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ ${responseTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // ✅ 解析回應
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '無回應';

    console.log(`✅ 完成 (${generatedText.length} 字元)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: generatedText,
        modelUsed: config.model,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    let errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('timeout')) {
      errorMessage = 'API 處理時間過長，請減少圖片數量';
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = '環境變數未配置';
    } else if (errorMessage.includes('404')) {
      errorMessage = '模型不存在';
    } else if (errorMessage.includes('400')) {
      errorMessage = 'API 請求格式錯誤';
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
