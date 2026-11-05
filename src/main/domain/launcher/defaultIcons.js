const ICONS_SEEDED_KEY = 'ZENL.IconsSeeded';

const DEFAULT_ICONS = Object.freeze([
    Object.freeze({ name: '계산기', link: 'calc.exe', img: 'src/icon/icon-tool-calculator.svg' }),
    Object.freeze({ name: '시계', link: 'ms-clock:', img: 'src/icon/icon-tool-clock.svg' }),
    Object.freeze({ name: '메모장', link: 'notepad.exe', img: 'src/icon/icon-tool-notepad.svg' }),
    Object.freeze({ name: '캡처도구', link: 'SnippingTool.exe', img: 'src/icon/icon-tool-snipping.svg' }),
    Object.freeze({ name: '그림판', link: 'mspaint.exe', img: 'src/icon/icon-tool-paint.svg' }),
    Object.freeze({ name: '화상 키보드', link: 'osk.exe', img: 'src/icon/icon-tool-keyboard.svg' })
]);

function resolveInitialIcons({ iconsSeeded = false, items = [] } = {}) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];

    if (iconsSeeded) {
        return {
            changed: false,
            replaceItems: false,
            items: list
        };
    }

    if (list.length > 0) {
        return {
            changed: true,
            replaceItems: false,
            items: list
        };
    }

    return {
        changed: true,
        replaceItems: true,
        items: DEFAULT_ICONS.map((item) => ({ ...item }))
    };
}

module.exports = {
    ICONS_SEEDED_KEY,
    DEFAULT_ICONS,
    resolveInitialIcons
};
