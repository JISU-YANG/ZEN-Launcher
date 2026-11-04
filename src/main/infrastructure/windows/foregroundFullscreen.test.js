const test = require('node:test');
const assert = require('node:assert/strict');
const {
    coversMonitor,
    createProbeStreamDecoder,
    isOtherAppFullscreenSample,
    parseProbeLine,
    readNativeWindowHandle,
    shouldReduceResourcesDuringFullscreen
} = require('./foregroundFullscreen');

const monitor = { left: 0, top: 0, right: 1920, bottom: 1080 };

test('a window covering the monitor counts as fullscreen', () => {
    assert.equal(coversMonitor({ left: 0, top: 0, right: 1920, bottom: 1080 }, monitor), true);
});

test('a few pixels of border still count as fullscreen', () => {
    assert.equal(coversMonitor({ left: -4, top: -2, right: 1924, bottom: 1082 }, monitor), true);
});

test('a maximized window above the taskbar is not fullscreen', () => {
    assert.equal(coversMonitor({ left: -8, top: -8, right: 1928, bottom: 1040 }, monitor), false);
});

test('the launcher window itself does not block the shortcut', () => {
    const sample = {
        ok: true,
        foregroundHwnd: '42',
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        monitorLeft: 0,
        monitorTop: 0,
        monitorRight: 1920,
        monitorBottom: 1080
    };

    assert.equal(isOtherAppFullscreenSample(sample, 42n), false);
});

test('another app covering the monitor blocks the shortcut', () => {
    const sample = {
        ok: true,
        foregroundHwnd: '99',
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        monitorLeft: 0,
        monitorTop: 0,
        monitorRight: 1920,
        monitorBottom: 1080
    };

    assert.equal(isOtherAppFullscreenSample(sample, 42n), true);
});

test('a failed probe sample does not block the shortcut', () => {
    assert.equal(isOtherAppFullscreenSample({ ok: false }, 42n), false);
    assert.equal(parseProbeLine('not-json'), null);
    assert.deepEqual(parseProbeLine('ready'), { type: 'ready' });
});

test('probe output can arrive as utf-8 or utf-16', () => {
    const utf8 = createProbeStreamDecoder();
    assert.deepEqual(utf8.push(Buffer.from('ready\n{"ok":false}\n', 'utf8')), ['ready', '{"ok":false}']);

    const utf16 = createProbeStreamDecoder();
    const payload = Buffer.concat([
        Buffer.from([0xFF, 0xFE]),
        Buffer.from('ready\n{"ok":true}\n', 'utf16le')
    ]);
    assert.deepEqual(utf16.push(payload.subarray(0, 5)), []);
    assert.deepEqual(utf16.push(payload.subarray(5)), ['ready', '{"ok":true}']);
});

test('resource saving follows the fullscreen state and stays on by default only while another app is fullscreen', () => {
    assert.equal(shouldReduceResourcesDuringFullscreen(true, true, false), true);
    assert.equal(shouldReduceResourcesDuringFullscreen(true, false, false), false);
    assert.equal(shouldReduceResourcesDuringFullscreen(false, true, false), false);
    assert.equal(shouldReduceResourcesDuringFullscreen(true, true, true), false);
});

test('native window handles are read from Electron buffers', () => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(88n);
    assert.equal(readNativeWindowHandle(buffer), 88n);
    assert.equal(readNativeWindowHandle(null), 0n);
});
