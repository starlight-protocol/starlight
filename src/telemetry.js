const fs = require('fs');
const path = require('path');

class TelemetryEngine {
    constructor(filePath) {
        this.filePath = filePath;
        this.refresh();
    }

    refresh() {
        if (fs.existsSync(this.filePath)) {
            try {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                return this.data;
            } catch (e) {
                console.error('[Telemetry] Failed to load data:', e.message);
            }
        }
        this.data = {
            totalMissions: 0,
            successfulMissions: 0,
            totalSavedSeconds: 0,
            totalInterventions: 0,
            avgRecoveryTimeMs: 0,
            lastMissionTimestamp: null,
            missionHistory: []
        };
        return this.data;
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('[Telemetry] Failed to save data:', e.message);
        }
    }

    recordMission(success, savedSeconds, interventions = 0, recoveryTimes = []) {
        this.data.totalMissions++;
        if (success) this.data.successfulMissions++;
        this.data.totalSavedSeconds += savedSeconds;
        this.data.totalInterventions += interventions;
        this.data.lastMissionTimestamp = new Date().toISOString();

        // Update MTTR
        if (recoveryTimes.length > 0) {
            const sum = recoveryTimes.reduce((a, b) => a + b, 0);
            const missionAvg = sum / recoveryTimes.length;
            if (this.data.avgRecoveryTimeMs === 0) {
                this.data.avgRecoveryTimeMs = missionAvg;
            } else {
                // Moving average
                this.data.avgRecoveryTimeMs = (this.data.avgRecoveryTimeMs * 0.7) + (missionAvg * 0.3);
            }
        }

        // Keep rolling history of last 10 missions
        this.data.missionHistory.push({
            timestamp: this.data.lastMissionTimestamp,
            success,
            savedSeconds
        });
        if (this.data.missionHistory.length > 10) {
            this.data.missionHistory.shift();
        }

        this.save();
    }

    getStats() {
        const successRate = this.data.totalMissions > 0
            ? ((this.data.successfulMissions / this.data.totalMissions) * 100).toFixed(1)
            : 0;

        return {
            ...this.data,
            successRate: parseFloat(successRate),
            totalSavedMins: Math.floor(this.data.totalSavedSeconds / 60)
        };
    }
}

module.exports = TelemetryEngine;
