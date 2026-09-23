# Scoring engine

`game_api.engine.simulate(*, decisions)` is Django's default simulation provider.
It reads the configured catalog through `game_api.services.get_catalog`, rejects
invalid plans with `SimulationRejected`, and returns a plain JSON result. Browser
scores, prices, and result fields are never accepted as simulation input.

## Plan rules

For the included catalog, a plan must contain exactly five unique measure IDs,
with at most two measures per direction, and total cost at most 100 budget units.
District measures require a known district; city measures require `district_id:
null`. A measure cannot be repeated in another district. Global conflicts apply
anywhere in the city; same-district conflicts apply only when both measures target
the same district. These limits and conflict pairs come from the catalog.

## Calculation

1. Start with each district's ten initial indicator values.
2. Multiply each selected measure's full effects by `(8 - lag) / 8`. The horizon
   comes from `rules.horizon_quarters`; the supplied catalog uses eight quarters.
   Apply district measures to their selected district and city measures to every
   district. Negative effects are retained.
3. Apply each matching synergy once, to the district targeted by its
   `district_from` measure.
4. Sum all contributions, then clamp each indicator to the range 0–100.
5. Average the ten indicators equally to obtain each district's score. Calculate
   the population-weighted mean of those district scores and their minimum.
6. Count district/indicator pairs strictly below 40 (the catalog threshold).
7. Calculate `0.7 * weighted_average + 0.3 * min_district_score - critical_count`.
   Unspent budget gives no bonus. The final score itself is not clamped.

The initial catalog score is **52.6151**, with two critical indicators. For example,
M1 in Есиль, M2 citywide, M8 in Нура, M10 in Сарыарка, and M12 citywide costs 86
and produces **55.388025**, including the M1/M2 and M10/M12 synergies.

## Explicit assumptions

The catalog states the overall score formula and measure lag formula but leaves
some details implicit. This implementation uses an equal arithmetic mean for the
ten indicators in a district, bounds indicator values after summing all effects,
and treats listed synergy effects as final-horizon bonuses with no additional
lag adjustment. A critical indicator is counted separately in each district.
These choices are covered by engine tests and can be adjusted if the official
rules specify another interpretation. Selection order does not affect the score.

Catalog population shares must sum to one; only floating-point rounding error is
normalized. Missing, unknown, or non-finite numerical metadata is rejected rather
than replaced with invented game values. Alternate providers can be selected with
`GAME_SIMULATION_PROVIDER`; a blank value selects this built-in engine.

## Result fields

| Field | Meaning |
| --- | --- |
| `valid`, `score` | Trusted successful calculation and final score consumed by the Advisor |
| `budget_spent`, `budget_remaining` | Cost of the submitted plan |
| `district_scores` | District ID → arithmetic mean of final indicators |
| `district_indicators` | District ID → indicator ID → final value |
| `weighted_average`, `min_district_score` | Components of the score formula |
| `critical_count`, `critical_indicators` | Number and `{district_id, indicator_id, value}` entries below the threshold |
| `baseline` | The same score/indicator metrics before any initiatives |
| `score_delta` | Final score minus baseline score |
| `applied_synergies` | Applied `{pair, district_id, effects}` bonuses |
| `horizon_quarters` | Evaluation horizon |

Full numerical precision is retained in the API. The UI rounds values for display.
Django stores the submitted decisions together with this result in the player's
session before asking the Advisor for an explanation. A failed AI request leaves
the valid engine result intact and can be retried through chat.
