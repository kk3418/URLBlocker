// background.js - 管理封鎖規則的 Service Worker

// Chrome/Safari browser API 相容性（Chrome 用 chrome.*，Safari 用 browser.*）
if (typeof browser === 'undefined') var browser = chrome;

const STORAGE_KEY = 'blockedUrls';
const ENABLED_KEY = 'blockingEnabled';
const PENDING_REMOVALS_KEY = 'pendingRemovals';
let removalCheckInterval = null;

// ------
// TODO: 在 chrome 上可以運作
// TODO: 在 mac safari 測試q
// ------

// 擴充功能安裝或更新時初始化
browser.runtime.onInstalled.addListener(async () => {
  const data = await browser.storage.local.get([STORAGE_KEY, ENABLED_KEY, PENDING_REMOVALS_KEY]);
  if (!data[STORAGE_KEY]) {
    await browser.storage.local.set({ [STORAGE_KEY]: [] });
  }
  if (data[ENABLED_KEY] === undefined) {
    await browser.storage.local.set({ [ENABLED_KEY]: true });
  }
  if (!data[PENDING_REMOVALS_KEY]) {
    await browser.storage.local.set({ [PENDING_REMOVALS_KEY]: {} });
  }
  await syncRules();
  startRemovalChecker();
});

// 當 background 啟動時啟動檢查器
startRemovalChecker();

// 定期檢查待移除的項目是否到期
function startRemovalChecker() {
  if (removalCheckInterval) clearInterval(removalCheckInterval);

  removalCheckInterval = setInterval(async () => {
    const { [PENDING_REMOVALS_KEY]: pendingRemovals = {} } = await browser.storage.local.get(PENDING_REMOVALS_KEY);
    let hasExpired = false;

    for (const url in pendingRemovals) {
      if (pendingRemovals[url] - Date.now() <= 0) {
        // 移除已過期的項目
        await removeBlockedUrl(url);
        delete pendingRemovals[url];
        hasExpired = true;
      }
    }

    if (hasExpired) {
      await browser.storage.local.set({ [PENDING_REMOVALS_KEY]: pendingRemovals });
      await syncRules();
    }
  }, 10000); // 每 10 秒檢查一次
}

// 接收來自 popup / content script 的訊息
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // content.js 請求導航到封鎖頁面（使用 tabs.update，Chrome 允許 background 導向 extension 頁面）
  if (message.action === 'navigateToBlocked') {
    const url = browser.runtime.getURL(`/blocked/blocked.html?url=${encodeURIComponent(message.url)}`);
    browser.tabs.update(sender.tab.id, { url })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  handleMessage(message).then(sendResponse);
  return true; // 保持 message channel 開放
});

async function handleMessage(message) {
  switch (message.action) {
    case 'addUrl':
      await addBlockedUrl(message.url);
      return { success: true };

    case 'removeUrl':
      await removeBlockedUrl(message.url);
      return { success: true };

    case 'scheduleRemoval':
      await scheduleRemoval(message.url, message.removalTime);
      return { success: true };

    case 'cancelRemoval':
      await cancelRemovalSchedule(message.url);
      return { success: true };

    case 'getUrls':
      const data = await browser.storage.local.get([STORAGE_KEY, ENABLED_KEY, PENDING_REMOVALS_KEY]);
      return {
        urls: data[STORAGE_KEY] || [],
        enabled: data[ENABLED_KEY] !== false,
        pendingRemovals: data[PENDING_REMOVALS_KEY] || {}
      };

    case 'setEnabled':
      await browser.storage.local.set({ [ENABLED_KEY]: message.enabled });
      await syncRules();
      return { success: true };

    case 'isBlocked':
      return { blocked: await isUrlBlocked(message.url) };

    default:
      return { error: 'Unknown action' };
  }
}

async function addBlockedUrl(url) {
  const cleanUrl = normalizeUrl(url);
  if (!cleanUrl) return;

  const { blockedUrls } = await browser.storage.local.get(STORAGE_KEY);
  const urls = blockedUrls || [];

  if (!urls.includes(cleanUrl)) {
    urls.push(cleanUrl);
    await browser.storage.local.set({ [STORAGE_KEY]: urls });
    await syncRules();
  }
}

