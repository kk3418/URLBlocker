#!/bin/bash
# setup.sh - 將 Web Extension 轉換為 Safari Xcode 專案，或說明 Chrome 載入方式

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/web-extension"
OUTPUT_DIR="$SCRIPT_DIR"
APP_NAME="URLBlocker"

echo "======================================"
echo "  URL Blocker Extension 設定"
echo "======================================"
echo ""
echo "請選擇目標瀏覽器："
echo "  1) Safari (macOS + iOS) - 需要 Xcode"
echo "  2) Chrome - 直接載入，不需要 Xcode"
echo ""
read -p "輸入選項 (1/2): " browser_choice

# ─── Chrome ───────────────────────────────────────────────
if [[ "$browser_choice" == "2" ]]; then
  echo ""
  echo "======================================"
  echo "  Chrome 載入方式"
  echo "======================================"
  echo ""
  echo "步驟："
  echo "  1. 開啟 Chrome，網址列輸入： chrome://extensions"
  echo "  2. 右上角開啟「開發人員模式」"
  echo "  3. 點擊「載入未封裝項目」"
  echo "  4. 選擇以下資料夾："
  echo "     $EXTENSION_DIR"
  echo ""
  echo "✅ 完成！每次修改程式碼後，在 chrome://extensions 按重新整理即可。"
  echo ""
  exit 0
fi

# ─── Safari (Xcode) ───────────────────────────────────────
if [[ "$browser_choice" != "1" ]]; then
  echo "無效選項，結束。"
  exit 1
fi

# 檢查 Xcode 是否安裝
if ! command -v xcrun &> /dev/null; then
  echo "❌ 錯誤：找不到 xcrun"
  echo "   請先從 App Store 安裝 Xcode"
  exit 1
fi

if ! xcrun --find safari-web-extension-converter &> /dev/null; then
  echo "❌ 錯誤：找不到 safari-web-extension-converter"
  echo "   請確認已安裝完整版 Xcode（非僅 Command Line Tools）"
  echo "   下載地址：https://apps.apple.com/app/xcode/id497799835"
  exit 1
fi

echo "✅ Xcode 檢查通過"

# 確認 Extension 目錄存在
if [ ! -f "$EXTENSION_DIR/manifest.json" ]; then
  echo "❌ 找不到 web-extension/manifest.json"
  exit 1
fi

echo "✅ Web Extension 原始檔案檢查通過"

# 若目標目錄已存在，詢問是否覆蓋
if [ -d "$OUTPUT_DIR/$APP_NAME" ]; then
  read -p "⚠️  目錄 $APP_NAME 已存在，是否覆蓋？(y/N) " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "取消操作"
    exit 0
  fi
  rm -rf "$OUTPUT_DIR/$APP_NAME"
fi

echo ""
echo "🔄 正在轉換 Web Extension 為 Safari Xcode 專案（macOS + iOS）..."
echo ""

# 執行轉換（不加 --ios-only，同時支援 macOS 和 iOS）
xcrun safari-web-extension-converter \
  "$EXTENSION_DIR" \
  --project-location "$OUTPUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "com.urlblocker.URLBlocker.Extension" \
  --swift \
  --no-open \
  --force

echo ""
echo "======================================"
echo "✅ 轉換完成！"
echo "======================================"
echo ""
echo "專案位置：$OUTPUT_DIR/$APP_NAME/"
echo ""
echo "後續步驟："
echo "  1. 開啟 $APP_NAME/$APP_NAME.xcodeproj"
echo "  2. 在 Xcode 中設定您的 Apple 開發者帳號"
echo "     （Signing & Capabilities → Team）"
echo ""
echo "  ▶ 測試 macOS Safari："
echo "     - 選擇 My Mac 作為執行目標"
echo "     - 點擊 Run (▶) 建置並安裝"
echo "     - Safari → 設定 → 延伸功能 → URL Blocker → 啟用"
echo ""
echo "  ▶ 測試 iOS/iPad："
echo "     - 選擇 iOS 模擬器或實體裝置"
echo "     - 點擊 Run (▶) 建置並安裝"
echo "     - 設定 → Safari → 擴充功能 → URL Blocker → 啟用"
echo ""
echo "提示：若要在實體裝置上測試，需要 Apple Developer 帳號"
echo ""
