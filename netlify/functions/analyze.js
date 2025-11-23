// netlify/functions/analyze.js
// BrotherG AI - "Production Stable" Version
// Fix: Uses 'v1' endpoint and specific '002' model versions to prevent 404s

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

// 修正 1: 切換到 v1 正式版 (Stable)
const API_VERSION = "v1"; 
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 修正 2: 使用 "002" 最新穩定版 (這是 Google 目前推薦的 Production 版本)
const MODEL_MAP = "gemini-1.5-flash-002"; 
const MODEL_REDUCE = "gemini-1.5-pro-002";

// Helper function to call Google API directly
async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling Gemini (${API_VERSION}): ${modelName}...`);
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
        maxOutputTokens: 4096, 
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
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

    console.log(`🚀 Request: ${images.length} images. Using v1 Stable API.`);

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
    
    // Step 1: Map (限制最多 2 張)
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ Image count ${images.length} > ${MAX_IMAGES}, processing first ${MAX_IMAGES} only`);
    }
    
    console.log(`⚡ Map Phase: ${imagesToProcess.length} images`);
    
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
        return `[Image ${index + 1}]: Error reading image`;
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

    console.log(`✅ Complete: ${cleanFinalJson.length} chars`);

    return {
      statusCode: 200,
      headers,
      body: cleanFinalJson
    };

  } catch (error) {
    console.error("🔥 Server Error:", error);
    return {
      statusCode: 200, // 回傳 200 讓前端能顯示錯誤訊息
      headers,
      body: JSON.stringify({ 
        summary: "系統與 Google 連線時發生小插曲", 
        recommendations: ["請稍後再試", "API Key 權限可能需要檢查", `錯誤: ${error.message}`], 
        plan: "System Error" 
      })
    };
  }
};
