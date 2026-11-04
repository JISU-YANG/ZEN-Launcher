const { spawn } = require('node:child_process');

const FULLSCREEN_EDGE_TOLERANCE_PX = 8;

function isFiniteRect(rect) {
    return Boolean(rect)
        && [rect.left, rect.top, rect.right, rect.bottom].every((value) => Number.isFinite(value))
        && rect.right >= rect.left
        && rect.bottom >= rect.top;
}

function coversMonitor(windowRect, monitorRect, tolerance = FULLSCREEN_EDGE_TOLERANCE_PX) {
    if (!isFiniteRect(windowRect) || !isFiniteRect(monitorRect)) {
        return false;
    }

    return Math.abs(windowRect.left - monitorRect.left) <= tolerance
        && Math.abs(windowRect.top - monitorRect.top) <= tolerance
        && Math.abs(windowRect.right - monitorRect.right) <= tolerance
        && Math.abs(windowRect.bottom - monitorRect.bottom) <= tolerance;
}

function shouldReduceResourcesDuringFullscreen(enabled, otherAppFullscreen, launcherFocused) {
    return enabled === true && otherAppFullscreen === true && launcherFocused !== true;
}

function readNativeWindowHandle(buffer) {
    if (!buffer || typeof buffer.length !== 'number' || buffer.length < 4) {
        return 0n;
    }

    if (buffer.length >= 8) {
        return buffer.readBigUInt64LE(0);
    }

    return BigInt(buffer.readUInt32LE(0));
}

function createProbeStreamDecoder() {
    let raw = Buffer.alloc(0);
    let encoding = null;

    const detectEncoding = () => {
        if (encoding || raw.length < 2) {
            return;
        }

        if (raw[0] === 0xFF && raw[1] === 0xFE) {
            encoding = 'utf16le';
            raw = raw.subarray(2);
            return;
        }

        encoding = raw[1] === 0x00 ? 'utf16le' : 'utf8';
    };

    return {
        push(chunk) {
            const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            raw = raw.length === 0 ? nextChunk : Buffer.concat([raw, nextChunk]);
            detectEncoding();
            if (!encoding) {
                return [];
            }

            const newline = encoding === 'utf16le'
                ? Buffer.from([0x0A, 0x00])
                : Buffer.from([0x0A]);
            const lines = [];
            let newlineIndex = raw.indexOf(newline);

            while (newlineIndex !== -1) {
                const line = raw
                    .subarray(0, newlineIndex)
                    .toString(encoding)
                    .replace(/\u0000/g, '')
                    .replace(/\r$/, '')
                    .trim();
                raw = raw.subarray(newlineIndex + newline.length);
                if (line) {
                    lines.push(line);
                }
                newlineIndex = raw.indexOf(newline);
            }

            return lines;
        }
    };
}

function parseProbeLine(line) {
    if (line === 'ready') {
        return { type: 'ready' };
    }

    try {
        const sample = JSON.parse(line);
        if (!sample || typeof sample !== 'object') {
            return null;
        }

        return { type: 'sample', sample };
    } catch (_error) {
        return null;
    }
}

function isOtherAppFullscreenSample(sample, ownHwnd, tolerance = FULLSCREEN_EDGE_TOLERANCE_PX) {
    if (!sample || sample.ok !== true) {
        return false;
    }

    let foregroundHwnd = 0n;
    try {
        foregroundHwnd = BigInt(sample.foregroundHwnd);
    } catch (_error) {
        return false;
    }

    if (typeof ownHwnd === 'bigint' && ownHwnd !== 0n && foregroundHwnd === ownHwnd) {
        return false;
    }

    return coversMonitor(
        {
            left: Number(sample.left),
            top: Number(sample.top),
            right: Number(sample.right),
            bottom: Number(sample.bottom)
        },
        {
            left: Number(sample.monitorLeft),
            top: Number(sample.monitorTop),
            right: Number(sample.monitorRight),
            bottom: Number(sample.monitorBottom)
        },
        tolerance
    );
}

