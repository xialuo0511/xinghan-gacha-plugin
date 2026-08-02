# 阶段 6：真实账号验收

阶段 6 不能仅凭离线测试判定通过。本文档用于在专用测试账号和临时抽卡链接下执行验收；不得把真实 URL、authkey、Cookie、stoken 或二维码 ticket 写入仓库、Issue、日志或聊天记录。

## 自动烟雾工具

先用临时进程环境变量注入一至三个游戏的抽卡 URL 与 UID：

```powershell
$env:XINGHAN_SMOKE_GENSHIN_URL = "<temporary-url>"
$env:XINGHAN_SMOKE_GENSHIN_UID = "<uid>"
$env:XINGHAN_SMOKE_STARRAIL_URL = "<temporary-url>"
$env:XINGHAN_SMOKE_STARRAIL_UID = "<uid>"
$env:XINGHAN_SMOKE_ZZZ_URL = "<temporary-url>"
$env:XINGHAN_SMOKE_ZZZ_UID = "<uid>"
pnpm smoke:live
```

工具只输出游戏、脱敏 UID、区服市场、记录数、分页停止原因和错误代码；数据写入操作系统临时目录并在结束时删除。运行结束后关闭终端，或用 `Remove-Item Env:XINGHAN_SMOKE_*` 清除变量。不要把命令历史连同真实值上传。

## 验收矩阵

每项应记录测试日期、插件提交、测试账号类别、结果和脱敏错误代码；不得记录凭据。

- [ ] 原神国服官服：扫码登录、角色发现、五池首次同步、再次同步零新增。
- [ ] 原神 B 服：角色发现、选择和抽卡同步。
- [ ] 原神国际服：可信 URL 导入、五池分页、过期链接提示。
- [ ] 星铁国服官服：六池同步，含 `21/22` 联动池独立路由。
- [ ] 星铁渠道服：角色发现、选择和抽卡同步。
- [ ] 星铁国际服：可信 URL 导入、六池分页及旧路径回退。
- [ ] 绝区零国服：六个内部池型同步，`102/103` 导出时兼容映射。
- [ ] 绝区零国际服：可信 URL 导入及 nap/common 可信端点回退。
- [ ] 空池：正常完成，不误报失败，不产生伪记录。
- [ ] 多账号、多游戏、多 UID：同一机器人用户可导出；不同机器人用户互不可见。
- [ ] UIGF：三游戏导出可由兼容工具读取；重复导入零新增；文件不含任何凭据。
- [ ] 旧数据：UIGF v2/v3 与 SRGF v1 分别导入；未知 UID 在落盘前拒绝。
- [ ] 授权过期：扫码会话过期、authkey 过期均给出安全提示，异常不泄密。
- [ ] 频率限制：退避生效，不无限重试，不把限流误判为端点回退。
- [ ] TRSS-Yunzai、Miao-Yunzai、Yunzai-Bot v3：加载命令、私聊限制、文件发送逐一验证。

## 放行条件

`pnpm check`、安全扫描和打包检查全部通过，并且以上与目标发布范围有关的真实场景均有当次提交的验收记录后，才能将阶段 6 标记为完成。在此之前，状态命令必须显示“实测待验收”。
