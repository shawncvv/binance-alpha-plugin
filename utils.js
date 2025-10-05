// 工具库（非模块化）：暴露到 window.DOM_HELPER 与全局简写

(function () {
    const log = (...args) => console.log("[DOM-Helper]", ...args);

    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const $ = (selector, root = document) => root.querySelector(selector);

    function waitForSelector(selector, { timeout = 10000, root = document } = {}) {
        return new Promise((resolve, reject) => {
            const first = root.querySelector(selector);
            if (first) return resolve(first);

            const target = root === document ? document.documentElement : root;
            const obs = new MutationObserver(() => {
                const el2 = root.querySelector(selector);
                if (el2) {
                    obs.disconnect();
                    resolve(el2);
                }
            });
            obs.observe(target, { childList: true, subtree: true });

            if (timeout) {
                setTimeout(() => {
                    obs.disconnect();
                    reject(new Error("waitForSelector timeout: " + selector));
                }, timeout);
            }
        });
    }

    function toText(node) {
        return (node && node.textContent || "").trim();
    }

    function safeHTML(html) {
        const tpl = document.createElement("template");
        tpl.innerHTML = html;
        tpl.content.querySelectorAll("script").forEach(s => s.remove());
        return tpl.content;
    }

    function highlightElement(el, { color = "rgba(255, 235, 59, 0.5)", ms = 1200 } = {}) {
        const rect = el.getBoundingClientRect();
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed",
            left: rect.left + "px",
            top: rect.top + "px",
            width: rect.width + "px",
            height: rect.height + "px",
            background: color,
            borderRadius: "4px",
            pointerEvents: "none",
            zIndex: 2147483647
        });
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), ms);
    }

    const store = {
        get(key, defaultValue) {
            return new Promise(resolve => {
                chrome.storage.local.get([key], res => resolve(res[key] !== undefined ? res[key] : defaultValue));
            });
        },
        set(key, value) {
            return new Promise(resolve => {
                chrome.storage.local.set({ [key]: value }, resolve);
            });
        }
    };

    // 暴露到全局
    window.DOM_HELPER = { log, $$, $, waitForSelector, toText, safeHTML, highlightElement, store };
    // 同时提供全局简写（避免在 content.js 再引用 window.DOM_HELPER）
    window.log = log;
    window.$$ = $$;
    window.$ = $;
    window.waitForSelector = waitForSelector;
    window.toText = toText;
    window.safeHTML = safeHTML;
    window.highlightElement = highlightElement;
    window.store = store;
})();