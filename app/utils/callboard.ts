import type { Cue, CueStatus } from 'stage-cue-editor/models/show';

/** 待执行 → 进行中 → 已完成 只能在同一场内按顺序推进。 */
export function canTransition(
  statuses: CueStatus[],
  index: number,
  to: CueStatus,
): { ok: boolean; reason: string } {
  const current = statuses[index];
  if (!current || current === to) return { ok: current === to, reason: '' };

  if (!Number.isInteger(index) || index < 0) return { ok: false, reason: '' };

  if (current === 'pending' && to === 'running') {
    const previous = statuses[index - 1];
    if (previous && previous !== 'done') {
      return {
        ok: false,
        reason: `前一条（第 ${index} 条）提示尚未完成签核，完成后才能开始本条。`,
      };
    }
    return { ok: true, reason: '' };
  }

  if (current === 'running' && to === 'done') {
    return { ok: true, reason: '' };
  }

  // 进行中退回待执行，或已完成回退：后面只要已经开始，就不允许回退。
  if (to === 'pending' || (current === 'done' && to === 'running')) {
    const blocker = statuses
      .slice(index + 1)
      .findIndex((status) => status !== 'pending');
    if (blocker >= 0) {
      return {
        ok: false,
        reason: `第 ${index + blocker + 2} 条提示已经开始，请先将后续提示退回待执行，再回退本条签核。`,
      };
    }
    return { ok: true, reason: '' };
  }

  // 待执行直接点已完成：必须先开始。
  if (current === 'pending' && to === 'done') {
    return {
      ok: false,
      reason: '请先将本条提示置为「进行中」，执行后再签核完成。',
    };
  }

  return { ok: false, reason: '当前状态不允许该切换。' };
}

/**
 * 完成签核跟随提示一起拖动；但「已开始（进行中/已完成）」的提示不允许排到
 * 任意「待执行」提示之后，否则会破坏按顺序执行的签核链。
 */
export function canReorder(
  cues: Cue[],
  from: number,
  to: number,
): { ok: boolean; reason: string } {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= cues.length ||
    to >= cues.length
  ) {
    return { ok: false, reason: '' };
  }
  const moved = cues[from]!;
  const next = [...cues];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);

  // 完成记录跟随提示一起拖动；带完成记录的提示若排到了「待执行」提示之后，
  // 就会出现后面已签核、前面未执行的倒挂顺序，必须拦住并说明原因。
  if (moved.status === 'done') {
    const newIndex = next.indexOf(moved);
    const blocker = next
      .slice(0, newIndex)
      .find((cue) => cue.status === 'pending');
    if (blocker) {
      return {
        ok: false,
        reason: `「${moved.title}」已有完成签核，不能拖到未完成的「${blocker.title}」之后：同一场需前一条完成后才能开始下一条。`,
      };
    }
  }
  return { ok: true, reason: '' };
}

export interface SceneProgress {
  total: number;
  done: number;
  running: number;
  pending: number;
  runningTitle: string;
  nextTitle: string;
}

export function sceneProgress(cues: Cue[]): SceneProgress {
  return {
    total: cues.length,
    done: cues.filter((cue) => cue.status === 'done').length,
    running: cues.filter((cue) => cue.status === 'running').length,
    pending: cues.filter((cue) => cue.status === 'pending').length,
    runningTitle: cues.find((cue) => cue.status === 'running')?.title ?? '',
    nextTitle: cues.find((cue) => cue.status === 'pending')?.title ?? '',
  };
}
