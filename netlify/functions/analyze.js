// netlify/functions/analyze.js
// CommonJS Netlify Function for Gemini 3.0 Pro Shopee Analysis

// Node 18+ has native fetch, but we'll use globalThis.fetch for compatibility
const fetch = globalThis.fetch;

const API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  '';

/**
 * CORS headers for all responses
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Netlify Function Handler
 */
exports.handler = async (event) => {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: 'Method Not Allowed',
      }),
    };
  }

  // Check API key
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: 'Missing Gemini API key',
      }),
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Extract fields from frontend
    const {
      mode = 'text',
      messages = [],
      images = [],
      model3 = 'gemini-3.0-pro-preview',
      model15 = 'gemini-1.5-flash',
    } = body;

    // Build prompt based on mode
    let promptText = '';
    
    if (mode === 'image') {
      promptText = `Shopee 選品分析：

根據提供的圖片與文字描述，進行深度分析並給出：
1. 商品市場定位
2. 競爭優勢分析
3. 定價策略建議
4. 7 日實戰行動計畫

請以專業、精簡、可執行的方式呈現。`;
    } else {
      promptText = `Shopee 選品分析：

根據賣家的商品描述與需求，整理出：
1. 推薦的商品方向（TOP 3）
2. 每個方向的利潤風險評估
3. 競爭程度分析
4. 7 日行動計畫（包含上架、定價、行銷策略）

請以 JSON 格式回應，包含：
- summary: 總體分析摘要
- recommendations: 推薦商品清單與理由
- plan: 7 日執行計畫`;
    }

    // Combine messages if provided
    let combinedText = promptText;
    if (messages && messages.length > 0) {
      combinedText += '\n\n賣家描述：\n' + messages.join('\n');
    }

    // Build request parts
    const parts = [{ text: combinedText }];

    // Add images if provided
    if (images && images.length > 0 && mode === 'image') {
      images.forEach((imgBase64) => {
        // Clean base64 string
        const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
        
        // Detect mime type
        let mimeType = 'image/jpeg';
        if (imgBase64.includes('data:image/png')) {
          mimeType = 'image/png';
        } else if (imgBase64.includes('data:image/webp')) {
          mimeType = 'image/webp';
        }

        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        });
      });
    }

    // Build Gemini API payload
    const payload = {
      contents: [
        {
          role: 'user',
          parts: parts,
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096,
      },
    };

    // Determine model: use 3.0 Pro for image analysis, 1.5 Flash for text
    const modelName = mode === 'image' ? model3 : model15;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(API_KEY)}`;

    console.log(`🤖 Calling Gemini API: ${modelName}, mode: ${mode}, images: ${images.length}`);

    // Call Gemini API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', errorText);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: 'Gemini API error',
          debug: {
            status: response.status,
            statusText: response.statusText,
            error: errorText.substring(0, 200), // Limit error text length
          },
        }),
      };
    }

    const data = await response.json();
    
    // Extract text from response
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('\n') || '';

    if (!text) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: 'Empty response from Gemini API',
          debug: data,
        }),
      };
    }

    // Try to parse as JSON, fallback to plain text
    let parsedResult = null;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON, use as plain text
    }

    // Build response
    const result = {
      ok: true,
      summary: parsedResult?.summary || text,
      recommendations: parsedResult?.recommendations || null,
      plan: parsedResult?.plan || null,
      debug: {
        modelUsed: modelName,
        mode: mode,
        imageCount: images.length,
        rawResponseLength: text.length,
      },
    };

    console.log(`✅ Success: ${modelName}, response length: ${text.length}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('❌ Function error:', err);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: err.message || 'Unknown server error',
        debug: process.env.NODE_ENV === 'development' ? {
          stack: err.stack,
        } : undefined,
      }),
    };
  }
};
