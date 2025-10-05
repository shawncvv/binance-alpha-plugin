// Popup 页面脚本

function sendCommand(cmd, payload) {
    return new Promise(async (resolve, reject) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) return reject(new Error("No active tab"));
            chrome.tabs.sendMessage(tab.id, { type: "DOM_HELPER_CMD", cmd, payload }, (res) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!res || res.ok !== true) {
                    return reject(new Error((res && res.error) || "Unknown error"));
                }
                resolve(res.data);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function $(sel) { return document.querySelector(sel); }
const output = $("#output");
const statusIndicator = $("#statusIndicator");

function setOutput(data, type = 'info') {
    output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);

    // 更新状态指示器
    statusIndicator.className = 'status-indicator';
    if (type === 'success') {
        statusIndicator.classList.add('success');
    } else if (type === 'error') {
        statusIndicator.classList.add('error');
    } else if (type === 'warning') {
        statusIndicator.classList.add('warning');
    }
}

function getTradeCount() {
    const tradeCount = parseInt($("#tradeCount").value) || 1;
    return Math.max(1, Math.min(100, tradeCount)); // 限制在1-100之间
}

function updateStats() {
    const buyAdd = parseFloat($("#buyAddMoney").value) || 0;
    const sellAdd = parseFloat($("#sellAddMoney").value) || 0;
    const howMoney = parseFloat($("#howMoney").value) || 5;
    const tradeCount = getTradeCount();

    // 模拟计算（实际应该从content script获取实际价格）
    const mockCurrentPrice = 100; // 这里应该从content script获取实际价格
    const buyPrice = mockCurrentPrice + buyAdd;
    const sellPrice = buyPrice - sellAdd;
    const profitPerTrade = ((sellPrice - buyPrice) * howMoney / buyPrice).toFixed(2);
    const totalAmount = (howMoney * tradeCount).toFixed(0);

    // 更新按钮文本显示总交易金额
    const alphaBtn = $("#alphaBtn");
    if (!alphaBtn.disabled) {
        alphaBtn.querySelector('span').textContent = `执行交易 ($${totalAmount})`;
    }
}

function setButtonLoading(buttonId, loading) {
    const button = $(buttonId);
    if (loading) {
        button.disabled = true;
        button.querySelector('span').textContent = '执行中...';
    } else {
        button.disabled = false;
        // 恢复按钮文本时显示总金额
        updateStats();
    }
}

var KEY = "popup.settings.v1";

// 执行交易按钮
$("#alphaBtn").addEventListener("click", async () => {
    try {
        setButtonLoading('alphaBtn', true);
        setOutput("正在执行交易...", 'info');

        const buyAdd = $("#buyAddMoney").value;
        const sellAdd = $("#sellAddMoney").value;
        const howMoney = $("#howMoney").value;
        const tradeCount = getTradeCount();
        const payload = { buyAdd, sellAdd, howMoney, tradeCount };

        // 保存设置
        chrome.storage.sync.set({ [KEY]: payload });

        const result = await sendCommand("alphaBtn", payload);
        setOutput(`成功执行 ${tradeCount} 次交易！\n` + JSON.stringify(result, null, 2), 'success');

        // 更新统计信息
        updateStats();

    } catch (e) {
        setOutput("交易执行失败：" + e.message, 'error');
    } finally {
        setButtonLoading('alphaBtn', false);
    }
});


// 应用自定义选择器
$("#applySelector").addEventListener("click", async () => {
    try {
        const selector = $("#listSelector").value;
        if (!selector.trim()) {
            setOutput("请输入有效的选择器", 'warning');
            return;
        }

        // 保存选择器到storage
        chrome.storage.local.set({ customSelector: selector });
        setOutput("选择器已应用: " + selector, 'success');

    } catch (e) {
        setOutput("应用选择器失败：" + e.message, 'error');
    }
});

// 监听输入变化，实时更新统计
$("#buyAddMoney").addEventListener('input', updateStats);
$("#sellAddMoney").addEventListener('input', updateStats);
$("#howMoney").addEventListener('input', updateStats);
$("#tradeCount").addEventListener('input', updateStats);

// 加载保存的设置
chrome.storage.sync.get(KEY, function (data) {
    if (data && data[KEY]) {
        const settings = data[KEY];
        document.getElementById("buyAddMoney").value = settings.buyAdd || 0;
        document.getElementById("sellAddMoney").value = settings.sellAdd || 0;
        document.getElementById("howMoney").value = settings.howMoney || 5;

        // 加载交易次数设置
        if (settings.tradeCount) {
            const count = Math.max(1, Math.min(100, settings.tradeCount));
            document.getElementById("tradeCount").value = count;
        }

        updateStats();
    }
});

// 加载自定义选择器
chrome.storage.local.get(['customSelector'], function (data) {
    if (data && data.customSelector) {
        document.getElementById("listSelector").value = data.customSelector;
    }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    updateStats();
    setOutput("Alpha Trading Tool 已就绪", 'success');
});