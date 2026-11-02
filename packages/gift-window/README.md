# @magpie-community/middleware-gift-window

A routing for [magpie](https://usemagpie.ai) that follows a provider's gift windows. Pick it for a provider's accounts or keys, or for a routing group's members, and magpie's gateway tries the seats in the order `gift-window/gift-first` gives.

Install it from magpie's **Plugins › Discover**, or with `magpie plugin add @magpie-community/middleware-gift-window`. From the command line, a group takes it with:

```sh
magpie group set <id> routing=gift-window/gift-first
```

## The routing

**`gift-window/gift-first`** puts the gift seats first, in the order listed, and keeps everyone else in the order listed too. A seat resting after a failure goes last.

The idea: some providers' accounts serve a model only while a **gift** — a free activity bucket, say ZCode's daily token plans that start at 23:00 and end at the next workday's 09:00 — is live. Such an account leaves the model's candidates by itself when the gift ends, and comes back when the next one starts, so **a gift seat needs no clock: its being offered is the window**. All the routing does is try those seats first. When no gift is live, no seat matches and the order is exactly the listed one.

Use it to spend a provider's free activity tokens before its own plan or before other providers that serve the same model — and to fall back to them, in your listed order, when the gift is gone.

## Options

```json
{ "prefix": "zcode" }
```

`prefix` is what a gift seat's key begins with. Seat keys of a provider's pool are its accounts' ids (`zcode`, `zcode@someone@example.com`), so the default `zcode` matches every ZCode account and nothing else. Set it under **Plugins › Installed › Options**, or with `magpie plugin options gift-window '{"prefix":"minimax"}'`. An empty prefix matches nothing, and the routing is then the listed order with resting seats last.

## Test

```sh
bun test packages/gift-window
bun scripts/check.mjs gift-window
```

`strategies.json` holds the cases: seats in, the order wanted out. `gift-window.test.mjs` runs them with `checkStrategies()` from `scripts/middleware.mjs`, and checks that every answer is a permutation of the seats.

## 中文

为 magpie 网关提供的跟随「礼包窗口」的路由。把 `gift-window/gift-first` 设给某供应商的账号池或某个分组即可。

**思路**：有的平台账号只在「礼包」（免费活动桶，比如 ZCode 每天的活动 token：23:00 生效、下一个工作日 09:00 失效）存活时才能供某个模型。礼包一失效，账号自己就从该模型的候选里消失，下一个礼包生效时又回来——**所以礼包席位不需要时钟：它出现本身就是窗口**。本路由唯一做的事：把这类席位排在最前（按列出顺序），其余席位也按列出顺序，失败休息中的排最后。礼包不活时没有任何席位命中，顺序就与列出顺序完全一致。

选项 `prefix`（默认 `"zcode"`）是礼包席位 key 的前缀；设为空串则不提前任何席位。用它实现「礼包 token 优先消耗、没了按你的列表顺序回退到其他渠道」。
