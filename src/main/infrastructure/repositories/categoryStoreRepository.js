const {
    CATEGORY_KEY_PREFIX,
    LEGACY_CATEGORY_KEY_PREFIX,
    CATEGORIES
} = require('../../domain/launcher/categories');

class CategoryStoreRepository {
    constructor(store) {
        this.store = store;
    }

    loadAll() {
        return CATEGORIES.reduce((accumulator, category) => {
            const loadedData = this.store.get(`${CATEGORY_KEY_PREFIX}${category}`);
            const legacyData = this.store.get(`${LEGACY_CATEGORY_KEY_PREFIX}${category}`);
            const resolvedData = Array.isArray(loadedData)
                ? loadedData
                : (Array.isArray(legacyData) ? legacyData : []);

            accumulator[category] = resolvedData;
            return accumulator;
        }, {});
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