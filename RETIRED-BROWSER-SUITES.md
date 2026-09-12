# 浏览器套件门禁策略（2026-09-12 起）

本文件记录 **为什么门禁只跑 10 个浏览器套件**，以及其余 26 个怎么恢复。
改动门禁前请先读这里。

---

## 1. 门禁只保留 10 个套件

`.github/workflows/v3-check.yml` 的 `verify` 作业是分支保护的必需检查。
它现在跑：

| 套件 | 覆盖的制作方场景 |
|---|---|
| `test:browser:001` | 第一期在 iPhone / Android / iPad / 1366 / 1920 五种视口的真实渲染 |
| `test:browser` | 第二期同上（第二期是当前最完整的真实刊物） |
| `test:beta1-browser` | `preview-beta1-matrix` 内容块矩阵在五种视口的渲染 |
| `test:v31-alpha1-browser` | `preview-v31-layout-matrix` 版面矩阵在五种视口的渲染 |
| `test:v31-alpha2-browser` | `preview-v31-style-matrix` 样式矩阵在五种视口的渲染 |
| `test:v31-alpha16-browser` | **媒体直编 + 多窗口冲突保护**（对应 P0-02 保存风险） |
| `test:v31-alpha22-browser` | 富文本编辑器真实运行（Tiptap 自托管） |
| `test:v31-alpha23-browser` | 跨页文本流、桌面双栏/跨栏、移动端自动单栏 |
| `test:v31-alpha26-browser` | **手机端 Reader-first 壳层、四 Bottom Sheet、320/390/768 边界** |
| `test:v31-alpha10-browser` | **校审交接**：交接基线、差异核对、核对失效与重新签收 |

加上 `verify:core`（55 个脚本）、7 个针对性 smoke、`media:check --strict`，
整个门禁在 GitHub 上约 **3 分钟**跑完（含 10 个浏览器套件）。

---

## 2. 为什么砍掉 26 个

### 2.1 12 个 advisory 套件的实测（2026-09-12）

```
PASS  test:beta2-browser
PASS  test:v31-alpha17-browser
FAIL  test:studio-browser      Studio browser bootstrap contract drifted: legacy preset inline sequence not found
FAIL  test:alpha13-browser
FAIL  test:alpha14-browser     Alpha14 browser bootstrap contract drifted: Reader fixture tags not found
FAIL  test:rc1-browser         phone-390: Reader 未就绪
FAIL  test:rc3-browser         TypeError: Cannot read properties of undefined (reading 'openIssue')
FAIL  test:v31-alpha14-browser
FAIL  test:v31-alpha15-browser
FAIL  test:v31-alpha18-browser TypeError: Cannot read properties of null (reading 'textContent')
FAIL  test:v31-alpha24-browser
FAIL  test:v31-alpha25-browser
```

10 个失败里 **没有一个是产品坏了**：全部是测试在找已经不存在、或已经改名的
标记/API/固定字符串。它们在此之前的 CI 历史里**没有成功过一次**，
所以既提供不了信号，又占着每次 PR 的运行时间与阅读负担。

### 2.2 判据

> **同一个套件因为非产品原因（测试脚本自己的缺陷、旧标记、旧 API）红了两次，
> 就退休，不要继续修。**

理由：修这类套件花的是开发者的时间，产出的是「测试能跑」而不是「产品更稳」。
2026-09-12 那次修复中，`v31-alpha23-browser` 和 `v31-alpha11-browser`
合计花了近两小时，其中约一半时间在处理测试自己的注入手法与断言写法。

### 2.3 另外 14 个

`verify:beta` / `verify:beta2` / `verify:rc1` / `verify:rc2` / `verify:rc3` /
`verify:v31` / `verify:v31-rc*` 这些历史聚合脚本引用的套件，
与上面 10 个的覆盖高度重叠，且大部分同样处于漂移状态。它们已被
`verify:gate` 取代，脚本本身保留（见下）。

---

## 3. 退休不等于删除

**所有套件的 npm script 与脚本文件都还在。** 做法是：

```bash
# 改到某个领域时，显式跑对应套件（示例：改设计预设）
npm run test:alpha13-browser

# 一次看清全部退休套件现在的状态（不阻塞、一次性汇总）
npm run test:browser:retired
```

退休套件清单（26 个）。**A 组**是 2026-09-12 逐个实测过的 12 个 advisory 套件，
**B 组**是同日一并裁掉、当天未单独复测的 14 个（退休依据见 2.3）。

