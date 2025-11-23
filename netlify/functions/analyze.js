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
const MODEL_PRO = 'gemini-1.5-pro';      // Deep reasoning (Reduce phase)

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
  
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (!text) {
    console.error('❌ Empty response from Gemini API. Full response:', JSON.stringify(data, null, 2));
    throw new Error('Empty response from Gemini API. Please check the API key and model name.');
  }
  
  console.log(`✅ Gemini response text length: ${text.length} chars`);
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
      maxOutputTokens: 1024,  // Concise for speed
      temperature: 0.3
    }).then(result => {
      console.log(`✅ Image ${index + 1} processed (${result.length} chars)`);
      return `[Image ${index + 1} Analysis]:\n${result}\n\n`;
    }).catch(error => {
      console.error(`❌ Image ${index + 1} failed:`, error.message);
      return `[Image ${index + 1} Analysis]: Error - ${error.message}\n\n`;
    });
  });

  // Execute all vision tasks in parallel
  const results = await Promise.all(visionTasks);
  const visualContext = results.join('\n');
  
  console.log(`✅ Map Phase complete. Total context: ${visualContext.length} chars`);
  return visualContext;
}

/**
 * REDUCE PHASE: Deep reasoning using gemini-1.5-pro
 */
async function reducePhaseReasoning(textPrompt, visualContext) {
  console.log(`🧠 Reduce Phase: Deep reasoning with ${MODEL_PRO}...`);
  
  const systemPrompt = `You are BrotherG, an elite Shopee E-commerce Consultant. Your tone is professional, sharp, and profit-oriented.

Use the following visual context data to answer the user's question.

CRITICAL OUTPUT REQUIREMENTS:
- You MUST output valid JSON only (no markdown code blocks, no extra text)
- JSON structure must match exactly:
{
  "summary": "Detailed strategic analysis (2-3 paragraphs)",
  "recommendations": ["Actionable Step 1", "Actionable Step 2", "Actionable Step 3"],
  "plan": "7-Day Execution Plan with specific actions and timelines"
}

- "summary": Comprehensive analysis with data insights
- "recommendations": Array of exactly 3 actionable recommendations
- "plan": Detailed 7-day execution plan with daily tasks`;

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
    maxOutputTokens: 2048,
    temperature: 0.7
  });

  console.log(`✅ Reduce Phase complete. Response: ${reasoningText.length} chars`);
  return reasoningText;
}

/**
 * Clean JSON response (remove markdown code blocks if present)
 */
function cleanJSONResponse(text) {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return cleaned;
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
      const systemPrompt = `You are BrotherG, an elite Shopee E-commerce Consultant. Your tone is professional, sharp, and profit-oriented.

CRITICAL OUTPUT REQUIREMENTS:
- You MUST output valid JSON only (no markdown code blocks, no extra text)
- JSON structure must match exactly:
{
  "summary": "Detailed strategic analysis (2-3 paragraphs)",
  "recommendations": ["Actionable Step 1", "Actionable Step 2", "Actionable Step 3"],
  "plan": "7-Day Execution Plan with specific actions and timelines"
}`;

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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
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
    } catch (e) {
      console.error('❌ JSON parsing failed:', e.message);
      // Fallback: wrap in expected format
      result = {
        summary: reasoningText,
        recommendations: ["Review the analysis above", "Implement key insights", "Monitor results"],
        plan: "7-day plan: Days 1-2: Analysis review. Days 3-5: Implementation. Days 6-7: Optimization."
      };
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

    console.log(`✅ Success: ${tier} tier, ${images.length} images, ${result.summary.length} chars summary`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
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
