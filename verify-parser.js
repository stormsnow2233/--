const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./public/parser.js', 'utf8');
const context = { module: { exports: {} }, window: {}, console };
vm.createContext(context);
vm.runInContext(code, context);
const { parseBatchInput } = context.module.exports;

const samples = [
  '我分享了「VSCode.zip」链接：https://pan.baidu.com/s/1abc 提取码: 1234',
  'IDEA破解补丁.7z | https://www.123pan.com/s/def | 8888 | 15MB',
  'https://cloud.189.cn/t/abc123?from=share_copy\n密码:abcd\n1.2G',
];

for (const text of samples) {
  console.log(JSON.stringify(parseBatchInput(text), null, 2));
}
