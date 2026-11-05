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
    suppressShortcutDuringFullscreen: false,
    minimizeResourcesDuringFullscreen: true,
    launchAtStartup: false
});
const EXPANDED_PANEL_OPEN_READY_DELAY_MS = 420;
const SETTINGS_PANEL_SWITCH_OPEN_READY_DELAY_MS = 180;

function normalizeAppearanceSettings(value = {}) {
    const rawTransparency = Number.parseInt(value?.launcherTransparency, 10);
    const launcherTransparency = Number.isFinite(rawTransparency)
        ? Math.min(MAX_LAUNCHER_TRANSPARENCY, Math.max(0, rawTransparency))
        : DEFAULT_APPEARANCE_SETTINGS.launcherTransparency;
    const themeMode = value?.themeMode === 'light'
        ? 'light'
        : DEFAULT_APPEARANCE_SETTINGS.themeMode;
    const revealOnHover = value?.revealOnHover === true;
    const suppressShortcutDuringFullscreen = value?.suppressShortcutDuringFullscreen === true;
    const minimizeResourcesDuringFullscreen = value?.minimizeResourcesDuringFullscreen !== false;
    const launchAtStartup = value?.launchAtStartup === true;

    return {
        launcherTransparency,
        themeMode,
        revealOnHover,
        suppressShortcutDuringFullscreen,
        minimizeResourcesDuringFullscreen,
        launchAtStartup
    };
}

