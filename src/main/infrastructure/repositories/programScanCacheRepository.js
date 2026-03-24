const fs = require('node:fs');
const path = require('node:path');

const PROGRAM_SCAN_CACHE_FILE = 'program-scan-cache.json';

class ProgramScanCacheRepository {
    constructor({ app, normalizeProgramScanItem }) {
        this.app = app;
        this.normalizeProgramScanItem = normalizeProgramScanItem;
    }

    getCachePath() {
        return path.join(this.app.getPath('userData'), PROGRAM_SCAN_CACHE_FILE);
    }

    read() {
        try {
            const cachePath = this.getCachePath();
            if (!fs.existsSync(cachePath)) {
                return { programs: [], scannedAt: '' };
            }

            const raw = fs.readFileSync(cachePath, 'utf8');
            const parsed = JSON.parse(raw);
            const programs = Array.isArray(parsed?.programs)
                ? parsed.programs.map((item) => this.normalizeProgramScanItem(item)).filter(Boolean)
                : [];
            const scannedAt = typeof parsed?.scannedAt === 'string' ? parsed.scannedAt : '';

            return { programs, scannedAt };
        } catch (_error) {
            return { programs: [], scannedAt: '' };
        }
    }

    write(programs, scannedAt) {
        const cachePath = this.getCachePath();
        fs.writeFileSync(cachePath, JSON.stringify({ programs, scannedAt }, null, 2), 'utf8');
    }
}

module.exports = {
    ProgramScanCacheRepository
};