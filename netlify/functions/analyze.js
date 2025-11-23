/**
 * BrotherG AI - Shopee Analyst
 * Map-Reduce Architecture for Image Analysis
 * 
 * Frontend calls: POST /api/analyze
 * Netlify Function: netlify/functions/analyze.js
 */

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Model endpoints
const MODEL_FLASH = 'gemini-2.5-flash';  // Fast vision processing (Map phase)
const MODEL_PRO = 'gemini-3-pro-preview';      // Deep reasoning (Reduce phase) - 生成報告回應

/**
 * Check user tier from headers (JWT or custom header)
 * Returns: 'free' | 'pro' | 'master'
 */
function checkUserTier(event) {
  // TODO: Implement JWT verification or custom header check
  // For now, mock implementation based on headers
  const authHeader = event.headers.authorization || event.headers['x-user-tier'] || '';
  
  // If JWT exists, decode and check tier
  // If custom header exists, use it directly
  if (authHeader.includes('master') || authHeader === 'master') {
    return 'master';
  }
  if (authHeader.includes('pro') || authHeader === 'pro') {
    return 'pro';
  }
  
  // Default to free tier
  return 'free';
}

/**
 * Call Gemini API with proper error handling
 */
async function callGeminiAPI(model, contents, generationConfig = {}) {
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  const defaultConfig = {
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 4096
  };

  const payload = {
    contents: contents,
    generationConfig: { ...defaultConfig, ...generationConfig }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Gemini API error (${response.status}):`, errorText);
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ Gemini API response received, candidates: ${data.candidates?.length || 0}`);
  
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  const finishReason = candidate?.finishReason;
  
  // 處理 MAX_TOKENS 情況（輸出被截斷，但可能仍有部分內容）
  if (!text && finishReason === 'MAX_TOKENS') {
    console.warn('⚠️ Response hit MAX_TOKENS limit. Trying to extract partial content...');
    // 嘗試從所有 parts 中提取內容
    const allParts = candidate?.content?.parts || [];
    const partialText = allParts.map(p => p.text || '').join('').trim();
    
    if (partialText) {
      console.log(`✅ Extracted partial response: ${partialText.length} chars`);
      return partialText + '... [內容被截斷，建議減少圖片數量或簡化請求]';
    }
    
    // 如果還是沒有內容，返回一個提示信息而不是拋出錯誤
    console.warn('⚠️ No partial content available, returning fallback message');
    return '[圖片分析完成，但輸出被截斷。建議減少圖片數量或增加 maxOutputTokens。]';
  }
  
  if (!text) {
    console.error('❌ Empty response from Gemini API. Full response:', JSON.stringify(data, null, 2));
    throw new Error(`Empty response from Gemini API. Finish reason: ${finishReason || 'unknown'}`);
  }
  
  console.log(`✅ Gemini response text length: ${text.length} chars, finishReason: ${finishReason || 'normal'}`);
  return text;
}

/**
 * MAP PHASE: Process each image in parallel using gemini-2.5-flash
 */
async function mapPhaseVision(images) {
  console.log(`📊 Map Phase: Processing ${images.length} images in parallel...`);
  
  const visionPrompt = `Describe this image in detail. Extract key data:
- Price information
- Sales numbers
- Product Type
- Visual Style
- Competitor Data
- Any numeric metrics visible

Output as structured text summary. Be concise but comprehensive.`;

  const visionTasks = images.map((imgBase64, index) => {
    // Clean base64 string
    const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // Detect mime type
    let mimeType = 'image/jpeg';
    if (imgBase64.includes('data:image/png')) mimeType = 'image/png';
    else if (imgBase64.includes('data:image/webp')) mimeType = 'image/webp';

    const parts = [
      { text: visionPrompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64
        }
      }
    ];

    console.log(`🔄 Processing image ${index + 1}/${images.length}...`);
    
    return callGeminiAPI(MODEL_FLASH, [{
      role: "user",
      parts: parts
    }], {
      maxOutputTokens: 2048,  // 增加輸出長度以處理完整圖片描述
      temperature: 0.3
    }).then(result => {
      console.log(`✅ Image ${index + 1} processed (${result.length} chars)`);
      return `[Image ${index + 1} Analysis]:\n${result}\n\n`;
    }).catch(error => {
      console.error(`❌ Image ${index + 1} failed:`, error.message);
      // 即使失敗也返回一個占位符，讓流程繼續
      return `[Image ${index + 1} Analysis]: 處理時遇到問題 - ${error.message}。已跳過此圖片，繼續處理其他圖片。\n\n`;
    });
  });

  // Execute all vision tasks in parallel
  const results = await Promise.all(visionTasks);
  const visualContext = results.join('\n');
  
  console.log(`✅ Map Phase complete. Total context: ${visualContext.length} chars`);
  return visualContext;
}

