// popup.js - Popup 頁面邏輯

// Chrome/Safari browser API 相容性
if (typeof browser === 'undefined') var browser = chrome;

const urlInput = document.getElementById('urlInput');
const addBtn = document.getElementById('addBtn');
const errorMsg = document.getElementById('errorMsg');
const listContainer = document.getElementById('listContainer');
const emptyState = document.getElementById('emptyState');
const enableToggle = document.getElementById('enableToggle');
const toggleLabel = document.getElementById('toggleLabel');

let blockedUrls = [];
let pendingRemovals = {}; // { url: removalTime }
let isEnabled = true;
let timerInterval = null;

// 初始化
async function init() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getUrls' });
    blockedUrls = response.urls || [];
    pendingRemovals = response.pendingRemovals || {};
    isEnabled = response.enabled !== false;
    enableToggle.checked = isEnabled;
    updateToggleLabel();
    renderList();
    startTimerUpdates();
  } catch (e) {
    showError('無法連接擴充功能背景程式');
  }
}

// 渲染封鎖清單
function renderList() {
  // 移除舊的列表項目（保留 emptyState）
  const items = listContainer.querySelectorAll('.url-item, .list-header');
  items.forEach(el => el.remove());

  if (blockedUrls.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'list-header';
  header.textContent = `封鎖清單 (${blockedUrls.length})`;
  listContainer.insertBefore(header, emptyState);

  blockedUrls.forEach(url => {
    const item = document.createElement('div');
    item.className = 'url-item';

    // 檢查是否待移除
    const isPending = pendingRemovals[url];
    if (isPending) {
      item.classList.add('pending');
    }

    const urlText = document.createElement('span');
    urlText.className = 'url-text';
    urlText.textContent = url;

    const removeBtn = document.createElement('button');
    removeBtn.className = isPending ? 'undo-btn' : 'remove-btn';
    removeBtn.innerHTML = isPending ? '⟲' : '&times;';
    removeBtn.title = isPending ? '取消移除' : '移除（5小時後生效）';

    if (isPending) {
      removeBtn.addEventListener('click', () => cancelRemoval(url));

      // 顯示倒計時
      const timer = document.createElement('span');
      timer.className = 'removal-timer';
      timer.textContent = formatTimeRemaining(pendingRemovals[url]);

      item.appendChild(urlText);
      item.appendChild(timer);
      item.appendChild(removeBtn);
    } else {
      removeBtn.addEventListener('click', () => removeUrl(url));
      item.appendChild(urlText);
      item.appendChild(removeBtn);
    }

    listContainer.insertBefore(item, emptyState);
  });
}

// 新增封鎖網址
async function addUrl() {
  const input = urlInput.value.trim();

  if (!input) {
    showError('請輸入網址');
    return;
  }

  if (!isValidUrl(input)) {
    showError('請輸入有效的網址（例如 example.com）');
    return;
  }

  if (blockedUrls.includes(input)) {
    showError('此網址已在封鎖清單中');
    return;
  }

  hideError();
  addBtn.disabled = true;

  try {
    await browser.runtime.sendMessage({ action: 'addUrl', url: input });
    blockedUrls.push(input);
    urlInput.value = '';
    renderList();
  } catch (e) {
    showError('新增失敗，請再試一次');
  } finally {
    addBtn.disabled = false;
  }
}

// 移除封鎖網址（延遲 3 小時）
async function removeUrl(url) {
  try {
    const removalTime = Date.now() + (3 * 60 * 60 * 1000); // 3 小時後
    pendingRemovals[url] = removalTime;

    await browser.runtime.sendMessage({
      action: 'scheduleRemoval',
      url,
      removalTime
    });

    renderList();
    showError(`${url} 將在 3 小時後被移除。點擊 ⟲ 可取消。`);
  } catch (e) {
    showError('設定失敗，請再試一次');
  }
}

// 取消待移除
async function cancelRemoval(url) {
  try {
    delete pendingRemovals[url];

    await browser.runtime.sendMessage({
      action: 'cancelRemoval',
      url
    });

    renderList();
    hideError();
  } catch (e) {
    showError('取消失敗，請再試一次');
  }
}

// 切換啟用狀態
async function toggleEnabled(enabled) {
  isEnabled = enabled;
  updateToggleLabel();

  try {
    await browser.runtime.sendMessage({ action: 'setEnabled', enabled });
  } catch (e) {
    showError('設定失敗');
  }
}

function updateToggleLabel() {
  toggleLabel.textContent = isEnabled ? '啟用' : '停用';
  document.body.classList.toggle('disabled', !isEnabled);
}

// 驗證 URL 格式
function isValidUrl(input) {
  if (!input) return false;

  // 允許純 domain（例如 example.com）
  const withProtocol = input.startsWith('http') ? input : `https://${input}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}

// 格式化剩餘時間
function formatTimeRemaining(removalTime) {
  const remaining = removalTime - Date.now();
  if (remaining <= 0) return '即將移除...';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// 定時更新倒計時
function startTimerUpdates() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    // 檢查是否有待移除項目到期
    let hasExpired = false;
    for (const url in pendingRemovals) {
      if (pendingRemovals[url] - Date.now() <= 0) {
        hasExpired = true;
        break;
      }
    }

    if (hasExpired) {
      // 重新載入
      init();
    } else {
      // 更新倒計時顯示
      document.querySelectorAll('.removal-timer').forEach(timer => {
        const parentItem = timer.closest('.url-item');
        const urlText = parentItem.querySelector('.url-text').textContent;
        if (pendingRemovals[urlText]) {
          timer.textContent = formatTimeRemaining(pendingRemovals[urlText]);
        }
      });
    }
  }, 1000); // 每秒更新
}

// 事件監聽
addBtn.addEventListener('click', addUrl);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addUrl();
});

urlInput.addEventListener('input', () => {
  if (errorMsg.style.display !== 'none') hideError();
});

enableToggle.addEventListener('change', (e) => {
  toggleEnabled(e.target.checked);
});

// 卸載時清理
window.addEventListener('beforeunload', () => {
  if (timerInterval) clearInterval(timerInterval);
});

// 啟動
init();
