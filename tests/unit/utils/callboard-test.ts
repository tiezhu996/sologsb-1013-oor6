import { module, test } from 'qunit';
import {
  canReorder,
  canTransition,
  sceneProgress,
} from 'stage-cue-editor/utils/callboard';
import type { Cue, CueStatus } from 'stage-cue-editor/models/show';

function makeCue(id: string, status: CueStatus, title = id): Cue {
  return {
    id,
    kind: '舞台',
    title,
    duration: 10,
    owner: '李岚',
    lighting: '',
    sound: '',
    props: [],
    cast: [],
    notes: '',
    dependsOn: [],
    offset: 0,
    status,
    statusHistory: [],
  };
}

module('Unit | Utility | callboard · 状态顺序约束', function () {
  test('第一条提示可以直接开始', function (assert) {
    const statuses: CueStatus[] = ['pending', 'pending'];
    assert.true(canTransition(statuses, 0, 'running').ok);
  });

  test('前一条未完成时，后一条不能开始', function (assert) {
    const statuses: CueStatus[] = ['pending', 'pending'];
    const result = canTransition(statuses, 1, 'running');
    assert.false(result.ok);
    assert.ok(result.reason.includes('前一条'));
  });

  test('前一条进行中时，后一条仍不能开始', function (assert) {
    const statuses: CueStatus[] = ['running', 'pending'];
    assert.false(canTransition(statuses, 1, 'running').ok);
  });

  test('前一条完成后，后一条可以开始', function (assert) {
    const statuses: CueStatus[] = ['done', 'pending'];
    assert.true(canTransition(statuses, 1, 'running').ok);
  });

  test('进行中可以完成；待执行不能直接跳到完成', function (assert) {
    assert.true(canTransition(['done', 'running'], 1, 'done').ok);
    assert.false(canTransition(['done', 'pending'], 1, 'done').ok);
  });

  test('后续提示已经开始时，前面的完成签核不能回退', function (assert) {
    const statuses: CueStatus[] = ['done', 'running', 'pending'];
    assert.false(canTransition(statuses, 0, 'pending').ok);
    assert.false(canTransition(statuses, 0, 'running').ok);
  });

  test('后续仍为待执行时，已完成可以回退', function (assert) {
    const statuses: CueStatus[] = ['done', 'pending', 'pending'];
    assert.true(canTransition(statuses, 0, 'pending').ok);
  });

  test('切到当前状态视为无操作', function (assert) {
    assert.true(canTransition(['pending'], 0, 'pending').ok);
  });
});

module('Unit | Utility | callboard · 拖动拦截', function () {
  test('已完成提示可以在已完成区域内重新排序', function (assert) {
    const cues = [
      makeCue('a', 'done'),
      makeCue('b', 'done'),
      makeCue('c', 'pending'),
    ];
    assert.true(canReorder(cues, 0, 1).ok);
  });

  test('已完成提示拖到待执行提示之后会被拦住并给出原因', function (assert) {
    const cues = [
      makeCue('a', 'done', '开场光'),
      makeCue('b', 'pending', '入场'),
    ];
    const result = canReorder(cues, 0, 1);
    assert.false(result.ok);
    assert.ok(result.reason.includes('开场光'));
    assert.ok(result.reason.includes('入场'));
    assert.ok(result.reason.includes('前一条完成'));
  });

  test('待执行提示之间可以自由排序', function (assert) {
    const cues = [makeCue('a', 'pending'), makeCue('b', 'pending')];
    assert.true(canReorder(cues, 1, 0).ok);
  });

  test('进行中提示还没有完成记录，拖动不受完成签核限制', function (assert) {
    const cues = [makeCue('a', 'running'), makeCue('b', 'pending')];
    assert.true(canReorder(cues, 0, 1).ok);
  });

  test('相同位置或越界返回不可移动', function (assert) {
    const cues = [makeCue('a', 'done')];
    assert.false(canReorder(cues, 0, 0).ok);
    assert.false(canReorder(cues, 0, 5).ok);
  });
});

module('Unit | Utility | callboard · 场次进度', function () {
  test('按状态统计并给出当前进行与下一条待执行提示', function (assert) {
    const cues = [
      makeCue('a', 'done', '第一条'),
      makeCue('b', 'running', '第二条'),
      makeCue('c', 'pending', '第三条'),
    ];
    const progress = sceneProgress(cues);
    assert.strictEqual(progress.total, 3);
    assert.strictEqual(progress.done, 1);
    assert.strictEqual(progress.running, 1);
    assert.strictEqual(progress.pending, 1);
    assert.strictEqual(progress.runningTitle, '第二条');
    assert.strictEqual(progress.nextTitle, '第三条');
  });
});
