import { parseArgs } from './lib-v3-production.mjs';

const args=parseArgs();
const requested=args.seal?'final:seal':'final:release';
console.error(`[P1-16] ${requested} 已退役：这是 V3.0.0 时代的无版本号发布入口，V3.1 封版禁止通过该命令执行。`);
console.error('当前 V3.1 正式入口：npm run final:v31');
console.error('先查看真实环境状态：npm run final:v31:acceptance:status');
console.error('仅做历史 V3.0.0 审计/复现时，可显式运行：node scripts/final-release-v30-v3.mjs ...');
process.exit(64);