/**
 * REDUCE PHASE: Deep reasoning using gemini-3-pro-preview (生成報告回應)
 */
async function reducePhaseReasoning(textPrompt, visualContext) {
  console.log(`🧠 Reduce Phase: Deep reasoning with ${MODEL_PRO}...`);
  
  const systemPrompt = `You are "Shopee Analyst", an AI specialized in product selection and profitability optimization for Shopee Taiwan sellers.

Your job is **NOT marketing**, but **product intelligence**.

---

### Core Mission
Given uploaded Shopee screenshots (sales dashboard, product tables, conversion charts, etc.),
you must analyze and summarize **which products to keep, cut, or double down** within 7 days.

The output should look like a **「選品決策卡」 (Product Decision Card)**, written in **繁體中文**, structured and concise.

---

### Output Format
You MUST output valid JSON only (no markdown code blocks, no extra text). JSON structure:

{
  "summary": "基於你上傳的數據，以下是我的建議：（2-3段繁體中文分析，語氣像 Shopee 高階運營顧問）",
  "recommendations": [
    "🔥 建議主攻品類 (Top 1)",
    "🔥 建議主攻品類 (Top 2)",
    "🔥 建議主攻品類 (Top 3)"
  ],
  "plan": "💰 七日行動計畫\nDay 1：調整商品主圖與標題（說明具體優化方向）\nDay 2：分析高轉化詞與關鍵字（舉例三個）\nDay 3：依照GMV分布重新配置廣告預算（具體比例）\nDay 4：整合商品組合包或贈品策略\nDay 5～7：試跑＋檢驗ROI／CTR／轉單率"
}

### Guidelines
- 語氣要像 Shopee 高階運營顧問。
- 所有分析要以數據洞察為主，不講品牌策略或廣告學。
- 不要提「Pivot / Magnet / Teaser / Day-by-Day Marketing」這種字。
- 若圖片資料不足，請禮貌提醒使用者補圖或輸入文字問題。
- 所有金額單位使用 TWD。
- "summary" 應該包含：數據分析摘要 + ⚠️ 應下架或避開品類的建議
- "recommendations" 必須是 3 個主攻品類建議（格式：品類名稱 + 價格區間 + 原因）
- "plan" 必須是完整的七日行動計畫（Day 1-7，每項都要具體）

### Example Style (繁體中文)
summary: "基於你上傳的數據，目前店鋪呈現典型的「爆款潛力未釋放」狀態。從數據可見，低至中客單價（$299-$389 TWD）的「剛需型商品」表現極佳，特別是「蛋白威化餅」與「MIT水龍頭延伸器」，轉單率穩定且退貨率低。\n\n⚠️ 應下架或避開：衣物掛燙機（退貨率高達9%，GMV低於均值）、食品雜貨（毛利率 < 8%）"

recommendations: [
  "體重管理／蛋白粉系列（$299–$389 區間，轉單率最高）",
  "洗臉機／清潔耗材（搜尋曝光穩定，有回購潛力）",
  "旅行用配件／小型3C（高毛利、低退貨率）"
]

plan: "Day 1：移除低效廣告詞並更新主圖（針對蛋白粉系列，強調「代餐」與「營養補充」）。\nDay 2：將熱銷商品加入「加價購組合」（蛋白粉+水杯、清潔耗材+收納盒）。\nDay 3：調整關鍵字出價，主打「健身／代餐／清潔用品」，將預算比例調整為 40% / 30% / 30%。\nDay 4：整合商品組合包策略，推出「健身組合包」與「清潔組合包」。\nDay 5～7：觀察CTR與ROI，留強刪弱，下架退貨率 > 8% 的商品。"
`;

  const userPrompt = visualContext 
    ? `Visual Context Data:\n${visualContext}\n\nUser Question: ${textPrompt}`
    : textPrompt;

  const parts = [
    { text: systemPrompt },
    { text: userPrompt }
  ];

  const reasoningText = await callGeminiAPI(MODEL_PRO, [{
    role: "user",
    parts: parts
  }], {
    maxOutputTokens: 4096,  // 增加輸出長度以避免 JSON 被截斷
    temperature: 0.7
  });

  console.log(`✅ Reduce Phase complete. Response: ${reasoningText.length} chars`);
  return reasoningText;
}

