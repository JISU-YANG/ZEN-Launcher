const RECOMMENDED_FOLDERS = Object.freeze([
    Object.freeze({
        name: '바탕화면',
        link: 'shell:Desktop',
        detail: '바탕화면',
        img: 'src/icon/icon-folder.svg'
    }),
    Object.freeze({
        name: '다운로드',
        link: 'shell:Downloads',
        detail: '다운로드',
        img: 'src/icon/icon-folder.svg'
    }),
    Object.freeze({
        name: '스크린샷',
        link: 'shell:Screenshots',
        detail: '사진\\스크린샷',
        img: 'src/icon/icon-folder.svg'
    }),
    Object.freeze({
        name: '휴지통',
        link: 'shell:RecycleBinFolder',
        detail: '휴지통',
        img: 'src/icon/icon-folder.svg'
    }),
    Object.freeze({
        name: '카카오톡',
        link: '%USERPROFILE%\\Documents\\카카오톡 받은 파일',
        detail: 'Documents\\카카오톡 받은 파일',
        img: 'src/icon/icon-folder.svg'
    })
]);

function copyRecommendedFolder(item) {
    return {
        name: item.name,
        link: item.link,
        detail: item.detail,
        img: item.img
    };
}

function normalizeFolderLink(link) {
    return String(link || '')
        .trim()
        .replace(/\//g, '\\')
        .replace(/\\+/g, '\\')
        .toLowerCase();
}

function listRecommendedFolders() {
    return RECOMMENDED_FOLDERS.map((item) => copyRecommendedFolder(item));
}

function findRecommendedFolder(link) {
    const key = normalizeFolderLink(link);
    if (!key) {
        return null;
    }

    const exact = RECOMMENDED_FOLDERS.find((item) => normalizeFolderLink(item.link) === key);
    if (exact) {
        return copyRecommendedFolder(exact);
    }

    const kakaoSuffix = '\\documents\\카카오톡 받은 파일';
    if (key.endsWith(kakaoSuffix)) {
        const kakao = RECOMMENDED_FOLDERS.find((item) => item.name === '카카오톡');
        return kakao ? copyRecommendedFolder(kakao) : null;
    }

    return null;
}

function isShellFolderLink(link) {
    return /^shell:/i.test(String(link || '').trim());
}

function expandEnvPath(target, env = process.env) {
    return String(target || '').replace(/%([^%]+)%/g, (match, name) => {
        const value = env[name];
        return typeof value === 'string' && value ? value : match;
    });
}

module.exports = {
    RECOMMENDED_FOLDERS,
    listRecommendedFolders,
    findRecommendedFolder,
    isShellFolderLink,
    expandEnvPath
};
