const { app, dialog } = require('electron');

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function showUpdateReadyDialog(parent, version) {
    const message = version
        ? `${version} 버전을 설치할 수 있습니다.`
        : '새 버전을 설치할 수 있습니다.';
    const options = {
        type: 'info',
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: 'ZEN Launcher 업데이트',
        message,
        detail: '지금 재시작하면 설치가 진행된 뒤 런처가 다시 열립니다. 나중에를 선택해도 런처를 종료하면 업데이트가 설치됩니다.'
    };

    if (parent && !parent.isDestroyed()) {
        return dialog.showMessageBox(parent, options);
    }

    return dialog.showMessageBox(options);
}

function setupGitHubAutoUpdater({ getWindow }) {
    if (!app.isPackaged) {
        return () => {};
    }

    const { autoUpdater } = require('electron-updater');
    let promptedVersion = '';
    let checkTimer = null;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    const checkForUpdates = () => {
        autoUpdater.checkForUpdates().catch(() => {});
    };

    autoUpdater.on('error', (error) => {
        console.warn('Update check failed:', error?.message || error);
    });

    autoUpdater.on('update-downloaded', async (info) => {
        const version = typeof info?.version === 'string' ? info.version : '';
        if (version && promptedVersion === version) {
            return;
        }

        promptedVersion = version;
        const result = await showUpdateReadyDialog(getWindow(), version);
        if (result.response === 0) {
            autoUpdater.quitAndInstall(true, true);
        }
    });

    checkForUpdates();
    checkTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
    checkTimer.unref?.();

    return () => {
        if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
    };
}

module.exports = {
    setupGitHubAutoUpdater
};
