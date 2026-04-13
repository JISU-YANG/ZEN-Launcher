function normalizeProgramScanItem(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const link = typeof item.link === 'string' ? item.link.trim() : '';
    const source = typeof item.source === 'string' ? item.source.trim() : '';

    if (!name || !link) {
        return null;
    }

    return { name, link, source };
}

module.exports = {
    normalizeProgramScanItem
};