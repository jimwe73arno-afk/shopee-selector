// netlify/functions/analyze.js
// BrotherG AI - "Unleashed" Version
// Fixes: Token limits (truncation) and Logic Quality (C-A-B Strategy)

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
const API_VERSION = "v1beta"; 
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 使用 Flash 模型以確保速度，但我們會在 Config 解鎖它的字數上限
const MODEL_NAME = "gemini-2.5-flash"; 

async function callGemini(prompt, imageParts = []) {
  const url = `${BASE_URL}/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling Gemini: ${MODEL_NAME}${imageParts.length > 0 ? ` (${imageParts.length} images)` : ''}`);
  
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
        // 🔓 關鍵修改：解鎖字數限制，讓它能寫出完整的帶貨稿
        maxOutputTokens: 8192, 
        temperature: 0.8 // 稍微調高創意度，讓話術更自然
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`Gemini API Error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response text";
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

    console.log(`🚀 Request: ${images.length} images. Mode: C-A-B Strategy Unleashed.`);

    // 定義回傳結構
    const jsonStructure = `
    {
      "summary": "一句話描述觀眾畫像 (例如：價格敏感型 / 3C 剛需客)",
      "recommendations": [
        "🪝 C軌 (誘餌): [商品名] - 吸引流量",
        "💰 A軌 (主菜): [商品名] - 高利潤核心",
        "📦 B軌 (湯品): [商品名] - 湊單神器"
      ],
      "plan": "完整的主播帶貨口播稿 (Script)。必須包含開場、轉折、促購、以及具體的優惠券引導。語氣要興奮、急迫。"
    }
    `;

    // Branch A: Text Only
    if (!images || images.length === 0) {
      console.log(`📝 Text-only mode`);
      const result = await callGemini( 
        `User Query: ${textPrompt}\n\nTask: Generate a Shopee Live sales script.\nOutput Format: JSON ${jsonStructure}`);
      const cleanJson = result.replace(/```json|```/g, "").trim();
      
      const textTime = Date.now() - startTime;
      console.log(`⏱️ Text-only完成: ${textTime}ms`);
      return { 
        statusCode: 200, 
        headers,
        body: cleanJson 
      };
    }

    // Branch B: Map-Reduce (Images)
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map Phase: ${imagesToProcess.length} 張圖片（OCR 提取商品資訊）`);
    
    // Step 1: Map (讀圖) - 快速萃取資訊
    const mapStartTime = Date.now();
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
        // 告訴 AI 盡量多讀細節，不要省略
        const text = await callGemini( 
          "List ALL product names, prices, discounts, and visible specs from this image. Do not summarize.", 
          [cleanBase64]
        );
        console.log(`✅ 圖片 ${index + 1}/${imagesToProcess.length} OCR完成`);
        return `[Image ${index + 1} Data]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖片 ${index + 1} 失敗:`, e.message);
        return `[Image ${index + 1}]: Error reading image`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const mapTime = Date.now() - mapStartTime;
    console.log(`⚡ Map Phase完成: ${mapTime}ms`);
    
    const visualContext = mapResults.join("\n");

    // Step 2: Reduce (戰術決策) - 這是你的靈魂 Prompt
    console.log(`🎯 Reduce Phase: 生成完整帶貨話術`);
    const reduceStartTime = Date.now();
    
    const finalPrompt = `
      You are the "Shopee Live Tactical Analyst" (蝦皮直播戰術分析師).
      
      === INPUT DATA ===
      [Visual Context from Screenshots]:
      ${visualContext}
      
      [User Query / Audience Question]:
      "${textPrompt || '請分析這些商品'}"
      
      === YOUR MISSION (C-A-B STRATEGY) ===
      You must construct a bundling strategy based on the available products:
      1. **C-Track (Hook):** The product that answers the user's question directly.
      2. **A-Track (Meat):** A high-margin accessory or complementary product (The real profit maker).
      3. **B-Track (Soup):** A low-cost add-on to hit free shipping thresholds.

      === OUTPUT REQUIREMENTS ===
      1. **Tone:** Energetic, professional, persuasive (Like a top livestreamer).
      2. **Detail:** Do NOT be concise. Write a FULL script.
      3. **Format:** Strictly Valid JSON matching this structure: ${jsonStructure}
    `;

    const finalResult = await callGemini(finalPrompt);
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
    console.error("🔥 Server Error:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        summary: "系統忙碌中", 
        recommendations: ["請檢查網路", "請稍後再試"], 
        plan: `Error: ${error.message}` 
      })
    };
  }
};
