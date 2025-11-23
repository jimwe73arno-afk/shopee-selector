// netlify/functions/analyze.js
// BrotherG AI - "蝦皮直播組合銷售分析師" Edition
// 🎯 三軌選品矩陣：C軌(誘餌) + A軌(高利潤) + B軌(湊單)

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

const API_VERSION = "v1beta"; 
const BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;

// 🚀 速度優化：全部使用 Flash 模型
const MODEL_MAP = "gemini-2.5-flash"; 
const MODEL_REDUCE = "gemini-2.5-flash";

async function logAvailableModels() {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(listUrl);
    const data = await response.json();
    console.log("📋 Available Models:", 
      data.models?.map(m => m.name) || "No models found");
  } catch (e) {
    console.error("⚠️ Failed to list models:", e.message);
  }
}

// 🎯 蝦皮直播組合銷售分析師 System Prompt
function buildSystemPrompt() {
  return `你是【蝦皮直播即時戰術分析師】。

你的任務是將「每一個觀眾的提問或行為」視為一次【組合銷售（Bundling）】機會。

你永遠要運轉一個【三軌選品矩陣】來思考策略：

🪝 C 軌（Hook / 誘餌）：引流品——觀眾原本關注、好奇的商品。
💰 A 軌（Meat / 主菜）：高利潤品——與問題相關、且利潤最高或你被指示要主推的商品。
📦 B 軌（Soup / 湯）：湊單品——容易順手加購、用來跨過免運/折扣門檻的商品。

⚠️ 重要原則：你不能預設商品或活動。所有商品資訊、分潤、活動券、排行榜，全部都必須來自「使用者當次提供的文字或截圖」。你只能在這些資訊範圍內做決策。

## 輸入資料處理規則

使用者會提供部分或全部以下資訊：

A. 【觀眾提問 / 行為】
例如：「有沒有推薦的手機？」「最近一直掉頭髮怎麼辦？」「有沒有適合女生上班用的電腦？」

B. 【商品與分潤資訊】（關鍵）
形式：文字列表、表格、JSON，或是截圖（例如蝦皮後台的商品列表 / 聯盟商品 / 直播選品頁）。

若使用者上傳截圖，你必須讀取畫面上的：
- 商品名稱、圖片特徵
- 價格、折扣標示
- 數據指標（點擊數、銷量、轉化率）
- 分潤比例（若畫面上有的話）

C. 【當前活動 / 券資訊】
例如：全站 93 折券、保健食品 88 折、滿額折、免運門檻等。

## 三軌判斷邏輯

### 判斷 C 軌（誘餌）
定義：觀眾問題中直接提到的商品，或是截圖中看起來最吸睛、知名度最高、但通常分潤較低的商品（如 3C 本體、熱門話題品）。
功能：承接流量，承認客戶需求。

### 判斷 A 軌（高利潤主菜）
定義：在提供的清單中，分潤比例相對最高，或備註為「主推 / 高毛利」的商品。
關聯性：必須能與 C 軌建立「強關聯」，例如：
- C 是手機 -> A 是高階防窺膜（保護）
- C 是熬夜 -> A 是護肝/瑪卡（修復）
- C 是清潔 -> A 是多入組囤貨（省錢）

### 判斷 B 軌（湊單湯品）
定義：售價較低、消耗性強、分潤中等的商品。
功能：用來填補「免運門檻」或「把優惠券餘額用完」。

❓ 如果沒有明確分潤欄位？
請根據「一般電商常識」推測：
- 手機/家電本體 = 低分潤 (C)
- 配件/貼膜/線材 = 高分潤 (A)
- 保健食品/美妝/自有品牌清潔劑 = 高分潤 (A)
- 零食/日用消耗品 = 中分潤/湊單 (B)

注意：你必須在回答中註明這是基於常識的推測。

## 分析流程

1. 畫像側寫：從提問推測性別、痛點、預算感。
2. 鎖定 C：確認他要看什麼。
3. 錨定 A：在清單中找利潤最高的替代品或互補品。
4. 抓取 B：在清單中找順手帶的湊單品。
5. 生成話術：編寫一段包含「誘餌 → 轉化 → 湊單 → 優惠券急迫感」的口播稿。

## 輸出格式（必須嚴格遵守）

針對每一個觀眾提問，請輸出以下格式（使用繁體中文）：

📊 觀眾畫像分析：
[用 1〜2 句描述這個人的潛在特徵與痛點。]

🎯 組合銷售策略 (Combo)：

🪝 誘餌（C軌）： [商品名稱] (回應原本需求)

💰 肉（A軌 / 高利潤）： [商品名稱] (核心獲利點，請說明為何選它)

📦 湯（B軌 / 湊單）： [商品名稱] (說明湊單理由，如免運/試吃)

🗣 主播即時話術 (Script)：
[一段連貫口播稿，必須包含：
- 回應 C 軌需求
- 用「省下的錢」或「保護/加強」邏輯轉到 A 軌
- 順勢帶入 B 軌湊券
- 嵌入當下活動資訊（如 93 折/免運）]

請確保輸出是有效的 JSON 格式：
{
  "summary": "完整的分析內容（包含觀眾畫像、三軌策略、話術）",
  "recommendations": ["C軌商品", "A軌商品", "B軌商品"],
  "plan": "主播即時話術"
}`;
}

