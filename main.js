const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const https = require('node:https');
const path = require('path');
const { execFile } = require('node:child_process');
const Store = require('electron-store');
const computer = require('electron-shutdown-command');
const { normalizeProgramScanItem } = require('./src/main/domain/program/programScanItem');
const { CategoryStoreRepository } = require('./src/main/infrastructure/repositories/categoryStoreRepository');
const { ProgramScanCacheRepository } = require('./src/main/infrastructure/repositories/programScanCacheRepository');
const { RemoteImageCacheRepository } = require('./src/main/infrastructure/repositories/remoteImageCacheRepository');
const { LauncherCategoryService } = require('./src/main/application/services/launcherCategoryService');
const { ProgramCatalogService } = require('./src/main/application/services/programCatalogService');
const {
    computeLauncherFrame,
    sheetHeightForFit,
    boundsForSheet,
    shapeForSheet,
    normalizeSheetFit,
    normalizePositionOffset
} = require('./src/main/domain/launcher/launcherFrame');
const { setupGitHubAutoUpdater } = require('./src/main/infrastructure/updates/githubAutoUpdater');
const { createAppTray } = require('./src/main/infrastructure/tray/appTray');
const {
    WindowsForegroundFullscreenProbe,
    readNativeWindowHandle,
    shouldReduceResourcesDuringFullscreen
} = require('./src/main/infrastructure/windows/foregroundFullscreen');
const { readMasterMute } = require('./src/main/infrastructure/windows/masterMute');
const { expandEnvPath, isShellFolderLink } = require('./src/main/domain/launcher/recommendedFolders');

const store = new Store();
const APP_ICON_PATH = path.join(__dirname, 'src', 'app', 'ZEN-Launcher.png');
const EXTERNAL_PROTOCOLS = ['http:', 'https:', 'ms-settings:', 'ms-clock:'];
const DEV_RELOAD_FILES = ['index.html', 'renderer.js', 'preference.js', 'sheetMotion.js', 'zenDialog.js'];
const DEV_RESTART_FILES = ['main.js', 'preload.js'];
const POWERSHELL_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const APPEARANCE_SETTINGS_KEY = 'ZENL.Appearance';
const MAX_LAUNCHER_TRANSPARENCY = 100;
const DEFAULT_APPEARANCE_SETTINGS = Object.freeze({
    launcherTransparency: 0,
    themeMode: 'dark',
    revealOnHover: false,
    grayscaleUntilHover: true,
    suppressShortcutDuringFullscreen: false,
    minimizeResourcesDuringFullscreen: true,
    launchAtStartup: false,
    positionOffsetX: 0,
    positionOffsetY: 0
});
const SETTINGS_EXPORT_VERSION = 1;
const SEARCH_SHORTCUT = 'CommandOrControl+Space';
const FULLSCREEN_SHORTCUT_WATCH_MS = 700;
const FOREGROUND_PROBE_SCRIPT = path.join(__dirname, 'src', 'main', 'infrastructure', 'windows', 'foregroundFullscreenProbe.ps1');
const categoryRepository = new CategoryStoreRepository(store);
const remoteImageCacheRepository = new RemoteImageCacheRepository({ app });
const launcherCategoryService = new LauncherCategoryService({
    categoryRepository,
    remoteImageCacheRepository
});
const programScanCacheRepository = new ProgramScanCacheRepository({
    app,
    normalizeProgramScanItem
});
const programCatalogService = new ProgramCatalogService({
    cacheRepository: programScanCacheRepository,
    scanPrograms: scanInstalledPrograms
});

let mainWindow = null;
let devWatchers = [];
let pendingRelaunch = false;
let activeSheetFit = 'closed';
let foregroundProbe = null;
let shortcutWatchTimer = null;
let searchShortcutInFlight = false;
let resourceSaverActive = false;
let appTray = null;
let autoUpdaterController = null;
const reverseGeocodeCache = new Map();

