class ElementPath {
    static openButton = document.getElementById('btn-preference');
    static cancelButton = document.getElementById('btn-preference-cancel');
    static clearButton = document.getElementById('btn-preference-clear');
    static saveButton = document.getElementById('btn-preference-save');
    static editorElement = document.getElementById('editor');
    static editorContext = document.getElementById('setting-row');
    static galleryCategoryButton = document.getElementById('btn-preference-gallery');
    static iconCategoryButton = document.getElementById('btn-preference-icon');
    static folderCategoryButton = document.getElementById('btn-preference-folder');
}

class NPLauncher {
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

    static activeCategory = NPLauncher.Category.GALLERY;

    #data = new Map();

    constructor(initialData) {
        const categoryList = Object.values(NPLauncher.Category);

        categoryList.forEach((category) => {
            const items = Array.isArray(initialData?.[category]) ? initialData[category] : [];
            this.#data.set(category, items);
        });

        this.#bindEvents();
        this.#renderCategoryButtons();
        this.#renderEditor(NPLauncher.Category.GALLERY);
        this.#renderLauncherItems();
    }

    #bindEvents() {
        ElementPath.openButton?.addEventListener('click', () => {
            ElementPath.editorElement.style.display = 'inline-flex';
        });

        ElementPath.cancelButton?.addEventListener('click', () => {
            window.location.reload();
        });

        ElementPath.clearButton?.addEventListener('click', async () => {
            const response = await window.npLauncher.showMessage({
                type: 'warning',
                message: '\uC815\uB9D0 \uBAA8\uB4E0 \uCE74\uD14C\uACE0\uB9AC \uD56D\uBAA9 \uC815\uBCF4\uB97C \uCD08\uAE30\uD654\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?',
                buttons: ['\uCDE8\uC18C', '\uCD08\uAE30\uD654'],
                defaultId: 0,
                cancelId: 0
            });

            if (response !== 1) {
                return;
            }

            await window.npLauncher.clearData();
            window.location.reload();
        });

        ElementPath.saveButton?.addEventListener('click', async () => {
            const items = this.#collectFormData(NPLauncher.activeCategory);
            const savedItems = await window.npLauncher.saveCategoryData(NPLauncher.activeCategory, items);
            this.#data.set(NPLauncher.activeCategory, savedItems);

            await window.npLauncher.showMessage({
                type: 'info',
                message: `${this.#getCategoryLabel(NPLauncher.activeCategory)} \uD56D\uBAA9 \uC815\uBCF4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`
            });

            window.location.reload();
        });

        [
            ElementPath.galleryCategoryButton,
            ElementPath.iconCategoryButton,
            ElementPath.folderCategoryButton
        ].forEach((button) => {
            button?.addEventListener('click', () => {
                const categoryKey = button.dataset.category;
                const category = NPLauncher.Category[categoryKey];
                if (!category) {
                    return;
                }

                NPLauncher.activeCategory = category;
                this.#renderCategoryButtons();
                this.#renderEditor(category);
            });
        });
    }

    #renderCategoryButtons() {
        [
            ElementPath.galleryCategoryButton,
            ElementPath.iconCategoryButton,
            ElementPath.folderCategoryButton
        ].forEach((button) => {
            if (!button) {
                return;
            }

            const category = NPLauncher.Category[button.dataset.category];
            button.classList.toggle('select-category', category === NPLauncher.activeCategory);
        });
    }

    #renderEditor(category) {
        const listItem = this.#data.get(category) || [];
        const column = document.createElement('div');
        column.className = 'setting-col';

        for (let index = 0; index < NPLauncher.MaxCount[category]; index += 1) {
            const item = listItem[index] || {};
            column.appendChild(this.#createEditorRow(category, index, item));
        }

        ElementPath.editorContext.replaceChildren(column);
    }

    #createEditorRow(category, index, item) {
        const row = document.createElement('div');
        row.className = `${category}-item`;

        const indexLabel = document.createElement('div');
        indexLabel.textContent = `${index + 1}: `;
        row.appendChild(indexLabel);

        row.appendChild(this.#createInputWrapper({
            name: `${category}-name-item-${index}`,
            value: item.name || '',
            placeholder: '\uC774\uB984'
        }));

        row.appendChild(this.#createInputWrapper({
            name: `${category}-link-item-${index}`,
            value: item.link || '',
            placeholder: '\uACBD\uB85C \uB610\uB294 URL'
        }));

        const selectButton = document.createElement('button');
        selectButton.className = 'file-item';
        selectButton.type = 'button';
        selectButton.textContent = category === NPLauncher.Category.FOLDER
            ? '\uD3F4\uB354 \uC120\uD0DD'
            : '\uD30C\uC77C \uC120\uD0DD';
        selectButton.addEventListener('click', async () => {
            const selectedPath = await window.npLauncher.pickPath(
                category === NPLauncher.Category.FOLDER ? 'folder' : 'file'
            );

            if (!selectedPath) {
                return;
            }

            const linkInput = row.querySelector(`[name="${category}-link-item-${index}"]`);
            if (linkInput) {
                linkInput.value = selectedPath;
            }
        });
        row.appendChild(selectButton);

        if (category !== NPLauncher.Category.FOLDER) {
            row.appendChild(this.#createInputWrapper({
                name: `${category}-img-item-${index}`,
                value: item.img || '',
                placeholder: '\uC774\uBBF8\uC9C0 URL'
            }));
        }

        return row;
    }

    #createInputWrapper({ name, value, placeholder }) {
        const wrapper = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.name = name;
        input.value = value;
        input.placeholder = placeholder;
        wrapper.appendChild(input);
        return wrapper;
    }

    #collectFormData(category) {
        const items = [];

        for (let index = 0; index < NPLauncher.MaxCount[category]; index += 1) {
            const name = document.getElementsByName(`${category}-name-item-${index}`)[0]?.value?.trim() || '';
            const link = document.getElementsByName(`${category}-link-item-${index}`)[0]?.value?.trim() || '';
            const img = category !== NPLauncher.Category.FOLDER
                ? document.getElementsByName(`${category}-img-item-${index}`)[0]?.value?.trim() || ''
                : '';

            if (!link) {
                continue;
            }

            items.push({ name, link, img });
        }

        return items;
    }

    #renderLauncherItems() {
        this.#data.forEach((listItems, category) => {
            const listArea = document.getElementById(`${category}-area`);
            if (!listArea) {
                return;
            }

            listArea.replaceChildren();

            listItems.forEach((item) => {
                const element = this.#createLauncherItem(item, category);
                if (element) {
                    listArea.appendChild(element);
                }
            });
        });
    }

    #createLauncherItem(item, category) {
        if (!item || typeof item.link !== 'string' || !item.link.trim()) {
            return null;
        }

        if (category === NPLauncher.Category.FOLDER) {
            const folderItem = document.createElement('div');
            folderItem.className = 'launcher-basic list-item';
            folderItem.dataset.link = item.link;
            folderItem.textContent = item.name || item.link;
            return folderItem;
        }

        const wrapper = document.createElement('div');
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

    #getCategoryLabel(category) {
        switch (category) {
        case NPLauncher.Category.GALLERY:
            return '\uAC24\uB7EC\uB9AC';
        case NPLauncher.Category.ICON:
            return '\uC544\uC774\uCF58';
        case NPLauncher.Category.FOLDER:
            return '\uD3F4\uB354';
        default:
            return category;
        }
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const data = await window.npLauncher.loadData();
    new NPLauncher(data);
});