class WindowsForegroundFullscreenProbe {
    constructor({
        powershellPath,
        scriptPath,
        requestTimeoutMs = 1500,
        startTimeoutMs = 8000
    } = {}) {
        this.powershellPath = powershellPath;
        this.scriptPath = scriptPath;
        this.requestTimeoutMs = requestTimeoutMs;
        this.startTimeoutMs = startTimeoutMs;
        this.child = null;
        this.decoder = createProbeStreamDecoder();
        this.readyPromise = null;
        this.isReady = false;
        this.pending = null;
        this.finishReady = null;
        this.queue = Promise.resolve();
    }

    start() {
        if (this.child && this.isReady) {
            return Promise.resolve();
        }

        if (this.readyPromise) {
            return this.readyPromise;
        }

        this.decoder = createProbeStreamDecoder();
        this.isReady = false;
        this.readyPromise = new Promise((resolve, reject) => {
            let settled = false;
            let startTimer = null;
            const finishReady = (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(startTimer);
                this.finishReady = null;
                if (error) {
                    this.readyPromise = null;
                    this.isReady = false;
                    reject(error);
                    return;
                }

                this.isReady = true;
                resolve();
            };
            this.finishReady = finishReady;
            startTimer = setTimeout(() => {
                this.stop();
            }, this.startTimeoutMs);
            const child = spawn(this.powershellPath, [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                this.scriptPath
            ], {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.child = child;
            child.stdout.on('data', (chunk) => {
                const lines = this.decoder.push(chunk);
                lines.forEach((line) => {
                    const message = parseProbeLine(line);
                    if (!message) {
                        return;
                    }

                    if (message.type === 'ready') {
                        finishReady();
                        return;
                    }

                    if (message.type === 'sample' && this.pending) {
                        clearTimeout(this.pending.timeout);
                        const pending = this.pending;
                        this.pending = null;
                        pending.resolve(message.sample);
                    }
                });
            });
            child.on('error', (error) => {
                if (!this.isReady) {
                    finishReady(error);
                }
                this.#rejectPending(error);
            });
            child.on('exit', (code) => {
                const error = new Error(`Fullscreen probe exited (${code ?? 'unknown'}).`);
                if (!this.isReady) {
                    finishReady(error);
                }
                this.#rejectPending(error);
                if (this.child === child) {
                    this.child = null;
                    this.isReady = false;
                    this.readyPromise = null;
                }
            });
        });

        return this.readyPromise;
    }

    stop() {
        const child = this.child;
        const wasReady = this.isReady;
        const finishReady = this.finishReady;
        this.child = null;
        this.isReady = false;
        this.readyPromise = null;
        this.finishReady = null;
        this.#rejectPending(new Error('Fullscreen probe stopped.'));
        if (!wasReady && finishReady) {
            finishReady(new Error('Fullscreen probe stopped.'));
        }
        if (child && !child.killed) {
            child.kill();
        }
    }

    async isOtherAppFullscreen(ownHwnd) {
        await this.start();
        const sample = await this.#requestSample();
        return isOtherAppFullscreenSample(sample, ownHwnd);
    }

    #rejectPending(error) {
        if (!this.pending) {
            return;
        }

        clearTimeout(this.pending.timeout);
        const pending = this.pending;
        this.pending = null;
        pending.reject(error);
    }

    #requestSample() {
        const request = () => new Promise((resolve, reject) => {
            if (!this.child || !this.isReady) {
                reject(new Error('Fullscreen probe is not running.'));
                return;
            }

            const timeout = setTimeout(() => {
                this.pending = null;
                this.stop();
                reject(new Error('Fullscreen probe timed out.'));
            }, this.requestTimeoutMs);

            this.pending = { resolve, reject, timeout };
            this.child.stdin.write('\n');
        });
        const queued = this.queue.catch(() => {}).then(request);
        this.queue = queued;
        return queued;
    }
}

module.exports = {
    FULLSCREEN_EDGE_TOLERANCE_PX,
    WindowsForegroundFullscreenProbe,
    coversMonitor,
    createProbeStreamDecoder,
    isOtherAppFullscreenSample,
    parseProbeLine,
    readNativeWindowHandle,
    shouldReduceResourcesDuringFullscreen
};
