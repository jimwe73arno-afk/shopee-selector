// netlify/edge-functions/analyze.js
// BrotherG AI - True Edge Streaming
// 支援 PRO 版和大師版提示詞，根據用戶等級切換

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
    // Edge 讀取環境變數的正確方式 (Netlify Edge Functions)
    // 嘗試多種方式讀取環境變數
    const API_KEY = Deno.env.get("GOOGLE_API_KEY") 
      || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")
      || (context.env && context.env.GOOGLE_API_KEY)
      || (context.env && context.env.GOOGLE_GENERATIVE_AI_API_KEY);

    const body = await request.json();
    const { textPrompt, userEmail, userTier = "FREE" } = body; // 預設為 FREE

    console.log("📥 Request received:", { 
      hasTextPrompt: !!textPrompt, 
      userEmail: userEmail || "N/A", 
      userTier: userTier || "N/A",
      hasApiKey: !!API_KEY 
    });

    if (!API_KEY) {
      console.error("❌ Missing API Key");
      return new Response(JSON.stringify({ 
        error: "Server configuration error: Missing API Key" 
      }), { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      });
    }

    if (!textPrompt) {
      return new Response(JSON.stringify({ 
        error: "textPrompt is required" 
      }), { 
        status: 400, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      });
    }

    // 2. 白名單檢查（暫時放行特定 email）
    const WHITELIST_EMAILS = ["jimwe73arno@gmail.com"];
    const isWhitelisted = userEmail && WHITELIST_EMAILS.includes(userEmail);
    
    // 3. 決定使用的模型和提示詞
    let MODEL = "gemini-2.5-flash";
    let systemPrompt = "";
    let maxTokens = 768;

    // 判斷用戶等級（白名單或付費用戶）
    // 確保 userTier 是大寫格式
    const normalizedUserTier = (userTier || "FREE").toUpperCase();
    const actualTier = isWhitelisted ? "MASTER" : normalizedUserTier;
    
    console.log(`🔍 User Tier: ${actualTier} | Email: ${userEmail || 'N/A'} | Whitelisted: ${isWhitelisted}`);

    if (actualTier === "MASTER") {
      // 大師版提示詞（平面式敘述，避免 token 混亂）
      systemPrompt = `你是「BrotherG Shopee Analyst MASTER」，專為蝦皮賣家提供高階策略建議。
目標：幫助使用者在七天內提升分潤與利潤結構，讓營收更穩定。

請以繁體中文回答，禁止使用 emoji。
輸出請用 Markdown 格式，包含四個部分，每部分各 2–4 句即可。

---
# 一、現況診斷
簡短描述目前的銷售局勢與主要瓶頸。根據輸入內容，指出兩個最關鍵的問題，例如利潤被壓、品項重疊、流量錯配。

# 二、結構與利潤調整
說明如何用 C-A-B 結構重新配置商品：
- C 軌：引流款（舉例價位與作用）
- A 軌：利潤款（舉例策略）
- B 軌：加購款（舉例組合）
給出 1–2 個應該減少曝光或停賣的方向。

# 三、七日實驗計畫
提供一個具體可執行的小實驗，例如調價、主圖 A/B、順序改版。
每個實驗要列出：目標數據、成功條件、預期成效。

# 四、直播腳本建議
寫一小段 5–8 句的直播腳本（從開場到第一個成交點）。
語氣自然、有節奏、能帶入場景。
最後收一句「這是今天的決策題」，讓使用者感覺自己在做選擇。
---

若輸入資訊不足（例如沒有金額、品類），請先假設平均值再推理，不要回「請補資訊」，要給暫時可用的版本。`;
      maxTokens = 640;
    } else if (actualTier === "PRO") {
      // PRO 版提示詞（450-600 字）
      systemPrompt = `你是「BrotherG Shopee Analyst PRO」，專門協助蝦皮賣家做「單一商品／小組合」的選品與定價判斷。

【輸入型態】
使用者會用自然語言輸入：類別、商品描述、成本或毛利概念、分潤％、目前遇到的問題（例如：沒流量、沒轉單、客單價太低）。

【回覆要求總則】
1. 一律使用繁體中文，禁止使用 emoji。
2. 請用 Markdown 輸出，固定四個段落標題：
   - 「### 市場判斷」
   - 「### C-A-B 戰術組合」
   - 「### 操作優先順序」
   - 「### 直播話術範例」
3. 每個段落 2–4 個重點，句子要短、直接，不要寫成長篇大論。
4. 總長度請控制在約 450–600 個中文字，以資訊密度為優先。

【各段落具體說明】

一、### 市場判斷
- 依照使用者輸入的價格帶、利潤率、品類，判斷這個商品目前是「紅海砍價區」「中段穩定區」或「高溢價區」。
- 簡短說明 2–3 個關鍵風險（例如：同質化、評價不足、毛利被抽乾），避免空泛形容詞。

二、### C-A-B 戰術組合
請用 C / A / B 三軌來設計商品結構：
- C 軌＝「引流款」：給出建議價格區間、賣點風格，說明這一軌的任務是衝點擊與進站。
- A 軌＝「利潤款」：根據使用者給的毛利或分潤，大約建議客單價與定位，說明這一軌負責賺錢。
- B 軌＝「湊單款」：給出 1–2 種適合當加購的小東西類型與價格帶，用來拉高件數。

不要亂編具體商品名稱；如果資訊不足，就用「例如：同類型清潔小物、線材配件」這種描述。

三、### 操作優先順序
- 給出 3 個「接下來 7 天內可以做的動作」，例如：先調價、先補主圖、先改標題等。
- 每個動作後面加一句「為什麼先做這個」，用決策邏輯取代空泛鼓勵。

四、### 直播話術範例
- 產出一小段適合直播講的話（約 5–8 句），基於前面 C-A-B 的結構。
- 語氣可以帶節奏感，但禁止喊價式重複（不要一直重複同一句）。
- 內容要呼應使用者輸入的資訊（例如利潤 2% 很薄，就坦白說這是「衝量用的配置」）。

【資訊不足時的處理】
如果關鍵數字缺少（例如完全沒有價格、分潤），請在「市場判斷」段落最後列出「仍需補充的 3 個關鍵資訊」，但仍然先給暫時可用的建議，不要只回問題。`;
      maxTokens = 1024;
    } else {
      // FREE 版（簡化版，使用原本的提示詞）
      systemPrompt = `
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
      maxTokens = 768;
    }

    const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${API_KEY}`;

    console.log(`🚀 Edge Streaming: ${MODEL} | Tier: ${actualTier} | Email: ${userEmail || 'N/A'} | MaxTokens: ${maxTokens}`);

    // 4. 發送請求 (開啟串流模式)
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n用戶輸入: ${textPrompt}` }] }],
        generationConfig: { 
          maxOutputTokens: maxTokens, 
          temperature: 0.7,
          topP: 0.9
        },
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
      console.error(`❌ Google API Error (${response.status}):`, err);
      return new Response(JSON.stringify({ 
        error: `Google API Error: ${response.status} - ${err.substring(0, 200)}` 
      }), { 
        status: response.status, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      });
    }

    // 5. 建立串流管道 (Pipeline)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    (async () => {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // 按行分割，处理完整的 JSON 对象（Google API 每行一个 JSON）
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              // 尝试解析完整的 JSON 对象
              const jsonObj = JSON.parse(line);
              
              // Google Gemini 串流格式：{"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
              if (jsonObj.candidates && Array.isArray(jsonObj.candidates) && jsonObj.candidates.length > 0) {
                const candidate = jsonObj.candidates[0];
                if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      await writer.write(encoder.encode(part.text));
                    }
                  }
                }
              }
            } catch (parseError) {
              // 如果 JSON 解析失败，尝试用正则提取 text 字段（备选方案）
              if (line.includes('"text"')) {
                try {
                  // 匹配 "text": "..." 但需要处理转义字符
                  const textRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
                  let match;
                  while ((match = textRegex.exec(line)) !== null) {
                    if (match[1]) {
                      // 处理转义字符
                      const text = match[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\r/g, '\r')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                      if (text) {
                        await writer.write(encoder.encode(text));
                      }
                    }
                  }
                } catch (regexError) {
                  // 跳过提取失败的行
                  console.warn("Failed to extract text from line:", line.substring(0, 100));
                }
              }
            }
          }
        }
        
        // 处理剩余的 buffer（最后一行）
        if (buffer.trim()) {
          try {
            const jsonObj = JSON.parse(buffer);
            if (jsonObj.candidates && Array.isArray(jsonObj.candidates) && jsonObj.candidates.length > 0) {
              const candidate = jsonObj.candidates[0];
              if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    await writer.write(encoder.encode(part.text));
                  }
                }
              }
            }
          } catch (e) {
            // 最后的 buffer 解析失败，尝试正则提取
            if (buffer.includes('"text"')) {
              const textRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
              let match;
              while ((match = textRegex.exec(buffer)) !== null) {
                if (match[1]) {
                  const text = match[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\r/g, '\r')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                  if (text) {
                    await writer.write(encoder.encode(text));
                  }
                }
              }
            }
          }
        }
        
        console.log("✅ Stream completed successfully");
      } catch (e) {
        console.error("❌ Stream Error:", e);
        await writer.write(encoder.encode("\n\n[串流處理發生錯誤，部分內容可能已顯示]"));
      } finally {
        await writer.close();
      }
    })();

    // 6. 回傳串流 Response
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