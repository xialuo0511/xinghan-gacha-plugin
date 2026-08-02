# xinghan-gacha-plugin

面向 TRSS-Yunzai、Miao-Yunzai 和 Yunzai-Bot v3 的米哈游三游戏抽卡记录插件。目前完成开发规划的里程碑 0–5：

- TRSS-Yunzai ESM 插件入口与私聊命令；
- 原神、星穹铁道、绝区零的静态协议/池类型注册表；
- 严格白名单抽卡 URL 解析与可信端点重建；
- URL、Cookie、token、ticket 等敏感信息脱敏；
- 国服米游社 App 二维码登录、Redis 会话互斥及三游戏角色发现；
- AES-256-GCM 凭据存储；未提供主密钥时仅保存在当前进程内存；
- 原神 `100/200/301/302/500` 五池 authkey 拉取、分页、退避和增量存储；
- 星铁 `1/2/11/12/21/22` 六池同步，联动池独立路由和可信旧路径回退；
- 绝区零 `1/2/3/5/102/103` 六池同步及长短池类型映射；
- 三游戏可信抽卡 URL 手动导入，支持国服和国际服白名单端点；
- UIGF v4.1 三游戏导出、UIGF v4.x 导入及旧版 UIGF/SRGF 迁移；
- 按机器人用户、游戏和 UID 隔离的记录存储及重复导入去重；
- 不依赖 Yunzai 全局对象的单元测试和契约测试。

阶段 6 的自动烟雾工具与验收矩阵已经提供，但**尚未完成真实账号验收**。接口均为非官方接口，可能随时变化；二维码、DS 和客户端 profile 来自 2026-05-31 的公开实现快照，首次使用前仍应以专门测试账号烟雾验证。国际服当前仅支持可信抽卡 URL 导入，不支持使用国服米游社凭据生成 authkey。

## 安装到 TRSS-Yunzai

将仓库放在 TRSS-Yunzai 的 `plugins/xinghan-gacha-plugin`：

```bash
git clone https://github.com/xialuo0511/xinghan-gacha-plugin.git plugins/xinghan-gacha-plugin
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
#星瀚抽卡帮助
#扫码登录
#取消扫码登录
#我的游戏角色
#选择原神 123456789
#选择星铁 100000001
#选择绝区零 10000002
#更新原神抽卡记录
#更新星铁抽卡记录
#更新绝区零抽卡记录
#更新全部抽卡记录
#导入原神抽卡URL 123456789 https://...
#导入星铁抽卡URL 100000001 https://...
#导入绝区零抽卡URL 10000002 https://...
#导出抽卡记录
#导入抽卡记录 {UIGF JSON}
#抽卡插件状态
#删除米游社授权
#删除米游社授权 确认
```

发送 `#星瀚抽卡帮助` 可查看全部命令和首次使用指引。账号、角色、导入、导出及同步命令均限制为私聊。URL 导入时，如果已经选中对应游戏角色，可省略 UID。完整授权 URL 只在当前调用内存中使用，不写入记录文件或 authkey 缓存。`#更新全部抽卡记录` 会串行同步三款游戏并在游戏间加入抖动，降低触发频控的概率。

[UIGF](https://uigf.org/zh/standards/uigf.html) 导出文件不含登录凭据。导入前必须已有同游戏、同 UID 的授权角色或记录，插件不会根据 UID 猜测区服；重复导入会按记录 ID 去重。核心实现不依赖喵崽插件，三个 Yunzai 分支的真实文件发送兼容性仍须按[阶段 6 验收清单](docs/live-acceptance.md)逐一验证。

本插件按当前 TRSS-Yunzai 的运行要求声明 Node.js `>=23.11.0`。

## 开发验证

```bash
pnpm lint
pnpm test
pnpm check
pnpm smoke:live -- --help
```

`pnpm check` 不访问网络，也不使用真实账号、Cookie、authkey 或二维码 ticket。真实链接测试只应按[阶段 6 验收清单](docs/live-acceptance.md)在专用测试账号上运行。

## 安全边界

- 只接受注册表中精确匹配的 HTTPS host 与路径；不接受相似子域、URL 用户名/密码或任意用户端点。
- URL 仅用于解析参数，后续请求 URL 必须从本地可信端点表重建。
- 完整授权 URL、Cookie、stoken、authkey 和 ticket 不得进入日志或异常文本。
- 扫码登录强制私聊；同一用户同时只能存在一个 Redis 二维码会话，超时、取消和错误都会清理。
- 凭据保存到 `data/credentials`，且只允许 AES-256-GCM 密文；抽卡记录按机器人用户隔离保存到 `data/records`，不含凭据或完整授权 URL。
- `src/` 核心模块不得依赖 `Bot`、`redis`、`logger`、`segment` 等 Yunzai 全局对象；平台耦合只放在 `apps/` 与 `src/adapters/yunzai/`。

## 目录

```text
apps/                       TRSS-Yunzai 命令入口
src/adapters/yunzai/        平台适配元数据
src/games/                  三游戏定义与适配器
src/gacha/                  安全 URL 解析/重建与三游戏同步
src/export/                 UIGF v4.1 导入导出与旧格式解析
src/auth/                   扫码、角色、authkey 与短期缓存
src/storage/                加密凭据和增量记录文件
src/protocol/               端点、协议 profile、脱敏
test/unit/                  纯单元测试
test/contract/              注册表与安全契约测试
test/integration/           跨模块状态机和同步测试
docs/                       真实账号验收清单
```
