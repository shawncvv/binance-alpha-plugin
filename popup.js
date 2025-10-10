// Popup 页面脚本（非模块语法）

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

var KEY = "popup.settings.v1";

$("#alphaBtn").addEventListener("click", async () => {
    try {
        var buyAdd = $("#buyAddMoney").value;
        var sellAdd = $("#sellAddMoney").value;
        var howMoney = $("#howMoney").value;
        var tradeCount = $("#tradeCount").value;
        var tradeInterval = $("#tradeInterval").value;
        var payload = { buyAdd, sellAdd, howMoney, tradeCount, tradeInterval };

        //保存
        chrome.storage.sync.set({ [KEY]: payload });

        // 禁用停止按钮，启用交易按钮
        $("#alphaBtn").disabled = true;
        $("#stopBtn").disabled = false;

        await sendCommand("alphaBtn", payload);

        // 交易完成后恢复按钮状态
        $("#alphaBtn").disabled = false;
        $("#stopBtn").disabled = true;
    } catch (e) {
        // 出错时也要恢复按钮状态
        $("#alphaBtn").disabled = false;
        $("#stopBtn").disabled = true;
    }
});

$("#stopBtn").addEventListener("click", async () => {
    try {
        await sendCommand("stopTrading", {});

        // 恢复按钮状态
        $("#alphaBtn").disabled = false;
        $("#stopBtn").disabled = true;
    } catch (e) {
        console.error("停止交易失败:", e);
    }
});




chrome.storage.sync.get(KEY, function (data) {
    if (data && data[KEY]) {
        var settings = data[KEY];
        document.getElementById("buyAddMoney").value = settings.buyAdd || "0.00001";
        document.getElementById("sellAddMoney").value = settings.sellAdd || "0.00003";
        document.getElementById("howMoney").value = settings.howMoney || "50";
        document.getElementById("tradeCount").value = settings.tradeCount || "1";
        document.getElementById("tradeInterval").value = settings.tradeInterval || "5";
    }
});