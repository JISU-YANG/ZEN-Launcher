const DESIGN_WIDTH = 1200;
const DOCK_HEIGHT = 420;
const FRAME_MARGIN = 16;
const SHEET_FITS = new Set(['peek', 'panel', 'workspace']);

function computeLauncherFrame(workArea) {
    const areaWidth = Math.max(0, Number(workArea?.width) || 0);
    const areaHeight = Math.max(0, Number(workArea?.height) || 0);
    const areaX = Number(workArea?.x) || 0;
    const areaY = Number(workArea?.y) || 0;
    const availableWidth = Math.max(0, areaWidth - (FRAME_MARGIN * 2));
    const width = Math.round(Math.min(DESIGN_WIDTH, availableWidth || areaWidth));
    const scale = width > 0 ? Math.min(1, width / DESIGN_WIDTH) : 1;
    const dockLimit = Math.max(0, areaHeight - FRAME_MARGIN);
    const dockHeight = Math.min(DOCK_HEIGHT, dockLimit || DOCK_HEIGHT);
    const availableAbove = Math.max(0, areaHeight - dockHeight - FRAME_MARGIN);
    const x = areaX + Math.round((areaWidth - width) / 2);
    const y = areaY + areaHeight - dockHeight;

    return {
        x,
        y,
        width,
        dockHeight,
        availableAbove,
        scale,
        workAreaX: areaX,
        workAreaY: areaY,
        workAreaWidth: areaWidth,
        workAreaHeight: areaHeight
    };
}

function sheetHeightForFit(fit, availableAbove) {
    const available = Math.max(0, Math.round(Number(availableAbove) || 0));
    if (!SHEET_FITS.has(fit)) {
        return 0;
    }

    if (fit === 'peek') {
        return Math.min(112, available);
    }

    if (fit === 'workspace') {
        return available;
    }

    const panelHeight = Math.max(220, Math.round(available * 0.42));
    return Math.min(available, panelHeight);
}

function boundsForSheet(frame, sheetHeight) {
    const extra = Math.max(0, Math.min(Math.round(Number(sheetHeight) || 0), frame.availableAbove));
    const height = frame.dockHeight + extra;

    return {
        x: frame.x,
        y: frame.workAreaY + frame.workAreaHeight - height,
        width: frame.width,
        height
    };
}

function normalizeSheetFit(fit) {
    return SHEET_FITS.has(fit) ? fit : 'closed';
}

module.exports = {
    DESIGN_WIDTH,
    DOCK_HEIGHT,
    FRAME_MARGIN,
    computeLauncherFrame,
    sheetHeightForFit,
    boundsForSheet,
    normalizeSheetFit
};