async function removeBlockedUrl(url) {
  const { blockedUrls } = await browser.storage.local.get(STORAGE_KEY);
  const urls = (blockedUrls || []).filter(u => u !== url);
  await browser.storage.local.set({ [STORAGE_KEY]: urls });
  await syncRules();
}

async function isUrlBlocked(url) {
  const data = await browser.storage.local.get([STORAGE_KEY, ENABLED_KEY]);
  if (!data[ENABLED_KEY]) return false;

  const urls = data[STORAGE_KEY] || [];
  return urls.some(blockedUrl => urlMatchesRule(url, blockedUrl));
}

// 排定 3 小時後移除
async function scheduleRemoval(url, removalTime) {
  const { [PENDING_REMOVALS_KEY]: pendingRemovals = {} } = await browser.storage.local.get(PENDING_REMOVALS_KEY);
  pendingRemovals[url] = removalTime;
  await browser.storage.local.set({ [PENDING_REMOVALS_KEY]: pendingRemovals });
}

// 取消待移除
async function cancelRemovalSchedule(url) {
  const { [PENDING_REMOVALS_KEY]: pendingRemovals = {} } = await browser.storage.local.get(PENDING_REMOVALS_KEY);
  delete pendingRemovals[url];
  await browser.storage.local.set({ [PENDING_REMOVALS_KEY]: pendingRemovals });
}

// 同步 declarativeNetRequest 規則
async function syncRules() {
  try {
    const data = await browser.storage.local.get([STORAGE_KEY, ENABLED_KEY]);
    const urls = data[STORAGE_KEY] || [];
    const enabled = data[ENABLED_KEY] !== false;

    // 移除所有現有的動態規則
    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);

    if (!enabled || urls.length === 0) {
      if (existingIds.length > 0) {
        await browser.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingIds,
          addRules: []
        });
      }
      console.log('[URLBlocker] Rules cleared (disabled or no URLs)');
      return;
    }

    // 建立新規則：重定向到封鎖頁面
    const newRules = urls.map((url, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: `/blocked/blocked.html?url=${encodeURIComponent(url)}`
        }
      },
      condition: {
        urlFilter: buildUrlFilter(url),
        resourceTypes: ['main_frame']
      }
    }));

    console.log('[URLBlocker] Syncing rules:', JSON.stringify(newRules));

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: newRules
    });

    console.log('[URLBlocker] Rules synced successfully');
  } catch (e) {
    console.error('[URLBlocker] syncRules FAILED:', e.message, e);
    throw e;
  }
}

// 將使用者輸入的 URL 轉換為 urlFilter 模式
function buildUrlFilter(input) {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    const parsed = new URL(url);

    let hostname = parsed.hostname;
    const pathname = parsed.pathname !== '/' ? parsed.pathname : '';

    // 處理域名：去掉 www. 前綴後，使用 || 以匹配域名和子域名
    // 例如：example.com 可以匹配 example.com、www.example.com、api.example.com
    const baseDomain = hostname.replace(/^www\./, '');

    // 若有路徑，則更精確地只封鎖該路徑
    if (pathname) {
      // 針對特定路徑的規則：||domain/path*
      return `||${baseDomain}${pathname}*`;
    }

    // 對於純域名，使用 || 加上 ^ 分隔符以確保完整匹配
    // 這將匹配 domain.com、www.domain.com、subdomain.domain.com
    return `||${baseDomain}^`;
  } catch {
    // 無法解析時，直接用原始字串做模糊比對
    return `*${input}*`;
  }
}

// 檢查 URL 是否符合封鎖規則（供 content script 使用）
function urlMatchesRule(currentUrl, blockedUrl) {
  try {
    const normalizedBlocked = blockedUrl.startsWith('http')
      ? blockedUrl
      : `https://${blockedUrl}`;
    const blockedParsed = new URL(normalizedBlocked);
    const currentParsed = new URL(currentUrl);

    if (!currentParsed.hostname.endsWith(blockedParsed.hostname)) {
      return false;
    }

    if (blockedParsed.pathname && blockedParsed.pathname !== '/') {
      return currentParsed.pathname.startsWith(blockedParsed.pathname);
    }

    return true;
  } catch {
    return currentUrl.includes(blockedUrl);
  }
}

// 標準化使用者輸入的 URL
function normalizeUrl(input) {
  if (!input || typeof input !== 'string') return null;
  return input.trim().replace(/\/+$/, ''); // 移除尾部斜線
}
