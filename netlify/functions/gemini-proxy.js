/**
 * gemini-proxy.js（分段版）
 * Step1：gemini-1.5-flash 讀圖、整理成文字摘要
 * Step2：gemini-3-pro-preview 依照你的決策提示詞做深度推理
 * 前端只要照舊 POST { prompt, images }，images 為 base64 陣列
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// 共用：簡單從 Gemini 回傳 JSON 抽出文字
function extractText(resultJson) {
  if (!resultJson) return "";
  const c = resultJson.candidates?.[0];
  if (!c || !c.content?.parts) return "";
  return c.content.parts.map((p) => p.text || "").join("\n").trim();
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  // CORS & OPTIONS
  const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: baseHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];

    // 🎯 判斷是否有圖片：有圖片走分段模式，沒有圖片直接用 1.5-flash
    const hasImages = images && Array.isArray(images) && images.length > 0;
    const MAX_IMAGES = 10;

    if (!prompt && !hasImages) {
      return {
        statusCode: 400,
        headers: baseHeaders,
        body: JSON.stringify({ error: "請至少上傳 1 張圖片或輸入文字" })
      };
    }

    if (hasImages && images.length > MAX_IMAGES) {
      return {
        statusCode: 400,
        headers: baseHeaders,
        body: JSON.stringify({ error: `一次最多上傳 ${MAX_IMAGES} 張圖片` })
      };
    }

    // 🎯 如果沒有圖片，直接用 1.5-flash 處理文字
    if (!hasImages) {
      console.info("⚡ 模式：純文字（1.5-flash 直接處理）");
      
      const flashEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      
      const flashBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: combinedPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          maxOutputTokens: 4096
        }
      };

      const flashResp = await fetch(flashEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flashBody)
      });

      if (!flashResp.ok) {
        const errText = await flashResp.text();
        throw new Error(`API error: ${flashResp.status} - ${errText}`);
      }

      const flashJson = await flashResp.json();
      const finalText = extractText(flashJson) || "⚠️ 模型沒有產出文字";

      return {
        statusCode: 200,
        headers: baseHeaders,
        body: JSON.stringify({ 
          response: finalText,
          modelUsed: "gemini-1.5-flash",
          mode: "text-only"
        })
      };
    }

    // 🎯 有圖片：分段處理模式
    console.info("🧠 模式：分段（1.5 看圖 → 3.0 推理）");
    console.info("🖼 圖片數量：", images.length);

    // ---------- Step 1：用 1.5-flash 看圖，快速整理摘要 ----------
    const visionEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const visionBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
你是一位 Shopee 數據分析師。
請只根據下面所有截圖，整理出你看到的核心數據點與現象：

- 商品名稱／類目
- 曝光、點擊、成交（如果畫面有）
- CTR、轉化率等關鍵指標
- 任何明顯的異常、亮點或問題

用繁體中文，條列式輸出，不要寫教學或建議，只描述你從畫面「看到什麼」。
              `.trim(),
            },
            ...images.slice(0, MAX_IMAGES).map((raw) => {
              const cleaned = String(raw).replace(/^data:image\/[a-zA-Z]+;base64,/, "");
              let mimeType = "image/jpeg";
              if (String(raw).includes("data:image/png")) mimeType = "image/png";
              else if (String(raw).includes("data:image/webp")) mimeType = "image/webp";
              
              return {
                inlineData: {
                  mimeType: mimeType,
                  data: cleaned,
                },
              };
            }),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    };

    console.info("📥 呼叫 gemini-1.5-flash 讀圖...");
    let controller1 = new AbortController();
    let timeout1 = setTimeout(() => controller1.abort(), 25000); // 25 秒兜底

    const visionResp = await fetch(visionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionBody),
      signal: controller1.signal,
    });
    clearTimeout(timeout1);

    if (!visionResp.ok) {
      const errText = await visionResp.text();
      console.error("❌ 1.5-flash error:", errText);
      return {
        statusCode: visionResp.status,
        headers: baseHeaders,
        body: JSON.stringify({ error: errText }),
      };
    }

    const visionJson = await visionResp.json();
    const visionText = extractText(visionJson) || "（讀圖結果為空）";

    console.info("✅ 1.5-flash 完成摘要，長度：", visionText.length);

    // ---------- Step 2：把摘要 + 你的決策提示丟給 3.0-pro 做深度推理 ----------
    const proEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

    const finalPrompt = `
以下是一個 AI 幫你從 Shopee 後台截圖讀出的「純描述」摘要（只描述畫面看到的數據與現象）：
--------------------------------
${visionText}
--------------------------------

${systemPrompt ? `系統提示：\n${systemPrompt}\n\n` : ''}請你完全依照下面這段「決策提示」來做深度分析與行動建議。決策提示內容如下：
--------------------------------
${prompt}
--------------------------------

請基於上面的摘要與決策提示，輸出最終的分析與建議。不要再重複原始摘要內容，而是直接進入診斷與行動。
    `.trim();

    const proBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: finalPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    };

    console.info("🚀 呼叫 gemini-3-pro-preview 深度推理（timeout: 35s）...");
    let controller2 = new AbortController();
    let timeout2 = setTimeout(() => controller2.abort(), 35000); // 35 秒兜底

    const proResp = await fetch(proEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proBody),
      signal: controller2.signal,
    });
    clearTimeout(timeout2);

    if (!proResp.ok) {
      const errText = await proResp.text();
      console.error("❌ 3.0-pro error:", errText);
      return {
        statusCode: proResp.status,
        headers: baseHeaders,
        body: JSON.stringify({ error: errText }),
      };
    }

    const proJson = await proResp.json();
    const finalText = extractText(proJson) || "⚠️ 模型沒有產出文字";

    console.info("🏁 完成，最終文字長度：", finalText.length);

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({ 
        response: finalText,
        modelUsed: "gemini-3-pro-preview",
        mode: "two-stage",
        imageCount: images.length
      }),
    };
  } catch (err) {
    console.error("🔥 Proxy error:", err);
    
    let errorMessage = err.message || String(err);
    if (errorMessage.includes('timeout') || err.name === 'AbortError') {
      errorMessage = "API 處理時間過長，請減少圖片數量";
    } else if (errorMessage.includes('GEMINI_API_KEY')) {
      errorMessage = "環境變數未配置";
    } else if (errorMessage.includes('404')) {
      errorMessage = "模型不存在";
    } else if (errorMessage.includes('400')) {
      errorMessage = "API 請求格式錯誤";
    }
    
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: errorMessage, details: err.toString() }),
    };
  }
};
