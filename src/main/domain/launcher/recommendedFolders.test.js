const test = require('node:test');
const assert = require('node:assert/strict');
const {
    listRecommendedFolders,
    findRecommendedFolder,
    isShellFolderLink,
    expandEnvPath
} = require('./recommendedFolders');

test('offers desktop, downloads, screenshots, recycle bin, and KakaoTalk received files', () => {
    assert.deepEqual(listRecommendedFolders().map((item) => item.name), [
        '바탕화면',
        '다운로드',
        '스크린샷',
        '휴지통',
        '카카오톡'
    ]);
    assert.equal(findRecommendedFolder('shell:Desktop')?.detail, '바탕화면');
    assert.equal(findRecommendedFolder('SHELL:RecycleBinFolder')?.name, '휴지통');
    assert.equal(findRecommendedFolder('shell:Screenshots')?.detail, '사진\\스크린샷');
    assert.equal(
        findRecommendedFolder('%USERPROFILE%/Documents/카카오톡 받은 파일')?.name,
        '카카오톡'
    );
    assert.equal(
        findRecommendedFolder('C:\\Users\\me\\Documents\\카카오톡 받은 파일')?.detail,
        'Documents\\카카오톡 받은 파일'
    );
    assert.equal(findRecommendedFolder('C:\\Users\\me\\Desktop'), null);
});

test('expands a user-profile folder and recognizes shell links', () => {
    assert.equal(isShellFolderLink(' shell:Downloads '), true);
    assert.equal(isShellFolderLink('%USERPROFILE%\\Documents'), false);
    assert.equal(
        expandEnvPath('%USERPROFILE%\\Documents\\카카오톡 받은 파일', { USERPROFILE: 'C:\\Users\\me' }),
        'C:\\Users\\me\\Documents\\카카오톡 받은 파일'
    );
    assert.equal(expandEnvPath('%MISSING%\\Desktop', {}), '%MISSING%\\Desktop');
});
