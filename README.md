# 黄果播放器

竖屏短剧播放器，支持推荐、热播、上新、滑动切剧、搜索、选集、分享和本机收藏。GitHub Pages 提供界面，浏览器直接请求黄果源的公开接口，不需要 ChatGPT 账号。网页和 IPA 都提示成人内容，确认后才加载片库。

在支持 hls.js 的浏览器中，可以过滤点播 HLS 清单中明确标记的广告。回退到系统 HLS 播放时，播放继续，广告标记过滤停用。剪进视频中的广告没有可供过滤的清单标记。

[下载 iPhone 安装包](downloads/Huangguo-1.0.3-unsigned.ipa)，支持 arm64 和 iOS 15 以上系统。IPA 为未签名构建，安装前需用适用的 Apple 签名和描述文件签名。它打开本仓库的 GitHub Pages 播放器，播放需要互联网连接。

## 构建 IPA

在安装了 Xcode 的 Mac 上，用部署后的 Pages URL 构建：

```sh
python3 ios/Tools/package.py --player-url https://OWNER.github.io/REPOSITORY/
```

在 Linux 上可用同一脚本，传入 `--clang` 和 `--linker` 指定 Clang 和 ld64.lld。输出在 `ios/dist/`。如需更改 Bundle ID，先编辑 `ios/Resources/Info.plist`，再根据新的 Bundle ID 签名。
