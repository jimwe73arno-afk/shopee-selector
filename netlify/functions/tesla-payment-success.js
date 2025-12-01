// netlify/functions/tesla-payment-success.js
// Tesla 專用：付款成功後生成決策卡

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
  
  return text;
}

function buildDecisionCardPrompt(answers, teslaPaid) {
  // 整理 Q1-Q10 答案
  let answersText = '';
  answers.forEach((a) => {
    answersText += `Q${a.questionId}：${a.answerText}\n`;
  });

  const systemPrompt = `
你是「Brother G 決策型 AI」。你的任務是根據使用者在 Q1–Q10 的回答內容，生成一張 Tesla 購車決策卡。

請嚴格使用 Brother G 決策腔（結論 → 兩個依據 → 一個風險 → 一個行動），字數 300 字內。

**輸出格式（必須是有效的 JSON）：**

{
  "decision": "買 / 不買 / 等改款 / 試駕觀望",
  "summary": "一段 Brother G 決策腔 說明 (結論→依據→風險→行動)",
  "recommendation": "具體行動建議 (試駕/等改款/比較其他品牌)",
  "referral": ""
}

**重要規則：**
1. 必須輸出有效的 JSON，不要加任何其他文字說明
2. summary 要包含：結論、兩個依據、一個風險、一個行動
3. referral 欄位先留空，我會根據條件自動填入
4. 語氣要像 Brother G：短句、乾淨、有結論
5. 不要說「抱歉」或「需要更多資訊」
`;

  const userPrompt = `以下是使用者的 Tesla 預評估問答紀錄（Q1–Q10）。請根據他的預算、用車場景、是否家充、通勤距離、乘載需求、對品牌的態度、是否考慮中國電車等資訊，生成一份 Brother G 風格 Tesla 決策卡。

請直接輸出 JSON，不要加任何模型說明。

格式：
- decision：一句話明確說 買/不買/等改款/建議試駕
- summary：結論 → 兩個關鍵理由 → 一個風險 → 一個行動建議
- recommendation：具體行動建議（去試駕、比較哪兩款、先等 OTA 等）
- referral：留空

使用者回答：
${answersText}

請輸出 JSON 格式的決策卡。`;

  return { systemPrompt, userPrompt, teslaPaid };
}

// 根據決策內容和 teslaPaid 決定出口
function determineReferral(decisionCardJson, teslaPaid) {
  const decision = decisionCardJson.decision || '';
  const summary = decisionCardJson.summary || '';
  
  // 條件 3：已付費 → 記憶升級提示
  if (teslaPaid) {
    return '你已解鎖 Brother G 的 Tesla 決策記憶，我之後會根據你未來的用車習慣持續優化決策卡。';
  }
  
  // 條件 1：結論含「買」→ 導購碼
  if (decision.includes('買') || summary.includes('買') || summary.includes('值得')) {
    return '若你準備下定，記得用 Brother G 的官方推薦碼 ts.la/arno873937，我會親自幫你後續決策。';
  }
  
  // 條件 2：結論含「旅遊/想體驗/出國/不買」→ 旅遊連結
  if (decision.includes('不買') || decision.includes('旅遊') || decision.includes('體驗') || 
      summary.includes('旅遊') || summary.includes('想體驗') || summary.includes('出國')) {
    return '如果想體驗不同市場的電車文化，先去這裡看看路線 brotherg.ai/travel。';
  }
  
  // 預設：導購碼
  return '若你準備下定，記得用 Brother G 的官方推薦碼 ts.la/arno873937，我會親自幫你後續決策。';
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

    // 1. 取得用戶資料，檢查是否已付費
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const teslaPaid = userData.teslaPaid || false;

    // 2. 標記用戶已付款（如果還沒標記）
    if (!teslaPaid) {
      await userRef.set({
        teslaPaid: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`[Tesla] Marked user ${userId} as teslaPaid=true`);
    }

    // 3. 取得 Q1-Q10 答案
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

    // 4. 生成決策卡
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing API key' })
      };
    }

    const { systemPrompt, userPrompt } = buildDecisionCardPrompt(answers, true); // 此時 teslaPaid = true
    let rawResponse = await callGemini(apiKey, userPrompt, systemPrompt);

    // 5. 解析 JSON 輸出（模型可能返回 markdown 包裝的 JSON）
    let decisionCardJson;
    try {
      // 嘗試提取 JSON（可能被 ```json ... ``` 包裝）
      const jsonMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || rawResponse.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;
      decisionCardJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[Tesla] Failed to parse JSON, using raw response:', e);
      // 如果解析失敗，使用原始回應作為 summary
      decisionCardJson = {
        decision: '試駕觀望',
        summary: rawResponse,
        recommendation: '建議先試駕體驗',
        referral: ''
      };
    }

    // 6. 根據條件決定出口（此時 teslaPaid = true，所以會是記憶升級提示）
    decisionCardJson.referral = determineReferral(decisionCardJson, true);

    // 7. 組合成最終決策卡文字
    const decisionCard = `### 🎯 你的 Tesla 決策卡

**結論：** ${decisionCardJson.decision}

${decisionCardJson.summary}

**建議：** ${decisionCardJson.recommendation}

---

${decisionCardJson.referral}`;

    // 8. 保存決策卡到 session
    await sessionRef.set({
      decisionCard,
      decisionCardJson,
      paid: true,
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Tesla] Generated decision card for session ${sessionId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        decisionCard,
        decisionCardJson  // 同時返回 JSON 格式供前端使用
      })
    };

  } catch (error) {
    console.error('[Tesla] payment-success error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

