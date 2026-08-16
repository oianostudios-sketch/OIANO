import { AppError } from '../../lib/errors';

const CURRENCY_EXPONENTS: Record<string, number> = { BIF:0, CLP:0, DJF:0, GNF:0, JPY:0, KMF:0, KRW:0, PYG:0, RWF:0, UGX:0, VND:0, VUV:0, XAF:0, XOF:0, XPF:0, BHD:3, IQD:3, JOD:3, KWD:3, LYD:3, OMR:3, TND:3 };

export function normalizeCurrency(value: string) {
  const currency = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new AppError('CURRENCY_NOT_SUPPORTED', 400);
  return currency;
}

export function currencyExponent(currency: string) { return CURRENCY_EXPONENTS[normalizeCurrency(currency)] ?? 2; }

export function decimalToMinor(value: string, currency: string): bigint {
  const exponent = currencyExponent(currency);
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new AppError('INVALID_MONEY_AMOUNT', 400);
  const fraction = match[3] ?? '';
  if (fraction.length > exponent) throw new AppError('AMOUNT_PRECISION_INVALID', 400);
  const minor = BigInt(match[2]) * (10n ** BigInt(exponent)) + BigInt((fraction + '0'.repeat(exponent)).slice(0, exponent) || '0');
  return match[1] ? -minor : minor;
}
