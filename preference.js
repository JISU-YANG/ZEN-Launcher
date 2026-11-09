class ElementPath {
    static openButton = document.getElementById('btn-preference');
    static cancelButton = document.getElementById('btn-preference-cancel');
    static clearButton = document.getElementById('btn-preference-clear');
    static saveButton = document.getElementById('btn-preference-save');
    static editorElement = document.getElementById('editor');
    static editorContext = document.getElementById('setting-row');
    static settingTopbar = document.getElementById('setting-topbar');
}

const MAX_LAUNCHER_TRANSPARENCY = 100;
const MAX_EFFECTIVE_LAUNCHER_TRANSPARENCY = 50;
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
const EXPANDED_PANEL_OPEN_READY_DELAY_MS = 420;
const SETTINGS_PANEL_SWITCH_OPEN_READY_DELAY_MS = 180;
const POSITION_OFFSET_LIMIT = 400;

function normalizePositionOffsetValue(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.min(POSITION_OFFSET_LIMIT, Math.max(-POSITION_OFFSET_LIMIT, parsed));
}

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
    const positionOffsetX = normalizePositionOffsetValue(
        value?.positionOffsetX ?? DEFAULT_APPEARANCE_SETTINGS.positionOffsetX
    );
    const positionOffsetY = normalizePositionOffsetValue(
        value?.positionOffsetY ?? DEFAULT_APPEARANCE_SETTINGS.positionOffsetY
    );

    return {
        launcherTransparency,
        themeMode,
        revealOnHover,
        grayscaleUntilHover,
        suppressShortcutDuringFullscreen,
        minimizeResourcesDuringFullscreen,
        launchAtStartup,
        positionOffsetX,
        positionOffsetY
    };
}

function applyAppearanceSettingsToDocument(settings) {
    const normalizedSettings = normalizeAppearanceSettings(settings);
    const { launcherTransparency, themeMode, revealOnHover, grayscaleUntilHover } = normalizedSettings;
    const effectiveTransparencyRatio = (launcherTransparency / 100) * (MAX_EFFECTIVE_LAUNCHER_TRANSPARENCY / 100);
    const baseSurfaceOpacity = `${(1 - effectiveTransparencyRatio).toFixed(3)}`;
    const surfaceOpacity = revealOnHover && document.documentElement.dataset.launcherHovered === 'true'
        ? '1'
        : baseSurfaceOpacity;
    const launcherHighlightOpacity = `${(Number.parseFloat(surfaceOpacity) * 0.76).toFixed(3)}`;
    const rootStyle = document.documentElement.style;
    const launcherShell = document.getElementById('launcher-shell');
    const editorElement = document.getElementById('editor');

    document.documentElement.dataset.theme = themeMode;
    document.documentElement.dataset.hoverRevealEnabled = revealOnHover ? 'true' : 'false';
    document.documentElement.dataset.mediaGrayscale = grayscaleUntilHover ? 'true' : 'false';
    if (document.body) {
        document.body.dataset.theme = themeMode;
        document.body.dataset.hoverRevealEnabled = revealOnHover ? 'true' : 'false';
        document.body.dataset.mediaGrayscale = grayscaleUntilHover ? 'true' : 'false';
    }

    rootStyle.setProperty('--launcher-shell-alpha', surfaceOpacity);
    rootStyle.setProperty('--launcher-top-strip-alpha', surfaceOpacity);
    rootStyle.setProperty('--launcher-highlight-alpha', launcherHighlightOpacity);
    rootStyle.setProperty('--editor-head-alpha', surfaceOpacity);
    rootStyle.setProperty('--editor-head-opacity', surfaceOpacity);
    rootStyle.setProperty('--editor-surface-opacity', '1');
    rootStyle.setProperty('--launcher-panel-alpha', '0.96');
    rootStyle.setProperty('--launcher-card-alpha', '1');
    rootStyle.setProperty('--launcher-soft-card-alpha', '0.48');
    rootStyle.setProperty('--launcher-list-alpha', '1');
    rootStyle.setProperty('--launcher-overlay-alpha', '0.2');
    rootStyle.setProperty('--launcher-surface-opacity', surfaceOpacity);

    if (launcherShell) {
        launcherShell.style.opacity = surfaceOpacity;
    }
    if (editorElement) {
        const isExpandedActive = editorElement.classList.contains('open')
            || editorElement.classList.contains('closing')
            || editorElement.classList.contains('expanding')
            || editorElement.classList.contains('open-ready');
        editorElement.style.setProperty('--editor-head-opacity', isExpandedActive ? '1' : surfaceOpacity);
    }

    window.dispatchEvent(new CustomEvent('zen-launcher:appearance-change', {
        detail: normalizedSettings
    }));
}

window.zenLauncherAppearance = {
    normalizeAppearanceSettings,
    applyAppearanceSettingsToDocument
};

class ZenLauncherPreferences {
    static Category = {
        GALLERY: 'gallery',
        ICON: 'icon',
        FOLDER: 'folder'
    };

    static TransparencyCategory = 'transparency';
    static ThemeCategory = 'theme';
    static LayoutCategory = 'layout';
    static ShortcutCategory = 'shortcut';
    static FullscreenCategory = 'fullscreen';
    static StartupCategory = 'startup';
    static BackupCategory = 'backup';
    static CreditCategory = 'credit';

    static NavGroups = Object.freeze({
        items: 'items',
        appearance: 'appearance',
        behavior: 'behavior',
        data: 'data'
    });

    static MaxCount = {
        gallery: 6,
        icon: 8,
        folder: 5
    };

    static activeCategory = ZenLauncherPreferences.Category.GALLERY;
    static activeNavGroup = ZenLauncherPreferences.NavGroups.items;

    #savedData = new Map();
    #drafts = new Map();
    #dirtyCategories = new Set();
    #statusOverride = null;
    #activeItemIndex = -1;
    #currentEditorMode = 'direct';
    #programScanCache = [];
    #programScanLoading = false;
    #programScanScannedAt = '';
    #programBrowserContext = null;
    #programBrowserFilter = '';
    #programBrowserShowHidden = false;
    #styleInjected = false;
    #editorCloseTimer = 0;
    #editorOpenReadyTimer = 0;
    #savedAppearance = { ...DEFAULT_APPEARANCE_SETTINGS };
    #draftAppearance = { ...DEFAULT_APPEARANCE_SETTINGS };
    #appearanceDirty = false;
    #layoutMetrics = null;

    constructor(initialData, appearanceSettings) {
        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            const items = Array.isArray(initialData?.[category]) ? initialData[category] : [];
            const normalizedItems = items
                .map((item) => this.#normalizeItem(item, category))
                .filter((item) => item.link);

            this.#savedData.set(category, normalizedItems);
            this.#drafts.set(category, normalizedItems.map((item) => ({ ...item })));
        });

        this.#savedAppearance = normalizeAppearanceSettings(appearanceSettings);
        this.#draftAppearance = { ...this.#savedAppearance };
        this.#applyAppearance(this.#savedAppearance);

