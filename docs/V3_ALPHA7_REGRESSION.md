# V3.0-alpha7 Regression Report

## 自动验证

最终 `npm run verify:v3`：PASS。

- check:v3 PASS
- build:v3 PASS
- test:v3 PASS
- test:production PASS
- test:platform PASS
- test:visual-editor PASS
- test:browser PASS
- test:studio-browser PASS

## 阅读器 Chromium

- 390×844 PASS
- 412×915 PASS
- 820×1180 PASS
- 1366×768 PASS
- 1920×1080 PASS

## 制作中心 Chromium

- 320×740 PASS
- 390×844 PASS
- 768×1024 PASS
- 1366×768 PASS
- 1920×1080 PASS

## alpha7 专项

- 14 类内容块面板可显示
- 添加 quote 块 PASS
- 复制内容块 PASS
- 可视化 -> JSON 同步 PASS
- JSON -> 可视化同步 PASS
- 80 blocks/page 服务端边界 PASS
- 40 items/block-array 服务端边界 PASS
- unknown block.type 拒绝 PASS
- 审计定位页面字段 PASS
- 审计定位元数据 PASS
- 审计定位 blockIndex PASS
- 320px 下块选择弹窗不越界 PASS
- 实时预览区域不造成横向溢出 PASS
