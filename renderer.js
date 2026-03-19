window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('input-search');
    const refreshButton = document.getElementById('btn-refresh');

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

        const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;

        try {
            await window.npLauncher.openExternal(url);
        } catch (error) {
            await window.npLauncher.showMessage({
                type: 'error',
                message: error.message || '검색 페이지를 열지 못했습니다.'
            });
        }
    });

    refreshButton?.addEventListener('click', async () => {
        await window.npLauncher.reloadWindow();
    });
});