function applyAppearanceSettingsToDocument(settings) {
    const normalizedSettings = normalizeAppearanceSettings(settings);
    const { launcherTransparency, themeMode, revealOnHover } = normalizedSettings;
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
    if (document.body) {
        document.body.dataset.theme = themeMode;
        document.body.dataset.hoverRevealEnabled = revealOnHover ? 'true' : 'false';
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
    static ShortcutCategory = 'shortcut';
    static CreditCategory = 'credit';

    static MaxCount = {
        gallery: 6,
        icon: 8,
        folder: 5
    };

    static activeCategory = ZenLauncherPreferences.Category.GALLERY;

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
    #styleInjected = false;
    #editorCloseTimer = 0;
    #editorOpenReadyTimer = 0;
    #savedAppearance = { ...DEFAULT_APPEARANCE_SETTINGS };
    #draftAppearance = { ...DEFAULT_APPEARANCE_SETTINGS };
    #appearanceDirty = false;

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
        this.#renderCategoryButtons();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
        this.#loadProgramScanCache();
    }

    #getTabCategory(button) {
        if (!button) {
            return '';
        }

        if (button.dataset.tab === ZenLauncherPreferences.TransparencyCategory) {
            return ZenLauncherPreferences.TransparencyCategory;
        }

        if (button.dataset.tab === ZenLauncherPreferences.ThemeCategory) {
            return ZenLauncherPreferences.ThemeCategory;
        }

        if (button.dataset.tab === ZenLauncherPreferences.ShortcutCategory) {
            return ZenLauncherPreferences.ShortcutCategory;
        }

        if (button.dataset.tab === ZenLauncherPreferences.CreditCategory) {
            return ZenLauncherPreferences.CreditCategory;
        }

        return ZenLauncherPreferences.Category[button.dataset.category] || '';
    }

    #areAppearanceSettingsEqual(left, right) {
        return left?.launcherTransparency === right?.launcherTransparency
            && left?.themeMode === right?.themeMode
            && left?.revealOnHover === right?.revealOnHover
            && left?.suppressShortcutDuringFullscreen === right?.suppressShortcutDuringFullscreen
            && left?.minimizeResourcesDuringFullscreen === right?.minimizeResourcesDuringFullscreen
            && left?.launchAtStartup === right?.launchAtStartup;
    }

    #isAppearanceCategoryDirty(category) {
        const draft = this.#draftAppearance;
        const saved = this.#savedAppearance;

        if (category === ZenLauncherPreferences.TransparencyCategory) {
            return draft.launcherTransparency !== saved.launcherTransparency
                || draft.revealOnHover !== saved.revealOnHover;
        }

        if (category === ZenLauncherPreferences.ThemeCategory) {
            return draft.themeMode !== saved.themeMode;
        }

        if (category === ZenLauncherPreferences.ShortcutCategory) {
            return draft.suppressShortcutDuringFullscreen !== saved.suppressShortcutDuringFullscreen
                || draft.minimizeResourcesDuringFullscreen !== saved.minimizeResourcesDuringFullscreen
                || draft.launchAtStartup !== saved.launchAtStartup;
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
        this.#renderCategoryButtons();
        this.#refreshStatus();
        this.#applyAppearance(this.#draftAppearance);
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
            this.#renderCategoryButtons();
            this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
            this.#renderLauncherItems();
            this.#refreshStatus();
        });

        ElementPath.saveButton?.addEventListener('click', async () => {
            await this.#saveDirtyCategories();
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

        this.#getTabButtons().forEach((button) => {
            button.classList.add('setting-category-button');
            button.setAttribute('role', 'button');
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
        scanButton.className = 'setting-action-button scan-action-button';
        scanButton.append(
            this.#createStaticElement('span', 'scan-action-icon', ''),
            this.#createStaticElement('span', 'scan-action-label', '프로그램 스캔')
        );

        const scanMeta = this.#createStaticElement('div', 'setting-scan-meta', '기록 없음');
        scanMeta.id = 'program-scan-meta';

        const actions = document.createElement('div');
        actions.className = 'setting-topbar-actions';
        actions.append(scanButton, scanMeta, status);
        ElementPath.settingTopbar?.appendChild(actions);

        const footerGroups = document.querySelectorAll('.btn-row > div');
        const footerStatusGroup = footerGroups[0];
        const footerActionGroup = footerGroups[1];
        if (footerStatusGroup && ElementPath.clearButton) {
            footerStatusGroup.replaceChildren(ElementPath.clearButton);
        }
        if (footerActionGroup) {
            footerActionGroup.replaceChildren(ElementPath.saveButton, ElementPath.cancelButton);
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
                display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; padding:8px;
                border:1px solid rgba(255,255,255,0.08); border-radius:18px;
                background:linear-gradient(180deg, rgba(21,21,21,0.96), rgba(15,15,15,0.98));
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);
            }
            .setting-mode-chip {
                display:inline-flex; align-items:center; justify-content:center; min-width:0; height:40px; padding:0 14px;
                border-radius:12px; border:1px solid transparent; background:transparent;
                color:#8d8d8d; cursor:pointer; font-size:11px; font-weight:800; box-sizing:border-box;
                transition:background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
            }
            .setting-mode-chip:hover { background:rgba(255,255,255,0.04); color:#cfcfcf; transform:translateY(-1px); }
            .setting-mode-chip.active {
                background:linear-gradient(180deg, rgba(72,72,72,0.96), rgba(44,44,44,0.98));
                border-color:rgba(255,255,255,0.14); color:#f3f3f3;
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.03);
            }
            .program-picker-card {
                display:flex; flex-direction:column; gap:6px; padding:12px 14px; border-radius:16px;
                background:linear-gradient(180deg, rgba(42,42,42,0.96), rgba(28,28,28,0.98));
                border:1px solid rgba(255,255,255,0.08); box-sizing:border-box;
            }
            .program-picker-control { display:flex; align-items:stretch; gap:8px; min-width:0; }
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
                inset:10px 0 0 0;
                display:flex;
                flex-direction:column;
                overflow:hidden;
                opacity:0;
                visibility:hidden;
                pointer-events:none;
                transform:translateY(12px);
                transition:opacity 0.24s ease, transform 0.34s cubic-bezier(0.25, 0.8, 0.2, 1), visibility 0s linear 0.34s;
                background:transparent;
                border:none;
                border-radius:0;
                box-shadow:none;
                z-index:30;
                box-sizing:border-box;
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
                background:rgba(255,255,255,0.03); color:#f1f1f1; font-family:'Noto Sans KR', sans-serif; font-size:12px; box-sizing:border-box;
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
            body[data-theme="light"] #setting-category,
            body[data-theme="light"] .setting-mode-row {
                border-color:rgba(84,92,104,0.1);
                background:linear-gradient(180deg, var(--light-surface-top), var(--light-surface-bottom));
                box-shadow:var(--light-highlight), 0 12px 22px rgba(38,46,58,0.06);
            }
            body[data-theme="light"] .setting-category-button,
            body[data-theme="light"] .setting-mode-chip {
                color:var(--light-text-muted);
            }
            body[data-theme="light"] .setting-category-button:hover,
            body[data-theme="light"] .setting-mode-chip:hover {
                border-color:rgba(84,92,104,0.12);
                background:rgba(255,255,255,0.72);
                color:var(--light-text-default);
            }
            body[data-theme="light"] .setting-category-button.select-category,
            body[data-theme="light"] .setting-mode-chip.active {
                border-color:rgba(84,92,104,0.18);
                background:linear-gradient(180deg, var(--light-surface-hover-top), var(--light-surface-active-bottom));
                color:var(--light-text-strong);
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.92), var(--light-shadow-medium);
            }
            body[data-theme="light"] #setting-status,
            body[data-theme="light"] .setting-scan-meta {
                border-color:rgba(84,92,104,0.1);
                background:rgba(255,255,255,0.82);
                color:var(--light-text-tint);
                box-shadow:var(--light-highlight);
            }
            body[data-theme="light"] #setting-status::before {
                background:rgba(95,106,119,0.72);
                box-shadow:0 0 0 3px rgba(196,204,214,0.6);
            }
            body[data-theme="light"] #setting-status[data-tone="warning"] {
                color:#8a6842;
                border-color:rgba(173,133,75,0.2);
                background:linear-gradient(90deg, rgba(219,187,133,0.22), transparent 34%), rgba(255,255,255,0.82);
            }
            body[data-theme="light"] #setting-status[data-tone="success"] {
                color:#557246;
                border-color:rgba(108,149,86,0.2);
                background:linear-gradient(90deg, rgba(165,208,141,0.18), transparent 34%), rgba(255,255,255,0.82);
            }
            body[data-theme="light"] #setting-status[data-tone="warning"]::before {
                background:#c49352;
                box-shadow:0 0 0 4px rgba(196,147,82,0.18);
            }
            body[data-theme="light"] #setting-status[data-tone="success"]::before {
                background:#7fa46b;
                box-shadow:0 0 0 4px rgba(127,164,107,0.18);
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
            body[data-theme="light"] .program-browser-search,
            body[data-theme="light"] .theme-control-value,
            body[data-theme="light"] .theme-transparency-range,
            body[data-theme="light"] .slot-secondary-button,
            body[data-theme="light"] .slot-editor-close,
            body[data-theme="light"] .file-item,
            body[data-theme="light"] .setting-action-button {
                border-color:rgba(84,92,104,0.1);
                background:linear-gradient(180deg, var(--light-surface-top), var(--light-surface-bottom));
                color:var(--light-text-default);
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.92), var(--light-shadow-soft);
            }
            body[data-theme="light"] .setting-field input::placeholder,
            body[data-theme="light"] .program-browser-search::placeholder {
                color:var(--light-text-subtle);
            }
            body[data-theme="light"] .slot-secondary-button.danger-button,
            body[data-theme="light"] .setting-action-button.danger-button {
                border-color:rgba(176,110,124,0.2);
                background:linear-gradient(180deg, rgba(252,243,245,0.98), rgba(244,226,231,0.96));
                color:#9b5e6b;
            }
            body[data-theme="light"] .setting-action-button.primary-button {
                border-color:rgba(84,92,104,0.14);
                background:linear-gradient(180deg, var(--light-surface-hover-top), var(--light-surface-active-bottom));
                color:var(--light-text-strong);
            }
            body[data-theme="light"] .slot-secondary-button:hover,
            body[data-theme="light"] .slot-editor-close:hover,
            body[data-theme="light"] .file-item:hover,
            body[data-theme="light"] .setting-action-button:hover {
                border-color:rgba(84,92,104,0.16);
                background:linear-gradient(180deg, var(--light-surface-hover-top), var(--light-surface-hover-bottom));
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
        `;

        document.head.appendChild(style);
        this.#styleInjected = true;
    }

    #createItemEditor() {
        const editor = document.createElement('div');
        editor.id = 'slot-editor';

        const header = document.createElement('div');
        header.className = 'slot-editor-header';

        const title = this.#createStaticElement('div', 'slot-editor-title', '항목 편집');
        title.id = 'slot-editor-title';

        header.append(title);

        const fields = document.createElement('div');
        fields.className = 'slot-editor-fields';
        fields.id = 'slot-editor-fields';

        const actions = document.createElement('div');
        actions.className = 'slot-editor-actions';

        const leftActions = document.createElement('div');
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.id = 'btn-delete-item';
        deleteButton.className = 'slot-secondary-button danger-button';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', () => {
            this.#deleteActiveItem();
        });
        leftActions.appendChild(deleteButton);

        const rightActions = document.createElement('div');
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'slot-secondary-button';
        cancelButton.textContent = '취소';
        cancelButton.addEventListener('click', () => {
            this.#closeItemEditor();
        });

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'slot-secondary-button';
        doneButton.textContent = '완료';
        doneButton.addEventListener('click', () => {
            this.#closeItemEditor();
        });
        rightActions.append(cancelButton, doneButton);

        actions.append(leftActions, rightActions);
        editor.append(header, fields, actions);
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
        closeButton.textContent = '닫기';

        rightTools.append(scanMeta, scanButton, closeButton);
        header.append(titleWrap, rightTools);

        const searchInput = document.createElement('input');
        searchInput.id = 'program-browser-search';
        searchInput.className = 'program-browser-search';
        searchInput.type = 'text';
        searchInput.placeholder = '프로그램 이름이나 경로로 검색';

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

        panel.append(header, searchInput, meta, list);
        overlay.appendChild(panel);
        return overlay;
    }

    #openEditor(category = ZenLauncherPreferences.activeCategory) {
        ZenLauncherPreferences.activeCategory = category;
        this.#renderCategoryButtons();
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
            const fit = ElementPath.editorElement.classList.contains('program-browser-active') ? 'workspace' : 'panel';
            window.zenSheet?.openSheet(ElementPath.editorElement, { fit });
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
            this.#renderCategoryButtons();
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

    #switchCategory(category) {
        ZenLauncherPreferences.activeCategory = category;
        this.#activeItemIndex = -1;
        this.#statusOverride = null;
        this.#closeProgramBrowser();
        if (
            category === ZenLauncherPreferences.TransparencyCategory
            || category === ZenLauncherPreferences.ThemeCategory
            || category === ZenLauncherPreferences.ShortcutCategory
            || category === ZenLauncherPreferences.CreditCategory
        ) {
            this.#closeItemEditor({ closeProgramBrowser: false });
        }
        this.#renderCategoryButtons();
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
        this.#renderCategoryButtons();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
    }

    #renderCategoryButtons() {
        this.#getTabButtons().forEach((button) => {
            const category = this.#getTabCategory(button);
            const isActive = category === ZenLauncherPreferences.activeCategory;
            const isAppearanceCategory = category === ZenLauncherPreferences.TransparencyCategory
                || category === ZenLauncherPreferences.ThemeCategory
                || category === ZenLauncherPreferences.ShortcutCategory
                || category === ZenLauncherPreferences.CreditCategory;
            const isDirty = isAppearanceCategory
                ? this.#isAppearanceCategoryDirty(category)
                : this.#dirtyCategories.has(category);

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

        if (category === ZenLauncherPreferences.ShortcutCategory) {
            ElementPath.editorContext.replaceChildren(this.#createShortcutPanel());
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

        for (let index = 0; index < maxCount; index += 1) {
            const item = items[index];
            if (item) {
                fragment.appendChild(this.#createItemCard(category, item, index));
                continue;
            }
            fragment.appendChild(this.#createEmptySlotCard(category, index));
        }

        grid.appendChild(fragment);
        ElementPath.editorContext.replaceChildren(grid);

        const activeItem = items[this.#activeItemIndex];
        if (!activeItem) {
            this.#closeItemEditor();
        }
    }

    #createTransparencyPanel() {
        const panel = document.createElement('div');
        panel.className = 'theme-settings-panel';

        const header = document.createElement('div');
        header.className = 'theme-control-header';
        header.append(
            this.#createStaticElement('div', 'theme-control-title', '런처 투명도'),
            this.#createStaticElement('div', 'theme-control-value', '')
        );

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'theme-transparency-range';
        range.min = '0';
        range.max = `${MAX_LAUNCHER_TRANSPARENCY}`;
        range.step = '1';

        const rangeHeader = document.createElement('div');
        rangeHeader.className = 'theme-range-header';
        rangeHeader.append(
            this.#createStaticElement('div', 'theme-range-label', '투명도'),
            this.#createStaticElement('div', 'theme-range-caption', '런처 표면')
        );

        const scale = document.createElement('div');
        scale.className = 'theme-transparency-scale';
        scale.append(
            this.#createStaticElement('span', '', '0%'),
            this.#createStaticElement('span', '', `${MAX_LAUNCHER_TRANSPARENCY}%`)
        );

        const hoverToggle = document.createElement('label');
        hoverToggle.className = 'theme-toggle-card';

        const hoverCheckbox = document.createElement('input');
        hoverCheckbox.type = 'checkbox';
        hoverCheckbox.checked = this.#draftAppearance.revealOnHover === true;

        const hoverCopy = document.createElement('div');
        hoverCopy.className = 'theme-toggle-copy';
        hoverCopy.append(
            this.#createStaticElement('div', 'theme-toggle-title', '마우스 호버 시 잠시 선명하게 표시')
        );

        hoverToggle.append(hoverCheckbox, hoverCopy);
        panel.append(header, rangeHeader, range, scale, hoverToggle);

        const syncThemePanel = () => {
            const normalizedAppearance = normalizeAppearanceSettings(this.#draftAppearance);
            const transparencyText = `${normalizedAppearance.launcherTransparency}%`;
            range.value = `${normalizedAppearance.launcherTransparency}`;
            range.setAttribute('aria-valuetext', transparencyText);
            header.querySelector('.theme-control-value').textContent = transparencyText;
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
        return panel;
    }

    #createCreditPanel() {
        const panel = document.createElement('div');
        panel.className = 'maker-panel';

        const version = this.#createStaticElement('dd', '', '확인 중');
        const date = this.#createStaticElement('dd', '', '확인 중');
        const versionRow = document.createElement('div');
        versionRow.append(this.#createStaticElement('dt', '', '버전'), version);
        const dateRow = document.createElement('div');
        dateRow.append(this.#createStaticElement('dt', '', '날짜'), date);
        const meta = document.createElement('dl');
        meta.className = 'maker-meta';
        meta.append(versionRow, dateRow);

        panel.append(
            this.#createStaticElement('div', 'maker-kicker', '제작자'),
            this.#createStaticElement('div', 'maker-name', 'JISU YANG'),
            this.#createStaticElement('div', 'maker-product', 'ZEN Launcher'),
            meta
        );

        window.zenLauncher.getAppInfo?.().then((info) => {
            if (!info || !panel.isConnected) {
                return;
            }
            if (info.version) {
                version.textContent = `v${info.version}`;
            }
            if (info.author) {
                panel.querySelector('.maker-name').textContent = info.author;
            }
            if (info.releaseDate) {
                date.textContent = String(info.releaseDate).replace(/-/g, '.');
            }
        }).catch(() => {
            version.textContent = 'v2.3.0';
        });

        return panel;
    }

    #createThemePanel() {
        const panel = document.createElement('div');
        panel.className = 'theme-settings-panel theme-placeholder';

        const title = this.#createStaticElement('div', 'theme-placeholder-title', '테마');
        const description = this.#createStaticElement('div', 'theme-control-description', '라이트 또는 다크 모드를 선택할 수 있습니다.');

        const group = document.createElement('div');
        group.className = 'theme-mode-group';
        group.append(
            this.#createThemeModeOption({
                id: 'theme-mode-light',
                name: 'theme-mode',
                value: 'light',
                title: '라이트',
                caption: '밝고 선명한 화면',
                checked: this.#draftAppearance.themeMode === 'light'
            }),
            this.#createThemeModeOption({
                id: 'theme-mode-dark',
                name: 'theme-mode',
                value: 'dark',
                title: '다크',
                caption: '현재 기준 테마',
                checked: this.#draftAppearance.themeMode !== 'light'
            })
        );

        panel.append(title, description, group);
        return panel;
    }

    #createShortcutPanel() {
        const panel = document.createElement('div');
        panel.className = 'theme-settings-panel';

        const header = document.createElement('div');
        header.className = 'theme-control-header';
        header.append(
            this.#createStaticElement('div', 'theme-control-title', '전체 화면'),
            this.#createStaticElement('div', 'theme-control-value', '')
        );

        const description = this.#createStaticElement(
            'div',
            'theme-control-description',
            '다른 프로그램이 화면 전체를 쓸 때의 동작입니다. Ctrl+Space는 런처 검색창으로 이동합니다.'
        );

        const toggle = document.createElement('label');
        toggle.className = 'theme-toggle-card';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'shortcut-suppress-fullscreen';
        checkbox.checked = this.#draftAppearance.suppressShortcutDuringFullscreen === true;

        const copy = document.createElement('div');
        copy.className = 'theme-toggle-copy';
        copy.append(
            this.#createStaticElement('div', 'theme-toggle-title', '다른 앱이 전체 화면이면 멈추기'),
            this.#createStaticElement(
                'div',
                'theme-toggle-description',
                '켜 두면 Windows에서 다른 프로그램이 화면 전체를 쓰는 동안 Ctrl+Space는 그 프로그램에 전달됩니다. 기본값은 꺼짐입니다.'
            )
        );

        const resourceToggle = document.createElement('label');
        resourceToggle.className = 'theme-toggle-card';

        const resourceCheckbox = document.createElement('input');
        resourceCheckbox.type = 'checkbox';
        resourceCheckbox.id = 'resource-minimize-fullscreen';
        resourceCheckbox.checked = this.#draftAppearance.minimizeResourcesDuringFullscreen !== false;

        const resourceCopy = document.createElement('div');
        resourceCopy.className = 'theme-toggle-copy';
        resourceCopy.append(
            this.#createStaticElement('div', 'theme-toggle-title', '다른 앱이 전체 화면이면 자원 사용 줄이기'),
            this.#createStaticElement(
                'div',
                'theme-toggle-description',
                '켜 두면 애니메이션을 멈추고 화면 갱신을 초당 1회로 낮춥니다. 기본값은 최소화입니다.'
            )
        );

        const startupToggle = document.createElement('label');
        startupToggle.className = 'theme-toggle-card';

        const startupCheckbox = document.createElement('input');
        startupCheckbox.type = 'checkbox';
        startupCheckbox.id = 'launch-at-startup';
        startupCheckbox.checked = this.#draftAppearance.launchAtStartup === true;

        const startupCopy = document.createElement('div');
        startupCopy.className = 'theme-toggle-copy';
        startupCopy.append(
            this.#createStaticElement('div', 'theme-toggle-title', 'Windows 시작 시 자동 실행'),
            this.#createStaticElement(
                'div',
                'theme-toggle-description',
                '켜 두면 로그인할 때 런처가 시스템 트레이에서 실행됩니다. 기본값은 꺼짐입니다.'
            )
        );

        toggle.append(checkbox, copy);
        resourceToggle.append(resourceCheckbox, resourceCopy);
        startupToggle.append(startupCheckbox, startupCopy);
        panel.append(header, description, toggle, resourceToggle, startupToggle);

        const syncShortcutPanel = () => {
            const shortcutEnabled = this.#draftAppearance.suppressShortcutDuringFullscreen === true;
            const resourcesMinimized = this.#draftAppearance.minimizeResourcesDuringFullscreen !== false;
            checkbox.checked = shortcutEnabled;
            resourceCheckbox.checked = resourcesMinimized;
            startupCheckbox.checked = this.#draftAppearance.launchAtStartup === true;
            header.querySelector('.theme-control-value').textContent = resourcesMinimized ? '최소화' : '유지';
        };

        checkbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ suppressShortcutDuringFullscreen: checkbox.checked });
            syncShortcutPanel();
        });

        resourceCheckbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ minimizeResourcesDuringFullscreen: resourceCheckbox.checked });
            syncShortcutPanel();
        });

        startupCheckbox.addEventListener('change', () => {
            this.#updateAppearanceDraft({ launchAtStartup: startupCheckbox.checked });
            syncShortcutPanel();
        });

        syncShortcutPanel();
        return panel;
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
        button.className = 'setting-add-card';
        button.dataset.action = 'add-item';
        button.dataset.itemIndex = `${index}`;
        button.append(
            this.#createStaticElement('div', 'setting-add-card-title', `빈 슬롯 ${index + 1}`),
            this.#createStaticElement(
                'div',
                'setting-add-card-meta',
                category === ZenLauncherPreferences.Category.FOLDER
                    ? '클릭해서 폴더를 추가하세요'
                    : '클릭해서 링크나 프로그램을 추가하세요'
            )
        );

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

            preview.classList.add('folder-preview');
            preview.textContent = item.name || this.#summarizeLink(item.link);
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
        const title = document.getElementById('slot-editor-title');
        const fields = document.getElementById('slot-editor-fields');
        const deleteButton = document.getElementById('btn-delete-item');
        const item = (this.#drafts.get(category) || [])[index];
        const meta = this.#getCategoryMeta()[category];

        if (!editor || !title || !fields || !item) {
            return;
        }

        this.#currentEditorMode = this.#resolveEditorMode(category, item, preferredMode);
        title.textContent = `${meta.title} 슬롯 ${index + 1} 편집`;
        if (deleteButton) {
            deleteButton.style.display = 'inline-flex';
        }

        const leftFields = [
            this.#createEditorField({
                category,
                index,
                key: 'name',
                label: '이름',
                value: item.name,
                placeholder: meta.namePlaceholder
            })
        ];
        const rightFields = [];

        if (category === ZenLauncherPreferences.Category.FOLDER) {
            rightFields.push(this.#createEditorField({
                category,
                index,
                key: 'link',
                label: meta.linkLabel,
                value: item.link,
                placeholder: meta.linkPlaceholder,
                withPicker: true,
                pickerLabel: meta.selectButtonLabel
            }));
        } else {
            leftFields.push(this.#createEditorField({
                category,
                index,
                key: 'img',
                label: '이미지 URL',
                value: item.img,
                placeholder: meta.imagePlaceholder
            }));

            rightFields.push(this.#createSourceModeField());

            if (this.#currentEditorMode === 'program') {
                rightFields.push(this.#createProgramPickerField(category, index, item));
            } else {
                rightFields.push(this.#createEditorField({
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

        fields.replaceChildren(this.#createEditorLayout(category, index, item, { leftFields, rightFields }));

        editor.classList.add('open');
    }

    #createEditorLayout(category, index, item, sections) {
        const layout = document.createElement('div');
        layout.className = 'slot-editor-layout';

        const sidePanel = document.createElement('div');
        sidePanel.className = 'slot-editor-side-panel';

        const sideBody = document.createElement('div');
        sideBody.className = 'slot-editor-panel-body';
        sideBody.append(...sections.leftFields);

        sidePanel.append(sideBody);

        const formPanel = document.createElement('div');
        formPanel.className = 'slot-editor-main-panel';

        const formBody = document.createElement('div');
        formBody.className = 'slot-editor-panel-body';
        formBody.append(...sections.rightFields);

        formPanel.append(formBody);
        layout.append(sidePanel, formPanel);
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

    #createSourceModeField() {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-field-group mode-tabs';

        const row = document.createElement('div');
        row.className = 'setting-mode-row';

        const directButton = document.createElement('button');
        directButton.type = 'button';
        directButton.className = `setting-mode-chip${this.#currentEditorMode === 'direct' ? ' active' : ''}`;
        directButton.textContent = '링크';
        directButton.addEventListener('click', () => {
            this.#setCurrentEditorMode('direct');
        });

        const programButton = document.createElement('button');
        programButton.type = 'button';
        programButton.className = `setting-mode-chip${this.#currentEditorMode === 'program' ? ' active' : ''}`;
        programButton.textContent = '프로그램';
        programButton.addEventListener('click', () => {
            this.#setCurrentEditorMode('program');
        });

        row.append(directButton, programButton);
        wrapper.appendChild(row);
        return wrapper;
    }

    #createProgramPickerField(category, index, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-field-group';
        wrapper.appendChild(this.#createStaticElement('span', 'setting-field-label', '스캔된 프로그램'));

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
                this.#createStaticElement('div', 'program-picker-name', '스캔된 프로그램이 아직 없습니다.'),
                this.#createStaticElement('div', 'program-picker-meta', '프로그램 선택 창에서 스캔하면 목록을 바로 사용할 수 있습니다.')
            );
        } else {
            card.append(
                this.#createStaticElement('div', 'program-picker-name', '프로그램을 선택해주세요.'),
                this.#createStaticElement('div', 'program-picker-meta', '스캔 목록에서 선택하면 이름과 실행 경로가 자동으로 채워집니다.')
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
        this.#renderCategoryButtons();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);
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
        this.#renderCategoryButtons();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);
        this.#openItemEditor(category, index, 'program');
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
        this.#renderCategoryButtons();
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
        this.#renderCategoryButtons();
        this.#renderCategoryItems(category);
        this.#refreshStatus();
    }

    #closeItemEditor({ closeProgramBrowser = true, restoreSize = true } = {}) {
        const editor = document.getElementById('slot-editor');
        editor?.classList.remove('open');
        this.#activeItemIndex = -1;
        this.#currentEditorMode = 'direct';
        if (closeProgramBrowser) {
            this.#closeProgramBrowser({ restoreSize });
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

            if (category === ZenLauncherPreferences.Category.ICON) {
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
            if (category === ZenLauncherPreferences.Category.FOLDER) {
                const count = document.getElementById('folder-count');
                if (count) {
                    count.textContent = String(visibleItems.length);
                }
            }
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
            folderItem.textContent = item.name || item.link;
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
            return image;
        }

        const fallback = document.createElement('div');
        fallback.className = `launcher-fallback ${category}-fallback`;
        fallback.textContent = category === ZenLauncherPreferences.Category.GALLERY
            ? (item.name || this.#summarizeLink(item.link) || 'APP')
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
            button.textContent = '폴더 추가';
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

        if (ElementPath.editorElement?.dataset.panel === 'settings') {
            ElementPath.editorElement.dataset.size = 'l';
            ElementPath.editorElement.classList.add('program-browser-active');
            window.zenSheet?.openSheet(ElementPath.editorElement, { fit: 'workspace' });
        }
        browser.classList.add('open');
        search.value = '';
        this.#renderProgramBrowser();
        search.focus({ preventScroll: true });
    }

    #closeProgramBrowser({ restoreSize = true } = {}) {
        const browser = document.getElementById('program-browser');
        ElementPath.editorElement?.classList.remove('program-browser-active');
        if (!browser) {
            return;
        }

        browser.classList.remove('open');
        if (restoreSize && ElementPath.editorElement?.dataset.panel === 'settings') {
            ElementPath.editorElement.dataset.size = 'm';
            window.zenSheet?.openSheet(ElementPath.editorElement, { fit: 'panel' });
        }
        this.#programBrowserContext = null;
        this.#programBrowserFilter = '';
    }

    #isProgramBrowserOpen() {
        return document.getElementById('program-browser')?.classList.contains('open');
    }

    #renderProgramBrowser() {
        const list = document.getElementById('program-browser-list');
        const count = document.getElementById('program-browser-count');
        const status = document.getElementById('program-browser-status');
        if (!list || !count || !status) {
            return;
        }

        const filter = this.#programBrowserFilter.toLowerCase();
        const filteredPrograms = this.#programScanCache.filter((program) => {
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
            : '';

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
                this.#createStaticElement('div', '', '환경설정 상단의 "프로그램 스캔" 버튼이나 아래 버튼을 눌러 목록을 가져오세요.')
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
            list.appendChild(this.#createStaticElement('div', 'program-browser-empty', '검색 결과가 없습니다. 다른 이름이나 경로로 찾아보세요.'));
            return;
        }

        filteredPrograms.forEach((program) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'program-browser-item';
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
            info.append(
                this.#createStaticElement('div', 'program-browser-item-title', program.name),
                this.#createStaticElement('div', 'program-browser-item-meta', `${this.#getProgramSourceLabel(program.source)}\n${program.link}`)
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
            return 'direct';
        }

        if (preferredMode === 'direct' || preferredMode === 'program') {
            return preferredMode;
        }

        return this.#isScannedProgramLink(item.link) ? 'program' : 'direct';
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
        return Array.from(document.querySelectorAll('#setting-category [data-tab]'));
    }

    #getCategoryMeta() {
        return {
            [ZenLauncherPreferences.Category.GALLERY]: {
                title: '갤러리',
                namePlaceholder: '예: Photoshop',
                linkLabel: '실행 경로 또는 URL',
                linkPlaceholder: '예: C:\\Apps\\app.exe 또는 https://example.com',
                imagePlaceholder: '예: https://example.com/image.jpg',
                selectButtonLabel: '경로 지정'
            },
            [ZenLauncherPreferences.Category.ICON]: {
                title: '아이콘',
                namePlaceholder: '예: 메모장',
                linkLabel: '실행 경로 또는 URL',
                linkPlaceholder: '예: C:\\Windows\\notepad.exe 또는 https://mail.google.com',
                imagePlaceholder: '예: https://example.com/icon.png',
                selectButtonLabel: '경로 지정'
            },
            [ZenLauncherPreferences.Category.FOLDER]: {
                title: '폴더',
                namePlaceholder: '예: 프로젝트 폴더',
                linkLabel: '폴더 경로',
                linkPlaceholder: '예: C:\\Users\\name\\Documents\\Project',
                imagePlaceholder: '',
                selectButtonLabel: '폴더'
            }
        };
    }

    #getItemMetaText(category, item) {
        if (category === ZenLauncherPreferences.Category.FOLDER) {
            return this.#summarizeLinkTail(item.link, 14);
        }

        if (this.#isExternalLink(item.link)) {
            return '외부 링크';
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
