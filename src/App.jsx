import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  LineChart, 
  ShoppingBag, 
  Store,
  Smartphone, 
  Plane, 
  Sparkles, 
  Candy, 
  Menu, 
  Check,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Upload,
  ExternalLink,
  X,
  FileText,
  Copy,
  Crown,
  Lock,
  KeyRound,
  CreditCard,
  Trash2,
  Bell,
  Zap
} from 'lucide-react';

// --- 💰 設定區 ---
// ✅ API Key 已安全地移至伺服器端，不再暴露在前端
const PAYMENT_LINK = "https://p.ecpay.com.tw/E149ADE"; 
const VALID_CODES = ['VIP688', 'PRO2025', 'BROTHERG'];

const AFFILIATE_CONFIG = {
    shopee: {
        url: "https://collshp.com/brotherg?view=storefront", 
        title: "🔥 BROTHER G 嚴選貨源",
        desc: "高利潤選品清單"
    }
};

const SYSTEM_PROMPT_TEXT = `
你是一個專門服務「蝦皮直播賣家」的【選品決策 AI 顧問】。

使用者的目標：在「直播可上架的有限格子內」，選出最有價值的商品組合，而不是單純把商品塞滿。  
你的角色：只專注在「看數據、挑商品、排順序」，不要討論直播話術或講什麼台詞。

-----------------------
【一、你會拿到的資訊】
使用者可能會給你：
- 蝦皮直播／賣場後台匯出的文字資料，或截圖 OCR 出來的內容  
- 每個商品的大致欄位：商品名稱、類別（如果有）、售價、曝光／點擊、訂單數、銷售額、佣金％（如果看得到）

如果資料不完整，你可以用「大約、高／中／低」來描述，不需要精算到一元。

-----------------------
【二、請從「選品」角度來思考，而不是情緒或感覺】

你的核心思考邏輯只有三件事：

1️⃣ 這個商品有沒有「證據」：  
- 有沒有點擊？  
- 有沒有訂單？  
- 在同價位裡表現算好還是普通？

2️⃣ 這個商品放進直播格子裡，扮演什麼角色：  
- 拉 GMV？（高單價 3C／家電）  
- 賺毛利？（美妝、保健、日用品、機能食品等中價位商品）  
- 吸引點擊和互動？（零食、小物、1 元品）  

3️⃣ 在「格子有限」的情況下，值不值得佔位置：  
- 同樣是 1 個格子，有些商品只是數字好看（高 GMV 但低分潤），  
- 有些商品是真的幫賣家賺錢（穩定出單＋合理毛利），  
- 你的任務是把後者挑出來，排在前面。

-----------------------
【三、請幫商品做 A/B/C 分級】

不管使用者給你多少商品，請盡量幫他分成三類：

🅰️ A 級主力品（Hero）  
- 有明確訂單紀錄，點擊與銷售額在同場明顯突出  
- 價格通常落在中段（約 NT$200–900），或是轉化特別好的品項  
- 適合成為「每一場都應該優先上架」的固定班底  

🅱️ B 級輔助品  
- 有一些點擊或偶爾出單，但不是最亮眼那批  
- 可以當「湊單、搭配、填充品」，或有潛力但還需要再測幾場  
- 適合排在中段或後段位置，觀察表現再決定去留  

🅲 C 級淘汰品  
- 幾乎沒有點擊、或長期 0 訂單  
- 單價極低＋分潤低，只會佔掉名額  
- 與賣家的主要客群明顯不符  
- 在直播可上架數量有限時，這些應該優先被換掉

（如果使用者特別說「只是拿來當 1 元引流／活動品」，你可以標註為「特殊用途」，但仍視為低優先級。）

-----------------------
【四、直播選品結構的基礎原則】

當使用者問「下一場要怎麼排商品」時，請依照以下通用邏輯思考（可以視情況微調，不必死背數字）：

1️⃣ 黃金前排（前 10 格左右）  
- 放 A 級主力品 + 少量高話題商品  
- 比如：今天的訂單王、高轉化美妝／保健品、中價位爆品  
- 可以穿插 1～2 個高單價 3C / 家電當做「門面」，但要提醒：這些多數只是拉 GMV，不一定賺得最多

2️⃣ 中段主力區（約 11～50 格）  
- 放穩定出單、毛利也不錯的商品（多為美妝、保健、日用、機能食品、部分旅遊／eSIM 等）  
- 可以混一些 B 級有潛力品，搭配 A 級一起出現  

3️⃣ 後段填充與測試區  
- 放新測品、零食小物、引流用商品  
- 目標是「利用直播掛播時間，幫這些品試水溫」，看之後有沒有機會升級到 B/A 級

4️⃣ 價格帶建議  
- 大部分格子建議集中在中價位（約 NT$200–900），最容易出手  
- 高價商品（3C、家電）用來撐場面與點擊，不需要太多  
- 超低價商品控制比例，避免浪費太多名額

-----------------------
【五、回答風格要求】

不管使用者提供什麼資料，請遵守以下輸出習慣：

1. 先用 2～3 句話總結這次數據看到的重點（例如：哪一類商品最有潛力、哪一類一直拖累表現）。  
2. 明確列出 A/B/C 級商品代表，並用一句話說明「為什麼這樣分」。  
3. 給出「下一場選品建議」，包含：  
   - 哪些類型應該多放一些  
   - 哪些類型應該減少  
   - 若直播格子有限（例如 100 格），各種類型大概要放多少件  
4. 盡量用賣家聽得懂的語言，不用專業統計術語。  
5. 不要講技術實作、不要提程式碼，只專注在「選什麼商品、怎麼排、為什麼」。

你的核心任務只有一個：  
> 幫蝦皮賣家「用有限的直播格子，換到最大的實際利潤」，  
> 用數據說話，幫他們決定該留誰、該砍誰、下一場要帶誰上場。`;

