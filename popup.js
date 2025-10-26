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

function formatNumber(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) < 1e-8) value = 0;
    const str = Number(value).toFixed(8);
    return str.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "");
}

const KEY = "popup.settings.v1";

const progressCard = $("#progressCard");
const progressStatusTag = $("#progressStatusTag");
const progressSummary = $("#progressSummary");
const progressDetail = $("#progressDetail");
const progressBarFill = $("#progressBarFill");
const feeSummary = $("#feeSummary");
const feeValue = $("#feeValue");

const STATUS_LABELS = {
    idle: "空闲",
    running: "执行中",
    paused: "已暂停",
    stopped: "已停止",
    completed: "已完成",
    error: "异常"
};

let lastProgressSnapshot = null;

function renderProgress(progress = {}) {
    if (!progressCard) return;

    const snapshot = Object.assign({}, lastProgressSnapshot || {}, progress);
    const status = snapshot.status || "idle";
    const total = Number(snapshot.total) || 0;
    const completed = Number(snapshot.current) || 0;
    const current = total > 0 ? Math.min(completed, total) : completed;
    const ratio = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : (status === "completed" ? 100 : 0);

    progressCard.dataset.status = status;
    progressStatusTag.textContent = STATUS_LABELS[status] || status;

    let summaryText = "尚未开始";
    if (status === "running" && total > 0) {
        summaryText = `执行进度：${current} / ${total}`;
    } else if (status === "completed") {
        summaryText = `全部完成：${total} / ${total}`;
    } else if ((status === "paused" || status === "stopped") && total > 0) {
        summaryText = `当前进度：${current} / ${total}`;
    } else if (status === "error") {
        summaryText = total > 0 ? `执行中断：${current} / ${total}` : "执行中断";
    } else if (total > 0) {
        summaryText = `累计进度：${current} / ${total}`;
    }

    progressSummary.textContent = summaryText;

    const detailText = snapshot.lastMessage || "等待交易指令。";
    progressDetail.textContent = detailText;

    const tooltipParts = [];
    if (snapshot.lastUpdated) {
        try {
            const date = new Date(snapshot.lastUpdated);
            tooltipParts.push(`最后更新：${date.toLocaleString()}`);
        } catch (err) {
            // 忽略格式化失败
        }
    }
    if (snapshot.lastError) {
        tooltipParts.push(`错误详情：${snapshot.lastError}`);
    }

    if (tooltipParts.length > 0) {
        progressDetail.title = tooltipParts.join("\n");
    } else {
        progressDetail.removeAttribute("title");
    }

    progressBarFill.style.width = `${ratio}%`;

    if (feeSummary && feeValue) {
        const rawChange = snapshot.balanceChange;
        const balanceChange = rawChange !== null && rawChange !== undefined ? Number(rawChange) : NaN;
        const hasValue = Number.isFinite(balanceChange);
        const shouldShow = hasValue && (snapshot.status === "completed" || snapshot.status === "stopped");

        if (shouldShow) {
            const formatted = formatNumber(balanceChange);
            feeValue.textContent = formatted === null || formatted === "" ? "0" : formatted;
            const startRaw = snapshot.balanceBefore;
            const endRaw = snapshot.balanceAfter;
            const startValue = startRaw !== null && startRaw !== undefined ? Number(startRaw) : NaN;
            const endValue = endRaw !== null && endRaw !== undefined ? Number(endRaw) : NaN;
            const startText = Number.isFinite(startValue) ? formatNumber(startValue) : "--";
            const endText = Number.isFinite(endValue) ? formatNumber(endValue) : "--";
            feeSummary.title = `开始余额：${startText} USDT\n结束余额：${endText} USDT`;
            feeSummary.hidden = false;
        } else {
            feeValue.textContent = "--";
            feeSummary.hidden = true;
            feeSummary.removeAttribute("title");
        }
    }

    lastProgressSnapshot = Object.assign({}, snapshot, { status, total, current });
}

function handleProgressMessage(message) {
    if (message && message.type === "TRADE_PROGRESS_UPDATE" && message.data) {
        renderProgress(message.data);
    }
}

chrome.runtime.onMessage.addListener((message) => {
    handleProgressMessage(message);
});

async function initPopup() {
    try {
        const snapshot = await sendCommand("runDiagnostics");
        if (snapshot) {
            renderProgress(snapshot);
        }
    } catch (error) {
        renderProgress({
            status: "error",
            total: 0,
            current: 0,
            lastMessage: "无法连接当前页面，请确认已打开 Binance 交易页面。",
            lastError: error?.message || String(error)
        });
    }
}

$("#alphaBtn").addEventListener("click", async () => {
    try {
        const buyAdd = $("#buyAddMoney").value;
        const sellAdd = $("#sellAddMoney").value;
        const howMoney = $("#howMoney").value;
        const tradeCount = $("#tradeCount").value;
        const tradeInterval = $("#tradeInterval").value;
        const payload = { buyAdd, sellAdd, howMoney, tradeCount, tradeInterval };

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

$("#stabilityBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://alpha123.uk/zh/stability/" });
});




chrome.storage.sync.get(KEY, function (data) {
    if (data && data[KEY]) {
        const settings = data[KEY];
        document.getElementById("buyAddMoney").value = settings.buyAdd || "0.00001";
        document.getElementById("sellAddMoney").value = settings.sellAdd || "0.00003";
        document.getElementById("howMoney").value = settings.howMoney || "50";
        document.getElementById("tradeCount").value = settings.tradeCount || "1";
        document.getElementById("tradeInterval").value = settings.tradeInterval || "5";
    }
});

renderProgress({
    status: "idle",
    total: 0,
    current: 0,
    lastMessage: "等待交易指令。"
});

initPopup();
