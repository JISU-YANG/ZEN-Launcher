class ProgramCatalogService {
    constructor({ cacheRepository, scanPrograms }) {
        this.cacheRepository = cacheRepository;
        this.scanPrograms = scanPrograms;
    }

    loadScanCache() {
        return this.cacheRepository.read();
    }

    async scanAndCachePrograms() {
        const programs = await this.scanPrograms();
        const scannedAt = new Date().toISOString();
        this.cacheRepository.write(programs, scannedAt);
        return { programs, scannedAt };
    }
}

module.exports = {
    ProgramCatalogService
};