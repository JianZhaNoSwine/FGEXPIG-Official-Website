# FGEXPIG Electron Desktop

Electron 只作为壳，不内置网站资源。网页和全部资源会从 Cloudflare 的 `desktop-manifest.json` 增量下载到 Electron 的 AppData 目录，再由本地 `127.0.0.1:37655` 静态服务加载。

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