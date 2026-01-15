/**
 * OpenTelemetry Integration for Starlight Protocol
 * 
 * Provides distributed tracing, metrics, and logging using OpenTelemetry standards.
 * Exports to OTLP-compatible backends (Jaeger, Zipkin, Grafana, Datadog, etc.)
 * 
 * @module observability/otel
 */

const { trace, metrics, context, SpanStatusCode, SpanKind } = require('@opentelemetry/api');

// Check if OpenTelemetry SDK is available
let otelAvailable = false;
let NodeTracerProvider, BatchSpanProcessor, OTLPTraceExporter;
let MeterProvider, PeriodicExportingMetricReader, OTLPMetricExporter;

try {
    NodeTracerProvider = require('@opentelemetry/sdk-trace-node').NodeTracerProvider;
    BatchSpanProcessor = require('@opentelemetry/sdk-trace-base').BatchSpanProcessor;
    OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter;
    MeterProvider = require('@opentelemetry/sdk-metrics').MeterProvider;
    PeriodicExportingMetricReader = require('@opentelemetry/sdk-metrics').PeriodicExportingMetricReader;
    OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-http').OTLPMetricExporter;
    otelAvailable = true;
} catch (e) {
    console.log('[OpenTelemetry] SDK not installed. Install with: npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-metrics @opentelemetry/exporter-metrics-otlp-http');
}

/**
 * OpenTelemetry configuration options.
 * @typedef {Object} OTelConfig
 * @property {boolean} enabled - Whether OpenTelemetry is enabled
 * @property {string} serviceName - Service name for traces/metrics
 * @property {string} endpoint - OTLP endpoint URL
 * @property {Object} headers - Custom headers for OTLP exporter
 * @property {number} exportIntervalMs - Metric export interval in milliseconds
 */

const DEFAULT_CONFIG = {
    enabled: false,
    serviceName: 'starlight-hub',
    endpoint: 'http://localhost:4318',
    headers: {},
    exportIntervalMs: 30000
};

/**
 * OpenTelemetry integration class for Starlight Protocol.
 */
class StarlightOTel {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tracer = null;
        this.meter = null;
        this.initialized = false;

