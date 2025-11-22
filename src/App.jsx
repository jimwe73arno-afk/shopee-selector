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

// API Key 已移至後端
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

// --- 📝 系統提示詞 (人話優化版) ---
const SYSTEM_PROMPT_TEXT = `你現在是「Brother G 直播團隊」的首席選品顧問。你的語氣要專業、自信，但像個真人夥伴一樣自然，不要像機器人。

【你的任務】
根據用戶提供的數據（圖片或文字），規劃明天的直播選品策略。

【分析原則】
1. **黃金位 (1-10格)**：只放真正的數據王牌（高轉化）和流量門面（高點擊的3C）。
2. **利潤區 (11-50格)**：安排利潤穩定的美妝、保健品、eSIM。
3. **結構區 (51-100格)**：用低價零食或B級品填補，維持豐富度。
4. **淘汰建議**：對於點擊低且無單的商品，直接建議下架。

【回答格式要求 - 非常重要】
1. **請勿使用 Markdown 表格** (不要出現 |---| 這種符號)。
2. **請勿使用過多的星號** (不要用 ** )，用自然的文字強調即可。
3. 請用「條列式」搭配「自然解說」的方式呈現。
4. 語氣範例：「我建議把 POCO X7 放在第 1 格，因為它今天的數據表現最好...」`;

const SELECTION_PROMPT = `請幫我分析這些數據，並給出「明天直播的選品建議」。

請依照以下段落輸出（請用自然的口語）：

**1. 核心數據洞察**
(請簡短點評今天表現最好的 1-2 個商品，以及整體流量狀況)

**2. 前 10 格黃金排品建議**
(請直接列出建議的商品，並用一句話告訴我為什麼這樣排)
- 第 1 格：[商品] (理由)
- 第 2 格：...

**3. 中後段結構建議**
(請告訴我 11-100 格大概怎麼擺，例如美妝放哪區、零食放哪區)

**4. 建議淘汰名單**
(請直接列出哪些商品明天不要上了，並說明原因)

請直接給我結果，像在對團隊簡報一樣清晰。`;

// --- API 呼叫函數 ---
const callGeminiAPI = async (apiKey, input, promptText, isImage = false) => {
    const url = '/.netlify/functions/gemini-proxy';
    
    let payload = {};

    if (isImage) {
        // 使用壓縮後的圖片（如果存在全域變數）
        let base64Images = [];
        
        if (window.uploadedImages && window.uploadedImages.length > 0) {
            // 使用壓縮後的圖片
            base64Images = window.uploadedImages;
        } else {
            // 回退：從 input 提取（如果是 data URL）
            const imageArray = Array.isArray(input) ? input : [input];
            base64Images = imageArray.map(img => {
                // 如果是 data URL，提取 base64 部分
                if (typeof img === 'string' && img.startsWith('data:')) {
                    return img.split(',')[1];
                }
                return img; // 如果已經是純 base64，直接返回
            });
        }
        
        payload = {
            images: base64Images, 
            prompt: promptText,
            systemPrompt: SYSTEM_PROMPT_TEXT
        };
    } else {
        payload = {
            prompt: promptText + `\n\n【用戶提供的商品數據】：\n${input}`,
            systemPrompt: SYSTEM_PROMPT_TEXT,
            images: [] 
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

// --- 輔助函數：清理文字顯示 ---
const cleanText = (text) => {
    if (!text) return '';
    // 移除 Markdown 的粗體符號 ** 和標題符號 ###，讓閱讀更乾淨
    return text.replace(/\*\*/g, '').replace(/###/g, '').replace(/\|/g, ' '); 
};

// --- 🎯 圖片壓縮函數（避免超時） ---
const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                // 創建 Canvas 壓縮
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 🎯 限制最大尺寸 1024px
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 1024;
                
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height = (height * MAX_SIZE) / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width = (width * MAX_SIZE) / height;
                        height = MAX_SIZE;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // 繪製圖片
                ctx.drawImage(img, 0, 0, width, height);
                
                // 🎯 轉 JPEG，質量 0.7（平衡質量和大小）
                canvas.toBlob(
                    (blob) => {
                        const reader2 = new FileReader();
                        reader2.onloadend = () => {
                            // 移除 data URL 前綴
                            const base64 = reader2.result.split(',')[1];
                            resolve({
                                data: base64,
                                mimeType: 'image/jpeg'
                            });
                        };
                        reader2.onerror = () => reject(new Error('Blob 讀取失敗'));
                        reader2.readAsDataURL(blob);
                    },
                    'image/jpeg',
                    0.7  // 質量參數
                );
            };
            
            img.onerror = () => reject(new Error('圖片載入失敗'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('檔案讀取失敗'));
        reader.readAsDataURL(file);
    });
};

// --- 💎 升級彈窗 ---
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
                                onClick={openPaymentWindow}
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

// --- 側邊欄 ---
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

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setLoading(true);
        setError('');
        
        try {
            console.log(`開始處理 ${files.length} 張圖片...`);
            
            const compressedImages = [];
            
            // 🎯 逐一壓縮圖片
            for (let i = 0; i < files.length; i++) {
                console.log(`壓縮第 ${i + 1}/${files.length} 張圖片...`);
                const compressed = await compressImage(files[i]);
                compressedImages.push(compressed.data); // 提取 base64 數據
            }
            
            console.log(`✅ 完成壓縮 ${compressedImages.length} 張圖片`);
            
            // 更新 UI（顯示縮圖）- 添加 data:image/jpeg;base64, 前綴用於顯示
            const previewImages = compressedImages.map(base64 => 
                'data:image/jpeg;base64,' + base64
            );
            
            setImages(prev => [...prev, ...previewImages]);
            setResult(''); 
            
            // 儲存壓縮後的圖片到全域變數（用於 API 調用）
            window.uploadedImages = compressedImages;
            
        } catch (err) {
            console.error("圖片處理失敗", err);
            setError("圖片處理失敗：" + (err.message || "請重試"));
        } finally {
            setLoading(false);
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
                        {cleanText(result)}
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