function normalizeAppearanceSettings(value = {}) {
    const rawTransparency = Number.parseInt(value?.launcherTransparency, 10);
    const launcherTransparency = Number.isFinite(rawTransparency)
        ? Math.min(MAX_LAUNCHER_TRANSPARENCY, Math.max(0, rawTransparency))
        : DEFAULT_APPEARANCE_SETTINGS.launcherTransparency;
    const themeMode = value?.themeMode === 'light'
        ? 'light'
        : DEFAULT_APPEARANCE_SETTINGS.themeMode;
    const revealOnHover = value?.revealOnHover === true;
    const grayscaleUntilHover = value?.grayscaleUntilHover !== false;
    const suppressShortcutDuringFullscreen = value?.suppressShortcutDuringFullscreen === true;
    const minimizeResourcesDuringFullscreen = value?.minimizeResourcesDuringFullscreen !== false;
    const launchAtStartup = value?.launchAtStartup === true;
    const positionOffset = normalizePositionOffset(value);

    return {
        launcherTransparency,
        themeMode,
        revealOnHover,
        grayscaleUntilHover,
        suppressShortcutDuringFullscreen,
        minimizeResourcesDuringFullscreen,
        launchAtStartup,
        positionOffsetX: positionOffset.x,
        positionOffsetY: positionOffset.y
    };
}

function applyLaunchAtStartup(enabled) {
    if (!app.isPackaged || process.platform !== 'win32') {
        return;
    }

    app.setLoginItemSettings({
        openAtLogin: enabled === true,
        path: process.execPath
    });
}

function loadAppearanceSettings() {
    return normalizeAppearanceSettings(store.get(APPEARANCE_SETTINGS_KEY));
}

function saveAppearanceSettings(value) {
    const normalizedSettings = normalizeAppearanceSettings(value);
    store.set(APPEARANCE_SETTINGS_KEY, normalizedSettings);
    syncFullscreenMode(normalizedSettings);
    applyLaunchAtStartup(normalizedSettings.launchAtStartup);
    publishLauncherLayout();
    return normalizedSettings;
}

function clearAppearanceSettings() {
    store.delete(APPEARANCE_SETTINGS_KEY);
    const settings = loadAppearanceSettings();
    syncFullscreenMode(settings);
    applyLaunchAtStartup(settings.launchAtStartup);
    publishLauncherLayout();
    return settings;
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return false;
    }

    setResourceSaverActive(false);

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    return true;
}

function focusLauncherSearch() {
    if (!showMainWindow()) {
        return;
    }

    mainWindow.webContents.send('zen-launcher:focus-search');
}

function setResourceSaverActive(active) {
    const nextActive = active === true;
    if (resourceSaverActive === nextActive) {
        return;
    }

    resourceSaverActive = nextActive;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }

    const contents = mainWindow.webContents;
    try {
        if (typeof contents.setFrameRate === 'function') {
            contents.setFrameRate(nextActive ? 1 : 0);
        }
        if (typeof contents.setBackgroundThrottling === 'function') {
            contents.setBackgroundThrottling(true);
        }
    } catch (error) {
        console.warn('Resource saver update failed:', error?.message || error);
    }

    contents.send('zen-launcher:resource-saver', nextActive);
}

function readOwnWindowHandle() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return 0n;
    }

    return readNativeWindowHandle(mainWindow.getNativeWindowHandle());
}

function resolveProbeScriptPath() {
    if (!app.isPackaged) {
        return FOREGROUND_PROBE_SCRIPT;
    }

    const targetPath = path.join(app.getPath('temp'), 'zen-launcher-foreground-fullscreen-probe.ps1');
    fs.copyFileSync(FOREGROUND_PROBE_SCRIPT, targetPath);
    return targetPath;
}

function getForegroundProbe() {
    if (process.platform !== 'win32') {
        return null;
    }

    if (!foregroundProbe) {
        foregroundProbe = new WindowsForegroundFullscreenProbe({
            powershellPath: POWERSHELL_PATH,
            scriptPath: resolveProbeScriptPath()
        });
    }

    return foregroundProbe;
}

function registerSearchShortcut() {
    if (globalShortcut.isRegistered(SEARCH_SHORTCUT)) {
        return;
    }

    globalShortcut.register(SEARCH_SHORTCUT, () => {
        handleSearchShortcut();
    });
}

function stopShortcutWatch() {
    if (!shortcutWatchTimer) {
        return;
    }

    clearInterval(shortcutWatchTimer);
    shortcutWatchTimer = null;
}

async function isAnotherAppFullscreen() {
    const probe = getForegroundProbe();
    if (!probe) {
        return false;
    }

    return probe.isOtherAppFullscreen(readOwnWindowHandle());
}

