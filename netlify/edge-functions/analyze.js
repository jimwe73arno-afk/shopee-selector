// netlify/edge-functions/analyze.js
// BrotherG AI - True Edge Streaming
// 這是業界標準做法：使用 Edge Runtime + 串流輸出，徹底解決 Timeout 和空值問題。

export default async (request, context) => {
  // 1. 處理跨域 (CORS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    // Edge 讀取環境變數的正確方式
    const API_KEY = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    const body = await request.json();
    const { textPrompt } = body;

    if (!API_KEY) {
      throw new Error("Missing GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY");
    }

    if (!textPrompt) {
      throw new Error("textPrompt is required");
    }

    // 2. 使用 gemini-2.5-flash
    const MODEL = "gemini-2.5-flash";
    const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${API_KEY}`;

    console.log(`🚀 Edge Streaming: ${MODEL}`);

    // 3. 簡單暴力的 Prompt (不要複雜的 JSON 結構，直接講人話)
    const systemPrompt = `
你現在是【蝦皮直播戰術分析師】。
請針對用戶輸入的商品或問題，直接輸出 Markdown 格式的分析報告。

架構如下：
### 📊 市場判斷
(一句話點評)
### 🎯 C-A-B 戰術組合
* 🪝 **誘餌(C):**
* 💰 **利潤(A):**
* 📦 **湊單(B):**
### 🗣️ 主播話術
(直接寫口播稿，語氣興奮專業)
`;

    // 4. 發送請求 (開啟串流模式)
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n用戶輸入: ${textPrompt}` }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        // 關閉安全鎖，避免被誤殺
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API Error: ${err}`);
    }

    // 5. 建立串流管道 (Pipeline)
    // 這段代碼負責把 Google 的資料流，即時轉發給前端，不做任何暫存
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Google 傳回來的是 JSON 物件流，我們需要簡單提取文字
          // 這裡用最簡單的正則表達式來抓取 "text" 欄位
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.trim() && line.includes('"text":')) {
              try {
                // 嘗試解析 JSON 行
                const jsonMatch = line.match(/\{[^}]*"text"[^}]*\}/);
                if (jsonMatch) {
                  const jsonObj = JSON.parse(jsonMatch[0]);
                  if (jsonObj.text) {
                    await writer.write(encoder.encode(jsonObj.text));
                  }
                } else {
                  // 備用：直接用正則提取
                  const match = line.match(/"text":\s*"(.*?)"/);
                  if (match && match[1]) {
                    const text = JSON.parse(`"${match[1]}"`);
                    await writer.write(encoder.encode(text));
                  }
                }
              } catch (e) {
                // 跳過解析失敗的行
              }
            }
          }
        }
      } catch (e) {
        console.error("Stream Error:", e);
        await writer.write(encoder.encode("\n[連線中斷]"));
      } finally {
        writer.close();
      }
    })();

    // 6. 回傳串流 Response (這是 Edge Function 的核心能力)
    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("❌ Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      } 
    });
  }
};