const path = require('path');

function splitExecutableCommand(target) {
    const trimmed = String(target || '').trim();
    if (!trimmed) {
        return null;
    }

    let file = '';
    let rest = '';
    if (trimmed.startsWith('"')) {
        const end = trimmed.indexOf('"', 1);
        if (end <= 1) {
            return null;
        }
        file = trimmed.slice(1, end);
        rest = trimmed.slice(end + 1).trim();
    } else {
        const match = trimmed.match(/^(.*\.exe)\s+(\S.*)$/i);
        if (!match) {
            return null;
        }
        file = match[1];
        rest = match[2].trim();
    }

    if (!rest || path.win32.extname(file).toLowerCase() !== '.exe' || !path.win32.isAbsolute(file)) {
        return null;
    }

    const args = rest.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!args || args.length === 0) {
        return null;
    }

    return {
        file,
        args: args.map((arg) => arg.replace(/^"(.*)"$/, '$1'))
    };
}

module.exports = {
    splitExecutableCommand
};
