function hasLauncherLink(item) {
    return typeof item?.link === 'string' && item.link.trim() !== '';
}

function resolveNextLauncherSlot(items, maxCount, requestedIndex = null) {
    const list = Array.isArray(items) ? items : [];
    const limit = Number(maxCount);
    if (!Number.isInteger(limit) || limit < 1) {
        return null;
    }

    const filledCount = list.filter((item) => hasLauncherLink(item)).length;
    if (filledCount >= limit) {
        return null;
    }

    const hole = list.findIndex((item) => !hasLauncherLink(item));
    const requested = Number.isInteger(requestedIndex) && requestedIndex >= 0
        ? requestedIndex
        : null;
    const index = requested !== null ? requested : (hole >= 0 ? hole : list.length);
    if (index >= limit || hasLauncherLink(list[index])) {
        return null;
    }

    return index;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        resolveNextLauncherSlot
    };
}
