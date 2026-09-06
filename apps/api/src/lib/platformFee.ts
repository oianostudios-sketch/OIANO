import { AppError } from './errors';

// What OIANO charges a studio on each booking payment, in basis points.
//
// The ledger has always allocated and posted this correctly — bookingAllocation()
// splits gross into studioNet and platformFee, refunds reverse it proportionally,
// and PLATFORM_REVENUE is credited whenever the fee is above zero. What was missing
// is that Studio.platform_fee_bps defaulted to 0 and was written by no route, so the
// fee was always zero and that branch never fired. The revenue model existed in the
// ledger and was inert in reality.
//
// The rate is a business decision, not an engineering one, so it is read from the
// environment rather than compiled in. PLATFORM_FEE_BPS can be changed without a
// code change; DEFAULT is what applies when it is unset.
export const DEFAULT_PLATFORM_FEE_BPS = 500; // 5%

// Studios created before a rate existed keep the rate they have. This is the rate
// applied to a *newly registering* studio only — changing an existing studio's terms
// is a commercial act and deliberately not a side effect of a deploy.
export function platformFeeBpsForNewStudio(): number {
  const raw = process.env.PLATFORM_FEE_BPS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PLATFORM_FEE_BPS;

  const parsed = Number(raw);
  // Fail loudly rather than silently charging the wrong rate or falling back to a
  // default the operator believes they overrode. bookingAllocation() enforces the
  // same bounds at posting time; this catches a bad value at studio creation.
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
    throw new AppError('PLATFORM_FEE_BPS must be an integer between 0 and 10000', 500);
  }
  return parsed;
}
