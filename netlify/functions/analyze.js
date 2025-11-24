// netlify/functions/analyze.js
// BrotherG AI - Node.js 版本（纯 fetch，无 SDK）
// 关键：使用 process.env，不使用 Deno

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
const API_VERSION = "v1beta";
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;
const MODEL_NAME = "gemini-2.5-flash";

async function callGemini(contents) {
  const url = `${BASE_URL}/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling: ${MODEL_NAME}`);
  
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
    console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log(`✅ Success (${text.length} chars)`);
  return text;
}

// Node.js 标准入口
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
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const startTime = Date.now();

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || '{}');
    const { textPrompt, images = [] } = body;

    console.log(`🚀 Request: ${images.length} images`);

    const jsonStructure = `{
  "summary": "观众画像分析",
  "recommendations": [
    "🪝 C轨 (诱饵): [商品名] - 理由",
    "💰 A轨 (主菜): [商品名] - 理由", 
    "📦 B轨 (汤品): [商品名] - 理由"
  ],
  "plan": "完整主播带货口播稿"
}`;

    const prompt = `你是"蝦皮直播戰術分析師"。

任務：
1. 分析上傳的圖片（商品清單/截圖）
2. 分析用戶問題：${textPrompt || "請提供選品建議"}
3. 創建"組合策略"（C軌誘餌 → A軌利潤 → B軌加購）
4. 撰寫銷售腳本

輸出：嚴格 JSON 格式：${jsonStructure}`;

    // 只处理 1 张图片（速度优先）
    const imageToProcess = images.length > 0 ? [images[0]] : [];

    const contents = [{
      role: "user",
      parts: [
        ...imageToProcess.map(img => ({
          inline_data: {
            mime_type: "image/jpeg",
            data: img.replace(/^data:image\/\w+;base64,/, "")
          }
        })),
        { text: prompt }
      ]
    }];

    const result = await callGemini(contents);
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ 完成: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

    const cleanJson = result.replace(/```json|```/g, "").trim();

    return {
      statusCode: 200,
      headers,
      body: cleanJson
    };

  } catch (error) {
    console.error("🔥 Error:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: "系統錯誤",
        recommendations: ["請稍後再試", error.message],
        plan: `Error: ${error.message}`
      })
    };
  }
};
