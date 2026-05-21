import type { AchievementCondition, AchievementConditionOp, MetaValue } from '../types/achievement';
import type { AchievementEvalContext } from './context';

function getPathValue(ctx: AchievementEvalContext, path: string): unknown {
  const parts = path.split('.').filter((p) => p.length > 0);
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function compareValues(
  actual: unknown,
  expected: MetaValue,
  op: AchievementConditionOp
): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'includes':
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      return false;
    case 'notIncludes':
      if (Array.isArray(actual)) {
        return !actual.includes(expected);
      }
      if (typeof actual === 'string' && typeof expected === 'string') {
        return !actual.includes(expected);
      }
      return true;
    default:
      return false;
  }
}

export function evaluateCondition(
  ctx: AchievementEvalContext,
  condition: AchievementCondition
): boolean {
  const actual = getPathValue(ctx, condition.path);
  return compareValues(actual, condition.value, condition.op);
}

export function evaluateAllConditions(
  ctx: AchievementEvalContext,
  conditions: AchievementCondition[]
): boolean {
  if (conditions.length === 0) {
    return false;
  }
  return conditions.every((c) => evaluateCondition(ctx, c));
}
