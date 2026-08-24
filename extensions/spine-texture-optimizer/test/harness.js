'use strict';
/** Minimal test harness - works on the Node 14 that ships inside Cocos Creator. */

const assert = require('assert');

const tests = [];
let currentFile = '';

function test(name, fn) {
    tests.push({ name, fn, file: currentFile });
}

function setFile(file) {
    currentFile = file;
}

async function run() {
    let passed = 0;
    const failures = [];
    for (const t of tests) {
        try {
            await t.fn();
            passed++;
            console.log('  ok   ' + t.name);
        } catch (e) {
            failures.push({ t, e });
            console.log('  FAIL ' + t.name);
            console.log('       ' + (e && e.message ? e.message.split('\n').join('\n       ') : e));
        }
    }
    console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
    return failures.length === 0;
}

module.exports = { test, run, setFile, assert };
