import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import type {
  Cue,
  CueDraft,
  CueIssue,
  CueKind,
  CueStatus,
  CueStatusEvent,
  Scene,
  ShowData,
  VersionDiff,
  VersionSnapshot,
} from 'stage-cue-editor/models/show';
import {
  CUE_KINDS,
  CUE_STATUS_LABELS,
  OWNERS,
} from 'stage-cue-editor/models/show';
import {
  canReorder,
  canTransition,
  sceneProgress,
} from 'stage-cue-editor/utils/callboard';

const STORAGE_KEY = 'sologsb-1013-stage-cue-editor-v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function cue(
  id: string,
  kind: CueKind,
  title: string,
  duration: number,
  owner: string,
  extra: Partial<Cue> = {},
): Cue {
  return {
    id,
    kind,
    title,
    duration,
    owner,
    lighting: '',
    sound: '',
    props: [],
    cast: [],
    notes: '',
    dependsOn: [],
    offset: 0,
    status: 'pending',
    statusHistory: [],
    ...extra,
  };
}

function initialShow(): ShowData {
  const scenes: Scene[] = [
    {
      id: 'scene-1',
      act: '第一幕',
      name: 'S1',
      title: '月下序场',
      startTime: '19:30',
      locked: false,
      cues: [
        cue('cue-light-1', '灯光', '观众席渐暗 · 面光起', 45, '李岚', {
          lighting: 'FOH 1 号面光 65%，侧光暖白 40%',
          notes: '开演铃后 10 秒执行',
          status: 'done',
          statusHistory: [
            {
              at: '2026-09-28T11:30:05.000Z',
              by: '周启',
              from: 'pending',
              to: 'running',
            },
            {
              at: '2026-09-28T11:30:50.000Z',
              by: '周启',
              from: 'running',
              to: 'done',
            },
          ],
        }),
        cue('cue-actor-1', '演员', '说书人自左台入场', 90, '赵一帆', {
          cast: ['说书人／周启'],
          props: ['折扇'],
          notes: '追光跟随；入场后停留台中',
          status: 'running',
          statusHistory: [
            {
              at: '2026-09-28T11:31:02.000Z',
              by: '周启',
              from: 'pending',
              to: 'running',
            },
          ],
        }),
        cue('cue-sound-1', '音响', '古琴引子淡入', 120, '陈默', {
          sound: 'Q1 古琴引子，-18dB 淡入 6 秒',
          dependsOn: ['cue-deleted-old'],
          notes: '旧版依赖保留用于检查示例',
        }),
        cue('cue-prop-1', '道具', '月牙灯升至舞台中线', 75, '孙禾', {
          props: ['月牙灯'],
          lighting: '顶排 3 号定点',
        }),
      ],
    },
    {
      id: 'scene-2',
      act: '第一幕',
      name: 'S2',
      title: '宫门夜宴',
      startTime: '19:40',
      locked: false,
      cues: [
        cue('cue-stage-2', '舞台', '中景屏风换为朱红', 60, '', {
          notes: '负责人尚未确认',
        }),
        cue('cue-actor-2', '演员', '群臣列队入场', 110, '赵一帆', {
          cast: ['群演 6 人', '侍女 4 人'],
          props: ['宫灯'],
        }),
        cue('cue-light-2', '灯光', '暖金顶光覆盖后区', 80, '李岚', {
          lighting: '顶光 4、5 号 70%，色温 3200K',
        }),
      ],
    },
  ];
  scenes.forEach((scene) => recalculateScene(scene));
  return {
    title: '《长夜行》首演提示表',
    venue: '实验剧场 A 厅',
    date: '2026-10-18',
    caller: '周启',
    scenes,
    updatedAt: new Date().toISOString(),
  };
}

/** 兼容旧版离线数据：补齐跟场人、提示状态与签核记录。 */
function migrate(show: ShowData): ShowData {
  return {
    ...show,
    caller: typeof show.caller === 'string' ? show.caller : '',
    scenes: show.scenes.map((scene) => ({
      ...scene,
      cues: scene.cues.map((item) => ({
        ...item,
        status: item.status ?? 'pending',
        statusHistory: Array.isArray(item.statusHistory)
          ? item.statusHistory
          : [],
      })),
    })),
  };
}

function loadShow(): ShowData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialShow();
    const parsed = JSON.parse(raw) as {
      show: ShowData;
      versions: VersionSnapshot[];
    };
    return parsed.show ? migrate(parsed.show) : initialShow();
  } catch {
    return initialShow();
  }
}

