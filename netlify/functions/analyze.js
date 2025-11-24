// netlify/functions/analyze.js
// 穩定版：Node.js Runtime + 非串流，專做 Shopee 決策卡

const API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

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
    const body = JSON.parse(event.body || "{}");
    const textPrompt = (body.textPrompt || "").toString();

    if (!API_KEY) {
      throw new Error("Missing GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY");
    }
    if (!textPrompt) {
      throw new Error("textPrompt is required");
    }

    const systemInstruction = `
你現在是一位 Shopee 直播間「決策顧問」，只用繁體中文回答。

【任務】
- 讀懂賣家輸入的產品／場景描述（例如：esim apple手機殼混著賣）。
- 幫他做「直播決策卡」，讓他知道：能不能賣、怎麼排品、怎麼講。

【輸出規則】
- 只能輸出 Markdown。
- 禁止輸出 JSON、禁止出現 { }、"summary:"、"plan:"、"recommendations:" 等 key。
- 內容要短而有力，不要寫成論文。

【格式】

### 一、先給結論（一句話）
- 用一句話說「這樣賣法有沒有機會」＋「下一步建議做什麼」。

### 二、觀眾畫像（最多 3 點）

### 三、選品與組合戰術（C-A-B 模型）

### 四、直播話術示範（完整一段口播稿）

### 五、風險提醒（最多 2 點）

請嚴格遵守以上章節與順序。
`;

    const fullPrompt = `${systemInstruction}\n\n【賣家輸入】\n${textPrompt}\n`;

    const apiUrl = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    console.log(`📡 Calling: ${MODEL_NAME}`);

    const upstreamResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 900,
          temperature: 0.7,
          topP: 0.8,
        },
      }),
    });

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      console.error("Gemini API Error:", errText);
      return {
        statusCode: 500,
        headers,
        body: `### 系統錯誤

抱歉，Gemini API 暫時無法使用。

**錯誤詳情**：${errText.substring(0, 200)}

**建議**：
- 請檢查 API Key 是否正確設定
- 稍後再試
- 如果持續發生，請聯繫客服`,
      };
    }

    const data = await upstreamResponse.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text =
      parts.map((p) => p.text || "").join("") ||
      "目前無法產生建議，請稍後再試。";

    console.log(`✅ Success, length: ${text.length}`);

    return {
      statusCode: 200,
      headers,
      body: text,
    };
  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: `### 系統錯誤

抱歉，分析服務暫時無法使用。

**錯誤訊息**：${error.message}

**建議**：
- 請檢查網路連接
- 稍後再試
- 如果持續發生，請聯繫客服`,
    };
  }
};