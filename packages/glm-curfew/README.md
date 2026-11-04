# @magpie-community/page-glm-curfew

按 **ZCode 礼包的真实生效状态** 自动切换 magpie 路由分组的 routing：礼包生效才切、过期自动恢复、没发礼包绝不碰配置。一切住在 magpie 进程内（page 型插件），无外部定时任务。

## 语义（设计核心）

| 时点 | 平台字段 | 插件动作 |
|---|---|---|
| 领取（到账） | `starts_at`（如 19:04） | **不切**——配置纹丝不动 |
| 生效 | `effective_at`（通常 23:00） | **此刻才切**到礼包模式（边沿触发，仅一次） |
| 失效 | `ends_at`（次工作日 09:00） | 恢复切换前记录的各组 routing |
| 平台没发 | 无 entitlement | 全天不碰配置 |

- **判定条件**：`grant_units ≥ 1e8 && effective_at ≤ now < ends_at`（读 ZCode 余额接口的 `plans[].entitlements[]`；生效前 `balances` 为空，所以不能拿 balances 判断）
- **边沿触发**：只在「无 → 有」跳变瞬间动作一次；生效期间不反复改写（白天你可以随意改 routing，不会被覆盖）；恢复的是**切换前记录的值**
- **观测失败不动手**：所有账号查询都失败时维持现状（防网络抖动导致误恢复）

## 安装与配置

```sh
magpie plugin add @magpie-community/page-glm-curfew
```

Options：

```json
{ "port": 3493, "groups": ["auto-glm-5-3-flash", "auto-glm-5-3"], "giftRouting": "zcode-gift-window/gift-first" }
```

- `groups`：要托管的分组 id 列表
- `giftRouting`：礼包模式的 routing 值（默认即本仓库的 `zcode-gift-window/gift-first`）
- 改完重启插件宿主生效

## 管理页

magpie 窗口里的 **GLM Curfew** 页：当前判定状态、生效中的礼包明细、上次动作、状态文件内容、最近日志；**暂停 / 恢复 / 立即判定一次** 三个按钮。服务 API：`GET /status`、`POST /pause`、`POST /resume`、`POST /tick`。

## 状态与依赖

- 状态文件：`<magpie 配置目录>/glm-curfew/state.json`（原子写；mode、各分组原值、上次动作）
- 改分组走 magpie CLI（`magpie group set <id> routing=…`）；读当前值走 `providers.json`
- 读 ZCode 状态用 magpie 已保存的各账号凭据（`plugin-auth.json` 里 zcode 的 oauth 条目）；凭据值不落日志

## Test

```sh
bun test packages/glm-curfew
bun scripts/check.mjs
```

测试用注入假件，不碰网络与生产实例（`core.mjs` 纯逻辑 / `deps.mjs` 文件与凭据 / 假件测边沿、恢复、暂停语义）。

## 风险与已知边界

- 判定每 5 分钟一次：生效瞬间最多 5 分钟滞后
- magpie CLI 从插件进程 spawn 的行为、端口 3493 冲突、真实 ZCode 接口频控，均待真实环境验证
- 插件改的是 routing 字段，不碰分组成员名单
