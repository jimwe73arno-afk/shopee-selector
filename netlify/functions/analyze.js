// netlify/functions/analyze.js
// BrotherG AI - 最終修正版
// 使用正確的模型名稱：gemini-1.5-flash 和 gemini-1.5-pro

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

// ✅ 使用 v1beta（穩定版）
const API_VERSION = "v1beta";
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// ✅ 正確的模型名稱（無 -002 後綴）
const MODEL_FLASH = "gemini-1.5-flash";
const MODEL_PRO = "gemini-1.5-pro";

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`🤖 呼叫: ${modelName}`);
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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || "{}");
    const { textPrompt, images = [] } = body;

    console.log(`🚀 請求: ${images.length} 張圖片 (使用 ${API_VERSION})`);

    const jsonStructure = `{
  "summary": "分析內容",
  "recommendations": ["建議1", "建議2"],
  "plan": "執行計劃"
}`;

    // 純文字模式
    if (!images || images.length === 0) {
      console.log(`📝 純文字模式`);
      
      const result = await callGemini(
        MODEL_FLASH,
        `問題: ${textPrompt}\n\n請以 JSON 格式回覆: ${jsonStructure}`
      );
      
      const cleanJson = result.replace(/```json|```/g, "").trim();
      return { statusCode: 200, headers, body: cleanJson };
    }

    // Map-Reduce 模式（限制 2 張圖片）
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map 階段: ${imagesToProcess.length} 張圖片`);

    // Step 1: Map（並行處理）
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
        const text = await callGemini(
          MODEL_FLASH,
          "提取關鍵數據：價格、銷量、產品類型。簡潔回答。",
          [cleanBase64]
        );
        console.log(`✅ 圖片 ${index + 1}/${imagesToProcess.length}`);
        return `[圖片 ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖片 ${index + 1}:`, e.message);
        return `[圖片 ${index + 1}]: 處理失敗`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const visualContext = mapResults.join("\n\n");

    console.log(`🎯 Reduce 階段`);

    // Step 2: Reduce（深度分析）
    const finalPrompt = `你是 BrotherG，蝦皮電商專家。

視覺數據:
${visualContext}

用戶問題: ${textPrompt || "請分析這些數據"}

請分析並提供策略。
必須以 JSON 格式回覆: ${jsonStructure}`;

    const finalResult = await callGemini(MODEL_PRO, finalPrompt);
    const cleanFinalJson = finalResult.replace(/```json|```/g, "").trim();

    console.log(`✅ 分析完成 (${cleanFinalJson.length} 字元)`);

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
        summary: "系統錯誤",
        recommendations: ["請稍後再試", error.message],
        plan: "Error"
      })
    };
  }
};
