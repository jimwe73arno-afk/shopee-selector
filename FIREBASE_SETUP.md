# Firebase Authentication 設定指南

## 1. 建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 點擊「新增專案」
3. 輸入專案名稱（例如：`brotherg-shopee`）
4. 完成專案建立

## 2. 啟用 Google 登入

1. 在 Firebase Console 中，進入「Authentication」
2. 點擊「開始使用」
3. 在「登入方法」標籤中，啟用「Google」
4. 輸入專案支援電子郵件
5. 儲存設定

## 3. 取得 Firebase 配置

1. 在 Firebase Console 中，點擊專案設定（齒輪圖示）
2. 向下滾動到「您的應用程式」區塊
3. 選擇「Web」應用程式（如果還沒有，點擊「新增應用程式」）
4. 複製 Firebase 配置物件

## 4. 設定授權網域

1. 在 Firebase Console 中，進入「Authentication」>「設定」
2. 在「授權網域」區塊中，新增：
   - `monumental-taiyaki-e878bd.netlify.app`
   - `localhost`（用於本地開發）

## 5. 更新程式碼

將 Firebase 配置更新到 `public/index.html` 中的 `firebaseConfig` 物件：

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

## 6. 環境變數（可選）

如果需要保護 API Key，可以將配置放在 Netlify 環境變數中，並透過後端函數提供。

