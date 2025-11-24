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
    // Edge 讀取環境變數的正確方式
    const API_KEY = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    const body = await request.json();
    const { textPrompt, userEmail, userTier = "FREE" } = body; // 預設為 FREE

    if (!API_KEY) {
      throw new Error("Missing GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY");
    }

    if (!textPrompt) {
      throw new Error("textPrompt is required");
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

    if (actualTier === "MASTER") {
      // 大師版提示詞（800-1000 字）
      systemPrompt = `你是「BrotherG Shopee Analyst MASTER」，角色接近「操盤顧問 + 營運長」，主要服務有基本成交、正在衝千萬營收的賣家。

【輸入型態】
使用者會輸入：主賣品類（例如 eSIM + 手機）、不同品項的毛利率或分潤％、平均每日單量／營業額、目前遇到的瓶頸（例如：利潤被吃光、場場有賣但賺不多）。

【回覆總則】
1. 一律用繁體中文，禁止 emoji。
2. 使用 Markdown，固定四個段落標題：
   - 「### 一、現況診斷」
   - 「### 二、結構與利潤調整」
   - 「### 三、七日實驗計畫」
   - 「### 四、直播腳本與決策題」
3. 每段 2–4 個重點句，偏決策與結構，不做太細的課程展開。
4. 總長度控制在約 800–1000 個中文字。

【段落說明】

一、### 一、現況診斷
- 用 2–3 句話總結目前局面（例如：高分潤商品在冷，低分潤商品在熱、平均毛利被壓在哪個區間）。
- 指出 2 個「真正卡住獲利」的關鍵點，而不是列一堆瑣碎問題。

二、### 二、結構與利潤調整
- 以 C-A-B 結構重新設計商品矩陣，但要加上「利潤結構」視角：哪一軌負責毛利、哪一軌負責現金流與評價。
- 明確提出 2–3 個「要砍掉或降權的商品類型」，以及 2–3 個「應該加重曝光的商品類型」，並說明原因。
- 若使用者給了分潤％，請示意這樣的分潤是否有空間談，或應該改成「用量體換條件」。

三、### 三、七日實驗計畫
- 幫他設計一個 7 天內可執行的小實驗，例如：價格 A/B、主圖／標題 A/B、不同開場商品順序。
- 每個實驗要點出：目標指標（例如：加購率、觀看停留、每千曝光成交數）與成功條件。
- 不需要寫成表格，只要條列清楚、好執行。

四、### 四、直播腳本與決策題
- 給一段「開場到第一個轉單點」的腳本雛形，約 8–12 句，語氣比 PRO 版更偏策略感（會解釋為什麼這樣排）。
- 結尾一定要幫他收一個「決策題」，例如：
  - 「如果你願意犧牲今天一點毛利換取穩定回購，就採用方案 A。」
  - 「如果你寧願把場次拉少、但每場都要高毛利，就採用方案 B。」
- 讓使用者一看就知道：自己是 A 型還是 B 型賣家，該選哪個方向。

【錯誤與安全】
- 不要捏造實際平台規則或保證收益，只能給「方向建議」與「實驗設計」。
- 若資訊過少，請在「現況診斷」最後列出「建議補充的關鍵數據」，但仍然依照現有資訊給出策略。`;
      maxTokens = 2048;
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

    console.log(`🚀 Edge Streaming: ${MODEL} | Tier: ${actualTier} | Email: ${userEmail || 'N/A'}`);

    // 4. 發送請求 (開啟串流模式)
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n用戶輸入: ${textPrompt}` }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
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
          
          // 按行分割，处理完整的 JSON 对象
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              // 尝试解析完整的 JSON 对象
              const jsonObj = JSON.parse(line);
              
              // 检查是否是 candidates 数组
              if (jsonObj.candidates && jsonObj.candidates.length > 0) {
                const candidate = jsonObj.candidates[0];
                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      await writer.write(encoder.encode(part.text));
                    }
                  }
                }
              }
              
              // 检查是否有直接的 text 字段
              if (jsonObj.text) {
                await writer.write(encoder.encode(jsonObj.text));
              }
              
            } catch (e) {
              // 如果不是完整的 JSON，尝试提取 text 字段
              if (line.includes('"text"')) {
                try {
                  // 尝试提取 "text": "..." 格式
                  const textMatches = line.match(/"text"\s*:\s*"([^"]*)"/g);
                  if (textMatches) {
                    for (const match of textMatches) {
                      const textMatch = match.match(/"text"\s*:\s*"([^"]*)"/);
                      if (textMatch && textMatch[1]) {
                        // 处理转义字符
                        const text = textMatch[1]
                          .replace(/\\n/g, '\n')
                          .replace(/\\t/g, '\t')
                          .replace(/\\"/g, '"')
                          .replace(/\\\\/g, '\\');
                        await writer.write(encoder.encode(text));
                      }
                    }
                  }
                } catch (parseError) {
                  // 跳过解析失败的行
                }
              }
            }
          }
        }
        
        // 处理剩余的 buffer
        if (buffer.trim()) {
          try {
            const jsonObj = JSON.parse(buffer);
            if (jsonObj.candidates && jsonObj.candidates.length > 0) {
              const candidate = jsonObj.candidates[0];
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    await writer.write(encoder.encode(part.text));
                  }
                }
              }
            }
          } catch (e) {
            // 忽略最后的解析错误
          }
        }
      } catch (e) {
        console.error("Stream Error:", e);
        await writer.write(encoder.encode("\n\n[串流處理錯誤，但部分內容可能已顯示]"));
      } finally {
        writer.close();
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