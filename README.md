# xinghan-gacha-plugin

面向 TRSS-Yunzai 的米哈游三游戏抽卡记录插件。目前完成开发规划的里程碑 0、1、2：

- TRSS-Yunzai ESM 插件入口与私聊命令；
- 原神、星穹铁道、绝区零的静态协议/池类型注册表；
- 严格白名单抽卡 URL 解析与可信端点重建；
- URL、Cookie、token、ticket 等敏感信息脱敏；
- 国服米游社 App 二维码登录、Redis 会话互斥及三游戏角色发现；
- AES-256-GCM 凭据存储；未提供主密钥时仅保存在当前进程内存；
- 原神 `100/200/301/302/500` 五池 authkey 拉取、分页、退避和增量存储；
- 原神可信抽卡 URL 手动导入；
- 不依赖 Yunzai 全局对象的单元测试和契约测试。

当前版本**尚未实现**星铁/绝区零抽卡同步、UIGF 导出、旧数据迁移及真实账号验收。接口均为非官方接口，可能随时变化；二维码、DS 和客户端 profile 来自 2026-05-31 的公开实现快照，首次使用前仍应以专门测试账号烟雾验证。

## 安装到 TRSS-Yunzai

将仓库放在 TRSS-Yunzai 的 `plugins/xinghan-gacha-plugin`：

```bash
git clone <repository-url> plugins/xinghan-gacha-plugin
cd plugins/xinghan-gacha-plugin
pnpm install
pnpm check
```

建议在启动 TRSS-Yunzai 前设置 32 字节主密钥，否则扫码凭据不会落盘：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

将输出设置为环境变量 `HOYO_GACHA_MASTER_KEY`。也支持 64 位十六进制密钥。请使用密码管理器保存；密钥丢失后无法解密既有授权文件。

重启 TRSS-Yunzai 后，可发送：

```text
#扫码登录
#取消扫码登录
#我的游戏角色
#选择原神 123456789
#选择星铁 100000001
#选择绝区零 10000002
#更新原神抽卡记录
#导入原神抽卡URL 123456789 https://...
#删除米游社授权
#删除米游社授权 确认
```

上述账号、角色、导入及同步命令均限制为私聊。URL 导入时，如果已经选中原神角色，可省略 UID。完整授权 URL 只在当前调用内存中使用，不写入记录文件或 authkey 缓存。

本插件按当前 TRSS-Yunzai 的运行要求声明 Node.js `>=23.11.0`。

## 开发验证

```bash
pnpm lint
pnpm test
pnpm check
```

测试不访问网络，也不使用真实账号、Cookie、authkey 或二维码 ticket。

## 安全边界

- 只接受注册表中精确匹配的 HTTPS host 与路径；不接受相似子域、URL 用户名/密码或任意用户端点。
- URL 仅用于解析参数，后续请求 URL 必须从本地可信端点表重建。
- 完整授权 URL、Cookie、stoken、authkey 和 ticket 不得进入日志或异常文本。
- 扫码登录强制私聊；同一用户同时只能存在一个 Redis 二维码会话，超时、取消和错误都会清理。
- 凭据保存到 `data/credentials`，且只允许 AES-256-GCM 密文；抽卡记录保存到 `data/records`，不含凭据或完整授权 URL。
- `src/` 核心模块不得依赖 `Bot`、`redis`、`logger`、`segment` 等 Yunzai 全局对象；平台耦合只放在 `apps/` 与 `src/adapters/yunzai/`。

## 目录

```text
apps/                       TRSS-Yunzai 命令入口
src/adapters/yunzai/        平台适配元数据
src/games/                  三游戏定义与适配器
src/gacha/                  安全 URL 解析/重建
src/auth/                   扫码、角色、authkey 与短期缓存
src/storage/                加密凭据和增量记录文件
src/protocol/               端点、协议 profile、脱敏
test/unit/                  纯单元测试
test/contract/              注册表与安全契约测试
test/integration/           跨模块状态机和同步测试
```
