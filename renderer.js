window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('input-search');
    const refreshButton = document.getElementById('btn-refresh');
    const searchEngineLink = document.querySelector('#search-area > div:first-child > a');
    const SEARCH_ENGINES = {
        default: {
            label: 'Google',
            home: 'https://www.google.com',
            buildSearchUrl: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        },
        g: {
            label: 'Google',
            home: 'https://www.google.com',
            buildSearchUrl: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        },
        n: {
            label: 'Naver',
            home: 'https://search.naver.com',
            buildSearchUrl: (keyword) => `https://search.naver.com/search.naver?where=nexearch&sm=top_sug.pre&fbm=0&acr=1&acq=%E3%85%81&qdt=0&ie=utf8&query=${encodeURIComponent(keyword)}&ackey=0tb853ea`
        },
        y: {
            label: 'YouTube',
            home: 'https://www.youtube.com',
            buildSearchUrl: (keyword) => `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&utm_source=opensearch`
        },
        c: {
            label: 'Coupang',
            home: 'https://www.coupang.com',
            buildSearchUrl: (keyword) => `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(keyword)}&traceId=mfxq97q1&channel=user`
        }
    };
    let activeSearchEngine = SEARCH_ENGINES.default;
    const updateSearchEngineDisplay = () => {
        if (!searchEngineLink) {
            return;
        }

        searchEngineLink.textContent = activeSearchEngine.label;
        searchEngineLink.href = activeSearchEngine.home;
    };
    const syncSearchEngineFromInput = () => {
        if (!searchInput) {
            return;
        }

        const matchedPrefix = searchInput.value.match(/^([gnyc])\s+(.*)$/is);
        if (!matchedPrefix) {
            return;
        }

        const [, prefix, keyword] = matchedPrefix;
        activeSearchEngine = SEARCH_ENGINES[prefix.toLowerCase()] || SEARCH_ENGINES.default;
        searchInput.value = keyword.replace(/^\s+/u, '');
        updateSearchEngineDisplay();
    };
    const focusSearchInput = () => {
        if (!searchInput) {
            return;
        }

        searchInput.focus({ preventScroll: true });
        searchInput.select();
    };

    const detachFocusListener = window.npLauncher.onFocusSearch(focusSearchInput);

    document.addEventListener('keydown', (event) => {
        if (!event.ctrlKey || event.code !== 'Space' || event.repeat) {
            return;
        }

        event.preventDefault();
        focusSearchInput();
    });

    document.addEventListener('click', async (event) => {
        const trigger = event.target.closest('.launcher, .launcher-basic');
        if (!trigger) {
            return;
        }

        try {
            await window.npLauncher.run(trigger.dataset.link || '');
        } catch (error) {
            await window.npLauncher.showMessage({
                type: 'error',
                message: error.message || '대상을 실행하지 못했습니다.'
            });
        }
    });

    searchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        const keyword = searchInput.value.trim();
        if (!keyword) {
            return;
        }

        const url = activeSearchEngine.buildSearchUrl(keyword);

        try {
            await window.npLauncher.openExternal(url);
        } catch (error) {
            await window.npLauncher.showMessage({
                type: 'error',
                message: error.message || '검색 페이지를 열지 못했습니다.'
            });
        }
    });

    searchInput?.addEventListener('input', () => {
        syncSearchEngineFromInput();
        updateSearchEngineDisplay();
    });

    refreshButton?.addEventListener('click', async () => {
        await window.npLauncher.reloadWindow();
    });

    updateSearchEngineDisplay();

    window.addEventListener('beforeunload', () => {
        detachFocusListener();
    });
});
