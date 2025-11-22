const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// 🔥 Timeout 包裝器 - 給 Gemini 3.0 Pro 更多時間
const withTimeout = (promise, timeoutMs = 40000) => {  // ✅ 改成 40 秒
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after ' + timeoutMs + 'ms')), timeoutMs)
    )
  ]);
};

const getModelUrl = (hasImages) => {
  // 🔥 統一使用 gemini-1.5-pro（保留最強分析能力）
  const model = 'gemini-1.5-pro';
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
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

    // 🎯 後端防禦性檢查
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
    const modelUrl = getModelUrl(hasImages);
    const modelName = 'gemini-1.5-pro';

    console.log(`📊 🎯 使用 ${modelName} (${images.length}張圖片)`);

    const parts = [];
    // 🎯 強化 System Prompt：加入 JSON 輸出和精簡指令
    const enhancedSystemPrompt = systemPrompt + 
      "\n\nIMPORTANT: Output pure JSON directly. Focus on key insights only. Be extremely concise to save processing time. Do not use markdown code blocks.";
    
    if (enhancedSystemPrompt.trim()) parts.push({ text: enhancedSystemPrompt });
    if (userPrompt) parts.push({ text: userPrompt });

    if (hasImages) {
      const imagesToProcess = images.slice(0, MAX_IMAGES);
      
      imagesToProcess.forEach((imgBase64, index) => {
        try {
          const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
          let mimeType = 'image/jpeg';
          if (imgBase64.includes('data:image/png')) mimeType = 'image/png';
          else if (imgBase64.includes('data:image/webp')) mimeType = 'image/webp';

          parts.push({
            inlineData: { mimeType, data: cleanBase64 }
          });

          console.log(`✅ 圖片 ${index + 1} (${mimeType})`);
        } catch (err) {
          console.error(`❌ 圖片 ${index + 1} 錯誤`);
        }
      });
    }

    // 🔥 強迫精簡：maxOutputTokens 設為 2048
    const generationConfig = {
      temperature: 1.0,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,  // ✅ 強迫精簡輸出
    };

    console.log(`🚀 呼叫 API (timeout: 40s)...`);  // ✅ 顯示新的 timeout
    const startTime = Date.now();

    // 🔥 使用 40 秒 timeout
    const response = await withTimeout(
      fetch(`${modelUrl}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig
        })
      }),
      40000  // ✅ 40 秒
    );

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
        modelUsed: modelName,
        imageCount: images.length,
        responseTime: `${responseTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    let errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('timeout')) {
      errorMessage = 'API 處理時間過長（可能圖片太多或太大），請減少圖片數量或稍後再試';
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = '環境變數未配置';
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
