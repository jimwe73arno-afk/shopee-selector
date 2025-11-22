const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// ✅ 修正：使用還活著的模型
const FAST_IMAGE_MODEL = 'gemini-2.5-flash';        // ✅ 替代已淘汰的 1.5-flash
const REASONING_MODEL = 'gemini-3-pro-preview';     // ✅ 最強推理模型

const withTimeout = (promise, timeoutMs = 40000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after ' + timeoutMs + 'ms')), timeoutMs)
    )
  ]);
};

// 🎯 通用 Gemini 呼叫函數
async function callGemini(model, contents, apiKey) {
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
  
  console.log(`🤖 呼叫模型: ${model}`);
  
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
    console.error(`❌ ${model} 錯誤:`, errorText);
    throw new Error(`Gemini error (${model}): ${response.status} - ${errorText}`);
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
    console.log(`📊 分析模式: ${hasImages ? '🎯 圖片分析' : '⚡ 文字分析'}`);
    console.log(`📷 圖片數量: ${images.length}`);

    const startTime = Date.now();
    let finalResponse = '';

    if (hasImages) {
      // ========================================
      // 🎯 兩段式處理：圖片分析
      // ========================================
      
      console.log(`\n=== 階段 1: ${FAST_IMAGE_MODEL} 讀取圖片 ===`);
      
      // 準備圖片 parts
      const imageParts = [];
      const imagesToProcess = images.slice(0, MAX_IMAGES);
      
      imagesToProcess.forEach((imgBase64, index) => {
        try {
          const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
          let mimeType = 'image/jpeg';
          if (imgBase64.includes('data:image/png')) mimeType = 'image/png';
          else if (imgBase64.includes('data:image/webp')) mimeType = 'image/webp';

          imageParts.push({
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

      // 組合提示詞
      let combinedPrompt = '';
      if (systemPrompt) {
        combinedPrompt = systemPrompt + '\n\n' + userPrompt;
      } else {
        combinedPrompt = userPrompt;
      }

      // 階段 1: 用 2.5-flash 快速讀圖
      const imageAnalysisPrompt = combinedPrompt + '\n\n請仔細分析這些圖片中的數據，提取所有關鍵信息。';
      
      const imageAnalysisText = await withTimeout(
        callGemini(FAST_IMAGE_MODEL, [
          {
            role: "user",
            parts: [
              { text: imageAnalysisPrompt },
              ...imageParts
            ]
          }
        ], GEMINI_API_KEY),
        40000
      );

      console.log(`✅ 階段 1 完成 (${imageAnalysisText.length} 字元)`);
      console.log(`\n=== 階段 2: ${REASONING_MODEL} 深度推理 ===`);

      // 階段 2: 用 3.0-pro 做深度推理
      const reasoningPrompt = `根據以下圖片分析結果，請以專業的蝦皮選品顧問身份，提供具體的選品策略建議：\n\n${imageAnalysisText}`;
      
      finalResponse = await withTimeout(
        callGemini(REASONING_MODEL, [
          {
            role: "user",
            parts: [{ text: reasoningPrompt }]
          }
        ], GEMINI_API_KEY),
        40000
      );

      console.log(`✅ 階段 2 完成 (${finalResponse.length} 字元)`);

    } else {
      // ========================================
      // ⚡ 純文字處理：直接用 2.5-flash
      // ========================================
      
      console.log(`\n=== 文字分析: ${FAST_IMAGE_MODEL} ===`);
      
      let combinedPrompt = '';
      if (systemPrompt) {
        combinedPrompt = systemPrompt + '\n\n' + userPrompt;
      } else {
        combinedPrompt = userPrompt;
      }

      finalResponse = await withTimeout(
        callGemini(FAST_IMAGE_MODEL, [
          {
            role: "user",
            parts: [{ text: combinedPrompt }]
          }
        ], GEMINI_API_KEY),
        40000
      );

      console.log(`✅ 文字分析完成 (${finalResponse.length} 字元)`);
    }

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ 總時間: ${responseTime}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: finalResponse,
        modelUsed: hasImages ? `${FAST_IMAGE_MODEL} → ${REASONING_MODEL}` : FAST_IMAGE_MODEL,
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
      errorMessage = '模型不存在或已被淘汰';
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
