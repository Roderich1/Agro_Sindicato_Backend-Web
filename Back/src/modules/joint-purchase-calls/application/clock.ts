/**
 * Server clock of E2 (E2-D4, E2-D11, E2-D12): every decision that depends on
 * time (deadline, opening, closing cutoff, acceptance) reads it here, never
 * the phone's time. Tests replace the provider to move time without touching
 * the system clock.
 */
export interface Clock {
  now(): Date;
}

export const JOINT_PURCHASE_CLOCK = Symbol("JOINT_PURCHASE_CLOCK");

export const systemClock: Clock = { now: () => new Date() };
