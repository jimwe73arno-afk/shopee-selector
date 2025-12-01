// netlify/functions/tesla-decision.js
// Tesla 專用：Q10 完成後生成完整決策卡

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

const MODEL = "gemini-2.5-flash";
const API_VERSION = "v1beta";

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
        maxOutputTokens: 2000,
        responseMimeType: "application/json"
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
  
  // 嘗試解析 JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // 如果不是 JSON，返回原始文字
    return { raw: text };
  }
}

function buildDecisionPrompt(answers) {
  let answersText = '';
  answers.forEach((a, idx) => {
    answersText += `Q${idx + 1}：${a.question}\n答：${a.answer}\n\n`;
  });

  const systemPrompt = `
你是 Brother G（藍教主）的 Tesla 決策顧問助手。

使用者剛剛回答了 10 題問題，請你生成一張「Tesla 決策卡」。

**輸出格式（必須是有效的 JSON）：**

{
  "decisionSummary": "建議你選擇 Model 3 Long Range，短結論一句話",
  "keyReasons": ["理由1", "理由2", "理由3"],
  "risks": ["風險1 + 兜底建議", "風險2 + 兜底建議"],
  "suggestedActions": ["行動1", "行動2", "行動3"]
}

**規則：**
1. decisionSummary：買/不買/建議車型 + 一句話理由
2. keyReasons：3-5 點，對齊使用者的預算/里程/家充/場景
3. risks：至少 2 個風險 + 怎麼兜底
4. suggestedActions：3 個接下來 7 天內可以做的具體動作
5. 語氣要像 Brother G：短句、乾淨、有結論
6. 不要說「抱歉」或「需要更多資訊」
`;

  const userPrompt = `以下是使用者的 Tesla 預評估問答（Q1-Q10）：

${answersText}

請根據以上資訊，生成 Tesla 決策卡（JSON 格式）。`;

  return { systemPrompt, userPrompt };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { answers, userId, sessionId } = body;

    if (!answers || !Array.isArray(answers) || answers.length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing or incomplete answers' })
      };
    }

    // 生成決策卡
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing API key' })
      };
    }

    const { systemPrompt, userPrompt } = buildDecisionPrompt(answers);
    const decisionData = await callGemini(apiKey, userPrompt, systemPrompt);

    // 如果返回的是 raw 文字，嘗試解析
    let decisionCard;
    if (decisionData.raw) {
      // Fallback：手動解析
      decisionCard = {
        decisionSummary: "建議考慮 Tesla Model 3 標準續航版",
        keyReasons: ["預算符合日常使用", "充電條件滿足", "場景需求匹配"],
        risks: ["續航焦慮：建議先試駕體驗實際續航", "保值問題：建議關注市場行情"],
        suggestedActions: ["預約試駕體驗實際駕駛感受", "確認家充安裝條件", "使用導購碼獲得額外福利"]
      };
    } else {
      decisionCard = decisionData;
    }

    // 保存到 Firestore（如果有 sessionId）
    if (sessionId && userId) {
      try {
        const sessionRef = db.collection('tesla_sessions').doc(sessionId);
        await sessionRef.set({
          decisionCard,
          answers,
          generatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.error('[Tesla] Failed to save to Firestore:', e);
        // 不影響返回結果
      }
    }

    console.log(`[Tesla] Generated decision card for ${answers.length} answers`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        ...decisionCard
      })
    };

  } catch (error) {
    console.error('[Tesla] decision error:', error);
    
    // Fallback 決策卡
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        decisionSummary: "建議考慮 Tesla Model 3 標準續航版",
        keyReasons: ["預算符合日常使用", "充電條件滿足", "場景需求匹配"],
        risks: ["續航焦慮：建議先試駕體驗實際續航", "保值問題：建議關注市場行情"],
        suggestedActions: ["預約試駕體驗實際駕駛感受", "確認家充安裝條件", "使用導購碼獲得額外福利"]
      })
    };
  }
};

