const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Smart model selection based on content type
// Text-only → gemini-1.5-flash (fast & cheap)
// With images → gemini-3-pro-preview (high quality)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  
  try {
    const body = JSON.parse(event.body);
    const userPrompt = body.prompt || body.userPrompt || body.text || '';
    const systemPrompt = body.systemPrompt || '';
    const images = body.images || body.image || [];
    
    if (!userPrompt && (!images || images.length === 0)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing parameters' }) };
    }
    
    // ============================================
    // SMART MODEL SELECTION
    // ============================================
    
    // Check if request contains images
    const hasImages = images && Array.isArray(images) && images.length > 0;
    
    // Select model based on content type
    const modelName = hasImages 
      ? "gemini-3-pro-preview"      // High quality for images
      : "gemini-1.5-flash";          // Fast & cheap for text
    
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    
    console.log(`Using model: ${modelName} (hasImages: ${hasImages})`);
    
    // ============================================
    // PREPARE CONTENT
    // ============================================
    
    const parts = [];
    if (systemPrompt) parts.push({ text: systemPrompt });
    if (userPrompt) parts.push({ text: userPrompt });
    
    // Add images if present
    if (hasImages) {
      images.forEach(img => {
        const cleanBase64 = img.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inline_data: { mime_type: "image/jpeg", data: cleanBase64 } });
      });
    }
    
    // ============================================
    // GENERATION CONFIG
    // ============================================
    
    const generationConfig = { 
      temperature: 1.0,  // Gemini 3.0 Pro / 1.5 Flash default
      topK: 40, 
      topP: 0.95, 
      maxOutputTokens: 8192
    };
    
    // ============================================
    // GENERATE CONTENT
    // ============================================
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: generationConfig
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API Error:", errText);
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    
    // Return response with model information
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ 
        response: generatedText,
        modelUsed: modelName  // Tell frontend which model was used
      }) 
    };
    
  } catch (error) {
    console.error("Handler Error:", error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        error: 'Processing failed', 
        details: error.message 
      }) 
    };
  }
};