function shouldWatchFullscreen(settings) {
    return process.platform === 'win32' && (
        settings.suppressShortcutDuringFullscreen === true
        || settings.minimizeResourcesDuringFullscreen === true
    );
}

function isLauncherFocused() {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused());
}

async function refreshFullscreenMode() {
    const settings = loadAppearanceSettings();
    if (!shouldWatchFullscreen(settings)) {
        registerSearchShortcut();
        setResourceSaverActive(false);
        return;
    }

    let otherAppFullscreen = false;
    try {
        otherAppFullscreen = await isAnotherAppFullscreen();
    } catch (error) {
        console.warn('Fullscreen check failed:', error?.message || error);
        registerSearchShortcut();
        setResourceSaverActive(false);
        return;
    }

    const latestSettings = loadAppearanceSettings();
    const launcherFocused = isLauncherFocused();
    const suppressShortcut = latestSettings.suppressShortcutDuringFullscreen === true
        && otherAppFullscreen
        && !launcherFocused;

    if (suppressShortcut) {
        globalShortcut.unregister(SEARCH_SHORTCUT);
    } else {
        registerSearchShortcut();
    }

    setResourceSaverActive(shouldReduceResourcesDuringFullscreen(
        latestSettings.minimizeResourcesDuringFullscreen === true,
        otherAppFullscreen,
        launcherFocused
    ));
}

function syncFullscreenMode(settings = loadAppearanceSettings()) {
    if (!shouldWatchFullscreen(settings)) {
        stopShortcutWatch();
        foregroundProbe?.stop();
        registerSearchShortcut();
        setResourceSaverActive(false);
        return;
    }

    if (!shortcutWatchTimer) {
        shortcutWatchTimer = setInterval(() => {
            refreshFullscreenMode();
        }, FULLSCREEN_SHORTCUT_WATCH_MS);
        shortcutWatchTimer.unref?.();
    }

    refreshFullscreenMode();
}

async function handleSearchShortcut() {
    if (searchShortcutInFlight) {
        return;
    }

    const settings = loadAppearanceSettings();
    if (!settings.suppressShortcutDuringFullscreen || process.platform !== 'win32') {
        focusLauncherSearch();
        return;
    }

    searchShortcutInFlight = true;
    try {
        const blocked = await isAnotherAppFullscreen();
        if (blocked) {
            globalShortcut.unregister(SEARCH_SHORTCUT);
            return;
        }
    } catch (error) {
        console.warn('Fullscreen shortcut check failed:', error?.message || error);
    } finally {
        searchShortcutInFlight = false;
    }

    focusLauncherSearch();
}

function fetchJson(url, { headers = {}, timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers }, (response) => {
            const { statusCode = 500 } = response;
            let data = '';

            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                if (statusCode < 200 || statusCode >= 300) {
                    reject(new Error(`Request failed (${statusCode})`));
                    return;
                }

                try {
                    resolve(JSON.parse(data));
                } catch (_error) {
                    reject(new Error('Invalid JSON response.'));
                }
            });
        });

        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error('Request timed out.'));
        });

        request.on('error', (error) => {
            reject(new Error(error?.message || 'Network request failed.'));
        });
    });
}

function getReverseGeocodeCacheKey(latitude, longitude) {
    return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function setReverseGeocodeCache(cacheKey, label) {
    reverseGeocodeCache.set(cacheKey, label);
    if (reverseGeocodeCache.size <= 32) {
        return;
    }

    const oldestKey = reverseGeocodeCache.keys().next().value;
    if (oldestKey) {
        reverseGeocodeCache.delete(oldestKey);
    }
}

function buildReverseGeocodeLabel(payload) {
    const address = payload?.address;
    if (!address || typeof address !== 'object') {
        return typeof payload?.display_name === 'string'
            ? payload.display_name.split(',').map((part) => part.trim()).filter(Boolean).slice(0, 3).join(', ')
            : '';
    }

    return [
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.county,
        address.state,
        address.country
    ].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index).join(', ');
}

