/**
 * ReportGenerator - High-Fidelity Analysis Layer (v4.0)
 * ====================================================
 * 
 * Responsibilities:
 * 1. Professional Data Visualization: Dashboard with ROI and success metrics.
 * 2. Sentinel Trace: Visualizes the contribution of each Sentinel in the constellation.
 * 3. Accessibility Forensics: Renders WCAG 2.1 audit data and impact scores.
 * 4. Step-by-Step Trace: Linked screenshots with semantic resolution mappings.
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
    /**
     * @param {Object} data - Aggregate mission data: { commands: [], sentinels: [], context: {} }
     * @param {string} outputPath - Path to save the report.html
     */
    static generate(data, outputPath) {
        const { commands = [], sentinels = [], context = {} } = data;

        const totalCmds = commands.length;
        const successCount = commands.filter(c => c.success).length;
        const allPassed = totalCmds > 0 && successCount === totalCmds;
        const missionStatus = allPassed ? 'PASSED' : 'FAILED';
        const successRate = totalCmds > 0 ? ((successCount / totalCmds) * 100).toFixed(1) : "0.0";

        // Latency Calculation (Robust ISO v4.0.22)
        let totalLatency = 0;
        if (commands.length > 1) {
            try {
                const start = new Date(commands[0].rawTimestamp || commands[0].timestamp).getTime();
                const end = new Date(commands[commands.length - 1].rawTimestamp || commands[commands.length - 1].timestamp).getTime();
                if (!isNaN(start) && !isNaN(end)) {
                    totalLatency = Math.max(0, (end - start) / 1000);
                }
            } catch (e) {
                totalLatency = 0.5;
            }
        } else if (commands.length === 1) {
            totalLatency = 0.5;
        }

        // A11y Metrics (Truthful Reporting v4.0.25)
        const a11y = context.accessibility || null;
        const a11yScore = a11y ? (a11y.score * 100).toFixed(0) : "N/A";

        // ROI Calculation (Legacy Starlight v4.0)
        // Formula: 5 mins triage baseline + actual intervention duration per obstacle
        let totalInterventionTime = 0;
        sentinels.forEach(s => {
            if (s.interventionTime) totalInterventionTime += s.interventionTime;
        });

        const minutesSaved = allPassed ? (5 + totalInterventionTime) : 0;
        const roi = minutesSaved.toFixed(1);

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Starlight Protocol v4.0 | Mission Forensics</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0a0a0a;
            --card-bg: #111111;
            --accent: #00ff88;
            --success: #00ff88;
            --fail: #ff4444;
            --warning: #fab005;
            --text-main: #ffffff;
            --text-dim: #999999;
            --glass: rgba(0, 255, 136, 0.03);
        }

        body { 
            font-family: 'Inter', sans-serif; 
            background: var(--bg); 
            color: var(--text-main); 
            margin: 0; 
            padding: 2rem; 
            line-height: 1.5;
        }

        .container { max-width: 1200px; margin: 0 auto; }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #334155;
        }

        .header h1 { margin: 0; font-size: 1.8rem; letter-spacing: -0.025em; font-weight: 700; color: var(--accent); }
        .header .version { color: var(--text-dim); font-size: 0.875rem; font-weight: 400; }

        .mission-badge {
            display: inline-block;
            padding: 0.5rem 1.5rem;
            border-radius: 9999px;
            font-weight: 800;
            font-size: 1.25rem;
            letter-spacing: 0.05em;
            margin-bottom: 2rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .mission-passed { background: #064e3b; color: var(--success); border: 1px solid var(--success); }
        .mission-failed { background: #450a0a; color: var(--fail); border: 1px solid var(--fail); }

        /* DASHBOARD SECTION */
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .stat-card {
            background: var(--card-bg);
            padding: 1.5rem;
            border-radius: 0.5rem;
            border: 1px solid #00ff8822;
            box-shadow: 0 4px 20px rgba(0, 255, 136, 0.05);
            position: relative;
            transition: transform 0.2s ease;
        }
        .stat-card:hover { transform: translateY(-2px); }

        .stat-card::after {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 4px; height: 100%;
            background: var(--accent);
        }
        .stat-card.failed::after { background: var(--fail); }
        .stat-card.success::after { background: var(--success); }
        .stat-card.warning::after { background: var(--warning); }

        .stat-card.success-card::after { background: var(--success); }
        .stat-card.fail-card::after { background: var(--fail); }
        .stat-card.warning-card::after { background: var(--warning); }

        .stat-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 0.5rem; }
        .stat-value { font-size: 2rem; font-weight: 700; display: flex; align-items: baseline; gap: 0.25rem; }
        .stat-unit { font-size: 0.875rem; font-weight: 400; color: var(--text-dim); }

        /* SENTINEL SECTION */
        .section-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; }
        .section-title::before { content: ''; width: 4px; height: 1.25rem; background: var(--accent); border-radius: 2px; }

        .sentinel-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 3rem;
        }

        .sentinel-card {
            background: #1e293b80;
            border: 1px dashed #334155;
            border-radius: 0.75rem;
            padding: 1rem;
            text-align: center;
        }

        .sentinel-icon { font-size: 1.5rem; margin-bottom: 0.5rem; display: block; }
        .sentinel-name { font-size: 0.875rem; font-weight: 600; }
        .sentinel-status { font-size: 0.75rem; margin-top: 0.25rem; }
        .status-online { color: var(--success); font-weight: 600; }
        .status-offline { color: var(--fail); font-weight: 600; }
        .status-degraded { color: var(--warning); font-weight: 600; }
        .status-idle { color: var(--text-dim); font-weight: 400; }

        /* ACCESSIBILITY SECTION */
        .a11y-panel {
            background: #1e293b;
            border-radius: 1rem;
            padding: 2rem;
            margin-bottom: 3rem;
            display: flex;
            gap: 2rem;
            align-items: center;
        }

        .a11y-score-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            border: 8px solid #334155;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        .a11y-score-circle .val { font-size: 1.8rem; font-weight: 700; color: ${parseInt(a11yScore) > 80 ? 'var(--success)' : (parseInt(a11yScore) > 50 ? 'var(--warning)' : 'var(--fail)')}; }
        .a11y-score-circle .lbl { font-size: 0.6rem; color: var(--text-dim); }

        .a11y-details { flex: 1; }
        .vulnerability-list { margin-top: 1rem; list-style: none; padding: 0; }
        .vulnerability-item { 
            background: #0f172a; 
            padding: 0.5rem 1rem; 
            border-radius: 0.5rem; 
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
            display: flex;
            justify-content: space-between;
        }

        /* COMMAND TRACE SECTION */
        .trace { display: flex; flex-direction: column; gap: 1.5rem; }
        .trace-node {
            background: var(--card-bg);
            border-radius: 1rem;
            border: 1px solid #334155;
            overflow: hidden;
        }

        .trace-header {
            padding: 1rem 1.5rem;
            background: #33415540;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .trace-title { display: flex; align-items: center; gap: 0.75rem; font-weight: 600; }
        .trace-id { color: var(--text-dim); font-size: 0.75rem; font-family: monospace; border: 1px solid #475569; padding: 0.1rem 0.4rem; border-radius: 4px; }

        .badge {
            font-size: 0.7rem;
            font-weight: 700;
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            text-transform: uppercase;
        }
        .badge-success { background: #064e3b; color: var(--success); }
        .badge-fail { background: #450a0a; color: var(--fail); }

        .trace-body { padding: 1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .visual-box { }
        .visual-label { font-size: 0.75rem; color: var(--text-dim); margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; }
        .visual-img { width: 100%; border-radius: 0.5rem; border: 1px solid #334155; aspect-ratio: 4/3; object-fit: cover; background: #0f172a; }

        .mapping-info { grid-column: span 2; padding-top: 1rem; border-top: 1px dashed #334155; font-size: 0.875rem; display: flex; gap: 2rem; }
        .mapping-item { display: flex; flex-direction: column; }
        .mapping-label { font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; }
        .mapping-value { color: var(--accent); font-family: monospace; }

        .vulnerability-list { list-style: none; padding: 0; margin-top: 1rem; border-top: 1px dashed #334155; padding-top: 1rem; }
        .vulnerability-item { display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.5rem; color: var(--text-dim); }
        .vulnerability-item span strong { color: var(--text-main); }
        
        @media (max-width: 768px) {
            .trace-body { grid-template-columns: 1fr; }
            .a11y-panel { flex-direction: column; text-align: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Mission Control Forensics</h1>
            <div class="version">Starlight Protocol v4.0.21 [Modular Mode]</div>
        </div>

        <div style="text-align: center;">
            <div class="mission-badge ${allPassed ? 'mission-passed' : 'mission-failed'}">
                MISSION OVERALL STATUS: ${missionStatus}
            </div>
        </div>

        <!-- DASHBOARD -->
        <div class="dashboard">
            <div class="stat-card ${allPassed ? 'success' : 'failed'}">
                <div class="stat-label">Success Rate</div>
                <div class="stat-value">${successRate}<span class="stat-unit">%</span></div>
            </div>
            <div class="stat-card ${allPassed ? 'success' : 'failed'}">
                <div class="stat-label">Automation Efficiency</div>
                <div class="stat-value">~${roi}<span class="stat-unit">Minutes Saved</span></div>
            </div>
            <div class="stat-card ${a11y ? 'warning' : ''}">
                <div class="stat-label">A11y Score</div>
                <div class="stat-value">${a11yScore}<span class="stat-unit">WCAG</span></div>
            </div>
            <div class="stat-card" style="border-color: ${context.securityEvents?.length > 0 ? 'var(--fail)' : 'var(--success)'}">
                <div class="stat-label">Security Alerts</div>
                <div class="stat-value">${context.securityEvents?.length || 0}<span class="stat-unit">${context.securityEvents?.length === 1 ? 'Event' : 'Events'}</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Latency</div>
                <div class="stat-value">${totalLatency.toFixed(1)}<span class="stat-unit">s</span></div>
            </div>
        </div>

        <!-- SENTINEL CONSTELLATION -->
        <div class="section-title">Sentinel Constellation Status</div>
        <div class="sentinel-grid">
            ${sentinels.map(s => {
            const healthKey = s.layer.toLowerCase().replace('sentinel', '') + '_health';
            const statusKey = s.layer.toLowerCase().replace('sentinel', '') + '_status';
            const health = context[healthKey] || context[statusKey] || 'idle';
            const isOffline = health.toLowerCase().includes('offline') || health.toLowerCase().includes('failed');
            const isDegraded = health.toLowerCase().includes('degraded') || health.toLowerCase().includes('timeout');
            const isIdle = health.toLowerCase() === 'idle';

            return `
                <div class="sentinel-card">
                    <span class="sentinel-icon">${s.layer.includes('Pulse') ? '💓' : (s.layer.includes('Vision') ? '👁️' : (s.layer.includes('A11y') ? '♿' : (s.layer.includes('Janitor') ? '🧹' : '🚀')))}</span>
                    <div class="sentinel-name">${s.layer}</div>
                    <div class="sentinel-status ${isOffline ? 'status-offline' : (isDegraded ? 'status-degraded' : (isIdle ? 'status-idle' : 'status-online'))}">
                        ${health.toUpperCase()} [${(s.capabilities || []).join(', ')}]
                    </div>
                </div>
                `;
        }).join('')}
            ${sentinels.length === 0 ? '<div class="sentinel-card" style="grid-column: span 3">No Sentinels registered during this mission.</div>' : ''}
        </div>

        <!-- ACCESSIBILITY AUDIT -->
        <div class="section-title">Accessibility Compliance [WCAG 2.1 AA]</div>
        <div class="a11y-panel">
            <div class="a11y-score-circle">
                <span class="val">${a11yScore}</span>
                <span class="lbl">Compliance</span>
            </div>
            <div class="a11y-details">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">Audit Findings: ${a11y.violations?.length || 0} Issues Detected</div>
                <div style="font-size: 0.875rem; color: var(--text-dim)">
                    Last audited at: ${a11y.timestamp || 'N/A'}<br>
                    Context URL: ${a11y.url || 'N/A'}
                </div>
                <ul class="vulnerability-list">
                    ${a11y ? (a11y.violations || []).map(v => `
                        <li class="vulnerability-item">
                            <span><strong>${v.rule}:</strong> ${v.message}</span>
                            <span style="color: ${v.impact === 'critical' ? 'var(--fail)' : 'var(--warning)'}">${v.impact.toUpperCase()}</span>
                        </li>
                    `).join('') : '<li class="vulnerability-item" style="color: var(--text-dim)">No accessibility data available for this mission.</li>'}
                    ${a11y && (a11y.violations || []).length === 0 ? '<li class="vulnerability-item">Perfect Compliance! No issues detected by A11ySentinel.</li>' : ''}
                </ul>
            </div>
        </div>
        
        <!-- SECURITY FORENSICS -->
        <div class="section-title">Security Governance & Protocol Integrity</div>
        <div class="a11y-panel" style="border-left-color: var(--warning)">
            <div class="a11y-details" style="padding-left: 0;">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">Zero-Trust Security Log: ${context.securityEvents?.length || 0} Alerts</div>
                <ul class="vulnerability-list">
                    ${(context.securityEvents || []).map(e => `
                        <li class="vulnerability-item">
                            <span><strong>${new Date(e.timestamp).toLocaleTimeString()}:</strong> Security rejection from client ${e.clientId}</span>
                            <span style="color: var(--fail)">${e.error}</span>
                        </li>
                    `).join('')}
                    ${(context.securityEvents || []).length === 0 ? '<li class="vulnerability-item" style="color: var(--success)">✓ 100% Protocol Integrity: No schema or injection violations detected.</li>' : ''}
                </ul>
            </div>
        </div>

        <!-- COMMAND TRACE -->
        <div class="section-title">Mission Execution Trace</div>
        <div class="trace">
            ${commands.map((cmd, idx) => `
                <div class="trace-node" id="step-${idx}">
                    <div class="trace-header">
                        <div class="trace-title">
                            <span class="trace-id">#${idx + 1}</span>
                            <span>${cmd.goal && cmd.goal !== 'unknown' ? cmd.goal : (cmd.cmd || 'Direct Command')}</span>
                        </div>
                        <span class="badge ${cmd.success ? 'badge-success' : 'badge-fail'}">${cmd.success ? 'Passed' : 'Failed'}</span>
                    </div>
                    <div class="trace-body">
                        <div class="visual-box">
                            <div class="visual-label">Pre-Command State</div>
                            <img src="screenshots/${cmd.beforeScreenshot}" class="visual-img" onerror="this.src='https://placehold.co/800x600?text=No+Data'">
                        </div>
                        <div class="visual-box">
                            <div class="visual-label">Post-Command State</div>
                            <img src="screenshots/${cmd.afterScreenshot}" class="visual-img" onerror="this.src='https://placehold.co/800x600?text=No+Data'">
                        </div>
                        <div class="mapping-info">
                            <div class="mapping-item">
                                <span class="mapping-label">Resolved Selector</span>
                                <span class="mapping-value">${cmd.selector || 'N/A'}</span>
                            </div>
                            <div class="mapping-item">
                                <span class="mapping-label">Timestamp</span>
                                <span class="mapping-value">${cmd.timestamp}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <script>
        console.log("Starlight Report v4.0 Initialized");
    </script>
</body>
</html>
        `;

        fs.writeFileSync(outputPath, html, 'utf8');
    }
}

module.exports = { ReportGenerator };
