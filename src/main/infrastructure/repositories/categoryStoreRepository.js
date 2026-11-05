const {
    CATEGORY_KEY_PREFIX,
    LEGACY_CATEGORY_KEY_PREFIX,
    CATEGORIES
} = require('../../domain/launcher/categories');
const {
    ICONS_SEEDED_KEY,
    resolveInitialIcons
} = require('../../domain/launcher/defaultIcons');

class CategoryStoreRepository {
    constructor(store) {
        this.store = store;
    }

    loadAll() {
        const data = CATEGORIES.reduce((accumulator, category) => {
            const loadedData = this.store.get(`${CATEGORY_KEY_PREFIX}${category}`);
            const legacyData = this.store.get(`${LEGACY_CATEGORY_KEY_PREFIX}${category}`);
            const resolvedData = Array.isArray(loadedData)
                ? loadedData
                : (Array.isArray(legacyData) ? legacyData : []);

            accumulator[category] = resolvedData;
            return accumulator;
        }, {});

        const iconDecision = resolveInitialIcons({
            iconsSeeded: this.store.get(ICONS_SEEDED_KEY) === true,
            items: data.icon
        });
        if (iconDecision.changed) {
            this.store.set(ICONS_SEEDED_KEY, true);
            if (iconDecision.replaceItems) {
                this.store.set(`${CATEGORY_KEY_PREFIX}icon`, iconDecision.items);
            }
        }
        data.icon = iconDecision.items;
        return data;
    }

    save(category, items) {
        this.store.set(`${CATEGORY_KEY_PREFIX}${category}`, items);
        this.store.delete(`${LEGACY_CATEGORY_KEY_PREFIX}${category}`);
        return items;
    }

    clearAll() {
        this.store.clear();
        return true;
    }
}

module.exports = {
    CategoryStoreRepository
};