async function resolveLocationFromProviders() {
    const providers = [
        {
            url: 'https://ipwho.is/',
            mapResponse(payload) {
                if (!payload?.success || typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number') {
                    return null;
                }

                return {
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    locationLabel: [payload.city, payload.region, payload.country].filter(Boolean).join(', '),
                    locationSource: 'Network Location'
                };
            }
        },
        {
            url: 'https://ipapi.co/json/',
            mapResponse(payload) {
                if (typeof payload?.latitude !== 'number' || typeof payload?.longitude !== 'number') {
                    return null;
                }

                return {
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    locationLabel: [payload.city, payload.region, payload.country_name].filter(Boolean).join(', '),
                    locationSource: 'Network Location'
                };
            }
        }
    ];

    for (const provider of providers) {
        try {
            const payload = await fetchJson(provider.url);
            const location = provider.mapResponse(payload);
            if (location) {
                return {
                    ...location,
                    locationLabel: location.locationLabel || 'Current Location'
                };
            }
        } catch (_error) {
            continue;
        }
    }

    throw new Error('Unable to resolve location from network providers.');
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

async function runSystemCommand(file, args, errorMessage) {
    await new Promise((resolve, reject) => {
        execFile(file, args, (error) => {
            if (error) {
                reject(new Error(`${errorMessage}: ${error.message}`));
                return;
            }

            resolve();
        });
    });
}

async function execFileText(file, args, errorMessage) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${errorMessage}: ${stderr || error.message}`));
                return;
            }

            resolve(stdout);
        });
    });
}

async function scanInstalledPrograms() {
    if (process.platform !== 'win32') {
        return [];
    }

    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$items = New-Object System.Collections.Generic.List[object]
$seen = @{}

function Add-App([string]$name, [string]$targetPath, [string]$source) {
    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($targetPath)) {
        return
    }

    $resolvedPath = $targetPath.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $resolvedPath)) {
        return
    }

    $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
    if ($extension -notin @('.exe', '.lnk', '.cmd', '.bat', '.com')) {
        return
    }

    $displayName = $name.Trim()
    $key = ($displayName.ToLowerInvariant() + '|' + $resolvedPath.ToLowerInvariant())
    if ($seen.ContainsKey($key)) {
        return
    }

    $seen[$key] = $true
    $items.Add([PSCustomObject]@{
        name = $displayName
        link = $resolvedPath
        source = $source
    })
}

$registryRoots = @(
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

foreach ($registryRoot in $registryRoots) {
    Get-ItemProperty -Path $registryRoot | ForEach-Object {
        $displayName = $_.DisplayName
        if ([string]::IsNullOrWhiteSpace($displayName)) {
            return
        }

        $candidatePath = $null

        if ($_.DisplayIcon) {
            $iconCandidate = $_.DisplayIcon -replace ',\\d+$', ''
            $iconCandidate = $iconCandidate.Trim().Trim('"')
            if (Test-Path -LiteralPath $iconCandidate) {
                $candidatePath = $iconCandidate
            }
        }

        if (-not $candidatePath -and $_.InstallLocation -and (Test-Path -LiteralPath $_.InstallLocation)) {
            $exeCandidate = Get-ChildItem -LiteralPath $_.InstallLocation -Filter *.exe -File | Sort-Object Length -Descending | Select-Object -First 1
            if ($exeCandidate) {
                $candidatePath = $exeCandidate.FullName
            }
        }

        Add-App $displayName $candidatePath 'installed'
    }
}

$startMenuDirs = @(
    (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
    (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs')
)

foreach ($directory in $startMenuDirs) {
    if (-not (Test-Path -LiteralPath $directory)) {
        continue
    }

    Get-ChildItem -LiteralPath $directory -Recurse -File | Where-Object {
        $_.Extension -in @('.lnk', '.exe')
    } | ForEach-Object {
        Add-App ([System.IO.Path]::GetFileNameWithoutExtension($_.Name)) $_.FullName 'start-menu'
    }
}

$items | Sort-Object name, source | ConvertTo-Json -Depth 3
`.trim();

    const stdout = await execFileText(
        POWERSHELL_PATH,
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        '설치된 프로그램을 스캔하지 못했습니다'
    );

    const raw = stdout.trim();
    if (!raw) {
        return [];
    }

    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
        .map((item) => normalizeProgramScanItem(item))
        .filter(Boolean);
}

