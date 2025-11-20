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

// API Key 已移至後端，此處留空即可
const SYSTEM_API_KEY = ""; 

// 🔴 您的綠界「定期定額」付款連結
const PAYMENT_LINK = "https://p.ecpay.com.tw/E149ADE"; 

// 開通碼設定
const VALID_CODES = ['VIP688', 'PRO2025', 'BROTHERG'];

const AFFILIATE_CONFIG = {
    shopee: {
        url: "https://collshp.com/brotherg?view=storefront", 
        title: "🔥 BROTHER G 嚴選貨源",
        desc: "高利潤選品清單"
    },
    agoda: {
        url: "https://www.agoda.com/", 
        title: "✈️ 旅遊分潤計畫",
        desc: "訂房最高省 15%"
    }
};

// --- 系統提示詞 ---
const SYSTEM_PROMPT_TEXT = `你現在是我的「蝦皮直播首席選品官」。我們經營三個蝦皮直播帳號，核心策略是「掛播時長 + 精準選品結構」。

【核心排序演算法】
請依照以下優先級決定商品的上架順序 (Ranking)：
1. **絕對主力 (Tier 1)**：有「訂單產出」且「點擊數高」的商品。
2. **流量門面 (Tier 2)**：高單價 3C ($3,000+)，點擊數極高但轉化低。穿插排在 **第 6, 10, 15 格**。
3. **利潤收割 (Tier 3)**：美妝/保健/eSIM，單價 $200-$900，穩定出單。排在 **第 6-50 格**。
4. **淘汰區 (Drop)**：點擊數 < 10 且 0 訂單。建議下架。

請根據數據進行分析。`;

const SELECTION_PROMPT = `請根據提供的數據（文字或圖片），幫我規劃「明天直播的選品清單」。

針對新手賣家，請給出最穩健的 100 格商品建議。
請嚴格依照以下順序排列輸出，直接給我結果：

**【第 1 - 10 格：黃金成交區】** (請放今天表現最好的 A 級品 + 1 個超強 3C 門面)
1. [商品名] - [理由：例如 今日訂單王]
...

**【第 11 - 30 格：利潤主力區】** (重點放美妝/保健/eSIM，穿插 2-3 個零食引流)
- 請列出具體商品名稱與建議價格。

**【第 31 - 100 格：結構填充區】**
- 簡述這區塊要放哪些類別的 B 級品或新測品，以維持直播間豐富度。

**【建議淘汰名單】**
- 明確指出哪些商品明天不要再上了，浪費格子。`;

// --- API 呼叫函數 (修正版：透過 Netlify Backend) ---
const callGeminiAPI = async (apiKey, input, promptText, isImage = false) => {
    // 改成調用 Netlify Function (解決 CORS 問題)
    const url = '/.netlify/functions/gemini-proxy';
    
    let payload = {};

    if (isImage) {
        // 圖片模式：準備 base64 陣列
        // 前端這裡做處理，確保傳送的是乾淨的 Base64 或者是 DataURL，後端都支援
        const imageArray = Array.isArray(input) ? input : [input];
        // 這裡我們保留完整的 DataURL (data:image/...) 交給後端處理，或者前端切掉都可以
        // 為了保險，我們依照後端邏輯，直接傳送
        payload = {
            images: imageArray, 
            prompt: promptText,
            systemPrompt: SYSTEM_PROMPT_TEXT
        };
    } else {
        // 文字模式
        payload = {
            prompt: promptText + `\n\n【用戶提供的商品數據】：\n${input}`,
            systemPrompt: SYSTEM_PROMPT_TEXT,
            images: [] // 傳空陣列確保格式正確
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            // 嘗試解析 JSON 錯誤
            try {
                const errJson = JSON.parse(errorText);
                throw new Error(errJson.error || errJson.details || errorText);
            } catch (e) {
                throw new Error(errorText || `Server error: ${response.status}`);
            }
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        return data.response;
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
};

// --- 💎 升級彈窗 (訂閱制模式) ---
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
                
                {/* Header */}
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

// --- 側邊欄 (手機版優化) ---
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

// --- 儀表板 ---
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

// --- 選品策略視圖 ---
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
        // 圖片模式：鎖住！需升級
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
            const text = await callGeminiAPI(SYSTEM_API_KEY, input, SELECTION_PROMPT, inputMode === 'image');
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

            {/* 結果顯示區塊 */}
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

// --- 主應用 ---
export default function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);
    // 恢復預設為 false (鎖住圖片功能)
    const [isPro, setIsPro] = useState(false);

    useEffect(() => {
        // 讀取本地訂閱狀態
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
