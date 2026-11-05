const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMasterMuteOutput, readMasterMute } = require('./masterMute');

test('parseMasterMuteOutput reads the powershell true and false lines', () => {
    assert.equal(parseMasterMuteOutput('true\r\n'), true);
    assert.equal(parseMasterMuteOutput(' FALSE '), false);
    assert.equal(parseMasterMuteOutput(''), null);
    assert.equal(parseMasterMuteOutput('muted'), null);
});

test('readMasterMute skips the query outside Windows', async () => {
    let called = false;
    const muted = await readMasterMute({
        platform: 'linux',
        powershellPath: 'powershell.exe',
        execFileText: async () => {
            called = true;
            return 'true';
        }
    });

    assert.equal(muted, null);
    assert.equal(called, false);
});

test('readMasterMute returns null when the query fails', async () => {
    const muted = await readMasterMute({
        platform: 'win32',
        powershellPath: 'powershell.exe',
        execFileText: async () => {
            throw new Error('unavailable');
        }
    });

    assert.equal(muted, null);
});
