/**
 * Legacy facade redirecting to the pristine pureLedgerEngine.ts
 */
export * from './pureLedgerEngine';
export { calculatePureRiderLedger as calculateRiderLedger } from './pureLedgerEngine';
export type { PureLedgerCalculationResult as LedgerCalculationResult } from './pureLedgerEngine';
