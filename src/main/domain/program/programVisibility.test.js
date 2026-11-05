const test = require('node:test');
const assert = require('node:assert/strict');
const { isSystemProgram, normalizeLinkKey } = require('./programVisibility');

test('keeps everyday tools even when they live under System32', () => {
    assert.equal(isSystemProgram({
        name: '메모장',
        link: 'C:\\Windows\\System32\\notepad.exe'
    }), false);
});

test('hides update helpers and redistributables', () => {
    assert.equal(isSystemProgram({
        name: 'Microsoft Edge Update',
        link: 'C:\\Program Files\\Microsoft\\EdgeUpdate\\MicrosoftEdgeUpdate.exe'
    }), true);
    assert.equal(isSystemProgram({
        name: 'Visual C++ Redistributable',
        link: 'C:\\Program Files\\VC\\vc_redist.exe'
    }), true);
});

test('normalizes link keys for duplicate checks', () => {
    assert.equal(
        normalizeLinkKey('C:/Apps/Tool.EXE'),
        'c:\\apps\\tool.exe'
    );
});
