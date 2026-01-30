/**
 * On-screen Debug Logger
 * Intercepts console methods and displays logs on an overlay.
 */
export function initDebugLogger() {
    const logContainer = document.createElement('div');
    logContainer.id = 'debug-console';
    logContainer.style.position = 'fixed';
    logContainer.style.bottom = '0';
    logContainer.style.left = '0';
    logContainer.style.width = '100%';
    logContainer.style.height = '300px';
    logContainer.style.overflowY = 'auto';
    logContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    logContainer.style.color = '#00ff00';
    logContainer.style.fontFamily = 'monospace';
    logContainer.style.fontSize = '12px';
    logContainer.style.padding = '10px';
    logContainer.style.zIndex = '9999';
    logContainer.style.pointerEvents = 'none'; // Let clicks pass through
    document.body.appendChild(logContainer);

    function logToScreen(type, args) {
        const msg = args.map(arg => {
            if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
            return String(arg);
        }).join(' ');
        const line = document.createElement('div');
        line.textContent = `[${type}] ${msg}`;
        line.style.borderBottom = '1px solid #333';
        if (type === 'ERROR') line.style.color = 'red';
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
        originalLog.apply(console, args);
        logToScreen('INFO', args);
    };

    console.error = (...args) => {
        originalError.apply(console, args);
        logToScreen('ERROR', args);
    };

    console.warn = (...args) => {
        originalWarn.apply(console, args);
        logToScreen('WARN', args);
    };

    window.addEventListener('error', (event) => {
        logToScreen('UNCAUGHT', [event.message, event.filename, event.lineno]);
    });

    window.addEventListener('unhandledrejection', (event) => {
        logToScreen('UNHANDLED PROMISE', [event.reason]);
    });
}
