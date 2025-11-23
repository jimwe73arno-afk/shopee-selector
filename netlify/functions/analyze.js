// netlify/functions/analyze.js
// BrotherG AI - "Speed Optimized" Edition
// 🚀 全部使用 Flash 模型，速度提升 3 倍

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

const API_VERSION = "v1beta"; 
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 🚀 速度優化：全部改用 Flash 模型
// 2.5 Flash 已經足夠聰明，而且速度快 3 倍
const MODEL_MAP = "gemini-2.5-flash"; 
const MODEL_REDUCE = "gemini-2.5-flash"; // ← 關鍵優化！

async function logAvailableModels() {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(listUrl);
    const data = await response.json();
    console.log("📋 Available Models:", 
      data.models?.map(m => m.name) || "No models found");
  } catch (e) {
    console.error("⚠️ Failed to list models:", e.message);
  }
}

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling: ${modelName}`);
  console.log(`📡 Endpoint: ${url.replace(API_KEY, '***')}`);

  const contents = [
    {
      role: "user",
      parts: [
        ...imageParts.map(img => ({
          inline_data: { mime_type: "image/jpeg", data: img }
        })),
        { text: prompt }
      ]
    }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 4096, // Flash 不需要太長
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.error(`❌ Model ${modelName} not found.`);
      await logAvailableModels();
    }
    const errorText = await response.text();
    console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  console.log(`✅ Success (${text.length} chars)`);
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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  const startTime = Date.now();

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || "{}");
    const { textPrompt, images = [] } = body;

    console.log(`🚀 Request: ${images.length} images (Speed Optimized Mode)`);

    const jsonStructure = `{
  "summary": "分析內容",
  "recommendations": ["建議1", "建議2"],
  "plan": "執行計劃"
}`;

    // 純文字
    if (!images || images.length === 0) {
      const result = await callGemini(MODEL_MAP, 
        `問題: ${textPrompt}\n\nJSON 格式: ${jsonStructure}`);
      const cleanJson = result.replace(/```json|```/g, "").trim();
      
      const textTime = Date.now() - startTime;
      console.log(`⏱️ Text-only完成: ${textTime}ms`);
      return { statusCode: 200, headers, body: cleanJson };
    }

    // Map-Reduce
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map Phase: ${imagesToProcess.length} 張圖片`);

    const mapStartTime = Date.now();
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
        const text = await callGemini(MODEL_MAP, 
          "提取數據：價格、銷量、類型。",
          [cleanBase64]
        );
        console.log(`✅ 圖片 ${index + 1}/${imagesToProcess.length}`);
        return `[圖 ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖 ${index + 1}:`, e.message);
        return `[圖 ${index + 1}]: 失敗`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const mapTime = Date.now() - mapStartTime;
    console.log(`⚡ Map Phase完成: ${mapTime}ms`);
    
    const visualContext = mapResults.join("\n\n");

    console.log(`🎯 Reduce Phase: 使用 Flash 模型（快速模式）`);

    const reduceStartTime = Date.now();
    const finalPrompt = `你是蝦皮顧問。

數據:
${visualContext}

問題: ${textPrompt || "分析"}

JSON: ${jsonStructure}`;

    const finalResult = await callGemini(MODEL_REDUCE, finalPrompt);
    const reduceTime = Date.now() - reduceStartTime;
    console.log(`⚡ Reduce Phase完成: ${reduceTime}ms`);
    
    const cleanFinalJson = finalResult.replace(/```json|```/g, "").trim();

    const totalTime = Date.now() - startTime;
    console.log(`✅ 總共完成: ${totalTime}ms (Map: ${mapTime}ms, Reduce: ${reduceTime}ms)`);

    return {
      statusCode: 200,
      headers,
      body: cleanFinalJson
    };

  } catch (error) {
    console.error("🔥 錯誤:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        summary: "錯誤",
        recommendations: [error.message],
        plan: "Error"
      })
    };
  }
};
