# 中国人民银行金昌市分行离退休干部电子期刊

离退休干部电子期刊（3D 仿真翻页 H5），支持手机端手势翻页、语音朗读、字号调节、上下期切换、全屏阅读。

## 访问地址

- 第一期：`/1/`
- 第二期：`/2/`

线上正式环境：<https://www.jilv.online/jinchang-magazine/1/> 与 <https://www.jilv.online/jinchang-magazine/2/>

## 目录结构

```text
index.html            期刊入口页
1/                    第一期（index.html + assets）
2/                    第二期（index.html + assets）
assets/               各期独立资源（music 背景音乐、video 视频、tts 逐页朗读音频）
```

## 功能

- PC 端双页 3D 仿真翻页，手机端手指左右拖动翻页
- 🔊 语音朗读：优先播放服务器生成的逐页自然语音（`assets/tts/page-XX.mp3`），缺失时自动使用浏览器语音
- 字号调节：标准 / 较大 / 特大三档，本地记忆，跨期保留
- 上下期切换：底部工具栏一键跳转另一期
- 全屏阅读：手机端系统全屏，内容上下居中
- 背景音乐、目录跳转、链接内容弹窗、页码进度

## 本地预览

建议用静态 HTTP 服务器打开（直接双击 `file://` 时视频/音乐兼容性较差）：

```bash
python -m http.server 8080
```

然后访问 <http://localhost:8080>。

## 部署

将整个文件夹原样上传到站点根目录（例如 `/var/www/jilv.online/jinchang-magazine/`），
并确保 `assets/` 目录属主为 Web 服务用户（如 `www-data`）。
