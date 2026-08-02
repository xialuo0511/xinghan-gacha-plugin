# xinghan-gacha-plugin

面向 TRSS-Yunzai、Miao-Yunzai 和 Yunzai-Bot v3 的米哈游三游戏抽卡记录插件。目前完成开发规划的里程碑 0–6：

- TRSS-Yunzai ESM 插件入口与私聊命令；
- 原神、星穹铁道、绝区零的静态协议/池类型注册表；
- 严格白名单抽卡 URL 解析与可信端点重建；
- URL、Cookie、token、ticket 等敏感信息脱敏；
- 国服米游社 App 二维码登录、Redis 会话互斥及三游戏角色发现；
- AES-256-GCM 凭据存储；未提供主密钥时仅保存在当前进程内存；
- 原神 `100/200/301/302/500` 五池 authkey 拉取、分页、退避和增量存储；
- 星铁通过游戏内抽卡 URL 同步 `1/2/11/12/21/22` 六池，联动池使用独立路由；
- 绝区零 `1/2/3/5/102/103` 六池同步及长短池类型映射；
- 三游戏可信抽卡 URL 手动导入，支持国服和国际服白名单端点；
- UIGF v4.1 三游戏导出、UIGF v4.x 导入及旧版 UIGF/SRGF 迁移；
- 按机器人用户、游戏和 UID 隔离的记录存储及重复导入去重；
- 三套游戏主题 HTML 记录页、Puppeteer 截图、卡池垫抽、欧非配色及限定角色 UP/歪标记；
- 不依赖 Yunzai 全局对象的单元测试和契约测试。

阶段 6 功能、自动烟雾工具与验收矩阵已经提供，但**尚未完成真实账号验收**。接口均为非官方接口，可能随时变化；二维码、DS 和客户端 profile 来自 2026-05-31 的公开实现快照，首次使用前仍应以专门测试账号烟雾验证。国际服当前仅支持可信抽卡 URL 导入，不支持使用国服米游社凭据生成 authkey。

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

将输出设置为环境变量 `HOYO_GACHA_MASTER_KEY`。也支持 64 位十六进制密钥。

### 设置主密钥环境变量

必须在**启动 TRSS-Yunzai 的同一用户环境中**设置变量，然后重启 TRSS-Yunzai。不要把真实密钥提交到仓库、粘贴到群聊或写进公开日志。

#### Windows PowerShell：仅当前窗口生效

下面的命令会直接生成密钥并放入当前 PowerShell，不会在终端中打印密钥：

```powershell
$env:HOYO_GACHA_MASTER_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

随后必须从这个 PowerShell 窗口启动 TRSS-Yunzai。关闭窗口后变量会失效。

如果已经复制了前面命令生成的密钥，也可以手动设置：

```powershell
$env:HOYO_GACHA_MASTER_KEY = "<刚才生成的密钥>"
```

#### Windows PowerShell：当前用户永久生效

```powershell
$key = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
[Environment]::SetEnvironmentVariable("HOYO_GACHA_MASTER_KEY", $key, "User")
$env:HOYO_GACHA_MASTER_KEY = $key
Remove-Variable key
```

设置后请完全关闭并重新打开终端，再重启 TRSS-Yunzai。通过计划任务、面板或服务启动机器人时，还要确认它使用的是设置该变量的同一个 Windows 用户。

#### Linux / macOS：仅当前终端生效

```bash
export HOYO_GACHA_MASTER_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
```

然后从同一终端启动 TRSS-Yunzai。使用 systemd、Docker 或服务器面板时，应在对应服务或容器的环境变量配置中设置 `HOYO_GACHA_MASTER_KEY`，仅在 SSH 终端执行 `export` 不会自动传给已经运行的服务。

#### 验证是否设置成功

验证时只检查变量是否存在和长度，不要输出完整密钥。

Windows PowerShell：

```powershell
if ($env:HOYO_GACHA_MASTER_KEY) { "已设置，长度：$($env:HOYO_GACHA_MASTER_KEY.Length)" } else { "未设置" }
```

Linux / macOS：

```bash
test -n "$HOYO_GACHA_MASTER_KEY" && echo "已设置，长度：${#HOYO_GACHA_MASTER_KEY}" || echo "未设置"
```

请使用密码管理器保存密钥。密钥丢失或被替换后，插件将无法解密 `data/credentials` 中已有的授权文件；不要在已有凭据仍需使用时重新生成密钥。

重启 TRSS-Yunzai 后，可发送：

```text
#星瀚抽卡帮助
#星瀚抽卡更新
#星瀚抽卡更新日志
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
#抽卡记录-查看原神抽卡记录
*抽卡记录-查看HSR的
%抽卡记录-查看ZZZ的
#查看原神抽卡记录
#查看星铁抽卡记录
#查看绝区零抽卡记录
#导入原神抽卡URL 123456789 https://...
#导入星铁抽卡URL 100000001 https://...
#导入绝区零抽卡URL 10000002 https://...
#导出抽卡记录
#导入抽卡记录 {UIGF JSON}
#抽卡插件状态
#删除米游社授权
#删除米游社授权 确认
```

发送 `#星瀚抽卡帮助` 可查看全部命令和首次使用指引。账号、角色、导入、导出、同步及记录图命令均限制为私聊。URL 导入时，如果已经选中对应游戏角色，可省略 UID。完整授权 URL 只在当前调用内存中使用，不写入记录文件或 authkey 缓存。同步开始时会立即回复，并在每个卡池完成后报告进度；分页基础间隔为 300 ms 并带小幅随机抖动。`#更新全部抽卡记录` 会串行处理三款游戏并在游戏间加入额外抖动，降低触发频控的概率。

星铁的游戏内跃迁 authkey 与米游社 `genAuthKey` 返回的 Auth Key B 并不等价，后者会被跃迁接口判定为 `authkey error`。因此 `#更新星铁抽卡记录` 和“更新全部”中的星铁步骤会直接给出导入提示，不再重复生成无效凭据；请在私聊中使用 `#导入星铁抽卡URL [UID] URL`。这是星铁当前可靠的同步入口，不影响已导入记录的保存和图片查看。

记录查看推荐使用 `#查看原神抽卡记录`、`#查看星铁抽卡记录`、`#查看绝区零抽卡记录`，以避免部分 TRSS 消息适配器吞掉 `*` 或 `%` 前缀；原来的差异化前缀命令继续兼容。记录图由 TRSS-Yunzai 的 Puppeteer 渲染器生成；欧非评价只依据本地记录内的高稀有出货区间。限定角色池的 UP/歪标记优先读取记录自带标记，否则用内置常驻角色名单排除判断；缺少名称时显示“待确认”，不冒充确定结果。

`#星瀚抽卡更新` 和 `#星瀚抽卡更新日志` 仅允许机器人主人使用。更新命令只接受 `https://github.com/xialuo0511/xinghan-gacha-plugin.git`，要求插件工作区没有本地改动，并使用 `git pull --ff-only` 拉取当前分支；它不会强制覆盖、暂存或删除本地文件，也不会自动执行依赖安装或重启。更新成功后会显示新提交日志；若依赖清单变化，将提示管理员执行 `pnpm install`，随后重启 TRSS-Yunzai。

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
src/view/                   记录统计、垫抽、欧非与 UP/歪视图模型
src/protocol/               端点、协议 profile、脱敏
src/update/                 主人专用安全更新与 Git 提交日志
resources/records/          原神、星铁、绝区零 HTML/CSS/JS 记录页
test/unit/                  纯单元测试
test/contract/              注册表与安全契约测试
test/integration/           跨模块状态机和同步测试
docs/                       真实账号验收清单
```
