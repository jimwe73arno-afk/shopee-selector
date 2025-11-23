// netlify/functions/analyze.js
// BrotherG AI - "Gemini 2.5" Edition
// Architecture: Raw Fetch (No SDK) + v1beta Endpoint

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

// 策略：新模型 (2.5) 通常需要 v1beta 才能存取
const API_VERSION = "v1beta"; 
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 修正：切換至用戶指定的 2.5 系列
const MODEL_MAP = "gemini-2.5-flash"; 
const MODEL_REDUCE = "gemini-2.5-pro";

// 診斷功能：列出所有可用模型 (如果失敗時執行)
async function logAvailableModels() {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(listUrl);
    const data = await response.json();
    console.log("📋 [DIAGNOSTIC] Available Models:", 
      data.models?.map(m => m.name) || "No models found");
  } catch (e) {
    console.error("⚠️ Failed to list models:", e.message);
  }
}

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling Gemini: ${modelName} (${API_VERSION})...`);
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
        maxOutputTokens: 8192, // 2.5 系列通常支援更長的輸出，開大一點防止截斷
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.error(`❌ Model ${modelName} not found. Running diagnostic...`);
      await logAvailableModels();
    }
    const errorText = await response.text();
    console.error(`❌ API Error Details:`, errorText.substring(0, 500));
    throw new Error(`Gemini API Error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response text";
  console.log(`✅ Success (${text.length} chars)`);
  return text;
}

exports.handler = async (event) => {
  // CORS Headers
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

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || "{}");
    const { textPrompt, images = [] } = body;

    console.log(`🚀 Request: ${images.length} images. Model: Gemini 2.5`);

    const jsonStructure = `
    {
      "summary": "...",
      "recommendations": ["...", "..."],
      "plan": "..."
    }
    `;

    // Branch A: Text Only
    if (!images || images.length === 0) {
      console.log(`📝 Text-only mode`);
      const result = await callGemini(MODEL_MAP, 
        `User Question: ${textPrompt}\n\nRespond in strictly valid JSON format: ${jsonStructure}`);
      const cleanJson = result.replace(/```json|```/g, "").trim();
      return { statusCode: 200, headers, body: cleanJson };
    }

    // Branch B: Map-Reduce (Images)
    // 限制最多 2 張圖片
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ Image count ${images.length} > ${MAX_IMAGES}, processing first ${MAX_IMAGES} only`);
    }
    
    console.log(`⚡ Map Phase: ${imagesToProcess.length} images`);
    
    // Step 1: Map
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
        const text = await callGemini(MODEL_MAP, 
          "Extract key data (Price, Sales, Style). Be concise.", 
          [cleanBase64]
        );
        console.log(`✅ Image ${index + 1}/${imagesToProcess.length} processed`);
        return `[Image ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ Image ${index + 1} failed:`, e.message);
        return `[Image ${index + 1}]: Read Error`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const visualContext = mapResults.join("\n");

    // Step 2: Reduce
    console.log(`🎯 Reduce Phase: Deep reasoning`);
    
    const finalPrompt = `
      You are BrotherG, an E-commerce Expert.
      Visual Data: ${visualContext}
      User Query: ${textPrompt || 'Please analyze this data'}
      
      Analyze this and provide a strategy.
      Output MUST be valid JSON: ${jsonStructure}
    `;

    const finalResult = await callGemini(MODEL_REDUCE, finalPrompt);
    const cleanFinalJson = finalResult.replace(/```json|```/g, "").trim();

    console.log(`✅ Complete (${cleanFinalJson.length} chars)`);

    return {
      statusCode: 200,
      headers,
      body: cleanFinalJson
    };

  } catch (error) {
    console.error("🔥 Server Error:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        summary: "系統繁忙", 
        recommendations: ["請檢查模型權限", `錯誤: ${error.message}`], 
        plan: "System Error" 
      })
    };
  }
};