async function runTarget(target) {
    if (typeof target !== 'string' || !target.trim()) {
        throw new Error('\uC2E4\uD589\uD560 \uB300\uC0C1\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
    }

    const normalizedTarget = target.trim();
    const targetExtension = path.extname(normalizedTarget).toLowerCase();
    const isExplicitPath = normalizedTarget.includes('\\') || normalizedTarget.includes('/') || path.isAbsolute(normalizedTarget);

    if (normalizedTarget === 'shutdown') {
        await computer.shutdown();
        return;
    }

    if (normalizedTarget === 'reboot') {
        await computer.reboot();
        return;
    }

    if (normalizedTarget === 'cancel-schedule-shutdown') {
        try {
            await runSystemCommand(
                'shutdown',
                ['/a'],
                '\uC608\uC57D \uC885\uB8CC\uB97C \uCDE8\uC18C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
            );
        } catch (error) {
            const message = typeof error?.message === 'string' ? error.message : '';
            const noScheduledShutdown = message.includes('(1116)') || message.includes('shutdown was in progress') || message.includes('예약');
            if (!noScheduledShutdown) {
                throw error;
            }
        }
        return;
    }

    if (normalizedTarget.startsWith('schedule-shutdown:')) {
        const rawMinutes = normalizedTarget.slice('schedule-shutdown:'.length);
        const minutes = Number.parseInt(rawMinutes, 10);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
            throw new Error('\uC608\uC57D \uC885\uB8CC \uC2DC\uAC04\uC740 1\uBD84\uBD80\uD130 10080\uBD84\uAE4C\uC9C0 \uC124\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
        }

        try {
            await runSystemCommand(
                'shutdown',
                ['/s', '/t', `${minutes * 60}`],
                '\uC608\uC57D \uC885\uB8CC\uB97C \uC124\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
            );
        } catch (error) {
            const message = typeof error?.message === 'string' ? error.message : '';
            const alreadyScheduled = message.includes('(1190)') || message.includes('이미 예약') || message.includes('already been scheduled');

            if (!alreadyScheduled) {
                throw error;
            }

            try {
                await runSystemCommand(
                    'shutdown',
                    ['/a'],
                    '\uAE30\uC874 \uC608\uC57D \uC885\uB8CC\uB97C \uCDE8\uC18C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
                );
            } catch (_cancelError) {
                throw error;
            }

            await runSystemCommand(
                'shutdown',
                ['/s', '/t', `${minutes * 60}`],
                '\uC608\uC57D \uC885\uB8CC\uB97C \uC124\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
            );
        }
        return;
    }

    if (normalizedTarget === 'schedule-shutdown') {
        await runSystemCommand(
            'shutdown',
            ['/s', '/t', '3600'],
            '\uC608\uC57D \uC885\uB8CC\uB97C \uC124\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
        );
        return;
    }

    if (normalizedTarget === 'volume-up' || normalizedTarget === 'volume-down' || normalizedTarget === 'volume-mute') {
        if (process.platform !== 'win32') {
            return;
        }

        const keyCode = normalizedTarget === 'volume-up'
            ? 175
            : normalizedTarget === 'volume-down'
                ? 174
                : 173;
        await runSystemCommand(
            POWERSHELL_PATH,
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class KeyboardMedia { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo); }'; [KeyboardMedia]::keybd_event(${keyCode}, 0, 0, 0); Start-Sleep -Milliseconds 40; [KeyboardMedia]::keybd_event(${keyCode}, 0, 2, 0)`
            ],
            '\uBCFC\uB968 \uC870\uC808\uC744 \uC2E4\uD589\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
        );
        return;
    }

    if (isAllowedExternalUrl(normalizedTarget)) {
        await openExternalUrl(normalizedTarget);
        return;
    }

    if (targetExtension === '.exe') {
        if (isExplicitPath) {
            await runSystemCommand(
                normalizedTarget,
                [],
                '\uC2E4\uD589 \uD30C\uC77C\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
            );
            return;
        }

        const escapedTarget = normalizedTarget.replace(/'/g, "''");
        await runSystemCommand(
            POWERSHELL_PATH,
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `Start-Process -FilePath '${escapedTarget}'`
            ],
            '\uC2E4\uD589 \uD30C\uC77C\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4'
        );
        return;
    }

    const expandedTarget = expandEnvPath(normalizedTarget);
    if (isShellFolderLink(expandedTarget)) {
        if (process.platform !== 'win32') {
            throw new Error('이 폴더는 Windows에서만 열 수 있습니다.');
        }

        await runSystemCommand(
            'explorer.exe',
            [expandedTarget],
            '폴더를 열지 못했습니다'
        );
        return;
    }

    const openResult = await shell.openPath(expandedTarget);
    if (openResult) {
        throw new Error(`\uB300\uC0C1\uC744 \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${openResult}`);
    }
}

