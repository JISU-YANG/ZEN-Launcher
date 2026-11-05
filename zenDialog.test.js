const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDialog() {
    const source = fs.readFileSync(path.join(__dirname, 'zenDialog.js'), 'utf8');
    const window = {};
    const document = {
        getElementById() {
            return null;
        },
        addEventListener() {},
        removeEventListener() {},
        activeElement: null
    };
    vm.runInNewContext(source, { window, document });
    return window.zenDialog;
}

test('marks destructive choices and keeps the safe default emphasized', () => {
    const dialog = loadDialog();
    assert.equal(dialog.buttonTone('계속 편집', 0, 0), 'primary');
    assert.equal(dialog.buttonTone('버리고 닫기', 1, 0), 'danger');
    assert.equal(dialog.buttonTone('취소', 0, 0), 'primary');
    assert.equal(dialog.buttonTone('전체 초기화', 1, 0), 'danger');
    assert.equal(dialog.buttonTone('삭제', 1, 0), 'danger');
    assert.equal(dialog.buttonTone('확인', 0, 0), 'primary');
});
