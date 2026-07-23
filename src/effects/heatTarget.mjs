/**
 * Heat/Scratch coexistence policy (Stage D). The Heat FX target amount is dry (0)
 * unless Home Heat is enabled, music is running, AND a scratch is NOT currently
 * suppressing it — then it is the clamped scroll-derived heat. This keeps the two
 * features independent: a scratch suppresses the Heat FX output to dry (so reverb/
 * delay tails never smear the scratch) WITHOUT changing the scroll-derived heat value,
 * which is restored the moment the scratch ends. Pure + framework-free so the policy
 * is deterministically unit-tested; audioReactive ramps toward this target smoothly.
 *
 * @param {boolean} enabled   Home Heat gate (mounted + on).
 * @param {boolean} suppressed A scratch is active → duck Heat to dry.
 * @param {boolean} running    Music is actually playing.
 * @param {number}  rawHeat    Scroll-derived heat (telemetry.heat), 0..1.
 * @returns {number} target heat 0..1 (0 = fully dry).
 */
export function heatTarget(enabled, suppressed, running, rawHeat) {
  if (!enabled || suppressed || !running) return 0;
  return rawHeat < 0 ? 0 : rawHeat > 1 ? 1 : rawHeat;
}
