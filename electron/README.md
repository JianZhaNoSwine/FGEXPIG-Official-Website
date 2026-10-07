# FGEXPIG Electron Desktop

Electron 只作为壳，不内置网站资源。网页和全部资源会从 Cloudflare 的 `desktop-manifest.json` 增量下载到 Electron 的 AppData 目录，再由本地 `127.0.0.1:37655` 静态服务加载。

## 开发运行

```powershell
pnpm install
pnpm run desktop:start
```

默认更新地址为：

```text
https://fgexpig.cc/
```

开发时可通过环境变量切换更新源：

```powershell
$env:FGEXPIG_UPDATE_BASE_URL='http://127.0.0.1:8765/'
pnpm run desktop:start
```

## 生成 Cloudflare 清单

部署网页前执行：

```powershell
pnpm run desktop:manifest
```

会生成根目录 `desktop-manifest.json`，包含网页代码和全部资源的 SHA-256 hash。

## 打包 Windows 安装包

```powershell
pnpm run desktop:dist
```

安装包只包含 Electron shell、更新器和启动页；网站文件位于用户 AppData 缓存目录。