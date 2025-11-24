// netlify/functions/analyze.js
// BrotherG AI - "Lite & Fast" Version
// Strategy: Minimal Prompt + Low Token Limit = Guaranteed Response

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_VERSION = "v1beta";
const MODEL_NAME = "gemini-2.5-flash";

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "text/plain; charset=utf-8",
  };

  // 1. CORS
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
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Body Error" }),
      };
    }

    const { textPrompt } = body;

    if (!API_KEY) {
      throw new Error("API Key 設定錯誤 (請檢查 Netlify 環境變數)");
    }

    if (!textPrompt) {
      throw new Error("textPrompt 為必填欄位");
    }

    console.log(`🚀 Request: Lite Mode. Prompt length: ${textPrompt?.length}`);

    // 2. 極簡化 System Instruction (防止 AI 想太久)
    const systemInstruction = `
你是 Shopee 決策顧問，輸入是賣家狀況。
用繁體中文回答，給四段：
1. 結論 (一句話)
2. C-A-B 選品建議 (誘餌/利潤/湊單)
3. 直播話術 (100字內)
4. 下一步行動
輸出用 Markdown，不要廢話。
`;

    // 3. 呼叫 Google API
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${systemInstruction}\n\n【賣家輸入】\n${textPrompt}` }]
        }],
        generationConfig: {
          maxOutputTokens: 800, // 設定 800 夠講完話，且不會超時
          temperature: 0.7,
        },
        // 關閉安全鎖，避免空值
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
    
    // 4. 檢查結果
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      // 如果還是空的，印出完整 Log 抓兇手
      console.error("❌ Empty Response Details:", JSON.stringify(data));
      throw new Error("AI 生成內容為空 (可能觸發 MAX_TOKENS 截斷)");
    }

    console.log(`✅ Success! Length: ${resultText.length}`);

    return {
      statusCode: 200,
      headers,
      body: resultText,
    };

  } catch (error) {
    console.error("🔥 Error:", error);
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