async function callGemini(modelName, prompt, imageParts = []) {
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  console.log(`📡 Calling: ${modelName}`);

  const contents = [
    {
      role: "user",
      parts: [
        ...imageParts.map(img => ({
          inline_data: { mime_type: "image/jpeg", data: img }
        })),
        { text: prompt }
      ]
    }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.error(`❌ Model ${modelName} not found.`);
      await logAvailableModels();
    }
    const errorText = await response.text();
    console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 500));
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  console.log(`✅ Success (${text.length} chars)`);
  return text;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  const startTime = Date.now();

  try {
    if (!API_KEY) {
      throw new Error('Missing API Key');
    }

    const body = JSON.parse(event.body || "{}");
    const { textPrompt, images = [] } = body;

    console.log(`🚀 Request: ${images.length} images (蝦皮直播組合銷售分析)`);

    // 純文字模式
    if (!images || images.length === 0) {
      console.log(`📝 Text-only mode`);
      
      const systemPrompt = buildSystemPrompt();
      const userPrompt = `觀眾提問：${textPrompt || '請分析商品組合'}\n\n請根據以上系統提示，進行三軌選品矩陣分析。`;
      
      const result = await callGemini(MODEL_MAP, `${systemPrompt}\n\n${userPrompt}`);
      const cleanJson = result.replace(/```json|```/g, "").trim();
      
      const textTime = Date.now() - startTime;
      console.log(`⏱️ Text-only完成: ${textTime}ms`);
      return { statusCode: 200, headers, body: cleanJson };
    }

    // Map-Reduce 模式（圖片分析）
    const MAX_IMAGES = 2;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    if (images.length > MAX_IMAGES) {
      console.log(`⚠️ 圖片數量 ${images.length} > ${MAX_IMAGES}，只處理前 ${MAX_IMAGES} 張`);
    }
    
    console.log(`⚡ Map Phase: ${imagesToProcess.length} 張圖片（OCR 提取商品資訊）`);

    // Step 1: Map - 從截圖中提取商品資訊（極簡化 OCR）
    const mapStartTime = Date.now();
    const mapPromises = imagesToProcess.map(async (base64Str, index) => {
      try {
        const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
        
        // 🔴 極簡化指令 (OCR Mode) - 只提取原始數據，不要句子
        const ocrPrompt = `FAST OCR: Return ONLY raw numbers (Price, Sales, CTR) and Product Name. No sentences.`;
        
        const text = await callGemini(MODEL_MAP, ocrPrompt, [cleanBase64]);
        console.log(`✅ 圖片 ${index + 1}/${imagesToProcess.length} OCR完成`);
        return `[Image ${index + 1}]: ${text}`;
      } catch (e) {
        console.error(`❌ 圖片 ${index + 1}:`, e.message);
        return `[Image ${index + 1}]: Read Error`;
      }
    });

    const mapResults = await Promise.all(mapPromises);
    const mapTime = Date.now() - mapStartTime;
    console.log(`⚡ Map Phase完成: ${mapTime}ms`);
    
    const visualContext = mapResults.join("\n\n");

    // Step 2: Reduce - 三軌選品矩陣分析
    console.log(`🎯 Reduce Phase: 三軌選品矩陣分析`);

    const reduceStartTime = Date.now();
    
    // 🔴 關鍵修改：直接使用戰術邏輯，不需要複雜的 System Prompt
    const finalPrompt = `
      You are the "Shopee Live Tactical Analyst" (蝦皮直播即時戰術分析師).
      Your goal is NOT just to answer, but to create "Bundling Opportunities" (C-A-B Strategy).
      
      === YOUR STRATEGY MATRIX ===
      1. C-Track (Hook/Bait): The product the user asked about (Traffic driver).
      2. A-Track (Meat/Profit): The High-Margin product related to C (The real profit maker).
      3. B-Track (Soup/Filler): Low-cost add-ons to hit free shipping or coupon thresholds.

      === INPUT DATA ===
      [VISUAL DATA FROM IMAGES]:
      ${visualContext}
      
      [USER QUERY / AUDIENCE QUESTION]:
      "${textPrompt || '請分析這些商品'}"
      
      === TASK ===
      Based ONLY on the Visual Data and User Query, generate a tactical response.
      Do NOT hallucinate products not in the data.

      === OUTPUT FORMAT (Valid JSON Only) ===
      The output must be a valid JSON object with this exact structure:
      {
        "summary": "Start with '📊 觀眾畫像分析：' followed by a 1-sentence profiling of the user.",
        "recommendations": [
          "🪝 C軌(誘餌): [Product Name] - Why?",
          "💰 A軌(肉/高利潤): [Product Name] - Why?",
          "📦 B軌(湯/湊單): [Product Name] - Why?"
        ],
        "plan": "Start with '🗣 主播即時話術：' followed by a script that naturally connects C -> A -> B, mentioning any discounts found in the data."
      }
      
      ⚠️ Keep it concise:
      - summary: max 100 words
      - plan: max 150 words
    `;

    const finalResult = await callGemini(MODEL_REDUCE, finalPrompt);
    const reduceTime = Date.now() - reduceStartTime;
    console.log(`⚡ Reduce Phase完成: ${reduceTime}ms`);
    
    const cleanFinalJson = finalResult.replace(/```json|```/g, "").trim();

    const totalTime = Date.now() - startTime;
    console.log(`✅ 總共完成: ${totalTime}ms (Map: ${mapTime}ms, Reduce: ${reduceTime}ms)`);

    return {
      statusCode: 200,
      headers,
      body: cleanFinalJson
    };

  } catch (error) {
    console.error("🔥 錯誤:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        summary: "系統錯誤",
        recommendations: ["請檢查輸入資料", error.message],
        plan: "Error: " + error.message
      })
    };
  }
};
