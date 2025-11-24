// public/js/firebase-store.js
// Firebase Firestore 用戶資料管理模組（與 auth.js 配合使用）

// 等待 auth.js 載入後再初始化
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

  // 🧩 登入後建立/更新用戶紀錄
  window.ensureUserRecord = async function(user) {
    if (!user || !user.email) {
      console.warn('⚠️ ensureUserRecord: 無用戶 email');
      return null;
    }
    
    try {
      const userRef = db.collection('users').doc(user.email);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        // 初次登入 → 新增為 FREE 用戶
        const today = new Date().toISOString().slice(0, 10);
        await userRef.set({
          tier: 'FREE',
          quota: 5,
          usedToday: 0,
          lastReset: today,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ 新用戶已建立:', user.email);
        return { tier: 'FREE', quota: 5, usedToday: 0, lastReset: today };
      } else {
        // 檢查是否需要重置每日配額
        const data = userDoc.data();
        const today = new Date().toISOString().slice(0, 10);
        
        if (data.lastReset !== today) {
          await userRef.update({
            usedToday: 0,
            lastReset: today,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          data.usedToday = 0;
          data.lastReset = today;
          console.log('✅ 每日配額已重置:', user.email);
        }
        
        return data;
      }
    } catch (error) {
      console.error('❌ ensureUserRecord 錯誤:', error);
      return null;
    }
  };

  // 🧩 取得用戶 tier
  window.getUserTier = async function(email) {
    if (!email) return 'FREE';
    
    try {
      const userRef = db.collection('users').doc(email);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) return 'FREE';
      
      const data = userDoc.data();
      return data.tier || 'FREE';
    } catch (error) {
      console.error('❌ getUserTier 錯誤:', error);
      return 'FREE';
    }
  };

  // 🧩 取得用戶完整資料
  window.getUserData = async function(email) {
    if (!email) return null;
    
    try {
      const userRef = db.collection('users').doc(email);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) return null;
      
      const data = userDoc.data();
      // 檢查是否需要重置
      const today = new Date().toISOString().slice(0, 10);
      if (data.lastReset !== today) {
        await userRef.update({
          usedToday: 0,
          lastReset: today,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        data.usedToday = 0;
        data.lastReset = today;
      }
      
      return data;
    } catch (error) {
      console.error('❌ getUserData 錯誤:', error);
      return null;
    }
  };

  // 🧩 檢查配額（前端檢查，實際扣減在後端）
  window.checkQuota = async function(email) {
    if (!email) return { canUse: false, remaining: 0, tier: 'FREE' };
    
    try {
      const userData = await window.getUserData(email);
      if (!userData) return { canUse: false, remaining: 0, tier: 'FREE' };
      
      const limit = userData.tier === 'PRO' ? 20 : 5;
      const remaining = Math.max(0, limit - (userData.usedToday || 0));
      const canUse = remaining > 0;
      
      return {
        canUse,
        remaining,
        tier: userData.tier,
        usedToday: userData.usedToday || 0,
        quota: limit
      };
    } catch (error) {
      console.error('❌ checkQuota 錯誤:', error);
      return { canUse: false, remaining: 0, tier: 'FREE' };
    }
  };

  console.log('📦 Firebase Store 模組已載入');
})();
