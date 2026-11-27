import { Injectable } from "@nestjs/common";

export type DisclosureMode = "APPROVED" | "POLICY_PENDING" | "PROVISIONAL_SYNTHETIC";
export type DisclosurePolicy = "F07-POL-01" | "F07-POL-02";

export function thresholdOf(policy: DisclosurePolicy): number | null {
  return policy === "F07-POL-01" ? 3 : null;
}

/** A stored NULL identifies the original policy. Never reinterpret a stored result. */
export function storedPolicy(value: string | null | undefined): DisclosurePolicy {
  return value === "F07-POL-02" ? "F07-POL-02" : "F07-POL-01";
}

export function storedDisclosureMode(value: string): DisclosureMode {
  return value === "APPROVED" ? "APPROVED" : "PROVISIONAL_SYNTHETIC";
}

@Injectable()
export class CollectiveConfig {
  readonly mode: DisclosureMode = "APPROVED";
  readonly policy: DisclosurePolicy = "F07-POL-02";

  get threshold(): number | null {
    return thresholdOf(this.policy);
  }
}