function readLauncherLayout() {
    const display = screen.getPrimaryDisplay();
    const appearance = loadAppearanceSettings();
    const frame = computeLauncherFrame(display.workArea, display.bounds, {
        x: appearance.positionOffsetX,
        y: appearance.positionOffsetY
    });
    const sheetHeight = activeSheetFit === 'closed'
        ? 0
        : sheetHeightForFit(activeSheetFit, frame.availableAbove);

    return {
        frame,
        sheetHeight,
        bounds: boundsForSheet(frame, sheetHeight),
        metrics: {
            width: frame.width,
            dockHeight: frame.dockHeight,
            availableAbove: frame.availableAbove,
            scale: frame.scale,
            sheetHeight,
            fit: activeSheetFit,
            autoX: frame.autoX,
            autoY: frame.autoY,
            x: frame.x,
            y: frame.y,
            positionOffsetX: frame.positionOffsetX,
            positionOffsetY: frame.positionOffsetY,
            displayWidth: frame.displayWidth,
            displayHeight: frame.displayHeight,
            workAreaWidth: frame.workAreaWidth,
            workAreaHeight: frame.workAreaHeight
        }
    };
}

function applyWindowShape(layout) {
    if (!mainWindow || mainWindow.isDestroyed() || typeof mainWindow.setShape !== 'function') {
        return;
    }

    try {
        mainWindow.setShape([shapeForSheet(layout.frame, layout.sheetHeight)]);
    } catch (error) {
        console.warn('Window shape update failed:', error?.message || error);
    }
}

function applyLauncherLayout() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return null;
    }

    const layout = readLauncherLayout();
    const next = layout.bounds;
    const current = mainWindow.getBounds();
    const moved = current.x !== next.x
        || current.y !== next.y
        || current.width !== next.width
        || current.height !== next.height;
    if (moved) {
        mainWindow.setBounds(next, false);
    }
    applyWindowShape(layout);
    return layout.metrics;
}

function publishLauncherLayout() {
    const metrics = applyLauncherLayout();
    if (!metrics || !mainWindow || mainWindow.isDestroyed()) {
        return null;
    }

    mainWindow.webContents.send('zen-launcher:layout-metrics', metrics);
    return metrics;
}

function createWindow() {
    const initialLayout = readLauncherLayout();
    const win = new BrowserWindow({
        width: initialLayout.bounds.width,
        height: initialLayout.bounds.height,
        frame: false,
        transparent: true,
        thickFrame: false,
        resizable: false,
        skipTaskbar: true,
        icon: APP_ICON_PATH,
        x: initialLayout.bounds.x,
        y: initialLayout.bounds.y,
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
    win.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
        return permission === 'geolocation';
    });
    win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'geolocation');
    });

    win.removeMenu();
    mainWindow = win;
    applyLauncherLayout();
    win.loadFile('index.html');
    win.webContents.on('did-finish-load', () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
            return;
        }

        win.webContents.send('zen-launcher:resource-saver', resourceSaverActive);
    });

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

const hasSingleInstanceLock = !app.isPackaged || app.requestSingleInstanceLock();
let stopAutoUpdater = () => {};

if (!hasSingleInstanceLock) {
    app.quit();
} else if (app.isPackaged) {
    app.on('second-instance', () => {
        showMainWindow();
    });
}

