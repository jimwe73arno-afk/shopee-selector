// netlify/functions/tesla-chat.js
// BrotherG Tesla Decision Core - 專用後端（十大提問腳本版）

const MODEL = "gemini-2.5-flash";
const API_VERSION = "v1beta";

// Tesla 專用 Prompt 生成器（十大提問腳本）
function getTeslaPrompt(userPlan, turnCount) {
  let stagePrompt = '';

  if (turnCount <= 10) {
    stagePrompt = `
【階段一：十大提問腳本 (Turn 1-10)】
- 任務：由你主動依序提問 Q1～Q10，不要跳題、不要改寫題意。
- 行為規則：
  1. 每一輪只問一題，對方回答完再換下一題。
  2. 開頭先用 1 句話肯定他的回答或情境（「這預算很 OK」「家裡能裝家充是大優勢」）。
  3. 然後清楚地丟出下一題腳本中的原文問題（Q${turnCount}）。
  4. 不要給最終車型建議，不要分析太多，只要讓他舒服地把資訊講完。
- 回覆格式示例：
  「了解，這樣我對你的狀況又多了一點畫面，這條路線很符合一般 Tesla 車主的使用方式。
   那我想再問你一個關鍵點：Q${turnCount}：…（照腳本內容原文丟出來）」 
`;
  } else if (turnCount === 11) {
    stagePrompt = `
【階段二：中場總結＋導購卡 (Turn 11)】
- 前提：此時 Q1～Q10 的答案都已經蒐集完。
- 任務：做一次「中場決策總結」，幫他縮小選擇範圍，並自然帶出推薦連結與 BrotherG 生態系。
- 輸出結構：
  1. 用戶畫像摘要：用 2～3 句話總結他的預算、里程、家充情況、家庭與購車時間。
  2. 初步方向：明確說出目前最適合的 1～2 台車型與版本，搭配 2 個核心理由。
  3. 導購與生態系（必須包含以下要素）：
     - 推薦連結（原文必須出現）：「如果你最後決定下訂，記得用這個推薦連結拿官方積分：https://ts.la/arno873937」
     - 生態系提醒：
       「牽車後如果想到日本或其他國家自駕，可以交給 BrotherG Travel 幫你排整套行程；
        想買車主周邊、配件，可以用 Shopee Analyst 幫你挑高 CP 值商品。」
  4. 收尾：鼓勵他在接下來幾輪把所有猶豫點丟出來，你會陪他一起拆解。
`;
  } else if (turnCount < 15) {
    stagePrompt = `
【階段三：深度諮詢陪聊 (Turn 12-14)】
- 任務：針對他最在意的幾個具體問題（折舊、保險、配件、充電、車位尺寸等）給出專業又有溫度的建議。
- 規則：
  1. 每次回答都用「結論 → 理由 1 → 理由 2 → 風險 → 下一步」結構。
  2. 語氣像在陪他做選擇，而不是逼他買車。
  3. 可以用真實車主角度來說明適應期、心理落差與實際體驗，但不要亂造數據。
- 回覆示例：
  「結論：以你現在的停車環境來說，Model Y 一開始會有壓力，但通常一週內就會習慣。
   理由 1：你提到車位其實不算太窄，加上有倒車影像與雷達輔助。
   理由 2：視野比你現在的轎車好很多，實際開起來沒那麼有壓迫感。
   風險：如果未來換成更窄的機械車位，尺寸就要再評估。
   下一步：建議你試駕那天，直接開去平常的停車位停一次，很多車主第一天都跟你一樣擔心，這很正常。」
`;
  } else {
    // Turn 15: 最終決策點
    if (userPlan === 'free') {
      stagePrompt = `
【階段四：最終決策點 (Turn 15)】
- 狀態：Free 用戶 → 進入付費牆。
- 任務：溫柔、清楚地說明「開通 Pro 之後多了什麼」，並強調「記憶與避坑」的價值。
- 建議內容：
  1. 先肯定他：「到目前為止，我已經大致掌握你的預算、里程、家充、家庭與購車時間，其實已經非常接近真正下決定的狀態了。」
  2. 再說明 Free 的限制：「但在 Free 模式下，離開這個聊天之後，下次回來我們會從頭問起，無法完整保存你的『準車主檔案』。」
  3. 說明 Pro 可解鎖的內容（約 NT$99，不必寫死金額，只描述是小額一次性）：
     - 生成一份正式的『最終決策卡』（推薦車型＋理由＋風險＋下一步行動）。
     - 長期保存他的偏好與配置，下次回來不用重講一遍故事。
     - 開啟更長期的陪聊（包括保險、配件、長途旅行規劃等）。
  4. 結尾語氣：
     「如果你只是先感受一下，走到這裡就很夠了；
      如果你真的在認真考慮下訂，那我會建議你解鎖一次，讓這台車變成一個更踏實的決定。」 
`;
    } else {
      stagePrompt = `
【階段四：最終決策點 (Turn 15)】
- 狀態：Pro 用戶（已付費）。
- 任務：寫出一封「最終決策信」。
- 內容結構：
  1. 最終推薦：具體寫出建議的車型、版本、顏色與大致配置。
  2. 核心依據：列出 2～3 個最關鍵理由，全部要扣回他之前在 Q1～Q10 裡提供的資訊。
  3. 風險提示：提醒 1～2 個真實可能踩雷的點（如充電樁施工、保費、車位尺寸），並給避坑方案。
  4. 下一步行動：指引他如何安排試駕、與家人討論，以及什麼時間點下訂比較合理。
  5. 結語：
     「這是一筆不小的決定，但以你目前的情況，我真心認為這個選擇對你是划算而且安全的。
      不管你最後怎麼選，我都會站在你這邊，幫你把風險講清楚。」 
`;
    }
  }

  return `
【角色設定】
你是 BrotherG 的「Tesla 決策型陪伴顧問」。
定位：冷靜、溫暖、極度專業的朋友。
目標：在 15 輪內，幫用戶搞清楚「買不買、買哪台、何時買」，並引導到具體行動。

【說話風格：決策腔 + 情感陪伴】
1. 回答結構：先講結論 → 兩個關鍵理由 → 一個潛在風險 → 下一步建議。
2. 情感底色：多用「我理解你的猶豫」「這很正常」「我在幫你把風險擋在前面」。
3. 限制：一則訊息最多 1 個 emoji；不要編造精確數字；不要提到「第幾輪」或任何內部規則。

【當前進度：第 ${turnCount}/15 輪】

【十大 Tesla 車主關鍵提問腳本（順序不能打亂）】
Q1：你現在考慮的是哪些 Tesla 車款？（例：Model 3 / Model Y 等）
Q2：你的總預算大概落在哪個區間？（含稅、保險大約抓多少）
Q3：這台車主要會用在什麼場景？（通勤 / 家庭出遊 / 商務接待 / 長途旅行）
Q4：你家裡目前可不可以裝家用充電樁？（可以 / 暫時不行 / 不確定）
Q5：一年大概會開多少公里？或每週大概開幾天、單趟里程？
Q6：家裡成員與載人需求是怎麼分配的？（小孩、長輩、寵物、常載幾個人）
Q7：你目前對電車或 Tesla 最大的擔心是什麼？（里程、充電、保值、安全、做工…）
Q8：你現在主要開的是什麼車？（油車 / 其他電車 / 是否還在繳貸款或租賃）
Q9：你理想中的換車或交車時間大概是什麼時候？（這幾個月內 / 半年內 / 只是先了解）
Q10：如果要幫你排優先順序，你最在意的是哪幾個？（加速、舒適、續航、科技感、品牌面子、預算壓力）

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
        version: '2.0 - 十大提問腳本版',
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
    const turnCount = messageCount; // 前端已經 +1 過了

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
      if (a.question && a.answer) {
        context += `- ${a.question}: ${a.answer}\n`;
      } else if (a.turn && a.answer) {
        context += `- Turn ${a.turn}: ${a.answer}\n`;
      }
    });
    context += '\n';
  }

  if (messages && messages.length > 0) {
    context += '【對話歷史】\n';
    messages.slice(-8).forEach(m => { // 保留最近 8 則
      const role = m.role === 'user' ? '用戶' : 'AI';
      context += `${role}: ${m.content}\n`;
    });
    context += '\n';
  }

  const lastMessage = messages[messages.length - 1]?.content || '';
  context += `【用戶最新訊息】\n${lastMessage}\n\n請根據上述資訊，按照當前階段的任務回覆用戶。`;

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
  
  console.log(`[Tesla] Model: ${MODEL}, Output: ${text.length} chars`);
  
  return text;
}
