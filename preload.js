const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenLauncher', {
    onFocusSearch(handler) {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const listener = () => handler();
        ipcRenderer.on('zen-launcher:focus-search', listener);
        return () => {
            ipcRenderer.removeListener('zen-launcher:focus-search', listener);
        };
    },
    pickPath(kind) {
        return ipcRenderer.invoke('zen-launcher:pick-path', kind);
    },
    loadData() {
        return ipcRenderer.invoke('zen-launcher:load-data');
    },
    saveCategoryData(category, items) {
        return ipcRenderer.invoke('zen-launcher:save-category-data', category, items);
    },
    clearData() {
        return ipcRenderer.invoke('zen-launcher:clear-data');
    },
    showMessage(options) {
        return ipcRenderer.invoke('zen-launcher:show-message', options);
    },
    run(target) {
        return ipcRenderer.invoke('zen-launcher:run', target);
    },
    openExternal(target) {
        return ipcRenderer.invoke('zen-launcher:open-external', target);
    },
    resolveLocation(coordinates) {
        return ipcRenderer.invoke('zen-launcher:resolve-location', coordinates);
    },
    reverseGeocode(latitude, longitude) {
        return ipcRenderer.invoke('zen-launcher:reverse-geocode', latitude, longitude);
    },
    fetchWeather(latitude, longitude) {
        return ipcRenderer.invoke('zen-launcher:fetch-weather', latitude, longitude);
    },
    reloadWindow() {
        return ipcRenderer.invoke('zen-launcher:reload-window');
    }
});