        // Pre-defined metrics
        this.metrics = {
            missionDuration: null,
            missionCount: null,
            sentinelCount: null,
            preCheckDuration: null,
            errorCount: null,
            hijackCount: null
        };
    }

    /**
     * Initialize OpenTelemetry tracing and metrics.
     */
    init() {
        if (!this.config.enabled) {
            console.log('[OpenTelemetry] Disabled by config');
            return false;
        }

        if (!otelAvailable) {
            console.warn('[OpenTelemetry] SDK not available, metrics will be no-ops');
            return false;
        }

        try {
            // Initialize tracing
            const traceExporter = new OTLPTraceExporter({
                url: `${this.config.endpoint}/v1/traces`,
                headers: this.config.headers
            });

            const tracerProvider = new NodeTracerProvider();
            tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
            tracerProvider.register();

            this.tracer = trace.getTracer(this.config.serviceName, '1.0.0');

            // Initialize metrics
            const metricExporter = new OTLPMetricExporter({
                url: `${this.config.endpoint}/v1/metrics`,
                headers: this.config.headers
            });

            const meterProvider = new MeterProvider({
                readers: [
                    new PeriodicExportingMetricReader({
                        exporter: metricExporter,
                        exportIntervalMillis: this.config.exportIntervalMs
                    })
                ]
            });

            this.meter = meterProvider.getMeter(this.config.serviceName, '1.0.0');
            this.setupMetrics();

            this.initialized = true;
            console.log(`[OpenTelemetry] Initialized - exporting to ${this.config.endpoint}`);
            return true;
        } catch (error) {
            console.error('[OpenTelemetry] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Set up pre-defined metrics for Starlight operations.
     */
    setupMetrics() {
        if (!this.meter) return;

        // Mission duration histogram
        this.metrics.missionDuration = this.meter.createHistogram('starlight.mission.duration', {
            description: 'Duration of mission execution in milliseconds',
            unit: 'ms'
        });

        // Mission counter
        this.metrics.missionCount = this.meter.createCounter('starlight.mission.count', {
            description: 'Total number of missions executed'
        });

        // Active sentinel gauge
        this.metrics.sentinelCount = this.meter.createUpDownCounter('starlight.sentinel.active', {
            description: 'Number of active sentinels'
        });

        // Pre-check duration histogram
        this.metrics.preCheckDuration = this.meter.createHistogram('starlight.precheck.duration', {
            description: 'Duration of pre-check handshake in milliseconds',
            unit: 'ms'
        });

        // Error counter
        this.metrics.errorCount = this.meter.createCounter('starlight.error.count', {
            description: 'Total number of errors'
        });

        // Hijack counter
        this.metrics.hijackCount = this.meter.createCounter('starlight.hijack.count', {
            description: 'Total number of sentinel hijacks'
        });
    }

    /**
     * Start a new span for a mission.
     * @param {string} missionId - Unique mission identifier
     * @param {Object} attributes - Additional span attributes
     * @returns {Object} Span object
     */
    startMissionSpan(missionId, attributes = {}) {
        if (!this.tracer) {
            return { end: () => { }, setStatus: () => { }, setAttribute: () => { }, addEvent: () => { } };
        }

        return this.tracer.startSpan('starlight.mission', {
            kind: SpanKind.SERVER,
            attributes: {
                'mission.id': missionId,
                'service.name': this.config.serviceName,
                ...attributes
            }
        });
    }

    /**
     * Start a new span for a command execution.
     * @param {string} command - Command type (click, fill, goto, etc.)
     * @param {Object} attributes - Additional span attributes
     * @returns {Object} Span object
     */
    startCommandSpan(command, attributes = {}) {
        if (!this.tracer) {
            return { end: () => { }, setStatus: () => { }, setAttribute: () => { }, addEvent: () => { } };
        }

        return this.tracer.startSpan(`starlight.command.${command}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                'command.type': command,
                ...attributes
            }
        });
    }

    /**
     * Start a span for pre-check handshake.
     * @param {string} intentId - Intent identifier
     * @returns {Object} Span object
     */
    startPreCheckSpan(intentId) {
        if (!this.tracer) {
            return { end: () => { }, setStatus: () => { }, setAttribute: () => { }, addEvent: () => { } };
        }

        return this.tracer.startSpan('starlight.precheck', {
            kind: SpanKind.INTERNAL,
            attributes: {
                'intent.id': intentId
            }
        });
    }

    /**
     * Record mission completion metrics.
     * @param {number} durationMs - Mission duration in milliseconds
     * @param {boolean} success - Whether mission succeeded
     * @param {Object} attributes - Additional metric attributes
     */
    recordMission(durationMs, success, attributes = {}) {
        const labels = {
            success: String(success),
            ...attributes
        };

        if (this.metrics.missionDuration) {
            this.metrics.missionDuration.record(durationMs, labels);
        }

        if (this.metrics.missionCount) {
            this.metrics.missionCount.add(1, labels);
        }
    }

    /**
     * Record pre-check duration.
     * @param {number} durationMs - Pre-check duration in milliseconds
     * @param {string} response - Response type (clear, wait, hijack)
     */
    recordPreCheck(durationMs, response) {
        if (this.metrics.preCheckDuration) {
            this.metrics.preCheckDuration.record(durationMs, { response });
        }
    }

    /**
     * Record sentinel connection/disconnection.
     * @param {number} delta - +1 for connect, -1 for disconnect
     * @param {string} sentinelName - Name of the sentinel
     */
    recordSentinelChange(delta, sentinelName) {
        if (this.metrics.sentinelCount) {
            this.metrics.sentinelCount.add(delta, { sentinel: sentinelName });
        }
    }

    /**
     * Record an error.
     * @param {string} errorType - Type of error
     * @param {Object} attributes - Additional attributes
     */
    recordError(errorType, attributes = {}) {
        if (this.metrics.errorCount) {
            this.metrics.errorCount.add(1, { type: errorType, ...attributes });
        }
    }

    /**
     * Record a hijack event.
     * @param {string} sentinelName - Name of the sentinel that hijacked
     * @param {string} reason - Reason for hijack
     */
    recordHijack(sentinelName, reason) {
        if (this.metrics.hijackCount) {
            this.metrics.hijackCount.add(1, { sentinel: sentinelName });
        }
    }

    /**
     * Set span status to error.
     * @param {Object} span - The span to update
     * @param {Error} error - The error that occurred
     */
    setSpanError(span, error) {
        if (span && span.setStatus) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
            span.recordException(error);
        }
    }

    /**
     * Add event to span.
     * @param {Object} span - The span to update
     * @param {string} name - Event name
     * @param {Object} attributes - Event attributes
     */
    addSpanEvent(span, name, attributes = {}) {
        if (span && span.addEvent) {
            span.addEvent(name, attributes);
        }
    }

    /**
     * Get W3C Trace Context headers for propagation.
     * @returns {Object} Headers object with traceparent
     */
    getTraceHeaders() {
        const activeSpan = trace.getActiveSpan();
        if (!activeSpan) return {};

        const spanContext = activeSpan.spanContext();
        if (!spanContext) return {};

        const traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-01`;
        return { traceparent };
    }
}

// Singleton instance
let instance = null;

/**
 * Get or create the OpenTelemetry instance.
 * @param {OTelConfig} [config] - Configuration options (only used on first call)
 * @returns {StarlightOTel} The OpenTelemetry instance
 */
function getOTel(config) {
    if (!instance) {
        instance = new StarlightOTel(config);
    }
    return instance;
}

module.exports = {
    StarlightOTel,
    getOTel,
    SpanStatusCode,
    SpanKind
};
