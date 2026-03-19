const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('npLauncher', {
    pickPath(kind) {
        return ipcRenderer.invoke('np-launcher:pick-path', kind);
    },
    loadData() {
        return ipcRenderer.invoke('np-launcher:load-data');
    },
    saveCategoryData(category, items) {
        return ipcRenderer.invoke('np-launcher:save-category-data', category, items);
    },
    clearData() {
        return ipcRenderer.invoke('np-launcher:clear-data');
    },
    showMessage(options) {
        return ipcRenderer.invoke('np-launcher:show-message', options);
    },
    run(target) {
        return ipcRenderer.invoke('np-launcher:run', target);
    },
    openExternal(target) {
        return ipcRenderer.invoke('np-launcher:open-external', target);
    },
    reloadWindow() {
        return ipcRenderer.invoke('np-launcher:reload-window');
    }
});
