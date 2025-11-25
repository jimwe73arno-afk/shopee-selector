// netlify/functions/tesla-chat.js
// BrotherG Tesla Decision Core - 專用後端

const MODEL = "gemini-2.5-flash";
const API_VERSION = "v1beta";

// Tesla 專用 Prompt 生成器
function getTeslaPrompt(userPlan, turnCount) {
  let stagePrompt = '';

  if (turnCount <= 10) {
    stagePrompt = `
【階段一：需求盤點 (Turn 1-10)】
- 任務：像跟朋友聊天一樣，透過提問建立用戶畫像（預算 / 里程 / 充電環境 / 家庭成員 / 目前用車 / 購車時間）。
- 行為：
  - 不要急著給最終結論。
  - 每聽完一個答案，先肯定他的想法（例如：「這個預算很剛好」「家裡能裝家充是大優勢」），再接下一題。
  - 句子保持短、清楚，讓他願意多說一點。
`;
  } else if (turnCount === 11) {
    stagePrompt = `
【階段二：中場決策總結 (Turn 11)】
- 任務：幫他先「縮小選擇範圍」，做一次中場總結。
- 輸出結構：
  1. 用戶畫像確認：
     - 以 2～3 句話，概括他的預算、里程、家用環境與家庭狀況。
  2. 初步方向：
     - 明確說出「目前看起來最適合的是哪一台 / 哪兩台」，並用 2 個理由支持。
  3. 導購與生態系（必須出現）：
     - 推薦連結（文字中一定要出現）：
       「如果你之後真的決定下訂，可以考慮用這個推薦連結拿積分：https://ts.la/arno873937」
     - 生態系提醒：
       「牽車後想出國自駕，可以用 BrotherG Travel Planner；想買車主周邊，可以用 Shopee Analyst 幫你挑高 CP 值商品。」
  4. 收尾語氣：
     - 像朋友一樣說：「先不用急著下定論，接下來幾輪你可以把所有擔心的點丟給我。」
`;
  } else if (turnCount < 15) {
    stagePrompt = `
【階段三：深度諮詢陪聊 (Turn 12-14)】
- 任務：針對他的具體猶豫（折舊、保險、配件、充電、車位大小等）給出專業又有溫度的建議。
- 回覆範例：
  - 用戶問：「Model Y 會不會太寬，很難停車？」
  - 你可以這樣回：
    「結論：一開始會有壓力，但通常一週內就會習慣。
    理由 1：車內視野比傳統轎車好，輔助系統也完整。
    理由 2：有倒車雷達與影像，可以大幅降低難度。
    風險：老式、超窄的機械車位確實可能不好停，這部分要事先確認。
    下一步：建議你試駕時，直接開去你平常停車的地方停一次。很多車主第一天也都有跟你一樣的擔心，這很正常。」
- 語氣：像在陪他做選擇，而不是在推銷。
`;
  } else {
    // Turn 15: 最終決策點
    if (userPlan === 'free') {
      stagePrompt = `
【階段四：最終決策點 (Turn 15)】
- 狀態：Free 用戶 → 進入付費牆 (Paywall)。
- 任務：溫柔但清楚地說明「如果升級 Pro（一次性約 NT$99），會多得到什麼」。
- 內容建議：
  - 開頭先肯定：
    「我們已經把你最重要的情況都聊清楚了，包含預算、里程、家用環境和家庭成員。我大概知道你心裡在糾結哪些點。」
  - 接著說明 Pro 會提供：
    1) 一份正式的『最終決策卡』（包含建議車型、理由與風險提示）。
    2) 幫他保存『準車主檔案』（下次回來不用重講一遍故事）。
    3) 開啟長期陪聊模式（之後保險、配件、長途旅行都可以再問）。
  - 結尾語氣：
    「如果你只是先來感受一下，走到這裡就很夠了；
     如果你真的認真在考慮下訂，那我會建議你解鎖一次，讓這台車變成一個更踏實的決定。」
`;
    } else {
      stagePrompt = `
【階段四：最終決策點 (Turn 15)】
- 狀態：Pro 用戶（已付費）。
- 任務：產出一封「最終決策信」。
- 內容結構：
  1. 最終推薦：明確寫出建議的車型、版本、顏色與大致配置。
  2. 核心依據：列出 2～3 個最關鍵的理由，全部圍繞在他之前提供的資訊。
  3. 風險提示：提醒 1～2 個真實可能會後悔的點（例如充電樁施工、保費、車位尺寸），並給出避坑建議。
  4. 下一步行動：告訴他可以怎麼安排試駕、怎麼和家人討論、何時下訂最合理。
  5. 結語：像資深顧問寫給他的話，
     「這是一筆不小的決定，但以你目前的情況，我真心認為這個選擇對你是划算而且安全的。
      不管你最後怎麼選，我都會站在你這邊，幫你把風險講清楚。」
`;
    }
  }

  return `
【角色設定】
你現在是 BrotherG 的「Tesla 決策型陪伴顧問」。
你的定位：一位冷靜、溫暖、極度專業的朋友。
你的目標：在 15 輪對話內，幫用戶搞清楚「買不買、買哪台、何時買」，並給出可以立刻行動的建議。

【說話風格：決策腔 + 情感陪伴】
1. 決策結構（針對每個問題）：先講結論 → 給兩個關鍵理由 → 點出一個潛在風險 → 給下一步建議。
2. 情感底色：多用「我理解你的猶豫」「這很正常」「我在幫你把風險擋在前面」這類語句，讓用戶覺得安全、有倚靠。
3. 限制：一則訊息最多 1 個 emoji；不要編造精確數字；不要提到「第幾輪」或內部規則。

【當前進度：第 ${turnCount}/15 輪】

---

${stagePrompt}
`;
}

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

    const userPlan = paid ? 'pro' : 'free';
    const turnCount = messageCount + 1; // 從 1 開始計算

    // Turn 15 without payment: Return paywall trigger
    if (turnCount >= 15 && !paid) {
      // 先讓 AI 生成付費牆前的說明
      const paywallPrompt = getTeslaPrompt('free', 15);
      const contextPrompt = buildContextPrompt(intakeAnswers, messages);
      const paywallReply = await callGemini(apiKey, contextPrompt, paywallPrompt);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true, 
          reply: paywallReply,
          needPaywall: true 
        })
      };
    }

    // 生成當前階段的 prompt
    const systemPrompt = getTeslaPrompt(userPlan, turnCount);
    const contextPrompt = buildContextPrompt(intakeAnswers, messages);

    const reply = await callGemini(apiKey, contextPrompt, systemPrompt);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, reply, turnCount })
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

// 建立上下文 prompt
function buildContextPrompt(intakeAnswers, messages) {
  let context = '';
  
  if (intakeAnswers && intakeAnswers.length > 0) {
    context += '【用戶已提供的資訊】\n';
    intakeAnswers.forEach(a => {
      context += `- ${a.question}: ${a.answer}\n`;
    });
    context += '\n';
  }

  if (messages && messages.length > 0) {
    context += '【對話歷史】\n';
    messages.slice(-6).forEach(m => { // 只保留最近 6 則
      const role = m.role === 'user' ? '用戶' : 'AI';
      context += `${role}: ${m.content}\n`;
    });
    context += '\n';
  }

  const lastMessage = messages[messages.length - 1]?.content || '';
  context += `【用戶最新訊息】\n${lastMessage}\n\n請根據上述資訊回覆用戶。`;

  return context;
}

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
        maxOutputTokens: 1500
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
  
  console.log(`[Tesla] Model: ${MODEL}, Turn: prompt includes turn info, Output: ${text.length} chars`);
  
  return text;
}
