const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('path');
const { execFile } = require('node:child_process');
const Store = require('electron-store');
const computer = require('electron-shutdown-command');

const store = new Store();
const CATEGORY_KEY_PREFIX = 'NPL.Data';
const CATEGORIES = ['gallery', 'icon', 'folder'];
const WINDOW_WIDTH = 1150;
const WINDOW_HEIGHT = 420;
const EXTERNAL_PROTOCOLS = ['http:', 'https:', 'ms-settings:'];
const DEV_RELOAD_FILES = ['index.html', 'renderer.js', 'preference.js'];
const DEV_RESTART_FILES = ['main.js', 'preload.js'];

let mainWindow = null;
let devWatchers = [];
let pendingRelaunch = false;

function getCategoryData() {
    return CATEGORIES.reduce((accumulator, category) => {
        const loadedData = store.get(`${CATEGORY_KEY_PREFIX}${category}`);
        accumulator[category] = Array.isArray(loadedData) ? loadedData : [];
        return accumulator;
    }, {});
}

function sanitizeItem(item, category) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const link = typeof item.link === 'string' ? item.link.trim() : '';
    const img = category !== 'folder' && typeof item.img === 'string' ? item.img.trim() : '';

    if (!link) {
        return null;
    }

    return { name, link, img };
}

function isAllowedExternalUrl(target) {
    try {
        const url = new URL(target);
        return EXTERNAL_PROTOCOLS.includes(url.protocol);
    } catch (_error) {
        return false;
    }
}

async function openExternalUrl(target) {
    if (!isAllowedExternalUrl(target)) {
        throw new Error('\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uC678\uBD80 \uB9C1\uD06C\uC785\uB2C8\uB2E4.');
    }

    await shell.openExternal(target);
}

async function runTarget(target) {
    if (typeof target !== 'string' || !target.trim()) {
        throw new Error('\uC2E4\uD589\uD560 \uB300\uC0C1\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
    }

    const normalizedTarget = target.trim();
    const targetExtension = path.extname(normalizedTarget).toLowerCase();

    if (normalizedTarget === 'shutdown') {
        await computer.shutdown();
        return;
    }

    if (normalizedTarget === 'reboot') {
        await computer.reboot();
        return;
    }

    if (isAllowedExternalUrl(normalizedTarget)) {
        await openExternalUrl(normalizedTarget);
        return;
    }

    if (targetExtension === '.exe') {
        await new Promise((resolve, reject) => {
            execFile(normalizedTarget, (error) => {
                if (error) {
                    reject(new Error(`\uC2E4\uD589 \uD30C\uC77C\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error.message}`));
                    return;
                }

                resolve();
            });
        });
        return;
    }

    const openResult = await shell.openPath(normalizedTarget);
    if (openResult) {
        throw new Error(`\uB300\uC0C1\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${openResult}`);
    }
}

function createWindow() {
    const { width: displayWidth, height: displayHeight } = screen.getPrimaryDisplay().size;

    const win = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        frame: false,
        transparent: true,
        resizable: false,
        x: Math.round((displayWidth - WINDOW_WIDTH) / 2),
        y: Math.round((displayHeight - WINDOW_HEIGHT) * 0.8),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    const handleRedirect = (event, url) => {
        if (url === win.webContents.getURL()) {
            return;
        }

        if (!isAllowedExternalUrl(url)) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        shell.openExternal(url);
    };

    win.webContents.on('will-navigate', handleRedirect);
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedExternalUrl(url)) {
            shell.openExternal(url);
        }

        return { action: 'deny' };
    });

    win.removeMenu();
    win.loadFile('index.html');
    mainWindow = win;

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null;
        }
    });
}

function watchFiles(fileNames, onChange) {
    return fileNames
        .map((fileName) => {
            const targetPath = path.join(__dirname, fileName);

            try {
                return fs.watch(targetPath, { persistent: false }, () => {
                    onChange(fileName);
                });
            } catch (_error) {
                return null;
            }
        })
        .filter(Boolean);
}

function setupDevReload() {
    if (app.isPackaged) {
        return;
    }

    devWatchers.push(
        ...watchFiles(DEV_RELOAD_FILES, () => {
            if (!mainWindow || mainWindow.isDestroyed()) {
                return;
            }

            mainWindow.webContents.reloadIgnoringCache();
        })
    );

    devWatchers.push(
        ...watchFiles(DEV_RESTART_FILES, () => {
            if (pendingRelaunch) {
                return;
            }

            pendingRelaunch = true;
            app.relaunch();
            app.quit();
        })
    );
}

app.whenReady().then(() => {
    createWindow();
    setupDevReload();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

ipcMain.handle('np-launcher:pick-path', async (_event, kind) => {
    const properties = kind === 'folder' ? ['openDirectory'] : ['openFile'];
    const result = await dialog.showOpenDialog({ properties });

    if (result.canceled || result.filePaths.length === 0) {
        return '';
    }

    return result.filePaths[0];
});

ipcMain.handle('np-launcher:load-data', async () => {
    return getCategoryData();
});

ipcMain.handle('np-launcher:save-category-data', async (_event, category, items) => {
    if (!CATEGORIES.includes(category)) {
        throw new Error('\uC54C \uC218 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uC785\uB2C8\uB2E4.');
    }

    const safeItems = Array.isArray(items)
        ? items.map((item) => sanitizeItem(item, category)).filter(Boolean)
        : [];

    store.set(`${CATEGORY_KEY_PREFIX}${category}`, safeItems);
    return safeItems;
});

ipcMain.handle('np-launcher:clear-data', async () => {
    store.clear();
    return true;
});

ipcMain.handle('np-launcher:show-message', async (_event, options) => {
    const result = await dialog.showMessageBox({
        type: typeof options?.type === 'string' ? options.type : 'info',
        title: 'NP-Launcher',
        message: typeof options?.message === 'string' ? options.message : '',
        buttons: Array.isArray(options?.buttons) && options.buttons.length > 0 ? options.buttons : ['\uD655\uC778'],
        defaultId: Number.isInteger(options?.defaultId) ? options.defaultId : 0,
        cancelId: Number.isInteger(options?.cancelId) ? options.cancelId : 0
    });

    return result.response;
});

ipcMain.handle('np-launcher:run', async (_event, target) => {
    await runTarget(target);
    return true;
});

ipcMain.handle('np-launcher:open-external', async (_event, target) => {
    await openExternalUrl(target);
    return true;
});

ipcMain.handle('np-launcher:reload-window', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    targetWindow?.webContents.reloadIgnoringCache();
    return true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    devWatchers.forEach((watcher) => watcher.close());
    devWatchers = [];
});

app.disableHardwareAcceleration();
