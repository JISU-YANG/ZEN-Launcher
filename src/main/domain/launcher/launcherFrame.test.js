const test = require('node:test');
const assert = require('node:assert/strict');
const {
    computeLauncherFrame,
    sheetHeightForFit,
    boundsForSheet,
    shapeForSheet,
    PANEL_SHEET_HEIGHT
} = require('./launcherFrame');
const { resolveInitialIcons, DEFAULT_ICONS } = require('./defaultIcons');

test('places a 1080p dock with the previous bottom gap', () => {
    const frame = computeLauncherFrame({ x: 0, y: 0, width: 1920, height: 1080 });

    assert.equal(frame.width, 1200);
    assert.equal(frame.dockHeight, 420);
    assert.equal(frame.x, 360);
    assert.equal(frame.y, 528);
    assert.equal(frame.dockBottom, 948);
    assert.equal(frame.scale, 1);
    assert.equal(frame.availableAbove, 528 - 16);
});

test('keeps the same gap above a bottom taskbar', () => {
    const frame = computeLauncherFrame(
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 0, y: 0, width: 1920, height: 1080 }
    );

    assert.equal(frame.dockBottom, 948);
    assert.equal(frame.y, 528);
    assert.ok(frame.dockBottom < 1040);
});

test('keeps the dock inside a narrower logical work area', () => {
    const frame = computeLauncherFrame({ x: 0, y: 40, width: 1000, height: 720 });

    assert.equal(frame.width, 1000 - 32);
    assert.ok(frame.dockHeight <= 420);
    assert.ok(frame.dockBottom <= 760);
    assert.ok(frame.y >= 40);
    assert.ok(frame.scale < 1);
    assert.ok(frame.x >= 0);
});

test('keeps the window bounds still while the sheet only changes shape', () => {
    const frame = computeLauncherFrame({ x: 10, y: 0, width: 1920, height: 1080 });
    const closed = boundsForSheet(frame, 0);
    const open = boundsForSheet(frame, 300);

    assert.deepEqual(closed, open);
    assert.equal(closed.y + closed.height, frame.dockBottom);
    assert.equal(closed.y, 16);

    const shape = shapeForSheet(frame, 300);
    assert.equal(shape.height, frame.dockHeight + 300);
    assert.equal(shape.y + shape.height, closed.height);
    assert.equal(shapeForSheet(frame, 5000).height, closed.height);
});

test('sizes peek, panel, and workspace from the space above the dock', () => {
    assert.equal(sheetHeightForFit('peek', 620), 112);
    assert.equal(sheetHeightForFit('panel', 620), PANEL_SHEET_HEIGHT);
    assert.equal(sheetHeightForFit('panel', PANEL_SHEET_HEIGHT), PANEL_SHEET_HEIGHT);
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
