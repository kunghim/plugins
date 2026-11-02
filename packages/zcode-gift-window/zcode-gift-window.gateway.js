// Routings that follow ZCode's gift windows, for a provider's accounts
// and keys or a group's members. magpie offers each as zcode-gift-window/<name>
// in every routing picker while the plugin is on.
//
// A strategy is given the pool's name, its seats and this plugin's options,
// and returns the order to try the seats in, as indexes. Each seat has key,
// account, known, learns, used, soon, pace, weight, resting and tokens. It
// runs in magpie's gateway on moejs: one file, no imports, 20 ms.
//
// The idea: some providers' accounts serve a model only while a gift (a free
// activity bucket — ZCode's daily token plans, say) is live. Such an account
// leaves the model's candidates by itself when the gift ends, and comes back
// when the next one starts, so a gift seat needs no clock — its being
// offered is the window. All the strategy does is try those seats first,
// while keeping everyone else in the listed order the picker shows.

// giftOf says whether a seat is a gift seat: its key begins the options'
// prefix, "zcode" when none is set. An empty prefix matches nothing.
function giftOf(options) {
  const p = options && typeof options.prefix === "string" ? options.prefix : "zcode"
  return (s) => p !== "" && typeof s.key === "string" && s.key.startsWith(p)
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
}