function loadVersions(): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const versions =
      (JSON.parse(raw) as { versions: VersionSnapshot[] }).versions ?? [];
    // 旧快照同样补齐状态字段，版本比较才能看出签核状态变化。
    return versions.map((version) => ({
      ...version,
      data: migrate(version.data),
    }));
  } catch {
    return [];
  }
}

function recalculateScene(scene: Scene): void {
  let elapsed = 0;
  scene.cues.forEach((item) => {
    item.offset = elapsed;
    elapsed += Number(item.duration) || 0;
  });
}

function startSeconds(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 3600 + Number(minute) * 60;
}

function timeLabel(scene: Scene, offset: number): string {
  const total = startSeconds(scene.startTime) + offset;
  const hour = Math.floor((total % 86400) / 3600);
  const minute = Math.floor((total % 3600) / 60);
  const second = total % 60;
  return [hour, minute, second]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function overlaps(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

export default class CueEditorComponent extends Component {
  @tracked show: ShowData = loadShow();
  @tracked versions: VersionSnapshot[] = loadVersions();
  @tracked activeSceneId = this.show.scenes[0]?.id ?? '';
  @tracked selectedCueId = this.show.scenes[0]?.cues[0]?.id ?? '';
  @tracked draft: CueDraft | null = null;
  @tracked compareVersionId = '';
  @tracked message = '';
  @tracked search = '';

  private undoStack: ShowData[] = [];
  private redoStack: ShowData[] = [];
  private dragCueId = '';

  constructor(owner: unknown, args: Record<string, unknown>) {
    super(owner, args);
    window.addEventListener('keydown', this.handleKeyboard);
  }

  get activeScene(): Scene | undefined {
    return this.show.scenes.find((scene) => scene.id === this.activeSceneId);
  }

  get selectedCue(): Cue | undefined {
    return this.activeScene?.cues.find(
      (item) => item.id === this.selectedCueId,
    );
  }

  get cueRows() {
    if (!this.activeScene) return [];
    const statuses = this.activeScene.cues.map((item) => item.status);
    return this.activeScene.cues.map((item, index) => {
      const lastEvent = item.statusHistory[item.statusHistory.length - 1];
      const doneEvent = [...item.statusHistory]
        .reverse()
        .find((event) => event.to === 'done');
      const transitions = (['pending', 'running', 'done'] as CueStatus[]).map(
        (to) => {
          const check = canTransition(statuses, index, to);
          return {
            status: to,
            label: CUE_STATUS_LABELS[to],
            active: item.status === to,
            disabled: item.status === to ? false : !check.ok,
            title: item.status === to ? '' : check.reason,
          };
        },
      );
      return {
        ...item,
        index,
        start: timeLabel(this.activeScene as Scene, item.offset),
        end: timeLabel(this.activeScene as Scene, item.offset + item.duration),
        selected: item.id === this.selectedCueId,
        hasIssue: this.issues.some((issue) => issue.cueId === item.id),
        kindClass:
          item.kind === '灯光'
            ? 'light'
            : item.kind === '音响'
              ? 'sound'
              : item.kind === '道具'
                ? 'prop'
                : item.kind === '演员'
                  ? 'cast'
                  : item.kind === '字幕'
                    ? 'caption'
                    : 'stage',
        propsLabel: item.props.join('、'),
        castLabel: item.cast.join('、'),
        statusLabel: CUE_STATUS_LABELS[item.status],
        transitions,
        startedAt: lastEvent?.at ?? '',
        startedBy: lastEvent?.by ?? '',
        doneAt: doneEvent?.at ?? '',
        doneBy: doneEvent?.by ?? '',
      };
    });
  }

  get sceneRows() {
    return this.show.scenes.map((scene) => {
      const progress = sceneProgress(scene.cues);
      return {
        ...scene,
        active: scene.id === this.activeSceneId,
        issueCount: this.issues.filter((issue) => issue.sceneId === scene.id)
          .length,
        duration: scene.cues.reduce((total, item) => total + item.duration, 0),
        progress,
      };
    });
  }

  get cueKindOptions(): CueKind[] {
    return CUE_KINDS;
  }

  get ownerOptions(): string[] {
    return OWNERS;
  }

  get allCues(): Array<{ cue: Cue; scene: Scene }> {
    return this.show.scenes.flatMap((scene) =>
      scene.cues.map((item) => ({ cue: item, scene })),
    );
  }

  get issues(): CueIssue[] {
    const issues: CueIssue[] = [];
    this.allCues.forEach(({ cue: item, scene }) => {
      if (!item.owner) {
        issues.push({
          id: `owner-${item.id}`,
          severity: 'error',
          title: '负责人空缺',
          detail: `${scene.act} ${scene.name}「${item.title}」尚未指定负责人。`,
          sceneId: scene.id,
          cueId: item.id,
        });
      }
      item.dependsOn.forEach((reference) => {
        if (!this.allCues.some((entry) => entry.cue.id === reference)) {
          issues.push({
            id: `ref-${item.id}-${reference}`,
            severity: 'error',
            title: '提示被引用但已删除',
            detail: `「${item.title}」仍依赖已删除的提示 ${reference}。`,
            sceneId: scene.id,
            cueId: item.id,
          });
        }
      });
      const previous = scene.cues[scene.cues.indexOf(item) - 1];
      if (previous && item.offset < previous.offset + previous.duration) {
        issues.push({
          id: `overlap-${item.id}`,
          severity: 'error',
          title: '同场时间冲突',
          detail: `「${item.title}」与上一条提示重叠。`,
          sceneId: scene.id,
          cueId: item.id,
        });
      }
    });

    const allCues = this.allCues;
    for (let index = 0; index < allCues.length; index += 1) {
      for (let next = index + 1; next < allCues.length; next += 1) {
        const left = allCues[index]!;
        const right = allCues[next]!;
        if (left.cue.id === right.cue.id || left.scene.id === right.scene.id)
          continue;
        const leftStart = startSeconds(left.scene.startTime) + left.cue.offset;
        const rightStart =
          startSeconds(right.scene.startTime) + right.cue.offset;
        if (
          !overlaps(
            leftStart,
            left.cue.duration,
            rightStart,
            right.cue.duration,
          )
        )
          continue;
        const sharedProps = left.cue.props.filter((value) =>
          right.cue.props.includes(value),
        );
        const sharedCast = left.cue.cast.filter((value) =>
          right.cue.cast.includes(value),
        );
        if (sharedProps.length) {
          issues.push({
            id: `prop-${left.cue.id}-${right.cue.id}`,
            severity: 'warning',
            title: '道具撞场',
            detail: `「${left.cue.title}」与「${right.cue.title}」同时使用：${sharedProps.join('、')}。`,
            sceneId: right.scene.id,
            cueId: right.cue.id,
          });
        }
        if (sharedCast.length) {
          issues.push({
            id: `cast-${left.cue.id}-${right.cue.id}`,
            severity: 'warning',
            title: '演员撞场',
            detail: `「${left.cue.title}」与「${right.cue.title}」同时需要：${sharedCast.join('、')}。`,
            sceneId: right.scene.id,
            cueId: right.cue.id,
          });
        }
      }
    }
    return issues.map((issue) => ({
      ...issue,
      icon: issue.severity === 'error' ? '!' : 'i',
    }));
  }

  get selectedProps(): string {
    return this.selectedCue?.props.join('、') ?? '';
  }

  get selectedCast(): string {
    return this.selectedCue?.cast.join('、') ?? '';
  }

  get errors(): number {
    return this.issues.filter((issue) => issue.severity === 'error').length;
  }

  get activeProgress() {
    return sceneProgress(this.activeScene?.cues ?? []);
  }

  get overallProgress() {
    const progress = sceneProgress(this.allCues.map((entry) => entry.cue));
    return {
      ...progress,
      percent: progress.total
        ? Math.round((progress.done / progress.total) * 100)
        : 0,
      runningScene: this.allCues.find((entry) => entry.cue.status === 'running')
        ?.scene,
    };
  }

  get selectedSignoff() {
    const cue = this.selectedCue;
    if (!cue) return null;
    const statuses = this.activeScene?.cues.map((item) => item.status) ?? [];
    const index =
      this.activeScene?.cues.findIndex((item) => item.id === cue.id) ?? -1;
    const transitions = (['pending', 'running', 'done'] as CueStatus[]).map(
      (to) => {
        const check = canTransition(statuses, index, to);
        return {
          status: to,
          label: CUE_STATUS_LABELS[to],
          active: cue.status === to,
          disabled: cue.status === to ? false : !check.ok,
          title: cue.status === to ? '' : check.reason,
        };
      },
    );
    const doneEvent = [...cue.statusHistory]
      .reverse()
      .find((event) => event.to === 'done');
    const startEvent = cue.statusHistory.find(
      (event) => event.to === 'running',
    );
    return {
      statusLabel: CUE_STATUS_LABELS[cue.status],
      transitions,
      startedAt: startEvent?.at ?? '',
      startedBy: startEvent?.by ?? '',
      doneAt: doneEvent?.at ?? '',
      doneBy: doneEvent?.by ?? '',
      history: [...cue.statusHistory].reverse().map((event, historyIndex) => ({
        id: `${cue.id}-event-${cue.statusHistory.length - historyIndex}`,
        at: event.at,
        by: event.by,
        label: `${CUE_STATUS_LABELS[event.from]} → ${CUE_STATUS_LABELS[event.to]}`,
      })),
    };
  }

  get compareVersion(): VersionSnapshot | undefined {
    return this.versions.find(
      (version) => version.id === this.compareVersionId,
    );
  }

  get versionDiff(): VersionDiff[] {
    const version = this.compareVersion;
    if (!version) return [];
    const render = (sceneName: string, item: Cue) =>
      `${sceneName} · ${item.title} | ${item.owner || '未指定'} | ${item.duration}s | ${CUE_STATUS_LABELS[item.status]}`;
    const before = version.data.scenes.flatMap((scene) =>
      scene.cues.map((item) => render(`${scene.act}/${scene.name}`, item)),
    );
    const after = this.show.scenes.flatMap((scene) =>
      scene.cues.map((item) => render(`${scene.act}/${scene.name}`, item)),
    );
    const rows = Array.from(
      { length: Math.max(before.length, after.length) },
      (_, index) => ({
        id: `diff-${index}`,
        changed: before[index] !== after[index],
        label: `提示 ${index + 1}`,
        before: before[index] ?? '—',
        after: after[index] ?? '—',
      }),
    );
    const callerChanged =
      (version.data.caller ?? '') !== (this.show.caller ?? '');
    const callerRow: VersionDiff = {
      id: 'diff-caller',
      changed: callerChanged,
      label: '当前跟场人',
      before: version.data.caller || '未设置',
      after: this.show.caller || '未设置',
    };
    return [callerRow, ...rows];
  }

  get filteredScenes() {
    const term = this.search.trim().toLowerCase();
    return this.sceneRows.filter(
      (scene) =>
        !term ||
        `${scene.act}${scene.name}${scene.title}`.toLowerCase().includes(term),
    );
  }

  @action
  selectScene(id: string): void {
    this.activeSceneId = id;
    this.selectedCueId = this.activeScene?.cues[0]?.id ?? '';
    this.draft = null;
  }

  @action
  selectCue(id: string): void {
    this.selectedCueId = id;
    this.draft = null;
  }

  @action
  updateShowTitle(value: string): void {
    this.mutate((show) => {
      show.title = value;
    });
  }

  @action
  updateCaller(value: string): void {
    this.mutate((show) => {
      show.caller = value;
    });
  }

  @action
  setCueStatus(cueId: string, to: CueStatus): void {
    const scene = this.activeScene;
    if (!scene) return;
    const index = scene.cues.findIndex((item) => item.id === cueId);
    const item = scene.cues[index];
    if (!item) return;
    const caller = this.show.caller.trim();
    if (!caller) {
      this.notify('请先在顶部填写当前跟场人，再进行签核操作');
      return;
    }
    const statuses = scene.cues.map((entry) => entry.status);
    const check = canTransition(statuses, index, to);
    if (!check.ok) {
      this.notify(check.reason);
      return;
    }
    if (item.status === to) return;
    const event: CueStatusEvent = {
      at: new Date().toISOString(),
      by: caller,
      from: item.status,
      to,
    };
    this.mutate((show) => {
      const targetScene = show.scenes.find((entry) => entry.id === scene.id);
      const target = targetScene?.cues[index];
      if (!targetScene || !target) return;
      target.status = to;
      target.statusHistory = [...target.statusHistory, event];
    });
    if (to === 'running')
      this.notify(`「${item.title}」已开始 · 跟场人 ${caller}`);
    else if (to === 'done')
      this.notify(`「${item.title}」签核完成 · ${caller}`);
  }

  @action
  createCueDraft(kind: CueKind = '灯光'): void {
    if (this.activeScene?.locked) {
      this.notify('该场次已锁定，请先建立修订');
      return;
    }
    this.draft = {
      kind,
      title: '',
      duration: 60,
      owner: '',
      lighting: '',
      sound: '',
      props: '',
      cast: '',
      notes: '',
      dependsOn: '',
    };
  }

  @action
  cancelDraft(): void {
    this.draft = null;
  }

  @action
  editSelectedCue(): void {
    const item = this.selectedCue;
    if (!item || this.activeScene?.locked) return;
    this.draft = {
      id: item.id,
      kind: item.kind,
      title: item.title,
      duration: item.duration,
      owner: item.owner,
      lighting: item.lighting,
      sound: item.sound,
      props: item.props.join('、'),
      cast: item.cast.join('、'),
      notes: item.notes,
      dependsOn: item.dependsOn.join('、'),
    };
  }

  @action
  updateDraft<K extends keyof CueDraft>(field: K, value: CueDraft[K]): void {
    if (this.draft) this.draft = { ...this.draft, [field]: value };
  }

  @action
  saveDraft(): void {
    if (!this.draft || !this.draft.title.trim() || !this.activeScene) return;
    const draft = this.draft;
    this.mutate((show) => {
      const scene = show.scenes.find((item) => item.id === this.activeSceneId);
      if (!scene) return;
      const existing = scene.cues.find((item) => item.id === draft.id);
      const saved: Cue = {
        id: draft.id ?? uid('cue'),
        kind: draft.kind,
        title: draft.title.trim(),
        duration: Math.max(1, Number(draft.duration) || 1),
        owner: draft.owner,
        lighting: draft.lighting,
        sound: draft.sound,
        props: draft.props
          .split(/[、,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
        cast: draft.cast
          .split(/[、,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
        notes: draft.notes,
        dependsOn: draft.dependsOn
          .split(/[、,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
        offset: existing?.offset ?? 0,
        // 内容修改不抹掉彩排签核：状态与操作记录跟随提示保留。
        status: existing?.status ?? 'pending',
        statusHistory: existing?.statusHistory ?? [],
      };
      const index = scene.cues.findIndex((item) => item.id === saved.id);
      if (index >= 0) scene.cues.splice(index, 1, saved);
      else scene.cues.push(saved);
      recalculateScene(scene);
      this.selectedCueId = saved.id;
    });
    this.draft = null;
  }

  @action
  removeCue(id: string): void {
    this.mutate((show) => {
      const scene = show.scenes.find((item) => item.id === this.activeSceneId);
      if (!scene || scene.locked) return;
      scene.cues = scene.cues.filter((item) => item.id !== id);
      recalculateScene(scene);
    });
    this.selectedCueId = this.activeScene?.cues[0]?.id ?? '';
  }

  @action
  addScene(): void {
    const scene: Scene = {
      id: uid('scene'),
      act: `第${this.show.scenes.length + 1}幕`,
      name: `S${this.show.scenes.length + 1}`,
      title: '未命名场次',
      startTime: '20:00',
      locked: false,
      cues: [],
    };
    this.mutate((show) => show.scenes.push(scene));
    this.activeSceneId = scene.id;
    this.selectedCueId = '';
  }

  @action
  copyPreviousScene(): void {
    const index = this.show.scenes.findIndex(
      (scene) => scene.id === this.activeSceneId,
    );
    const previous = this.show.scenes[index - 1];
    if (!previous) {
      this.notify('当前已是第一场');
      return;
    }
    const copied: Scene = clone(previous);
    copied.id = uid('scene');
    copied.act = this.activeScene?.act ?? copied.act;
    copied.name = `${copied.name}-副本`;
    copied.title = `${copied.title}（复制）`;
    copied.cues = copied.cues.map((item) => ({
      ...item,
      id: uid('cue'),
      dependsOn: [],
      status: 'pending',
      statusHistory: [],
    }));
    recalculateScene(copied);
    this.mutate((show) => show.scenes.splice(index + 1, 0, copied));
    this.activeSceneId = copied.id;
    this.selectedCueId = copied.cues[0]?.id ?? '';
    this.notify('已复制上一场流程');
  }

  @action
  updateSceneField(
    field: 'title' | 'startTime' | 'act' | 'name',
    value: string,
  ): void {
    this.mutate((show) => {
      const scene = show.scenes.find((item) => item.id === this.activeSceneId);
      if (scene && !scene.locked) scene[field] = value;
    });
  }

  @action
  updateSelectedField(field: keyof Cue, value: unknown): void {
    const id = this.selectedCueId;
    this.mutate((show) => {
      const scene = show.scenes.find((item) => item.id === this.activeSceneId);
      const item = scene?.cues.find((entry) => entry.id === id);
      if (!scene || !item || scene.locked) return;
      if (field === 'duration') item.duration = Math.max(1, Number(value) || 1);
      else if (field === 'props' || field === 'cast')
        item[field] = String(value)
          .split(/[、,，]/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      else Object.assign(item, { [field]: value });
      recalculateScene(scene);
    });
  }

  @action
  moveSelected(direction: -1 | 1): void {
    const cues = this.activeScene?.cues ?? [];
    const from = cues.findIndex((item) => item.id === this.selectedCueId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= cues.length) return;
    this.moveCue(cues[from]!.id, cues[to]!.id);
  }

  @action
  startDrag(id: string): void {
    this.dragCueId = id;
  }

  @action
  allowDrop(event: DragEvent): boolean {
    event.preventDefault();
    return false;
  }

  @action
  dropOn(id: string): void {
    if (this.dragCueId) this.moveCue(this.dragCueId, id);
    this.dragCueId = '';
  }

  @action
  moveCue(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    const scene = this.show.scenes.find(
      (item) => item.id === this.activeSceneId,
    );
    if (!scene) return;
    const from = scene.cues.findIndex((item) => item.id === sourceId);
    const to = scene.cues.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    if (scene.locked) {
      this.notify('该场次已锁定，无法调整顺序');
      return;
    }
    const guard = canReorder(scene.cues, from, to);
    if (!guard.ok) {
      this.notify(guard.reason);
      return;
    }
    this.mutate((show) => {
      const targetScene = show.scenes.find(
        (item) => item.id === this.activeSceneId,
      );
      if (!targetScene || targetScene.locked) return;
      const fromIndex = targetScene.cues.findIndex(
        (item) => item.id === sourceId,
      );
      const toIndex = targetScene.cues.findIndex(
        (item) => item.id === targetId,
      );
      if (fromIndex < 0 || toIndex < 0) return;
      const [moved] = targetScene.cues.splice(fromIndex, 1);
      targetScene.cues.splice(toIndex, 0, moved!);
      recalculateScene(targetScene);
    });
    this.selectedCueId = sourceId;
    this.notify('顺序已更新，签核记录随提示一起移动，后续时间自动顺延');
  }

  @action
  lockVersion(): void {
    const snapshot: VersionSnapshot = {
      id: uid('version'),
      name: `锁定版 ${this.versions.length + 1}`,
      createdAt: new Date().toISOString(),
      data: clone(this.show),
    };
    this.versions = [snapshot, ...this.versions];
    this.compareVersionId = snapshot.id;
    this.persist();
    this.notify('已锁定当前版本');
  }

  @action
  createRevision(): void {
    this.mutate((show) =>
      show.scenes.forEach((scene) => {
        scene.locked = false;
      }),
    );
    this.notify('已从当前锁定版建立可编辑修订');
  }

  @action
  toggleSceneLock(): void {
    this.mutate((show) => {
      const scene = show.scenes.find((item) => item.id === this.activeSceneId);
      if (scene) scene.locked = !scene.locked;
    });
  }

  @action
  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.show));
    this.show = previous;
    this.ensureSelection();
    this.persist();
  }

  @action
  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.show));
    this.show = next;
    this.ensureSelection();
    this.persist();
  }

  @action
  setSearch(value: string): void {
    this.search = value;
  }

  @action
  selectCompareVersion(version: VersionSnapshot): void {
    this.compareVersionId = version.id;
  }

  willDestroy(): void {
    super.willDestroy();
    window.removeEventListener('keydown', this.handleKeyboard);
  }

  private mutate(mutator: (show: ShowData) => void): void {
    this.undoStack.push(clone(this.show));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const next = clone(this.show);
    mutator(next);
    next.updatedAt = new Date().toISOString();
    this.show = next;
    this.ensureSelection();
    this.persist();
  }

  private ensureSelection(): void {
    if (!this.show.scenes.some((scene) => scene.id === this.activeSceneId))
      this.activeSceneId = this.show.scenes[0]?.id ?? '';
    if (!this.activeScene?.cues.some((item) => item.id === this.selectedCueId))
      this.selectedCueId = this.activeScene?.cues[0]?.id ?? '';
  }

  private persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ show: this.show, versions: this.versions }),
    );
  }

  private notify(value: string): void {
    this.message = value;
    window.setTimeout(() => {
      if (this.message === value) this.message = '';
    }, 2200);
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const inEditor =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.tagName === 'SELECT';
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (inEditor) return;
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelected(-1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelected(1);
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.createCueDraft();
    }
  };
}
