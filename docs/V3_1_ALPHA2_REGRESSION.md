# V3.1-alpha2 回归

- `npm run verify:core`：PASS。
- `npm run test:v31-alpha2-browser`：390×844、412×915、820×1180、1366×768、1920×1080 PASS。
- `npm run test:studio-browser`：320×740、390×844、768×1024、1366×768、1920×1080 PASS；实际修改 Theme、页面和组件样式。
- 第一/第二期 Reader、V3.1-alpha1 布局矩阵、Alpha13 导入、Alpha14 实时 Reader、Beta1 block matrix 重新 PASS。
- Safari-like 第一次串行运行出现一次 iPad 翻页时序失败，单独重新执行五档全部 PASS，无 Reader 逻辑回归。
