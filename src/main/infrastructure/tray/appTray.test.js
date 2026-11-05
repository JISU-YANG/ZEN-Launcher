const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrayMenuTemplate, describeUpdateStatus } = require('./appTray');

test('the tray status names the current and downloaded versions', () => {
    assert.equal(describeUpdateStatus({ status: 'up-to-date' }), '최신 버전입니다');
    assert.equal(describeUpdateStatus({
        status: 'downloaded',
        downloadedVersion: '2.2.1'
    }), '2.2.1 설치 가능');
});

test('the tray menu shows the current version and update actions', () => {
    const template = buildTrayMenuTemplate({
        currentVersion: '2.2.1',
        status: 'downloaded',
        downloadedVersion: '2.3.0'
    });
    const labels = template.map((item) => item.label).filter(Boolean);

    assert.equal(labels[0], '현재 버전 2.2.1');
    assert.equal(labels.includes('업데이트 확인'), true);
    assert.equal(labels.includes('2.3.0 설치 후 다시 시작'), true);
    assert.equal(labels.includes('종료'), true);
});

test('update checks stay disabled while a download is running', () => {
    const template = buildTrayMenuTemplate({
        currentVersion: '2.2.1',
        status: 'downloading',
        availableVersion: '2.3.0'
    });
    const checkItem = template.find((item) => item.label === '업데이트 확인');

    assert.equal(checkItem.enabled, false);
    assert.equal(describeUpdateStatus({
        status: 'downloading',
        availableVersion: '2.3.0'
    }), '2.3.0 다운로드 중');
});
