// public/js/firebase-store.js
// Firebase Firestore 用戶資料管理模組（統一使用 uid 作為 docId，tier 為小寫）

(function() {
  // 檢查 Firebase 是否已初始化
  if (typeof firebase === 'undefined') {
    console.warn('⚠️ Firebase 尚未載入，請先載入 firebase-app-compat.js 和 firebase-auth-compat.js');
    return;
  }

  // Firebase 配置（與 auth.js 共用）
  const firebaseConfig = {
    apiKey: "AIzaSyCbxeHkWKphUTUw4iQXuLvYgRsmjQOQYeg",
    authDomain: "brothergai-699d2.firebaseapp.com",
    projectId: "brothergai-699d2",
    storageBucket: "brothergai-699d2.firebasestorage.app",
    messagingSenderId: "688590180498",
    appId: "1:688590180498:web:2e8f650e71cc12f757164b",
    measurementId: "G-5Z6Y84LTRL"
  };

  // 初始化 Firebase（如果還沒初始化）
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.firestore();

  // 取得今日日期字串（台灣當地日期，格式 YYYY-MM-DD）
  window.getTodayKey = function() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // ★ 取得每日配額上限（依 tier，與 PLAN_CONFIG 同步）
  const PLAN_CONFIG = {
    guest:  { dailyLimit: 1 },
    free:   { dailyLimit: 5 },
    basic:  { dailyLimit: 5 },  // 向後兼容
    pro:    { dailyLimit: 20 },
    master: { dailyLimit: 50 },
  };

  window.getDailyLimitForTier = function(tier) {
    return PLAN_CONFIG[tier]?.dailyLimit || PLAN_CONFIG.free.dailyLimit;
  };

  // 🧩 建立或取得 user 記錄（使用 uid 作為 docId）
  window.ensureUserRecord = async function(user) {
    if (!user || !user.uid) {
      console.warn('⚠️ ensureUserRecord: 無用戶 uid');
      return null;
    }

    try {
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      const todayKey = window.getTodayKey();

      if (!userDoc.exists) {
        // 新用戶 → 建立為 basic
        const data = {
          email: user.email || "",
          displayName: user.displayName || "",
          tier: "basic",          // 新用戶預設 basic（小寫）
          usedToday: 0,
          lastUsageDate: todayKey,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await userRef.set(data);
        console.log('✅ 新用戶已建立:', user.uid, data);
        return { id: userRef.id, ...data };
      } else {
        // 已存在：檢查是否需要重置當日用量
        const data = userDoc.data();
        const lastUsageDate = data.lastUsageDate || todayKey;

        if (lastUsageDate !== todayKey) {
          // 需要重置
          await userRef.update({
            usedToday: 0,
            lastUsageDate: todayKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          data.usedToday = 0;
          data.lastUsageDate = todayKey;
          console.log('✅ 每日配額已重置:', user.uid);
        }

        // 確保 tier 是小寫（向後兼容）
        if (data.tier) {
          data.tier = data.tier.toLowerCase();
        }

        return { id: userRef.id, ...data };
      }
    } catch (error) {
      console.error('❌ ensureUserRecord 錯誤:', error);
      return null;
    }
  };

  // 🧩 取得 tier + 今日剩餘次數
  window.getUserTierAndCredits = async function(user) {
    if (!user || !user.uid) {
      return { tier: "basic", remaining: 0, baseLimit: 5, usedToday: 0 };
    }

    const record = await window.ensureUserRecord(user);
    if (!record) {
      return { tier: "basic", remaining: 0, baseLimit: 5, usedToday: 0 };
    }

    let tier = (record.tier || "basic").toLowerCase();

    // 🔒 master 目前不開放，邏輯當作 pro 處理
    if (tier === 'master') {
      tier = 'pro';
    }

    const usedToday = record.usedToday || 0;
    const baseLimit = window.getDailyLimitForTier(tier);
    const remaining = Math.max(baseLimit - usedToday, 0);

    return { tier, remaining, baseLimit, usedToday };
  };

  // 🧩 更新用量到 Firestore（只更新用量，不改 tier）
  window.updateUsageInFirestore = async function(uid, usedToday) {
    if (!uid) {
      console.warn('⚠️ updateUsageInFirestore: 無 uid');
      return;
    }

    try {
      const userRef = db.collection('users').doc(uid);
      const todayKey = window.getTodayKey();

      await userRef.update({
        usedToday: usedToday,
        lastUsageDate: todayKey,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ 用量已更新:', uid, `(${usedToday})`);
    } catch (error) {
      console.error('❌ updateUsageInFirestore 錯誤:', error);
    }
  };

  // 🧩 向後兼容：舊的函數名稱
  window.consumeOneCredit = async function(user) {
    if (!user || !user.uid) {
      console.warn('⚠️ consumeOneCredit: 無用戶 uid');
      return;
    }

    try {
      const { usedToday } = await window.getUserTierAndCredits(user);
      await window.updateUsageInFirestore(user.uid, usedToday + 1);
    } catch (error) {
      console.error('❌ consumeOneCredit 錯誤:', error);
    }
  };

  window.getUserTier = async function(user) {
    const result = await window.getUserTierAndCredits(user || window.getCurrentUser?.());
    return result.tier || 'basic';
  };

  window.getUserData = async function(user) {
    if (!user || !user.uid) {
      return null;
    }
    const record = await window.ensureUserRecord(user);
    return record;
  };

  window.checkQuota = async function(user) {
    if (!user || !user.uid) {
      return { canUse: false, remaining: 0, tier: 'basic' };
    }
    const result = await window.getUserTierAndCredits(user);
    return {
      canUse: result.remaining > 0,
      remaining: result.remaining,
      tier: result.tier,
      usedToday: result.usedToday || 0,
      quota: result.baseLimit
    };
  };

  console.log('📦 Firebase Store 模組已載入（使用 uid 作為 docId，tier 為小寫）');
})();
