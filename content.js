// 内容脚本（非模块语法）。依赖 utils.js 先注入，直接使用 $$、$、log、store 等全局函数。

// 可在这里配置你想抓取的列表选择器
// 同时允许通过 window.__DOM_HELPER_OVERRIDE__ 覆盖
window.CONFIG = {
    listItemSelector: "ul li, .list .item, .article-list .article",
    titleSelector: "a, .title, h2, h3",
    linkSelector: "a[href]",
    descSelector: ".desc, .summary, p"
};

// 把dom元素收拢在一起
const SELECTORS = Object.freeze({
    priceItems: ".flex-1.cursor-pointer",
    limitPriceInput: "#limitPrice",
    limitTotalInputs: "#limitTotal",
    buyButton: ".bn-button.bn-button__buy.data-size-middle.w-full",
    confirmButton: ".bn-button.bn-button__primary.data-size-middle.w-full",
    reverseOrderCheckbox: ".bn-checkbox.bn-checkbox__square.data-size-md",
    allBuyButtons: ".bn-button__buy",
    // 账户余额显示元素
    balanceAmount: "div.text-PrimaryText.text-\\[12px\\].leading-\\[18px\\].font-\\[500\\]"
});

// 余额保护配置
const TRADE_CONFIG = Object.freeze({
    // 余额容差配置
    tolerancePercent: 0.15,      // 交易金额的 15%
    minTolerance: 0.5,           // 最小容差 0.5 USDT
    maxTolerance: 1,             // 最大容差 3 USDT
    // 余额检测配置
    balanceCheckTimeout: 6000,   // 最多等待 6 秒
    balanceCheckInterval: 500,   // 每 500ms 检查一次
    balanceStableThreshold: 2    // 余额连续 2 次相同认为稳定
});

function getConfig() {
    const ovr = window.__DOM_HELPER_OVERRIDE__ || {};
    return Object.assign({}, window.CONFIG, ovr);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//模拟输入
function typeLikeUser(el, text, { delay = 0 } = {}) {
    if (!el) throw new Error('element is required');
    //el?.value = "";
    el.focus();

    const dispatch = (type, opts = {}) =>
        el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));

    const inputEvent = (data, inputType = 'insertText') =>
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data, inputType }));

    const changeEvent = () =>
        el.dispatchEvent(new Event('change', { bubbles: true }));

    const setNativeValue = (element, value) => {
        // 兼容 React 受控组件：调用原生 setter，避免仅改 el.value
        const proto = Object.getPrototypeOf(element);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc?.set?.call(element, value);
    };

    const typeChar = async (ch) => {
        dispatch('keydown', { key: ch, code: `Key${(ch + '').toUpperCase()}`, keyCode: ch.charCodeAt(0) });
        // 某些环境还会监听 keypress
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch }));
        setNativeValue(el, (el.value ?? '') + ch);
        inputEvent(ch, 'insertText');
        dispatch('keyup', { key: ch });
        if (delay) await new Promise(r => setTimeout(r, delay));
    };

    const run = async () => {
        for (const ch of text) {
            await typeChar(ch);
        }
        changeEvent();
    };
    return run();
}

function parseBalanceText(raw) {
    if (!raw) return null;
    const numericPart = raw.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
    if (!numericPart) return null;
    const value = Number(numericPart);
    return Number.isFinite(value) ? value : null;
}

