const NEXON_PLUG_LAUNCH = 'ngm://launch/ -mode:pluglaunch -game:';
const NEXON_PLUG_SUFFIX = ' -locale:KR -publisher:NexonKorea';
const RIOT_CLIENT = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';

const RECOMMENDED_GALLERIES = Object.freeze([
    Object.freeze({
        name: 'MapleStory',
        link: `${NEXON_PLUG_LAUNCH}589825${NEXON_PLUG_SUFFIX}`,
        detail: '넥슨 플러그',
        img: 'https://i.imgur.com/FmocHXl.gif'
    }),
    Object.freeze({
        name: 'Sudden Attack',
        link: `${NEXON_PLUG_LAUNCH}94227${NEXON_PLUG_SUFFIX}`,
        detail: '넥슨 플러그',
        img: 'https://i.imgur.com/NieTObp.gif'
    }),
    Object.freeze({
        name: 'League of Legends',
        link: `${RIOT_CLIENT} --launch-product=league_of_legends --launch-patchline=live`,
        detail: 'Riot Client',
        img: 'https://i.imgur.com/SaCZDll.gif'
    }),
    Object.freeze({
        name: 'VALORANT',
        link: `${RIOT_CLIENT} --launch-product=valorant --launch-patchline=live`,
        detail: 'Riot Client',
        img: 'https://i.imgur.com/JhYlVeB.gif'
    }),
    Object.freeze({
        name: 'PUBG: BATTLEGROUNDS',
        link: 'steam://rungameid/578080',
        detail: 'Steam',
        img: 'https://i.imgur.com/hY0D1EY.gif'
    }),
    Object.freeze({
        name: 'Mabinogi',
        link: `${NEXON_PLUG_LAUNCH}74245@761d${NEXON_PLUG_SUFFIX}`,
        detail: '넥슨 플러그',
        img: 'https://i.imgur.com/uyco4Ok.gif'
    })
]);

function copyRecommendedGallery(item) {
    return {
        name: item.name,
        link: item.link,
        detail: item.detail,
        img: item.img
    };
}

function normalizeGalleryLink(link) {
    return String(link || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function listRecommendedGalleries() {
    return RECOMMENDED_GALLERIES.map((item) => copyRecommendedGallery(item));
}

function findRecommendedGallery(link) {
    const key = normalizeGalleryLink(link);
    if (!key) {
        return null;
    }

    const match = RECOMMENDED_GALLERIES.find((item) => normalizeGalleryLink(item.link) === key);
    return match ? copyRecommendedGallery(match) : null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RECOMMENDED_GALLERIES,
        listRecommendedGalleries,
        findRecommendedGallery
    };
}
