/**
 * Action Recorder - Captures user actions and generates intent files
 * Part of Phase 13.5: Test Recorder Feature
 */

const fs = require('fs');
const path = require('path');

class ActionRecorder {
    constructor() {
        this.isRecording = false;
        this.recordedSteps = [];
        this.startUrl = null;
        this.startTime = null;
        this.page = null;
        this.listeners = [];
    }

    /**
     * Start recording user actions on the given page.
     * @param {Page} page - Playwright page object
     */
    async startRecording(page) {
        if (this.isRecording) {
            console.log('[Recorder] Already recording');
            return;
        }

        this.page = page;
        this.isRecording = true;
        this.recordedSteps = [];
        this.startTime = new Date();
        this.startUrl = page.url();

        console.log('[Recorder] 🔴 Recording started');

        // Expose recording functions
        try {
            await page.exposeFunction('__cba_recordClick', (data) => {
                if (data.action === 'checkpoint') {
                    this.recordedSteps.push({
                        action: 'checkpoint',
                        goal: data.goal,
                        timestamp: Date.now()
                    });
                    console.log(`[Recorder] Checkpoint: "${data.goal}"`);
                    return;
                }
                this.recordedSteps.push({
                    action: 'click',
                    goal: data.goal,
                    selector: data.selector,
                    tagName: data.tagName,
                    stabilityHint: data.stability?.settleTime || 0,
                    timestamp: Date.now()
                });
                console.log(`[Recorder] Click: "${data.goal}" [Stability: ${data.stability?.settleTime || 0}ms]`);
            });
        } catch (e) {
            // Function might already be exposed
            console.log('[Recorder] Click function already exposed');
        }

        try {
            await page.exposeFunction('__cba_recordFill', (data) => {
                this.recordedSteps.push({
                    action: 'fill',
                    goal: data.goal,
                    selector: data.selector,
                    value: data.value,
                    stabilityHint: data.stability?.settleTime || 0,
                    timestamp: Date.now()
                });
                console.log(`[Recorder] Fill: "${data.goal}" [Stability: ${data.stability?.settleTime || 0}ms]`);
            });
        } catch (e) {
            console.log('[Recorder] Fill function already exposed');
        }

        try {
            await page.exposeFunction('__cba_stopRecording', () => {
                console.log('[Recorder] Stop requested via HUD');
                this.stopRecording();
            });
        } catch (e) {
            console.log('[Recorder] Stop function already exposed');
        }

        // Inject recording script into current page and on every navigation
        const injectRecordingScript = async () => {
            if (!this.isRecording) return;
            try {
                await page.evaluate(() => {
                    const initRecorder = () => {
                        if (window.__cba_recording_injected || !document.body) return;
                        window.__cba_recording_injected = true;

                        // Phase 16.5: No-Code Marker HUD
                        let isTaggingMode = false;
                        const hud = document.createElement('div');
                        hud.id = 'starlight-hud';
                        const shadow = hud.attachShadow({ mode: 'open' });
                        shadow.innerHTML = `
                            <style>
                                :host {
                                    position: fixed;
                                    bottom: 20px;
                                    right: 20px;
                                    z-index: 1000000;
                                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                                    pointer-events: auto;
                                }
                                .badge {
                                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                    color: white;
                                    padding: 8px 16px;
                                    border-radius: 20px;
                                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    gap: 8px;
                                    font-weight: 600;
                                    font-size: 14px;
                                    transition: transform 0.2s;
                                }
                                .badge:hover { transform: scale(1.05); }
                                .panel {
                                    display: none;
                                    background: #1e293b;
                                    color: white;
                                    padding: 12px;
                                    border-radius: 12px;
                                    margin-bottom: 10px;
                                    width: 220px;
                                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                                }
                                .panel.visible { display: block; }
                                .btn {
                                    display: block;
                                    width: 100%;
                                    padding: 8px;
                                    margin: 4px 0;
                                    background: #334155;
                                    border: none;
                                    color: white;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    text-align: left;
                                    font-size: 13px;
                                }
                                .btn:hover { background: #475569; }
                                .btn-tag.active { background: #ef4444; }
                            </style>
                            <div class="panel" id="panel">
                                <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">STARLIGHT RECORDER</div>
                                <button class="btn btn-tag" id="tag-btn">🏷️ Tag Next Click</button>
                                <button class="btn" id="checkpoint-btn">🚩 Add Checkpoint</button>
                                <button class="btn" id="stop-btn" style="color: #f87171;">⏹️ Stop Recording</button>
                            </div>
                            <div class="badge" id="badge">
                                🛰️ Starlight
                            </div>
                        `;
                        document.body.appendChild(hud);

                        const badge = shadow.getElementById('badge');
                        const panel = shadow.getElementById('panel');
                        const tagBtn = shadow.getElementById('tag-btn');
                        const checkpointBtn = shadow.getElementById('checkpoint-btn');
                        const stopBtn = shadow.getElementById('stop-btn');

                        badge.onclick = (e) => {
                            e.stopPropagation();
                            panel.classList.toggle('visible');
                        };

                        tagBtn.onclick = (e) => {
                            e.stopPropagation();
                            isTaggingMode = !isTaggingMode;
                            tagBtn.classList.toggle('active', isTaggingMode);
                            tagBtn.innerText = isTaggingMode ? '🎯 Click an element...' : '🏷️ Tag Next Click';
                        };

                        checkpointBtn.onclick = (e) => {
                            e.stopPropagation();
                            const name = prompt('Checkpoint Name:');
                            if (name) {
                                window.__cba_recordClick({ goal: `CHECKPOINT: ${name}`, selector: 'N/A', action: 'checkpoint' });
                            }
                        };

                        stopBtn.onclick = (e) => {
                            e.stopPropagation();
                            if (confirm('Stop recording?')) {
                                if (typeof window.__cba_stopRecording === 'function') {
                                    window.__cba_stopRecording();
                                }
                            }
                        };

                        // Phase 16: Mutation Fingerprinting (Stability Sensing)
                        let lastInteractionTime = 0;
                        let lastMutationTime = 0;
                        let mutationCount = 0;

                        const observer = new MutationObserver(() => {
                            lastMutationTime = Date.now();
                            mutationCount++;
                        });
                        observer.observe(document, { childList: true, subtree: true, attributes: true });

                        async function getStabilityHint() {
                            const start = Date.now();
                            const checkInterval = 100;
                            const settleWindow = 500;
                            const maxWait = 2000;

                            return new Promise(resolve => {
                                const check = setInterval(() => {
                                    const now = Date.now();
                                    const timeSinceLastMutation = now - lastMutationTime;
                                    const totalTime = now - start;

                                    if (timeSinceLastMutation >= settleWindow || totalTime >= maxWait) {
                                        clearInterval(check);
                                        const settleTime = lastInteractionTime > 0 ? (lastMutationTime - lastInteractionTime) : 0;
                                        resolve({
                                            settleTime: Math.max(0, settleTime),
                                            mutationCount: mutationCount
                                        });
                                    }
                                }, checkInterval);
                            });
                        }

                        function extractGoal(element) {
                            const ariaLabel = element.getAttribute('aria-label');
                            if (ariaLabel) return ariaLabel;
                            const title = element.getAttribute('title');
                            if (title) return title;
                            let text = element.innerText || element.textContent || '';
                            text = text.split('\n')[0];
                            text = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
                            text = text.replace(/\s+/g, ' ').trim();
                            if (!text || text.length > 50) {
                                if (element.id) return element.id;
                                if (element.className && typeof element.className === 'string') {
                                    return element.className.split(' ')[0];
                                }
                                return element.tagName.toLowerCase();
                            }
                            return text.substring(0, 40);
                        }

                        document.addEventListener('click', async (e) => {
                            if (e.target.closest('#starlight-hud')) return;

                            const el = e.target;
                            lastInteractionTime = Date.now();
                            mutationCount = 0;

                            let goal = extractGoal(el);
                            if (isTaggingMode) {
                                const customGoal = prompt('Enter semantic goal name:', goal);
                                if (customGoal) goal = customGoal;
                                isTaggingMode = false;
                                tagBtn.classList.remove('active');
                                tagBtn.innerText = '🏷️ Tag Next Click';
                            }

                            const selector = el.id ? `#${el.id}` :
                                el.className && typeof el.className === 'string'
                                    ? `.${el.className.split(' ').filter(c => c).join('.')}`
                                    : el.tagName.toLowerCase();

                            const stability = await getStabilityHint();

                            if (typeof window.__cba_recordClick === 'function') {
                                window.__cba_recordClick({
                                    goal: goal,
                                    selector: selector,
                                    stability: stability
                                });
                            }
                        }, true);

                        document.addEventListener('input', async (e) => {
                            const el = e.target;
                            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
                                lastInteractionTime = Date.now();
                                mutationCount = 0;

                                const goal = extractGoal(el);
                                const selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
                                const stability = await getStabilityHint();

                                if (typeof window.__cba_recordFill === 'function') {
                                    window.__cba_recordFill({
                                        goal: goal,
                                        selector: selector,
                                        value: el.value,
                                        stability: stability
                                    });
                                }
                            }
                        }, true);

                        console.log('[CBA Recorder] Injected with HUD and Stability Sensing');
                    };

                    if (document.body) {
                        initRecorder();
                    } else {
                        document.addEventListener('DOMContentLoaded', initRecorder);
                    }
                });
            } catch (e) {
                console.log('[Recorder] Could not inject script:', e.message);
            }
        };

