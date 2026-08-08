"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
// Điểm vào của extension. Không cần logic gì đặc biệt,
// việc đăng ký inspector đã khai báo trong package.json (contributions.inspector).
exports.methods = {};
function load() { }
exports.load = load;
function unload() { }
exports.unload = unload;
