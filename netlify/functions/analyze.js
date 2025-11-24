// netlify/functions/analyze.js
// Shopee Analyst - Text Only Minimal Version

const API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const baseCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonHeaders = {
  ...baseCorsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseCorsHeaders };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: jsonHeaders, body: "Method Not Allowed" };
  }

  try {
    if (!API_KEY) {
      console.error("Missing GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY");
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          ok: false,
          result: "系統尚未設定金鑰，請稍後再試。",
        }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const userText = (body.textPrompt || "").trim();

    if (!userText) {
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          ok: false,
          result: "請先輸入產品描述或你現在遇到的問題。",
        }),
      };
    }

    // 最小但結構化的 system 語氣
    const systemPrompt =
      "你是 Shopee 直播選品顧問，請用條列、結構化方式回答。" +
      "輸出分成三段：「一、現況診斷」「二、價格與利潤判斷」「三、直播排品與話術建議」。" +
      "全程使用繁體中文，避免廢話，專注在可執行的建議。";

    const fullPrompt = `${systemPrompt}\n\n=== 使用者輸入 ===\n${userText}`;

    console.info("📝 Requesting", MODEL, "Text Only...");

    const resp = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
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
          maxOutputTokens: 768, // 控制在一頁以內，避免 MAX_TOKENS
          temperature: 0.7,
          topP: 0.9,
        },
      }),
    });

    const data = await resp.json();
    const finishReason = data?.candidates?.[0]?.finishReason;
    console.info("🔍 finishReason:", finishReason);

    let text = "";

    if (Array.isArray(data.candidates) && data.candidates.length > 0) {
      const parts = data.candidates[0].content?.parts || [];
      text = parts
        .map((p) => p.text || "")
        .join("")
        .trim();
    }

    // 無論是 MAX_TOKENS / SAFETY / 解析失敗，都不要再丟 500
    if (!text) {
      console.warn("⚠️ Empty text from model, raw data:", JSON.stringify(data));
      text = "目前無法產生建議，可能是模型輸出被截斷或暫時忙碌，請稍後再試。";
    }

    console.info("✅ Success, length:", text.length);

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: true,
        result: text,
      }),
    };
  } catch (err) {
    console.error("❌ Analyze Error:", err);

    // 這裡一律 200 + 保底文案，前端就不會再看到 500 了
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: false,
        result: "系統忙線中，暫時無法完成分析，請稍後再試。",
      }),
    };
  }
};