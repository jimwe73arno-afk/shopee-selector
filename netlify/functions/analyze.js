/**
 * BrotherG AI - Shopee Analyst
 * v3.0-SafeMap Architecture: OCR-First Map-Reduce
 * 
 * Map Phase: gemini-1.5-flash-latest (OCR-only, 512 tokens)
 * Reduce Phase: gemini-3.0-pro-preview (Deep reasoning, 1024 tokens)
 */

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Model endpoints
const MODEL_FLASH_OCR = 'gemini-1.5-flash-latest';  // OCR-only (Map phase) - 更穩定的視覺處理
const MODEL_PRO = 'gemini-3.0-pro-preview';         // Deep reasoning (Reduce phase)

// Safety limits
const MAX_IMAGES_FREE = 2;
const MAX_IMAGES_PRO = 2;
const MAX_IMAGES_MASTER = 5;

/**
 * Check user tier from headers
 */
function checkUserTier(event) {
  const authHeader = event.headers.authorization || event.headers['x-user-tier'] || '';
  if (authHeader.includes('master') || authHeader === 'master') {
    return 'master';
  }
  if (authHeader.includes('pro') || authHeader === 'pro') {
    return 'pro';
  }
  return 'free';
}

/**
 * Call Gemini API using native fetch
 */
async function callGeminiAPI(model, contents, config = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');
  }

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: contents,
    generationConfig: {
      maxOutputTokens: config.maxOutputTokens || 1024,
      temperature: config.temperature !== undefined ? config.temperature : 0.7,
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error(`❌ Gemini API error (${response.status}):`, errorData);
    throw new Error(`Gemini API error (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  const finishReason = candidate?.finishReason;

  if (!text) {
    console.error('❌ Empty response from Gemini API. Full response:', JSON.stringify(data, null, 2));
    throw new Error(`Empty response from Gemini API. Finish reason: ${finishReason || 'unknown'}`);
  }

  if (finishReason === 'MAX_TOKENS') {
    console.warn(`⚠️ Response truncated at MAX_TOKENS, but got ${text.length} chars.`);
  }

  console.log(`✅ Gemini response: ${text.length} chars, finishReason: ${finishReason || 'normal'}`);
  return text;
}

/**
 * MAP PHASE: OCR-only extraction using gemini-1.5-flash-latest
 */
async function mapPhaseOCR(images) {
  const mapStartTime = Date.now();
  console.log(`📊 Map Phase (OCR): Processing ${images.length} images in parallel...`);
  console.log(`⏱️ Map Phase started at: ${new Date().toISOString()}`);

  const ocrPrompt = `你是一位資料助理。
請只從圖片中「提取可讀文字」：商品名稱、價格、分類、銷量、退貨率、評分等。
不要做策略，不要總結，直接輸出純文字表格摘要。
使用繁體中文，格式如下：

商品名稱: ...
價格: ...
銷量: ...
轉換率: ...
（其他數據）

只提取數據，不要分析。`;

  const ocrTasks = images.map((imgBase64, index) => {
    const imageStartTime = Date.now();
    
    // Clean base64 string
    const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // Detect mime type
    let mimeType = 'image/jpeg';
    if (imgBase64.includes('data:image/png')) mimeType = 'image/png';
    else if (imgBase64.includes('data:image/webp')) mimeType = 'image/webp';

    const parts = [
      { text: ocrPrompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64
        }
      }
    ];

    console.log(`🔄 OCR processing image ${index + 1}/${images.length}...`);

    return callGeminiAPI(MODEL_FLASH_OCR, [{
      role: "user",
      parts: parts
    }], {
      maxOutputTokens: 512,  // OCR 模式只需要少量 token 輸出結構化數據
      temperature: 0.1  // 降低溫度確保 OCR 準確性
    }).then(result => {
      const imageDuration = Date.now() - imageStartTime;
      console.log(`✅ Image ${index + 1} OCR completed in ${imageDuration}ms (${result.length} chars)`);
      return `[Image ${index + 1} OCR Data]:\n${result}\n\n`;
    }).catch(error => {
      console.error(`❌ Image ${index + 1} OCR failed:`, error.message);
      return `[Image ${index + 1} OCR Data]: 提取失敗 - ${error.message}\n\n`;
    });
  });

  // Execute all OCR tasks in parallel
  const results = await Promise.all(ocrTasks);
  const ocrContext = results.join('\n');
  const mapDuration = Date.now() - mapStartTime;

  console.log(`✅ Map Phase (OCR) complete in ${mapDuration}ms (${(mapDuration / 1000).toFixed(2)}s)`);
  console.log(`📊 Total OCR context: ${ocrContext.length} chars`);
  return ocrContext;
}

/**
 * Build system prompt for Shopee Analyst
 */
function buildShopeeSystemPrompt(userTier = 'free') {
  return `You are "Shopee Analyst", an AI specialized in product selection and profitability optimization for Shopee Taiwan sellers.

Your job is **NOT marketing**, but **product intelligence**.

---

### Core Mission
Based on the **OCR-extracted data** from Shopee screenshots (sales dashboard, product tables, conversion charts, etc.),
you must analyze the numerical data and summarize **which products to keep, cut, or double down** within 7 days.

The OCR data has already extracted all text, numbers, and tables from the images.
Your job is to analyze these **structured data points** and provide actionable recommendations.

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
- 所有金額單位使用 TWD。
- "summary" 應該包含：數據分析摘要 + ⚠️ 應下架或避開品類的建議
- "recommendations" 必須是 3 個主攻品類建議（格式：品類名稱 + 價格區間 + 原因）
- "plan" 必須是完整的七日行動計畫（Day 1-7，每項都要具體）

${userTier === 'free' ? `
注意：Free tier 用戶，請在 summary 末尾添加「提示：升級 PRO 版可查看完整的七日行動計畫」。
` : ''}
`;
}

/**
 * REDUCE PHASE: Deep reasoning using gemini-3.0-pro-preview
 */
async function reducePhaseReasoning(textPrompt, ocrContext, userTier) {
  const reduceStartTime = Date.now();
  console.log(`🧠 Reduce Phase: Deep reasoning with ${MODEL_PRO}...`);
  console.log(`⏱️ Reduce Phase started at: ${new Date().toISOString()}`);

  const systemPrompt = buildShopeeSystemPrompt(userTier);
  
  const userPrompt = ocrContext 
    ? `OCR 提取的數據（從圖片中提取的所有文字、數字、表格）:\n${ocrContext}\n\n用戶問題: ${textPrompt || '基於這些數據，給出選品建議'}\n\n請基於以上 OCR 數據進行深度分析和決策。`
    : textPrompt;

  const parts = [
    { text: systemPrompt },
    { text: userPrompt }
  ];

  const reasoningText = await callGeminiAPI(MODEL_PRO, [{
    role: "user",
    parts: parts
  }], {
    maxOutputTokens: 2048,  // 增加輸出長度以生成完整的選品決策卡
    temperature: 0.7
  });

  const reduceDuration = Date.now() - reduceStartTime;
  console.log(`✅ Reduce Phase complete in ${reduceDuration}ms (${(reduceDuration / 1000).toFixed(2)}s)`);
  console.log(`📊 Response length: ${reasoningText.length} chars`);
  return reasoningText;
}

/**
 * Clean JSON response
 */
function cleanJSONResponse(text) {
  if (!text) return '';
  
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Try to find the outermost JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  // Attempt to fix common truncation issues
  if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
    // Try to close incomplete JSON
    if (cleaned.match(/,\s*$/)) {
      cleaned = cleaned.replace(/,\s*$/, '');
    }
    cleaned += '}';
  }

  return cleaned;
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  const startTime = Date.now();
  console.log(`⏱️ Request started at: ${new Date().toISOString()}`);

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
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

    // Safety limits based on tier
    let maxImages;
    switch (tier) {
      case 'master':
        maxImages = MAX_IMAGES_MASTER;
        break;
      case 'pro':
        maxImages = MAX_IMAGES_PRO;
        break;
      default:
        maxImages = MAX_IMAGES_FREE;
    }

    if (images && images.length > maxImages) {
      console.warn(`⚠️ Image count (${images.length}) exceeds limit (${maxImages}), truncating...`);
      images.splice(maxImages);
    }

    // All tiers: text-only or image analysis (temporarily open)
    console.log(`⚡ Processing request: ${images.length} images with ${MODEL_FLASH_OCR}`);
    
    // If text-only request
    if (!images || images.length === 0) {
      const systemPrompt = buildShopeeSystemPrompt(tier);

      const textResponse = await callGeminiAPI(MODEL_FLASH_OCR, [{
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
        result = {
          summary: textResponse,
          recommendations: ["分析完成，請查看上方摘要", "根據分析結果調整策略", "持續監控市場動態"],
          plan: "根據分析結果制定執行計劃。建議先從核心建議開始實施。"
        };
      }

      const finalResult = {
        summary: result.summary || textResponse.substring(0, 500),
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : 
          (result.recommendations ? [result.recommendations] : ['分析完成，請查看上方摘要', '根據分析結果調整策略', '持續監控市場動態']),
        plan: result.plan || result.summary || '根據分析結果制定執行計劃。'
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Text-only result: ${finalResult.summary.length} chars summary`);
      console.log(`⏱️ Total processing time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(finalResult)
      };
    }

    // Image analysis: Map-Reduce pipeline
    let ocrContext = '';
    
    if (images && images.length > 0) {
      // MAP PHASE: OCR-only extraction
      ocrContext = await mapPhaseOCR(images);
    }

    // REDUCE PHASE: Deep reasoning
    const reasoningText = await reducePhaseReasoning(textPrompt, ocrContext, tier);

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

    const duration = Date.now() - startTime;
    console.log(`✅ Success: ${tier} tier, ${images.length} images, ${finalResult.summary.length} chars summary`);
    console.log(`⏱️ Total processing time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`📊 Result structure:`, {
      summary: finalResult.summary.substring(0, 100) + '...',
      recommendationsCount: finalResult.recommendations.length,
      planLength: finalResult.plan.length
    });

    // 如果處理時間超過 100 秒，記錄警告
    if (duration > 100000) {
      console.warn(`⚠️ Processing time exceeded 100s: ${(duration / 1000).toFixed(2)}s. Consider optimizing or reducing image count.`);
    }

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
