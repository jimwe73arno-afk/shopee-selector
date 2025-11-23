const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// 🎯 兩段式策略
const MODEL_FAST = 'gemini-2.5-flash';        // 階段1: 快速讀圖
const MODEL_PRO = 'gemini-3-pro-preview';     // 階段2: 深度分析

async function callGemini(model, contents) {
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${model} error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: 'ok',
        message: 'Gemini API 兩段式分析',
        endpoints: {
          analyze: 'POST /api/analyze'
        }
      })
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || '{}');
    const images = body.images || [];
    const prompt = body.prompt || '';
    const systemPrompt = body.systemPrompt || '';

    if (images.length === 0 && !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '請提供圖片或文字' })
      };
    }

    const hasImages = images.length > 0;
    console.log(`📊 模式: ${hasImages ? '兩段式圖片分析' : '文字分析'}`);
    console.log(`📷 圖片數: ${images.length}`);

    const startTime = Date.now();
    let finalResult = '';

    if (hasImages) {
      // ========================================
      // 🎯 兩段式處理：快速 + 深度
      // ========================================
      
      // 階段 1: 用 2.5 Flash 快速讀圖提取數據
      console.log(`⚡ 階段1: ${MODEL_FAST} 快速讀圖...`);
      
      const parts1 = [];
      
      // 組合提示詞
      let combinedPrompt = systemPrompt ? systemPrompt + '\n\n' + prompt : prompt;
      parts1.push({ 
        text: combinedPrompt + '\n\n請快速提取圖片中的所有關鍵數據和信息。' 
      });

      // 加入圖片
      images.slice(0, 6).forEach((img) => {
        const cleanBase64 = img.replace(/^data:image\/\w+;base64,/, '');
        let mimeType = 'image/jpeg';
        if (img.includes('data:image/png')) mimeType = 'image/png';
        else if (img.includes('data:image/webp')) mimeType = 'image/webp';

        parts1.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        });
      });

      const stage1Result = await callGemini(MODEL_FAST, [{
        role: "user",
        parts: parts1
      }]);

      const stage1Time = Date.now() - startTime;
      console.log(`✅ 階段1完成 (${stage1Time}ms, ${stage1Result.length}字元)`);

      // 階段 2: 用 3.0 Pro 深度分析（基於階段1的結果）
      console.log(`🎯 階段2: ${MODEL_PRO} 深度分析...`);
      
      const stage2Prompt = `你是專業的蝦皮選品顧問。

以下是從圖片中提取的數據：
${stage1Result}

請根據這些數據，提供專業的選品策略建議。`;

      const stage2Result = await callGemini(MODEL_PRO, [{
        role: "user",
        parts: [{ text: stage2Prompt }]
      }]);

      const stage2Time = Date.now() - startTime - stage1Time;
      console.log(`✅ 階段2完成 (${stage2Time}ms)`);

      finalResult = stage2Result;

    } else {
      // 純文字：直接用 2.5 Flash
      console.log(`⚡ 文字分析: ${MODEL_FAST}`);
      
      let combinedPrompt = systemPrompt ? systemPrompt + '\n\n' + prompt : prompt;
      
      finalResult = await callGemini(MODEL_FAST, [{
        role: "user",
        parts: [{ text: combinedPrompt }]
      }]);
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ 總時間: ${totalTime}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        result: finalResult,
        summary: hasImages ? '兩段式分析完成' : '文字分析完成',
        recommendations: finalResult,
        plan: finalResult,
        debug: {
          modelUsed: hasImages ? `${MODEL_FAST} → ${MODEL_PRO}` : MODEL_FAST,
          imageCount: images.length,
          responseTime: `${totalTime}ms`
        }
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
