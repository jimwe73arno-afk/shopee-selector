// BrotherG AI - Raw Fetch (修正版)
// v1beta 不支援 -latest 後綴

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

const API_VERSION = "v1beta";
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// ✅ v1beta 可用的模型（不要加 -latest）
const MODELS = {
  FLASH: "gemini-1.5-flash",
  PRO: "gemini-1.5-pro"
};

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`🤖 調用: ${modelName}`);
  console.log(`📡 Endpoint: ${url.replace(API_KEY, '***')}`);
  
  const parts = [];
  
  if (imageParts.length > 0) {
    parts.push(...imageParts.map(img => ({
      inline_data: { 
        mime_type: "image/jpeg", 
        data: img 
      }
    })));
  }
  
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
    console.error(`❌ API 錯誤 (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "無回應";
  
  console.log(`✅ 成功 (${text.length} 字元)`);
  return text;
}

exports.handler = async (event) => {
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

    console.log(`📊 請求: ${images.length} 張圖片`);

    const jsonStructure = `{
  "summary": "分析內容",
  "recommendations": ["建議1", "建議2"],
  "plan": "執行計劃"
}`;

    // 純文字模式
    if (!images || images.length === 0) {
      console.log(`📝 純文字`);
      
      const result = await callGemini(
        MODELS.FLASH,
        `問題: ${textPrompt}\n\n以 JSON 格式回覆: ${jsonStructure}`
      );
      
      const cleanJson = result.replace(/```json|```/g, '').trim();
      
      return { 
        statusCode: 200, 
        headers,
        body: cleanJson 
      };
    }

    // Map-Reduce 模式
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map: ${imagesToProcess.length} 張`);

    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, '');
        const text = await callGemini(
          MODELS.FLASH,
          '提取關鍵數據：價格、銷量、類型。',
          [cleanBase64]
        );
        console.log(`✅ 圖 ${index + 1}`);
        return `[圖 ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖 ${index + 1}:`, e.message);
        return `[圖 ${index + 1}]: 失敗`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const visualContext = mapResults.join('\n\n');

    console.log(`🎯 Reduce`);

    const finalPrompt = `你是蝦皮顧問。

數據:
${visualContext}

問題: ${textPrompt || '請分析'}

JSON 回覆: ${jsonStructure}`;

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
        summary: '錯誤',
        recommendations: [error.message],
        plan: 'Error'
      })
    };
  }
};
