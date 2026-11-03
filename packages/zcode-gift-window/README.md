# @magpie-community/middleware-zcode-gift-window

Two routings for [magpie](https://usemagpie.ai) that follow free allowances and when they run out. Pick one for a provider's accounts or keys, or for a routing group's members, and magpie's gateway tries the seats in the order it gives.

Install it from magpie's **Plugins › Discover**, or with `magpie plugin add @magpie-community/middleware-zcode-gift-window`. From the command line, a group takes one with:

```sh
magpie group set <id> routing=zcode-gift-window/gift-first
magpie group set <id> routing=zcode-gift-window/drain-then-sink
```

## The routings

**`zcode-gift-window/gift-first`** puts the gift seats first, in the order listed, and keeps everyone else in the order listed too. A seat resting after a failure goes last.

The idea: ZCode's gift-only accounts serve a model only while a **gift** — a free activity bucket, the daily token plans that start at 23:00 and end at the next workday's 09:00 — is live. Such an account leaves the model's candidates by itself when the gift ends, and comes back when the next one starts, so **a gift seat needs no clock: its being offered is the window**. All the routing does is try those seats first. When no gift is live, no seat matches and the order is exactly the listed one.

**`zcode-gift-window/drain-then-sink`** keeps the listed order — the list is the priority — but moves a seat whose allowance is **spent** (`used` at or past `cap`) and one **resting** after a failure to the end. Use it when a channel's allowance refills on its own schedule and spending past it draws on a balance that never refills: such an account keeps answering, so plain `order` would never move past it. `cap` is where "spent" starts, 100 by default (99 moves on just before the allowance is gone).

Use either to spend a provider's free allowance before other providers that serve the same model — and to fall back to them, in your listed order, when it is gone.

## Options

```json
{ "prefix": "zcode", "cap": 100 }
```

`prefix` is what a gift seat's key begins with, for `gift-first`. Seat keys of a provider's pool are its accounts' ids (`zcode`, `zcode@someone@example.com`), so the default `zcode` matches every ZCode account and nothing else. An empty prefix matches nothing, and the routing is then the listed order with resting seats last.

`cap` is the share of its allowance past which `drain-then-sink` counts a seat as spent, from 1 to 100 (100 when unset, or when the value isn't a share).

Set them under **Plugins › Installed › Options**, or with `magpie plugin options zcode-gift-window '{"prefix":"zcode","cap":100}'`.

## Test

```sh
bun test packages/zcode-gift-window
bun scripts/check.mjs zcode-gift-window
```

`strategies.json` holds the cases: seats in, the order wanted out. `zcode-gift-window.test.mjs` runs them with `checkStrategies()` from `scripts/middleware.mjs`, and checks that every answer is a permutation of the seats.

## 中文

为 magpie 网关提供的跟随 **ZCode 礼包窗口** 的路由。把 `zcode-gift-window/gift-first` 设给某供应商的账号池或某个分组即可。

**思路**：ZCode 的礼包号只在「礼包」（免费活动桶，比如每天的活动 token：23:00 生效、下一个工作日 09:00 失效）存活时才能供某个模型。礼包一失效，账号自己就从该模型的候选里消失，下一个礼包生效时又回来——**所以礼包席位不需要时钟：它出现本身就是窗口**。本路由唯一做的事：把这类席位排在最前（按列出顺序），其余席位也按列出顺序，失败休息中的排最后。礼包不活时没有任何席位命中，顺序就与列出顺序完全一致。

**`drain-then-sink`（按顺序 + 用完沉底）**：保持你的名单顺序（名单即优先级），但把**额度用尽**的席位（`used ≥ cap`）和**失败休息中**的席位移到最后。用于这种场景：某渠道的额度按天刷新，用超了就会动到不会刷新的永久余额——而它「还能继续响应」，所以单纯的 `按顺序` 永远不会换走它。`cap` 是「算用尽」的百分比，默认 100（设 99 = 快用完就换）。

选项 `prefix`（默认 `"zcode"`）是礼包席位 key 的前缀；设为空串则不提前任何席位。`cap` 是 `drain-then-sink` 判定「用尽」的阈值（1–100，默认 100）。命名带 `zcode-` 前缀，因为它为 ZCode 而写；机制本身是通用的，其他平台同类场景改 `prefix`/`cap` 或平行写 `<平台>-gift-window` 即可。
