function describeUpdateStatus(state = {}) {
    const availableVersion = typeof state.availableVersion === 'string' ? state.availableVersion : '';
    const downloadedVersion = typeof state.downloadedVersion === 'string' ? state.downloadedVersion : '';

    switch (state.status) {
        case 'checking':
            return '업데이트 확인 중';
        case 'available':
        case 'downloading':
            return availableVersion ? `${availableVersion} 다운로드 중` : '업데이트 다운로드 중';
        case 'downloaded':
            return downloadedVersion ? `${downloadedVersion} 설치 가능` : '업데이트 설치 가능';
        case 'up-to-date':
            return '최신 버전입니다';
        case 'error':
            return '업데이트 확인에 실패했습니다';
        case 'unsupported':
            return '설치본에서 업데이트를 확인합니다';
        default:
            return '업데이트를 확인하지 않았습니다';
    }
}

function buildTrayMenuTemplate(state = {}, actions = {}) {
    const currentVersion = typeof state.currentVersion === 'string' && state.currentVersion
        ? state.currentVersion
        : '-';
    const canCheck = state.status !== 'checking' && state.status !== 'downloading';
    const items = [
        { label: `현재 버전 ${currentVersion}`, enabled: false },
        { label: describeUpdateStatus(state), enabled: false },
        { type: 'separator' },
        {
            label: '업데이트 확인',
            enabled: canCheck,
            click: actions.checkForUpdates
        }
    ];

    if (state.status === 'downloaded' && state.downloadedVersion) {
        items.push({
            label: `${state.downloadedVersion} 설치 후 다시 시작`,
            click: actions.installUpdate
        });
    }

    items.push(
        { type: 'separator' },
        { label: '런처 열기', click: actions.showLauncher },
        { label: '종료', click: actions.quit }
    );

    return items;
}

function createAppTray({
    iconPath,
    getState,
    onShow,
    onCheckForUpdates,
    onInstallUpdate,
    onQuit
}) {
    const { Menu, Tray, nativeImage } = require('electron');
    const sourceImage = nativeImage.createFromPath(iconPath);
    const trayImage = sourceImage.isEmpty()
        ? sourceImage
        : sourceImage.resize({ width: 32, height: 32, quality: 'best' });
    const tray = new Tray(trayImage);
    tray.setToolTip('ZEN Launcher');

    const actions = {
        checkForUpdates: onCheckForUpdates,
        installUpdate: onInstallUpdate,
        showLauncher: onShow,
        quit: onQuit
    };

    const update = () => {
        const state = typeof getState === 'function' ? getState() : {};
        tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(state, actions)));
    };

    tray.on('click', () => {
        onShow?.();
    });
    update();

    return {
        update,
        destroy() {
            tray.destroy();
        }
    };
}

module.exports = {
    buildTrayMenuTemplate,
    createAppTray,
    describeUpdateStatus
};
