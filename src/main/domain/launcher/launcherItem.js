const FOLDER_CATEGORY = 'folder';

function sanitizeLauncherItem(item, category) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const link = typeof item.link === 'string' ? item.link.trim() : '';
    const img = category !== FOLDER_CATEGORY && typeof item.img === 'string'
        ? item.img.trim()
        : '';

    if (!link) {
        return null;
    }

    return { name, link, img };
}

function isRemoteImageUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

module.exports = {
    FOLDER_CATEGORY,
    sanitizeLauncherItem,
    isRemoteImageUrl
};