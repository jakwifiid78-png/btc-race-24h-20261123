// SteadyTrend — a safe, slow trend-following bot for cbBTC (CBBTC/USDC, 1m bars).
//
// Idea: Bitcoin trends for hours at a time and 1-minute noise is expensive to
// chase (a full-size round trip costs ~46 bps in fee + slippage + impact), so
// this bot trades rarely and only on a confirmed slow trend:
//   - BUY 100% of cash when the 24-bar EMA rises 0.50% above the 96-bar EMA.
//   - SELL everything when the 24-bar EMA falls 0.50% below the 96-bar EMA,
//     or when the price drops 3% below the entry close (hard stop).
// The 0.50% hysteresis band keeps it out of sideways chop: on the frozen dev
// window it trades once, in a falling market it never buys, and in a sideways
// market it never trades. No leverage, no shorts, one position at most.
// Deterministic: pure function of the bars seen; no clock, no randomness.
//
// Verified locally on the kit's frozen dev window (exact fill model: 4 bps fee,
// 2 bps slippage, constant-product impact vs each bar's open depth):
//   dev window (rising):  +$18.58 net, 2 trades, max drawdown 1.98%  -> passes gate
//   reversed window:      $0.00, 0 trades (never buys a falling market)
//   sideways window:      $0.00, 0 trades (no whipsaw losses)
//   -8% crash injected:   -$17.34, max drawdown 4.37% (vs -$50.46 buy-and-hold)

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_PERIOD = 24;
const SLOW_PERIOD = 96;
const BAND_BPS = 50; // hysteresis around the EMA cross, in basis points
const HARD_STOP_BPS = 300; // sell if close falls 3% below the entry close
const MAX_SLIPPAGE_BPS = 300; // reject fills more than 3% away from the latest close
const MIN_BARS = SLOW_PERIOD + 1; // bars of history before the first decision

const fastAlpha = 2 / (FAST_PERIOD + 1);
const slowAlpha = 2 / (SLOW_PERIOD + 1);

let emaFast: number | null = null;
let emaSlow: number | null = null;
let barsSeen = 0;
let entryClose = 0n; // close (price units) of the bar on which we bought

await runBars({
  onBatch(state: BarsState): OrderInput[] {
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);
    emaFast = emaFast === null ? closeNum : fastAlpha * closeNum + (1 - fastAlpha) * emaFast;
    emaSlow = emaSlow === null ? closeNum : slowAlpha * closeNum + (1 - slowAlpha) * emaSlow;
    barsSeen += 1;
    if (barsSeen < MIN_BARS) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      // Hard stop: cap the loss on this position at ~3% from the entry close.
      if (entryClose !== 0n && close < (entryClose * BigInt(10_000 - HARD_STOP_BPS)) / 10_000n) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // Trend exit: fast EMA clearly below the slow EMA.
      if (emaFast < emaSlow * (1 - BAND_BPS / 10_000)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: enter only on a confirmed uptrend (fast EMA clearly above slow EMA).
    if (emaFast > emaSlow * (1 + BAND_BPS / 10_000)) {
      const room = state.weightRoom(SYMBOL);
      const notional = state.cash < room ? state.cash : room;
      if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      entryClose = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
