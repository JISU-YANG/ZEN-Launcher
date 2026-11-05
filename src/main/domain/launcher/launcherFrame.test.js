const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeLauncherFrame,
    sheetHeightForFit,
    boundsForSheet
} = require('./launcherFrame');
const { resolveInitialIcons, DEFAULT_ICONS } = require('./defaultIcons');

test('places a 1080p work area dock on the bottom at the design width', () => {
    const frame = computeLauncherFrame({ x: 0, y: 0, width: 1920, height: 1080 });

    assert.equal(frame.width, 1200);
    assert.equal(frame.dockHeight, 420);
    assert.equal(frame.x, 360);
    assert.equal(frame.y, 660);
    assert.equal(frame.scale, 1);
    assert.equal(frame.availableAbove, 1080 - 420 - 16);
});

test('keeps the dock inside a narrower logical work area', () => {
    const frame = computeLauncherFrame({ x: 0, y: 40, width: 1000, height: 720 });

    assert.equal(frame.width, 1000 - 32);
    assert.ok(frame.dockHeight <= 420);
    assert.equal(frame.y + frame.dockHeight, 760);
    assert.ok(frame.scale < 1);
    assert.ok(frame.x >= 0);
});

test('grows the window upward by the sheet and never past the work area', () => {
    const frame = computeLauncherFrame({ x: 10, y: 0, width: 1920, height: 1080 });
    const bounds = boundsForSheet(frame, 300);

    assert.equal(bounds.width, frame.width);
    assert.equal(bounds.height, frame.dockHeight + 300);
    assert.equal(bounds.y + bounds.height, frame.workAreaY + frame.workAreaHeight);
    assert.equal(boundsForSheet(frame, 5000).height, frame.dockHeight + frame.availableAbove);
});

test('sizes peek, panel, and workspace from the space above the dock', () => {
    assert.equal(sheetHeightForFit('peek', 620), 112);
    assert.equal(sheetHeightForFit('panel', 620), Math.min(620, Math.max(220, Math.round(620 * 0.42))));
    assert.equal(sheetHeightForFit('workspace', 620), 620);
    assert.equal(sheetHeightForFit('panel', 180), 180);
    assert.equal(sheetHeightForFit('closed', 620), 0);
});

test('seeds six default tools once and does not overwrite an existing icon row', () => {
    const seeded = resolveInitialIcons({ iconsSeeded: false, items: [] });
    assert.equal(seeded.replaceItems, true);
    assert.deepEqual(seeded.items.map((item) => item.name), DEFAULT_ICONS.map((item) => item.name));

    const existing = resolveInitialIcons({
        iconsSeeded: false,
        items: [{ name: 'Notion', link: 'notion.exe', img: '' }]
    });
    assert.equal(existing.replaceItems, false);
    assert.equal(existing.items.length, 1);

    const again = resolveInitialIcons({ iconsSeeded: true, items: [] });
    assert.equal(again.changed, false);
    assert.equal(again.items.length, 0);
});
