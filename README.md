# URL Blocker — Safari Extension

一個用於 Safari（iOS / iPadOS）的網址封鎖擴充功能，透過 `declarativeNetRequest` 動態規則將指定網站重定向至自訂封鎖頁面，保護使用者免受干擾或不當內容。

---

## 功能特色

| 功能 | 說明 |
|---|---|
| 子域名匹配 | `example.com` 自動匹配 `www.example.com`、`api.example.com` 等子域名 |
| 路徑封鎖 | 支援精確路徑（如 `youtube.com/shorts`） |
| 延遲移除 | 刪除時設定 5 小時緩衝，並顯示倒計時 |
| 取消復原 | 點擊 ⟲ 可在 5 小時內取消刪除 |

---

## 專案結構

```
develop-safari-plugin/
├── setup.sh                      # 一鍵轉換為 Xcode 專案的腳本
└── web-extension/
    ├── manifest.json             # Manifest V3 設定
    ├── background.js             # Service Worker：管理規則與排程移除
    ├── content.js                # Content Script：備援封鎖覆蓋層
    ├── blocked/
    │   ├── blocked.html          # 封鎖頁面 UI
    │   └── blocked.js            # 封鎖頁面邏輯
    ├── popup/
    │   ├── popup.html            # 擴充功能 Popup UI
    │   └── popup.js              # Popup 邏輯（新增、刪除、開關）
    └── images/
        ├── generate_icons.py     # 圖示批量生成腳本
        └── icon-{16,32,48,128}.png
```

---

## 技術架構

### 封鎖機制

1. **主要機制**：`declarativeNetRequest` 動態規則
   - 使用 `urlFilter` 格式（如 `||example.com^`）比對請求
   - 觸發時重定向至 `blocked/blocked.html?url=<原始網址>`

2. **備援機制**：`content.js` 在每個頁面載入時（`document_start`）
   - 向 background 查詢當前 URL 是否在封鎖清單
   - 若是，則覆蓋頁面顯示封鎖訊息

### URL 過濾規則

```
使用者輸入         →  urlFilter
example.com       →  ||example.com^          (匹配主域名及所有子域名)
www.example.com   →  ||example.com^          (自動去除 www 前綴)
youtube.com/shorts →  ||youtube.com/shorts*  (精確路徑封鎖)
```

### 延遲移除流程

```
使用者點擊刪除
  → 記錄 removalTime = 現在 + 5小時
  → 存入 storage.pendingRemovals
  → background 每 10 秒檢查是否到期
  → 到期後自動移除並同步規則
```

### 資料儲存（`browser.storage.local`）

| Key | 類型 | 說明 |
|---|---|---|
| `blockedUrls` | `string[]` | 封鎖清單 |
| `blockingEnabled` | `boolean` | 全域開關狀態 |
| `pendingRemovals` | `{ [url]: timestamp }` | 待移除項目及到期時間 |

---

## 安裝與開發

### 環境需求

- macOS 15+
- **完整 Xcode**（非僅 Command Line Tools）
- Safari 15+（支援 Manifest V3）

### 轉換為 Xcode 專案

```bash
# 方法一：使用腳本
./setup.sh

# 方法二：手動執行
xcrun safari-web-extension-converter web-extension/ \
  --project-location . \
  --app-name URLBlocker \
  --bundle-identifier com.urlblocker.safari \
  --swift \
  --ios-only \
  --no-open \
  --force
```

### 在模擬器測試

1. 使用 Xcode 開啟產生的 `URLBlocker.xcodeproj`
2. 選擇 iPad 模擬器作為目標裝置
3. 點擊 Run（⌘R）
4. 在模擬器的 Safari 中，前往「設定 → Safari → 擴充功能」啟用 URL Blocker
5. 點擊 Safari 工具列的擴充功能圖示開啟 Popup

---

## 使用方式

1. **新增封鎖**：在輸入框輸入網址（如 `example.com`），按下「+」或 Enter
2. **移除封鎖**：點擊清單項目右側的 ✕，會進入 5 小時待移除倒計時
3. **取消移除**：在倒計時期間點擊 ⟲ 按鈕即可復原
4. **暫停封鎖**：切換右上角 Toggle 至「停用」，暫時關閉所有規則
5. **關閉 Popup**：點擊右上角 ✕ 按鈕

---

## 權限說明

| 權限 | 用途 |
|---|---|
| `declarativeNetRequest` | 建立及管理封鎖規則 |
| `declarativeNetRequestFeedback` | 查詢規則觸發狀況 |
| `storage` | 儲存封鎖清單與設定 |
| `tabs` | 查詢當前分頁 URL |
| `host_permissions: <all_urls>` | 讓 Content Script 在所有頁面運行 |
