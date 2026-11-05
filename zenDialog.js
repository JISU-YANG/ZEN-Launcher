(function () {
    const DESTRUCTIVE_LABEL = /삭제|초기화|버리고|지우/;
    const KICKERS = {
        warning: '주의',
        error: '오류',
        info: '안내'
    };

    const queue = [];
    let active = null;
    let previousFocus = null;
    let onKey = null;

    function buttonTone(label, index, defaultId) {
        if (DESTRUCTIVE_LABEL.test(String(label || ''))) {
            return 'danger';
        }
        if (index === defaultId) {
            return 'primary';
        }
        return 'quiet';
    }

    function clampIndex(index, length) {
        const value = Number.isInteger(index) ? index : 0;
        if (length <= 0) {
            return 0;
        }
        return Math.min(Math.max(value, 0), length - 1);
    }

    function ensureDialog() {
        let root = document.getElementById('zen-dialog');
        if (root) {
            return root;
        }

        root = document.createElement('div');
        root.id = 'zen-dialog';
        root.hidden = true;
        root.innerHTML = [
            '<div class="zen-dialog-backdrop" data-zen-dialog-dismiss></div>',
            '<div class="zen-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="zen-dialog-message" aria-describedby="zen-dialog-detail">',
            '<p class="zen-dialog-kicker" id="zen-dialog-kicker"></p>',
            '<h2 class="zen-dialog-message" id="zen-dialog-message"></h2>',
            '<p class="zen-dialog-detail" id="zen-dialog-detail"></p>',
            '<div class="zen-dialog-actions" id="zen-dialog-actions"></div>',
            '</div>'
        ].join('');
        document.body.appendChild(root);
        return root;
    }

    function show(options = {}) {
        return new Promise((resolve) => {
            queue.push({ options, resolve });
            if (!active) {
                presentNext();
            }
        });
    }

    function presentNext() {
        const next = queue.shift();
        if (!next) {
            active = null;
            return;
        }

        active = next;
        const root = ensureDialog();
        const options = next.options || {};
        const buttons = Array.isArray(options.buttons) && options.buttons.length > 0
            ? options.buttons.map((label) => String(label))
            : ['확인'];
        const cancelId = clampIndex(options.cancelId, buttons.length);
        const defaultId = clampIndex(options.defaultId, buttons.length);
        const type = options.type === 'error' || options.type === 'warning' ? options.type : 'info';
        const actions = root.querySelector('#zen-dialog-actions');

        root.querySelector('#zen-dialog-kicker').textContent = KICKERS[type];
        root.querySelector('#zen-dialog-message').textContent = typeof options.message === 'string' ? options.message : '';
        root.querySelector('#zen-dialog-detail').textContent = typeof options.detail === 'string' ? options.detail : '';
        actions.replaceChildren();

        const finish = (index) => {
            if (onKey) {
                document.removeEventListener('keydown', onKey, true);
                onKey = null;
            }
            root.hidden = true;
            const resolveCurrent = next.resolve;
            active = null;
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus({ preventScroll: true });
            }
            previousFocus = null;
            resolveCurrent(clampIndex(index, buttons.length));
            presentNext();
        };

        buttons.forEach((label, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'setting-action-button';
            const tone = buttonTone(label, index, defaultId);
            if (tone === 'danger') {
                button.classList.add('danger-button');
            } else if (tone === 'primary') {
                button.classList.add('primary-button');
            }
            button.textContent = label;
            button.addEventListener('click', () => finish(index));
            actions.appendChild(button);
        });

        onKey = (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            event.preventDefault();
            finish(cancelId);
        };

        const dismiss = root.querySelector('[data-zen-dialog-dismiss]');
        dismiss.onclick = () => finish(cancelId);

        previousFocus = document.activeElement;
        root.hidden = false;
        document.addEventListener('keydown', onKey, true);
        actions.children[defaultId]?.focus({ preventScroll: true });
    }

    window.zenDialog = {
        show,
        buttonTone
    };

    if (window.zenLauncher && typeof window.zenLauncher.showMessage === 'function' && !window.zenLauncher.__zenDialog) {
        window.zenLauncher.showMessage = (options) => show(options);
        window.zenLauncher.__zenDialog = true;
    }
})();
