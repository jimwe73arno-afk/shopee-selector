// netlify/functions/tesla-save-answer.js
// Tesla 專用：保存 Q1-Q10 答案（不呼叫 AI）

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
    const { userId, questionId, answerText, sessionId } = body;

    if (!userId || !questionId || !answerText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Missing required fields' })
      };
    }

    // 生成或使用 sessionId
    const teslaSessionId = sessionId || `tesla_${userId}_${Date.now()}`;

    // 保存答案到 Firestore
    const sessionRef = db.collection('tesla_sessions').doc(teslaSessionId);
    const sessionData = await sessionRef.get();

    const answers = sessionData.exists ? (sessionData.data().answers || []) : [];
    
    // 更新或新增答案
    const answerIndex = answers.findIndex(a => a.questionId === questionId);
    const answerData = {
      questionId: Number(questionId),
      answerText: answerText.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    if (answerIndex >= 0) {
      answers[answerIndex] = answerData;
    } else {
      answers.push(answerData);
    }

    // 排序答案（按 questionId）
    answers.sort((a, b) => a.questionId - b.questionId);

    await sessionRef.set({
      userId,
      sessionId: teslaSessionId,
      answers,
      currentQuestionId: questionId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Tesla] Saved answer for Q${questionId}, session: ${teslaSessionId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        sessionId: teslaSessionId,
        message: '了解，我們來看下一題。'
      })
    };

  } catch (error) {
    console.error('[Tesla] save-answer error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