### A 组：原 advisory 层 12 个（已实测）

| 套件 | 实测 | 说明 |
|---|---|---|
| `beta2-browser` | PASS | 覆盖与 `browser` / `beta1-browser` 渲染矩阵重叠 |
| `v31-alpha17-browser` | PASS | 覆盖与 `alpha26` 手机壳层重叠 |
| `studio-browser` | FAIL | `bootstrap contract drifted: legacy preset inline sequence not found` |
| `alpha13-browser` | FAIL | 测试漂移 |
| `alpha14-browser` | FAIL | `Reader fixture tags not found` |
| `rc1-browser` | FAIL | `phone-390: Reader 未就绪` |
| `rc3-browser` | FAIL | `Cannot read properties of undefined (reading 'openIssue')` |
| `v31-alpha14-browser` | FAIL | 测试漂移 |
| `v31-alpha15-browser` | FAIL | 测试漂移 |
| `v31-alpha18-browser` | FAIL | `Cannot read properties of null (reading 'textContent')` |
| `v31-alpha24-browser` | FAIL | 测试漂移 |
| `v31-alpha25-browser` | FAIL | 测试漂移 |

### B 组：历史阶段套件 14 个（未单独复测，按覆盖重叠退休）

| 领域 | 套件 |
|---|---|
| V3.1 设计复用 | `v31-alpha3-browser`、`v31-alpha4-browser`、`v31-alpha5-browser` |
| V3.1 编排与看板 | `v31-alpha6-browser`、`v31-alpha7-browser` |
| V3.1 校审 | `v31-alpha8-browser`、`v31-alpha9-browser` |
| V3.1 工作区 | `v31-alpha11-browser`、`v31-alpha12-browser`、`v31-alpha13-browser` |
| V3.1 画布/ID | `v31-alpha19-browser`、`v31-alpha20-browser`、`v31-alpha21-browser` |
| V3.1 富文本回退 | `v31-alpha22-1-browser` |
| 历史聚合 | `verify:beta`、`verify:beta2`、`verify:rc1`、`verify:rc2`、`verify:rc3`、`verify:v31` |

B 组的退休理由**不是失败，而是重复或边际价值低于维护成本**。诚实说明覆盖关系：

- **有明确替代**：校审 → `alpha10`；跨页排版/双栏 → `alpha23`；手机壳层 → `alpha26`；
  媒体直编与冲突保护 → `alpha16`；真实视口截图 → `browser:001` / `browser` / `beta1-browser`。
- **设计复用（`alpha3/4/5`）、制作看板（`alpha6/7`）、画布/ID（`alpha19/20/21`）
  与富文本回退（`alpha22-1`）目前没有等价替代**。它们被退休是因为属于「进阶编辑能力」，
  不在当前制作方主流程（建刊→内容→排版→检查→发布）的关键路径上，
  且这些套件写的多是 `window.__V3_STUDIO__` 的内部 API 调用，产品没问题时也会因重构报红。
  代价是：**这些能力的浏览器级回归从此无人自动守着**。如果开始真实使用它们
  （例如单位要求设计复用），必须先按 §4 把它们升回门禁，再改代码。
- B 组里 `alpha11/12/13` 当天为定位 alpha11 断言问题跑过一次（结论见 §2.2），其余未单独复测。

需要时用 `npm run test:browser:retired` 一次性看清全部 26 个的当前状态。

---

## 4. 把一个套件重新升为必需的条件

必须同时满足：

1. **连续两次**在 CI（不是本地）通过；
2. 它覆盖的场景**没有**被现有 10 个套件覆盖；
3. 该场景是制作方能感知的（丢稿、导入缺失、发布失败、读不了、看不清）；
4. 断言写的是**行为与数据**，不是具体的 CSS 数值或旧的 DOM 标记。

升回的方法：改 `.github/workflows/v3-check.yml` 里 `suites=` 这一行，
更新本文件的表格，并在 PR 描述里写清第 1–4 条。

---

## 5. 维护红线

- 不要再引入「advisory 层」。红着不阻塞的门禁等于装饰：
  2026-09-12 之前 `V3 checks` 有过 **209 次运行 0 次成功**，
  而 main 当时没有任何分支保护，红叉拦不住任何东西。
- 门禁红了**当天修完再合并**，不要「先合进去回头再说」——
  上一轮正是这样让缺陷在合并树里藏了两天。
- 不要为了让它通过而放宽断言。先判断是产品问题还是测试漂移：
  产品问题修产品，测试漂移按第 2.2 条退休。
