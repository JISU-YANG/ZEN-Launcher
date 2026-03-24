const { isSupportedCategory } = require('../../domain/launcher/categories');
const {
    FOLDER_CATEGORY,
    sanitizeLauncherItem,
    isRemoteImageUrl
} = require('../../domain/launcher/launcherItem');

class LauncherCategoryService {
    constructor({ categoryRepository, remoteImageCacheRepository }) {
        this.categoryRepository = categoryRepository;
        this.remoteImageCacheRepository = remoteImageCacheRepository;
    }

    loadAll() {
        return this.categoryRepository.loadAll();
    }

    async saveCategory(category, items) {
        if (!isSupportedCategory(category)) {
            throw new Error('알 수 없는 카테고리입니다.');
        }

        const safeItems = Array.isArray(items)
            ? (await Promise.all(items.map((item) => this.prepareItemForSave(item, category)))).filter(Boolean)
            : [];

        return this.categoryRepository.save(category, safeItems);
    }

    clearAll() {
        return this.categoryRepository.clearAll();
    }

    async prepareItemForSave(item, category) {
        const normalizedItem = sanitizeLauncherItem(item, category);
        if (!normalizedItem) {
            return null;
        }

        if (category !== FOLDER_CATEGORY && isRemoteImageUrl(normalizedItem.img)) {
            try {
                normalizedItem.img = await this.remoteImageCacheRepository.cacheFromUrl(normalizedItem.img);
            } catch (_error) {
                // Keep the original URL if download fails so saving still succeeds.
            }
        }

        return normalizedItem;
    }
}

module.exports = {
    LauncherCategoryService
};