// BrotherG AI - Raw Fetch Implementation (No SDK)
// 完全繞過 SDK，直接 HTTP 請求

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

// ✅ 手動控制 API 版本和模型
const API_VERSION = "v1beta";
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 可用的模型列表
const MODELS = {
  FLASH: "gemini-1.5-flash-latest",
  PRO: "gemini-1.5-pro-latest"
};

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`🤖 直接調用: ${modelName}`);
  console.log(`📡 API Endpoint: ${url.replace(API_KEY, '***')}`);
  
  const parts = [];
  
  // 先加圖片
  if (imageParts.length > 0) {
    parts.push(...imageParts.map(img => ({
      inline_data: { 
        mime_type: "image/jpeg", 
        data: img 
      }
    })));
  }
  
  // 再加文字
  parts.push({ text: prompt });

  const contents = [{
    role: "user",
    parts: parts
  }];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API 錯誤 (${response.status}):`, errorText);
    throw new Error(`API Error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "無回應";
  
  console.log(`✅ 回應長度: ${text.length} 字元`);
  return text;
}

exports.handler = async (event) => {
  // CORS headers
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
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || '{}');
    const { textPrompt, images = [] } = body;

    console.log(`📊 收到請求: ${images.length} 張圖片`);

    const jsonStructure = `{
  "summary": "詳細分析...",
  "recommendations": ["建議1", "建議2", "建議3"],
  "plan": "7天執行計劃..."
}`;

    // ==========================================
    // 分支 A: 純文字
    // ==========================================
    if (!images || images.length === 0) {
      console.log(`📝 純文字模式`);
      
      const result = await callGemini(
        MODELS.FLASH,
        `用戶問題: ${textPrompt}\n\n請以嚴格的 JSON 格式回覆: ${jsonStructure}`
      );
      
      const cleanJson = result.replace(/```json|```/g, '').trim();
      
      return { 
        statusCode: 200, 
        headers,
        body: cleanJson 
      };
    }

    // ==========================================
    // 分支 B: Map-Reduce (圖片)
    // ==========================================
    
    // 限制最多 2 張圖片（解決超時問題）
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} 超過限制 ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map 階段: ${imagesToProcess.length} 張圖片`);

    // Step 1: Map (並行處理圖片)
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, '');
        const text = await callGemini(
          MODELS.FLASH,
          '提取關鍵數據：價格、銷量、產品類型。簡潔回答。',
          [cleanBase64]
        );
        console.log(`✅ 圖片 ${index + 1} 完成`);
        return `[圖片 ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖片 ${index + 1} 失敗:`, e.message);
        return `[圖片 ${index + 1}]: 讀取失敗`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const visualContext = mapResults.join('\n\n');

    console.log(`🎯 Reduce 階段`);

    // Step 2: Reduce (深度分析)
    const finalPrompt = `你是 BrotherG，蝦皮電商專家。

視覺數據:
${visualContext}

用戶問題: ${textPrompt || '請分析這些數據'}

請分析並提供策略。
輸出必須是有效的 JSON: ${jsonStructure}`;

    const finalResult = await callGemini(MODELS.PRO, finalPrompt);
    const cleanFinalJson = finalResult.replace(/```json|```/g, '').trim();

    console.log(`✅ 完成`);

    return {
      statusCode: 200,
      headers,
      body: cleanFinalJson
    };

  } catch (error) {
    console.error('🔥 錯誤:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        summary: '系統錯誤',
        recommendations: ['請檢查 API Key', error.message],
        plan: 'Error'
      })
    };
  }
};
