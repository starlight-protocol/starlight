'use strict';

(() => {
    const byId = id => document.getElementById(id);
    const state = { agents: [], presets: [], runs: [], active: new Set(), selected: null, report: null,
        source: 'data-report', busy: false, connected: false, stopped: false, artifacts: new Map() };
    const statusNames = { completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
        running: 'Running', interrupted: 'Unfinished checkpoint', pending: 'Not started' };
    let streamController;
    let refreshVersion = 0;
    let runLoadVersion = 0;
    let token = '';
    const offlineMessage = 'The live connection was interrupted. Studio is reconnecting; displayed reports may be out of date until it reconnects.';
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    try {
        token = fragment.get('token') || sessionStorage.getItem('starlight.studio.token') || '';
        if (fragment.has('token')) sessionStorage.setItem('starlight.studio.token', token);
    } catch { token = fragment.get('token') || ''; }
    if (fragment.has('token')) history.replaceState(null, '', window.location.pathname + window.location.search);

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = String(content);
        return node;
    }

    function announce(message) { byId('announcement').textContent = message; }
    function notice(message = '') {
        byId('notice').textContent = message;
        byId('notice').hidden = !message;
    }
    function connected(value, label) {
        state.connected = value;
        const badge = byId('connection');
        badge.className = `connection ${value ? 'connected' : 'offline'}`;
        badge.replaceChildren(element('span', 'status-dot'), document.createTextNode(label));
        if (value && byId('notice').textContent === offlineMessage) notice();
        else if (!value && label === 'Reconnecting…' && byId('notice').hidden) notice(offlineMessage);
        updateRunButton();
    }

    async function request(route, { method = 'GET', body, signal } = {}) {
        const response = await fetch(route, {
            method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: signal || AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error'
        });
        if (!response.ok) {
            let data;
            try { data = await response.json(); } catch { /* Use the HTTP status when no JSON was returned. */ }
            const error = new Error(data?.error?.message || (typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`));
            error.status = response.status;
            if (response.status === 401 || data?.error?.code === 'UNAUTHORIZED') {
                state.stopped = true;
                streamController?.abort();
                connected(false, 'Session unavailable');
                notice('This Studio session could not be authenticated. Open the full Studio URL printed in your terminal again.');
            }
            throw error;
        }
        return response;
    }

    async function json(route, options) { return (await request(route, options)).json(); }
    function dateLabel(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
    function duration(value) {
        return typeof value !== 'number' ? '' : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
    }
    function runStatus(run) { return run.status === 'running' && !state.active.has(run.id) ? 'interrupted' : run.status; }
    function pretty(value) { return JSON.stringify(value, null, 2); }

    function renderPresets() {
        const list = byId('preset-list');
        list.replaceChildren();
        if (state.source !== 'custom' && !state.presets.some(preset => preset.id === state.source)) state.source = state.presets[0]?.id || '';
        for (const preset of state.presets) {
            const button = element('button', `preset-card${state.source === preset.id ? ' selected' : ''}`);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(state.source === preset.id));
            const symbol = element('span', 'preset-symbol', preset.id === 'data-report' ? '▥' : '⌁');
            symbol.setAttribute('aria-hidden', 'true');
            const content = element('div');
            content.append(element('h3', '', preset.label), element('p', '', preset.description),
                element('span', 'preset-kicker', preset.id === 'data-report' ? 'READ → CALCULATE → WRITE' : 'FETCH → CHECK → REPORT'));
            const check = element('span', 'preset-check', '✓');
            check.setAttribute('aria-hidden', 'true');
            button.append(symbol, content, check);
            button.addEventListener('click', () => { state.source = preset.id; renderPresets(); updateRunButton(); });
            list.append(button);
        }
        if (!state.presets.length) list.append(element('p', 'result-empty', 'No presets are available in this session.'));
        byId('select-custom').textContent = state.source === 'custom' ? 'Custom mission selected ✓' : 'Use this mission →';
        byId('selected-description').textContent = state.source === 'custom'
            ? 'Your mission will run with the custom agents loaded in this session.'
            : 'Each preset writes a real report and checks its result before completing.';
    }

    function updateRunButton() {
        const unavailable = state.source === 'custom' && !state.agents.length;
        const button = byId('run-mission');
        button.disabled = state.busy || !state.connected || !state.source || unavailable;
        button.firstElementChild.textContent = state.busy ? 'Starting mission…' : 'Run mission';
        if (unavailable) byId('selected-description').textContent = 'Start Studio with --agents <agents.js> to execute a custom mission. Presets are ready to run.';
    }

    function renderAgents() {
        byId('agent-count').textContent = String(state.agents.length);
        const list = byId('agent-list');
        list.replaceChildren();
        for (const agent of state.agents) {
            const item = element('div', 'agent-item');
            const label = element('div', '', agent.name);
            label.append(element('small', '', (agent.capabilities || []).join(' · ') || 'Custom agent'));
            item.append(element('span', 'status-dot'), label);
            list.append(item);
        }
        if (!state.agents.length) list.append(element('p', 'sidebar-empty', 'Built-in presets are ready. Load your agents with --agents to run custom missions.'));
        byId('custom-hint').textContent = state.agents.length
            ? `${state.agents.length} custom agent${state.agents.length === 1 ? '' : 's'} loaded: ${state.agents.map(agent => agent.name).join(', ')}. Validation checks mission structure; agents decide whether they can execute it. Keep credentials in agent configuration, outside mission JSON.`
            : 'Start Studio with --agents <agents.js> to execute your own mission. You can validate its structure here first. Keep credentials in agent configuration, outside mission JSON.';
    }

    function renderHistory() {
        byId('active-count').textContent = String(state.active.size);
        byId('saved-count').textContent = String(state.runs.length);
        const filter = byId('history-filter').value;
        const runs = state.runs.filter(run => filter === 'all' || runStatus(run) === filter);
        const list = byId('run-history');
        list.replaceChildren();
        for (const run of runs) {
            const status = runStatus(run);
            const button = element('button', `history-item${state.selected === run.id ? ' selected' : ''}`);
            button.type = 'button';
            if (state.selected === run.id) button.setAttribute('aria-current', 'true');
            button.title = run.goal;
            const meta = element('span', `history-meta ${status}`);
            meta.append(element('span', 'status-dot'), document.createTextNode(statusNames[status] || status), element('time', '', dateLabel(run.startedAt)));
            button.append(element('span', 'history-name', run.goal), meta);
            button.addEventListener('click', () => loadRun(run.id));
            list.append(button);
        }
        if (!runs.length) list.append(element('p', 'sidebar-empty', filter === 'all' ? 'No runs yet. Start a mission to build your history.' : 'No runs match this filter.'));
    }

    function upsertRun(run) {
        const summary = { id: run.id, goal: run.goal, status: run.status, startedAt: run.startedAt,
            finishedAt: run.finishedAt, totalSteps: run.mission?.steps?.length || 1,
            completedSteps: (run.steps || []).filter(step => step.status === 'completed').length };
        state.runs = [summary, ...state.runs.filter(item => item.id !== run.id)]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id)).slice(0, 100);
    }

    function valueNode(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return element('pre', 'value-pre', pretty(value));
        const values = element('dl', 'value-grid');
        for (const [key, item] of Object.entries(value)) {
            const row = element('div', 'value-row');
            row.append(element('dt', '', key), element('dd', '', item && typeof item === 'object' ? pretty(item) : String(item)));
            values.append(row);
        }
        return values;
    }

    function renderRun(run) {
        state.report = run;
        const status = runStatus(run);
        byId('empty-state').hidden = true;
        byId('run-detail').hidden = false;
        byId('run-goal').textContent = run.goal;
        byId('run-id').textContent = run.id;
        byId('run-time').textContent = `${dateLabel(run.startedAt)}${run.durationMs === undefined ? '' : ` · ${duration(run.durationMs)}`}`;
        const badge = byId('run-state');
        badge.className = `status-badge ${status}`;
        badge.textContent = statusNames[status] || status;
        byId('cancel-run').hidden = !state.active.has(run.id) || run.status !== 'running';
        byId('cancel-run').disabled = !state.connected;
        byId('cancel-run').textContent = 'Cancel run';
        const unfinishedStep = status !== 'running' && (run.steps || []).some(step => step.status === 'running');
        byId('run-warning').hidden = status !== 'interrupted' && !unfinishedStep;
        byId('run-warning').textContent = status === 'interrupted'
            ? 'This saved checkpoint has no active run in this Studio session. Work may have stopped after a side effect. Inspect the evidence before starting another mission; Studio does not replay unfinished work.'
            : 'This mission stopped without a recorded completion for one step. Its side effects may be unknown. Inspect the evidence before starting another mission; Studio does not replay unfinished work.';
        byId('run-error').hidden = !run.error;
        byId('run-error').textContent = run.error ? `${run.error.code}: ${run.error.message}` : '';
        const planned = run.mission?.steps || [run.goal];
        const steps = run.steps || [];
        byId('step-count').textContent = `${steps.filter(step => step.status === 'completed').length} / ${planned.length} complete`;
        const timeline = byId('timeline');
        timeline.replaceChildren();
        for (let index = 0; index < planned.length; index++) {
            const step = steps[index];
            const stepStatus = step?.status === 'running' && status !== 'running' ? 'interrupted' : step?.status || 'pending';
            const item = element('li', `timeline-step ${stepStatus}`);
            item.append(element('span', 'step-number', stepStatus === 'completed' ? '✓' : index + 1));
            const content = element('div');
            const goal = step?.goal || (typeof planned[index] === 'string' ? planned[index] : planned[index].goal);
            content.append(element('h4', 'step-title', goal));
            const meta = element('div', 'step-meta');
            meta.append(element('span', '', statusNames[stepStatus] || stepStatus));
            if (step?.durationMs !== undefined) meta.append(element('span', '', `· ${duration(step.durationMs)}`));
            content.append(meta);
            if (step?.result?.sentinel) content.append(element('div', 'step-agent', `↳ ${step.result.sentinel.name}`));
            if (step?.error) content.append(element('p', 'step-error', `${step.error.code}: ${step.error.message}`));
            const evidence = step?.result?.evidence ?? step?.error?.details?.evidence;
            if (evidence !== undefined) {
                const detail = element('details', 'step-evidence');
                detail.append(element('summary', '', 'Inspect evidence'), element('pre', '', pretty(evidence)));
                content.append(detail);
            }
            item.append(content);
            timeline.append(item);
        }
        const results = byId('result-content');
        results.replaceChildren();
        for (const step of steps) {
            if (step.result?.value === undefined) continue;
            const section = element('section', 'result-step');
            section.append(element('p', 'result-step-label', `STEP ${step.index} · ${step.result.sentinel?.name || 'Result'}`), valueNode(step.result.value));
            results.append(section);
        }
        if (!results.childElementCount) results.append(element('p', 'result-empty', status === 'running'
            ? 'Results appear here as agents finish their work.' : 'No completed values were recorded. Step errors and the full report may contain more detail.'));
        byId('report-json').textContent = pretty(run);
        byId('artifact-panel').hidden = true;
        if (run.status === 'completed') loadArtifact(run.id);
    }

    function showArtifact(id, artifact) {
        if (!artifact || state.selected !== id) return;
        byId('artifact-panel').hidden = false;
        byId('artifact-name').textContent = artifact.name;
        byId('artifact-text').textContent = artifact.text;
    }
    function cacheArtifact(id, artifact) {
        state.artifacts.delete(id);
        state.artifacts.set(id, artifact);
        while (state.artifacts.size > 50) state.artifacts.delete(state.artifacts.keys().next().value);
    }
    async function loadArtifact(id) {
        if (state.artifacts.has(id)) { showArtifact(id, state.artifacts.get(id)); return; }
        cacheArtifact(id, null);
        try {
            const artifact = await json(`/api/runs/${encodeURIComponent(id)}/artifact`);
            cacheArtifact(id, artifact);
            showArtifact(id, artifact);
        } catch (error) {
            if (error.status !== 404) {
                state.artifacts.delete(id);
                if (state.selected === id && !state.stopped) announce(`Artifact preview is unavailable: ${error.message}`);
            }
        }
    }

    async function loadRun(id) {
        const version = refreshVersion;
        const loadVersion = ++runLoadVersion;
        state.selected = id;
        state.report = null;
        byId('run-detail').hidden = true;
        byId('empty-state').hidden = false;
        byId('run-state').className = 'status-badge idle';
        byId('run-state').textContent = 'Loading report…';
        renderHistory();
        try {
            const report = await json(`/api/runs/${encodeURIComponent(id)}`);
            if (state.selected === id && loadVersion === runLoadVersion) {
                if (!state.report || version === refreshVersion) renderRun(report);
                announce(`Opened mission: ${report.goal}.`);
            }
        } catch (error) {
            if (state.selected === id && loadVersion === runLoadVersion && (!state.report || version === refreshVersion)) {
                byId('run-state').textContent = 'Report unavailable';
                notice(`Could not open the report: ${error.message}`);
            }
        }
    }

    async function refresh() {
        const version = ++refreshVersion;
        const data = await json('/api/state');
        if (version !== refreshVersion) return;
        state.agents = data.agents || [];
        state.presets = data.presets || [];
        state.runs = data.runs || [];
        state.active = new Set((data.activeRuns || []).map(run => run.id));
        if (data.storageError) notice(`Saved history could not be read: ${data.storageError.message} Live session reports are still shown.`);
        for (const run of data.activeRuns || []) upsertRun(run);
        renderPresets(); renderAgents(); renderHistory(); updateRunButton();
        if (state.selected) {
            const active = (data.activeRuns || []).find(run => run.id === state.selected);
            if (active) renderRun(active);
            else await loadRun(state.selected);
        }
    }

    function acceptEvent(event) {
        if (!event?.run?.id || !event.type) return;
        const run = event.run;
        refreshVersion++;
        if (run.status === 'running' && event.type !== 'run.persistence_failed') state.active.add(run.id);
        else state.active.delete(run.id);
        upsertRun(run);
        if (state.selected === run.id) renderRun(run);
        renderHistory();
        if (event.type === 'run.finished' || event.type === 'run.persistence_failed') announce(`Mission ${statusNames[run.status]?.toLowerCase() || run.status}: ${run.goal}.`);
    }

    async function stream() {
        let delay = 1000;
        while (!state.stopped) {
            try {
                streamController = new AbortController();
                const response = await request('/api/events', { signal: streamController.signal });
                connected(true, 'Live on localhost');
                await refresh();
                delay = 1000;
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let pending = '';
                let data = [];
                try {
                    while (!state.stopped) {
                        const chunk = await reader.read();
                        if (chunk.done) throw new Error('Event stream closed.');
                        pending += decoder.decode(chunk.value, { stream: true });
                        let newline;
                        while ((newline = pending.indexOf('\n')) !== -1) {
                            const line = pending.slice(0, newline).replace(/\r$/, '');
                            pending = pending.slice(newline + 1);
                            if (line === '') {
                                if (data.length) {
                                    try { acceptEvent(JSON.parse(data.join('\n'))); } catch { /* A malformed event must not replace saved history. */ }
                                    data = [];
                                }
                            } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
                        }
                    }
                } finally { reader.cancel().catch(() => {}); }
            } catch (error) {
                streamController?.abort();
                if (state.stopped) break;
                connected(false, 'Reconnecting…');
                if (state.report) renderRun(state.report);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * 2, 10000);
            }
        }
    }

    function readMission() {
        try { return JSON.parse(byId('mission-json').value); }
        catch { throw new Error('Mission JSON is not valid. Check the quotes, commas, and brackets.'); }
    }

    byId('mission-json').value = pretty({ goal: 'Describe the outcome you want', context: {}, constraints: {},
        steps: ['A goal one of your agents can handle'] });
    byId('history-filter').addEventListener('change', renderHistory);
    byId('refresh-history').addEventListener('click', async () => {
        try { await refresh(); announce('Run history refreshed.'); }
        catch (error) { notice(`Could not refresh history: ${error.message}`); }
    });
    byId('select-custom').addEventListener('click', () => {
        state.source = 'custom'; renderPresets(); updateRunButton(); announce('Custom mission selected.');
    });
    byId('mission-json').addEventListener('input', () => { byId('validation-result').textContent = ''; });
    byId('validate-mission').addEventListener('click', async () => {
        const button = byId('validate-mission');
        const result = byId('validation-result');
        button.disabled = true;
        try {
            const response = await json('/api/validate', { method: 'POST', body: { mission: readMission() } });
            result.className = '';
            result.textContent = `Valid structure · ${response.stepCount || response.mission.steps.length} step(s). Agent eligibility is checked during execution.`;
        } catch (error) { result.className = 'invalid'; result.textContent = error.message; }
        finally { button.disabled = false; }
    });
    byId('run-mission').addEventListener('click', async () => {
        if (state.busy) return;
        let body;
        try {
            const seconds = Number(byId('timeout').value);
            if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('Time budget must be a whole number from 1 to 3600 seconds.');
            body = { ...(state.source === 'custom' ? { mission: readMission() } : { preset: state.source }), timeoutMs: seconds * 1000 };
        } catch (error) { notice(error.message); return; }
        state.busy = true; notice(); updateRunButton();
        try {
            const { id } = await json('/api/runs', { method: 'POST', body });
            state.active.add(id);
            await loadRun(id);
            if (state.report) {
                upsertRun(state.report);
                if (state.report.status !== 'running') state.active.delete(id);
            }
            renderHistory();
            announce('Mission started. Follow its progress in Mission activity.');
        } catch (error) {
            notice(error.status ? `Could not start the mission: ${error.message}`
                : 'The response was interrupted. The mission may have started. Refresh run history before starting another; this request will not be repeated automatically.');
        } finally { state.busy = false; updateRunButton(); }
    });
    byId('cancel-run').addEventListener('click', async () => {
        const id = state.selected;
        if (!id || !state.active.has(id)) return;
        byId('cancel-run').disabled = true;
        try {
            await json(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
            announce('Cancellation requested. Completed work is preserved.');
            await loadRun(id);
        } catch (error) { notice(`Cancellation could not be confirmed: ${error.message}`); }
        finally { byId('cancel-run').disabled = !state.connected; }
    });

    function download(contents, filename, type) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const anchor = element('a');
        anchor.href = url;
        anchor.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    byId('copy-report').addEventListener('click', async () => {
        if (!state.report) return;
        try { await navigator.clipboard.writeText(pretty(state.report)); announce('Run report copied.'); byId('copy-report').textContent = 'Copied ✓'; }
        catch { notice('Clipboard access is unavailable. Use Download JSON or copy from the full report.'); }
        setTimeout(() => { byId('copy-report').textContent = 'Copy JSON'; }, 2000);
    });
    byId('download-report').addEventListener('click', () => {
        if (state.report) download(pretty(state.report) + '\n', `${state.report.id}.json`, 'application/json');
    });
    byId('download-artifact').addEventListener('click', () => {
        const artifact = state.artifacts.get(state.selected);
        if (artifact) download(artifact.text, artifact.name, 'text/markdown;charset=utf-8');
    });
    window.addEventListener('pagehide', () => { state.stopped = true; streamController?.abort(); });
    if (!token) {
        state.stopped = true;
        connected(false, 'Session link needed');
        notice('Open the complete Studio URL printed in your terminal to connect this tab. Its session key stays in this tab and is removed from the address bar.');
        byId('agent-list').replaceChildren(element('p', 'sidebar-empty', 'Connect to your local Studio to see its agents.'));
    } else stream();
})();
