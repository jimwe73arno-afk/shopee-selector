// public/js/firebase-store.js
// Firebase Firestore 用戶資料管理模組（統一使用 uid 作為 docId）

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

  function todayString() {
    return new Date().toISOString().slice(0, 10); // e.g. "2025-11-24"
  }

  // 🧩 建立或取得 user 記錄（使用 uid 作為 docId）
  window.ensureUserRecord = async function(user) {
    if (!user || !user.uid) {
      console.warn('⚠️ ensureUserRecord: 無用戶 uid');
      return null;
    }

    try {
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // 新用戶 → 建立為 FREE
        const data = {
          email: user.email || "",
          displayName: user.displayName || "",
          tier: "FREE",          // FREE / PRO （MASTER 先關閉）
          dailyLimitFree: 5,     // Basic 每天 5 次
          dailyLimitPro: 20,     // Pro 每天 20 次
          usedToday: 0,
          lastResetDate: todayString(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await userRef.set(data);
        console.log('✅ 新用戶已建立:', user.uid);
        return { id: userRef.id, ...data };
      } else {
        return { id: userRef.id, ...userDoc.data() };
      }
    } catch (error) {
      console.error('❌ ensureUserRecord 錯誤:', error);
      return null;
    }
  };

  // 🧩 取得 tier + 今日剩餘次數
  window.getUserTierAndCredits = async function(user) {
    if (!user || !user.uid) {
      return { tier: "FREE", remaining: 0, baseLimit: 5 };
    }

    const record = await window.ensureUserRecord(user);
    if (!record) {
      return { tier: "FREE", remaining: 0, baseLimit: 5 };
    }

    let tier = record.tier || "FREE";

    // 🔒 不管資料裡是不是 MASTER，前端一律當 PRO 使用，避免跑進未完成功能
    if (tier === "MASTER") {
      tier = "PRO";
      console.warn('⚠️ 偵測到 MASTER tier，前端自動降級為 PRO');
    }

    let usedToday = record.usedToday || 0;
    let lastResetDate = record.lastResetDate;

    // 檢查是否需要重置每日配額
    if (lastResetDate !== todayString()) {
      usedToday = 0;
      lastResetDate = todayString();
      try {
        await db.collection('users').doc(user.uid).update({
          usedToday: 0,
          lastResetDate: todayString(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log('✅ 每日配額已重置:', user.uid);
      } catch (error) {
        console.error('❌ 重置配額失敗:', error);
      }
    }

    const baseLimit = tier === "PRO"
      ? (record.dailyLimitPro || 20)
      : (record.dailyLimitFree || 5);

    const remaining = Math.max(baseLimit - usedToday, 0);

    return { tier, remaining, baseLimit, usedToday };
  };

  // 🧩 成功分析一次後呼叫，扣掉一次額度
  window.consumeOneCredit = async function(user) {
    if (!user || !user.uid) {
      console.warn('⚠️ consumeOneCredit: 無用戶 uid');
      return;
    }

    try {
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.warn('⚠️ 用戶記錄不存在，無法扣減配額');
        return;
      }

      let data = userDoc.data();
      let usedToday = data.usedToday || 0;
      let lastResetDate = data.lastResetDate;

      // 檢查是否需要重置每日配額
      if (lastResetDate !== todayString()) {
        usedToday = 0;
        lastResetDate = todayString();
      }

      usedToday += 1;

      await userRef.update({
        usedToday: usedToday,
        lastResetDate: lastResetDate,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ 配額已扣減:', user.uid, `(${usedToday}/${data.tier === 'PRO' ? 20 : 5})`);
    } catch (error) {
      console.error('❌ consumeOneCredit 錯誤:', error);
    }
  };

  // 🧩 向後兼容：舊的函數名稱
  window.getUserTier = async function(user) {
    const result = await window.getUserTierAndCredits(user || window.getCurrentUser?.());
    return result.tier || 'FREE';
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
      return { canUse: false, remaining: 0, tier: 'FREE' };
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

  console.log('📦 Firebase Store 模組已載入（使用 uid 作為 docId）');
})();
