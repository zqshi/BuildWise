"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextThreePartVersion = nextThreePartVersion;
exports.normalizeThreePartVersion = normalizeThreePartVersion;
function parseVersionTriplet(input) {
    if (!input) {
        return null;
    }
    const match = input.trim().match(/^(\d+)[.-](\d+)[.-](\d+)$/);
    if (!match) {
        return null;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (![major, minor, patch].every((item) => Number.isInteger(item) && item >= 0)) {
        return null;
    }
    return { major, minor, patch };
}
function compareVersionTriplet(left, right) {
    if (left.major !== right.major)
        return left.major - right.major;
    if (left.minor !== right.minor)
        return left.minor - right.minor;
    return left.patch - right.patch;
}
function nextThreePartVersion(existing, versionType = "patch") {
    let latest = null;
    for (const item of existing) {
        const parsed = parseVersionTriplet(item.version);
        if (!parsed) {
            continue;
        }
        if (!latest || compareVersionTriplet(parsed, latest) > 0) {
            latest = parsed;
        }
    }
    if (!latest) {
        return "1.0.0";
    }
    if (versionType === "major") {
        return `${latest.major + 1}.0.0`;
    }
    if (versionType === "minor") {
        return `${latest.major}.${latest.minor + 1}.0`;
    }
    return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}
function normalizeThreePartVersion(input) {
    const parsed = parseVersionTriplet(input);
    return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : "";
}
