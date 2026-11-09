const test = require('node:test');
const assert = require('node:assert/strict');
const {
    RECOMMENDED_GALLERIES,
    listRecommendedGalleries,
    findRecommendedGallery
} = require('./recommendedGalleries');

test('offers the six gallery games with their poster and launch target', () => {
    assert.deepEqual(listRecommendedGalleries().map((item) => item.name), [
        'MapleStory',
        'Sudden Attack',
        'League of Legends',
        'VALORANT',
        'PUBG: BATTLEGROUNDS',
        'Mabinogi'
    ]);

    assert.equal(findRecommendedGallery('steam://rungameid/578080')?.name, 'PUBG: BATTLEGROUNDS');
    assert.match(findRecommendedGallery('NGM://launch/ -mode:pluglaunch -game:589825 -locale:KR -publisher:NexonKorea')?.img || '', /FmocHXl\.gif$/);
    assert.match(findRecommendedGallery('ngm://launch/ -mode:pluglaunch -game:94227 -locale:KR -publisher:NexonKorea')?.link || '', /-game:94227/);
    assert.match(findRecommendedGallery('ngm://launch/ -mode:pluglaunch -game:74245@761d -locale:KR -publisher:NexonKorea')?.link || '', /74245@761d/);
    assert.match(findRecommendedGallery('C:\\Riot Games\\Riot Client\\RiotClientServices.exe --launch-product=valorant --launch-patchline=live')?.link || '', /--launch-product=valorant/);
    assert.equal(findRecommendedGallery(''), null);
    assert.equal(findRecommendedGallery('steam://rungameid/1'), null);

    const listed = listRecommendedGalleries();
    listed[0].name = '바뀐 이름';
    assert.equal(RECOMMENDED_GALLERIES[0].name, 'MapleStory');
});
