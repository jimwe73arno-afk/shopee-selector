/**
 * BrotherG AI - Shopee Analyst
 * v3.0-Stable-MapReduce Architecture
 * 
 * Map Phase: gemini-3.0-flash (OCR-only, 512 tokens)
 * Reduce Phase: gemini-3.0-pro (Deep reasoning, 1024 tokens)
 * 
 * Stable multi-image processing without MAX_TOKENS issues
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

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
 * Build system prompt for Shopee Analyst
 */
function buildSystemPrompt(tier = 'free') {
  return `你是 BrotherG.AI 的 Shopee 選品分析師。
請閱讀 OCR 後的資料，輸出一份「選品決策卡」，使用繁體中文。

輸出格式必須是有效的 JSON（不要 markdown 代碼塊）：

{
  "summary": "基於你上傳的數據，以下是我的建議：（2-3段繁體中文分析，語氣像 Shopee 高階運營顧問）",
  "recommendations": [
    "🔥 建議主攻品類 (Top 1)",
    "🔥 建議主攻品類 (Top 2)",
    "🔥 建議主攻品類 (Top 3)"
  ],
  "plan": "💰 七日行動計畫\\nDay 1：調整商品主圖與標題（說明具體優化方向）\\nDay 2：分析高轉化詞與關鍵字（舉例三個）\\nDay 3：依照GMV分布重新配置廣告預算（具體比例）\\nDay 4：整合商品組合包或贈品策略\\nDay 5～7：試跑＋檢驗ROI／CTR／轉單率"
}

### Guidelines
- 語氣要像 Shopee 高階運營顧問。
- 所有分析要以數據洞察為主，不講品牌策略或廣告學。
- 不要提「Pivot / Magnet / Teaser / Day-by-Day Marketing」這種字。
- 所有金額單位使用 TWD。
- "summary" 應該包含：數據分析摘要 + ⚠️ 應下架或避開品類的建議
- "recommendations" 必須是 3 個主攻品類建議（格式：品類名稱 + 價格區間 + 原因）
- "plan" 必須是完整的七日行動計畫（Day 1-7，每項都要具體）

${tier === 'free' ? '注意：Free tier 用戶，請在 summary 末尾添加「提示：升級 PRO 版可查看完整的七日行動計畫」。' : ''}`;
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

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

    let processedImages = images;
    if (images && images.length > maxImages) {
      console.warn(`⚠️ Image count (${images.length}) exceeds limit (${maxImages}), truncating...`);
      processedImages = images.slice(0, maxImages);
    }

    // If text-only request
    if (!processedImages || processedImages.length === 0) {
      console.log(`⚡ Text-only request with ${MODEL_FLASH}`);
      
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-3.0-flash'
      });

      const systemPrompt = buildSystemPrompt(tier);
      const prompt = `${systemPrompt}\n\n用戶問題: ${textPrompt}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7
        }
      });

      const textResponse = result.response.text();

      // Try to parse as JSON
      let finalResult;
      try {
        const cleanedJSON = textResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = cleanedJSON.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          finalResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found');
        }
      } catch (e) {
        console.warn('⚠️ JSON parse failed, using fallback format');
        finalResult = {
          summary: textResponse,
          recommendations: ["分析完成，請查看上方摘要", "根據分析結果調整策略", "持續監控市場動態"],
          plan: "根據分析結果制定執行計劃。建議先從核心建議開始實施。"
        };
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Text-only result: ${finalResult.summary?.length || 0} chars`);
      console.log(`⏱️ Total time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          summary: finalResult.summary || textResponse,
          recommendations: Array.isArray(finalResult.recommendations) ? finalResult.recommendations : ['分析完成，請查看上方摘要'],
          plan: finalResult.plan || textResponse
        })
      };
    }

    // Image analysis: Map-Reduce pipeline
    console.log(`⚡ Processing ${processedImages.length} images with Map-Reduce architecture`);

    // ========== Map Phase: OCR-only extraction (Gemini 3.0 Flash) ==========
    const mapStartTime = Date.now();
    console.log(`📊 Map Phase: OCR extraction with gemini-3.0-flash...`);
    
    const mapModel = genAI.getGenerativeModel({ 
      model: 'gemini-3.0-flash'
    });

    const ocrPrompt = `你是一位資料助理。請僅從圖片中擷取文字資料，
例如商品名稱、價格、分類、銷量、退貨率、評分等。
不要分析、不要建議，只輸出純文字摘要。
使用繁體中文，格式如下：

商品名稱: ...
價格: ...
銷量: ...
轉換率: ...
（其他數據）

只提取數據，不要分析。`;

    const ocrResults = [];
    for (let i = 0; i < processedImages.length; i++) {
      try {
        const imageStartTime = Date.now();
        
        // Clean base64 string
        const cleanBase64 = processedImages[i].replace(/^data:image\/\w+;base64,/, '');
        
        // Detect mime type
        let mimeType = 'image/jpeg';
        if (processedImages[i].includes('data:image/png')) mimeType = 'image/png';
        else if (processedImages[i].includes('data:image/webp')) mimeType = 'image/webp';

        const result = await mapModel.generateContent({
          contents: [{
            role: 'user',
            parts: [
              { text: ocrPrompt },
              { 
                inlineData: { 
                  mimeType: mimeType,
                  data: cleanBase64
                } 
              }
            ]
          }],
          generationConfig: {
            maxOutputTokens: 512,  // OCR 只需要少量輸出
            temperature: 0.2  // 降低溫度確保 OCR 準確性
          }
        });

        const text = result.response.text();
        const imageDuration = Date.now() - imageStartTime;
        console.log(`✅ Image ${i + 1}/${processedImages.length} OCR completed in ${imageDuration}ms (${text.length} chars)`);
        ocrResults.push(text);
      } catch (err) {
        console.error(`❌ Image ${i + 1} OCR failed:`, err.message);
        ocrResults.push(`[Image ${i + 1} OCR Data]: 提取失敗 - ${err.message}`);
      }
    }

    const mergedText = ocrResults.join('\n---\n');
    const mapDuration = Date.now() - mapStartTime;
    console.log(`✅ Map Phase complete in ${mapDuration}ms (${(mapDuration / 1000).toFixed(2)}s)`);
    console.log(`📊 Total OCR context: ${mergedText.length} chars`);

    // ========== Reduce Phase: Deep reasoning (Gemini 3.0 Pro) ==========
    const reduceStartTime = Date.now();
    console.log(`🧠 Reduce Phase: Deep reasoning with gemini-3.0-pro...`);

    const reduceModel = genAI.getGenerativeModel({
      model: 'gemini-3.0-pro',
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(tier) }]
      }
    });

    const userPrompt = mergedText 
      ? `OCR 提取的數據（從圖片中提取的所有文字、數字、表格）:\n${mergedText}\n\n用戶問題: ${textPrompt || '基於這些數據，給出選品建議'}\n\n請基於以上 OCR 數據進行深度分析和決策。`
      : textPrompt;

    const reduceResult = await reduceModel.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: userPrompt }] 
      }],
      generationConfig: {
        maxOutputTokens: 2048,  // 生成完整的選品決策卡
        temperature: 0.7
      }
    });

    const output = reduceResult.response.text();
    const reduceDuration = Date.now() - reduceStartTime;
    console.log(`✅ Reduce Phase complete in ${reduceDuration}ms (${(reduceDuration / 1000).toFixed(2)}s)`);
    console.log(`📊 Response length: ${output.length} chars`);

    // Parse JSON response
    let finalResult;
    try {
      // Clean JSON response
      let cleanedJSON = output.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      
      // Try to find JSON object
      const jsonMatch = cleanedJSON.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedJSON = jsonMatch[0];
      }

      // Attempt to fix incomplete JSON
      if (cleanedJSON.startsWith('{') && !cleanedJSON.endsWith('}')) {
        cleanedJSON = cleanedJSON.replace(/,\s*$/, '') + '}';
      }

      finalResult = JSON.parse(cleanedJSON);
    } catch (e) {
      console.error('❌ JSON parsing failed:', e.message);
      console.error('Raw response (first 500 chars):', output.substring(0, 500));
      
      // Fallback: extract fields using regex
      const summaryMatch = output.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      const recommendationsMatch = output.match(/"recommendations"\s*:\s*\[(.*?)\]/s);
      const planMatch = output.match(/"plan"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      
      finalResult = {
        summary: summaryMatch ? summaryMatch[1].replace(/\\"/g, '"') : output.substring(0, 500) + '...',
        recommendations: recommendationsMatch ? 
          recommendationsMatch[1].split(',').map(r => r.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')).filter(r => r) :
          ["請查看上方摘要了解詳細分析", "根據分析結果調整策略", "持續監控市場動態"],
        plan: planMatch ? planMatch[1].replace(/\\"/g, '"') : "請根據上方摘要制定執行計劃。"
      };
    }

    // Ensure result structure
    const responseResult = {
      summary: finalResult.summary || output.substring(0, 500) || '分析完成，請查看建議。',
      recommendations: Array.isArray(finalResult.recommendations) ? finalResult.recommendations : 
        (finalResult.recommendations ? [finalResult.recommendations] : ['請查看上方分析結果']),
      plan: finalResult.plan || output || '根據分析結果制定執行計劃。'
    };

    const duration = Date.now() - startTime;
    console.log(`✅ Success: ${tier} tier, ${processedImages.length} images, ${responseResult.summary.length} chars summary`);
    console.log(`⏱️ Total processing time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`📊 Result structure:`, {
      summary: responseResult.summary.substring(0, 100) + '...',
      recommendationsCount: responseResult.recommendations.length,
      planLength: responseResult.plan.length
    });

    if (duration > 100000) {
      console.warn(`⚠️ Processing time exceeded 100s: ${(duration / 1000).toFixed(2)}s`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseResult)
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
