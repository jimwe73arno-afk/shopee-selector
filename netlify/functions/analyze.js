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
        maxOutputTokens: 900,   // 控制在一張決策卡的長度
        temperature: 0.7,
        topP: 0.8
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

    const prompt = `你現在是一位 Shopee 直播間「決策顧問」，只用繁體中文回答。

【任務】
- 讀懂賣家輸入的產品／場景描述（例如：${textPrompt || "esim apple手機殼混著賣"}）。
- 幫他做「直播決策卡」，讓他知道：能不能賣、怎麼排品、怎麼講。

【輸出規則（很重要）】
- 只能輸出 Markdown 文字。
- 禁止輸出 JSON、禁止出現 { }、"summary:"、"plan:"、"recommendations:" 這種 key。
- 內容要短而有力，不要寫成長篇論文。

【格式，務必照著來】

### 一、先給結論（一句話）
- 用一句話說「這樣賣法有沒有機會」＋「下一步建議做什麼」。

### 二、觀眾畫像（最多 3 點）
- 用條列描述這個商品最容易鎖定的 1～2 種人，以及他們的核心痛點。

### 三、選品與組合戰術（C-A-B 模型）
- C 軌（引流款）：一句話說明賣什麼、放什麼價位、主要目的（拉流量／拉評價）。
- A 軌（利潤款）：一句話說明主力賺錢商品是什麼、價格帶、如何包裝成「升級方案」。
- B 軌（湊單款）：一句話說明用哪些小東西提高客單（UPT）和免運門檻。

### 四、直播話術示範（完整一段口播稿）
- 用第一人稱直播口吻寫，約 120～180 字。
- 可以像 3C 主播，語氣自然、有節奏，適合直接照念。

### 五、風險提醒（最多 2 點）
- 每點都用「風險＋兜底做法」的格式，例如：
  - 風險：eSIM 綁定流程複雜 → 做法：賣場與直播中附上圖文步驟，提供 Line 客服協助。

請嚴格遵守以上章節與順序。`;

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

    // 清理 markdown 代碼塊標記（如果有）
    const cleanResult = result.replace(/```json|```/g, "").trim();

    // 返回 Markdown 格式的決策卡（不再是 JSON）
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/plain; charset=utf-8'  // 改為 text/plain，因為返回的是 Markdown
      },
      body: cleanResult
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
