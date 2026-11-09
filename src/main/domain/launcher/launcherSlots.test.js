const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveNextLauncherSlot } = require('./launcherSlots');

function linked(name) {
    return { name, link: `${name}.exe`, img: '' };
}

test('opens the sixth gallery slot even when a blank draft already occupies it', () => {
    const five = [linked('a'), linked('b'), linked('c'), linked('d'), linked('e')];
    assert.equal(resolveNextLauncherSlot(five, 6, 5), 5);

    const blankSixth = [...five, { name: '', link: '', img: '' }];
    assert.equal(resolveNextLauncherSlot(blankSixth, 6, 5), 5);
    assert.equal(resolveNextLauncherSlot(blankSixth, 6), 5);
});

test('stops once six linked gallery items exist', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => linked(name));
    assert.equal(resolveNextLauncherSlot(six, 6, 6), null);
    assert.equal(resolveNextLauncherSlot(six, 6), null);
});