function formatAmount(value, fractionDigits = 8) {
    if (!Number.isFinite(value)) return "";
    if (Math.abs(value) < 1e-8) value = 0;
    const str = Number(value).toFixed(fractionDigits);
    return str.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function readDisplayedBalance() {
    try {
        const balanceEl = document.querySelector(SELECTORS.balanceAmount);
        if (!balanceEl) return null;
        const text = balanceEl.textContent || balanceEl.innerText || "";
        return parseBalanceText(text);
    } catch (err) {
        return null;
    }
}

// 动态计算余额容差
function calculateTolerance(howMoney) {
    const { tolerancePercent, minTolerance, maxTolerance } = TRADE_CONFIG;
    const calculated = Number(howMoney) * tolerancePercent;
    return Math.max(minTolerance, Math.min(calculated, maxTolerance));
}

// 等待余额稳定（反向订单执行完成）
async function waitForBalanceStabilize(preBalance, timeoutMs = 8000) {
    const startTime = Date.now();
    const { balanceCheckInterval, balanceStableThreshold } = TRADE_CONFIG;

    let lastBalance = null;
    let stableCount = 0;

    while (Date.now() - startTime < timeoutMs) {
        const currentBalance = readDisplayedBalance();

        if (Number.isFinite(currentBalance)) {
            // 余额连续相同则认为已稳定
            if (currentBalance === lastBalance) {
                stableCount++;
                if (stableCount >= balanceStableThreshold) {
                    return {
                        balance: currentBalance,
                        delta: Math.abs(currentBalance - preBalance),
                        stabilized: true
                    };
                }
            } else {
                stableCount = 0;
            }
            lastBalance = currentBalance;
        }

        await sleep(balanceCheckInterval);
    }

    // 超时：返回最后读取的余额
    const finalBalance = Number.isFinite(lastBalance) ? lastBalance : preBalance;
    return {
        balance: finalBalance,
        delta: Math.abs(finalBalance - preBalance),
        stabilized: false
    };
}

// 带余额保护的单次交易执行
async function executeTradeWithGuard(buyAdd, sellAdd, howMoney) {
    // 1. 记录交易前余额
    const preBalance = readDisplayedBalance();
    if (!Number.isFinite(preBalance)) {
        throw new Error('无法读取账户余额，交易已取消');
    }

    console.log(`[余额保护] 交易前余额: ${preBalance.toFixed(4)} USDT`);

    // 2. 执行买入 + 反向订单
    await alphaBtnActionButtons(buyAdd, sellAdd, howMoney);

    // 3. 等待余额稳定（等待反向订单执行）
    const { balance: postBalance, delta, stabilized } = await waitForBalanceStabilize(
        preBalance,
        TRADE_CONFIG.balanceCheckTimeout
    );

    console.log(`[余额保护] 交易后余额: ${postBalance.toFixed(4)} USDT, 变化: ${delta.toFixed(4)} USDT${stabilized ? '' : ' (未稳定)'}`);

    // 4. 计算容差并检查
    const tolerance = calculateTolerance(howMoney);
    console.log(`[余额保护] 容差阈值: ${tolerance.toFixed(4)} USDT (交易金额: ${howMoney} USDT)`);

    if (delta > tolerance) {
        const error = new Error(
            `余额保护触发：余额变化 ${delta.toFixed(4)} USDT 超过容差 ${tolerance.toFixed(4)} USDT，` +
            `推断反向订单未成交，交易已停止`
        );
        error.code = 'BALANCE_GUARD_TRIGGERED';
        error.details = { preBalance, postBalance, delta, tolerance, howMoney };
        throw error;
    }

    // 5. 交易成功
    return {
        preBalance,
        postBalance,
        delta,
        tolerance,
        stabilized
    };
}

// 检查反向订单是否已勾选
function isReverseOrderEnabled() {
    const checkbox = document.querySelector(SELECTORS.reverseOrderCheckbox);
    if (!checkbox) return false;
    const input = checkbox.querySelector("input[type='checkbox']");
    return checkbox.classList.contains("checked")
        || checkbox.getAttribute("aria-checked") === "true"
        || (input && input.checked === true);
}

// 自动勾选反向订单复选框
function ensureReverseOrderCheckboxState(targetChecked = true) {
    const checkbox = document.querySelector(SELECTORS.reverseOrderCheckbox);
    if (!checkbox) {
        console.warn('[自动勾选] 未找到反向订单复选框');
        return false;
    }

    const desired = Boolean(targetChecked);

    // 如果已经是目标状态，直接返回
    if (isReverseOrderEnabled() === desired) {
        console.log('[自动勾选] 反向订单复选框已是目标状态');
        return true;
    }

    // 尝试通过点击切换状态
    const input = checkbox.querySelector("input[type='checkbox']");
    const clickable = (input && typeof input.click === "function") ? input : checkbox;

    try {
        console.log('[自动勾选] 尝试点击反向订单复选框');
        clickable.click();
    } catch (err) {
        console.warn('[自动勾选] 点击失败，尝试直接设置属性', err);
    }

    // 检查点击是否成功
    if (isReverseOrderEnabled() === desired) {
        console.log('[自动勾选] 反向订单复选框已成功勾选');
        return true;
    }

    // 如果点击失败，尝试直接设置属性
    if (input) {
        input.checked = desired;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    checkbox.setAttribute("aria-checked", desired ? "true" : "false");
    checkbox.classList.toggle("checked", desired);

    const finalState = isReverseOrderEnabled() === desired;
    console.log(`[自动勾选] 最终状态: ${finalState ? '成功' : '失败'}`);
    return finalState;
}

// 初始化检测函数，确保页面元素存在，打开插件的时候执行

function runElementDiagnostics() {
    const currentProgress = ensureTradeProgress();
    const priceElements = document.querySelectorAll(SELECTORS.priceItems);
    const limitPrice = document.querySelector(SELECTORS.limitPriceInput);
    const limitTotals = document.querySelectorAll(SELECTORS.limitTotalInputs);
    const buyBtn = document.querySelector(SELECTORS.buyButton);
    const allBuyBtns = document.querySelectorAll(SELECTORS.allBuyButtons);
    const reverseCheckbox = document.querySelector(SELECTORS.reverseOrderCheckbox);
    const balanceEl = document.querySelector(SELECTORS.balanceAmount);

    const missingParts = [];

    if (priceElements.length === 0) missingParts.push("价格列表元素");
    if (!limitPrice) missingParts.push("买入限价输入框");
    if (limitTotals.length < 2) missingParts.push("数量与卖出输入框");
    if (!buyBtn) missingParts.push("买入按钮");
    if (allBuyBtns.length === 0) missingParts.push("买入按钮集合");
    if (!reverseCheckbox) missingParts.push("反向订单复选框");
    if (!balanceEl) missingParts.push("账户余额显示");

    if (missingParts.length > 0) {
        const detail = `缺失元素：${missingParts.join("，")}`;
        console.warn("元素检测失败：", detail);
        pushTradeProgress({
            status: "error",
            total: 0,
            current: 0,
            lastMessage: "初始化失败，页面缺少必要元素。",
            lastError: detail,
            balanceBefore: currentProgress?.balanceBefore ?? null,
            balanceAfter: currentProgress?.balanceAfter ?? null,
            balanceChange: currentProgress?.balanceChange ?? null
        });
        return false;
    }

    const checkboxEnabled = ensureReverseOrderCheckboxState(true);

    const progressUpdate = { lastError: null };

    const shouldResetState =
        (!currentProgress.total || currentProgress.total === 0) &&
        ["idle", "completed", "error", "stopped", undefined, null].includes(currentProgress.status);

    if (shouldResetState) {
        Object.assign(progressUpdate, {
            status: "idle",
            total: 0,
            current: 0,
            lastMessage: checkboxEnabled
                ? "初始化成功，已检测到交易页面核心元素，反向订单已自动勾选。"
                : "初始化成功，已检测到交易页面核心元素，但反向订单未能自动勾选，请手动确认。"
        });
    } else if (currentProgress.lastMessage === undefined || currentProgress.lastMessage === null) {
        progressUpdate.lastMessage = checkboxEnabled
            ? "初始化成功，已检测到交易页面核心元素，反向订单已自动勾选。"
            : "初始化成功，已检测到交易页面核心元素，但反向订单未能自动勾选，请手动确认。";
    }

    // 如果复选框未能成功勾选，添加警告
    if (!checkboxEnabled) {
        progressUpdate.lastError = "反向订单复选框未能自动勾选，请手动勾选后再开始交易。";
    }

    pushTradeProgress(progressUpdate);
    return true;
}

function createDefaultTradeProgress() {
    return {
        total: 0,
        current: 0,
        status: "idle",
        lastMessage: "等待交易开始",
        lastUpdated: Date.now(),
        balanceBefore: null,
        balanceAfter: null,
        balanceChange: null
    };
}

function ensureTradeProgress() {
    if (!window.tradeProgress) {
        window.tradeProgress = createDefaultTradeProgress();
    }
    return window.tradeProgress;
}

function pushTradeProgress(partial) {
    const progress = ensureTradeProgress();
    Object.assign(progress, partial);
    progress.lastUpdated = Date.now();
    const payload = { ...progress };
    try {
        chrome.runtime.sendMessage({ type: "TRADE_PROGRESS_UPDATE", data: payload }, () => {
            if (chrome.runtime.lastError) {
                // Popup 可能未打开，忽略错误
            }
        });
    } catch (err) {
        // 某些页面上下文可能暂未注入 runtime，忽略异常
    }
    return payload;
}

function getTradeProgressSnapshot() {
    return { ...ensureTradeProgress() };
}

ensureTradeProgress();

//刷alpha - 单次交易
async function alphaBtnActionButtons(buyAdd, sellAdd, howMoney) {
    const rawPriceOffset = Number(buyAdd || 0);
    const rawSellOffset = Number(sellAdd || 0);
    const amount = Number(howMoney || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("交易金额无效，请检查输入");
    }

    if (!Number.isFinite(rawPriceOffset) || !Number.isFinite(rawSellOffset)) {
        throw new Error("买入/卖出偏移量无效");
    }

    const priceElements = $$(SELECTORS.priceItems);
    const firstPriceEl = priceElements[0];
    if (!firstPriceEl) {
        throw new Error("未找到价格元素，无法继续下单");
    }

    const priceText = (firstPriceEl.textContent || firstPriceEl.innerText || "").replace(/[^\d.\-]/g, "");
    const basePrice = Number(priceText);
    if (!Number.isFinite(basePrice)) {
        throw new Error("价格解析失败，获取到的内容为：" + priceText);
    }

    const buyPrice = basePrice + rawPriceOffset;
    const sellPrice = buyPrice - rawSellOffset;

    // 格式化价格，避免浮点精度问题，买入
    const buyPriceStr = formatAmount(buyPrice, 8);
    // 卖出价格
    const sellPriceStr = formatAmount(sellPrice, 8);
    log(`获取价格：${basePrice}，买入价格：${buyPrice}，卖出价格：${sellPrice}`);

    const limitPriceInput = await waitForSelector(SELECTORS.limitPriceInput).catch(() => null);
    if (!limitPriceInput) {
        throw new Error("未找到买入限价输入框");
    }
    limitPriceInput.value = "";
    await sleep(100);
    await typeLikeUser(limitPriceInput, buyPriceStr, { delay: 10 });
    await sleep(200);

    const firstTotalInput = await waitForSelector(SELECTORS.limitTotalInputs).catch(() => null);
    const totalInputs = $$(SELECTORS.limitTotalInputs);
    if (!firstTotalInput || totalInputs.length < 2) {
        throw new Error("数量/卖出输入框数量不足，期望至少 2 个");
    }

    const amountInput = totalInputs[0];
    amountInput.value = "";
    await sleep(100);
    amountInput.click();
    await sleep(100);
    await typeLikeUser(amountInput, amount.toString(), { delay: 10 });
    await sleep(200);

    const sellPriceInput = totalInputs[1];
    sellPriceInput.value = "";
    await sleep(100);
    await typeLikeUser(sellPriceInput, sellPriceStr, { delay: 10 });
    await sleep(200);

    const buyButton = $(SELECTORS.buyButton);
    if (!buyButton) {
        throw new Error("未找到买入按钮");
    }
    buyButton.click();

    try {
        const confirmBtn = await waitForSelector(SELECTORS.confirmButton, { timeout: 6000 });
        confirmBtn.click();
    } catch (err) {
        throw new Error("没有找到确认按钮或确认弹框，交易可能未提交");
    }

    return "";
}

// 全局交易状态
window.isTradingPaused = false;
window.currentTradeSession = null;

//多次交易执行函数（增强版：带余额保护）
async function executeMultipleTrades(buyAdd, sellAdd, howMoney, tradeCount, tradeInterval) {
    tradeCount = parseInt(tradeCount) || 1;
    tradeInterval = parseInt(tradeInterval) || 5;

    console.log(`开始执行 ${tradeCount} 次交易，间隔 ${tradeInterval} 秒（已启用余额保护）`);

    // 创建新的交易会话ID
    const sessionId = Date.now();
    window.currentTradeSession = sessionId;

    const sessionStartBalance = readDisplayedBalance();
    const normalizedStartBalance = Number.isFinite(sessionStartBalance) ? sessionStartBalance : null;

    // 检查反向订单是否勾选
    if (!isReverseOrderEnabled()) {
        const message = "检测到反向订单未勾选，交易已取消";
        window.currentTradeSession = null;
        pushTradeProgress({
            total: tradeCount,
            current: 0,
            status: "error",
            lastMessage: message,
            lastError: "请先在页面勾选反向订单复选框。",
            balanceBefore: normalizedStartBalance,
            balanceAfter: normalizedStartBalance,
            balanceChange: null
        });
        return message;
    }

    pushTradeProgress({
        total: tradeCount,
        current: 0,
        status: "running",
        lastMessage: `准备执行 ${tradeCount} 次交易（已启用余额保护）`,
        balanceBefore: normalizedStartBalance,
        balanceAfter: normalizedStartBalance,
        balanceChange: null
    });

    for (let i = 1; i <= tradeCount; i++) {
        // 检查是否被暂停或会话已更改
        if (window.isTradingPaused || window.currentTradeSession !== sessionId) {
            console.log('交易已被暂停或停止');
            const currentBalance = readDisplayedBalance();
            const finalBalance = Number.isFinite(currentBalance) ? currentBalance : normalizedStartBalance;
            const balanceChange = (normalizedStartBalance != null && finalBalance != null)
                ? normalizedStartBalance - finalBalance
                : null;

            pushTradeProgress({
                status: "paused",
                total: tradeCount,
                current: Math.max(0, i - 1),
                lastMessage: `交易已暂停，已完成 ${Math.max(0, i - 1)} / ${tradeCount}`,
                balanceBefore: normalizedStartBalance,
                balanceAfter: finalBalance,
                balanceChange
            });
            return "交易已暂停";
        }

        console.log(`执行第 ${i}/${tradeCount} 次交易`);

        pushTradeProgress({
            status: "running",
            total: tradeCount,
            current: Math.max(0, i - 1),
            lastMessage: `正在执行第 ${i} 次交易`,
            balanceBefore: normalizedStartBalance
        });

        try {
            // ===== 核心改动：使用带余额保护的交易函数 =====
            const result = await executeTradeWithGuard(buyAdd, sellAdd, howMoney);

            console.log(`第 ${i} 次交易完成，余额变化 ${result.delta.toFixed(4)} USDT（容差 ${result.tolerance.toFixed(4)} USDT）`);

            pushTradeProgress({
                status: "running",
                total: tradeCount,
                current: i,
                lastMessage: `第 ${i} 次交易完成，余额变化 ${result.delta.toFixed(4)} USDT`,
                lastError: null,
                balanceBefore: normalizedStartBalance,
                balanceAfter: result.postBalance
            });

            // 如果不是最后一次交易，等待间隔时间
            if (i < tradeCount) {
                console.log(`等待 ${tradeInterval} 秒后执行下次交易...`);

                // 在等待期间检查暂停状态
                for (let waitTime = 0; waitTime < tradeInterval; waitTime++) {
                    if (window.isTradingPaused || window.currentTradeSession !== sessionId) {
                        console.log('等待期间交易被暂停');
                        const currentBalance = readDisplayedBalance();
                        const finalBalance = Number.isFinite(currentBalance) ? currentBalance : result.postBalance;
                        const balanceChange = (normalizedStartBalance != null && finalBalance != null)
                            ? normalizedStartBalance - finalBalance
                            : null;

                        pushTradeProgress({
                            status: "paused",
                            total: tradeCount,
                            current: i,
                            lastMessage: "等待期间交易被暂停",
                            balanceBefore: normalizedStartBalance,
                            balanceAfter: finalBalance,
                            balanceChange
                        });
                        return "交易已暂停";
                    }
                    await sleep(1000); // 每秒检查一次暂停状态
                }
            }
        } catch (error) {
            console.error(`第 ${i} 次交易失败:`, error);

            // ===== 核心改动：区分余额保护触发和普通错误 =====
            const isFatalError = error.code === 'BALANCE_GUARD_TRIGGERED'
                || error.message.includes('未找到')
                || error.message.includes('无法读取');

            const currentBalance = readDisplayedBalance();
            const finalBalance = Number.isFinite(currentBalance) ? currentBalance : normalizedStartBalance;
            const balanceChange = (normalizedStartBalance != null && finalBalance != null)
                ? normalizedStartBalance - finalBalance
                : null;

            pushTradeProgress({
                status: isFatalError ? "error" : "running",
                total: tradeCount,
                current: Math.max(0, i - 1),
                lastMessage: `第 ${i} 次交易失败：${error?.message || error}`,
                lastError: error?.message || String(error),
                balanceBefore: normalizedStartBalance,
                balanceAfter: finalBalance,
                balanceChange
            });

            // 如果是致命错误（余额保护触发），立即停止所有交易
            if (isFatalError) {
                console.error('[致命错误] 交易已终止，不再执行后续交易');
                window.currentTradeSession = null;
                return error?.message || "交易失败";
            }

            // 非致命错误：等待后继续下一次交易
            console.warn('[非致命错误] 继续执行下一次交易');
            if (i < tradeCount) {
                await sleep(tradeInterval * 1000);
            }
        }
    }

    console.log(`所有 ${tradeCount} 次交易执行完成`);
    window.currentTradeSession = null;

    const finalBalance = readDisplayedBalance();
    const normalizedFinalBalance = Number.isFinite(finalBalance) ? finalBalance : null;
    const balanceChange = (normalizedStartBalance != null && normalizedFinalBalance != null)
        ? normalizedStartBalance - normalizedFinalBalance
        : null;
    const formattedChange = formatAmount(balanceChange);
    const completionMessage = (balanceChange != null && formattedChange)
        ? `所有 ${tradeCount} 次交易执行完成，总费用估算（USDT）：${formattedChange}`
        : `所有 ${tradeCount} 次交易执行完成`;

    pushTradeProgress({
        status: "completed",
        total: tradeCount,
        current: tradeCount,
        lastMessage: completionMessage,
        lastError: null,
        balanceBefore: normalizedStartBalance,
        balanceAfter: normalizedFinalBalance,
        balanceChange
    });

    return "";
}



// 供 popup/background 调用的命令执行器
async function handleCommand(cmd, payload) {
    switch (cmd) {
        case "runDiagnostics":
            runElementDiagnostics();
            return getTradeProgressSnapshot();
        case "getTradeProgress":
            return getTradeProgressSnapshot();
        case "alphaBtn":
            const { buyAdd, sellAdd, howMoney, tradeCount, tradeInterval } = payload || {};
            // 重置暂停状态，开始新的交易
            window.isTradingPaused = false;
            return await executeMultipleTrades(buyAdd, sellAdd, howMoney, tradeCount, tradeInterval);
        case "stopTrading":
            window.isTradingPaused = true;
            window.currentTradeSession = null;
            console.log('交易已停止');
            const currentProgress = ensureTradeProgress();
            const latestBalance = readDisplayedBalance();
            const normalizedLatest = Number.isFinite(latestBalance) ? latestBalance : null;
            const startBalance = Number.isFinite(currentProgress.balanceBefore)
                ? currentProgress.balanceBefore
                : (normalizedLatest ?? null);
            const effectiveFinalBalance = normalizedLatest ?? currentProgress.balanceAfter ?? null;
            const computedChange = (Number.isFinite(startBalance) && Number.isFinite(effectiveFinalBalance))
                ? startBalance - effectiveFinalBalance
                : (Number.isFinite(currentProgress.balanceChange) ? currentProgress.balanceChange : null);
            const stopFormatted = formatAmount(computedChange);
            const stopMessage = (computedChange != null && stopFormatted)
                ? `用户已停止交易，当前费用估算（USDT）：${stopFormatted}`
                : "用户已停止交易";
            pushTradeProgress({
                status: "stopped",
                lastMessage: stopMessage,
                balanceBefore: Number.isFinite(startBalance) ? startBalance : null,
                balanceAfter: Number.isFinite(effectiveFinalBalance) ? effectiveFinalBalance : null,
                balanceChange: Number.isFinite(computedChange) ? computedChange : null
            });
            return "交易已停止";
        default:
            return null;
    }
}

// 消息监听
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "DOM_HELPER_CMD") {
        handleCommand(msg.cmd, msg.payload)
            .then(res => sendResponse({ ok: true, data: res }))
            .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true; // 异步响应
    }
});

// 初始化
(function init() {
    log("content loaded on", location.href);

})();