        // Navigation listener - inject script and record URL
        const navHandler = async (frame) => {
            if (frame === page.mainFrame()) {
                const url = frame.url();
                if (url && url !== 'about:blank') {
                    this.recordedSteps.push({
                        action: 'goto',
                        url: url,
                        timestamp: Date.now()
                    });
                    console.log(`[Recorder] Navigation: ${url}`);
                }
                // Re-inject script on new page
                await injectRecordingScript();
            }
        };
        page.on('framenavigated', navHandler);
        this.listeners.push({ event: 'framenavigated', handler: navHandler });

        // Inject into current page
        await injectRecordingScript();

        console.log('[Recorder] Event listeners attached');
    }

    /**
     * Stop recording and return recorded steps.
     * @returns {object[]} Array of recorded steps
     */
    stopRecording() {
        if (!this.isRecording) {
            console.log('[Recorder] Not recording');
            return [];
        }

        this.isRecording = false;
        console.log(`[Recorder] ⏹️ Recording stopped. ${this.recordedSteps.length} steps captured.`);

        // Note: Can't fully remove injected scripts, but stopping the flag prevents new recordings
        return this.recordedSteps;
    }

    /**
     * Generate a test file from recorded steps.
     * @param {string} testDir - Directory to save test file
     * @param {string} name - Optional test name
     * @returns {string} Path to generated file
     */
    generateTestFile(testDir, name = null) {
        const steps = this.recordedSteps;
        if (steps.length === 0) {
            console.log('[Recorder] No steps to generate');
            return null;
        }

        const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
        const testName = name || `recorded_${timestamp}`;
        const fileName = `intent_${testName}.js`;
        const filePath = path.join(testDir, fileName);

        // Filter and deduplicate steps
        const filteredSteps = this._processSteps(steps);

        // Generate test code
        const code = this._generateCode(filteredSteps, testName);

        fs.writeFileSync(filePath, code);
        console.log(`[Recorder] ✅ Test file generated: ${fileName}`);

        return fileName;
    }

    /**
     * Process steps to remove duplicates and noise.
     */
    _processSteps(steps) {
        const processed = [];
        let lastAction = null;

        for (const step of steps) {
            // Skip duplicate consecutive clicks
            if (step.action === 'click' && lastAction?.action === 'click' &&
                step.goal === lastAction.goal) {
                continue;
            }

            // Skip duplicate consecutive navigations (same URL)
            if (step.action === 'goto' && lastAction?.action === 'goto' &&
                step.url === lastAction.url) {
                continue;
            }

            // Skip about:blank navigations
            if (step.action === 'goto' && step.url === 'about:blank') {
                continue;
            }

            // Skip empty goals
            if (step.action === 'click' && (!step.goal || step.goal.trim() === '')) {
                continue;
            }

            // Skip clicks with suspiciously long goals (likely captured parent container)
            if (step.action === 'click' && step.goal && step.goal.length > 40 &&
                (step.goal.includes('  ') || step.goal.split(' ').length > 6)) {
                continue;
            }

            processed.push(step);
            lastAction = step;
        }

        return processed;
    }

    /**
     * Generate intent runner code from steps.
     */
    _generateCode(steps, testName) {
        // Helper to sanitize goal text for JavaScript strings
        const sanitizeGoal = (text) => {
            if (!text) return '';
            return text
                .replace(/\r?\n/g, ' ')  // Replace newlines with spaces
                .replace(/\s+/g, ' ')     // Collapse multiple spaces
                .trim()
                .substring(0, 50)          // Limit length
                .replace(/'/g, "\\'");     // Escape single quotes
        };

        const stepsCode = steps.map((step, i) => {
            if (step.action === 'goto') {
                return `    console.log('[Mission] Step ${i + 1}: Navigating to ${step.url}...');\n    await runner.goto('${step.url}');\n`;
            } else if (step.action === 'checkpoint') {
                const goal = sanitizeGoal(step.goal);
                return `    console.log('[Mission] Step ${i + 1}: Checkpoint - ${goal}');\n    // await runner.checkpoint('${goal}');\n`;
            } else if (step.action === 'click') {
                const goal = sanitizeGoal(step.goal);
                const hint = step.stabilityHint ? `, { stabilityHint: ${step.stabilityHint} }` : '';
                return `    await runner.clickGoal('${goal}'${hint});`;
            } else if (step.action === 'fill') {
                const goal = sanitizeGoal(step.goal);
                const value = (step.value || '').replace(/'/g, "\\'");
                const hint = step.stabilityHint ? `, { stabilityHint: ${step.stabilityHint} }` : '';
                return `    await runner.fill('${step.selector}', '${value}'${hint});  // ${goal}`;
            }
            return '';
        }).filter(s => s).join('\n');

        return `/**
 * Auto-recorded Test: ${testName}
 * Generated: ${this.startTime.toISOString()}
 * Source URL: ${this.startUrl}
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();
    
    try {
        await runner.connect();
        console.log('[Mission] Starting recorded test: ${testName}');
        
${stepsCode}
        
        console.log('[Mission] ✅ All recorded steps completed!');
        await runner.finish('Recorded test complete');
    } catch (error) {
        console.error('[Mission] ❌ Test failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
`;
    }

    /**
     * Get current recorded steps (for live preview).
     */
    getSteps() {
        return this.recordedSteps;
    }
}

module.exports = ActionRecorder;
