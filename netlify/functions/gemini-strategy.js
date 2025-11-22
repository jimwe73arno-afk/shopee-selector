const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: BASE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: BASE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const body = JSON.parse(event.body || "{}");
    const visionText = body.visionText || '';
    const prompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';

    if (!visionText) throw new Error("缺少 visionText");
    if (!prompt) throw new Error("缺少 prompt");

    console.log(`📊 模式: 🎯 策略推理 (3.0-pro)`);
    console.log(`📝 摘要長度: ${visionText.length} 字元`);

    // 組合提示詞
    let combinedPrompt = '';
    if (systemPrompt) {
      combinedPrompt = systemPrompt + '\n\n' + prompt;
    } else {
      combinedPrompt = prompt;
    }

    const finalPrompt = `
以下是 AI 從蝦皮後台截圖讀出的「純描述」摘要：
--------------------------------
${visionText}
--------------------------------

請你完整套用下面這段決策提示，產出最終分析與行動建議：
--------------------------------
${combinedPrompt}
--------------------------------

請直接輸出診斷與行動，不要再逐條重複原始摘要。
    `.trim();

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: finalPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1800, // ✅ 壓在 20 秒內
      },
    };

    console.log(`🚀 呼叫 gemini-3-pro-preview...`);
    const startTime = Date.now();

    const res = await fetch(
      `${ENDPOINT}/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ ${responseTime}ms`);

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ strategy error:", text);
      throw new Error(text);
    }

    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("").trim();

    console.log(`✅ 完成 (${text.length} 字元)`);

    return {
      statusCode: 200,
      headers: BASE_HEADERS,
      body: JSON.stringify({ 
        response: text,
        modelUsed: "gemini-3-pro-preview",
        responseTime: `${responseTime}ms`
      }),
    };
  } catch (err) {
    console.error("❌ strategy error:", err);
    return {
      statusCode: 500,
      headers: BASE_HEADERS,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};

