'use strict';
/**
 * Test runner.
 *
 *   node test/run.js
 *
 * or, with no Node installed, using the one inside Cocos Creator:
 *   set ELECTRON_RUN_AS_NODE=1
 *   "C:\ProgramData\cocos\editors\Creator\3.7.4\CocosCreator.exe" test/run.js
 */

const path = require('path');
const fs = require('fs');
const harness = require('./harness');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort();

for (const file of files) {
    console.log('\n' + file);
    harness.setFile(file);
    require(path.join(dir, file));
}

harness.run().then((ok) => {
    process.exit(ok ? 0 : 1);
});
