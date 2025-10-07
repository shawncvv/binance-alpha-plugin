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
        var payload = { buyAdd, sellAdd, howMoney };

        //保存
        chrome.storage.sync.set({ [KEY]: payload });

        await sendCommand("alphaBtn", payload);
    } catch (e) {
    }
});




chrome.storage.sync.get(KEY, function (data) {
    if (data && data[KEY]) {
        var settings = data[KEY];
        document.getElementById("buyAddMoney").value = settings.buyAdd || 0;
        document.getElementById("sellAddMoney").value = settings.sellAdd || 0;
        document.getElementById("howMoney").value = settings.howMoney || 500;
    }
});