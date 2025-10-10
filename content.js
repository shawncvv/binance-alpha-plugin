// 内容脚本（非模块语法）。依赖 utils.js 先注入，直接使用 $$、$、log、store 等全局函数。

// 可在这里配置你想抓取的列表选择器
// 同时允许通过 window.__DOM_HELPER_OVERRIDE__ 覆盖
window.CONFIG = {
    listItemSelector: "ul li, .list .item, .article-list .article",
    titleSelector: "a, .title, h2, h3",
    linkSelector: "a[href]",
    descSelector: ".desc, .summary, p"
};

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

//刷alpha - 单次交易
async function alphaBtnActionButtons(buyAdd, sellAdd, howMoney) {
    var firstPrice = $$(".flex-1.cursor-pointer")[0];
    var fprice = firstPrice.innerHTML;
    console.log("获取价格：" + fprice);
    fprice = parseFloat(fprice) + parseFloat(buyAdd);
    var sellprice = fprice - parseFloat(sellAdd);
    console.log("买入价格：" + fprice);
    console.log("卖出价格：" + sellprice);

    //设置买入价格
    var tempInput = $("#limitPrice");
    tempInput.value = "";
    await sleep(100);
    typeLikeUser(tempInput, fprice.toString(), { delay: 10 });
    await sleep(200);

    //填入数量
    var numInput = $$("#limitTotal")[0];
    numInput.value = "";
    await sleep(100);
    numInput.click();
    await sleep(100);
    typeLikeUser(numInput, howMoney.toString(), { delay: 10 });
    await sleep(200);

    //设置卖出价格
    tempInput = $$("#limitTotal")[1];
    tempInput.value = "";
    await sleep(100);
    typeLikeUser(tempInput, sellprice.toString(), { delay: 10 });
    await sleep(200);

    //点击购买
    $(".bn-button.bn-button__buy.data-size-middle.w-full").click();

    //等待确认按钮
    var qybtn = $(".bn-button.bn-button__primary.data-size-middle.w-full");
    var i = 0;
    while (qybtn == undefined || qybtn == null) {
        i++;
        if (i > 20) break;
        await sleep(300);
        qybtn = $(".bn-button.bn-button__primary.data-size-middle.w-full");
    }
    if (i > 20) {
        console.log("没有找到确认按钮");
    }

    //点击确认
    qybtn.click();

    return "";
}

// 全局交易状态
window.isTradingPaused = false;
window.currentTradeSession = null;

//多次交易执行函数
async function executeMultipleTrades(buyAdd, sellAdd, howMoney, tradeCount, tradeInterval) {
    tradeCount = parseInt(tradeCount) || 1;
    tradeInterval = parseInt(tradeInterval) || 5;

    console.log(`开始执行 ${tradeCount} 次交易，间隔 ${tradeInterval} 秒`);

    // 创建新的交易会话ID
    const sessionId = Date.now();
    window.currentTradeSession = sessionId;

    for (let i = 1; i <= tradeCount; i++) {
        // 检查是否被暂停或会话已更改
        if (window.isTradingPaused || window.currentTradeSession !== sessionId) {
            console.log('交易已被暂停或停止');
            return "交易已暂停";
        }

        console.log(`执行第 ${i}/${tradeCount} 次交易`);

        try {
            await alphaBtnActionButtons(buyAdd, sellAdd, howMoney);
            console.log(`第 ${i} 次交易完成`);

            // 如果不是最后一次交易，等待间隔时间
            if (i < tradeCount) {
                console.log(`等待 ${tradeInterval} 秒后执行下次交易...`);

                // 在等待期间检查暂停状态
                for (let waitTime = 0; waitTime < tradeInterval; waitTime++) {
                    if (window.isTradingPaused || window.currentTradeSession !== sessionId) {
                        console.log('等待期间交易被暂停');
                        return "交易已暂停";
                    }
                    await sleep(1000); // 每秒检查一次暂停状态
                }
            }
        } catch (error) {
            console.error(`第 ${i} 次交易失败:`, error);
            // 即使失败也继续执行下次交易
            if (i < tradeCount) {
                await sleep(tradeInterval * 1000);
            }
        }
    }

    console.log(`所有 ${tradeCount} 次交易执行完成`);
    // 交易完成后重置状态
    window.currentTradeSession = null;
    return "";
}

