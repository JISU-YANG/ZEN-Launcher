const CATEGORY_KEY_PREFIX = 'ZENL.Data';
const LEGACY_CATEGORY_KEY_PREFIX = 'NPL.Data';
const CATEGORIES = Object.freeze(['gallery', 'icon', 'folder']);

function isSupportedCategory(category) {
    return CATEGORIES.includes(category);
}

module.exports = {
    CATEGORY_KEY_PREFIX,
    LEGACY_CATEGORY_KEY_PREFIX,
    CATEGORIES,
    isSupportedCategory
};