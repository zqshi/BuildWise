"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePositiveInt = parsePositiveInt;
function parsePositiveInt(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
}