// 从当前页面抓取列表数据
async function scrapeListData() {

    var btns = $$(".bn-tab.bn-tab__primary-gray.data-size-small.data-font-4");
    btns[1].click();
    await sleep(2000);
    btns[0].click();
    await sleep(2000);

    const list = $$(".bn-virtual-table > div > div");
    list.forEach((item, index) => {
        // 2.1 在每个 item 内按 class 查找
        // const titleEl = $(".t-caption1", item);          // 匹配 .title
        //const valueEl = $(".value", item);          // 匹配 .value


        //刷新
        //bn-tab bn-tab__primary-gray data-size-small data-font-4

        console.log(btns[1]);


        // await new Promise(r => setTimeout(r, 1000));



        const subdivs = $$(".t-caption1", item);     // 匹配多个 .sub-text
        var xx = subdivs[3].innerHTML;

        //const titles = $(".mr-[2px] t-caption2 cursor-pointer", item);
        const titles = $(".t-caption2.cursor-pointer", item);
        var title = titles.innerHTML;
        console.log(title + "=>>" + xx);
        //subdivs.forEach((sdiv, i) => {
        //    //var slll=$$("div", sdiv);

        //});




        //await new Promise(r => setTimeout(r, 1000));





        // 2.2 在每个 item 内按 id 查找（不推荐重复 id 的场景）
        //const idEl = $("#some-id", item);           // 仅在 item 内找 #some-id

        //// 2.3 在每个 item 内按“第几个”查找（结构固定时使用）
        //// 方式A：querySelector 的 :nth-child
        //const thirdChild = $(":scope > div:nth-child(3)", item); // item 的第3个直接子 div
        //// 方式B：先收集再用数组索引
        //const childDivs = $$(":scope > div", item);
        //const first = childDivs[0];
        //const second = childDivs[1];

        //// 2.4 取文本/属性
        //const title = (titleEl?.textContent || "").trim();
        //const value = (valueEl?.textContent || "").trim();
        //const idText = (idEl?.textContent || "").trim();
        //const thirdText = (thirdChild?.textContent || "").trim();

        //// 2.5 取链接/图片等属性
        //const linkHref = $("a", item)?.href || "";
        //const imgSrc = $("img", item)?.src || "";

        //// 2.6 打包结果
        //const row = {
        //    index,
        //    title,
        //    value,
        //    idText,
        //    thirdText,
        //    linkHref,
        //    imgSrc
        //};
        //console.log("row", row);
    });
    console.log("---------");



    return;



    const CONFIG = getConfig();
    const items = $$(CONFIG.listItemSelector);
    const rows = items.map(el => {
        const titleEl = $(CONFIG.titleSelector, el);
        const linkEl = $(CONFIG.linkSelector, el);
        const descEl = $(CONFIG.descSelector, el);
        return {
            title: toText(titleEl),
            link: linkEl && linkEl.href || "",
            desc: toText(descEl),
            _meta: {
                timestamp: Date.now(),
                location: location.href
            }
        };
    }).filter(r => r.title || r.link || r.desc);

    log("Scraped items:", rows.length, rows);
    await store.set("lastScraped", rows);
    return rows;
}




// 供 popup/background 调用的命令执行器
async function handleCommand(cmd, payload) {
    switch (cmd) {
        case "alphaBtn":
            const { buyAdd, sellAdd, howMoney, tradeCount, tradeInterval } = payload || {};
            // 重置暂停状态，开始新的交易
            window.isTradingPaused = false;
            return await executeMultipleTrades(buyAdd, sellAdd, howMoney, tradeCount, tradeInterval);
        case "stopTrading":
            window.isTradingPaused = true;
            window.currentTradeSession = null;
            console.log('交易已停止');
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