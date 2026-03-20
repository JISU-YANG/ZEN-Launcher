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
    #statusOverride = null;
    #activeItemIndex = -1;

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
        this.#renderCategoryButtons();
        this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        this.#renderLauncherItems();
        this.#refreshStatus();
    }

    #bindEvents() {
        ElementPath.openButton?.addEventListener('click', () => {
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

        document.addEventListener('keydown', async (event) => {
            if (!this.#isEditorOpen()) {
                return;
            }

            if (event.key === 'Escape') {
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

        this.#setText('[data-link="shutdown"]', '종료');
        this.#setText('[data-link="reboot"]', '재시작');
        this.#setText('#btn-preference', '환경설정');

        const settingsLinks = document.querySelectorAll('#footer-left a.footer-btn[href]');
        if (settingsLinks[0]) {
            settingsLinks[0].textContent = '화면';
        }
        if (settingsLinks[1]) {
            settingsLinks[1].textContent = '소리';
        }
        if (settingsLinks[2]) {
            settingsLinks[2].textContent = '마우스';
        }

        const status = this.#createStaticElement('div', '', '저장됨');
        status.id = 'setting-status';
        status.dataset.tone = 'neutral';
        ElementPath.settingTopbar?.appendChild(status);

        const content = document.createElement('div');
        content.id = 'setting-content';
        const row = ElementPath.editorContext;
        row.replaceWith(content);
        row.id = 'setting-row';
        content.append(row, this.#createItemEditor());
    }

    #createItemEditor() {
        const editor = document.createElement('div');
        editor.id = 'slot-editor';

        const header = document.createElement('div');
        header.className = 'slot-editor-header';

        const title = this.#createStaticElement('div', 'slot-editor-title', '항목 편집');
        title.id = 'slot-editor-title';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'slot-editor-close';
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => {
            this.#closeItemEditor();
        });

        header.append(title, closeButton);

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
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'slot-secondary-button';
        doneButton.textContent = '완료';
        doneButton.addEventListener('click', () => {
            this.#closeItemEditor();
        });
        rightActions.appendChild(doneButton);

        actions.append(leftActions, rightActions);
        editor.append(header, fields, actions);
        return editor;
    }

    #openEditor(category = ZenLauncherPreferences.activeCategory) {
        ZenLauncherPreferences.activeCategory = category;
        this.#renderCategoryButtons();
        this.#renderCategoryItems(category);
        ElementPath.editorElement.style.display = 'inline-flex';
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
            this.#statusOverride = {
                tone: 'neutral',
                message: '변경 취소됨'
            };
            this.#renderCategoryButtons();
            this.#renderCategoryItems(ZenLauncherPreferences.activeCategory);
        }

        this.#closeItemEditor();
        ElementPath.editorElement.style.display = 'none';
        this.#refreshStatus();
    }

    #switchCategory(category) {
        ZenLauncherPreferences.activeCategory = category;
        this.#activeItemIndex = -1;
        this.#statusOverride = null;
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
            const isDirty = this.#isCategoryDirty(category);

            button.classList.toggle('select-category', isActive);
            button.dataset.dirty = isDirty ? 'true' : 'false';
        });
    }

    #renderCategoryItems(category) {
        const items = this.#drafts.get(category) || [];
        const grid = document.createElement('div');
        grid.className = 'setting-grid';

        items.forEach((item, index) => {
            grid.appendChild(this.#createItemCard(category, item, index));
        });

        if (items.length < ZenLauncherPreferences.MaxCount[category]) {
            grid.appendChild(this.#createAddCard(category));
        }

        ElementPath.editorContext.replaceChildren(grid);
        this.#closeItemEditor();
    }

    #createItemCard(category, item, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'setting-item-card';
        button.dataset.itemIndex = `${index}`;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'setting-item-card-delete';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.#deleteItemAt(category, index);
        });

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

        button.addEventListener('click', () => {
            this.#activeItemIndex = index;
            this.#renderCategoryItems(category);
            this.#openItemEditor(category, index);
        });

        return button;
    }

    #createAddCard(category) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'setting-add-card';
        button.append(
            this.#createStaticElement('div', 'setting-add-card-title', '+ 항목 추가'),
            this.#createStaticElement(
                'div',
                'setting-add-card-meta',
                `${ZenLauncherPreferences.MaxCount[category] - (this.#drafts.get(category)?.length || 0)}개 더 추가 가능`
            )
        );

        button.addEventListener('click', () => {
            this.#addItem(category);
        });

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
                media.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', 'GALLERY'));
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
                media.appendChild(this.#createStaticElement('div', 'setting-card-preview-empty', 'ICON'));
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

    #openItemEditor(category, index) {
        const editor = document.getElementById('slot-editor');
        const title = document.getElementById('slot-editor-title');
        const fields = document.getElementById('slot-editor-fields');
        const deleteButton = document.getElementById('btn-delete-item');
        const item = (this.#drafts.get(category) || [])[index];
        const meta = this.#getCategoryMeta()[category];

        if (!editor || !title || !fields || !item) {
            return;
        }

        title.textContent = `${meta.title} 항목 ${index + 1}`;
        if (deleteButton) {
            deleteButton.style.display = 'inline-flex';
        }

        fields.replaceChildren(
            this.#createEditorField({
                category,
                index,
                key: 'name',
                label: '이름',
                value: item.name,
                placeholder: meta.namePlaceholder
            }),
            this.#createEditorField({
                category,
                index,
                key: 'link',
                label: meta.linkLabel,
                value: item.link,
                placeholder: meta.linkPlaceholder,
                withPicker: true,
                pickerLabel: meta.selectButtonLabel
            }),
            ...(category !== ZenLauncherPreferences.Category.FOLDER
                ? [this.#createEditorField({
                    category,
                    index,
                    key: 'img',
                    label: '이미지 URL',
                    value: item.img,
                    placeholder: meta.imagePlaceholder
                })]
                : [])
        );

        editor.classList.add('open');
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

        wrapper.append(labelElement, input);

        if (withPicker) {
            const picker = document.createElement('button');
            picker.type = 'button';
            picker.className = 'file-item';
            picker.textContent = pickerLabel;
            picker.style.marginTop = '4px';
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
            wrapper.appendChild(picker);
        }

        return wrapper;
    }

    #updateDraftValue(category, index, key, value) {
        const items = [...(this.#drafts.get(category) || [])];
        items[index] = {
            ...items[index],
            [key]: value.trim()
        };

        this.#drafts.set(category, items);
        this.#statusOverride = null;
        this.#renderCategoryButtons();
        this.#refreshStatus();
        this.#updateItemCardDom(category, index);
    }

    #updateItemCardDom(category, index) {
        if (category !== ZenLauncherPreferences.activeCategory) {
            return;
        }

        const item = (this.#drafts.get(category) || [])[index];
        const card = ElementPath.editorContext?.querySelector(`[data-item-index="${index}"]`);
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

    #addItem(category) {
        const items = [...(this.#drafts.get(category) || [])];
        if (items.length >= ZenLauncherPreferences.MaxCount[category]) {
            return;
        }

        items.push(this.#normalizeItem({}, category));
        this.#drafts.set(category, items);
        this.#activeItemIndex = items.length - 1;
        this.#statusOverride = null;
        this.#renderCategoryButtons();
        this.#renderCategoryItems(category);
        this.#openItemEditor(category, this.#activeItemIndex);
        this.#refreshStatus();
    }

    #deleteActiveItem() {
        const category = ZenLauncherPreferences.activeCategory;
        this.#deleteItemAt(category, this.#activeItemIndex);
    }

    #deleteItemAt(category, index) {
        const items = [...(this.#drafts.get(category) || [])];
        if (index < 0 || index >= items.length) {
            return;
        }

        items.splice(index, 1);
        this.#drafts.set(category, items);
        this.#activeItemIndex = items.length === 0 ? -1 : Math.min(index, items.length - 1);
        this.#statusOverride = null;
        this.#renderCategoryButtons();
        this.#renderCategoryItems(category);
        this.#refreshStatus();
    }

    #closeItemEditor() {
        const editor = document.getElementById('slot-editor');
        editor?.classList.remove('open');
        this.#activeItemIndex = -1;
    }

    #renderLauncherItems() {
        this.#savedData.forEach((items, category) => {
            const listArea = document.getElementById(`${category}-area`);
            if (!listArea) {
                return;
            }

            listArea.replaceChildren();
            const elements = items
                .map((item) => this.#createLauncherItem(item, category))
                .filter(Boolean);

            listArea.classList.toggle('is-empty', elements.length === 0);

            if (elements.length === 0) {
                listArea.appendChild(this.#createEmptyState(category));
                return;
            }

            elements.forEach((element) => {
                listArea.appendChild(element);
            });
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
        const isHttpLink = /^https?:\/\//i.test(item.link);

        let container;
        if (isHttpLink) {
            container = document.createElement('a');
            container.href = item.link;
        } else {
            container = document.createElement('div');
            container.className = 'launcher';
            container.dataset.link = item.link;
        }

        const image = document.createElement('img');
        image.className = `${category}-img`;
        image.src = item.img || '';
        image.alt = item.name || '';
        container.appendChild(image);

        const name = document.createElement('span');
        name.className = `${category}-name`;
        name.textContent = item.name || item.link;
        container.appendChild(name);

        wrapper.appendChild(container);
        return wrapper;
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

    #refreshStatus() {
        const status = document.getElementById('setting-status');
        if (!status) {
            return;
        }

        const dirtyCount = Object.values(ZenLauncherPreferences.Category).filter((category) => this.#isCategoryDirty(category)).length;
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

    #hasDirtyCategories() {
        return Object.values(ZenLauncherPreferences.Category).some((category) => this.#isCategoryDirty(category));
    }

    #isCategoryDirty(category) {
        const draftItems = this.#drafts.get(category) || [];
        const savedItems = this.#savedData.get(category) || [];
        return JSON.stringify(draftItems) !== JSON.stringify(savedItems);
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
                selectButtonLabel: '파일'
            },
            [ZenLauncherPreferences.Category.ICON]: {
                title: 'Icons',
                namePlaceholder: '예: 메모장',
                linkLabel: '실행 경로 또는 URL',
                linkPlaceholder: '예: C:\\Windows\\notepad.exe 또는 https://mail.google.com',
                imagePlaceholder: '예: https://example.com/icon.png',
                selectButtonLabel: '파일'
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
            return this.#summarizeLink(item.link);
        }

        return /^https?:\/\//i.test(item.link) ? '웹 링크' : '로컬 실행';
    }

    #summarizeLink(link) {
        if (!link) {
            return '';
        }

        if (link.length <= 26) {
            return link;
        }

        return `${link.slice(0, 24)}...`;
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
        return ElementPath.editorElement?.style.display === 'inline-flex';
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const data = await window.zenLauncher.loadData();
    new ZenLauncherPreferences(data);
});