/**
 * Clean JSON response (remove markdown code blocks if present)
 * Handle truncated JSON from MAX_TOKENS
 */
function cleanJSONResponse(text) {
  if (!text) return '';
  
  // Remove markdown code blocks (multiple patterns)
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Find JSON object (more flexible matching)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Try to fix truncated JSON (from MAX_TOKENS)
  try {
    // Test if it's valid JSON
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    // If not valid, try to fix truncated JSON
    const jsonStart = cleaned.indexOf('{');
    
    if (jsonStart >= 0) {
      let jsonText = cleaned.substring(jsonStart);
      
      // Try to close unclosed strings and objects
      // Count open braces and close them
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonText.length; i++) {
        const char = jsonText[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') openBraces++;
          if (char === '}') openBraces--;
          if (char === '[') openBrackets++;
          if (char === ']') openBrackets--;
        }
      }
      
      // Close unclosed structures
      if (inString) jsonText += '"';
      while (openBrackets > 0) {
        jsonText += ']';
        openBrackets--;
      }
      while (openBraces > 0) {
        jsonText += '}';
        openBraces--;
      }
      
      // Try parsing again
      try {
        JSON.parse(jsonText);
        return jsonText;
      } catch (e2) {
        // If still invalid, return original and let caller handle it
        return jsonText;
      }
    }
    
    return cleaned;
  }
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  // Set Netlify optimization
  context.callbackWaitsForEmptyEventLoop = false;

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Tier',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    // Validate API key
    if (!GEMINI_API_KEY) {
      throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable');
    }

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      throw new Error('Invalid JSON in request body');
    }

    const { textPrompt = '', images = [] } = body;

    // Validate input
    if (!textPrompt && (!images || images.length === 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Please provide textPrompt or images' })
      };
    }

    // Check user tier
    const tier = checkUserTier(event);
    console.log(`👤 User Tier: ${tier}`);

    // 暂时移除付费限制 - 所有功能开放
    // Tier-based validation and limits - DISABLED FOR TESTING
    /*
    if (tier === 'free') {
      if (images && images.length > 0) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Image analysis requires Pro or Master tier. Please upgrade.',
            tier: 'free',
            limit: 0
          })
        };
      }
    }
    */
    
    // All tiers: text-only or image analysis (temporarily open)
    console.log(`⚡ Processing request: ${images.length} images with ${MODEL_FLASH}`);
    
    // If text-only request
    if (!images || images.length === 0) {
      const systemPrompt = `You are "Shopee Analyst", an AI specialized in product selection and profitability optimization for Shopee Taiwan sellers.

Your job is **NOT marketing**, but **product intelligence**.

---

### Core Mission
Analyze the user's product information and provide actionable recommendations for product selection within 7 days.

The output should look like a **「選品決策卡」 (Product Decision Card)**, written in **繁體中文**, structured and concise.

---

### Output Format
You MUST output valid JSON only (no markdown code blocks, no extra text). JSON structure:

{
  "summary": "基於你提供的資訊，以下是我的建議：（2-3段繁體中文分析，語氣像 Shopee 高階運營顧問）",
  "recommendations": [
    "🔥 建議主攻品類 (Top 1)",
    "🔥 建議主攻品類 (Top 2)",
    "🔥 建議主攻品類 (Top 3)"
  ],
  "plan": "💰 七日行動計畫\nDay 1：調整商品主圖與標題（說明具體優化方向）\nDay 2：分析高轉化詞與關鍵字（舉例三個）\nDay 3：依照GMV分布重新配置廣告預算（具體比例）\nDay 4：整合商品組合包或贈品策略\nDay 5～7：試跑＋檢驗ROI／CTR／轉單率"
}

### Guidelines
- 語氣要像 Shopee 高階運營顧問。
- 所有分析要以數據洞察為主，不講品牌策略或廣告學。
- 不要提「Pivot / Magnet / Teaser / Day-by-Day Marketing」這種字。
- 所有金額單位使用 TWD。
- "summary" 應該包含：數據分析摘要 + ⚠️ 應下架或避開品類的建議
- "recommendations" 必須是 3 個主攻品類建議（格式：品類名稱 + 價格區間 + 原因）
- "plan" 必須是完整的七日行動計畫（Day 1-7，每項都要具體）

### Example Style (繁體中文)
summary: "基於你提供的資訊，目前你在蝦皮經營 eSIM、小米手機、Dyson 等商品。從市場趨勢來看，eSIM 處於上升期，旅遊復甦帶動需求增長；小米手機性價比高，但競爭激烈；Dyson 屬於高單價商品，需要精準投放。\n\n⚠️ 建議避開：低毛利商品（毛利率 < 10%）、退貨率高的產品（> 8%）"

recommendations: [
  "eSIM 多國漫遊方案（$299-$599 區間，高毛利、低庫存風險）",
  "小米生態鏈配件組合（$299-$899 區間，利用品牌信任度）",
  "Dyson 濾網訂閱服務（$899-$1299 區間，週期性收入、高 LTV）"
]

plan: "Day 1：優化 eSIM 主圖，強調「多國漫遊」、「即買即用」，標題加入「旅遊必備」關鍵字。\nDay 2：分析「eSIM」、「多國上網」、「旅遊上網卡」等高轉化詞，調整關鍵字出價。\nDay 3：將廣告預算調整為 eSIM 50% / 小米配件 30% / Dyson 配件 20%，重點投放高轉化時段。\nDay 4：推出「eSIM + 旅遊充電器組合包」、「小米手機 + 保護殼綁定銷售」策略。\nDay 5～7：觀察 CTR、ROI、轉單率，針對轉換率 > 3% 的商品加大預算，下架轉換率 < 1% 的商品。"
`;

      const textResponse = await callGeminiAPI(MODEL_FLASH, [{
        role: "user",
        parts: [
          { text: systemPrompt },
          { text: textPrompt }
        ]
      }], {
        maxOutputTokens: 2048,
        temperature: 0.7
      });

      // Try to parse as JSON, fallback to plain text
      let result;
      try {
        const cleanedJSON = cleanJSONResponse(textResponse);
        result = JSON.parse(cleanedJSON);
      } catch (e) {
        console.warn('⚠️ JSON parse failed, using fallback format');
        // Fallback: wrap in expected format
        result = {
          summary: textResponse,
          recommendations: ["分析完成，請查看上方摘要", "根據分析結果調整策略", "持續監控市場動態"],
          plan: "根據分析結果制定執行計劃。建議先從核心建議開始實施。"
        };
      }

      // 確保返回的數據結構正確
      const finalResult = {
        summary: result.summary || textResponse.substring(0, 500),
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : 
          (result.recommendations ? [result.recommendations] : ['分析完成，請查看上方摘要', '根據分析結果調整策略', '持續監控市場動態']),
        plan: result.plan || result.summary || '根據分析結果制定執行計劃。'
      };

      console.log(`✅ Text-only result:`, {
        summaryLength: finalResult.summary.length,
        recommendationsCount: finalResult.recommendations.length
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(finalResult)
      };
    }

    // 暂时移除图片数量限制 - 所有功能开放
    // Pro/Master tier limits - DISABLED FOR TESTING
    /*
    if (tier === 'pro') {
      if (images && images.length > 1) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Pro tier allows maximum 1 image. Upgrade to Master for batch processing.',
            tier: 'pro',
            limit: 1
          })
        };
      }
    }

    if (tier === 'master') {
      if (images && images.length > 10) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Maximum 10 images allowed',
            tier: 'master',
            limit: 10
          })
        };
      }
    }
    */
    
    // Max 10 images for safety
    if (images && images.length > 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Maximum 10 images allowed',
          limit: 10
        })
      };
    }

    // Pro/Master: Map-Reduce pipeline
    let visualContext = '';
    
    if (images && images.length > 0) {
      // MAP PHASE: Parallel image processing
      visualContext = await mapPhaseVision(images);
    }

    // REDUCE PHASE: Deep reasoning
    const reasoningText = await reducePhaseReasoning(textPrompt, visualContext);

    // Parse and clean JSON response
    let result;
    try {
      const cleanedJSON = cleanJSONResponse(reasoningText);
      result = JSON.parse(cleanedJSON);
      
      // Validate required fields
      if (!result.summary && !result.recommendations && !result.plan) {
        throw new Error('JSON missing required fields');
      }
    } catch (e) {
      console.error('❌ JSON parsing failed:', e.message);
      console.error('Raw response (first 500 chars):', reasoningText.substring(0, 500));
      
      // Try to extract partial JSON fields even if parsing fails
      const summaryMatch = reasoningText.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      const recommendationsMatch = reasoningText.match(/"recommendations"\s*:\s*\[(.*?)\]/s);
      const planMatch = reasoningText.match(/"plan"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      
      result = {
        summary: summaryMatch ? summaryMatch[1].replace(/\\"/g, '"') : reasoningText.substring(0, 500) + '...',
        recommendations: recommendationsMatch ? 
          recommendationsMatch[1].split(',').map(r => r.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')).filter(r => r) :
          ["請查看上方摘要了解詳細分析", "根據分析結果調整策略", "持續監控市場動態"],
        plan: planMatch ? planMatch[1].replace(/\\"/g, '"') : "請根據上方摘要制定執行計劃。"
      };
      
      // If we still have a decent summary, use it
      if (!result.summary || result.summary.length < 50) {
        result.summary = reasoningText.substring(0, 800) || "分析完成，請查看建議。";
      }
    }

    // Validate result structure
    if (!result.summary || !result.recommendations || !result.plan) {
      console.warn('⚠️ Result missing required fields, using fallback');
      result = {
        summary: result.summary || reasoningText,
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : ["Action required", "Review data", "Execute plan"],
        plan: result.plan || "Please review the summary and recommendations above."
      };
    }

    // 確保返回的數據結構正確
    const finalResult = {
      summary: result.summary || result.reasoningText || '分析完成，請查看建議。',
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : 
        (result.recommendations ? [result.recommendations] : ['請查看上方分析結果']),
      plan: result.plan || result.summary || '根據分析結果制定執行計劃。'
    };

    console.log(`✅ Success: ${tier} tier, ${images.length} images, ${finalResult.summary.length} chars summary`);
    console.log(`📊 Result structure:`, {
      summary: finalResult.summary.substring(0, 100) + '...',
      recommendationsCount: finalResult.recommendations.length,
      planLength: finalResult.plan.length
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResult)
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