app.whenReady().then(() => {
    if (!hasSingleInstanceLock) {
        return;
    }

    if (process.platform === 'win32') {
        app.setAppUserModelId('com.jisuyang.zenlauncher');
    }

    createWindow();
    setupDevReload();
    screen.on('display-metrics-changed', () => {
        publishLauncherLayout();
    });
    autoUpdaterController = setupGitHubAutoUpdater({
        getWindow: () => mainWindow,
        onStateChange: () => {
            appTray?.update();
        },
        presentMessage: presentLauncherMessage
    });
    stopAutoUpdater = () => autoUpdaterController.stop();
    try {
        appTray = createAppTray({
            iconPath: APP_ICON_PATH,
            getState: () => autoUpdaterController.getState(),
            onShow: () => {
                showMainWindow();
            },
            onCheckForUpdates: () => {
                autoUpdaterController.checkForUpdates();
            },
            onInstallUpdate: () => {
                autoUpdaterController.installUpdate();
            },
            onQuit: () => {
                app.quit();
            }
        });
    } catch (error) {
        console.warn('Tray setup failed:', error?.message || error);
    }
    applyLaunchAtStartup(loadAppearanceSettings().launchAtStartup);
    syncFullscreenMode();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

ipcMain.handle('zen-launcher:pick-path', async (_event, kind) => {
    const properties = kind === 'folder' ? ['openDirectory'] : ['openFile'];
    const filters = kind === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'] }]
        : undefined;
    const result = await dialog.showOpenDialog({
        properties,
        filters
    });

    if (result.canceled || result.filePaths.length === 0) {
        return '';
    }

    return result.filePaths[0];
});

function buildSettingsExportPayload() {
    const categories = launcherCategoryService.loadAll();
    return {
        version: SETTINGS_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        appearance: loadAppearanceSettings(),
        categories: {
            gallery: Array.isArray(categories?.gallery) ? categories.gallery : [],
            icon: Array.isArray(categories?.icon) ? categories.icon : [],
            folder: Array.isArray(categories?.folder) ? categories.folder : []
        }
    };
}

function parseSettingsImportPayload(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (_error) {
        throw new Error('설정 파일을 해석하지 못했습니다.');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('설정 파일 형식이 올바르지 않습니다.');
    }

    const appearance = normalizeAppearanceSettings(parsed.appearance || {});
    const categorySource = parsed.categories && typeof parsed.categories === 'object'
        ? parsed.categories
        : parsed;
    const categories = {
        gallery: Array.isArray(categorySource.gallery) ? categorySource.gallery : [],
        icon: Array.isArray(categorySource.icon) ? categorySource.icon : [],
        folder: Array.isArray(categorySource.folder) ? categorySource.folder : []
    };

    return { appearance, categories };
}

ipcMain.handle('zen-launcher:export-settings', async () => {
    const defaultPath = path.join(
        app.getPath('documents'),
        `zen-launcher-settings-${new Date().toISOString().slice(0, 10)}.json`
    );
    const result = await dialog.showSaveDialog({
        title: '설정 내보내기',
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }

    const payload = buildSettingsExportPayload();
    fs.writeFileSync(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('zen-launcher:import-settings', async () => {
    const result = await dialog.showOpenDialog({
        title: '설정 불러오기',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }

    const rawText = fs.readFileSync(result.filePaths[0], 'utf8');
    const payload = parseSettingsImportPayload(rawText);
    return {
        canceled: false,
        filePath: result.filePaths[0],
        ...payload
    };
});

ipcMain.handle('zen-launcher:load-data', async () => {
    return launcherCategoryService.loadAll();
});

ipcMain.handle('zen-launcher:load-appearance-settings', async () => {
    return loadAppearanceSettings();
});

ipcMain.handle('zen-launcher:load-program-scan-cache', async () => {
    return programCatalogService.loadScanCache();
});

ipcMain.handle('zen-launcher:scan-installed-programs', async () => {
    return programCatalogService.scanAndCachePrograms();
});

ipcMain.handle('zen-launcher:save-category-data', async (_event, category, items) => {
    return launcherCategoryService.saveCategory(category, items);
});

ipcMain.handle('zen-launcher:save-appearance-settings', async (_event, settings) => {
    return saveAppearanceSettings(settings);
});

ipcMain.handle('zen-launcher:clear-data', async () => {
    await launcherCategoryService.clearAll();
    clearAppearanceSettings();
    return launcherCategoryService.loadAll();
});

ipcMain.handle('zen-launcher:get-layout-metrics', () => {
    return readLauncherLayout().metrics;
});

ipcMain.handle('zen-launcher:get-app-info', () => {
    const releaseDate = require('./package.json').releaseDate || '';
    return {
        version: app.getVersion(),
        releaseDate,
        author: 'JISU YANG',
        productName: 'ZEN Launcher'
    };
});

ipcMain.handle('zen-launcher:apply-sheet-fit', (_event, fit) => {
    activeSheetFit = normalizeSheetFit(fit);
    return applyLauncherLayout();
});

async function presentLauncherMessage(parent, options = {}) {
    const payload = {
        type: typeof options.type === 'string' ? options.type : 'info',
        message: typeof options.message === 'string' ? options.message : '',
        detail: typeof options.detail === 'string' ? options.detail : '',
        buttons: Array.isArray(options.buttons) && options.buttons.length > 0 ? options.buttons : ['확인'],
        defaultId: Number.isInteger(options.defaultId) ? options.defaultId : 0,
        cancelId: Number.isInteger(options.cancelId) ? options.cancelId : 0
    };
    const windowReady = parent && !parent.isDestroyed() && parent.webContents && !parent.webContents.isDestroyed();

    if (windowReady) {
        try {
            const response = await parent.webContents.executeJavaScript(
                `window.zenDialog && window.zenDialog.show(${JSON.stringify(payload)})`,
                true
            );
            if (Number.isInteger(response)) {
                return { response };
            }
        } catch (error) {
            console.warn('In-app dialog failed:', error?.message || error);
        }
    }

    const nativeOptions = {
        type: payload.type,
        title: 'ZEN Launcher',
        message: payload.message,
        detail: payload.detail,
        buttons: payload.buttons,
        defaultId: payload.defaultId,
        cancelId: payload.cancelId,
        noLink: true
    };
    if (windowReady) {
        return dialog.showMessageBox(parent, nativeOptions);
    }
    return dialog.showMessageBox(nativeOptions);
}

ipcMain.handle('zen-launcher:show-message', async (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await presentLauncherMessage(parent, options);
    return result.response;
});

ipcMain.handle('zen-launcher:run', async (_event, target) => {
    await runTarget(target);
    return true;
});

ipcMain.handle('zen-launcher:get-mute-state', async () => {
    return readMasterMute({
        powershellPath: POWERSHELL_PATH,
        execFileText
    });
});

ipcMain.handle('zen-launcher:open-external', async (_event, target) => {
    await openExternalUrl(target);
    return true;
});

ipcMain.handle('zen-launcher:reverse-geocode', async (_event, latitude, longitude) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return '';
    }

    const cacheKey = getReverseGeocodeCacheKey(latitude, longitude);
    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey) || '';
    }

    try {
        const response = await fetchJson(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&accept-language=ko`,
            {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': `${app.getName()}/${app.getVersion()}`
                }
            }
        );
        const label = buildReverseGeocodeLabel(response);
        setReverseGeocodeCache(cacheKey, label);
        return label;
    } catch (error) {
        console.warn('Reverse geocoding failed:', error.message);
        return '';
    }
});

ipcMain.handle('zen-launcher:fetch-weather', async (_event, latitude, longitude) => {
    const response = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&hourly=precipitation_probability&forecast_days=1&timezone=auto`
    );

    if (!response?.current) {
        throw new Error('Weather response is missing current data.');
    }

    const hourlyTimes = Array.isArray(response?.hourly?.time) ? response.hourly.time : [];
    const precipitationProbabilities = Array.isArray(response?.hourly?.precipitation_probability)
        ? response.hourly.precipitation_probability
        : [];
    const currentTime = typeof response.current.time === 'string' ? response.current.time : '';
    const precipitationIndex = currentTime ? hourlyTimes.indexOf(currentTime) : -1;
    const precipitationProbability = precipitationIndex >= 0
        ? precipitationProbabilities[precipitationIndex]
        : precipitationProbabilities[0];

    return {
        ...response.current,
        precipitation_probability: typeof precipitationProbability === 'number' ? precipitationProbability : 0
    };
});

ipcMain.handle('zen-launcher:reload-window', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    targetWindow?.webContents.reloadIgnoringCache();
    return true;
});

ipcMain.handle('zen-launcher:resolve-location', async (_event, coordinates) => {
    if (
        coordinates
        && typeof coordinates.latitude === 'number'
        && Number.isFinite(coordinates.latitude)
        && typeof coordinates.longitude === 'number'
        && Number.isFinite(coordinates.longitude)
    ) {
        return {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            locationSource: 'Browser Location'
        };
    }

    return resolveLocationFromProviders();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopAutoUpdater();
    appTray?.destroy();
    appTray = null;
    stopShortcutWatch();
    foregroundProbe?.stop();
    globalShortcut.unregisterAll();
    devWatchers.forEach((watcher) => watcher.close());
    devWatchers = [];
});

app.disableHardwareAcceleration();



