# Pokerstarks Audit Findings (Regression Recheck #3)

Date: 2026-02-16
Reviewer: Codex

## Scope
- Re-verify N-01, N-02, N-03 fixes.
- Re-audit for regressions introduced by those patches.

## Verification Checks
- `sozo build` (`/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/contracts`): PASS
- `nargo check` (`/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/circuits/shuffle_proof`): PASS
- `nargo check` (`/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/circuits/decrypt_proof`): PASS
- `npm run build -- --webpack` (`/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/frontend`): PASS

## Recheck Results
| Finding | Status | Evidence |
|---|---|---|
| N-01 | Fixed for underflow path | `pot_rake` is now capped by `sp.amount` and `rake_remaining` before `sp.amount - pot_rake`. |
| N-02 | Fixed | Showdown timeout now folds when either hole card is not dealt. |
| N-03 | Fixed | Auto start now requires `hand.phase == Setup` and `hand.keysSubmitted == hand.numPlayers`. |

## Remaining Finding

### R-04 (Medium): Side-pot rake remainder is not fully allocated after new cap logic
**Where**
- `/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/contracts/src/systems/showdown.cairo:311`
- `/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/contracts/src/systems/showdown.cairo:322`
- `/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/contracts/src/systems/showdown.cairo:335`

**What happens**
- `total_rake` is transferred out before distribution.
- Per-pot `pot_rake` uses capped proportional floor (`min(proportional, sp.amount, rake_remaining)`).
- There is no second pass to assign leftover `rake_remaining`.

**Impact**
- Sum of per-pot rake can be less than `total_rake`.
- Winners receive slightly more chips than `hand.pot` after rake (chip inflation / accounting drift).
- Underflow is fixed, but exact rake conservation is not guaranteed.

**Recommendation**
- Add a bounded remainder pass after the first loop:
  - iterate side pots in order,
  - add `+1` rake while `rake_remaining > 0` and current pot has capacity (`pot_rake < sp.amount`),
  - stop when `rake_remaining == 0`.

## Conclusion
- N-01/N-02/N-03 are implemented as claimed.
- One medium accounting issue remains (R-04) in the revised N-01 rake distribution.
