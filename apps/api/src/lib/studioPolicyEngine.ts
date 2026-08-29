export type PolicyOperator = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN';
export type PolicyClause = { field: string; operator: PolicyOperator; value: unknown };
export type PolicyContract = {
  id: string;
  domain: string;
  subject: string;
  name: string;
  enforcement: 'ADVISORY' | 'CONTROLLED' | 'HARD';
  override_capability?: string | null;
  conditions?: { all?: PolicyClause[]; any?: PolicyClause[] };
  default_outcome: { requirements?: PolicyClause[]; consequence?: Record<string, unknown> };
};

export type PolicyDecision = {
  policy_id: string;
  policy_name: string;
  domain: string;
  subject: string;
  result: 'COMPLIANT' | 'ADVISORY' | 'OVERRIDE_REQUIRED' | 'DENIED';
  failed_requirements: PolicyClause[];
  required_capability: string | null;
  consequence: Record<string, unknown>;
};

function valueAt(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source);
}

function compare(actual: unknown, operator: PolicyOperator, expected: unknown): boolean {
  if (operator === 'EQ') return actual === expected;
  if (operator === 'NEQ') return actual !== expected;
  if (operator === 'IN') return Array.isArray(expected) && expected.includes(actual);
  if (operator === 'NOT_IN') return Array.isArray(expected) && !expected.includes(actual);
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (operator === 'GT') return actual > expected;
  if (operator === 'GTE') return actual >= expected;
  if (operator === 'LT') return actual < expected;
  return actual <= expected;
}

function matches(clause: PolicyClause, source: Record<string, unknown>) {
  return compare(valueAt(source, clause.field), clause.operator, clause.value);
}

export function policyApplies(policy: PolicyContract, context: Record<string, unknown>): boolean {
  const all = policy.conditions?.all ?? [];
  const any = policy.conditions?.any ?? [];
  return all.every(clause => matches(clause, context)) && (!any.length || any.some(clause => matches(clause, context)));
}

export function evaluateStudioPolicies(
  policies: PolicyContract[],
  context: Record<string, unknown>,
  proposed: Record<string, unknown>,
): PolicyDecision[] {
  return policies.filter(policy => policyApplies(policy, context)).map(policy => {
    const failed = (policy.default_outcome.requirements ?? []).filter(requirement => !matches(requirement, proposed));
    const result: PolicyDecision['result'] = !failed.length ? 'COMPLIANT'
      : policy.enforcement === 'HARD' ? 'DENIED'
        : policy.enforcement === 'CONTROLLED' ? 'OVERRIDE_REQUIRED'
          : 'ADVISORY';
    return {
      policy_id: policy.id,
      policy_name: policy.name,
      domain: policy.domain,
      subject: policy.subject,
      result,
      failed_requirements: failed,
      required_capability: policy.override_capability ?? null,
      consequence: policy.default_outcome.consequence ?? {},
    };
  });
}

// A mutation must only re-evaluate rules governing fields it actually changes.
// For example, moving a session changes `booking.*`, but does not renegotiate
// its already-agreed payment method or price. Re-running unrelated rules would
// apply today's defaults retroactively and could block an otherwise valid move.
export function policiesAffectedByChanges(
  policies: PolicyContract[],
  changedPrefixes: string[],
): PolicyContract[] {
  return policies.filter((policy) =>
    (policy.default_outcome.requirements ?? []).some((requirement) =>
      changedPrefixes.some((prefix) => requirement.field === prefix || requirement.field.startsWith(`${prefix}.`)),
    ),
  );
}

export function canApprovePolicyException(capabilities: string[], requiredCapability?: string | null): boolean {
  return capabilities.includes('POLICY_OVERRIDE_ALL') || (!!requiredCapability && capabilities.includes(requiredCapability));
}
