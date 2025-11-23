// netlify/edge-functions/analyze.js
// BrotherG AI - Edge Function (无超时限制)

export const config = {
  path: "/api/analyze"
};

const API_KEY = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const API_VERSION = "v1beta";
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;
const MODEL_NAME = "gemini-2.5-flash";

export default async (request, context) => {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const startTime = Date.now();

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = await request.json();
    const { textPrompt, images = [] } = body;

    console.log(`🚀 Edge Function: ${images.length} images (One-Shot Mode)`);

    const jsonStructure = `{
  "summary": "观众画像分析",
  "recommendations": [
    "🪝 C轨 (诱饵): [商品名] - 理由",
    "💰 A轨 (主菜): [商品名] - 理由", 
    "📦 B轨 (汤品): [商品名] - 理由"
  ],
  "plan": "完整主播带货口播稿"
}`;

    const systemInstruction = `你是"蝦皮直播戰術分析師"。

任務：
1. 分析上傳的圖片（商品清單/截圖）
2. 分析用戶問題：${textPrompt || "請提供選品建議"}
3. 創建"組合策略"（C軌誘餌 → A軌利潤 → B軌加購）
4. 撰寫銷售腳本

輸出：嚴格 JSON 格式：${jsonStructure}`;

    // 純文字模式
    if (!images || images.length === 0) {
      console.log(`📝 Text-only mode`);
      
      const contents = [{ 
        role: "user", 
        parts: [{ text: systemInstruction }] 
      }];
      
      const url = `${BASE_URL}/${MODEL_NAME}:generateContent?key=${API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = text.replace(/```json|```/g, "").trim();
      
      const textTime = Date.now() - startTime;
      console.log(`⏱️ Text-only完成: ${textTime}ms`);
      
      return new Response(cleanJson, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // One-Shot 模式：一次性发送所有图片
    const MAX_IMAGES = 3;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ One-Shot 模式: ${imagesToProcess.length} 張圖片`);

    const contents = [{
      role: "user",
      parts: [
        ...imagesToProcess.map(img => ({
          inline_data: {
            mime_type: "image/jpeg",
            data: img.replace(/^data:image\/\w+;base64,/, "")
          }
        })),
        { text: systemInstruction }
      ]
    }];

    const url = `${BASE_URL}/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 8192,
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

    const cleanJson = text.replace(/```json|```/g, "").trim();

    const totalTime = Date.now() - startTime;
    console.log(`✅ 完成: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

    return new Response(cleanJson, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error("🔥 Error:", error);
    return new Response(JSON.stringify({
      summary: "系統錯誤",
      recommendations: ["Gemini 處理中", "請嘗試減少圖片數量"],
      plan: `Error: ${error.message}`
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
