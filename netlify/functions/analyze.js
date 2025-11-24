// netlify/functions/analyze.js
// 穩定版：Edge Runtime + 非串流，專做 Shopee 決策卡

export const config = {
  runtime: "edge",
};

const API_KEY =
  Deno.env.get("GOOGLE_API_KEY") ||
  Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");

const API_VERSION = "v1beta";
const MODEL_NAME = "gemini-2.5-flash";

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await request.json();
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

    const fullPrompt =
      `${systemInstruction}\n\n【賣家輸入】\n${textPrompt}\n`;

    const apiUrl = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

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
      return new Response(
        JSON.stringify({ error: "Gemini API Error", detail: errText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await upstreamResponse.json();
    const parts =
      data.candidates?.[0]?.content?.parts || [];
    const text =
      parts.map((p) => p.text || "").join("") ||
      "目前無法產生建議，請稍後再試。";

    console.log("✅ Success, length:", text.length);

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Server Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};