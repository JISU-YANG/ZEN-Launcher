const test = require('node:test');
const assert = require('node:assert/strict');
const { splitExecutableCommand } = require('./executableCommand');

test('splits a Riot Client launch command into the executable and its arguments', () => {
    const command = splitExecutableCommand(
        'C:\\Riot Games\\Riot Client\\RiotClientServices.exe --launch-product=league_of_legends --launch-patchline=live'
    );

    assert.equal(command.file, 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe');
    assert.deepEqual(command.args, [
        '--launch-product=league_of_legends',
        '--launch-patchline=live'
    ]);
});

test('leaves a bare executable path to the existing launcher', () => {
    assert.equal(splitExecutableCommand('C:\\Windows\\notepad.exe'), null);
    assert.equal(splitExecutableCommand('notepad.exe --something'), null);
});
