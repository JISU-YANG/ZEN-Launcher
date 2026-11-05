const DESIGN_WIDTH = 1200;
const DOCK_HEIGHT = 420;
const FRAME_MARGIN = 16;
const PANEL_SHEET_HEIGHT = 400;
const SHEET_FITS = new Set(['peek', 'panel', 'workspace']);

function computeLauncherFrame(workArea, screenBounds = null) {
    const areaWidth = Math.max(0, Number(workArea?.width) || 0);
    const areaHeight = Math.max(0, Number(workArea?.height) || 0);
    const areaX = Number(workArea?.x) || 0;
    const areaY = Number(workArea?.y) || 0;
    const screenY = Number(screenBounds?.y ?? areaY) || 0;
    const screenHeight = Math.max(0, Number(screenBounds?.height ?? areaHeight) || 0);
    const availableWidth = Math.max(0, areaWidth - (FRAME_MARGIN * 2));
    const width = Math.round(Math.min(DESIGN_WIDTH, availableWidth || areaWidth));
    const scale = width > 0 ? Math.min(1, width / DESIGN_WIDTH) : 1;
    const dockLimit = Math.max(0, areaHeight - FRAME_MARGIN);
    const dockHeight = Math.min(DOCK_HEIGHT, dockLimit || DOCK_HEIGHT);
    const workBottom = areaY + areaHeight;
    const liftedBottom = screenY + Math.round((screenHeight - dockHeight) * 0.8) + dockHeight;
    const dockBottom = Math.min(workBottom, Math.max(areaY + dockHeight, liftedBottom));
    const y = dockBottom - dockHeight;
    const availableAbove = Math.max(0, y - areaY - FRAME_MARGIN);
    const x = areaX + Math.round((areaWidth - width) / 2);

    return {
        x,
        y,
        width,
        dockHeight,
        availableAbove,
        scale,
        dockBottom,
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

    return Math.min(available, PANEL_SHEET_HEIGHT);
}

function boundsForSheet(frame) {
    const height = frame.dockHeight + frame.availableAbove;

    return {
        x: frame.x,
        y: frame.y - frame.availableAbove,
        width: frame.width,
        height
    };
}

function shapeForSheet(frame, sheetHeight) {
    const extra = Math.max(0, Math.min(Math.round(Number(sheetHeight) || 0), frame.availableAbove));
    const windowHeight = frame.dockHeight + frame.availableAbove;

    return {
        x: 0,
        y: Math.max(0, windowHeight - frame.dockHeight - extra),
        width: frame.width,
        height: frame.dockHeight + extra
    };
}

function normalizeSheetFit(fit) {
    return SHEET_FITS.has(fit) ? fit : 'closed';
}

module.exports = {
    DESIGN_WIDTH,
    DOCK_HEIGHT,
    FRAME_MARGIN,
    PANEL_SHEET_HEIGHT,
    computeLauncherFrame,
    sheetHeightForFit,
    boundsForSheet,
    shapeForSheet,
    normalizeSheetFit
};
