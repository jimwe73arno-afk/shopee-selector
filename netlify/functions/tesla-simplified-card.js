// netlify/functions/tesla-simplified-card.js
// Tesla 專用：生成簡化版決策卡（Q10 完成後顯示，不付費）

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
        maxOutputTokens: 500  // 簡化版，字數較少
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
  
  return text;
}

function buildSimplifiedPrompt(answers) {
  let answersText = '';
  answers.forEach((a) => {
    answersText += `Q${a.questionId}：${a.answerText}\n`;
  });

  const systemPrompt = `
你是「Brother G 決策型 AI」。根據使用者的 Q1-Q10 回答，生成一個簡化版 Tesla 決策建議（約 150 字）。

格式：
- 結論：一句話（買/不買/建議試駕）
- 依據：兩個關鍵理由
- 行動：一個具體建議

語氣：短句、乾淨、有結論。不要說「抱歉」。
`;

  const userPrompt = `以下是使用者的 Tesla 預評估問答（Q1-Q10）：

${answersText}

請生成簡化版決策建議（結論 + 兩個依據 + 一個行動建議）。`;

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
    const { userId, sessionId } = body;

    if (!userId || !sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing userId or sessionId' })
      };
    }

    // 取得 Q1-Q10 答案
    const sessionRef = db.collection('tesla_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Session not found' })
      };
    }

    const sessionData = sessionDoc.data();
    const answers = sessionData.answers || [];

    if (answers.length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Not all questions answered' })
      };
    }

    // 生成簡化決策卡
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing API key' })
      };
    }

    const { systemPrompt, userPrompt } = buildSimplifiedPrompt(answers);
    const simplifiedCard = await callGemini(apiKey, userPrompt, systemPrompt);

    // 解析簡化決策卡（提取結論、依據、行動）
    const conclusion = simplifiedCard.split('結論')[1]?.split('依據')[0]?.trim() || '建議考慮 Tesla';
    const reasons = simplifiedCard.split('依據')[1]?.split('行動')[0]?.trim() || '預算和場景符合需求';
    const action = simplifiedCard.split('行動')[1]?.trim() || '建議預約試駕';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        simplifiedCard: {
          conclusion,
          reasons,
          action,
          fullText: simplifiedCard
        }
      })
    };

  } catch (error) {
    console.error('[Tesla] simplified-card error:', error);
    
    // Fallback 決策卡
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        simplifiedCard: {
          conclusion: '建議考慮 Tesla Model 3 標準續航版',
          reasons: '預算符合日常使用，充電條件滿足',
          action: '預約試駕體驗實際駕駛感受'
        }
      })
    };
  }
};

