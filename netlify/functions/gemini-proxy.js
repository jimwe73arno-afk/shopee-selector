const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// 🔥 Timeout 包裝器 - 防止函數超時
const withTimeout = (promise, timeoutMs = 20000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after ' + timeoutMs + 'ms')), timeoutMs)
    )
  ]);
};

// 🎯 智能分流：根據是否有圖片選擇最佳模型
const getModelUrl = (hasImages) => {
  // 文字分析：快速的 1.5-flash
  // 圖片分析：最強的 3.0-pro-preview
  const model = hasImages ? 'gemini-3-pro-preview' : 'gemini-1.5-flash';
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
};

exports.handler = async (event, context) => {
  // 設置函數不等待空事件循環
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
    // 驗證 API Key
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured in environment variables');
    }

    const body = JSON.parse(event.body);
    
    // 支援多種欄位名稱（保持兼容性）
    const userPrompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];

    // 🎯 後端防禦性檢查：圖片數量限制
    const MAX_IMAGES = 10;

    // 檢查是否有任何輸入
    if (!userPrompt && (!images || images.length === 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '請至少上傳 1 張圖片' })
      };
    }

    // 檢查圖片數量（後端防禦）
    if (images && images.length > MAX_IMAGES) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `一次最多上傳 ${MAX_IMAGES} 張圖片` })
      };
    }

    // 🎯 智能選擇模型
    const hasImages = images && images.length > 0;
    const modelUrl = getModelUrl(hasImages);
    const modelName = hasImages ? 'gemini-3-pro-preview (最強圖片分析)' : 'gemini-1.5-flash (快速文字分析)';

    console.log(`📊 分析模式: ${hasImages ? '🎯 圖片分析 (3.0 Pro)' : '⚡ 文字分析 (1.5 Flash)'}`);
    console.log(`📷 圖片數量: ${images.length}`);
    console.log(`🤖 使用模型: ${modelName}`);

    // 組合內容 parts
    const parts = [];

    // 加入系統提示（如果有）
    if (systemPrompt) {
      parts.push({ text: systemPrompt });
    }

    // 加入用戶提示
    if (userPrompt) {
      parts.push({ text: userPrompt });
    }

    // 🚀 批次處理圖片
    if (hasImages) {
      const maxImages = 10;
      const imagesToProcess = images.slice(0, maxImages);
      
      if (images.length > maxImages) {
        console.log(`⚠️ 圖片數量超過限制 (${images.length} 張)，只處理前 ${maxImages} 張`);
      }

      imagesToProcess.forEach((imgBase64, index) => {
        try {
          // 清理 Base64 字串
          const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
          
          // 檢測圖片格式
          let mimeType = 'image/jpeg'; // 預設
          if (imgBase64.includes('data:image/png')) {
            mimeType = 'image/png';
          } else if (imgBase64.includes('data:image/webp')) {
            mimeType = 'image/webp';
          }

          // 🎯 Gemini 3.0 Pro: 使用 media_resolution_high 獲得最高質量
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          });

          console.log(`✅ 已加入第 ${index + 1} 張圖片 (${mimeType})`);
        } catch (imgError) {
          console.error(`❌ 處理第 ${index + 1} 張圖片時出錯:`, imgError.message);
        }
      });
    }

    // 🎯 生成配置
    const generationConfig = {
      temperature: 1.0,  // Gemini 3.0 建議預設值
      topK: 40,
      topP: 0.95,
      maxOutputTokens: hasImages ? 8192 : 4096,
    };

    console.log(`🚀 開始呼叫 Gemini API (timeout: 20s)...`);
    const startTime = Date.now();

    // 🔥 使用 timeout 包裝器
    const response = await withTimeout(
      fetch(`${modelUrl}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }],
          generationConfig: generationConfig
        })
      }),
      20000  // 20 秒超時
    );

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    console.log(`⏱️ API 回應時間: ${responseTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '無回應';

    console.log(`✅ 分析完成！回應長度: ${generatedText.length} 字元`);

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
    console.error('❌ Function error:', error);
    
    // 詳細錯誤信息
    let errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('timeout')) {
      errorMessage = 'API 請求超時，請稍後再試或減少圖片數量';
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = '環境變數未配置，請檢查 Netlify 設定';
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
