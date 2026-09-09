import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './alertEngine';

describe('evaluateCondition', () => {
  it('gt: triggers when value exceeds threshold', () => {
    expect(evaluateCondition(150, 'gt', 100)).toBe(true);
    expect(evaluateCondition(100, 'gt', 100)).toBe(false);
    expect(evaluateCondition(50, 'gt', 100)).toBe(false);
  });

  it('lt: triggers when value is below threshold', () => {
    expect(evaluateCondition(50, 'lt', 100)).toBe(true);
    expect(evaluateCondition(100, 'lt', 100)).toBe(false);
    expect(evaluateCondition(150, 'lt', 100)).toBe(false);
  });

  it('eq: triggers only on exact match', () => {
    expect(evaluateCondition(100, 'eq', 100)).toBe(true);
    expect(evaluateCondition(100.01, 'eq', 100)).toBe(false);
  });

  it('unknown condition never triggers', () => {
    expect(evaluateCondition(1000, 'between', 100)).toBe(false);
  });
});
