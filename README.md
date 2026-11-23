[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/jakwifiid78-png/btc-race-24h-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/jakwifiid78-png/btc-race-24h-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

# SteadyTrend — a safe cbBTC trend bot

Entry for the [make.fun bounty "Race a BTC trading bot live for 24 hours"](https://make.fun/bounty/btc-race-24h-20261123-0511): a program (`main.ts`, Node 22) that reads one JSON line per minute — a 1-minute bar of Coinbase Wrapped BTC (cbBTC) from its Orca Whirlpool on Solana — and answers with buy/sell orders. It starts with $1,000 of paper money; the replay fills orders at the next minute's open, charging a 4 bps fee, 2 bps slippage, plus price impact.

## Strategy: slow trend, rare trades, hard stops

Bitcoin trends for hours at a time, and 1-minute noise is expensive to chase — a full-size round trip costs ~46 bps in fee + slippage + impact. So this bot trades rarely and only on a confirmed slow trend:

- **BUY 100% of cash** when the 24-bar EMA rises 0.50% above the 96-bar EMA.
- **SELL everything** when the 24-bar EMA falls 0.50% below the 96-bar EMA, or when the close drops 3% below the entry close (hard stop).
- The 0.50% hysteresis band keeps it out of sideways chop. No leverage, no shorts, at most one open position. Fully deterministic: a pure function of the bars seen — no clock, no randomness, no network.

## Verified on the frozen dev window

Replayed locally with the exact fill model from the kit (4 bps fee, 2 bps slippage, constant-product impact against each bar's open depth):

| Scenario | Net PnL | Trades | Max drawdown |
|---|---|---|---|
| Dev window (rising) | **+$18.58** | 2 | 1.98% |
| Reversed window (falling) | $0.00 | 0 | 0.00% |
| Sideways window | $0.00 | 0 | 0.00% |
| −8% crash injected | −$17.34 | 4 | 4.37% |

The dev result passes the gate (net PnL > $0). In a falling or sideways market the bot simply stays in cash instead of bleeding fees, and even in a crash its drawdown stays far under the 25% limit (buy-and-hold loses −$50.46 in the same crash).

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only)
- `vendor/makefun-bars.ts` — the kit's `agent-fun/bars-replay/v1` shim, copied byte-for-byte
- `LICENSE` — MIT

## Run it

Grade it on the kit's dev window with the kit CLI:

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot <this repository> --driver docker
```
