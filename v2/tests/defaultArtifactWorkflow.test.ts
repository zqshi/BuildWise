import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDefaultArtifactWorkflow } from '../backend/src/application/workspace/quality/defaultArtifactWorkflow.ts';

test('first iteration default workflow uses first-version titles and expanded artifacts', () => {
  const workflow = buildDefaultArtifactWorkflow('2026-03-14T00:00:00.000Z', 'first-iteration');
  const ids = workflow.items.map((item) => item.id);
  assert.equal(workflow.items.find((item) => item.id === 'analysis-report')?.title, '首版需求分析报告');
  assert.ok(ids.includes('product-requirements-doc'));
  assert.ok(ids.includes('design-spec'));
  assert.ok(ids.includes('technical-architecture'));
});

test('subsequent iteration workflow uses inherited analysis title', () => {
  const workflow = buildDefaultArtifactWorkflow('2026-03-14T00:00:00.000Z', 'subsequent-iteration');
  assert.equal(workflow.items.find((item) => item.id === 'analysis-report')?.title, '继承差异分析报告');
});
