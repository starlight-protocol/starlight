const fs = require('fs');
const lines = fs.readFileSync('hub_main.js', 'utf8').split('\n');
const part1 = lines.slice(0, 2677);
const part3 = lines.slice(2802);
let newCmd = `    async executeCommand(msg, retry = true) {
        const startTime = Date.now();
        const params = msg.params || msg;
        const cmdName = params.cmd;
        if (this.testMode) console.log(\`[CBA Hub] EXECUTE: \${cmdName} on \${params.selector || "Global"} (Goal: \${params.goal}, Key: \${params.key})\`);
        try {
            if (!this.browser) {
                const browserConfig = this.configLoader ? this.configLoader.getBrowserConfig() : (this.config.hub?.browser || {});
                const { SmartBrowserAdapter } = require('./src/smart_browser_adapter');
                this.browserAdapter = new SmartBrowserAdapter(browserConfig);
                this.browser = await this.browserAdapter.launch({ headless: this.headless, prewarm: true });
                await this.browserAdapter.newContext({});
                this.page = await this.browserAdapter.newPage();
            }
            if (this.page && !this.page.isClosed()) {
                if (cmdName === "goto") await this.page.goto(params.url);
                else if (cmdName === "click") await this.page.click(params.selector);
                else if (cmdName === "fill") await this.page.fill(params.selector, params.text);
                else if (cmdName === "press") {
                    const key = params.key;
                    if (!key) throw new Error("Missing key");
                    if (params.selector) await this.page.press(params.selector, key);
                    else await this.page.keyboard.press(key);
                }
                else if (cmdName === "type") {
                    const text = params.text;
                    if (!text) throw new Error("Missing text");
                    if (params.selector) await this.page.type(params.selector, text);
                    else await this.page.keyboard.type(text);
                }
                else if (cmdName === "scroll") {
                    if (params.selector) await this.page.locator(params.selector).scrollIntoViewIfNeeded();
                    else await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                }
                else if (cmdName === "select") await this.page.selectOption(params.selector, params.value);
                else if (cmdName === "hover") await this.page.hover(params.selector);
                else if (cmdName === "check") await this.page.check(params.selector);
                else if (cmdName === "uncheck") await this.page.uncheck(params.selector);
                else if (cmdName === "upload") {
                    const files = Array.isArray(params.files) ? params.files : [params.files];
                    await this.page.setInputFiles(params.selector, files);
                }
                else if (cmdName === "checkpoint") {
                    console.log(\`[CBA Hub] 🚩 Checkpoint reached: \${params.name}\`);
                }
            }
            return true;
        } catch (e) {
            console.warn(\`[CBA Hub] Command failure: \${e.message}\`);
            if (retry) {
                await new Promise(r => setTimeout(r, 200));
                return await this.executeCommand(msg, false);
            }
            return false;
        }
    }
`;

fs.writeFileSync('hub_main.js', part1.concat([newCmd]).concat(part3).join('\n'));
console.log('Hub repaired successfully.');
