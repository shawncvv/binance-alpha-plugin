// 背景脚本：右键菜单、与 content 通信（非模块语法）

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "scrape",
        title: "DOM Helper: 抓取列表",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "inject",
        title: "DOM Helper: 注入按钮",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "mark",
        title: "DOM Helper: 标题加“已读”",
        contexts: ["all"]
    });
});

async function sendCommandToActiveTab(cmd, payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    try {
        return await chrome.tabs.sendMessage(tab.id, { type: "DOM_HELPER_CMD", cmd, payload });
    } catch (e) {
        // 可选：动态注入一次 content，再重试（通常不需要，因为我们通过 manifest 注入了）
        // await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["utils.js", "content.js"] });
        // return await chrome.tabs.sendMessage(tab.id, { type: "DOM_HELPER_CMD", cmd, payload });
    }
}

chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId === "scrape") await sendCommandToActiveTab("scrape");
    if (info.menuItemId === "inject") await sendCommandToActiveTab("injectButtons");
    if (info.menuItemId === "mark") await sendCommandToActiveTab("markRead");
});