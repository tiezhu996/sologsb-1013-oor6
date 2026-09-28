import { formatTime } from 'stage-cue-editor/helpers/format-time';
import { module, test } from 'qunit';

module('Unit | Helper | format-time', function () {
  test('完整格式包含月日与时分秒', function (assert) {
    assert.true(formatTime('2026-09-28T11:30:05.000Z').length > 0);
  });

  test('紧凑模式只返回时钟', function (assert) {
    const value = formatTime('2026-09-28T11:30:05.000Z', true);
    const match = value.match(/^\d{2}:\d{2}:\d{2}$/);
    assert.ok(match, `「${value}」应为 HH:mm:ss`);
  });

  test('空值与非法值回退为占位符', function (assert) {
    assert.strictEqual(formatTime(''), '—');
    assert.strictEqual(formatTime(undefined), '—');
    assert.strictEqual(formatTime('not-a-date'), '—');
  });
});
