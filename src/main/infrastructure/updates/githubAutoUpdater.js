const { app, dialog } = require('electron');

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function showUpdateReadyDialog(parent, version, presentMessage) {
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

    if (typeof presentMessage === 'function') {
        return presentMessage(parent, options);
    }

    if (parent && !parent.isDestroyed()) {
        return dialog.showMessageBox(parent, options);
    }

    return dialog.showMessageBox(options);
}

function setupGitHubAutoUpdater({ getWindow, onStateChange, presentMessage } = {}) {
    const state = {
        status: app.isPackaged ? 'idle' : 'unsupported',
        currentVersion: app.getVersion(),
        availableVersion: '',
        downloadedVersion: ''
    };
    let promptedVersion = '';
    let checkTimer = null;

    const publish = (patch) => {
        Object.assign(state, patch);
        onStateChange?.({ ...state });
    };

    const stop = () => {
        if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
    };

    if (!app.isPackaged) {
        return {
            stop,
            getState: () => ({ ...state }),
            checkForUpdates() {
                publish({ status: 'unsupported' });
            },
            installUpdate() {}
        };
    }

    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    const runCheck = () => {
        publish({ status: state.downloadedVersion ? 'downloaded' : 'checking' });
        autoUpdater.checkForUpdates().catch(() => {});
    };

    autoUpdater.on('checking-for-update', () => {
        if (!state.downloadedVersion) {
            publish({ status: 'checking' });
        }
    });

    autoUpdater.on('update-available', (info) => {
        publish({
            status: 'downloading',
            availableVersion: typeof info?.version === 'string' ? info.version : ''
        });
    });

    autoUpdater.on('update-not-available', () => {
        publish({
            status: 'up-to-date',
            availableVersion: '',
            downloadedVersion: ''
        });
    });

    autoUpdater.on('download-progress', () => {
        publish({ status: 'downloading' });
    });

    autoUpdater.on('error', (error) => {
        console.warn('Update check failed:', error?.message || error);
        if (!state.downloadedVersion) {
            publish({ status: 'error' });
        }
    });

    autoUpdater.on('update-downloaded', async (info) => {
        const version = typeof info?.version === 'string' ? info.version : '';
        publish({
            status: 'downloaded',
            availableVersion: version,
            downloadedVersion: version
        });

        if (version && promptedVersion === version) {
            return;
        }

        promptedVersion = version;
        const result = await showUpdateReadyDialog(getWindow?.(), version, presentMessage);
        if (result.response === 0) {
            autoUpdater.quitAndInstall(true, true);
        }
    });

    runCheck();
    checkTimer = setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
    checkTimer.unref?.();

    return {
        stop,
        getState: () => ({ ...state }),
        checkForUpdates: runCheck,
        installUpdate() {
            autoUpdater.quitAndInstall(true, true);
        }
    };
}

module.exports = {
    setupGitHubAutoUpdater
};
