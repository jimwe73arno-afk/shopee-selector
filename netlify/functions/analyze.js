// netlify/functions/analyze.js
// BrotherG AI - "Gemini 2.5 Force" Version
// Logic: Uses Gemini 2.5 Flash, removes Deno dependencies, disables safety filters.

// 使用 Node.js Runtime，避免 Deno 環境問題
// 2.5 Flash 處理純文字夠快，通常可以在 10 秒內完成

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = "v1beta";
const MODEL_NAME = "gemini-2.5-flash"; // 鎖定 2.5

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "text/plain; charset=utf-8",
  };

  // 1. CORS 處理
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: "Method Not Allowed",
    };
  }

  try {
    // 解析請求體
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Body 解析失敗" }),
      };
    }

    const { textPrompt } = body;

    if (!API_KEY) {
      throw new Error("API Key 設定錯誤 (請檢查 Netlify 環境變數)");
    }

    if (!textPrompt) {
      throw new Error("textPrompt 為必填欄位");
    }

    console.log(`🚀 Requesting ${MODEL_NAME} (Text Only)...`);

    // 2. 戰術指令 (Markdown 格式)
    const systemInstruction = `
你現在是 Shopee 直播戰術分析師。
請根據用戶輸入的產品描述，產出【直播決策卡】。

格式要求 (Markdown)：
### 📊 市場洞察
### 🎯 C-A-B 選品戰術
* 🪝 **誘餌 (C):**
* 💰 **利潤 (A):**
* 📦 **湊單 (B):**
### 🗣️ 主播話術
`;

    // 3. 呼叫 Google API
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${systemInstruction}\n\n【用戶輸入】\n${textPrompt}` }]
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7
        },
        // 🔥 關鍵：關閉所有安全過濾，避免 AI 已讀不回 (出現 15 字的情況)
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ Google API Error:", errText);
      throw new Error(`Google API Error: ${errText.substring(0, 500)}`);
    }

    const data = await response.json();
    
    // 檢查是否有內容
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      console.error("❌ Empty Response:", JSON.stringify(data));
      throw new Error("AI 回傳空白 (可能被 Google 攔截)");
    }

    console.log(`✅ Success! Length: ${resultText.length}`);

    // 4. 回傳結果
    return {
      statusCode: 200,
      headers,
      body: resultText,
    };

  } catch (error) {
    console.error("🔥 Server Error:", error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: error.message || "Server Error" }),
    };
  }
};