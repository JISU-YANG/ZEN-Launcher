const ALLOWED_SYSTEM32_BASENAMES = new Set([
    'notepad.exe',
    'calc.exe',
    'mspaint.exe',
    'snippingtool.exe',
    'osk.exe',
    'write.exe',
    'charmap.exe',
    'magnify.exe'
]);

const SYSTEM_NAME_PATTERNS = [
    /update/i,
    /installer/i,
    /\bsetup\b/i,
    /helper/i,
    /redistributable/i,
    /\bruntime\b/i,
    /unins/i,
    /crash/i,
    /report/i,
    /diagnostic/i,
    /compatibility/i,
    /troubleshoot/i,
    /webview/i,
    /edgeupdate/i,
    /security health/i,
    /windows defender/i,
    /microsoft edge update/i,
    /visual c\+\+/i,
    /\.net /i,
    /host process/i,
    /background task/i,
    /notification/i,
    /service hub/i,
    /telemetry/i
];

const SYSTEM_PATH_PATTERNS = [
    /\\windows\\system32\\/i,
    /\\windows\\syswow64\\/i,
    /\\windows\\winsxs\\/i,
    /\\windows\\servicing\\/i,
    /\\package cache\\/i,
    /\\installer\\/i,
    /\\temp\\/i,
    /\\microsoft\\edgeupdate\\/i,
    /\\windows apps\\/i
];

function getBasename(link = '') {
    const normalized = String(link || '').replace(/\//g, '\\');
    const parts = normalized.split('\\').filter(Boolean);
    return (parts[parts.length - 1] || '').toLowerCase();
}

function isSystemProgram(program) {
    const name = typeof program?.name === 'string' ? program.name.trim() : '';
    const link = typeof program?.link === 'string' ? program.link.trim() : '';
    if (!name || !link) {
        return true;
    }

    const basename = getBasename(link);
    if (ALLOWED_SYSTEM32_BASENAMES.has(basename)) {
        return false;
    }

    if (SYSTEM_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
        return true;
    }

    if (SYSTEM_PATH_PATTERNS.some((pattern) => pattern.test(link))) {
        return true;
    }

    return false;
}

function normalizeLinkKey(link = '') {
    return String(link || '').trim().toLowerCase().replace(/\//g, '\\');
}

module.exports = {
    ALLOWED_SYSTEM32_BASENAMES,
    isSystemProgram,
    normalizeLinkKey
};
