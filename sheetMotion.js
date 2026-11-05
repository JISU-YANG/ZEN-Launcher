(function initZenSheetMotion() {
    const FITS = {
        peek: (available) => Math.min(112, available),
        panel: (available) => Math.min(available, Math.max(220, Math.round(available * 0.42))),
        workspace: (available) => available
    };
    const MOTION_MS = {
        reveal: 320,
        conceal: 320,
        grow: 300,
        shrink: 200,
        exchange: 160,
        contentFade: 140
    };

    let frameToken = 0;
    let metrics = {
        availableAbove: 644,
        dockHeight: 420,
        scale: 1,
        sheetHeight: 0
    };

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const heightFor = (fit) => {
        const available = Math.max(0, Math.round(metrics.availableAbove || 0));
        const resolver = FITS[fit] || FITS.panel;
        return Math.max(0, resolver(available));
    };

    const writeFrameMetrics = (nextMetrics, { sheet = false, snap = false } = {}) => {
        if (!nextMetrics) {
            return;
        }

        metrics = nextMetrics;
        const root = document.documentElement;
        root.style.setProperty('--layout-scale', String(nextMetrics.scale || 1));
        root.style.setProperty('--dock-height', `${nextMetrics.dockHeight || 420}px`);
        if (!sheet) {
            return;
        }

        if (snap) {
            root.style.setProperty('--sheet-duration', '0ms');
        }
        root.style.setProperty('--sheet-size', `${nextMetrics.sheetHeight || 0}px`);
        if (snap) {
            window.requestAnimationFrame(() => {
                root.style.setProperty('--sheet-duration', reducedMotion() ? '0ms' : `${MOTION_MS.reveal}ms`);
            });
        }
    };

    const wait = (ms) => new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });

    const waitTransition = (element, timeout) => {
        if (!element || reducedMotion() || timeout === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                element.removeEventListener('transitionend', onEnd);
                resolve();
            };
            const onEnd = (event) => {
                if (event.target !== element || event.propertyName !== 'height') {
                    return;
                }
                finish();
            };
            element.addEventListener('transitionend', onEnd);
            window.setTimeout(finish, timeout + 80);
        });
    };

    const syncBody = (editor) => {
        if (!document.body || !editor) {
            return;
        }
        const active = editor.classList.contains('open') || editor.classList.contains('closing');
        document.body.dataset.editorActive = active ? 'true' : 'false';
    };

    const refreshMetrics = async () => {
        if (!window.zenLauncher?.getLayoutMetrics) {
            return metrics;
        }
        writeFrameMetrics(await window.zenLauncher.getLayoutMetrics());
        return metrics;
    };

    const playExchange = (editor) => {
        editor.classList.remove('is-exchange');
        window.requestAnimationFrame(() => {
            editor.classList.add('is-exchange');
        });
    };

    const openSheet = async (editor, { fit = 'panel' } = {}) => {
        if (!editor || !window.zenLauncher?.applySheetFit) {
            return false;
        }

        const token = ++frameToken;
        const wasOpen = editor.classList.contains('open') && !editor.classList.contains('closing');
        const previousFit = editor.dataset.fit || '';
        await refreshMetrics();
        if (token !== frameToken) {
            return false;
        }

        const nextHeight = heightFor(fit);
        const previousHeight = wasOpen ? heightFor(previousFit || 'panel') : 0;
        let motion = 'reveal';
        if (wasOpen && nextHeight === previousHeight) {
            motion = 'exchange';
        } else if (wasOpen && nextHeight > previousHeight) {
            motion = 'grow';
        } else if (wasOpen && nextHeight < previousHeight) {
            motion = 'shrink';
        }

        const duration = reducedMotion() ? 0 : (MOTION_MS[motion] || MOTION_MS.reveal);
        editor.dataset.fit = fit;
        editor.dataset.motion = motion;
        editor.style.setProperty('--sheet-duration', `${duration}ms`);
        editor.classList.remove('closing');
        syncBody(editor);

        if (motion === 'exchange') {
            editor.classList.add('open', 'open-ready');
            playExchange(editor);
            syncBody(editor);
            return true;
        }

        if (motion === 'grow' || motion === 'shrink') {
            editor.classList.remove('open-ready');
            await wait(reducedMotion() ? 0 : MOTION_MS.contentFade);
            if (token !== frameToken) {
                return false;
            }
        }

        if (motion === 'reveal' || motion === 'grow') {
            const nextMetrics = await window.zenLauncher.applySheetFit(fit);
            if (token !== frameToken) {
                return false;
            }
            writeFrameMetrics(nextMetrics);
            document.documentElement.style.setProperty('--sheet-duration', `${duration}ms`);
        }

        editor.classList.add('open');
        editor.style.setProperty('--sheet-size', `${nextHeight}px`);
        syncBody(editor);
        await waitTransition(editor, duration);
        if (token !== frameToken || !editor.classList.contains('open') || editor.classList.contains('closing')) {
            return false;
        }

        if (motion === 'shrink') {
            const nextMetrics = await window.zenLauncher.applySheetFit(fit);
            if (token !== frameToken) {
                return false;
            }
            writeFrameMetrics(nextMetrics);
        }

        editor.classList.add('open-ready');
        syncBody(editor);
        return true;
    };

    const closeSheet = async (editor) => {
        if (!editor || !window.zenLauncher?.applySheetFit) {
            return false;
        }

        const token = ++frameToken;
        const duration = reducedMotion() ? 0 : MOTION_MS.conceal;
        editor.dataset.motion = 'conceal';
        editor.style.setProperty('--sheet-duration', `${duration}ms`);
        editor.classList.remove('open-ready', 'is-exchange');
        syncBody(editor);
        await wait(reducedMotion() ? 0 : MOTION_MS.contentFade);
        if (token !== frameToken) {
            return false;
        }

        editor.classList.add('closing');
        editor.classList.remove('open');
        editor.style.setProperty('--sheet-size', '0px');
        syncBody(editor);
        await waitTransition(editor, duration);
        if (token !== frameToken) {
            return false;
        }

        const nextMetrics = await window.zenLauncher.applySheetFit('closed');
        if (token !== frameToken) {
            return false;
        }
        writeFrameMetrics(nextMetrics, { sheet: true, snap: true });
        editor.classList.remove('closing', 'open-ready', 'is-exchange');
        delete editor.dataset.fit;
        delete editor.dataset.motion;
        delete editor.dataset.panel;
        delete editor.dataset.size;
        syncBody(editor);
        return true;
    };

    window.zenSheet = {
        MOTION_MS,
        refreshMetrics,
        openSheet,
        closeSheet
    };

    const boot = () => {
        refreshMetrics().catch(() => {});
        window.zenLauncher?.onLayoutMetrics?.((nextMetrics) => {
            writeFrameMetrics(nextMetrics, { sheet: true, snap: true });
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
        return;
    }

    boot();
})();
