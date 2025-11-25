// netlify/functions/tesla-chat.js
// BrotherG Tesla Decision Core - 專用後端

const MODEL = "gemini-2.5-flash";
const API_VERSION = "v1beta";

const TESLA_SYSTEM_PROMPT = `你是「BrotherG Tesla 決策顧問」，專門幫助用戶做出 Tesla 購車決策。

## 回答格式（嚴格遵守）
一、結論（2-4行，直接給建議）
二、關鍵依據（3-5點，用數據或邏輯支撐）
三、風險提醒（1-3點，誠實告知潛在問題）
四、下一步行動（2-4行，具體可執行）

## 風格要求
- 不要出現 Emoji
- 保持 BrotherG 決策腔：結論→依據→風險→行動
- 用繁體中文回答
- 簡潔有力，不廢話

## 專業知識
- 熟悉 Tesla 全車系：Model 3, Model Y, Model S, Model X, Cybertruck
- 了解台灣充電網絡、補貼政策、保險選項
- 知道各車型優缺點、適用場景、維修成本`;

const INTAKE_RESPONSE = `收到你的回答，這對我了解你的需求很重要。`;

const AD_CARD = `
### 階段總結

感謝你完成 9 題快問快答！根據你的回答，我已經對你的需求有初步了解。

**專屬優惠**
- Tesla 導購連結：[ts.la/arno873937](https://ts.la/arno873937)（使用此連結下訂可獲得 Tesla 積分）

**BrotherG 生態系**
- 買車後出國玩？試試 **BrotherG Travel AI** 幫你規劃行程
- 蝦皮賣家？用 **Shopee Analyst** 分析你的後台數據

**下一步**
現在進入自由對話模式。你可以問我任何關於 Tesla 的問題：
- 充電規劃
- 保險選擇
- 配件推薦
- 車型比較
- 二手車估值

到第 20 輪時，我會根據所有對話給你最終決策卡。
`;

exports.handler = async (event, context) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        service: 'BrotherG Tesla Decision Core',
        model: MODEL,
        status: 'online'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { messages = [], intakeAnswers = [], messageCount = 0, paid = false } = body;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing API key' })
      };
    }

    // Step 10: Return Ad Card (no AI call needed)
    if (messageCount === 9) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, reply: AD_CARD })
      };
    }

    // Step 20 without payment: Return paywall
    if (messageCount >= 19 && !paid) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, reply: '', needPaywall: true })
      };
    }

    // Intake Phase (1-9): Simple acknowledgment + AI enhancement
    if (messageCount < 9) {
      // For intake, we can just acknowledge or use AI for a brief response
      const lastMessage = messages[messages.length - 1]?.content || '';
      
      // Quick AI response for intake
      const intakePrompt = `用戶正在回答 Tesla 購車問卷。
問題：${intakeAnswers[intakeAnswers.length - 1]?.question || ''}
用戶回答：${lastMessage}

請用一句話（15-30字）簡短回應，表示你理解了他的回答。不要問新問題。`;

      const aiReply = await callGemini(apiKey, intakePrompt, TESLA_SYSTEM_PROMPT);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, reply: aiReply || INTAKE_RESPONSE })
      };
    }

    // Free Chat (11-19) or Decision Card (20)
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    
    let prompt;
    if (messageCount >= 19 && paid) {
      // Decision Card
      prompt = `根據以下用戶資料，生成最終決策卡：

用戶問卷回答：
${JSON.stringify(intakeAnswers, null, 2)}

對話歷史摘要：用戶已經問了 ${messages.length} 個問題

請生成「最終決策卡」，格式：
### 最終決策卡

**推薦車型**：[具體車型 + 版本]

**一、結論**
（2-4行，直接給出購車建議）

**二、關鍵依據**
1. ...
2. ...
3. ...

**三、風險提醒**
1. ...
2. ...

**四、下一步行動**
（具體可執行的步驟）

**專屬連結**
- Tesla 導購：[ts.la/arno873937](https://ts.la/arno873937)`;
    } else {
      // Free Chat
      prompt = `用戶問卷回答：
${JSON.stringify(intakeAnswers, null, 2)}

用戶第 ${messageCount} 輪問題：${lastUserMessage}

請根據用戶的背景資料，專業回答他的問題。`;
    }

    const reply = await callGemini(apiKey, prompt, TESLA_SYSTEM_PROMPT);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, reply })
    };

  } catch (error) {
    console.error('Tesla Chat Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

async function callGemini(apiKey, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ 
        role: 'user', 
        parts: [{ text: prompt }] 
      }],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error (${response.status}):`, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  console.log(`[Tesla] Model: ${MODEL}, Output length: ${text.length}`);
  
  return text;
}

