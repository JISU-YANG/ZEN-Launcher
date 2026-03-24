class ElementPath {
    static openButton = document.getElementById('btn-preference');
    static cancelButton = document.getElementById('btn-preference-cancel');
    static clearButton = document.getElementById('btn-preference-clear');
    static saveButton = document.getElementById('btn-preference-save');
    static editorElement = document.getElementById('editor');
    static editorContext = document.getElementById('setting-row');
    static settingTopbar = document.getElementById('setting-topbar');
}

class ZenLauncherPreferences {
    static Category = {
        GALLERY: 'gallery',
        ICON: 'icon',
        FOLDER: 'folder'
    };

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

    constructor(initialData) {
        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            const items = Array.isArray(initialData?.[category]) ? initialData[category] : [];
            const normalizedItems = items
                .map((item) => this.#normalizeItem(item, category))
                .filter((item) => item.link);

            this.#savedData.set(category, normalizedItems);
            this.#drafts.set(category, normalizedItems.map((item) => ({ ...item })));
        });

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
                message: '저장된 모든 항목을 초기화할까요?',
                buttons: ['취소', '전체 초기화'],
                defaultId: 0,
                cancelId: 0
            });

            if (response !== 1) {
                return;
            }

            await window.zenLauncher.clearData();

            Object.values(ZenLauncherPreferences.Category).forEach((category) => {
                this.#savedData.set(category, []);
                this.#drafts.set(category, []);
            });
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
            this.#makeAccessibleButton(button, async () => {
                if (button.dataset.comingSoon === 'true') {
                    await window.zenLauncher.showMessage({
                        type: 'info',
                        message: `${button.dataset.label || button.textContent} 탭은 추후 추가할 예정입니다.`
                    });
                    return;
                }

                const category = ZenLauncherPreferences.Category[button.dataset.category];
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
            ElementPath.editorElement.classList.remove('closing');
            ElementPath.editorElement.dataset.panel = 'settings';
            ElementPath.editorElement.dataset.size = 'm';
            if (wasEditorOpen && !isPanelSwitch) {
                ElementPath.editorElement.classList.remove('expanding');
                ElementPath.editorElement.classList.add('open-ready');
            } else {
                ElementPath.editorElement.classList.remove('open-ready');
                ElementPath.editorElement.classList.add('expanding');
                const openReadyDelay = isPanelSwitch ? 360 : 820;
                this.#editorOpenReadyTimer = window.setTimeout(() => {
                    this.#editorOpenReadyTimer = 0;
                    if (!ElementPath.editorElement?.classList.contains('open') || ElementPath.editorElement?.classList.contains('closing')) {
                        return;
                    }

                    ElementPath.editorElement.classList.remove('expanding');
                    ElementPath.editorElement.classList.add('open-ready');
                }, openReadyDelay);
            }
        }
        ElementPath.editorElement?.classList.add('open');
        this.#refreshStatus();
    }

    async #closeEditor() {
        if (this.#hasDirtyCategories()) {
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
        editor?.classList.remove('expanding');
        editor?.classList.remove('open-ready');
        if (this.#editorCloseTimer) {
            window.clearTimeout(this.#editorCloseTimer);
            this.#editorCloseTimer = 0;
        }
        editor?.classList.add('closing');
        editor?.classList.remove('open');
        this.#editorCloseTimer = window.setTimeout(() => {
            if (editor?.dataset.panel === 'settings') {
                delete editor.dataset.panel;
                delete editor.dataset.size;
            }
            editor?.classList.remove('closing');
            this.#editorCloseTimer = 0;
        }, 420);
        this.#refreshStatus();
    }

    #switchCategory(category) {
        ZenLauncherPreferences.activeCategory = category;
        this.#activeItemIndex = -1;
        this.#statusOverride = null;
        this.#closeProgramBrowser();
        this.#renderCategoryButtons();
        this.#renderCategoryItems(category);
        this.#refreshStatus();
    }

    async #saveDirtyCategories() {
        const dirtyCategories = Object.values(ZenLauncherPreferences.Category).filter((category) => this.#isCategoryDirty(category));

        if (dirtyCategories.length === 0) {
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

        this.#statusOverride = {
            tone: 'success',
            message: `${dirtyCategories.length}개 저장됨`
        };
        this.#renderCategoryButtons();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
    }

    #renderCategoryButtons() {
        this.#getTabButtons().forEach((button) => {
            if (button.dataset.comingSoon === 'true') {
                button.classList.remove('select-category');
                button.dataset.dirty = 'false';
                return;
            }

            const category = ZenLauncherPreferences.Category[button.dataset.category];
            const isActive = category === ZenLauncherPreferences.activeCategory;
            const isDirty = this.#dirtyCategories.has(category);

            button.classList.toggle('select-category', isActive);
            button.dataset.dirty = isDirty ? 'true' : 'false';
        });
    }

    #renderCategoryItems(category) {
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

            for (let index = 0; index < maxCount; index += 1) {
                const item = items[index];
                const element = this.#createLauncherItem(item, category) || this.#createLauncherPlaceholder(category, index);
                fragment.appendChild(element);
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

    #createLauncherPlaceholder(category, index) {
        if (category === ZenLauncherPreferences.Category.FOLDER) {
            const placeholder = document.createElement('div');
            placeholder.className = 'list-item launcher-slot-empty';
            return placeholder;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `${category}-entry launcher-slot-empty`;

        const shell = document.createElement('div');
        shell.className = 'launcher-slot-empty-shell';
        wrapper.appendChild(shell);
        return wrapper;
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

        const dirtyCount = this.#dirtyCategories.size;
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

    #hasDirtyCategories() {
        return this.#dirtyCategories.size > 0;
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
    }

    #resetDraftsFromSaved() {
        Object.values(ZenLauncherPreferences.Category).forEach((category) => {
            const savedItems = this.#savedData.get(category) || [];
            this.#drafts.set(category, savedItems.map((item) => ({ ...item })));
        });
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
                title: 'Gallery',
                namePlaceholder: '예: Photoshop',
                linkLabel: '실행 경로 또는 URL',
                linkPlaceholder: '예: C:\\Apps\\app.exe 또는 https://example.com',
                imagePlaceholder: '예: https://example.com/image.jpg',
                selectButtonLabel: '경로 지정'
            },
            [ZenLauncherPreferences.Category.ICON]: {
                title: 'Icons',
                namePlaceholder: '예: 메모장',
                linkLabel: '실행 경로 또는 URL',
                linkPlaceholder: '예: C:\\Windows\\notepad.exe 또는 https://mail.google.com',
                imagePlaceholder: '예: https://example.com/icon.png',
                selectButtonLabel: '경로 지정'
            },
            [ZenLauncherPreferences.Category.FOLDER]: {
                title: 'Folders',
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
    const data = await window.zenLauncher.loadData();
    new ZenLauncherPreferences(data);
});
