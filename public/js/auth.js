// public/js/auth.js
// BrotherG AI - 全站共用 Firebase 登入模組

// Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyCbxeHkWKphUTUw4iQXuLvYgRsmjQOQYeg",
  authDomain: "brotherg.ai",
  projectId: "brothergai-699d2",
  storageBucket: "brothergai-699d2.firebasestorage.app",
  messagingSenderId: "688590180498",
  appId: "1:688590180498:web:2e8f650e71cc12f757164b",
  measurementId: "G-5Z6Y84LTRL"
};

// 初始化 Firebase（避免重複初始化）
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// 全局變數
let currentUser = null;

// 監聽登入狀態
auth.onAuthStateChanged(user => {
  currentUser = user || null;
  updateAuthUI(user);
  
  // 觸發自定義事件
  window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
  
  if (user) {
    console.log('✅ 已登入:', user.displayName || user.email);
    // 保存到 localStorage
    localStorage.setItem('userId', user.uid);
    localStorage.setItem('userData', JSON.stringify({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL
    }));
    
    // 確保 Firestore 中有用戶紀錄（使用 uid 作為 docId）
    if (typeof window.ensureUserRecord === 'function') {
      window.ensureUserRecord(user).then(userData => {
        if (userData) {
          console.log('📊 用戶資料已同步:', userData);
          // 觸發更新事件
          window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: { user, userData } }));
          
          // 初始化 Shopee 頁面 UI
          if (typeof initShopeePage === 'function') {
            initShopeePage(user);
          }
        }
      }).catch(err => {
        console.error('❌ 同步用戶資料失敗:', err);
      });
    }
  } else {
    console.log('⚪ 未登入');
    localStorage.removeItem('userId');
    localStorage.removeItem('userData');
    localStorage.removeItem('userPlan'); // 清除舊的 plan
  }
});

// 更新 UI
function updateAuthUI(user) {
  const avatar = document.getElementById('user-avatar');
  const avatarHeader = document.getElementById('user-avatar-header');
  const logoutBtn = document.getElementById('logout-btn');
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');
  const userName = document.getElementById('user-name');

  if (user) {
    const name = user.displayName || user.email || 'User';
    
    // 更新所有可能的頭像元素
    [avatar, avatarHeader].forEach(av => {
      if (av) {
        if (user.photoURL) {
          av.style.backgroundImage = `url(${user.photoURL})`;
          av.style.backgroundSize = 'cover';
          av.style.backgroundPosition = 'center';
          av.textContent = '';
        } else {
          av.textContent = name.charAt(0).toUpperCase();
          av.style.backgroundImage = '';
        }
        av.title = name;
        av.classList.remove('hidden');
      }
    });
    
    if (userName) userName.textContent = name;
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (loginBtn) loginBtn.classList.add('hidden');
    if (userInfo) userInfo.classList.remove('hidden');
    
  } else {
    if (avatar) avatar.classList.add('hidden');
    if (avatarHeader) avatarHeader.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (userInfo) userInfo.classList.add('hidden');
  }
  
  // 觸發自定義事件，讓其他頁面也能更新 UI
  window.dispatchEvent(new CustomEvent('authUIUpdated', { detail: { user } }));
}

// Google 登入
window.handleGoogleLogin = async function() {
  const btn = document.getElementById('login-btn') || document.getElementById('login-btn-modal');
  
  try {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 驗證中...';
      btn.disabled = true;
    }

    const result = await auth.signInWithPopup(provider);
    const user = result.user;

    // 隱藏登入視窗
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (typeof showToast === 'function') {
      showToast(`${user.displayName || '用戶'} 登入成功！`);
    }

    // 確保 Firestore 中有用戶紀錄（如果 firebase-store.js 已載入）
    if (typeof window.ensureUserRecord === 'function') {
      window.ensureUserRecord(user).then(userData => {
        if (userData) {
          console.log('📊 用戶資料已同步:', userData);
          // 觸發更新事件
          window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: { user, userData } }));
        }
      }).catch(err => {
        console.error('❌ 同步用戶資料失敗:', err);
      });
    }

    return user;

  } catch (err) {
    console.error('Google 登入失敗', err);
    if (typeof showToast === 'function') {
      let errorMsg = '登入失敗';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMsg = '登入已取消';
      } else if (err.code === 'auth/popup-blocked') {
        errorMsg = '彈出視窗被阻擋，請允許彈出視窗';
      } else if (err.message) {
        errorMsg = err.message;
      }
      showToast(errorMsg);
    }
    throw err;

  } finally {
    if (btn) {
      const btnText = btn.id === 'login-btn-modal' ? '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-5 h-5" alt="Google"><span>使用 Google 帳號登入</span>' : '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-4 h-4" alt="Google"><span>登入</span>';
      btn.innerHTML = btnText;
      btn.disabled = false;
    }
  }
};

// 登出
window.handleLogout = async function() {
  try {
    await auth.signOut();
    if (typeof showToast === 'function') {
      showToast('已安全登出');
    }
  } catch (err) {
    console.error('登出失敗', err);
    if (typeof showToast === 'function') {
      showToast('登出失敗');
    }
  }
};

// 顯示登入視窗
window.showLoginModal = function() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.classList.remove('hidden');
};

// 工具函數
window.isLoggedIn = () => !!currentUser;
window.getCurrentUser = () => currentUser;
window.getIdToken = async () => currentUser ? await currentUser.getIdToken() : null;

console.log('🔐 BrotherG Auth 模組已載入');