const SELECTION_PROMPT = `
你現在要幫一個蝦皮直播賣家，根據「過去一場或數場的數據」，規劃出【下一場直播的選品清單與排序】。
使用者會提供：
- 文字版的商品數據（例如從後台複製出來的表格內容），或
- 從截圖辨識出的商品名稱、價格、點擊數、訂單數、銷售額等
請你依照以下步驟思考與回答。
-----------------------
【一、先快速讀懂這場的數據】
1. 找出本場「表現最好的商品」：
   - 看訂單數、銷售額、點擊數三者的綜合表現
   - 不必精算，只要知道大致哪幾個是本場主角
2. 粗略分類商品角色（可用你自己的判斷）：
   - 高單價、高話題，用來撐場面與吸引點擊的「門面商品」
   - 價格在中間、穩定出單、毛利通常較好的「利潤主力商品」
   - 價格極低或只偶爾出單的「引流／填充商品」
3. 幫商品做 A/B/C 分級（用於之後排序）：
   - A 級：有明顯訂單與銷售額，在同類中表現突出
   - B 級：有點擊或偶爾出單，還在觀察中
   - C 級：長期點擊很少或沒有訂單，或單價極低＋貢獻有限
-----------------------
【二、請幫使用者排出「下一場直播」的格子結構】
假設這個直播場最多可以上架 100 格商品（如果使用者有說是 50 格或 500 格，你可以比例放大或縮小），  
請依照下面的邏輯，規劃具體要放哪些商品、放在第幾格區間：
🔶 一、【第 1 - 10 格：黃金成交區】
這一段是直播間的「門面＋主攻區」，請這樣安排：
- 以 A 級主力商品為主（本場最會賣的那幾個）
- 穿插 1～2 個「高單價、高話題」的門面商品（可以是 3C、家電等），吸引點擊與討論
請用以下格式輸出：
1. [商品名或關鍵字] - [角色：主力 / 門面] - [理由：例如 今日訂單王 / 高點擊＋高話題]
2. ...
🔶 二、【第 11 - 30 格：利潤主力區】
這一段是「穩定賺毛利」的核心區域：
- 主要放 A 級與表現不錯的 B 級商品
- 價格多半在中段（例如 NT$200–900 這種較易出手的區間）
- 可以穿插少量「表現有潛力的新商品」，但比例不要太高
請用列表輸出：
- [商品名或關鍵字] - [建議放在 11–30 格的原因]
🔶 三、【第 31 - 100 格：測試與填充區】
這一段是「測品 + 填充」的區域：
- 放 B 級有潛力但數據尚不穩定的商品
- 放少量 C 級但你認為「有特殊用途」的商品（例如：1 元引流品、活動品）
- 目標是利用直播掛播時間，幫這些品「驗證市場反應」
請用小節說明：
- 這區建議放哪些類型商品（例如：零食、小物、新上架商品等）
- 若你能從數據中點名幾個適合放在這區的商品，也請列出名稱或關鍵字
-----------------------
【三、請列出「建議淘汰名單」】
請根據數據，幫使用者明確指出：
- 哪些商品屬於 C 級，建議下一場先不要上架，理由是什麼？
  - 例如：多場 0 訂單、點擊極少、價格太低且貢獻有限、與主要客群不符等
用列表輸出：
- [商品名或關鍵字] - [淘汰理由]
-----------------------
【四、回答格式要求】
請直接依照以下結構輸出（不要再重複說明規則）：
1. 本場選品簡短總結（2～3 句）
2. 【第 1 - 10 格：黃金成交區】
   1. ...
   2. ...
3. 【第 11 - 30 格：利潤主力區】
   - ...
4. 【第 31 - 100 格：測試與填充區】
   - ...
5. 【建議淘汰名單】
   - ...
重點是：請用你看到的數據，幫賣家做出「具體的排序建議」，  
讓他可以直接照著這個清單，去配置下一場直播的商品。`;

