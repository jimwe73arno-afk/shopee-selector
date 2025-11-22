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
    const images = body.images || [];

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error("缺少 images");
    }

    const MAX_IMAGES = 6;
    if (images.length > MAX_IMAGES) {
      return {
        statusCode: 400,
        headers: BASE_HEADERS,
        body: JSON.stringify({ error: `一次最多上傳 ${MAX_IMAGES} 張圖片` })
      };
    }

    console.log(`📊 模式: 🎯 圖片讀取 (2.5-flash)`);
    console.log(`📷 圖片數量: ${images.length}`);

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `
你是蝦皮數據分析師。
請根據以下所有後台截圖，整理出你「看到」的數據與現象：

- 商品名稱 / 類目
- 曝光、點擊、成交
- CTR、轉化率
- 明顯異常或亮點

只做描述，不要給建議。
            `.trim(),
          },
          ...images.slice(0, MAX_IMAGES).map((raw) => {
            const data = String(raw).replace(
              /^data:image\/[a-zA-Z]+;base64,/,
              ""
            );
            let mimeType = "image/jpeg";
            if (String(raw).includes("data:image/png")) {
              mimeType = "image/png";
            } else if (String(raw).includes("data:image/webp")) {
              mimeType = "image/webp";
            }
            
            return {
              inlineData: {
                mimeType: mimeType,
                data,
              },
            };
          }),
        ],
      },
    ];

    const requestBody = {
      contents,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    };

    console.log(`🚀 呼叫 gemini-2.5-flash...`);
    const startTime = Date.now();

    const res = await fetch(
      `${ENDPOINT}/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      console.error("❌ vision error:", text);
      throw new Error(text);
    }

    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const visionText = parts.map((p) => p.text || "").join("").trim();

    console.log(`✅ 完成 (${visionText.length} 字元)`);

    return {
      statusCode: 200,
      headers: BASE_HEADERS,
      body: JSON.stringify({ 
        visionText,
        responseTime: `${responseTime}ms`
      }),
    };
  } catch (err) {
    console.error("❌ vision error:", err);
    return {
      statusCode: 500,
      headers: BASE_HEADERS,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};