        this.#prepareEditorStructure();
        this.#bindEvents();
        this.#bindEditorGridEvents();
        this.#syncAllDirtyCategories();
        this.#syncNavGroupFromCategory(ZenLauncherPreferences.activeCategory);
        this.#renderNav();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
        this.#loadProgramScanCache();
        this.#refreshLayoutMetrics();
    }

    #getAppearancePanelIds() {
        return [
            ZenLauncherPreferences.TransparencyCategory,
            ZenLauncherPreferences.ThemeCategory,
            ZenLauncherPreferences.LayoutCategory,
            ZenLauncherPreferences.ShortcutCategory,
            ZenLauncherPreferences.FullscreenCategory,
            ZenLauncherPreferences.StartupCategory,
            ZenLauncherPreferences.BackupCategory,
            ZenLauncherPreferences.CreditCategory
        ];
    }

    #isAppearancePanel(category) {
        return this.#getAppearancePanelIds().includes(category);
    }

    #getTabCategory(button) {
        if (!button) {
            return '';
        }

        const tab = button.dataset.tab || '';
        if (this.#isAppearancePanel(tab)) {
            return tab;
        }

        return ZenLauncherPreferences.Category[button.dataset.category] || '';
    }

    #getGroupForCategory(category) {
        if (Object.values(ZenLauncherPreferences.Category).includes(category)) {
            return ZenLauncherPreferences.NavGroups.items;
        }
        if (
            category === ZenLauncherPreferences.ThemeCategory
            || category === ZenLauncherPreferences.TransparencyCategory
            || category === ZenLauncherPreferences.LayoutCategory
        ) {
            return ZenLauncherPreferences.NavGroups.appearance;
        }
        if (
            category === ZenLauncherPreferences.ShortcutCategory
            || category === ZenLauncherPreferences.FullscreenCategory
            || category === ZenLauncherPreferences.StartupCategory
        ) {
            return ZenLauncherPreferences.NavGroups.behavior;
        }
        return ZenLauncherPreferences.NavGroups.data;
    }

    #syncNavGroupFromCategory(category) {
        ZenLauncherPreferences.activeNavGroup = this.#getGroupForCategory(category);
    }

    #areAppearanceSettingsEqual(left, right) {
        return left?.launcherTransparency === right?.launcherTransparency
            && left?.themeMode === right?.themeMode
            && left?.revealOnHover === right?.revealOnHover
            && left?.grayscaleUntilHover === right?.grayscaleUntilHover
            && left?.suppressShortcutDuringFullscreen === right?.suppressShortcutDuringFullscreen
            && left?.minimizeResourcesDuringFullscreen === right?.minimizeResourcesDuringFullscreen
            && left?.launchAtStartup === right?.launchAtStartup
            && left?.positionOffsetX === right?.positionOffsetX
            && left?.positionOffsetY === right?.positionOffsetY;
    }

    #isAppearanceCategoryDirty(category) {
        const draft = this.#draftAppearance;
        const saved = this.#savedAppearance;

        if (category === ZenLauncherPreferences.TransparencyCategory) {
            return draft.launcherTransparency !== saved.launcherTransparency
                || draft.revealOnHover !== saved.revealOnHover;
        }

        if (category === ZenLauncherPreferences.ThemeCategory) {
            return draft.themeMode !== saved.themeMode
                || draft.grayscaleUntilHover !== saved.grayscaleUntilHover;
        }

        if (category === ZenLauncherPreferences.LayoutCategory) {
            return draft.positionOffsetX !== saved.positionOffsetX
                || draft.positionOffsetY !== saved.positionOffsetY;
        }

        if (category === ZenLauncherPreferences.ShortcutCategory) {
            return draft.suppressShortcutDuringFullscreen !== saved.suppressShortcutDuringFullscreen;
        }

        if (category === ZenLauncherPreferences.FullscreenCategory) {
            return draft.minimizeResourcesDuringFullscreen !== saved.minimizeResourcesDuringFullscreen;
        }

        if (category === ZenLauncherPreferences.StartupCategory) {
            return draft.launchAtStartup !== saved.launchAtStartup;
        }

        return false;
    }

    #updateAppearanceDirtyState() {
        this.#appearanceDirty = !this.#areAppearanceSettingsEqual(this.#draftAppearance, this.#savedAppearance);
    }

    #getDirtyPreferenceCount() {
        return this.#dirtyCategories.size + (this.#appearanceDirty ? 1 : 0);
    }

    #applyAppearance(settings) {
        const normalizedSettings = normalizeAppearanceSettings(settings);
        applyAppearanceSettingsToDocument(normalizedSettings);
        return normalizedSettings;
    }

    #updateAppearanceDraft(patch) {
        this.#draftAppearance = normalizeAppearanceSettings({
            ...this.#draftAppearance,
            ...patch
        });
        this.#updateAppearanceDirtyState();
        this.#statusOverride = null;
        this.#renderNav();
        this.#refreshStatus();
        this.#applyAppearance(this.#draftAppearance);
    }

    async #refreshLayoutMetrics() {
        try {
            this.#layoutMetrics = await window.zenLauncher.getLayoutMetrics?.() || null;
        } catch (_error) {
            this.#layoutMetrics = null;
        }
        return this.#layoutMetrics;
    }

    #bindEvents() {
        ElementPath.openButton?.addEventListener('click', () => {
            if (this.#isEditorOpen()) {
                if (ElementPath.editorElement?.dataset.panel !== 'settings') {
                    this.#openEditor();
                    return;
                }
                this.#closeEditor();
                return;
            }

            this.#openEditor();
        });

        ElementPath.cancelButton?.addEventListener('click', async () => {
            await this.#closeEditor();
        });

        ElementPath.clearButton?.addEventListener('click', async () => {
            const response = await window.zenLauncher.showMessage({
                type: 'warning',
                message: '저장된 모든 항목과 테마, 단축키, 자원, 시작 설정을 초기화할까요?',
                buttons: ['취소', '전체 초기화'],
                defaultId: 0,
                cancelId: 0
            });

            if (response !== 1) {
                return;
            }

            const clearedData = await window.zenLauncher.clearData();

            Object.values(ZenLauncherPreferences.Category).forEach((category) => {
                const items = Array.isArray(clearedData?.[category])
                    ? clearedData[category].map((item) => this.#normalizeItem(item, category)).filter((item) => item.link)
                    : [];
                this.#savedData.set(category, items);
                this.#drafts.set(category, items.map((item) => ({ ...item })));
            });
            this.#savedAppearance = { ...DEFAULT_APPEARANCE_SETTINGS };
            this.#draftAppearance = { ...this.#savedAppearance };
            this.#applyAppearance(this.#savedAppearance);
            this.#syncAllDirtyCategories();

            this.#activeItemIndex = -1;
            this.#statusOverride = {
                tone: 'success',
                message: '전체 초기화됨'
            };
            this.#renderNav();
            this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
            this.#renderLauncherItems();
            this.#refreshStatus();
        });

        ElementPath.saveButton?.addEventListener('click', async () => {
            await this.#saveDirtyCategories();
        });

        this.#getNavGroupButtons().forEach((button) => {
            this.#makeAccessibleButton(button, () => {
                const group = button.dataset.group;
                if (group) {
                    this.#switchNavGroup(group);
                }
            });
        });

        this.#getTabButtons().forEach((button) => {
            this.#makeAccessibleButton(button, () => {
                const category = this.#getTabCategory(button);
                if (category) {
                    this.#switchCategory(category);
                }
            });
        });

        [ElementPath.cancelButton, ElementPath.clearButton, ElementPath.saveButton, ElementPath.openButton].forEach((button) => {
            this.#makeAccessibleButton(button);
        });

        const scanButton = document.getElementById('btn-program-scan');
        if (scanButton) {
            this.#makeAccessibleButton(scanButton, async () => {
                await this.#scanPrograms();
            });
        }

        const browserScanButton = document.getElementById('btn-program-browser-scan');
        if (browserScanButton) {
            this.#makeAccessibleButton(browserScanButton, async () => {
                await this.#scanPrograms({ openBrowserAfterScan: true });
            });
        }

        const browserCloseButton = document.getElementById('btn-program-browser-close');
        browserCloseButton?.addEventListener('click', () => {
            this.#closeProgramBrowser();
        });

        const browserSearch = document.getElementById('program-browser-search');
        browserSearch?.addEventListener('input', () => {
            this.#programBrowserFilter = browserSearch.value.trim();
            this.#renderProgramBrowser();
        });

        const showHidden = document.getElementById('program-browser-show-hidden');
        showHidden?.addEventListener('change', () => {
            this.#programBrowserShowHidden = showHidden.checked === true;
            this.#renderProgramBrowser();
        });

        const browserOverlay = document.getElementById('program-browser');
        browserOverlay?.addEventListener('click', (event) => {
            if (event.target === browserOverlay) {
                this.#closeProgramBrowser();
            }
        });

        document.addEventListener('keydown', async (event) => {
            if (!this.#isEditorOpen()) {
                return;
            }

            if (event.key === 'Escape') {
                if (this.#isProgramBrowserOpen()) {
                    event.preventDefault();
                    this.#closeProgramBrowser();
                    return;
                }

                const itemEditor = document.getElementById('slot-editor');
                if (itemEditor?.classList.contains('open')) {
                    this.#closeItemEditor();
                    return;
                }

                event.preventDefault();
                await this.#closeEditor();
            }
        });
    }

    #prepareEditorStructure() {
        this.#injectStyles();

        this.#getNavGroupButtons().forEach((button) => {
            button.setAttribute('role', 'tab');
            button.tabIndex = 0;
        });

        this.#getTabButtons().forEach((button) => {
            button.classList.add('setting-category-button');
            button.setAttribute('role', 'tab');
            button.tabIndex = 0;
            const label = button.dataset.label || button.textContent;
            button.replaceChildren(this.#createStaticElement('span', 'setting-category-label', label));
        });

        [ElementPath.cancelButton, ElementPath.clearButton, ElementPath.saveButton].forEach((button) => {
            button?.classList.add('setting-action-button');
            button?.setAttribute('role', 'button');
            button?.setAttribute('tabindex', '0');
        });

        ElementPath.openButton?.setAttribute('role', 'button');
        ElementPath.openButton?.setAttribute('tabindex', '0');

        ElementPath.clearButton.textContent = '초기화';
        ElementPath.cancelButton.textContent = '닫기';
        ElementPath.saveButton.textContent = '저장';
        ElementPath.clearButton?.classList.add('danger-button');
        ElementPath.saveButton?.classList.add('primary-button');

        const status = this.#createStaticElement('div', '', '저장됨');
        status.id = 'setting-status';
        status.dataset.tone = 'neutral';

        const scanButton = document.createElement('button');
        scanButton.type = 'button';
        scanButton.id = 'btn-program-scan';
        scanButton.hidden = true;
        scanButton.append(
            this.#createStaticElement('span', 'scan-action-label', '프로그램 스캔')
        );

        const scanMeta = this.#createStaticElement('div', 'setting-scan-meta', '기록 없음');
        scanMeta.id = 'program-scan-meta';
        scanMeta.hidden = true;
        ElementPath.settingTopbar?.append(scanButton, scanMeta);

        const footer = document.querySelector('#editor > .btn-row');
        const main = document.getElementById('setting-main');
        if (footer) {
            const statusGroup = document.createElement('div');
            statusGroup.className = 'setting-footer-status';
            statusGroup.append(status);

            const actionGroup = document.createElement('div');
            actionGroup.className = 'setting-footer-actions';
            actionGroup.append(ElementPath.clearButton, ElementPath.cancelButton, ElementPath.saveButton);
            footer.replaceChildren(statusGroup, actionGroup);
            main?.append(footer);
        }

        const content = document.createElement('div');
        content.id = 'setting-content';
        const row = ElementPath.editorContext;
        row.replaceWith(content);
        row.id = 'setting-row';
        content.append(row, this.#createItemEditor(), this.#createProgramBrowser());
    }

    #injectStyles() {
        if (this.#styleInjected) {
            return;
        }

        const style = document.createElement('style');
        style.textContent = `
            .setting-topbar-actions { display:flex; align-items:center; justify-content:flex-end; gap:10px; flex:0 0 auto; min-width:0; margin-left:auto; padding:0; }
            .scan-action-button { gap:8px; }
            .scan-action-icon {
                position:relative; width:14px; height:14px; border:2px solid currentColor; border-radius:50%;
                box-sizing:border-box; opacity:0.9;
            }
            .scan-action-icon::after {
                content:''; position:absolute; right:-4px; bottom:-3px; width:6px; height:2px; background:currentColor; border-radius:999px; transform:rotate(45deg);
            }
            .scan-action-label { line-height:1; }
            .setting-scan-meta {
                display:inline-flex; align-items:center; min-height:40px; padding:0 14px; border-radius:14px;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); color:#a8a8a8;
                font-size:11px; font-weight:700; box-sizing:border-box; white-space:nowrap;
            }
            .setting-field-group { display:flex; flex-direction:column; gap:5px; }
            .setting-field-control { display:flex; align-items:center; gap:8px; min-width:0; }
            .setting-field-control input { flex:1 1 auto; min-width:0; }
            .setting-field-control .file-item { flex:0 0 auto; align-self:auto; margin-top:0 !important; }
            .setting-field-group.mode-tabs { gap:0; }
            .setting-mode-row {
                display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px; padding:6px;
                border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-control, 8px);
                background:rgba(255,255,255,0.03);
            }
            .setting-mode-chip {
                display:inline-flex; align-items:center; justify-content:center; min-width:0; height:var(--control-h, 32px); padding:0 10px;
                border-radius:var(--radius-control, 8px); border:1px solid transparent; background:transparent;
                color:#8d8d8d; cursor:pointer; font-size:11px; font-weight:700; box-sizing:border-box;
                transition:background 0.15s ease, color 0.15s ease;
            }
            .setting-mode-chip:hover { background:var(--hover-fill, rgba(255,255,255,0.08)); color:#cfcfcf; }
            .setting-mode-chip.active {
                background:var(--hover-fill, rgba(255,255,255,0.08));
                color:#f3f3f3;
            }
            .image-field-control { align-items:stretch; }
            .editor-live-preview .setting-card-preview { height:120px; }
            .recommend-empty-panel {
                display:flex; flex-direction:column; gap:8px; min-height:160px; padding:24px 18px;
                border:1px dashed rgba(255,255,255,0.14); border-radius:var(--radius-control, 8px);
                background:rgba(255,255,255,0.02); box-sizing:border-box; justify-content:center;
            }
            .recommend-empty-title { color:#f1f1f1; font-size:14px; font-weight:800; }
            .recommend-empty-copy { color:#9a9a9a; font-size:12px; line-height:1.5; }
            .recommend-list { display:flex; flex-direction:column; gap:8px; }
            #editor[data-size="l"] .recommend-list {
                display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); align-content:start;
            }
            #editor[data-size="l"] .recommend-list.recommend-list-stack {
                grid-template-columns:minmax(0, 1fr);
            }
            .recommend-item {
                display:flex; align-items:center; gap:10px; width:100%; min-width:0; padding:8px 10px;
                border:1px solid var(--hairline, rgba(255,255,255,0.12)); border-radius:var(--radius-control, 8px);
                background:var(--zen-plate, #262626); color:var(--zen-ink, #f3f3f3); text-align:left; cursor:pointer;
                box-sizing:border-box; box-shadow:none;
            }
            .recommend-item:hover { background:var(--zen-hover, #3a3a3a); }
            .recommend-item[aria-current="true"] {
                background:var(--zen-hover, #3a3a3a);
                border-color:var(--zen-soft, #c8c8c8);
            }
            .recommend-item:active { background:var(--press-fill, rgba(255,255,255,0.12)); }
            .recommend-item:focus-visible { outline:2px solid var(--focus-ring, rgba(220,220,220,0.85)); outline-offset:2px; }
            .recommend-item-icon {
                display:flex; align-items:center; justify-content:center; width:28px; height:28px; flex:0 0 auto;
            }
            .recommend-item-icon img { width:var(--icon-size, 16px); height:var(--icon-size, 16px); filter:brightness(0) invert(1); }
            .recommend-item-copy { display:flex; flex-direction:column; gap:2px; min-width:0; }
            .recommend-item-copy strong { font-size:13px; font-weight:700; color:var(--zen-ink, #f3f3f3); }
            .recommend-item-copy span {
                color:var(--zen-muted, #8c8c8c); font-size:11px; font-weight:500; line-height:1.35; word-break:break-all;
            }
            .layout-metric-card {
                display:grid; grid-template-columns:120px minmax(0, 1fr); gap:8px 12px; padding:14px 16px;
                border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-control, 8px);
                background:rgba(255,255,255,0.03);
            }
            .layout-metric-label { color:#8d8d8d; font-size:11px; font-weight:700; }
            .layout-metric-value { color:#f1f1f1; font-size:13px; font-weight:800; }
            .backup-action-row { display:flex; gap:10px; flex-wrap:wrap; }
            .program-browser-search-row { display:flex; gap:10px; align-items:center; }
            .program-browser-search-row .program-browser-search { flex:1 1 auto; min-width:0; }
            .program-browser-show-hidden {
                display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; color:#bdbdbd;
                font-size:11px; font-weight:700; white-space:nowrap; cursor:pointer;
            }
            .program-browser-item.is-hidden-program { opacity:0.72; }
            .zen-slot-add-preview {
                display:flex; align-items:center; justify-content:center; min-height:96px;
                border:1px dashed rgba(255,255,255,0.16); border-radius:var(--radius-control, 8px);
                background:transparent; cursor:pointer;
            }
            .zen-slot-add-preview::before, .zen-slot-add-preview::after { display:none !important; }
            .zen-slot-add-preview img {
                width:16px; height:16px; opacity:0.72; filter:brightness(0) invert(1);
            }
            body[data-theme="light"] .zen-slot-add-preview img { filter:none; opacity:0.55; }
            body[data-theme="light"] .recommend-empty-panel,
            body[data-theme="light"] .layout-metric-card {
                border-color:rgba(84,92,104,0.14);
                background:rgba(255,255,255,0.72);
            }
            body[data-theme="light"] .recommend-empty-title,
            body[data-theme="light"] .layout-metric-value { color:var(--light-text-strong); }
            body[data-theme="light"] .recommend-empty-copy,
            body[data-theme="light"] .layout-metric-label,
            body[data-theme="light"] .program-browser-show-hidden { color:var(--light-text-muted); }
            body[data-theme="light"] .recommend-item-icon img { filter:brightness(0); }
            body[data-theme="light"] .setting-category-button:hover,
            body[data-theme="light"] .setting-nav-group:hover {
                background:rgba(0,0,0,0.06);
            }
            body[data-theme="light"] .setting-category-button.select-category,
            body[data-theme="light"] .setting-nav-group[aria-selected="true"] {
                background:rgba(0,0,0,0.08);
                color:var(--light-text-strong);
                box-shadow:none;
            }
            .program-picker-card {
                display:flex; flex-direction:column; gap:6px; padding:12px 14px; border-radius:16px;
                background:linear-gradient(180deg, rgba(42,42,42,0.96), rgba(28,28,28,0.98));
                border:1px solid rgba(255,255,255,0.08); box-sizing:border-box;
            }
            .program-picker-control { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:0; }
            .program-picker-control .program-picker-card { flex:1 1 auto; min-width:0; justify-content:center; }
            .program-picker-card.empty { border-style:dashed; color:#9b9b9b; background:rgba(255,255,255,0.02); }
            .program-picker-name { color:#f1f1f1; font-size:12px; font-weight:800; word-break:break-word; }
            .program-picker-meta { color:#9b9b9b; font-size:9px; line-height:1.4; word-break:break-all; }
            .program-picker-actions { display:flex; gap:8px; flex-wrap:nowrap; }
            #editor[data-panel="settings"].program-browser-active #setting-topbar,
            #editor[data-panel="settings"].program-browser-active .btn-row {
                opacity:0;
                pointer-events:none;
                transform:translateY(12px);
                max-height:0;
                min-height:0;
                padding-top:0;
                padding-bottom:0;
                margin:0;
                border:none;
                overflow:hidden;
            }
            #editor[data-panel="settings"].program-browser-active #setting-row,
            #editor[data-panel="settings"].program-browser-active #slot-editor {
                opacity:0;
                pointer-events:none;
                transform:translateY(10px);
                max-height:0;
                min-height:0;
                padding:0;
                margin:0;
                overflow:hidden;
            }
            .program-browser {
                position:absolute;
                inset:0;
                display:flex;
                flex-direction:column;
                overflow:hidden;
                opacity:0;
                visibility:hidden;
                pointer-events:none;
                transform:translateY(12px);
                transition:opacity 0.24s ease, transform 0.34s cubic-bezier(0.25, 0.8, 0.2, 1), visibility 0s linear 0.34s;
                background:var(--zen-shell, #1c1c1c);
                border:none;
                border-radius:0;
                box-shadow:none;
                z-index:30;
                box-sizing:border-box;
                padding:12px 16px;
            }
            .program-browser.open {
                opacity:1;
                visibility:visible;
                pointer-events:auto;
                transform:translateY(0);
                transition:opacity 0.2s ease, transform 0.34s cubic-bezier(0.25, 0.8, 0.2, 1), visibility 0s linear 0s;
            }
            .program-browser-panel {
                display:grid;
                grid-template-rows:auto auto auto minmax(0, 1fr);
                row-gap:10px;
                width:100%;
                height:100%;
                min-height:0;
                overflow:hidden;
                padding:14px 22px 16px;
                box-sizing:border-box;
            }
            .program-browser-header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding:2px 2px 6px; position:relative; z-index:2; }
            .program-browser-tools { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
            .program-browser-title { color:#f1f1f1; font-size:18px; font-weight:900; }
            .program-browser-caption { margin-top:4px; color:#8f8f8f; font-size:11px; line-height:1.45; }
            .program-browser-search {
                margin:0 2px; height:44px; padding:0 14px; border:1px solid rgba(255,255,255,0.08); border-radius:14px;
                background:rgba(255,255,255,0.03); color:#f1f1f1; font-family:"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif; font-size:12px; box-sizing:border-box;
                position:relative; z-index:2;
            }
            .program-browser-search::placeholder { color:#727272; }
            .program-browser-meta { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:0 2px 4px; color:#9a9a9a; font-size:11px; font-weight:700; position:relative; z-index:2; }
            .program-browser-list { display:flex; flex-direction:column; gap:8px; min-height:0; padding:0 2px 2px; overflow-y:auto; position:relative; z-index:1; }
            #editor[data-size="l"] .program-browser-list {
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                align-content:start;
                gap:8px;
            }
            .program-browser-item {
                display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%; padding:10px 12px; border:1px solid rgba(255,255,255,0.08);
                border-radius:16px; background:linear-gradient(180deg, rgba(42,42,42,0.96), rgba(28,28,28,0.98)); color:#f1f1f1; text-align:left; cursor:pointer; box-sizing:border-box;
                transition:background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
            }
            .program-browser-item:hover { background:linear-gradient(180deg, rgba(50,50,50,0.98), rgba(32,32,32,0.98)); border-color:rgba(255,255,255,0.14); transform:translateY(-1px); }
            .program-browser-item-title { font-size:11px; font-weight:800; line-height:1.35; word-break:break-word; }
            .program-browser-item-meta {
                margin-top:3px;
                color:#8f8f8f;
                font-size:9px;
                line-height:1.35;
                word-break:break-all;
                white-space:pre-line;
                display:-webkit-box;
                -webkit-line-clamp:2;
                -webkit-box-orient:vertical;
                overflow:hidden;
            }
            .program-browser-item-source {
                flex:0 0 auto; color:#151515; background:linear-gradient(180deg, rgba(235,235,235,0.98), rgba(206,206,206,0.98)); border-radius:999px; padding:5px 8px; font-size:9px; font-weight:900; text-transform:uppercase;
            }
            .program-browser-empty { padding:22px 18px; border:1px dashed rgba(255,255,255,0.12); border-radius:16px; color:#9b9b9b; text-align:center; line-height:1.6; grid-column:1 / -1; }
            .launcher-fallback { display:flex; align-items:center; justify-content:center; box-sizing:border-box; text-align:center; overflow:hidden; }
            .gallery-fallback {
                width:100%; height:100%; padding:10px; border-radius:10px; background:linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02));
                color:#f1f1f1; font-size:12px; font-weight:800; line-height:1.35; word-break:break-word;
            }
            .icon-fallback {
                width:48px; height:48px; margin:0 auto; border-radius:16px; background:linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03));
                color:#f1f1f1; font-size:18px; font-weight:900;
            }
            .theme-settings-panel {
                display:flex;
                flex-direction:column;
                gap:12px;
                min-height:0;
                padding:0 4px 4px;
                box-sizing:border-box;
            }
            .theme-control-header {
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:16px;
                padding-bottom:6px;
                border-bottom:1px solid rgba(255,255,255,0.08);
            }
            .theme-control-title {
                color:#f1f1f1;
                font-size:19px;
                font-weight:900;
                letter-spacing:-0.03em;
            }
            .theme-control-value {
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:72px;
                height:34px;
                padding:0 14px;
                border-radius:999px;
                border:1px solid rgba(255,255,255,0.08);
                background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
                color:#f1f1f1;
                font-size:12px;
                font-weight:900;
                box-sizing:border-box;
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
            }
            .theme-control-description {
                color:#9a9a9a;
                font-size:12px;
                line-height:1.6;
                max-width:54ch;
            }
            .theme-range-header {
                display:flex;
                align-items:end;
                justify-content:space-between;
                gap:12px;
                margin-top:0;
            }
            .theme-range-label {
                color:#dfdfdf;
                font-size:13px;
                font-weight:800;
            }
            .theme-range-caption {
                color:#7f7f7f;
                font-size:10px;
                font-weight:700;
                letter-spacing:0.08em;
                text-transform:uppercase;
            }
            .theme-transparency-range {
                width:100%;
                appearance:none;
                -webkit-appearance:none;
                height:10px;
                margin:0;
                border-radius:999px;
                background:linear-gradient(90deg, rgba(255,255,255,0.32), rgba(255,255,255,0.08));
                outline:none;
                box-shadow:inset 0 1px 2px rgba(0,0,0,0.24);
            }
            .theme-transparency-range::-webkit-slider-thumb {
                -webkit-appearance:none;
                width:22px;
                height:22px;
                border:1px solid rgba(255,255,255,0.1);
                border-radius:50%;
                background:linear-gradient(180deg, #fafafa, #d7d7d7);
                box-shadow:0 8px 16px rgba(0,0,0,0.28);
                cursor:pointer;
            }
            .theme-transparency-scale {
                display:flex;
                justify-content:space-between;
                gap:10px;
                color:#8a8a8a;
                font-size:10px;
                font-weight:700;
                letter-spacing:0.04em;
            }
            .theme-toggle-card {
                display:flex;
                align-items:flex-start;
                gap:12px;
                margin-top:8px;
                padding:6px 0 0;
                border:1px solid transparent;
                border-radius:0;
                background:transparent;
                box-sizing:border-box;
                cursor:pointer;
                box-shadow:none;
                transition:color 0.18s ease, transform 0.18s ease;
            }
            .theme-toggle-card:hover {
                transform:translateY(-1px);
            }
            .theme-toggle-card input {
                width:18px;
                height:18px;
                margin:2px 0 0;
                accent-color:#f1f1f1;
                cursor:pointer;
                flex:0 0 auto;
            }
            .theme-toggle-copy {
                display:flex;
                flex-direction:column;
                gap:4px;
                min-width:0;
            }
            .theme-toggle-title {
                color:#f1f1f1;
                font-size:13px;
                font-weight:800;
            }
            .theme-toggle-description {
                color:#8f8f8f;
                font-size:11px;
                line-height:1.6;
            }
            .theme-placeholder {
                display:flex;
                flex-direction:column;
                gap:12px;
                padding-top:0;
            }
            .theme-placeholder-title {
                color:#f1f1f1;
                font-size:18px;
                font-weight:900;
                letter-spacing:-0.03em;
            }
            .theme-mode-group {
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                gap:10px;
            }
            .theme-mode-option {
                display:flex;
                align-items:center;
                gap:12px;
                position:relative;
                min-height:72px;
                padding:12px 0;
                border:1px solid transparent;
                border-radius:0;
                background:transparent;
                box-sizing:border-box;
                cursor:pointer;
                overflow:hidden;
                box-shadow:none;
                transition:color 0.18s ease, transform 0.18s ease;
            }
            .theme-mode-option::before {
                content:'';
                position:absolute;
                left:0;
                top:0;
                bottom:0;
                width:3px;
                border-radius:16px 0 0 16px;
                background:transparent;
                transition:background 0.18s ease;
            }
            .theme-mode-option:hover {
                transform:translateY(-1px);
            }
            .theme-mode-option:has(input:checked) {
                transform:translateY(-1px);
            }
            .theme-mode-option:has(input:checked)::before {
                background:transparent;
            }
            .theme-mode-option input {
                width:16px;
                height:16px;
                margin:0;
                accent-color:#f1f1f1;
                cursor:pointer;
            }
            .theme-mode-option-swatch {
                width:34px;
                height:34px;
                border-radius:12px;
                border:1px solid rgba(255,255,255,0.08);
                flex:0 0 auto;
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 14px rgba(0,0,0,0.14);
                transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
            }
            .theme-mode-option-swatch.light {
                background:linear-gradient(180deg, #f7f8fa, #dde2e8);
            }
            .theme-mode-option-swatch.dark {
                background:linear-gradient(180deg, #323232, #171717);
            }
            .theme-mode-option:has(input:checked) .theme-mode-option-swatch {
                transform:scale(1.06);
                border-color:rgba(255,255,255,0.18);
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 18px rgba(0,0,0,0.18);
            }
            .theme-mode-option:has(input:checked) .theme-mode-option-title {
                color:#ffffff;
            }
            .theme-mode-option:has(input:checked) .theme-mode-option-caption {
                color:#d4d4d4;
            }
            .theme-mode-option:has(input:focus-visible) {
                outline:2px solid rgba(220,220,220,0.72);
                outline-offset:2px;
            }
            .theme-mode-option-body {
                display:flex;
                flex-direction:column;
                gap:0;
                min-width:0;
            }
            .theme-mode-option-title {
                color:#f1f1f1;
                font-size:13px;
                font-weight:800;
            }
            .theme-mode-option-caption {
                color:#8d8d8d;
                font-size:10px;
                font-weight:600;
                line-height:1.4;
            }
            body[data-theme="light"] #setting-container {
                color:var(--light-text-default);
            }
            body[data-theme="light"] #setting-nav,
            body[data-theme="light"] #setting-nav-groups {
                border-color:rgba(84,92,104,0.12);
                background:rgba(0,0,0,0.02);
            }
            body[data-theme="light"] .setting-mode-row {
                border-color:rgba(84,92,104,0.1);
                background:linear-gradient(180deg, var(--light-surface-top), var(--light-surface-bottom));
                box-shadow:var(--light-highlight), 0 12px 22px rgba(38,46,58,0.06);
            }
            body[data-theme="light"] .setting-nav-group,
            body[data-theme="light"] .setting-category-button,
            body[data-theme="light"] .setting-mode-chip {
                color:var(--light-text-muted);
            }
            body[data-theme="light"] .setting-nav-group:hover,
            body[data-theme="light"] .setting-category-button:hover,
            body[data-theme="light"] .setting-mode-chip:hover {
                border-color:transparent;
                background:rgba(0,0,0,0.06);
                color:var(--light-text-default);
            }
            body[data-theme="light"] .setting-nav-group[aria-selected="true"],
            body[data-theme="light"] .setting-category-button.select-category,
            body[data-theme="light"] .setting-mode-chip.active {
                border-color:transparent;
                background:rgba(0,0,0,0.08);
                color:var(--light-text-strong);
                box-shadow:none;
            }
            body[data-theme="light"] #setting-status,
            body[data-theme="light"] .setting-scan-meta {
                border:none;
                background:transparent;
                color:var(--light-text-tint);
                box-shadow:none;
            }
            body[data-theme="light"] #setting-status::before {
                background:rgba(95,106,119,0.72);
                box-shadow:none;
            }
            body[data-theme="light"] #setting-status[data-tone="warning"] {
                color:#8a6842;
                background:transparent;
            }
            body[data-theme="light"] #setting-status[data-tone="success"] {
                color:#557246;
                background:transparent;
            }
            body[data-theme="light"] #setting-status[data-tone="warning"]::before {
                background:#c49352;
                box-shadow:none;
            }
            body[data-theme="light"] #setting-status[data-tone="success"]::before {
                background:#7fa46b;
                box-shadow:none;
            }
            body[data-theme="light"] .setting-item-card,
            body[data-theme="light"] .setting-add-card,
            body[data-theme="light"] .program-picker-card,
            body[data-theme="light"] .program-browser-item,
            body[data-theme="light"] .theme-toggle-card {
                border-color:rgba(84,92,104,0.1);
                background:linear-gradient(180deg, rgba(249,251,253,0.98), var(--light-surface-bottom));
                color:var(--light-text-default);
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 20px rgba(38,46,58,0.08);
            }
            body[data-theme="light"] .setting-item-card:hover,
            body[data-theme="light"] .setting-add-card:hover,
            body[data-theme="light"] .program-browser-item:hover,
            body[data-theme="light"] .theme-toggle-card:hover {
                border-color:rgba(84,92,104,0.16);
                background:linear-gradient(180deg, var(--light-surface-hover-top), var(--light-surface-hover-bottom));
            }
            body[data-theme="light"] .theme-toggle-card {
                border-color:transparent;
                background:transparent;
                box-shadow:none;
            }
            body[data-theme="light"] .theme-toggle-card:hover {
                border-color:transparent;
                background:transparent;
            }
            body[data-theme="light"] .setting-item-card.select-item {
                border-color:rgba(84,92,104,0.18);
                box-shadow:inset 0 0 0 1px rgba(255,255,255,0.88), 0 14px 24px rgba(38,46,58,0.1);
            }
            body[data-theme="light"] .setting-item-card-index {
                background:#dde4ec;
                color:#495563;
            }
            body[data-theme="light"] .setting-item-card-delete {
                border-color:rgba(84,92,104,0.1);
                background:rgba(255,255,255,0.8);
                color:#5d6975;
            }
            body[data-theme="light"] .setting-item-card-delete:hover {
                background:#ffffff;
                border-color:rgba(84,92,104,0.16);
                color:#24303a;
            }
            body[data-theme="light"] .setting-item-card-name,
            body[data-theme="light"] .program-picker-name,
            body[data-theme="light"] .program-browser-title,
            body[data-theme="light"] .program-browser-item-title,
            body[data-theme="light"] .slot-editor-title,
            body[data-theme="light"] .slot-editor-panel-title,
            body[data-theme="light"] .theme-control-title,
            body[data-theme="light"] .theme-placeholder-title,
            body[data-theme="light"] .theme-range-label,
            body[data-theme="light"] .theme-toggle-title {
                color:var(--light-text-strong);
            }
            body[data-theme="light"] .setting-item-card-meta,
            body[data-theme="light"] .program-picker-meta,
            body[data-theme="light"] .program-browser-caption,
            body[data-theme="light"] .program-browser-meta,
            body[data-theme="light"] .program-browser-item-meta,
            body[data-theme="light"] .slot-editor-panel-meta,
            body[data-theme="light"] .setting-field-label,
            body[data-theme="light"] .theme-control-description,
            body[data-theme="light"] .theme-range-caption,
            body[data-theme="light"] .theme-transparency-scale,
            body[data-theme="light"] .theme-mode-option-caption,
            body[data-theme="light"] .theme-toggle-description {
                color:var(--light-text-muted);
            }
            body[data-theme="light"] .setting-grid[data-category="ICON"] .setting-preview-icon-media,
            body[data-theme="light"] .program-browser-empty {
                background:rgba(233,238,244,0.82);
                border-color:rgba(97,107,120,0.2);
                color:#6a7682;
            }
            body[data-theme="light"] .setting-card-preview {
                background:transparent;
                box-shadow:none;
            }
            body[data-theme="light"] .setting-preview-gallery-shell {
                background:linear-gradient(180deg, rgba(230,235,241,0.98), rgba(214,221,229,0.96));
            }
            body[data-theme="light"] .setting-preview-gallery-media {
                background:rgba(201,210,220,0.5);
            }
            body[data-theme="light"] .setting-preview-gallery-name {
                color:#46525e;
                text-shadow:none;
            }
            body[data-theme="light"] .setting-grid[data-category="ICON"] .setting-preview-icon-shell {
                background:transparent;
            }
            body[data-theme="light"] .setting-preview-icon-name,
            body[data-theme="light"] .setting-grid[data-category="ICON"] .setting-preview-icon-name,
            body[data-theme="light"] .setting-card-preview-empty {
                color:#66717d;
            }
            body[data-theme="light"] .setting-card-preview.folder-preview {
                color:#56616d;
                background:linear-gradient(45deg, #dbe1e8 25%, #e8edf3 0, #e8edf3 50%, #dbe1e8 0, #dbe1e8 75%, #e8edf3 0);
                background-size:5px 5px;
            }
            body[data-theme="light"] .setting-add-card {
                color:#66717d;
            }
            body[data-theme="light"] .setting-add-card::before,
            body[data-theme="light"] .program-browser-empty {
                border-style:dashed;
                border-width:1px;
                border-color:rgba(97,107,120,0.24);
            }
            body[data-theme="light"] .setting-add-card::before {
                background:rgba(255,255,255,0.46);
            }
            body[data-theme="light"] .setting-add-card::after {
                background:
                    linear-gradient(rgba(102,113,125,0.92), rgba(102,113,125,0.92)) center / 22px 2px no-repeat,
                    linear-gradient(rgba(102,113,125,0.92), rgba(102,113,125,0.92)) center / 2px 22px no-repeat;
            }
            body[data-theme="light"] #slot-editor {
                color:var(--light-text-default);
            }
            body[data-theme="light"] .slot-editor-header,
            body[data-theme="light"] .slot-editor-panel-header,
            body[data-theme="light"] .slot-editor-actions,
            body[data-theme="light"] .slot-editor-side-panel {
                border-color:rgba(84,92,104,0.12);
            }
            body[data-theme="light"] .setting-field input,
            body[data-theme="light"] .setting-offset-input,
            body[data-theme="light"] .program-browser-search,
            body[data-theme="light"] .theme-control-value,
            body[data-theme="light"] .theme-transparency-range {
                border-color:rgba(84,92,104,0.1);
                background:var(--zen-tile, #ffffff);
                color:var(--light-text-default);
                box-shadow:none;
            }
            body[data-theme="light"] .setting-field input::placeholder,
            body[data-theme="light"] .program-browser-search::placeholder {
                color:var(--light-text-subtle);
            }
            body[data-theme="light"] .slot-secondary-button.danger-button,
            body[data-theme="light"] .setting-action-button.danger-button,
            body[data-theme="light"] .setting-action-button.danger-button:hover {
                border-color:transparent;
                background:var(--zen-danger-plate);
                color:var(--zen-danger-ink);
                box-shadow:none;
            }
            body[data-theme="light"] .setting-action-button.primary-button,
            body[data-theme="light"] .setting-action-button.primary-button:hover {
                border-color:transparent;
                background:#1c1c1c;
                color:#f5f5f5;
                box-shadow:none;
            }
            body[data-theme="light"] .setting-action-button.primary-button:hover {
                background:#000000;
            }
            body[data-theme="light"] .slot-secondary-button:hover,
            body[data-theme="light"] .slot-editor-close:hover,
            body[data-theme="light"] .file-item:hover,
            body[data-theme="light"] .setting-action-button:hover {
                border-color:var(--hairline);
                background:var(--zen-hover);
                box-shadow:none;
            }
            body[data-theme="light"] .program-picker-card.empty {
                background:rgba(255,255,255,0.58);
                color:#6a7682;
            }
            body[data-theme="light"] .program-browser-item-source {
                color:#4c5763;
                background:linear-gradient(180deg, rgba(239,243,247,0.98), rgba(219,226,234,0.98));
            }
            body[data-theme="light"] .theme-control-header {
                border-bottom-color:rgba(84,92,104,0.1);
            }
            body[data-theme="light"] .theme-control-value {
                color:var(--light-text-tint);
            }
            body[data-theme="light"] .theme-mode-option:has(input:checked) .theme-mode-option-title {
                color:var(--light-text-strong);
            }
            body[data-theme="light"] .theme-mode-option:has(input:checked) .theme-mode-option-caption {
                color:var(--light-text-muted);
            }
            body[data-theme="light"] .theme-mode-option,
            body[data-theme="light"] .theme-mode-option:hover,
            body[data-theme="light"] .theme-mode-option:has(input:checked) {
                border-color:transparent;
                background:transparent;
                box-shadow:none;
            }
            body[data-theme="light"] .theme-mode-option::before,
            body[data-theme="light"] .theme-mode-option:has(input:checked)::before {
                background:transparent;
            }
            body[data-theme="light"] .theme-mode-option-swatch,
            body[data-theme="light"] .theme-mode-option:has(input:checked) .theme-mode-option-swatch {
                box-shadow:none;
            }
            body[data-theme="light"] .theme-transparency-range {
                background:linear-gradient(90deg, rgba(181,190,201,0.56), rgba(226,231,237,0.92));
                box-shadow:inset 0 1px 2px rgba(103,116,129,0.14);
            }
            body[data-theme="light"] .theme-transparency-range::-webkit-slider-thumb {
                border-color:rgba(84,92,104,0.1);
                background:linear-gradient(180deg, #ffffff, var(--light-icon-surface));
                box-shadow:0 8px 16px rgba(38,46,58,0.14);
            }
            body[data-theme="light"] .setting-category-button:focus-visible,
            body[data-theme="light"] .setting-item-card:focus-visible,
            body[data-theme="light"] .setting-add-card:focus-visible,
            body[data-theme="light"] .setting-action-button:focus-visible,
            body[data-theme="light"] .file-item:focus-visible,
            body[data-theme="light"] .slot-secondary-button:focus-visible,
            body[data-theme="light"] .setting-field input:focus-visible,
            body[data-theme="light"] .theme-mode-option:has(input:focus-visible) {
                outline:2px solid rgba(146,164,184,0.72);
                outline-offset:2px;
            }
            .setting-segment .theme-mode-option,
            .setting-segment .theme-mode-option:hover,
            .setting-segment .theme-mode-option:has(input:checked) {
                min-height:var(--control-h, 32px);
                height:var(--control-h, 32px);
                padding:0 12px;
                gap:0;
                transform:none;
                border-radius:var(--radius-control, 8px);
                background:transparent;
                box-shadow:none;
            }
            .setting-segment .theme-mode-option::before,
            .setting-segment .theme-mode-option-swatch,
            .setting-segment .theme-mode-option input {
                display:none;
            }
            .setting-segment .theme-mode-option:has(input:checked) {
                background:rgba(255,255,255,0.08);
            }
            body[data-theme="light"] .setting-segment .theme-mode-option,
            body[data-theme="light"] .setting-segment .theme-mode-option:hover,
            body[data-theme="light"] .setting-segment .theme-mode-option:has(input:checked) {
                background:transparent;
                box-shadow:none;
                transform:none;
            }
            body[data-theme="light"] .setting-segment .theme-mode-option:has(input:checked) {
                background:rgba(0,0,0,0.06);
            }
        `;

        document.head.appendChild(style);
        this.#styleInjected = true;
    }

    #createItemEditor() {
        const editor = document.createElement('div');
        editor.id = 'slot-editor';

        const fields = document.createElement('div');
        fields.className = 'slot-editor-fields';
        fields.id = 'slot-editor-fields';

        const actions = document.createElement('div');
        actions.className = 'slot-editor-actions';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.id = 'btn-delete-item';
        deleteButton.className = 'setting-action-button danger-button';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', () => {
            this.#deleteActiveItem();
        });

        const backAction = document.createElement('button');
        backAction.type = 'button';
        backAction.className = 'setting-action-button';
        backAction.textContent = '뒤로';
        backAction.addEventListener('click', () => {
            this.#closeItemEditor();
        });

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'setting-action-button primary-button';
        saveButton.textContent = '저장';
        saveButton.addEventListener('click', async () => {
            await this.#saveDirtyCategories();
            this.#closeItemEditor();
        });

        const rightActions = document.createElement('div');
        rightActions.className = 'slot-editor-actions-right';
        rightActions.append(backAction, saveButton);
        actions.append(deleteButton, rightActions);
        editor.append(fields, actions);
        return editor;
    }

    #createProgramBrowser() {
        const overlay = document.createElement('div');
        overlay.id = 'program-browser';
        overlay.className = 'program-browser';

        const panel = document.createElement('div');
        panel.className = 'program-browser-panel';

        const header = document.createElement('div');
        header.className = 'program-browser-header';

        const titleWrap = document.createElement('div');
        titleWrap.append(
            this.#createStaticElement('div', 'program-browser-title', '프로그램 선택'),
            this.#createStaticElement('div', 'program-browser-caption', '수동 스캔으로 가져온 목록에서 항목을 선택해 바로 적용합니다.')
        );

        const rightTools = document.createElement('div');
        rightTools.className = 'program-browser-tools';

        const scanMeta = this.#createStaticElement('div', 'setting-scan-meta', '기록 없음');
        scanMeta.id = 'program-browser-scan-meta';

        const scanButton = document.createElement('button');
        scanButton.type = 'button';
        scanButton.id = 'btn-program-browser-scan';
        scanButton.className = 'setting-action-button scan-action-button';
        scanButton.append(
            this.#createStaticElement('span', 'scan-action-icon', ''),
            this.#createStaticElement('span', 'scan-action-label', '프로그램 스캔')
        );

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.id = 'btn-program-browser-close';
        closeButton.className = 'slot-secondary-button';
        closeButton.textContent = '편집으로';

        rightTools.append(scanMeta, scanButton, closeButton);
        header.append(titleWrap, rightTools);

        const searchRow = document.createElement('div');
        searchRow.className = 'program-browser-search-row';

        const searchInput = document.createElement('input');
        searchInput.id = 'program-browser-search';
        searchInput.className = 'program-browser-search';
        searchInput.type = 'text';
        searchInput.placeholder = '프로그램 이름이나 경로로 검색';

        const showHidden = document.createElement('label');
        showHidden.className = 'program-browser-show-hidden';
        const showHiddenInput = document.createElement('input');
        showHiddenInput.type = 'checkbox';
        showHiddenInput.id = 'program-browser-show-hidden';
        showHiddenInput.checked = this.#programBrowserShowHidden === true;
        showHidden.append(
            showHiddenInput,
            document.createTextNode('숨긴 프로그램 보기')
        );

        searchRow.append(searchInput, showHidden);

        const meta = document.createElement('div');
        meta.className = 'program-browser-meta';

        const count = this.#createStaticElement('div', '', '0개');
        count.id = 'program-browser-count';

        const status = this.#createStaticElement('div', '', '');
        status.id = 'program-browser-status';

        meta.append(count, status);

        const list = document.createElement('div');
        list.id = 'program-browser-list';
        list.className = 'program-browser-list';

        panel.append(header, searchRow, meta, list);
        overlay.appendChild(panel);
        return overlay;
    }

    #openEditor(category = ZenLauncherPreferences.activeCategory) {
        ZenLauncherPreferences.activeCategory = category;
        this.#syncNavGroupFromCategory(category);
        this.#renderNav();
        this.#renderCategoryItems(category);
        if (this.#editorCloseTimer) {
            window.clearTimeout(this.#editorCloseTimer);
            this.#editorCloseTimer = 0;
        }
        if (this.#editorOpenReadyTimer) {
            window.clearTimeout(this.#editorOpenReadyTimer);
            this.#editorOpenReadyTimer = 0;
        }
        const editor = ElementPath.editorElement;
        const wasEditorOpen = editor?.classList.contains('open') && !editor?.classList.contains('closing');
        const previousPanel = editor?.dataset.panel || '';
        const isPanelSwitch = wasEditorOpen && previousPanel && previousPanel !== 'settings';
        if (isPanelSwitch) {
            window.dispatchEvent(new CustomEvent('zen-launcher:settings-panel-switch'));
        }
        if (ElementPath.editorElement) {
            ElementPath.editorElement.dataset.panel = 'settings';
            this.#applySettingsFit();
        }
        this.#refreshStatus();
    }

    async #closeEditor() {
        if (this.#hasDirtyChanges()) {
            const response = await window.zenLauncher.showMessage({
                type: 'warning',
                message: '저장하지 않은 변경이 있습니다. 닫으면 입력 중인 내용이 사라집니다.',
                buttons: ['계속 편집', '버리고 닫기'],
                defaultId: 0,
                cancelId: 0
            });

            if (response !== 1) {
                return;
            }

            this.#resetDraftsFromSaved();
            this.#syncAllDirtyCategories();
            this.#statusOverride = {
                tone: 'neutral',
                message: '변경 취소됨'
            };
            this.#renderNav();
            this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        }

        this.#closeProgramBrowser({ restoreSize: false });
        this.#closeItemEditor({ closeProgramBrowser: false });
        const editor = ElementPath.editorElement;
        if (this.#editorOpenReadyTimer) {
            window.clearTimeout(this.#editorOpenReadyTimer);
            this.#editorOpenReadyTimer = 0;
        }
        if (this.#editorCloseTimer) {
            window.clearTimeout(this.#editorCloseTimer);
            this.#editorCloseTimer = 0;
        }
        if (editor?.dataset.panel === 'settings') {
            window.zenSheet?.closeSheet(editor);
        }
        this.#refreshStatus();
    }

    #switchNavGroup(group) {
        if (!Object.values(ZenLauncherPreferences.NavGroups).includes(group)) {
            return;
        }

        ZenLauncherPreferences.activeNavGroup = group;
        const firstVisible = this.#getTabButtons().find((button) => button.dataset.group === group);
        const nextCategory = this.#getTabCategory(firstVisible)
            || ZenLauncherPreferences.activeCategory;
        this.#switchCategory(nextCategory);
    }

    #switchCategory(category) {
        ZenLauncherPreferences.activeCategory = category;
        this.#syncNavGroupFromCategory(category);
        this.#activeItemIndex = -1;
        this.#statusOverride = null;
        this.#closeProgramBrowser();
        if (this.#isAppearancePanel(category)) {
            this.#closeItemEditor({ closeProgramBrowser: false });
        }
        this.#renderNav();
        this.#renderCategoryItems(category);
        this.#refreshStatus();
    }

    async #saveDirtyCategories() {
        const dirtyCategories = Object.values(ZenLauncherPreferences.Category).filter((category) => this.#isCategoryDirty(category));
        const shouldSaveAppearance = this.#appearanceDirty;

        if (dirtyCategories.length === 0 && !shouldSaveAppearance) {
            this.#statusOverride = {
                tone: 'neutral',
                message: '변경 없음'
            };
            this.#refreshStatus();
            return;
        }

        for (const category of dirtyCategories) {
            const savedItems = await window.zenLauncher.saveCategoryData(
                category,
                this.#drafts.get(category) || []
            );
            const normalizedItems = savedItems.map((item) => this.#normalizeItem(item, category));
            this.#savedData.set(category, normalizedItems);
            this.#drafts.set(category, normalizedItems.map((item) => ({ ...item })));
            this.#updateDirtyState(category);
        }

        if (shouldSaveAppearance) {
            const savedAppearance = await window.zenLauncher.saveAppearanceSettings(this.#draftAppearance);
            this.#savedAppearance = normalizeAppearanceSettings(savedAppearance);
            this.#draftAppearance = { ...this.#savedAppearance };
            this.#updateAppearanceDirtyState();
            this.#applyAppearance(this.#savedAppearance);
        }

        this.#statusOverride = {
            tone: 'success',
            message: `${dirtyCategories.length + (shouldSaveAppearance ? 1 : 0)}개 저장됨`
        };
        this.#renderNav();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
    }

    #renderNav() {
        this.#getNavGroupButtons().forEach((button) => {
            const isActive = button.dataset.group === ZenLauncherPreferences.activeNavGroup;
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        this.#getTabButtons().forEach((button) => {
            const category = this.#getTabCategory(button);
            const group = button.dataset.group || this.#getGroupForCategory(category);
            const isActive = category === ZenLauncherPreferences.activeCategory;
            const isDirty = this.#isAppearancePanel(category)
                ? this.#isAppearanceCategoryDirty(category)
                : this.#dirtyCategories.has(category);

            button.hidden = group !== ZenLauncherPreferences.activeNavGroup;
            button.classList.toggle('select-category', isActive);
            button.dataset.dirty = isDirty ? 'true' : 'false';
        });
    }

    #renderCategoryItems(category) {
        if (category === ZenLauncherPreferences.TransparencyCategory) {
            ElementPath.editorContext.replaceChildren(this.#createTransparencyPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.ThemeCategory) {
            ElementPath.editorContext.replaceChildren(this.#createThemePanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.LayoutCategory) {
            ElementPath.editorContext.replaceChildren(this.#createLayoutPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.ShortcutCategory) {
            ElementPath.editorContext.replaceChildren(this.#createShortcutPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.FullscreenCategory) {
            ElementPath.editorContext.replaceChildren(this.#createFullscreenPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.StartupCategory) {
            ElementPath.editorContext.replaceChildren(this.#createStartupPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.BackupCategory) {
            ElementPath.editorContext.replaceChildren(this.#createBackupPanel());
            this.#closeItemEditor();
            return;
        }

        if (category === ZenLauncherPreferences.CreditCategory) {
            ElementPath.editorContext.replaceChildren(this.#createCreditPanel());
            this.#closeItemEditor();
            return;
        }

        const items = this.#drafts.get(category) || [];
        const grid = document.createElement('div');
        grid.className = 'setting-grid';
        grid.dataset.category = category;
        const fragment = document.createDocumentFragment();
        const maxCount = ZenLauncherPreferences.MaxCount[category] || items.length;

        if (category === ZenLauncherPreferences.Category.ICON) {
            for (let index = 0; index < maxCount; index += 1) {
                const item = items[index];
                if (item?.link) {
                    fragment.appendChild(this.#createItemCard(category, item, index));
                } else {
                    fragment.appendChild(this.#createEmptySlotCard(category, index));
                }
            }
        } else {
            items.forEach((item, index) => {
                if (item?.link) {
                    fragment.appendChild(this.#createItemCard(category, item, index));
                }
            });
            const filledCount = items.filter((item) => item?.link).length;
            if (filledCount < maxCount) {
                const hole = items.findIndex((item) => !item?.link);
                const nextIndex = hole >= 0 ? hole : filledCount;
                fragment.appendChild(this.#createEmptySlotCard(category, nextIndex));
            }
        }

        grid.appendChild(fragment);
        ElementPath.editorContext.replaceChildren(grid);

        const activeItem = items[this.#activeItemIndex];
        if (!activeItem) {
            this.#closeItemEditor();
        }
    }

    #needsWideSheet() {
        const slotOpen = document.getElementById('slot-editor')?.classList.contains('open');
        const category = ZenLauncherPreferences.activeCategory;
        const editingWideItem = slotOpen && (
            category === ZenLauncherPreferences.Category.GALLERY
            || category === ZenLauncherPreferences.Category.ICON
            || category === ZenLauncherPreferences.Category.FOLDER
        );
        return this.#isProgramBrowserOpen() || editingWideItem;
    }

    #applySettingsFit() {
        const editor = ElementPath.editorElement;
        if (!editor || editor.dataset.panel !== 'settings') {
            return;
        }
        const fit = this.#needsWideSheet() ? 'workspace' : 'panel';
        editor.dataset.size = fit === 'workspace' ? 'l' : 'm';
        window.zenSheet?.openSheet(editor, { fit });
    }

    #createSettingPage(title) {
        const page = document.createElement('section');
        page.className = 'setting-page';
        const heading = this.#createStaticElement('h2', 'setting-page-title', title);
        const body = document.createElement('div');
        body.className = 'setting-page-body';
        page.append(heading, body);
        return { page, body };
    }

    #createSettingRow({ title, description, control }) {
        const row = document.createElement('div');
        row.className = 'setting-row-item';
        const copy = document.createElement('div');
        copy.className = 'setting-row-copy';
        copy.append(this.#createStaticElement('div', 'setting-row-title', title));
        if (description) {
            copy.append(this.#createStaticElement('div', 'setting-row-description', description));
        }
        const slot = document.createElement('div');
        slot.className = 'setting-row-control';
        if (control) {
            slot.append(control);
        }
        row.append(copy, slot);
        return row;
    }

    #createTransparencyPanel() {
        const { page, body } = this.#createSettingPage('투명도');
        const value = this.#createStaticElement('span', 'setting-inline-value', '0%');
        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'theme-transparency-range setting-inline-range';
        range.min = '0';
        range.max = `${MAX_LAUNCHER_TRANSPARENCY}`;
        range.step = '1';

        const rangeControl = document.createElement('div');
        rangeControl.className = 'setting-inline-cluster';
        rangeControl.append(range, value);

        const hoverCheckbox = document.createElement('input');
        hoverCheckbox.type = 'checkbox';
        hoverCheckbox.checked = this.#draftAppearance.revealOnHover === true;

        body.append(
            this.#createSettingRow({
                title: '런처 투명도',
                description: '0은 불투명, 100은 가장 투명합니다.',
                control: rangeControl
            }),
            this.#createSettingRow({
                title: '마우스를 올리면 선명하게',
                description: '평소 투명도를 유지하고, 올릴 때만 불투명해집니다.',
                control: hoverCheckbox
            })
        );

        const syncThemePanel = () => {
            const normalizedAppearance = normalizeAppearanceSettings(this.#draftAppearance);
            const transparencyText = `${normalizedAppearance.launcherTransparency}%`;
            range.value = `${normalizedAppearance.launcherTransparency}`;
            range.setAttribute('aria-valuetext', transparencyText);
            value.textContent = transparencyText;
            hoverCheckbox.checked = normalizedAppearance.revealOnHover === true;
        };

        range.addEventListener('input', () => {
            this.#updateAppearanceDraft({ launcherTransparency: range.value });
            syncThemePanel();
        });

        hoverCheckbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ revealOnHover: hoverCheckbox.checked });
            syncThemePanel();
        });

        syncThemePanel();
        return page;
    }

    #createCreditPanel() {
        const { page, body } = this.#createSettingPage('정보');
        const author = this.#createStaticElement('span', 'setting-inline-value', 'JISU YANG');
        const product = this.#createStaticElement('span', 'setting-inline-value', 'ZEN Launcher');
        const version = this.#createStaticElement('span', 'setting-inline-value', '확인 중');
        const date = this.#createStaticElement('span', 'setting-inline-value', '확인 중');
        body.append(
            this.#createSettingRow({ title: '제작자', control: author }),
            this.#createSettingRow({ title: '제품', control: product }),
            this.#createSettingRow({ title: '버전', control: version }),
            this.#createSettingRow({ title: '날짜', control: date })
        );

        window.zenLauncher.getAppInfo?.().then((info) => {
            if (!info || !page.isConnected) {
                return;
            }
            if (info.author) {
                author.textContent = info.author;
            }
            if (info.productName) {
                product.textContent = info.productName;
            }
            if (info.version) {
                version.textContent = `v${info.version}`;
            }
            if (info.releaseDate) {
                date.textContent = String(info.releaseDate).replace(/-/g, '.');
            }
        }).catch(() => {
            version.textContent = 'v2.3.6';
        });

        return page;
    }

    #createThemePanel() {
        const { page, body } = this.#createSettingPage('테마');
        const group = document.createElement('div');
        group.className = 'setting-segment';
        group.append(
            this.#createThemeModeOption({
                id: 'theme-mode-light',
                name: 'theme-mode',
                value: 'light',
                title: '라이트',
                checked: this.#draftAppearance.themeMode === 'light'
            }),
            this.#createThemeModeOption({
                id: 'theme-mode-dark',
                name: 'theme-mode',
                value: 'dark',
                title: '다크',
                checked: this.#draftAppearance.themeMode !== 'light'
            })
        );

        const grayscaleCheckbox = document.createElement('input');
        grayscaleCheckbox.type = 'checkbox';
        grayscaleCheckbox.checked = this.#draftAppearance.grayscaleUntilHover !== false;
        grayscaleCheckbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ grayscaleUntilHover: grayscaleCheckbox.checked });
        });

        body.append(
            this.#createSettingRow({
                title: '화면 모드',
                description: '라이트 또는 다크를 고릅니다.',
                control: group
            }),
            this.#createSettingRow({
                title: '평소에는 흑백으로 보기',
                description: '갤러리와 아이콘은 마우스를 올리면 원래 색이 보입니다.',
                control: grayscaleCheckbox
            })
        );
        return page;
    }

    #createShortcutPanel() {
        const { page, body } = this.#createSettingPage('단축키');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.#draftAppearance.suppressShortcutDuringFullscreen === true;
        checkbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ suppressShortcutDuringFullscreen: checkbox.checked });
        });
        body.append(this.#createSettingRow({
            title: '전체 화면이면 Ctrl+Space 멈추기',
            description: '다른 프로그램이 화면 전체를 쓰는 동안 단축키는 그 프로그램에 전달됩니다.',
            control: checkbox
        }));
        return page;
    }

    #createFullscreenPanel() {
        const { page, body } = this.#createSettingPage('전체 화면');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.#draftAppearance.minimizeResourcesDuringFullscreen !== false;
        checkbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ minimizeResourcesDuringFullscreen: checkbox.checked });
        });
        body.append(this.#createSettingRow({
            title: '전체 화면이면 자원 사용 줄이기',
            description: '애니메이션을 멈추고 화면 갱신을 초당 1회로 낮춥니다.',
            control: checkbox
        }));
        return page;
    }

    #createStartupPanel() {
        const { page, body } = this.#createSettingPage('시작');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.#draftAppearance.launchAtStartup === true;
        checkbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ launchAtStartup: checkbox.checked });
        });
        body.append(this.#createSettingRow({
            title: 'Windows 시작 시 자동 실행',
            description: '로그인할 때 런처가 시스템 트레이에서 실행됩니다.',
            control: checkbox
        }));
        return page;
    }

    #createLayoutPanel() {
        const { page, body } = this.#createSettingPage('배치');
        const metrics = this.#layoutMetrics || {};
        const displayWidth = metrics.displayWidth || metrics.workAreaWidth || '-';
        const displayHeight = metrics.displayHeight || metrics.workAreaHeight || '-';
        const autoX = Number.isFinite(metrics.autoX) ? metrics.autoX : (Number.isFinite(metrics.x) ? metrics.x : 0);
        const autoY = Number.isFinite(metrics.autoY) ? metrics.autoY : (Number.isFinite(metrics.y) ? metrics.y : 0);
        const resolution = this.#createStaticElement('span', 'setting-inline-value', `${displayWidth} × ${displayHeight}`);
        const autoPosition = this.#createStaticElement('span', 'setting-inline-value', `X ${autoX}px / Y ${autoY}px`);
        const corrected = this.#createStaticElement('span', 'setting-inline-value', '');
        const offsetX = this.#createOffsetInput(this.#draftAppearance.positionOffsetX, (value) => {
            this.#updateAppearanceDraft({ positionOffsetX: value });
        });
        const offsetY = this.#createOffsetInput(this.#draftAppearance.positionOffsetY, (value) => {
            this.#updateAppearanceDraft({ positionOffsetY: value });
        });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'setting-action-button';
        reset.textContent = '보정 초기화';

        const syncPreview = () => {
            corrected.textContent = `X ${autoX + this.#draftAppearance.positionOffsetX}px / Y ${autoY + this.#draftAppearance.positionOffsetY}px`;
        };
        reset.addEventListener('click', () => {
            this.#updateAppearanceDraft({ positionOffsetX: 0, positionOffsetY: 0 });
            offsetX.value = '0';
            offsetY.value = '0';
            syncPreview();
        });
        offsetX.addEventListener('input', syncPreview);
        offsetY.addEventListener('input', syncPreview);
        syncPreview();

        body.append(
            this.#createSettingRow({ title: '인식된 해상도', control: resolution }),
            this.#createSettingRow({ title: '자동 위치', control: autoPosition }),
            this.#createSettingRow({ title: '가로 보정', description: '오른쪽이 양수입니다. 단위는 px.', control: offsetX }),
            this.#createSettingRow({ title: '세로 보정', description: '아래가 양수입니다. 단위는 px.', control: offsetY }),
            this.#createSettingRow({ title: '보정 후 위치', control: corrected }),
            this.#createSettingRow({ title: '보정값', description: '자동 위치로 되돌립니다.', control: reset })
        );

        this.#refreshLayoutMetrics().then((nextMetrics) => {
            if (!page.isConnected || !nextMetrics) {
                return;
            }
            const width = nextMetrics.displayWidth || nextMetrics.workAreaWidth || '-';
            const height = nextMetrics.displayHeight || nextMetrics.workAreaHeight || '-';
            const nextAutoX = Number.isFinite(nextMetrics.autoX) ? nextMetrics.autoX : 0;
            const nextAutoY = Number.isFinite(nextMetrics.autoY) ? nextMetrics.autoY : 0;
            resolution.textContent = `${width} × ${height}`;
            autoPosition.textContent = `X ${nextAutoX}px / Y ${nextAutoY}px`;
            corrected.textContent = `X ${nextAutoX + this.#draftAppearance.positionOffsetX}px / Y ${nextAutoY + this.#draftAppearance.positionOffsetY}px`;
        });
        return page;
    }

    #createOffsetInput(value, onChange) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'setting-offset-input';
        input.step = '1';
        input.min = `${-POSITION_OFFSET_LIMIT}`;
        input.max = `${POSITION_OFFSET_LIMIT}`;
        input.value = `${value || 0}`;
        input.addEventListener('change', () => {
            onChange?.(normalizePositionOffsetValue(input.value));
            input.value = `${normalizePositionOffsetValue(input.value)}`;
        });
        return input;
    }

    #createBackupPanel() {
        const { page, body } = this.#createSettingPage('백업');
        const exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.className = 'setting-action-button';
        exportButton.textContent = '내보내기';
        exportButton.addEventListener('click', async () => {
            const result = await window.zenLauncher.exportSettings?.();
            if (!result || result.canceled) {
                return;
            }
            this.#statusOverride = {
                tone: 'success',
                message: '설정 파일로 내보냄'
            };
            this.#refreshStatus();
        });

        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.className = 'setting-action-button';
        importButton.textContent = '불러오기';
        importButton.addEventListener('click', async () => {
            const result = await window.zenLauncher.importSettings?.();
            if (!result || result.canceled) {
                return;
            }
            this.#applyImportedSettings(result);
        });

        body.append(
            this.#createSettingRow({
                title: '설정 내보내기',
                description: '항목과 모양 설정을 JSON 파일로 저장합니다.',
                control: exportButton
            }),
            this.#createSettingRow({
                title: '설정 불러오기',
                description: '파일을 읽은 뒤 저장을 눌러야 반영됩니다.',
                control: importButton
            })
        );
        return page;
    }

    #applyImportedSettings(payload) {
        const appearance = normalizeAppearanceSettings(payload?.appearance || {});
        this.#draftAppearance = appearance;
        this.#updateAppearanceDirtyState();
        this.#applyAppearance(appearance);

        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            const source = Array.isArray(payload?.categories?.[category])
                ? payload.categories[category]
                : [];
            const normalizedItems = source
                .map((item) => this.#normalizeItem(item, category))
                .filter((item) => item.link)
                .slice(0, ZenLauncherPreferences.MaxCount[category]);
            this.#drafts.set(category, normalizedItems.map((item) => ({ ...item })));
            this.#updateDirtyState(category);
        });

        this.#statusOverride = {
            tone: 'warning',
            message: '불러옴 · 저장 필요'
        };
        this.#renderNav();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#refreshStatus();
    }

    #createThemeModeOption({ id, name, value, title, checked = false }) {
        const label = document.createElement('label');
        label.className = 'theme-mode-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.id = id;
        input.value = value;
        input.checked = checked;
        input.addEventListener('change', () => {
            if (!input.checked) {
                return;
            }
            this.#updateAppearanceDraft({ themeMode: input.value });
        });

        const body = document.createElement('div');
        body.className = 'theme-mode-option-body';
        body.append(
            this.#createStaticElement('div', 'theme-mode-option-title', title)
        );

        const swatch = document.createElement('div');
        swatch.className = `theme-mode-option-swatch ${value}`;

        label.append(input, swatch, body);
        return label;
    }

    #createItemCard(category, item, index) {
        const button = document.createElement('div');
        button.className = 'setting-item-card';
        button.dataset.action = 'edit-item';
        button.dataset.itemIndex = `${index}`;
        button.setAttribute('role', 'button');
        button.tabIndex = 0;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'setting-item-card-delete';
        deleteButton.setAttribute('aria-label', '삭제');
        deleteButton.dataset.action = 'delete-item';
        deleteButton.dataset.itemIndex = `${index}`;

        if (index === this.#activeItemIndex) {
            button.classList.add('select-item');
        }

        button.append(
            deleteButton,
            this.#createStaticElement('div', 'setting-item-card-index', `${index + 1}`),
            this.#createPreviewElement(category, item),
            this.#createStaticElement('div', 'setting-item-card-name', item.name || this.#summarizeLink(item.link)),
            this.#createStaticElement('div', 'setting-item-card-meta', this.#getItemMetaText(category, item))
        );

        return button;
    }

    #createEmptySlotCard(category, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = category === ZenLauncherPreferences.Category.FOLDER
            ? 'setting-add-card zen-slot-add-preview folder'
            : `setting-add-card zen-slot-add-preview ${category}`;
        button.dataset.action = 'add-item';
        button.dataset.itemIndex = `${index}`;
        button.setAttribute(
            'aria-label',
            category === ZenLauncherPreferences.Category.FOLDER ? '폴더 추가' : '추가'
        );

        const icon = document.createElement('img');
        icon.src = 'src/icon/icon-plus.svg';
        icon.alt = '';
        button.appendChild(icon);
        return button;
    }

    #createPreviewElement(category, item) {
        const preview = document.createElement('div');
        preview.className = `setting-card-preview ${category}-preview`;

        if (category === ZenLauncherPreferences.Category.FOLDER) {
            if (!item.link) {
                preview.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', 'EMPTY'));
                return preview;
            }

            preview.classList.add('folder-preview', 'folder-preview-modern');
            const icon = document.createElement('img');
            icon.src = 'src/icon/icon-folder.svg';
            icon.alt = '';
            const label = this.#createStaticElement(
                'span',
                'setting-preview-folder-name',
                item.name || this.#summarizeLink(item.link)
            );
            preview.append(icon, label);
            return preview;
        }

        if (category === ZenLauncherPreferences.Category.GALLERY) {
            const shell = document.createElement('div');
            shell.className = 'setting-preview-gallery-shell';

            const media = document.createElement('div');
            media.className = 'setting-preview-gallery-media';

            if (item.img) {
                const image = document.createElement('img');
                image.src = item.img;
                image.alt = item.name || '';
                media.appendChild(image);
            } else {
                media.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', ''));
            }

            const label = this.#createStaticElement(
                'div',
                'setting-preview-gallery-name',
                item.name || this.#summarizeLink(item.link) || 'EMPTY'
            );

            shell.append(media, label);
            preview.appendChild(shell);
            return preview;
        }

        if (category === ZenLauncherPreferences.Category.ICON) {
            const shell = document.createElement('div');
            shell.className = 'setting-preview-icon-shell';

            const media = document.createElement('div');
            media.className = 'setting-preview-icon-media';

            if (item.img) {
                const image = document.createElement('img');
                image.src = item.img;
                image.alt = item.name || '';
                if (this.#isBundledIcon(item.img)) {
                    image.classList.add('icon-glyph');
                }
                media.appendChild(image);
            } else {
                media.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', this.#getItemInitial(item)));
            }

            const label = this.#createStaticElement(
                'div',
                'setting-preview-icon-name',
                item.name || this.#summarizeLink(item.link) || 'EMPTY'
            );

            shell.append(media, label);
            preview.appendChild(shell);
            return preview;
        }

        if (item.img) {
            const image = document.createElement('img');
            image.src = item.img;
            image.alt = item.name || '';
            preview.appendChild(image);
            return preview;
        }

        preview.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', category === ZenLauncherPreferences.Category.GALLERY ? 'GALLERY' : 'ICON'));
        return preview;
    }

    #openItemEditor(category, index, preferredMode = null) {
        const editor = document.getElementById('slot-editor');
        const fields = document.getElementById('slot-editor-fields');
        const deleteButton = document.getElementById('btn-delete-item');
        const item = (this.#drafts.get(category) || [])[index];
        const meta = this.#getCategoryMeta()[category];

        if (!editor || !fields || !item) {
            return;
        }

        this.#currentEditorMode = this.#resolveEditorMode(category, item, preferredMode);
        if (deleteButton) {
            deleteButton.style.display = 'inline-flex';
        }

        const stage = [this.#createLiveEditorPreview(category, item)];
        const form = [
            this.#createEditorField({
                category,
                index,
                key: 'name',
                label: '이름',
                value: item.name,
                placeholder: meta.namePlaceholder
            })
        ];

        if (category === ZenLauncherPreferences.Category.FOLDER) {
            form.push(this.#createSourceModeField([
                ['direct', '폴더', '경로를 직접 넣거나 고릅니다'],
                ['recommend', '추천', '자주 여는 폴더에서 고릅니다']
            ]));
            if (this.#currentEditorMode === 'recommend') {
                form.push(this.#createRecommendPanel(category, index, item));
            } else {
                form.push(this.#createEditorField({
                    category,
                    index,
                    key: 'link',
                    label: meta.linkLabel,
                    value: item.link,
                    placeholder: meta.linkPlaceholder,
                    withPicker: true,
                    pickerLabel: meta.selectButtonLabel
                }));
            }
        } else {
            stage.push(this.#createImageTools(category, index, item));
            form.push(this.#createSourceModeField());

            if (this.#currentEditorMode === 'program') {
                form.push(this.#createProgramPickerField(category, index, item));
            } else if (this.#currentEditorMode === 'recommend') {
                form.push(this.#createRecommendPanel(category, index, item));
            } else {
                form.push(this.#createEditorField({
                    category,
                    index,
                    key: 'link',
                    label: meta.linkLabel,
                    value: item.link,
                    placeholder: meta.linkPlaceholder,
                    withPicker: true,
                    pickerLabel: meta.selectButtonLabel
                }));
            }
        }

        fields.replaceChildren(this.#createEditorLayout({ stage, form }));
        fields.querySelector('.recommend-item[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });

        editor.classList.add('open');
        document.getElementById('setting-nav')?.setAttribute('data-collapsed', 'true');
        this.#applySettingsFit();
    }

    #createImageTools(category, index, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-image-tools';

        const actions = document.createElement('div');
        actions.className = 'editor-image-actions';

        const upload = document.createElement('button');
        upload.type = 'button';
        upload.className = 'setting-action-button';
        upload.textContent = item.img ? '이미지 바꾸기' : '이미지 선택';
        upload.addEventListener('click', async () => {
            const selectedPath = await window.zenLauncher.pickPath('image');
            if (!selectedPath) {
                return;
            }
            const input = wrapper.querySelector('input');
            if (input) {
                input.value = selectedPath;
            }
            this.#updateDraftValue(category, index, 'img', selectedPath);
        });
        actions.append(upload);

        if (item.img) {
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'setting-action-button';
            clear.textContent = '지우기';
            clear.addEventListener('click', () => {
                this.#updateDraftValue(category, index, 'img', '');
                this.#openItemEditor(category, index, this.#currentEditorMode);
            });
            actions.append(clear);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.img || '';
        input.placeholder = '또는 이미지 주소';
        input.addEventListener('input', () => {
            this.#updateDraftValue(category, index, 'img', input.value);
        });

        wrapper.append(
            this.#createStaticElement('span', 'setting-field-label', '이미지'),
            actions,
            input
        );
        return wrapper;
    }

    #createLiveEditorPreview(category, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-stage-preview';
        wrapper.append(
            this.#createStaticElement('span', 'setting-field-label', '런처에서 이렇게 보입니다'),
            this.#createPreviewElement(category, item)
        );
        return wrapper;
    }

    #createRecommendPanel(category, index, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-field-group';
        wrapper.appendChild(this.#createStaticElement('span', 'setting-field-label', '추천'));

        const isFolder = category === ZenLauncherPreferences.Category.FOLDER;
        const recommendations = isFolder ? this.#getRecommendedFolders() : this.#getRecommendedIcons();
        if (recommendations.length === 0) {
            const panel = document.createElement('div');
            panel.className = 'recommend-empty-panel';
            panel.append(
                this.#createStaticElement('div', 'recommend-empty-title', '추천'),
                this.#createStaticElement(
                    'div',
                    'recommend-empty-copy',
                    isFolder ? '추천 폴더를 불러오지 못했습니다.' : '기본 도구 목록을 불러오지 못했습니다.'
                )
            );
            wrapper.appendChild(panel);
            return wrapper;
        }

        const list = document.createElement('div');
        list.className = isFolder ? 'recommend-list recommend-list-stack' : 'recommend-list';
        const selected = isFolder ? this.#findRecommendedFolder(item?.link) : this.#findRecommendedIcon(item?.link);
        const selectedKey = this.#recommendationLinkKey(selected?.link);

        recommendations.forEach((recommended) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'recommend-item';
            const isCurrent = this.#recommendationLinkKey(recommended.link) === selectedKey && selectedKey !== '';
            if (isCurrent) {
                button.setAttribute('aria-current', 'true');
            }
            button.addEventListener('click', () => {
                this.#applyRecommendedIcon(category, index, recommended);
            });

            const icon = document.createElement('span');
            icon.className = 'recommend-item-icon';
            if (recommended.img) {
                const image = document.createElement('img');
                image.src = recommended.img;
                image.alt = '';
                icon.appendChild(image);
            }

            const copy = document.createElement('span');
            copy.className = 'recommend-item-copy';
            const detail = recommended.detail || recommended.link;
            const meta = this.#isLinkUsedElsewhere(category, index, recommended.link)
                ? `${detail} · 이미 추가됨`
                : detail;
            copy.append(
                this.#createStaticElement('strong', '', recommended.name),
                this.#createStaticElement('span', '', meta)
            );
            button.append(icon, copy);
            list.appendChild(button);
        });

        wrapper.appendChild(list);
        return wrapper;
    }

    #createEditorLayout(sections) {
        const layout = document.createElement('div');
        layout.className = 'slot-editor-layout';

        const stage = document.createElement('div');
        stage.className = 'editor-stage';
        stage.append(...sections.stage);

        const form = document.createElement('div');
        form.className = 'editor-form';
        form.append(...sections.form);

        layout.append(stage, form);
        return layout;
    }

    #createEditorField({ category, index, key, label, value, placeholder, withPicker = false, pickerLabel = '' }) {
        const wrapper = document.createElement('label');
        wrapper.className = 'setting-field';

        const labelElement = this.#createStaticElement('span', 'setting-field-label', label);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.placeholder = placeholder || '';
        input.addEventListener('input', () => {
            this.#updateDraftValue(category, index, key, input.value);
        });

        wrapper.append(labelElement);

        if (withPicker) {
            const control = document.createElement('div');
            control.className = 'setting-field-control';
            const picker = document.createElement('button');
            picker.type = 'button';
            picker.className = 'file-item';
            picker.textContent = pickerLabel;
            picker.addEventListener('click', async () => {
                const selectedPath = await window.zenLauncher.pickPath(
                    category === ZenLauncherPreferences.Category.FOLDER ? 'folder' : 'file'
                );

                if (!selectedPath) {
                    return;
                }

                input.value = selectedPath;
                this.#updateDraftValue(category, index, key, selectedPath);
            });
            control.append(input, picker);
            wrapper.appendChild(control);
            return wrapper;
        }

        wrapper.appendChild(input);
        return wrapper;
    }

    #createSourceModeField(modes = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-field-group';
        wrapper.append(this.#createStaticElement('span', 'setting-field-label', '여는 방법'));

        const row = document.createElement('div');
        row.className = 'editor-choice-list';
        row.setAttribute('role', 'listbox');
        row.setAttribute('aria-label', '여는 방법');

        const choices = modes || [
            ['direct', '링크', '웹 주소나 파일을 직접 넣습니다'],
            ['program', '프로그램', '설치된 프로그램에서 고릅니다'],
            ['recommend', '추천', '아이콘 바 기본 도구에서 고릅니다']
        ];
        choices.forEach(([mode, label, caption]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `editor-choice${this.#currentEditorMode === mode ? ' active' : ''}`;
            button.append(
                this.#createStaticElement('strong', '', label),
                this.#createStaticElement('span', '', caption)
            );
            button.addEventListener('click', () => {
                this.#setCurrentEditorMode(mode);
            });
            row.appendChild(button);
        });

        wrapper.appendChild(row);
        return wrapper;
    }

    #createProgramPickerField(category, index, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-field-group';
        wrapper.appendChild(this.#createStaticElement('span', 'setting-field-label', '프로그램'));

        const isSelectedFromScan = this.#isScannedProgramLink(item.link);
        const card = document.createElement('div');
        card.className = `program-picker-card${isSelectedFromScan ? '' : ' empty'}`;

        if (isSelectedFromScan) {
            const selectedProgram = this.#findScannedProgramByLink(item.link);
            card.append(
                this.#createStaticElement('div', 'program-picker-name', selectedProgram?.name || item.name || this.#summarizeLink(item.link)),
                this.#createStaticElement('div', 'program-picker-meta', item.link),
                this.#createStaticElement('div', 'program-picker-meta', this.#getProgramSourceLabel(selectedProgram?.source))
            );
        } else if (this.#programScanCache.length === 0) {
            card.append(
                this.#createStaticElement('div', 'program-picker-name', '아직 가져온 프로그램이 없습니다.'),
                this.#createStaticElement('div', 'program-picker-meta', '선택 창에서 한 번 스캔하면 다음에 바로 고를 수 있습니다.')
            );
        } else {
            card.append(
                this.#createStaticElement('div', 'program-picker-name', '프로그램을 골라 주세요.'),
                this.#createStaticElement('div', 'program-picker-meta', '고르면 이름과 실행 위치가 채워집니다.')
            );
        }

        const control = document.createElement('div');
        control.className = 'program-picker-control';

        const browseButton = document.createElement('button');
        browseButton.type = 'button';
        browseButton.className = 'file-item';
        browseButton.textContent = '프로그램 선택';
        browseButton.addEventListener('click', () => {
            this.#openProgramBrowser(category, index);
        });

        control.append(card, browseButton);
        wrapper.append(control);
        return wrapper;
    }

    #setCurrentEditorMode(mode) {
        const category = ZenLauncherPreferences.activeCategory;
        const index = this.#activeItemIndex;
        const item = (this.#drafts.get(category) || [])[index];
        if (!item || this.#currentEditorMode === mode) {
            return;
        }

        this.#currentEditorMode = mode;
        this.#openItemEditor(category, index, mode);
    }

    #updateDraftValue(category, index, key, value) {
        const items = [...(this.#drafts.get(category) || [])];
        items[index] = {
            ...items[index],
            [key]: value.trim()
        };

        this.#drafts.set(category, items);
        this.#updateDirtyState(category);
        this.#statusOverride = null;
        this.#renderNav();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);

        const editor = document.getElementById('slot-editor');
        if (editor?.classList.contains('open') && this.#activeItemIndex === index) {
            const livePreview = editor.querySelector('.editor-stage-preview .setting-card-preview');
            if (livePreview) {
                livePreview.replaceWith(this.#createPreviewElement(category, items[index]));
            }
        }
    }

    #applyScannedProgramSelection(category, index, program) {
        const items = [...(this.#drafts.get(category) || [])];
        const current = items[index];
        if (!current) {
            return;
        }

        items[index] = {
            ...current,
            name: current.name || program.name,
            link: program.link
        };

        this.#drafts.set(category, items);
        this.#updateDirtyState(category);
        this.#statusOverride = {
            tone: 'success',
            message: `"${program.name}" 적용됨`
        };
        this.#renderNav();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);
        this.#openItemEditor(category, index, 'program');
    }

    #applyRecommendedIcon(category, index, recommended) {
        const items = [...(this.#drafts.get(category) || [])];
        const current = items[index];
        if (!current || !recommended?.link) {
            return;
        }

        const next = {
            ...current,
            name: recommended.name || current.name,
            link: recommended.link
        };
        if (category !== ZenLauncherPreferences.Category.FOLDER && typeof recommended.img === 'string') {
            next.img = recommended.img;
        }
        items[index] = next;

        this.#drafts.set(category, items);
        this.#updateDirtyState(category);
        this.#statusOverride = {
            tone: 'success',
            message: `"${recommended.name}" 적용됨`
        };
        this.#renderNav();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);
        this.#openItemEditor(category, index, 'recommend');
    }

    #updateItemCardDom(category, index) {
        if (category !== ZenLauncherPreferences.activeCategory) {
            return;
        }

        const item = (this.#drafts.get(category) || [])[index];
        const card = ElementPath.editorContext?.querySelector(`.setting-item-card[data-item-index="${index}"]`);
        if (!card || !item) {
            return;
        }

        const preview = card.querySelector('.setting-card-preview');
        const name = card.querySelector('.setting-item-card-name');
        const meta = card.querySelector('.setting-item-card-meta');

        if (preview) {
            preview.replaceWith(this.#createPreviewElement(category, item));
        }
        if (name) {
            name.textContent = item.name || this.#summarizeLink(item.link);
        }
        if (meta) {
            meta.textContent = this.#getItemMetaText(category, item);
        }
    }

    async #addItem(category, index = null) {
        const items = [...(this.#drafts.get(category) || [])];
        const maxCount = ZenLauncherPreferences.MaxCount[category];
        if (items.filter(Boolean).length >= maxCount) {
            return;
        }

        const targetIndex = Number.isInteger(index) && index >= 0 ? index : items.findIndex((item) => !item);
        const resolvedIndex = targetIndex >= 0 ? targetIndex : items.length;
        if (resolvedIndex >= maxCount) {
            return;
        }

        items[resolvedIndex] = this.#normalizeItem({}, category);
        this.#drafts.set(category, items);
        this.#updateDirtyState(category);
        this.#activeItemIndex = resolvedIndex;
        this.#statusOverride = null;
        this.#renderNav();
        this.#renderCategoryItems(category);

        this.#openItemEditor(category, this.#activeItemIndex, 'direct');
        this.#refreshStatus();
    }

    async #confirmDelete() {
        const response = await window.zenLauncher.showMessage({
            type: 'warning',
            message: '이 항목을 삭제할까요?',
            detail: '삭제하면 빈 슬롯으로 바뀝니다.',
            buttons: ['취소', '삭제']
        });

        return response === 1;
    }

    async #deleteActiveItem() {
        const shouldDelete = await this.#confirmDelete();
        if (!shouldDelete) {
            return;
        }

        const category = ZenLauncherPreferences.activeCategory;
        this.#deleteItemAt(category, this.#activeItemIndex);
        this.#closeItemEditor();
    }

    #deleteItemAt(category, index) {
        const items = [...(this.#drafts.get(category) || [])];
        if (index < 0 || index >= items.length) {
            return;
        }

        items.splice(index, 1);
        this.#drafts.set(category, items);
        this.#updateDirtyState(category);
        this.#activeItemIndex = items.length === 0 ? -1 : Math.min(index, items.length - 1);
        this.#statusOverride = null;
        this.#closeProgramBrowser();
        this.#renderNav();
        this.#renderCategoryItems(category);
        this.#refreshStatus();
    }

    #closeItemEditor({ closeProgramBrowser = true, restoreSize = true } = {}) {
        const editor = document.getElementById('slot-editor');
        editor?.classList.remove('open');
        document.getElementById('setting-nav')?.removeAttribute('data-collapsed');
        this.#activeItemIndex = -1;
        this.#currentEditorMode = 'direct';
        if (closeProgramBrowser) {
            this.#closeProgramBrowser({ restoreSize });
            return;
        }
        if (restoreSize) {
            this.#applySettingsFit();
        }
    }

    #bindEditorGridEvents() {
        ElementPath.editorContext?.addEventListener('click', async (event) => {
            const actionTarget = event.target.closest('[data-action]');
            if (!actionTarget || !ElementPath.editorContext?.contains(actionTarget)) {
                return;
            }

            const grid = actionTarget.closest('.setting-grid');
            const category = grid?.dataset.category;
            if (!category) {
                return;
            }

            const action = actionTarget.dataset.action;
            const index = Number.parseInt(actionTarget.dataset.itemIndex || '-1', 10);

            if (action === 'delete-item') {
                event.preventDefault();
                event.stopPropagation();
                const shouldDelete = await this.#confirmDelete();
                if (!shouldDelete) {
                    return;
                }
                this.#deleteItemAt(category, index);
                return;
            }

            if (action === 'edit-item') {
                this.#activeItemIndex = index;
                this.#renderCategoryItems(category);
                this.#openItemEditor(category, index);
                return;
            }

            if (action === 'add-item') {
                await this.#addItem(category, index);
            }
        });

        ElementPath.editorContext?.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const actionTarget = event.target.closest('[data-action]');
            if (!actionTarget || !ElementPath.editorContext?.contains(actionTarget)) {
                return;
            }

            if (actionTarget.tagName === 'BUTTON') {
                return;
            }

            event.preventDefault();
            if (actionTarget.dataset.action === 'add-item') {
                await this.#addItem(
                    actionTarget.closest('.setting-grid')?.dataset.category || '',
                    Number.parseInt(actionTarget.dataset.itemIndex || '-1', 10)
                );
                return;
            }

            actionTarget.click();
        });
    }

    #renderLauncherItems() {
        this.#savedData.forEach((items, category) => {
            const listArea = document.getElementById(`${category}-area`);
            if (!listArea) {
                return;
            }

            listArea.replaceChildren();
            const fragment = document.createDocumentFragment();
            const maxCount = ZenLauncherPreferences.MaxCount[category] || items.length;
            const visibleItems = items.filter((item) => item && item.link);

            if (category === ZenLauncherPreferences.Category.ICON || category === ZenLauncherPreferences.Category.GALLERY) {
                for (let index = 0; index < maxCount; index += 1) {
                    const item = visibleItems[index];
                    const element = this.#createLauncherItem(item, category) || this.#createLauncherPlaceholder(category);
                    fragment.appendChild(element);
                }
            } else {
                visibleItems.forEach((item) => {
                    const element = this.#createLauncherItem(item, category);
                    if (element) {
                        fragment.appendChild(element);
                    }
                });
                if (visibleItems.length < maxCount) {
                    fragment.appendChild(this.#createLauncherPlaceholder(category));
                }
            }

            listArea.appendChild(fragment);
            listArea.classList.remove('is-empty');
        });
    }

    #createLauncherItem(item, category) {
        if (!item || typeof item.link !== 'string' || !item.link.trim()) {
            return null;
        }

        if (category === ZenLauncherPreferences.Category.FOLDER) {
            const folderItem = document.createElement('div');
            folderItem.className = 'launcher-basic list-item';
            folderItem.dataset.link = item.link;
            const folderIcon = document.createElement('img');
            folderIcon.src = 'src/icon/icon-folder.svg';
            folderIcon.alt = '';
            const folderLabel = document.createElement('span');
            folderLabel.textContent = item.name || item.link;
            folderItem.append(folderIcon, folderLabel);
            return folderItem;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `${category}-entry`;
        const isHttpLink = this.#isExternalLink(item.link);

        let container;
        if (isHttpLink) {
            container = document.createElement('a');
            container.href = item.link;
        } else {
            container = document.createElement('div');
            container.className = 'launcher';
            container.dataset.link = item.link;
        }

        container.appendChild(this.#createLauncherMediaElement(category, item));

        const name = document.createElement('span');
        name.className = `${category}-name`;
        name.textContent = item.name || item.link;
        container.appendChild(name);

        wrapper.appendChild(container);
        return wrapper;
    }

    #createLauncherMediaElement(category, item) {
        if (item.img) {
            const image = document.createElement('img');
            image.className = `${category}-img`;
            image.src = item.img;
            image.alt = item.name || '';
            if (category === ZenLauncherPreferences.Category.ICON && this.#isBundledIcon(item.img)) {
                image.classList.add('icon-glyph');
            }
            return image;
        }

        const fallback = document.createElement('div');
        fallback.className = `launcher-fallback ${category}-fallback`;
        fallback.textContent = category === ZenLauncherPreferences.Category.GALLERY
            ? ''
            : this.#getItemInitial(item);
        return fallback;
    }

    #createEmptyState(category) {
        const state = document.createElement('div');
        state.className = 'empty-state';

        const title = document.createElement('div');
        title.className = 'empty-state-title';
        title.textContent = category === ZenLauncherPreferences.Category.FOLDER ? 'EMPTY FOLDER' : 'EMPTY';

        state.appendChild(title);
        return state;
    }

    #openEmptySlot(category) {
        const items = this.#drafts.get(category) || [];
        const filledCount = items.filter((item) => item?.link).length;
        if (filledCount >= ZenLauncherPreferences.MaxCount[category]) {
            this.#openEditor(category);
            return;
        }

        const hole = items.findIndex((item) => !item?.link);
        const target = hole >= 0 ? hole : items.length;
        this.#openEditor(category);
        this.#addItem(category, target);
    }

    #createLauncherPlaceholder(category) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = category === ZenLauncherPreferences.Category.FOLDER
            ? 'list-item zen-slot-add'
            : `${category}-entry zen-slot-add`;
        if (category === ZenLauncherPreferences.Category.FOLDER) {
            const icon = document.createElement('img');
            icon.src = 'src/icon/icon-plus.svg';
            icon.alt = '';
            button.appendChild(icon);
            button.setAttribute('aria-label', '폴더 추가');
        } else {
            const icon = document.createElement('img');
            icon.src = 'src/icon/icon-plus.svg';
            icon.alt = '';
            button.appendChild(icon);
            button.setAttribute('aria-label', '추가');
        }
        button.addEventListener('click', () => {
            this.#openEmptySlot(category);
        });
        return button;
    }

    #refreshStatus() {
        const status = document.getElementById('setting-status');
        const scanButton = document.getElementById('btn-program-scan');
        const scanMeta = document.getElementById('program-scan-meta');
        const browserScanButton = document.getElementById('btn-program-browser-scan');
        const browserScanMeta = document.getElementById('program-browser-scan-meta');
        if (!status) {
            return;
        }

        if (scanButton) {
            const label = scanButton.querySelector('.scan-action-label');
            if (label) {
                label.textContent = this.#programScanLoading ? '스캔 중...' : '프로그램 스캔';
            }
            scanButton.disabled = this.#programScanLoading;
            scanButton.style.display = 'none';
        }

        if (scanMeta) {
            scanMeta.textContent = this.#formatScanTimestamp(this.#programScanScannedAt);
            scanMeta.style.display = 'none';
        }

        if (browserScanButton) {
            const label = browserScanButton.querySelector('.scan-action-label');
            if (label) {
                label.textContent = this.#programScanLoading ? '스캔 중...' : '프로그램 스캔';
            }
            browserScanButton.disabled = this.#programScanLoading;
        }

        if (browserScanMeta) {
            browserScanMeta.textContent = this.#formatScanTimestamp(this.#programScanScannedAt);
        }

        const dirtyCount = this.#getDirtyPreferenceCount();
        let tone = 'neutral';
        let message = '저장됨';

        if (dirtyCount > 0) {
            tone = 'warning';
            message = `${dirtyCount}개 변경됨`;
        } else if (this.#statusOverride) {
            tone = this.#statusOverride.tone;
            message = this.#statusOverride.message;
        }

        status.dataset.tone = tone;
        status.textContent = message;
    }

    async #loadProgramScanCache() {
        try {
            const cached = await window.zenLauncher.loadProgramScanCache();
            this.#programScanCache = Array.isArray(cached?.programs) ? cached.programs : [];
            this.#programScanScannedAt = typeof cached?.scannedAt === 'string' ? cached.scannedAt : '';
            this.#renderProgramBrowser();
        } catch (_error) {
            this.#programScanCache = [];
            this.#programScanScannedAt = '';
        }
    }

    async #scanPrograms({ openBrowserAfterScan = false } = {}) {
        if (this.#programScanLoading) {
            return;
        }

        this.#programScanLoading = true;
        this.#statusOverride = {
            tone: 'neutral',
            message: '프로그램 스캔 중'
        };
        this.#refreshStatus();
        this.#renderProgramBrowser();

        try {
            const scanResult = await window.zenLauncher.scanInstalledPrograms();
            this.#programScanCache = Array.isArray(scanResult?.programs) ? scanResult.programs : [];
            this.#programScanScannedAt = typeof scanResult?.scannedAt === 'string' ? scanResult.scannedAt : '';
            this.#statusOverride = {
                tone: 'success',
                message: `${this.#programScanCache.length}개 프로그램 스캔됨`
            };

            if (openBrowserAfterScan && this.#programBrowserContext) {
                this.#openProgramBrowser(this.#programBrowserContext.category, this.#programBrowserContext.index);
            }
        } catch (error) {
            this.#statusOverride = {
                tone: 'warning',
                message: error.message || '프로그램 스캔 실패'
            };
        } finally {
            this.#programScanLoading = false;
            this.#refreshStatus();
            this.#renderProgramBrowser();
        }
    }

    #openProgramBrowser(category, index) {
        this.#programBrowserContext = { category, index };
        this.#programBrowserFilter = '';

        const browser = document.getElementById('program-browser');
        const search = document.getElementById('program-browser-search');
        if (!browser || !search) {
            return;
        }

        browser.classList.add('open');
        if (ElementPath.editorElement?.dataset.panel === 'settings') {
            ElementPath.editorElement.classList.add('program-browser-active');
            this.#applySettingsFit();
        }
        search.value = '';
        this.#renderProgramBrowser();
        search.focus({ preventScroll: true });
    }

    #closeProgramBrowser({ restoreSize = true } = {}) {
        const browser = document.getElementById('program-browser');
        ElementPath.editorElement?.classList.remove('program-browser-active');
        browser?.classList.remove('open');
        if (restoreSize && ElementPath.editorElement?.dataset.panel === 'settings') {
            this.#applySettingsFit();
        }
        if (!browser) {
            return;
        }
        this.#programBrowserContext = null;
        this.#programBrowserFilter = '';
    }

    #isProgramBrowserOpen() {
        return document.getElementById('program-browser')?.classList.contains('open');
    }

    #getAssignedProgramLinkKeys(exclude = null) {
        const keys = new Set();
        [ZenLauncherPreferences.Category.GALLERY, ZenLauncherPreferences.Category.ICON]
            .forEach((category) => {
                (this.#drafts.get(category) || []).forEach((item, index) => {
                    if (!item?.link) {
                        return;
                    }
                    if (
                        exclude
                        && exclude.category === category
                        && exclude.index === index
                    ) {
                        return;
                    }
                    keys.add(window.zenLauncher.normalizeLinkKey?.(item.link) || item.link.toLowerCase());
                });
            });
        return keys;
    }

    #getProgramVisibility(program) {
        const assignedKeys = this.#getAssignedProgramLinkKeys(this.#programBrowserContext);
        const linkKey = window.zenLauncher.normalizeLinkKey?.(program.link) || String(program.link || '').toLowerCase();
        const isSystem = window.zenLauncher.isSystemProgram?.(program) === true;
        const isAssigned = assignedKeys.has(linkKey);
        return {
            isSystem,
            isAssigned,
            isHidden: isSystem || isAssigned
        };
    }

    #renderProgramBrowser() {
        const list = document.getElementById('program-browser-list');
        const count = document.getElementById('program-browser-count');
        const status = document.getElementById('program-browser-status');
        const showHiddenInput = document.getElementById('program-browser-show-hidden');
        if (!list || !count || !status) {
            return;
        }

        if (showHiddenInput) {
            showHiddenInput.checked = this.#programBrowserShowHidden === true;
        }

        const filter = this.#programBrowserFilter.toLowerCase();
        let hiddenCount = 0;
        const filteredPrograms = this.#programScanCache.filter((program) => {
            const visibility = this.#getProgramVisibility(program);
            if (visibility.isHidden) {
                hiddenCount += 1;
                if (!this.#programBrowserShowHidden) {
                    return false;
                }
            }

            if (!filter) {
                return true;
            }

            return [program.name, program.link, program.source]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(filter));
        });

        count.textContent = `${filteredPrograms.length}개`;
        status.textContent = this.#programScanLoading
            ? '스캔 중입니다.'
            : (hiddenCount > 0 && !this.#programBrowserShowHidden
                ? `시스템·추가됨 ${hiddenCount}개 숨김`
                : '');

        list.replaceChildren();

        if (this.#programScanLoading) {
            list.appendChild(this.#createStaticElement('div', 'program-browser-empty', '설치된 프로그램과 시작 메뉴 항목을 스캔하고 있습니다.'));
            return;
        }

        if (this.#programScanCache.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'program-browser-empty';
            empty.append(
                this.#createStaticElement('div', '', '아직 스캔된 프로그램이 없습니다.'),
                this.#createStaticElement('div', '', '아래 버튼을 눌러 설치된 프로그램과 시작 메뉴 항목을 가져오세요.')
            );

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'setting-action-button primary-button';
            button.style.marginTop = '14px';
            button.textContent = '지금 스캔';
            button.addEventListener('click', async () => {
                await this.#scanPrograms({ openBrowserAfterScan: true });
            });

            empty.appendChild(button);
            list.appendChild(empty);
            return;
        }

        if (filteredPrograms.length === 0) {
            list.appendChild(this.#createStaticElement(
                'div',
                'program-browser-empty',
                this.#programBrowserShowHidden
                    ? '검색 결과가 없습니다. 다른 이름이나 경로로 찾아보세요.'
                    : '표시할 프로그램이 없습니다. 숨긴 프로그램 보기를 켜 보세요.'
            ));
            return;
        }

        filteredPrograms.forEach((program) => {
            const visibility = this.#getProgramVisibility(program);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'program-browser-item';
            if (visibility.isHidden) {
                button.classList.add('is-hidden-program');
            }
            button.addEventListener('click', () => {
                if (!this.#programBrowserContext) {
                    return;
                }

                this.#applyScannedProgramSelection(
                    this.#programBrowserContext.category,
                    this.#programBrowserContext.index,
                    program
                );
                this.#closeProgramBrowser();
            });

            const info = document.createElement('div');
            const metaBits = [this.#getProgramSourceLabel(program.source)];
            if (visibility.isSystem) {
                metaBits.push('시스템');
            }
            if (visibility.isAssigned) {
                metaBits.push('이미 추가됨');
            }
            info.append(
                this.#createStaticElement('div', 'program-browser-item-title', program.name),
                this.#createStaticElement('div', 'program-browser-item-meta', `${metaBits.join(' · ')}\n${program.link}`)
            );

            const badge = this.#createStaticElement('div', 'program-browser-item-source', this.#getProgramSourceShortLabel(program.source));
            button.append(info, badge);
            list.appendChild(button);
        });
    }

    #hasDirtyChanges() {
        return this.#getDirtyPreferenceCount() > 0;
    }

    #isCategoryDirty(category) {
        const draftItems = this.#drafts.get(category) || [];
        const savedItems = this.#savedData.get(category) || [];
        return !this.#areItemsEqual(draftItems, savedItems);
    }

    #areItemsEqual(leftItems, rightItems) {
        if (leftItems.length !== rightItems.length) {
            return false;
        }

        for (let index = 0; index < leftItems.length; index += 1) {
            const left = leftItems[index];
            const right = rightItems[index];

            if (
                left?.name !== right?.name ||
                left?.link !== right?.link ||
                left?.img !== right?.img
            ) {
                return false;
            }
        }

        return true;
    }

    #updateDirtyState(category) {
        if (this.#isCategoryDirty(category)) {
            this.#dirtyCategories.add(category);
            return;
        }

        this.#dirtyCategories.delete(category);
    }

    #syncAllDirtyCategories() {
        this.#dirtyCategories.clear();
        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            this.#updateDirtyState(category);
        });
        this.#updateAppearanceDirtyState();
    }

    #resetDraftsFromSaved() {
        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            const savedItems = this.#savedData.get(category) || [];
            this.#drafts.set(category, savedItems.map((item) => ({ ...item })));
        });
        this.#draftAppearance = { ...this.#savedAppearance };
        this.#applyAppearance(this.#savedAppearance);
    }

    #extractPersistableItems(items, category) {
        return (items || [])
            .map((item) => this.#normalizeItem(item, category))
            .filter((item) => item.link);
    }

    #normalizeItem(item, category) {
        return {
            name: typeof item?.name === 'string' ? item.name.trim() : '',
            link: typeof item?.link === 'string' ? item.link.trim() : '',
            img: category !== ZenLauncherPreferences.Category.FOLDER && typeof item?.img === 'string'
                ? item.img.trim()
                : ''
        };
    }

    #resolveEditorMode(category, item, preferredMode = null) {
        if (category === ZenLauncherPreferences.Category.FOLDER) {
            if (preferredMode === 'direct' || preferredMode === 'recommend') {
                return preferredMode;
            }

            return this.#findRecommendedFolder(item.link) ? 'recommend' : 'direct';
        }

        if (preferredMode === 'direct' || preferredMode === 'program' || preferredMode === 'recommend') {
            return preferredMode;
        }

        if (this.#findRecommendedIcon(item.link)) {
            return 'recommend';
        }

        return this.#isScannedProgramLink(item.link) ? 'program' : 'direct';
    }

    #getRecommendedIcons() {
        const icons = window.zenLauncher?.getDefaultIcons?.();
        if (!Array.isArray(icons)) {
            return [];
        }

        return icons.filter((item) => item && typeof item.name === 'string' && typeof item.link === 'string' && item.link.trim());
    }

    #findRecommendedIcon(link) {
        if (typeof window.zenLauncher?.findDefaultIcon === 'function') {
            return window.zenLauncher.findDefaultIcon(link);
        }

        const key = String(link || '').trim().toLowerCase();
        if (!key) {
            return null;
        }

        return this.#getRecommendedIcons().find((item) => item.link.trim().toLowerCase() === key) || null;
    }

    #getRecommendedFolders() {
        const folders = window.zenLauncher?.getRecommendedFolders?.();
        if (!Array.isArray(folders)) {
            return [];
        }

        return folders.filter((item) => item && typeof item.name === 'string' && typeof item.link === 'string' && item.link.trim());
    }

    #findRecommendedFolder(link) {
        if (typeof window.zenLauncher?.findRecommendedFolder === 'function') {
            return window.zenLauncher.findRecommendedFolder(link);
        }

        const key = this.#recommendationLinkKey(link);
        if (!key) {
            return null;
        }

        return this.#getRecommendedFolders().find((item) => this.#recommendationLinkKey(item.link) === key) || null;
    }

    #recommendationLinkKey(link) {
        return String(link || '').trim().replace(/\//g, '\\').replace(/\\+/g, '\\').toLowerCase();
    }

    #isBundledIcon(img) {
        return /(^|[\\/])src[\\/]icon[\\/]/i.test(String(img || ''));
    }

    #isLinkUsedElsewhere(category, index, link) {
        const key = this.#recommendationLinkKey(link);
        if (!key) {
            return false;
        }

        return (this.#drafts.get(category) || []).some((item, itemIndex) => {
            return itemIndex !== index && this.#recommendationLinkKey(item?.link) === key;
        });
    }

    #isScannedProgramLink(link) {
        if (!link) {
            return false;
        }

        return this.#programScanCache.some((program) => program.link === link);
    }

    #findScannedProgramByLink(link) {
        return this.#programScanCache.find((program) => program.link === link) || null;
    }

    #isExternalLink(link) {
        return /^https?:\/\//i.test(link);
    }

    #getTabButtons() {
        return Array.from(document.querySelectorAll('#setting-nav-tabs [data-tab]'));
    }

    #getNavGroupButtons() {
        return Array.from(document.querySelectorAll('#setting-nav-groups [data-group]'));
    }

    #getCategoryMeta() {
        return {
            [ZenLauncherPreferences.Category.GALLERY]: {
                title: '갤러리',
                editorCaption: '포스터와 이름을 정하면 런처 왼쪽에 바로 보입니다.',
                namePlaceholder: '화면에 보일 이름',
                linkLabel: '주소 또는 파일',
                linkPlaceholder: 'https:// 또는 실행 파일',
                imagePlaceholder: '이미지 주소',
                selectButtonLabel: '파일 선택'
            },
            [ZenLauncherPreferences.Category.ICON]: {
                title: '아이콘',
                editorCaption: '작은 아이콘과 짧은 이름으로 바로 실행합니다.',
                namePlaceholder: '화면에 보일 이름',
                linkLabel: '주소 또는 파일',
                linkPlaceholder: 'https:// 또는 실행 파일',
                imagePlaceholder: '이미지 주소',
                selectButtonLabel: '파일 선택'
            },
            [ZenLauncherPreferences.Category.FOLDER]: {
                title: '폴더',
                editorCaption: '이름과 폴더를 정하면 목록에서 바로 엽니다.',
                namePlaceholder: '화면에 보일 이름',
                linkLabel: '폴더',
                linkPlaceholder: '열 폴더를 선택하세요',
                imagePlaceholder: '',
                selectButtonLabel: '폴더 선택'
            }
        };
    }

    #getItemMetaText(category, item) {
        if (category === ZenLauncherPreferences.Category.FOLDER) {
            const recommended = this.#findRecommendedFolder(item.link);
            if (recommended?.detail) {
                return this.#summarizeLinkTail(recommended.detail, 18);
            }
            return this.#summarizeLinkTail(item.link, 14);
        }

        if (this.#isExternalLink(item.link)) {
            return '외부 링크';
        }

        if (this.#findRecommendedIcon(item.link)) {
            return '기본 도구';
        }

        if (this.#isScannedProgramLink(item.link)) {
            const program = this.#findScannedProgramByLink(item.link);
            return this.#getProgramSourceLabel(program?.source);
        }

        return '직접 지정';
    }

    #getProgramSourceLabel(source) {
        if (source === 'installed') {
            return '설치 프로그램';
        }

        if (source === 'start-menu') {
            return '시작 메뉴';
        }

        return '프로그램';
    }

    #getProgramSourceShortLabel(source) {
        if (source === 'installed') {
            return 'APP';
        }

        if (source === 'start-menu') {
            return 'MENU';
        }

        return 'PROGRAM';
    }

    #formatScanTimestamp(value) {
        if (!value) {
            return '기록 없음';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '기록 없음';
        }

        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    #getItemInitial(item) {
        const seed = item?.name || item?.link || 'A';
        return seed.trim().slice(0, 1).toUpperCase();
    }

    #summarizeLink(link, maxVisualLength = 26) {
        if (!link) {
            return '';
        }

        let visualLength = 0;
        let result = '';

        for (const character of link) {
            const characterWeight = /[^\u0000-\u00ff]/.test(character) ? 2 : 1;
            if (visualLength + characterWeight > maxVisualLength) {
                return `${result}...`;
            }

            result += character;
            visualLength += characterWeight;
        }

        if (visualLength <= maxVisualLength) {
            return link;
        }

        return `${result}...`;
    }

    #summarizeLinkTail(link, maxVisualLength = 26) {
        if (!link) {
            return '';
        }

        let visualLength = 0;
        let result = '';

        for (let index = link.length - 1; index >= 0; index -= 1) {
            const character = link[index];
            const characterWeight = /[^\u0000-\u00ff]/.test(character) ? 2 : 1;
            if (visualLength + characterWeight > maxVisualLength) {
                return `...${result}`;
            }

            result = `${character}${result}`;
            visualLength += characterWeight;
        }

        return link;
    }

    #createStaticElement(tagName, className, textContent) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        element.textContent = textContent;
        return element;
    }

    #setText(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        }
    }

    #makeAccessibleButton(element, onActivate) {
        if (!element) {
            return;
        }

        if (typeof onActivate === 'function') {
            element.addEventListener('click', onActivate);
        }

        element.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            if (typeof onActivate === 'function') {
                onActivate();
                return;
            }

            element.click();
        });
    }

    #isEditorOpen() {
        return ElementPath.editorElement?.classList.contains('open');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const [data, appearanceSettings] = await Promise.all([
        window.zenLauncher.loadData(),
        window.zenLauncher.loadAppearanceSettings()
    ]);
    applyAppearanceSettingsToDocument(appearanceSettings);
    new ZenLauncherPreferences(data, appearanceSettings);
});