const callGeminiAPI = async (input, promptText, isImage = false) => {
    // 使用 Netlify Function 代理，API Key 安全地保存在伺服器端
    const url = '/.netlify/functions/gemini-proxy';
    
    let parts = [{ text: SYSTEM_PROMPT_TEXT + "\n\n" + promptText }];
    
    if (isImage) {
        if (Array.isArray(input)) {
            input.forEach(imgData => {
                parts.push({
                    inline_data: {
                        mime_type: "image/jpeg", 
                        data: imgData.split(',')[1]
                    }
                });
            });
        } else {
             parts.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: input.split(',')[1]
                }
            });
        }
    } else {
        parts[0].text += `\n\n【用戶提供的商品數據】：\n${input}`;
    }

    const payload = { 
        messages: [{ parts }],
        model: 'gemini-1.5-flash' // 使用穩定的免費模型
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message || data.error);
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
};

const UpgradeModal = ({ show, onClose, onUpgrade }) => {
    const [unlockCode, setUnlockCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [waitingPayment, setWaitingPayment] = useState(false);

    if (!show) return null;

    const openPaymentWindow = () => {
        setWaitingPayment(true);
        const width = 500;
        const height = 700;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);
        window.open(PAYMENT_LINK, 'ShopeeProPayment', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`);
    };

    const handleSubscription = () => {
        openPaymentWindow();
    };

    const handleVerify = () => {
        setLoading(true);
        setError('');
        setTimeout(() => {
            setLoading(false);
            if (VALID_CODES.includes(unlockCode.toUpperCase().trim())) {
                onUpgrade(); 
                alert("🎉 驗證成功！歡迎使用 BROTHER G SELECT Pro。");
                onClose();
            } else {
                setError("❌ 無效的開通碼。");
            }
        }, 800);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white z-10"><X size={24}/></button>
                
                <div className="bg-[#0096E1] p-8 text-center text-white relative overflow-hidden">
                    <div className="inline-flex p-3 bg-white/20 rounded-full mb-4 backdrop-blur-sm border border-white/30">
                        <Crown size={32} className="text-[#fcc800] fill-[#fcc800]" /> 
                    </div>
                    <h2 className="text-2xl font-bold mb-1">升級 SELECT Pro</h2>
                    <p className="opacity-90 text-sm">解鎖 AI 多圖分析，選品效率提升</p>
                    <div className="absolute -bottom-6 -right-6 opacity-10">
                         <Bell size={120} />
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {!waitingPayment ? (
                        <div className="space-y-5">
                            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 text-center">
                                <p className="text-[#005b8a] font-bold text-lg mb-1">每月 $688 元</p>
                                <p className="text-gray-500 text-sm mt-2">✨ 立即付費，即刻開通 AI 圖片分析 ✨</p>
                                <p className="text-xs text-gray-500 mt-3">（綠界系統將引導您完成綁定與首次扣款）</p>
                            </div>

                            <div className="space-y-3 px-2">
                                <div className="flex items-center gap-3 text-sm text-gray-700">
                                    <div className="bg-green-100 p-1 rounded-full text-green-600"><Check size={14} /></div>
                                    <span>無限次 AI 多圖選品分析</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-700">
                                    <div className="bg-green-100 p-1 rounded-full text-green-600"><Check size={14} /></div>
                                    <span>智慧風險評估建議</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-700">
                                    <div className="bg-green-100 p-1 rounded-full text-green-600"><Check size={14} /></div>
                                    <span>自動續訂，隨時可取消</span>
                                </div>
                            </div>

                            <button 
                                onClick={handleSubscription}
                                className="w-full py-4 bg-[#0096E1] hover:bg-[#0085c7] text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                            >
                                <CreditCard size={20}/> 前往綠界綁定信用卡 (立即開通)
                            </button>
                            <p className="text-center text-xs text-gray-400">點擊將前往綠界 ECPay 安全支付</p>
                        </div>
                    ) : (
                        <div className="animate-in slide-in-from-right duration-300">
                            <div className="text-center mb-6">
                                <h3 className="font-bold text-gray-800 mb-2">正在驗證訂閱...</h3>
                                <div className="bg-yellow-50 p-3 rounded-lg text-left text-sm text-yellow-800 mb-4 border border-yellow-200">
                                    <p className="font-bold mb-1 text-[#de0000]">💡 開通教學：</p>
                                    <ol className="list-decimal pl-4 space-y-1">
                                        <li>請先在彈出的視窗完成付款</li>
                                        <li>付款成功頁面會顯示<b>「開通碼」</b></li>
                                        <li>在下方輸入該代碼即可啟用</li>
                                    </ol>
                                </div>
                                <button onClick={openPaymentWindow} className="text-xs text-[#0096E1] underline">重新開啟付款視窗</button>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><KeyRound size={18} className="text-gray-400"/></div>
                                <input 
                                    type="text" 
                                    value={unlockCode} 
                                    onChange={(e) => setUnlockCode(e.target.value.toUpperCase())} 
                                    placeholder="輸入開通碼" 
                                    className="w-full pl-10 p-4 border-2 border-blue-100 rounded-xl focus:border-[#0096E1] focus:ring-4 focus:ring-blue-100 outline-none font-mono uppercase text-center text-lg tracking-widest" 
                                />
                            </div>
                            {error && <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 justify-center"><AlertCircle size={16}/> {error}</div>}
                            <button onClick={handleVerify} disabled={loading || !unlockCode} className="w-full mt-4 py-3 bg-[#333] hover:bg-black text-white rounded-xl font-bold shadow-md disabled:bg-gray-300 transition-all">
                                {loading ? <Loader2 className="animate-spin mx-auto" /> : '立即開通'}
                            </button>
                            <div className="mt-4 text-center"><button onClick={() => setWaitingPayment(false)} className="text-xs text-gray-400 hover:text-gray-600">返回上一步</button></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen, isPro, setShowUpgrade }) => {
    const menuItems = [
        { id: 'dashboard', label: '總覽儀表板', icon: LayoutDashboard },
        { id: 'strategy', label: '選品策略生成', icon: ShoppingBag },
    ];

    return (
        <>
            <div 
                className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
                onClick={() => setIsOpen(false)} 
            />
            
            <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col shadow-2xl lg:shadow-none`}>
                
                <button 
                    onClick={() => setIsOpen(false)}
                    className="absolute top-4 right-4 p-2 text-white/80 hover:text-white lg:hidden z-50"
                >
                    <X size={24} />
                </button>

                <div className="flex items-center justify-center h-20 bg-[#0096E1] shrink-0 relative overflow-hidden">
                    {isPro && <div className="absolute top-0 right-0 bg-[#fcc800] text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm"><Crown size={10}/> PRO</div>}
                    <span className="text-white text-lg font-bold flex items-center gap-2 tracking-wide">
                        <Store className="w-5 h-5 text-[#fcc800] fill-[#fcc800]" /> BROTHER G
                    </span>
                </div>

                <nav className="mt-6 px-4 space-y-3 flex-1">
                    {menuItems.map((item) => (
                        <button 
                            key={item.id} 
                            onClick={() => { 
                                setActiveTab(item.id); 
                                setIsOpen(false); 
                            }} 
                            className={`flex items-center w-full px-4 py-4 text-base font-medium rounded-xl transition-colors ${activeTab === item.id ? 'bg-blue-50 text-[#0096e1] border border-blue-100 shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <span className="mr-4"><item.icon size={22} className={activeTab === item.id ? "text-[#0096e1]" : "text-gray-400"} /></span> {item.label}
                        </button>
                    ))}
                </nav>
                
                <div className="p-4 border-t border-gray-100 pb-8 lg:pb-4">
                    {!isPro ? (
                        <div className="bg-[#0096E1] rounded-xl p-5 text-white mb-4 shadow-lg relative overflow-hidden group cursor-pointer" onClick={() => { setShowUpgrade(true); setIsOpen(false); }}>
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Bell size={48}/></div>
                            <div className="flex items-center gap-2 mb-2 font-bold text-[#fcc800]"><Crown size={18} className="fill-[#fcc800]"/> 升級 Pro 版</div>
                            <p className="text-xs text-white/90 mb-3">每月僅需 $688，立即解鎖</p>
                            <div className="w-full py-2.5 bg-white text-[#0096e1] text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm">
                                <Sparkles size={16} className="fill-[#0096e1]"/> 立即開通
                            </div>
                        </div>
                    ) : (
                        <div className="bg-green-50 text-green-700 rounded-xl p-4 text-sm flex items-center gap-3 mb-4 border border-green-100">
                            <Check size={18} /> Pro 會員啟用中
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

const Dashboard = ({ isPro, setShowUpgrade }) => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        {!isPro && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                <a href={AFFILIATE_CONFIG.shopee.url} target="_blank" rel="noreferrer" className="bg-white border border-red-100 rounded-xl p-4 flex items-center justify-between hover:bg-red-50 transition-colors group cursor-pointer shadow-sm">
                    <div><div className="font-bold text-gray-800 group-hover:text-[#de0000] flex items-center gap-2"><ShoppingBag size={18} className="text-[#de0000]"/> 蝦皮爆品貨源</div><div className="text-xs text-gray-500">高利潤選品清單</div></div><ExternalLink size={16} className="text-gray-300 group-hover:text-[#de0000]"/>
                </a>
                <div onClick={() => setShowUpgrade(true)} className="bg-white border border-blue-100 rounded-xl p-4 flex items-center justify-between cursor-pointer shadow-sm hover:shadow-md hover:border-blue-300 transition-all group">
                    <div><div className="font-bold flex items-center gap-2 text-gray-800 group-hover:text-[#0096e1]"><Sparkles size={18} className="text-[#0096e1]"/> 圖片分析解鎖</div><div className="text-xs text-gray-500">升級 Pro 立即開通</div></div><div className="bg-[#0096e1] text-white text-xs px-3 py-1 rounded-full font-bold">PRO</div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
                { title: '本週 GMV', value: '$156,400', change: '+12%', icon: LineChart, color: 'bg-blue-500' },
                { title: '平均客單價', value: '$480', change: '+5%', icon: ShoppingBag, color: 'bg-green-500' },
                { title: '點擊率 (CTR)', value: '4.2%', change: '-1%', icon: Zap, color: 'bg-yellow-500' },
                { title: '主力商品佔比', value: '45%', change: '完美區間', icon: Sparkles, color: 'bg-purple-500' }
            ].map((stat, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start"><div><p className="text-sm text-gray-500">{stat.title}</p><h3 className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</h3></div><div className={`p-2 rounded-lg ${stat.color} text-white`}><stat.icon size={24} /></div></div>
                    <div className="mt-3"><span className={`text-xs font-medium ${stat.change.includes('+') ? 'text-green-600' : 'text-[#de0000]'}`}>{stat.change}</span><span className="text-xs text-gray-400 ml-1">vs 上週</span></div>
                </div>
            ))}
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4">選品黃金比例</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[{l:'3C 門面',p:'10%',c:'bg-gray-700',i:Smartphone},{l:'eSIM 旅遊',p:'15%',c:'bg-[#0096e1]',i:Plane},{l:'美妝保健',p:'45%',c:'bg-pink-500',i:Sparkles},{l:'零食引流',p:'30%',c:'bg-[#fcc800]',i:Candy}].map((item,i)=>(
                    <div key={i} className="relative rounded-lg p-4 border border-gray-100 overflow-hidden"><div className={`absolute top-0 right-0 p-2 opacity-10 ${item.c} rounded-bl-xl`}><item.i size={40}/></div><div className="flex items-center gap-2 mb-2"><div className={`w-2 h-2 rounded-full ${item.c}`}></div><span className="font-semibold text-gray-700">{item.l}</span></div><div className="text-3xl font-bold text-gray-900">{item.p}</div></div>
                ))}
            </div>
        </div>
    </div>
);

const StrategyView = ({ isPro, setShowUpgrade }) => {
    const [inputMode, setInputMode] = useState('text'); 
    const [textInput, setTextInput] = useState('');
    const [images, setImages] = useState([]); 
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);
    const resultRef = useRef(null);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            Promise.all(files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            })).then(results => {
                setImages(prev => [...prev, ...results]);
                setResult(''); 
            }).catch(err => console.error("讀取圖片失敗", err));
        }
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleAction = async () => {
        if (inputMode === 'image' && !isPro) {
            setShowUpgrade(true);
            return;
        }

        if (inputMode === 'text' && !textInput.trim()) { setError("請貼上商品數據"); return; }
        if (inputMode === 'image' && images.length === 0) { setError("請至少選一張截圖"); return; }

        setLoading(true);
        setError('');
        try {
            const input = inputMode === 'text' ? textInput : images;
            const text = await callGeminiAPI(input, SELECTION_PROMPT, inputMode === 'image');
            setResult(text);
            
            setTimeout(() => {
                resultRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
            
        } catch (err) {
            setError("分析失敗：" + (err.message || "請檢查網路"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-100">
                    <button 
                        onClick={() => setInputMode('image')} 
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${inputMode === 'image' ? 'bg-blue-50 text-[#0096e1] border-b-2 border-[#0096e1]' : 'text-gray-400'}`}
                    >
                        <ImageIcon size={18} /> 截圖分析
                        {!isPro && <Lock size={14} className="text-gray-400"/>}
                    </button>
                    <button 
                        onClick={() => setInputMode('text')} 
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${inputMode === 'text' ? 'bg-blue-50 text-[#0096e1] border-b-2 border-[#0096e1]' : 'text-gray-400'}`}
                    >
                        <FileText size={18} /> 文字貼上
                    </button>
                </div>

                <div className="p-6 relative">
                    {inputMode === 'image' && !isPro && (
                        <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-6">
                            <div className="bg-blue-100 p-4 rounded-full mb-4"><Lock size={32} className="text-[#0096e1]"/></div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Pro 會員專屬</h3>
                            <p className="text-gray-500 mb-6 max-w-xs">解鎖 AI 截圖分析，一秒讀懂選品！<br/>(文字模式可免費使用)</p>
                            <button onClick={() => setShowUpgrade(true)} className="bg-[#0096e1] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#0077b6] shadow-lg flex items-center gap-2">
                                <Crown size={18} className="text-[#fcc800] fill-[#fcc800]"/> 立即訂閱 (每月 $688)
                            </button>
                        </div>
                    )}

                    {inputMode === 'text' ? (
                        <div className="space-y-2">
                            <textarea 
                                value={textInput} 
                                onChange={(e) => setTextInput(e.target.value)} 
                                placeholder="直接貼上 Excel 或後台商品數據...&#10;例如：&#10;UNIQMAN 瑪卡 - 訂單 50 - 點擊 500&#10;SKINTIFIC 泥膜 - 訂單 30" 
                                className="w-full h-48 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0096e1] outline-none resize-none text-base" 
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div 
                                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center active:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => isPro && fileInputRef.current.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                                <div className="text-gray-400 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                        <Upload size={24} />
                                    </div>
                                    <p className="font-bold text-gray-600">點此上傳後台截圖</p>
                                    <p className="text-xs opacity-70">支援多張選取 (手機相簿)</p>
                                </div>
                            </div>
                            
                            {images.length > 0 && (
                                <div className="flex gap-3 overflow-x-auto pb-2 px-1">
                                    {images.map((img, index) => (
                                        <div key={index} className="relative flex-shrink-0 w-24 h-24">
                                            <img src={img} alt={`upload-${index}`} className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm" />
                                            <button 
                                                onClick={() => removeImage(index)} 
                                                className="absolute -top-2 -right-2 bg-[#de0000] text-white p-1 rounded-full shadow-md"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <div className="mt-4 p-3 bg-red-50 border border-red-100 text-[#de0000] rounded-lg flex items-center gap-2 text-sm"><AlertCircle size={16} /> {error}</div>}

                    <button 
                        onClick={handleAction} 
                        disabled={loading} 
                        className={`w-full mt-6 py-4 rounded-xl font-bold text-white text-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 ${loading ? 'bg-gray-400' : 'bg-[#0096e1] hover:bg-[#0077b6]'}`}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} className="fill-white/20"/>} 
                        {loading ? 'AI 分析選品中...' : '開始智能分析 & 建議'}
                    </button>
                </div>
            </div>

            {result && (
                <div ref={resultRef} className="bg-white rounded-2xl border border-blue-100 shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-[#005b8a] flex items-center gap-2">
                            <Sparkles className="text-[#0096e1]" size={20}/> 選品分析報告
                        </h3>
                        <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs bg-white text-[#0096e1] px-3 py-1.5 rounded-lg border border-blue-200 font-bold flex items-center gap-1">
                            <Copy size={12}/> 複製
                        </button>
                    </div>
                    <div className="p-6 prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {result}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [isPro, setIsPro] = useState(false);

    useEffect(() => {
        const storedPro = localStorage.getItem('shopee_pro_status');
        if (storedPro === 'true') setIsPro(true);
    }, []);

    const handleUpgrade = () => {
        setIsPro(true);
        localStorage.setItem('shopee_pro_status', 'true');
    };

    return (
        <div className="min-h-screen flex bg-[#f8fafc] font-sans text-slate-900">
            <UpgradeModal show={showUpgrade} onClose={() => setShowUpgrade(false)} onUpgrade={handleUpgrade} />
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} isPro={isPro} setShowUpgrade={setShowUpgrade} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 justify-between sticky top-0 z-10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-gray-500 p-2 -ml-2 active:bg-gray-100 rounded-lg"><Menu size={24} /></button>
                        <h1 className="text-lg font-bold text-gray-800">
                            {activeTab === 'dashboard' ? '總覽儀表板' : '選品分析建議'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isPro && <button onClick={() => setShowUpgrade(true)} className="bg-[#fcc800] text-black text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm hover:bg-[#e6b600]"><Crown size={12}/> 升級</button>}
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 lg:p-6">
                    <div className="max-w-3xl mx-auto">
                        {activeTab === 'dashboard' && <Dashboard isPro={isPro} setShowUpgrade={setShowUpgrade} />}
                        {activeTab === 'strategy' && <StrategyView isPro={isPro} setShowUpgrade={setShowUpgrade} />}
                    </div>
                </main>
            </div>
        </div>
    );
}
