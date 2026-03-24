const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MAX_REDIRECT_COUNT = 5;

function detectImageExtension(urlString, contentType = '') {
    const type = contentType.toLowerCase();
    if (type.includes('image/png')) {
        return '.png';
    }
    if (type.includes('image/jpeg') || type.includes('image/jpg')) {
        return '.jpg';
    }
    if (type.includes('image/webp')) {
        return '.webp';
    }
    if (type.includes('image/gif')) {
        return '.gif';
    }
    if (type.includes('image/svg+xml')) {
        return '.svg';
    }
    if (type.includes('image/x-icon') || type.includes('image/vnd.microsoft.icon')) {
        return '.ico';
    }

    try {
        const extension = path.extname(new URL(urlString).pathname);
        if (extension && extension.length <= 5) {
            return extension.toLowerCase();
        }
    } catch (_error) {
        return '.img';
    }

    return '.img';
}

function downloadBinary(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const transport = url.startsWith('https:') ? https : http;
        transport.get(url, (response) => {
            const { statusCode = 500, headers } = response;

            if (statusCode >= 300 && statusCode < 400 && headers.location) {
                response.resume();
                if (redirectCount >= MAX_REDIRECT_COUNT) {
                    reject(new Error('이미지 다운로드 리디렉션이 너무 많습니다.'));
                    return;
                }

                const nextUrl = new URL(headers.location, url).toString();
                resolve(downloadBinary(nextUrl, redirectCount + 1));
                return;
            }

            if (statusCode < 200 || statusCode >= 300) {
                response.resume();
                reject(new Error(`이미지 다운로드 실패 (${statusCode})`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => {
                chunks.push(chunk);
            });
            response.on('end', () => {
                resolve({
                    buffer: Buffer.concat(chunks),
                    contentType: typeof headers['content-type'] === 'string' ? headers['content-type'] : '',
                    finalUrl: url
                });
            });
        }).on('error', (error) => {
            reject(new Error(`이미지 다운로드 실패: ${error.message}`));
        });
    });
}

class RemoteImageCacheRepository {
    constructor({ app }) {
        this.app = app;
    }

    getImageCacheDirectory() {
        return path.join(this.app.getPath('userData'), 'cached-images');
    }

    async cacheFromUrl(url) {
        const trimmedUrl = url.trim();
        const { buffer, contentType, finalUrl } = await downloadBinary(trimmedUrl);
        const extension = detectImageExtension(finalUrl || trimmedUrl, contentType);
        const hash = crypto.createHash('sha1').update(trimmedUrl).digest('hex');
        const directory = this.getImageCacheDirectory();

        fs.mkdirSync(directory, { recursive: true });

        const filePath = path.join(directory, `${hash}${extension}`);
        fs.writeFileSync(filePath, buffer);
        return pathToFileURL(filePath).toString();
    }
}

module.exports = {
    RemoteImageCacheRepository
};