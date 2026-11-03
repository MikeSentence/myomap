import { MUSCLE_BY_ID, RED_FLAGS } from './data.js';

const CHAIN_LABELS = {
  neck: '颈肩—头部张力链',
  shoulder: '肩胛带—上背链',
  torso: '胸廓—核心链',
  lowback: '腰—骨盆—髋链',
  arm: '肘—前臂—腕链',
  leg: '髋—膝—小腿链',
  upper: '颈肩—肩胛带链',
  core: '胸廓—腰腹链',
  lower: '骨盆—下肢链',
  mixed: '跨区域肌肉张力链',
};

const MACRO_CATEGORY = {
  neck: 'upper',
  shoulder: 'upper',
  arm: 'upper',
  torso: 'core',
  lowback: 'core',
  leg: 'lower',
};

const CATEGORY_NAMES = {
  neck: '头颈',
  shoulder: '肩背',
  torso: '胸腹',
  lowback: '腰臀',
  arm: '上肢',
  leg: '下肢',
};

const SIDE_NAMES = {
  left: '左侧',
  right: '右侧',
  both: '双侧 / 中间',
};

export function getSideName(side) {
  return SIDE_NAMES[side] || '未标注侧别';
}

export function generateReport(records = [], checkedFlagIds = []) {
  const valid = records
    .map((record) => ({ ...record, muscle: MUSCLE_BY_ID[record.muscleId] }))
    .filter((record) => record.muscle)
    .sort((a, b) => b.intensity - a.intensity || (b.createdAt || 0) - (a.createdAt || 0));

  if (!valid.length) return null;

  const uniqueIds = [...new Set(valid.map((record) => record.muscleId))];
  const uniqueMuscles = uniqueIds.map((id) => MUSCLE_BY_ID[id]);
  const flags = RED_FLAGS.filter((flag) => checkedFlagIds.includes(flag.id));
  const hasFlags = flags.length > 0;

  const categoryCount = {};
  for (const record of valid) {
    categoryCount[record.muscle.cat] = (categoryCount[record.muscle.cat] || 0) + 1 + record.intensity / 12;
  }
  const dominantCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  const categorySet = new Set(uniqueMuscles.map((muscle) => muscle.cat));
  const macroSet = new Set(uniqueMuscles.map((muscle) => MACRO_CATEGORY[muscle.cat]));
  const dominantMacro = macroSet.size === 1 ? [...macroSet][0] : 'mixed';
  let chainLabel;
  if (uniqueMuscles.length === 1) chainLabel = CHAIN_LABELS[uniqueMuscles[0].cat];
  else if (categorySet.size === 1) chainLabel = CHAIN_LABELS[dominantCategory];
  else if (macroSet.size === 1) chainLabel = CHAIN_LABELS[dominantMacro];
  else chainLabel = CHAIN_LABELS.mixed;

  const relatedScores = new Map();
  for (const record of valid) {
    for (const relatedId of record.muscle.related) {
      if (uniqueIds.includes(relatedId)) continue;
      const current = relatedScores.get(relatedId) || { score: 0, count: 0 };
      current.score += 1 + record.intensity / 10;
      current.count += 1;
      relatedScores.set(relatedId, current);
    }
  }
  const relatedCandidates = [...relatedScores.entries()]
    .map(([id, score]) => ({ id, ...score, muscle: MUSCLE_BY_ID[id] }))
    .filter((item) => item.muscle)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const chain = [
    ...uniqueIds.map((id) => ({ id, name: MUSCLE_BY_ID[id].zh, related: false })),
    ...relatedCandidates.map((item) => ({ id: item.id, name: item.muscle.zh, related: true })),
  ];

  const selectedByIntensity = uniqueIds
    .map((id) => {
      const group = valid.filter((record) => record.muscleId === id);
      const top = group[0];
      const maxIntensity = Math.max(...group.map((record) => record.intensity));
      const sides = [...new Set(group.map((record) => getSideName(record.side)))];
      return { ...top, muscle: MUSCLE_BY_ID[id], maxIntensity, sides };
    })
    .sort((a, b) => b.maxIntensity - a.maxIntensity);

  const focus = selectedByIntensity.slice(0, 3).map((record) => ({
    id: record.muscleId,
    zh: record.muscle.zh,
    en: record.muscle.en,
    intensity: record.maxIntensity,
    sides: record.sides,
    referral: record.muscle.referral.slice(0, 3),
    suggestion: record.muscle.care[0],
    test: record.muscle.tests[0],
  }));

  const care = [];
  if (hasFlags) {
    care.push('先预约医疗评估；在排除急症前，不要对疼痛部位做强力按压、扳动或大幅度拉伸。');
    care.push('记录疼痛出现的时间、动作、强度和伴随症状，方便就诊时准确描述。');
    care.push('如出现胸痛、呼吸困难、突发无力、意识异常或大小便失控，请立即拨打当地急救电话。');
  } else {
    care.push('在可忍受范围内保持轻活动，避免长时间维持同一姿势；疼痛急性加重时先停下。');
    care.push('局部热敷 10–15 分钟通常有助于放松；急性外伤、明显肿胀或发热时不要热敷。');
    for (const record of selectedByIntensity.slice(0, 2)) {
      const suggestion = record.muscle.care[0];
      if (suggestion && !care.includes(suggestion)) care.push(suggestion);
    }
    if (valid.some((record) => record.types?.includes('放射痛'))) {
      care.push('你标记了“放射痛”。沿肢体放射的疼痛需要与神经问题鉴别；若伴麻木、无力或走路不稳，请优先就医。');
    }
    if (valid.some((record) => record.types?.includes('麻木'))) {
      care.push('你标记了“麻木”。持续或进行性麻木、握力下降或走路不稳，应优先做神经与脊柱相关评估。');
    }
  }

  const cautionNotes = [];
  if (valid.some((record) => record.types?.includes('放射痛'))) {
    cautionNotes.push('记录中包含“放射痛”，建议留意是否伴随麻木、无力或反射改变。');
  }
  if (valid.some((record) => record.types?.includes('麻木'))) {
    cautionNotes.push('记录中包含“麻木”，若范围扩大或伴肌力下降，建议优先进行专业评估。');
  }
  if (valid.some((record) => record.duration === '超过 6 周' || record.duration === '反复发作')) {
    cautionNotes.push('疼痛持续较久或反复出现，单靠自我放松可能不够，建议安排专业评估。');
  }
  if (valid.some((record) => record.intensity >= 8)) {
    cautionNotes.push('有痛点达到 8/10 以上；若影响睡眠或日常活动，应尽快就医。');
  }
  const specificWarning = uniqueMuscles
    .map((muscle) => muscle.warning)
    .find((warning) => warning && (warning.includes('立即') || warning.includes('尽快') || warning.includes('急诊')));
  if (!hasFlags && specificWarning) cautionNotes.push(specificWarning);

  const average = (valid.reduce((sum, record) => sum + record.intensity, 0) / valid.length).toFixed(1);
  const selectedLine = valid.map((record) => `${record.muscle.zh}（${getSideName(record.side)}，${record.intensity}/10）`).join('、');

  let headline;
  if (hasFlags) {
    headline = '先处理需要优先评估的信号';
  } else if (uniqueMuscles.length === 1) {
    headline = `把「${uniqueMuscles[0].zh}」放到疼痛地图的中心`;
  } else if (categorySet.size === 1) {
    headline = `疼痛线索集中在「${CATEGORY_NAMES[dominantCategory]}」`;
  } else if (macroSet.size === 1) {
    const macroNames = { upper: '颈肩与肩胛带', core: '胸廓与腰腹', lower: '骨盆与下肢' };
    headline = `疼痛线索集中在「${macroNames[dominantMacro]}」`;
  } else {
    headline = '你的疼痛可能是一条跨区域的张力链';
  }

  let intro;
  if (hasFlags) {
    intro = `你记录了 ${valid.length} 个痛点，并勾选了 ${flags.length} 项需要优先评估的信号。下面的内容用于帮你整理就医时要说清楚的信息，不替代医疗判断。`;
  } else {
    intro = `你记录了 ${valid.length} 个痛点，平均强度 ${average}/10。根据位置与常见的肌肉牵涉模式，可以先从「${chainLabel}」的视角来观察，但这只是一个假设，不是诊断。`;
  }

  return {
    dateLabel: new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date()),
    headline,
    intro,
    selectedLine,
    chainLabel,
    chain,
    focus,
    care,
    cautionNotes,
    flags,
    hasFlags,
    dominantCategory,
    categoryName: CATEGORY_NAMES[dominantCategory] || '',
    average,
    count: valid.length,
    painTypes: [...new Set(valid.flatMap((record) => record.types || []))],
  };
}
