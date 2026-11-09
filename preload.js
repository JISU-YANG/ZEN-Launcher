const { contextBridge, ipcRenderer } = require('electron');
const {
    findDefaultIcon: findDefaultIconRecord,
    listDefaultIcons
} = require('./src/main/domain/launcher/defaultIcons');
const {
    isSystemProgram,
    normalizeLinkKey
} = require('./src/main/domain/program/programVisibility');

contextBridge.exposeInMainWorld('zenLauncher', {
    getDefaultIcons() {
        return listDefaultIcons();
    },
    findDefaultIcon(link) {
        return findDefaultIconRecord(link);
    },
    isSystemProgram(program) {
        return isSystemProgram(program);
    },
    normalizeLinkKey(link) {
        return normalizeLinkKey(link);
    },
    onResourceSaver(handler) {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const listener = (_event, active) => handler(active === true);
        ipcRenderer.on('zen-launcher:resource-saver', listener);
        return () => {
            ipcRenderer.removeListener('zen-launcher:resource-saver', listener);
        };
    },
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
    loadAppearanceSettings() {
        return ipcRenderer.invoke('zen-launcher:load-appearance-settings');
    },
    loadProgramScanCache() {
        return ipcRenderer.invoke('zen-launcher:load-program-scan-cache');
    },
    scanInstalledPrograms() {
        return ipcRenderer.invoke('zen-launcher:scan-installed-programs');
    },
    saveCategoryData(category, items) {
        return ipcRenderer.invoke('zen-launcher:save-category-data', category, items);
    },
    saveAppearanceSettings(settings) {
        return ipcRenderer.invoke('zen-launcher:save-appearance-settings', settings);
    },
    exportSettings() {
        return ipcRenderer.invoke('zen-launcher:export-settings');
    },
    importSettings() {
        return ipcRenderer.invoke('zen-launcher:import-settings');
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
    },
    getLayoutMetrics() {
        return ipcRenderer.invoke('zen-launcher:get-layout-metrics');
    },
    getAppInfo() {
        return ipcRenderer.invoke('zen-launcher:get-app-info');
    },
    getMuteState() {
        return ipcRenderer.invoke('zen-launcher:get-mute-state');
    },
    applySheetFit(fit) {
        return ipcRenderer.invoke('zen-launcher:apply-sheet-fit', fit);
    },
    onLayoutMetrics(handler) {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const listener = (_event, metrics) => handler(metrics);
        ipcRenderer.on('zen-launcher:layout-metrics', listener);
        return () => {
            ipcRenderer.removeListener('zen-launcher:layout-metrics', listener);
        };
    }
});
