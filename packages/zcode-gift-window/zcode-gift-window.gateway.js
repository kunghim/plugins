// Routings for magpie's gateway that follow a provider's gift windows and
// how much of its allowance is spent. magpie offers each as
// zcode-gift-window/<name> in every routing picker while the plugin is on.
//
// A strategy is given the pool's name, its seats and this plugin's options,
// and returns the order to try the seats in, as indexes. Each seat has key,
// account, known, learns, used, soon, pace, weight, resting and tokens. It
// runs in magpie's gateway on moejs: one file, no imports, 20 ms.
//
// The idea of gift-first: some providers' accounts serve a model only while a
// gift (a free activity bucket — ZCode's daily token plans, say) is live. Such
// an account leaves the model's candidates by itself when the gift ends, and
// comes back when the next one starts, so a gift seat needs no clock — its
// being offered is the window. All the strategy does is try those seats first,
// while keeping everyone else in the listed order the picker shows.

// giftOf says whether a seat is a gift seat: its key begins the options'
// prefix, "zcode" when none is set. An empty prefix matches nothing.
function giftOf(options) {
  const p = options && typeof options.prefix === "string" ? options.prefix : "zcode"
  return (s) => p !== "" && typeof s.key === "string" && s.key.startsWith(p)
}

// capOf is the share of its allowance past which a seat counts as spent: the
// options' cap, 100 when none is set. A cap that isn't a share of 1 to 100 is
// 100, so a mistyped one never sinks every seat.
function capOf(options) {
  const c = Number(options && options.cap)
  return Number.isFinite(c) && c > 0 && c <= 100 ? c : 100
}

export const strategies = {
  // Gift seats first, in the order listed; then everyone else, in the order
  // listed. A seat resting after a failure goes last, whichever it is.
  "gift-first"(pool, seats, options) {
    const gift = giftOf(options)
    const tier = (s) => (s.resting ? 2 : gift(s) ? 0 : 1)
    return seats
      .map((_, i) => i)
      .sort((a, b) => tier(seats[a]) - tier(seats[b]) || a - b)
  },

  // The listed order, with a seat whose allowance is spent — and one resting
  // after a failure — moved last. Use it when the list is the priority (a
  // free channel before a paid one) and a spent account must not keep the
  // first place: one still answering from a permanent balance would
  // otherwise never move on. `cap` is where "spent" starts (100 by default).
  "drain-then-sink"(pool, seats, options) {
    const cap = capOf(options)
    const tier = (s) => (s.resting ? 2 : s.known && s.used >= cap ? 1 : 0)
    return seats
      .map((_, i) => i)
      .sort((a, b) => tier(seats[a]) - tier(seats[b]) || a - b)
  },
}
