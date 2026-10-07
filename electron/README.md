# FGEXPIG Electron Desktop

Electron 只作为壳，不内置网站资源。启动时先同步1级缓存，完成后立即进入页面，再在后台继续同步2级和3级缓存。
网页和全部资源会从 Cloudflare 的 `desktop-manifest.json` 增量下载到 Electron 的 AppData 目录，再由本地 `127.0.0.1:37655` 静态服务加载。

该目录是独立 Node/Electron 项目，Cloudflare 静态部署不会安装这里的 Electron 依赖。

## 开发运行

```powershell
cd electron
pnpm install
pnpm start
```

默认更新地址为 `https://fgexpig.cc/`。开发时可通过环境变量切换：

```powershell
$env:FGEXPIG_UPDATE_BASE_URL='http://127.0.0.1:8765/'
pnpm start
```

## 生成 Cloudflare 清单

在项目根目录执行：

```powershell
node tools/build-desktop-manifest.js
```

或：

```powershell
cd electron
pnpm run manifest
```

会生成根目录 `desktop-manifest.json`，包含网页代码和全部资源的 SHA-256 hash。

## 打包 Windows 安装包

```powershell
cd electron
pnpm run dist
```

安装包输出到项目根目录 `desktop-dist/`，只包含 Electron shell、更新器和启动页；网站文件位于用户 AppData 缓存目录。

## 运行时识别

Electron preload 会注入：

```js
window.FGEXPIG_DESKTOP = { isDesktop: true, runtime: 'exe' };
```

网页中可以这样判断：

```js
if (window.FGEXPIG_DESKTOP && window.FGEXPIG_DESKTOP.isDesktop) {
  // exe 桌面端逻辑
} else {
  // 普通网页逻辑
}
```

## 桌面分辨率

桌面端固定使用5档资源。窗口不可手动拖拽改变大小，只能通过设置页左右箭头切换分辨率。可选分辨率会按当前显示器上限过滤。
