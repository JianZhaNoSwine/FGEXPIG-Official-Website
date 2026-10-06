/* FGEXPIG 管理员密码哈希生成器（开发工具）
   用法：node tools/make-password-hash.js 新密码
        或双击 tools/make-password-hash.bat
   把输出的 hash 填到 js/main.js 的 ADMIN_PASS_HASH（salt 必须与 ADMIN_SALT 一致） */
'use strict';
const crypto = require('crypto');
const SALT = 'fgexpig::admin::v1';

const pw = process.argv.slice(2).join(' ');
if (!pw) {
  console.log('用法: node tools/make-password-hash.js 新密码');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(SALT + pw, 'utf8').digest('hex');
console.log('');
console.log('salt : ' + SALT);
console.log('hash : ' + hash);
console.log('');
console.log('把上面的 hash 填到 js/main.js 的 ADMIN_PASS_HASH 即可（记得升版本号）。');
