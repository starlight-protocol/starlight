/**
 * ReportGenerator - World-Class Mission Forensics (v4.5)
 * ====================================================
 * 
 * 1:1 RESTORATION OF LEGACY REPORT DESIGN FROM HUB_MAIN.JS
 * ENHANCED WITH FULL FIDELITY TELEMETRY & SECURITY TRACE.
 */

const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class ReportGenerator {
    static generate(data, outputPath) {
        const { commands = [], sentinels = [], context = {} } = data;

        const stats = data.stats || context.stats || { successRate: 0, totalSavedMins: 0, avgRecoveryTimeMs: 0 };
        const securityEvents = context.securityEvents || [];
        const a11yReport = context.accessibility || context.a11yReport || null;
        const missionExecutionDate = data.missionExecutionDate || new Date().toLocaleString();

        const totalCmds = commands.length;
        const failedCommands = commands.filter(c => c.type === 'FAILURE' || (c.type === 'COMMAND' && !c.success));
        const hasFailure = failedCommands.length > 0;

        const statusText = !hasFailure ? 'MISSION SUCCESS' : 'MISSION COMPROMISED';
        const statusEmoji = !hasFailure ? '🏆' : '⚠️';
        const statusColor = !hasFailure ? '#10B981' : '#f43f5e';

        const totalInterventions = commands.filter(c => c.type === 'HIJACK').length;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Starlight Protocol | Hero Story Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0a0a0a;
            --bg-secondary: #111111;
            --bg-card: #161616;
            --accent: #10B981;
            --accent-red: #f43f5e;
            --accent-blue: #3b82f6;
            --text-primary: #ffffff;
            --text-secondary: #94a3b8;
            --border: #222222;
        }

        * { box-sizing: border-box; }
        body { 
            font-family: 'Inter', sans-serif; 
            background: var(--bg-primary); 
            color: var(--text-primary); 
            margin: 0; 
            padding: 4rem;
            max-width: 1400px;
            margin: auto; 
            line-height: 1.6;
        }

        .hero-header { 
            text-align: center; 
            padding: 6rem 2rem; 
            background: var(--bg-secondary); 
            border-radius: 30px; 
            margin-bottom: 4rem; 
            border: 2px solid ${statusColor}; 
            position: relative;
            box-shadow: 0 0 50px rgba(0,0,0,0.5);
            overflow: hidden;
        }

        .hero-header::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(circle at 50% 50%, ${statusColor}1A, transparent 70%);
            pointer-events: none;
        }

        .hero-header h1 { font-size: 3.5rem; font-weight: 800; margin-bottom: 1rem; letter-spacing: -0.04em; }
        .hero-header p { color: var(--text-secondary); font-size: 1.3rem; }

        /* Vitals Dashboard */
        .vitals-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 2rem;
            margin-bottom: 4rem;
        }
        .vital-card {
            background: var(--bg-card);
            border-radius: 24px;
            padding: 2.5rem;
            border: 1px solid var(--border);
            text-align: center;
        }
        .vital-label { color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 1rem; }
        .vital-value { font-size: 3rem; font-weight: 800; color: var(--accent); }
        .vital-unit { font-size: 1rem; color: var(--text-secondary); margin-left: 0.5rem; }

        .card { 
            background: var(--bg-card); 
            border-radius: 20px; 
            padding: 3rem; 
            margin-bottom: 3rem; 
            border: 1px solid var(--border); 
            position: relative; 
            transition: all 0.3s ease;
        }
        .card:hover { border-color: var(--accent); transform: translateY(-5px); }

        .hijack { border-left: 10px solid var(--accent-red); background: linear-gradient(90deg, #f43f5e05, transparent); }
        .command { border-left: 10px solid var(--accent); }
        .failure { border-left: 10px solid var(--accent-red); background: #f43f5e0a; }

        .tag { 
            position: absolute; 
            top: 2rem; 
            right: 2rem; 
            padding: 0.6rem 1.4rem; 
            border-radius: 30px; 
            font-size: 0.8rem; 
            font-weight: 800; 
            text-transform: uppercase; 
            letter-spacing: 0.1em;
        }
        .tag-hijack { background: var(--accent-red); color: white; }
        .tag-command { background: var(--accent); color: var(--bg-primary); }

        img { 
            width: 100%; 
            border-radius: 16px; 
            margin-top: 2rem; 
            border: 1px solid var(--border); 
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            transition: transform 0.4s ease;
        }
        img:hover { transform: scale(1.02); }

        .flex { display: flex; gap: 3rem; margin-top: 2.5rem; }
        .flex > div { flex: 1; }

        .meta { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.8rem; font-family: 'JetBrains Mono', monospace; }
        .card-title { font-size: 1.8rem; font-weight: 800; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem; }
        
        .badge { padding: 0.4rem 1.2rem; border-radius: 30px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; }
        .badge-success { background: var(--accent); color: var(--bg-primary); }
        .badge-danger { background: var(--accent-red); color: white; }
        .badge-warning { background: #f59e0b; color: #0a0a0a; }

        /* Security & A11y Layers */
        .grid-layer { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; margin-top: 6rem; }
        .layer-box { 
            background: var(--bg-secondary); 
            border-radius: 30px; 
            padding: 3.5rem; 
            border: 1px solid var(--border); 
        }

        .sec-event { 
            padding: 1.5rem; 
            background: rgba(244, 63, 94, 0.05); 
            border-radius: 12px; 
            border-left: 3px solid var(--accent-red); 
            margin-bottom: 1rem;
        }

        .sentinel-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 2rem; }
        .sentinel-pill { 
            padding: 1.5rem; 
            background: var(--bg-card); 
            border-radius: 16px; 
            border: 1px solid var(--border); 
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .status-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }

        h2 { font-size: 2.5rem; font-weight: 800; margin-bottom: 2rem; letter-spacing: -0.03em; }
        code { background: rgba(255,255,255,0.08); padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.95em; }
    </style>
</head>
<body>
    <div class="hero-header">
        <div class="meta" style="color: var(--accent); margin-bottom: 1rem; font-weight: 800;">MISSION TIMESTAMP: ${escapeHtml(missionExecutionDate)}</div>
        <h1>${statusEmoji} Starlight Protocol: ${statusText}</h1>
        <p>Zero-Defect Autonomous Mission Forensics</p>
    </div>

    <!-- Vital Dashboard -->
    <div class="vitals-grid">
        <div class="vital-card">
            <div class="vital-label">Success Rate</div>
            <div class="vital-value">${stats.successRate}%</div>
        </div>
        <div class="vital-card">
            <div class="vital-label">Saved Effort</div>
            <div class="vital-value">${stats.totalSavedMins}<span class="unit">min</span></div>
        </div>
        <div class="vital-card">
            <div class="vital-label">Sovereign MTTR</div>
            <div class="vital-value">${Math.round(stats.avgRecoveryTimeMs)}<span class="unit">ms</span></div>
        </div>
        <div class="vital-card">
            <div class="vital-label">Interventions</div>
            <div class="vital-value">${totalInterventions}</div>
        </div>
    </div>

    <div id="timeline">
        ${commands.map(item => {
            if (item.type === 'HIJACK') {
                return `
                    <div class="card hijack">
                        <span class="tag tag-hijack">Sentinel Intervention</span>
                        <div class="meta">${escapeHtml(item.timestamp)}</div>
                        <div class="card-title">Sovereign Correction: ${escapeHtml(item.sentinel)}</div>
                        <p style="font-size: 1.2rem;"><strong>Remediation:</strong> ${escapeHtml(item.reason)}</p>
                        <img src="screenshots/${escapeHtml(item.screenshot)}" alt="Obstacle Detected" />
                    </div>
                `;
            } else if (item.type === 'FAILURE') {
                return `
                    <div class="card failure">
                        <span class="tag tag-hijack">Critical Termination</span>
                        <div class="meta">${escapeHtml(item.timestamp)}</div>
                        <div class="card-title" style="color: var(--accent-red);">Mission Halted</div>
                        <p style="font-size: 1.4rem; font-weight: 700;">${escapeHtml(item.reason)}</p>
                    </div>
                `;
            } else {
                const status = item.success ? 'SUCCESS' : 'FAILED';
                const badgeClass = item.success ? 'badge-success' : 'badge-danger';

                return `
                    <div class="card command">
                        <span class="tag tag-command">Intent</span>
                        <div class="meta">${escapeHtml(item.timestamp)} | ID: ${escapeHtml(item.id)}</div>
                        <div class="card-title">
                            <span>${escapeHtml(item.cmd).toUpperCase()}${item.goal ? ': ' + escapeHtml(item.goal) : ''}</span>
                            <span class="badge ${badgeClass}">${status}</span>
                        </div>
                        <p>Resolved Selector: <code>${escapeHtml(item.selector) || 'N/A'}</code></p>
                        <div class="flex">
                            <div>
                                <div class="meta">Before State</div>
                                <img src="screenshots/${escapeHtml(item.beforeScreenshot || 'none.png')}" alt="Before State" onerror="this.src='https://placehold.co/400x300?text=No+Data'">
                            </div>
                            <div>
                                <div class="meta">After State</div>
                                <img src="screenshots/${escapeHtml(item.afterScreenshot || 'none.png')}" alt="After State" onerror="this.src='https://placehold.co/400x300?text=No+Data'">
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('')}
    </div>

    <div class="grid-layer">
        <!-- Security Trace -->
        <div class="layer-box">
            <h2>🛡️ Security Audit</h2>
            <div class="meta" style="margin-bottom: 2rem;">SOC 2 Forensic Trace - Intercepted Protocol Violations</div>
            ${securityEvents.length > 0 ? securityEvents.map(e => `
                <div class="sec-event">
                    <div style="font-weight: 800; color: var(--accent-red); margin-bottom: 0.3rem;">VIOLATION DETECTED</div>
                    <div class="meta">${escapeHtml(e.timestamp)} | Client ID: ${escapeHtml(e.clientId)}</div>
                    <div>${escapeHtml(e.error)}</div>
                </div>
            `).join('') : '<p style="color: var(--accent); font-weight: 700;">✓ No Security Violations Detected during mission.</p>'}
        </div>

        <!-- A11y Audit -->
        <div class="layer-box">
            <h2>♿ Accessibility Audit</h2>
            ${a11yReport ? `
                <div style="display: flex; align-items: center; gap: 2rem; margin-bottom: 3rem;">
                    <div style="width: 120px; height: 120px; border-radius: 50%; border: 8px solid var(--accent); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; font-weight: 900; color: var(--accent);">
                        ${Math.round((a11yReport.score || 0) * 100)}%
                    </div>
                    <div>
                        <div style="font-size: 1.5rem; font-weight: 800;">${a11yReport.level || 'WCAG Compliance'}</div>
                        <div style="color: var(--text-secondary);">${a11yReport.violations?.length || 0} Critical Violations Found</div>
                    </div>
                </div>
                
                <div style="max-height: 400px; overflow-y: auto; padding-right: 1rem;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="text-align: left; border-bottom: 2px solid var(--border);">
                                <th style="padding: 1rem 0.5rem; color: var(--text-secondary);">Rule</th>
                                <th style="padding: 1rem 0.5rem; color: var(--text-secondary);">Impact</th>
                                <th style="padding: 1rem 0.5rem; color: var(--text-secondary);">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(a11yReport.violations || []).map(v => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 1rem 0.5rem; font-weight: 700; color: var(--accent);">${escapeHtml(v.rule || v.id)}</td>
                                    <td style="padding: 1rem 0.5rem;"><span class="badge ${v.impact === 'critical' || v.impact === 'serious' ? 'badge-danger' : 'badge-warning'}">${escapeHtml(v.impact)}</span></td>
                                    <td style="padding: 1rem 0.5rem; color: var(--text-secondary);">${escapeHtml(v.description || v.message)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p class="meta">No Accessibility Data available for this mission profile.</p>'}
        </div>
    </div>

    <!-- Sentinel Health -->
    <div style="margin-top: 6rem;">
        <h2>🔍 Sentinel Fleet Status</h2>
        <div class="sentinel-grid">
            ${sentinels.map(s => {
            const health = s.health || 'online';
            const dotColor = health === 'online' ? 'var(--accent)' : (health === 'offline' ? 'var(--accent-red)' : '#f59e0b');
            return `
                <div class="sentinel-pill">
                    <div class="status-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotColor};"></div>
                    <div>
                        <div style="font-weight: 800;">${escapeHtml(s.layer)} <span class="meta" style="font-size: 0.7rem; margin-left: 0.5rem; text-transform: uppercase;">(${escapeHtml(health)})</span></div>
                        <div class="meta" style="margin: 0;">Priority: ${s.priority} | ID: ${escapeHtml(s.id)}</div>
                    </div>
                </div>
                `;
        }).join('')}
        </div>
    </div>

    <div style="margin-top: 8rem; padding: 4rem; background: var(--bg-secondary); border-radius: 30px; border: 1px solid var(--border); text-align: center;">
        <h2>🚀 Business Value</h2>
        <p style="font-size: 1.4rem;">Starlight prevented <strong>${stats.totalSavedMins} minutes</strong> of manual triage effort by autonomously resolving environmental obstacles.</p>
        <p class="meta">Efficiency Score: ${(stats.successRate * 0.8 + (totalInterventions * 2)).toFixed(1)}/100</p>
    </div>
</body>
</html>`;

        fs.writeFileSync(outputPath, html, 'utf8');
    }
}

module.exports = { ReportGenerator };
