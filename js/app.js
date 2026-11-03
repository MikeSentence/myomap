import {
  MUSCLES,
  MUSCLE_BY_ID,
  CATEGORIES,
  REGION_LABELS,
  RED_FLAGS,
} from './data.js';
import { AnatomyViewer } from './scene.js';
import { generateReport, getSideName } from './report.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'myomap.records.v1';
const MAX_RECORDS = 8;
const MOBILE_QUERY = '(max-width: 1080px)';

const els = {
  searchInput: $('#searchInput'),
  regionFilters: $('#regionFilters'),
  muscleList: $('#muscleList'),
  listTotal: $('#listTotal'),
  checkCount: $('#checkCount'),
  openCheckBtn: $('#openCheckBtn'),
  helpBtn: $('#helpBtn'),
  leftPanel: $('#leftPanel'),
  closeLeftBtn: $('#closeLeftBtn'),
  openLeftBtn: $('#openLeftBtn'),
  drawerScrim: $('#drawerScrim'),
  meshCount: $('#meshCount'),
  orientationZh: $('#orientationZh'),
  orientationEn: $('.orientation-label i'),
  canvas: $('#scene'),
  viewport: $('#viewport'),
  stage: $('#stage'),
  hotspots: $('#hotspots'),
  hoverTip: $('#hoverTip'),
  loadingLayer: $('#loadingLayer'),
  loadBar: $('#loadBar'),
  loadText: $('#loadText'),
  errorLayer: $('#errorLayer'),
  retryBtn: $('#retryBtn'),
  layerPills: $$('.layer-pill[data-layer]'),
  xrayBtn: $('#xrayBtn'),
  viewBtns: $$('.view-btn'),
  focusBtn: $('#focusBtn'),
  rotateBtn: $('#rotateBtn'),
  resetBtn: $('#resetBtn'),
  detailFocusBtn: $('#detailFocusBtn'),
  detailPanel: $('#detailPanel'),
  detailEmpty: $('#detailEmpty'),
  detailContent: $('#detailContent'),
  detailCode: $('#detailCode'),
  detailRegion: $('#detailRegion'),
  detailZh: $('#detailZh'),
  detailEn: $('#detailEn'),
  sideStamp: $('#sideStamp'),
  detailSummary: $('#detailSummary'),
  detailTags: $('#detailTags'),
  detailLocus: $('#detailLocus'),
  detailPain: $('#detailPain'),
  detailReferral: $('#detailReferral'),
  relatedList: $('#relatedList'),
  testList: $('#testList'),
  careList: $('#careList'),
  warningText: $('#warningText'),
  warningCard: $('#warningCard'),
  addPainBtn: $('#addPainBtn'),
  closeDetailBtn: $('#closeDetailBtn'),
  detailScroll: $('#detailScroll'),
  detailScrollHint: $('#detailScrollHint'),
  exampleBtn: $('#exampleBtn'),

  painModal: $('#painModal'),
  painSelectedIndex: $('#painSelectedIndex'),
  painSelectedName: $('#painSelectedName'),
  painSelectedEn: $('#painSelectedEn'),
  painSelectedSide: $('#painSelectedSide'),
  intensityRange: $('#intensityRange'),
  intensityValue: $('#intensityValue'),
  sideOptions: $('#sideOptions'),
  painTypeOptions: $('#painTypeOptions'),
  durationSelect: $('#durationSelect'),
  triggerInput: $('#triggerInput'),
  savePainBtn: $('#savePainBtn'),

  checkModal: $('#checkModal'),
  checkFormView: $('#checkFormView'),
  reportView: $('#reportView'),
  recordedList: $('#recordedList'),
  recordedCount: $('#recordedCount'),
  redflagList: $('#redflagList'),
  generateBtn: $('#generateBtn'),
  addMoreBtn: $('#addMoreBtn'),
  backToCheckBtn: $('#backToCheckBtn'),
  printBtn: $('#printBtn'),
  printBtn2: $('#printBtn2'),
  restartBtn: $('#restartBtn'),
  reportDate: $('#reportDate'),
  reportHeadline: $('#reportHeadline'),
  reportIntro: $('#reportIntro'),
  reportContent: $('#reportContent'),

  helpModal: $('#helpModal'),
  toastStack: $('#toastStack'),
};

const appState = {
  selectedId: null,
  selectedSide: 'both',
  filter: 'all',
  query: '',
  layers: { muscle: true, bone: true, hotspot: true },
  xray: false,
  autoRotate: false,
  records: loadRecords(),
  redFlags: new Set(),
  painDraft: null,
  report: null,
  restartArmed: false,
  restartTimer: null,
  lastFocused: null,
  hoverListId: null,
  hoverFrame: 0,
};

let viewer = null;
let listNodes = new Map();

init();

function init() {
  renderRegionFilters();
  renderMuscleList();
  renderRedFlags();
  renderRecordedList();
  syncGlobalUI();
  syncLayerButtons();
  syncXrayButton();
  bindUI();
  initViewer();
  updateFlow();
}

/* =========================================================
   Data / list
   ========================================================= */
function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ');
}

function matchesSearch(muscle, query) {
  if (!query) return true;
  const haystack = normalize([
    muscle.zh,
    muscle.en,
    muscle.summary,
    ...muscle.pain,
    ...muscle.referral,
    ...muscle.triggers,
    REGION_LABELS[muscle.cat],
  ].join(' '));
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function getFilteredMuscles() {
  const query = normalize(appState.query.trim());
  return MUSCLES.filter((muscle) => {
    if (appState.filter !== 'all' && muscle.cat !== appState.filter) return false;
    return matchesSearch(muscle, query);
  });
}

function renderRegionFilters() {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [
    category.id,
    category.id === 'all' ? MUSCLES.length : MUSCLES.filter((muscle) => muscle.cat === category.id).length,
  ]));
  els.regionFilters.replaceChildren();
  for (const category of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `region-chip${appState.filter === category.id ? ' is-active' : ''}`;
    button.dataset.category = category.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(appState.filter === category.id));
    button.style.setProperty('--region-color', category.id === 'all' ? '#e36445' : category.color);
    button.title = category.en;
    button.textContent = category.label;
    button.append(createCountBadge(counts[category.id]));
    els.regionFilters.append(button);
  }
}

function createCountBadge(count) {
  const badge = document.createElement('span');
  badge.className = 'region-count';
  badge.textContent = String(count);
  return badge;
}

function renderMuscleList() {
  const muscles = getFilteredMuscles();
  els.muscleList.replaceChildren();
  listNodes = new Map();
  const fragment = document.createDocumentFragment();

  if (!muscles.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.innerHTML = '<b>没有找到匹配的肌肉</b>换个关键词，或切换到其他部位。';
    els.muscleList.append(empty);
    els.listTotal.textContent = '0 组';
    return;
  }

  for (const muscle of muscles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `muscle-item${appState.selectedId === muscle.id ? ' is-selected' : ''}`;
    button.dataset.id = muscle.id;
    button.setAttribute('aria-pressed', String(appState.selectedId === muscle.id));
    button.title = muscle.summary;

    const code = document.createElement('span');
    code.className = 'muscle-code';
    code.textContent = muscle.code;

    const text = document.createElement('span');
    text.className = 'muscle-text';
    const name = document.createElement('span');
    name.className = 'muscle-name';
    name.textContent = muscle.zh;
    const en = document.createElement('span');
    en.className = 'muscle-en';
    en.textContent = muscle.en;
    text.append(name, en);

    const meta = document.createElement('span');
    meta.className = 'muscle-meta';
    const region = document.createElement('span');
    region.className = 'muscle-region';
    region.textContent = REGION_LABELS[muscle.cat];
    const depth = document.createElement('span');
    depth.className = 'muscle-depth';
    depth.textContent = muscle.layer;
    meta.append(region, depth);

    button.append(code, text, meta);
    fragment.append(button);
    listNodes.set(muscle.id, button);
  }

  els.muscleList.append(fragment);
  els.listTotal.textContent = `${muscles.length} 组`;
  syncRecordedListMarkers();
}

function syncRecordedListMarkers() {
  const counts = new Map();
  for (const record of appState.records) {
    counts.set(record.muscleId, (counts.get(record.muscleId) || 0) + 1);
  }
  for (const [id, node] of listNodes.entries()) {
    const count = counts.get(id) || 0;
    node.classList.toggle('has-record', count > 0);
    node.dataset.recorded = count ? String(count) : '';
    node.title = count
      ? `${MUSCLE_BY_ID[id].zh} · 已记录 ${count} 个痛点`
      : MUSCLE_BY_ID[id].summary;
  }
}

function updateListSelection() {
  for (const [id, node] of listNodes.entries()) {
    const selected = id === appState.selectedId;
    node.classList.toggle('is-selected', selected);
    node.setAttribute('aria-pressed', String(selected));
  }
}

/* =========================================================
   Viewer
   ========================================================= */
function initViewer() {
  viewer = new AnatomyViewer({
    canvas: els.canvas,
    viewport: els.viewport,
    hotspotsEl: els.hotspots,
    onProgress: handleProgress,
    onReady: handleReady,
    onError: handleModelError,
    onHover: handleHover,
    onSelect: handleViewerSelect,
    onUnmapped: handleUnmapped,
    onOrientation: handleOrientation,
  });
}

function handleProgress(value) {
  const percent = Math.min(99, Math.round(value * 100));
  els.loadBar.style.width = `${percent}%`;
  els.loadText.textContent = `载入解剖模型 · ${percent}%`;
}

function handleReady(info) {
  els.meshCount.textContent = String(info.muscleParts);
  els.loadBar.style.width = '100%';
  els.loadText.textContent = '解剖结构已就绪';
  setTimeout(() => {
    els.loadingLayer.classList.add('is-done');
    showToast('拖拽旋转 · 点击肌肉查看疼痛线索', 'default', 3600);
  }, 260);
  if (appState.selectedId) {
    const muscle = MUSCLE_BY_ID[appState.selectedId];
    viewer.setSelection(appState.selectedId, muscle?.related || []);
  }
  processDeepLink();
}

function handleModelError() {
  els.loadingLayer.classList.add('is-done');
  els.errorLayer.classList.add('is-visible');
}

function handleHover(payload) {
  if (!payload) {
    els.hoverTip.classList.remove('is-visible');
    setListHover(null);
    return;
  }
  if (!payload.muscle) {
    els.hoverTip.innerHTML = `<b>${escapeHTML(payload.raw)}</b><span>暂未收录详细内容</span>`;
  } else {
    els.hoverTip.innerHTML = `<b>${escapeHTML(payload.muscle.zh)}</b><span>${escapeHTML(payload.muscle.en)}${payload.selected ? ' · <em>已选中</em>' : ''}</span>`;
  }
  els.hoverTip.style.left = `${payload.x}px`;
  els.hoverTip.style.top = `${payload.y}px`;
  els.hoverTip.classList.add('is-visible');
  setListHover(payload.muscle?.id || null);
}

function setListHover(id) {
  if (appState.hoverListId === id) return;
  if (appState.hoverListId) listNodes.get(appState.hoverListId)?.classList.remove('is-hovered');
  appState.hoverListId = id;
  if (id) {
    const node = listNodes.get(id);
    node?.classList.add('is-hovered');
  }
}

function handleViewerSelect({ id, side, source }) {
  selectMuscle(id, { side, source });
}

function handleUnmapped({ raw }) {
  showToast(`「${raw}」暂未收录详细自查内容，请试试邻近的主要肌群`, 'default', 3300);
}

function handleOrientation({ key, zh, en }) {
  if (els.orientationZh) els.orientationZh.textContent = zh;
  if (els.orientationEn) els.orientationEn.textContent = en;
  if (['front', 'back', 'left', 'right'].includes(key)) setActiveView(key);
}

/* =========================================================
   Selection and detail panel
   ========================================================= */
function selectMuscle(id, { side = 'both', source = 'list' } = {}) {
  const muscle = MUSCLE_BY_ID[id];
  if (!muscle) return;

  if (!appState.layers.muscle) {
    appState.layers.muscle = true;
    viewer?.setLayers(appState.layers);
    syncLayerButtons();
  }

  appState.selectedId = id;
  appState.selectedSide = side;
  viewer?.setSelection(id, muscle.related);
  renderDetail(muscle);
  updateListSelection();
  updateFlow();
  updateAddButton();

  if (['list', 'related', 'example', 'query'].includes(source)) {
    viewer?.setView(muscle.view, true);
    setActiveView(muscle.view);
    stopAutoRotate();
  }

  if (source === 'list') closeLeftPanel();
  if (window.matchMedia(MOBILE_QUERY).matches && ['model', 'hotspot', 'list'].includes(source)) {
    setTimeout(() => {
      els.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 280);
  }
}

function renderDetail(muscle) {
  els.detailEmpty.classList.add('is-hidden');
  els.detailContent.classList.add('is-visible');
  els.detailCode.textContent = muscle.code;
  els.detailRegion.textContent = `${REGION_LABELS[muscle.cat]} · ${muscle.layer}`;
  els.detailZh.textContent = muscle.zh;
  els.detailEn.textContent = muscle.en;
  els.detailSummary.textContent = muscle.summary;
  els.detailLocus.textContent = muscle.locus;
  updateSideStamp();

  els.detailTags.replaceChildren();
  for (const trigger of muscle.triggers.slice(0, 4)) {
    const tag = document.createElement('span');
    tag.className = 'detail-tag is-trigger';
    tag.textContent = trigger;
    els.detailTags.append(tag);
  }
  const recordedCount = appState.records.filter((record) => record.muscleId === muscle.id).length;
  if (recordedCount) {
    const recordedTag = document.createElement('span');
    recordedTag.className = 'detail-tag is-recorded';
    recordedTag.textContent = `已记录 ${recordedCount} 处`;
    els.detailTags.append(recordedTag);
  }
  if (muscle.layer === '深层') {
    const xrayTag = document.createElement('button');
    xrayTag.type = 'button';
    xrayTag.className = 'detail-tag is-clickable';
    xrayTag.dataset.xrayTag = 'true';
    xrayTag.textContent = appState.xray ? '透视已开启 · 点击关闭' : '深层结构 · 开启透视';
    xrayTag.addEventListener('click', toggleXray);
    els.detailTags.append(xrayTag);
  } else {
    const layerTag = document.createElement('span');
    layerTag.className = 'detail-tag';
    layerTag.textContent = '浅层结构 · 可轻触定位';
    els.detailTags.append(layerTag);
  }

  els.detailPain.replaceChildren();
  for (const item of muscle.pain) {
    const li = document.createElement('li');
    li.textContent = item;
    els.detailPain.append(li);
  }

  els.detailReferral.replaceChildren();
  for (const item of muscle.referral) {
    const chip = document.createElement('span');
    chip.className = 'referral-chip';
    chip.textContent = item;
    els.detailReferral.append(chip);
  }

  els.relatedList.replaceChildren();
  for (const relatedId of muscle.related) {
    const related = MUSCLE_BY_ID[relatedId];
    if (!related) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'related-item';
    button.dataset.related = relatedId;
    button.innerHTML = `<i></i><span>${escapeHTML(related.zh)}</span><em>${related.code}</em>`;
    els.relatedList.append(button);
  }

  els.testList.replaceChildren();
  muscle.tests.forEach((test, index) => {
    const item = document.createElement('div');
    item.className = 'test-item';
    item.innerHTML = `<div class="test-number">0${index + 1}</div><div><h4>${escapeHTML(test.title)}</h4><p>${escapeHTML(test.desc)}</p></div>`;
    els.testList.append(item);
  });

  els.careList.replaceChildren();
  for (const item of muscle.care) {
    const li = document.createElement('li');
    li.textContent = item;
    els.careList.append(li);
  }

  els.warningText.textContent = muscle.warning;
  els.warningCard.style.display = muscle.warning ? 'flex' : 'none';
  els.detailScroll.scrollTop = 0;
  requestAnimationFrame(updateDetailScrollHint);
  updateAddButton();
}

function updateDetailScrollHint() {
  if (!els.detailScrollHint) return;
  if (window.matchMedia(MOBILE_QUERY).matches || !els.detailContent.classList.contains('is-visible')) {
    els.detailScrollHint.classList.remove('is-visible');
    return;
  }
  const hasMore = els.detailScroll.scrollHeight - els.detailScroll.scrollTop - els.detailScroll.clientHeight > 8;
  els.detailScrollHint.classList.toggle('is-visible', hasMore);
}

function closeDetail() {
  appState.selectedId = null;
  appState.selectedSide = 'both';
  if (appState.xray) {
    appState.xray = false;
    viewer?.setXray(false);
    syncXrayButton();
  }
  viewer?.clearSelection();
  els.detailContent.classList.remove('is-visible');
  els.detailEmpty.classList.remove('is-hidden');
  els.detailScrollHint.classList.remove('is-visible');
  els.hoverTip.classList.remove('is-visible');
  updateListSelection();
  updateFlow();
}

function updateSideStamp() {
  if (!els.sideStamp) return;
  const labels = {
    both: 'BILATERAL',
    left: 'LEFT · 左侧',
    right: 'RIGHT · 右侧',
  };
  els.sideStamp.textContent = labels[appState.selectedSide] || 'BILATERAL';
}

function updateAddButton() {
  if (!appState.selectedId) return;
  const count = appState.records.filter((record) => record.muscleId === appState.selectedId).length;
  const label = els.addPainBtn.querySelector('span:last-child');
  if (label) label.textContent = count ? '再记录一个痛点' : '记录这个痛点';
}

function updateFlow() {
  const active = appState.records.length > 0 ? 3 : (appState.selectedId ? 2 : 1);
  $$('[data-flow-step]').forEach((step, index) => {
    const number = index + 1;
    step.classList.toggle('is-active', number === active);
    step.classList.toggle('is-done', number < active);
  });
}

/* =========================================================
   UI event wiring
   ========================================================= */
function bindUI() {
  els.searchInput.addEventListener('input', (event) => {
    appState.query = event.target.value;
    renderMuscleList();
  });

  els.regionFilters.addEventListener('click', (event) => {
    const button = event.target.closest('.region-chip');
    if (!button) return;
    appState.filter = button.dataset.category;
    renderRegionFilters();
    renderMuscleList();
  });

  els.muscleList.addEventListener('click', (event) => {
    const item = event.target.closest('.muscle-item');
    if (!item) return;
    selectMuscle(item.dataset.id, { source: 'list', side: 'both' });
  });

  els.muscleList.addEventListener('mouseover', (event) => {
    const item = event.target.closest('.muscle-item');
    if (!item || item.contains(event.relatedTarget)) return;
    viewer?.highlightExternal(item.dataset.id);
    item.classList.add('is-hovered');
    appState.hoverListId = item.dataset.id;
  });

  els.muscleList.addEventListener('mouseout', (event) => {
    const item = event.target.closest('.muscle-item');
    if (!item || item.contains(event.relatedTarget)) return;
    viewer?.highlightExternal(null);
    item.classList.remove('is-hovered');
    appState.hoverListId = null;
  });

  els.muscleList.addEventListener('focusin', (event) => {
    const item = event.target.closest('.muscle-item');
    if (item) viewer?.highlightExternal(item.dataset.id);
  });

  els.muscleList.addEventListener('focusout', () => viewer?.highlightExternal(null));

  els.detailFocusBtn.addEventListener('click', focusSelectedMuscle);
  els.focusBtn.addEventListener('click', focusSelectedMuscle);
  els.resetBtn.addEventListener('click', () => {
    viewer?.resetView(true);
    setActiveView('front');
    stopAutoRotate();
  });

  els.rotateBtn.addEventListener('click', () => {
    if (!viewer) return;
    appState.autoRotate = !appState.autoRotate;
    els.rotateBtn.classList.toggle('is-active', appState.autoRotate);
    viewer.setAutoRotate(appState.autoRotate);
    showToast(appState.autoRotate ? '已开启缓慢旋转' : '已停止旋转', 'default', 1800);
  });

  for (const button of els.viewBtns) {
    button.addEventListener('click', () => {
      if (!viewer) return;
      stopAutoRotate();
      const view = button.dataset.view;
      viewer.setView(view, true);
      setActiveView(view);
    });
  }

  for (const button of els.layerPills) {
    button.addEventListener('click', () => {
      const layer = button.dataset.layer;
      appState.layers[layer] = !appState.layers[layer];
      syncLayerButtons();
      viewer?.setLayers(appState.layers);
      if (!appState.layers.muscle && !appState.layers.bone) {
        showToast('模型图层已全部隐藏，可在右侧重新开启', 'default', 2200);
      }
    });
  }

  els.xrayBtn.addEventListener('click', toggleXray);
  els.closeDetailBtn.addEventListener('click', closeDetail);
  els.exampleBtn.addEventListener('click', () => {
    selectMuscle('trapezius', { source: 'example', side: 'both' });
  });

  els.relatedList.addEventListener('click', (event) => {
    const button = event.target.closest('.related-item');
    if (!button) return;
    selectMuscle(button.dataset.related, { source: 'related', side: 'both' });
  });

  els.detailScroll.addEventListener('scroll', updateDetailScrollHint, { passive: true });

  els.addPainBtn.addEventListener('click', openPainModal);
  els.openCheckBtn.addEventListener('click', openCheckModal);
  els.closeLeftBtn.addEventListener('click', closeLeftPanel);
  els.openLeftBtn.addEventListener('click', openLeftPanel);
  els.drawerScrim.addEventListener('click', closeLeftPanel);
  els.helpBtn.addEventListener('click', () => openModal('helpModal'));

  els.intensityRange.addEventListener('input', () => {
    if (appState.painDraft) appState.painDraft.intensity = Number(els.intensityRange.value);
    updateIntensityUI();
  });

  els.sideOptions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-side]');
    if (!button || !appState.painDraft) return;
    appState.painDraft.side = button.dataset.side;
    syncPainSide();
    refreshPainEditingState();
  });

  els.painTypeOptions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-type]');
    if (!button || !appState.painDraft) return;
    const type = button.dataset.type;
    if (appState.painDraft.types.has(type)) appState.painDraft.types.delete(type);
    else appState.painDraft.types.add(type);
    button.classList.toggle('is-active', appState.painDraft.types.has(type));
  });

  els.savePainBtn.addEventListener('click', savePainRecord);

  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  });

  for (const backdrop of $$('.modal-backdrop')) {
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  }

  els.recordedList.addEventListener('click', (event) => {
    const button = event.target.closest('.recorded-remove');
    if (!button) return;
    removeRecord(button.dataset.remove);
  });

  els.redflagList.addEventListener('change', (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked) appState.redFlags.add(input.value);
    else appState.redFlags.delete(input.value);
  });

  els.generateBtn.addEventListener('click', generateReportView);
  els.addMoreBtn.addEventListener('click', () => {
    closeModal('checkModal');
    showToast('在模型或左侧索引中选择另一个痛点', 'default', 2600);
    if (window.matchMedia(MOBILE_QUERY).matches) openLeftPanel();
    else els.searchInput.focus();
  });
  els.backToCheckBtn.addEventListener('click', showCheckForm);
  els.printBtn.addEventListener('click', printReport);
  els.printBtn2.addEventListener('click', printReport);
  els.restartBtn.addEventListener('click', handleRestart);

  els.retryBtn.addEventListener('click', () => window.location.reload());

  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('resize', () => {
    if (!window.matchMedia(MOBILE_QUERY).matches) closeLeftPanel();
    updateDetailScrollHint();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (!els.leftPanel.classList.contains('is-open')) return;
    if (els.leftPanel.contains(event.target) || event.target.closest('#openLeftBtn')) return;
    closeLeftPanel();
  });
}

function syncLayerButtons() {
  for (const button of els.layerPills) {
    const layer = button.dataset.layer;
    button.classList.toggle('is-on', Boolean(appState.layers[layer]));
    button.setAttribute('aria-pressed', String(Boolean(appState.layers[layer])));
  }
}

function syncXrayButton() {
  els.xrayBtn.classList.toggle('is-on', Boolean(appState.xray));
  els.xrayBtn.setAttribute('aria-pressed', String(Boolean(appState.xray)));
  $$('[data-xray-tag]').forEach((tag) => {
    tag.textContent = appState.xray ? '透视已开启 · 点击关闭' : '深层结构 · 开启透视';
  });
}

function toggleXray() {
  if (!appState.selectedId) {
    showToast('先选择一块肌肉，再开启透视查看深层结构', 'default', 2600);
    return;
  }
  appState.xray = !appState.xray;
  syncXrayButton();
  viewer?.setXray(appState.xray);
  showToast(
    appState.xray ? '透视已开启：非选中肌肉变淡' : '透视已关闭',
    'default',
    2000
  );
}

function setActiveView(view) {
  for (const button of els.viewBtns) {
    button.classList.toggle('is-active', button.dataset.view === view);
  }
}

function stopAutoRotate() {
  if (!appState.autoRotate) return;
  appState.autoRotate = false;
  els.rotateBtn.classList.remove('is-active');
  viewer?.setAutoRotate(false);
}

function focusSelectedMuscle() {
  if (!appState.selectedId) {
    showToast('先选择一块肌肉，再聚焦查看', 'default', 2200);
    return;
  }
  const muscle = MUSCLE_BY_ID[appState.selectedId];
  viewer?.focusMuscle(appState.selectedId, muscle.view);
  setActiveView(muscle.view);
  stopAutoRotate();
}

/* =========================================================
   Left drawer
   ========================================================= */
function openLeftPanel() {
  els.leftPanel.classList.add('is-open');
  document.body.classList.add('drawer-open');
  els.toastStack.replaceChildren();
}
function closeLeftPanel() {
  els.leftPanel.classList.remove('is-open');
  document.body.classList.remove('drawer-open');
}

/* =========================================================
   Orientation / view helpers
   ========================================================= */

/* =========================================================
   Pain modal
   ========================================================= */
function openPainModal() {
  if (!appState.selectedId) {
    showToast('先点击一块肌肉，再记录痛点', 'default', 2400);
    return;
  }
  const muscle = MUSCLE_BY_ID[appState.selectedId];
  const preferredSide = appState.selectedSide;
  const existing = appState.records.find((record) =>
    record.muscleId === muscle.id && record.side === preferredSide
  );
  appState.painDraft = {
    muscleId: muscle.id,
    editingId: existing?.id || null,
    side: preferredSide,
    intensity: existing?.intensity ?? 4,
    types: new Set(existing?.types || []),
    duration: existing?.duration || '1–2 周',
    trigger: existing?.trigger || '',
  };
  els.painSelectedIndex.textContent = muscle.code;
  els.painSelectedName.textContent = muscle.zh;
  els.painSelectedEn.textContent = muscle.en;
  els.sideOptions.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.side === appState.painDraft.side);
  });
  els.painTypeOptions.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('is-active', appState.painDraft.types.has(button.dataset.type));
  });
  els.intensityRange.value = String(appState.painDraft.intensity);
  els.durationSelect.value = appState.painDraft.duration;
  if (!els.durationSelect.value) els.durationSelect.value = '1–2 周';
  els.triggerInput.value = appState.painDraft.trigger;
  syncPainSide();
  updateIntensityUI();
  refreshPainEditingState();
  closeLeftPanel();
  openModal('painModal');
}

function syncPainSide() {
  if (!appState.painDraft) return;
  els.painSelectedSide.textContent = getSideName(appState.painDraft.side);
  els.sideOptions.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.side === appState.painDraft.side);
  });
}

function updateIntensityUI() {
  if (!appState.painDraft) return;
  const value = Number(els.intensityRange.value);
  els.intensityValue.innerHTML = `${value}<span>/10</span>`;
  els.intensityRange.style.setProperty('--fill', `${value * 10}%`);
}

function refreshPainEditingState() {
  if (!appState.painDraft) return;
  const duplicate = appState.records.find((record) =>
    record.muscleId === appState.painDraft.muscleId
    && record.side === appState.painDraft.side
    && record.id !== appState.painDraft.editingId
  );
  const editing = appState.painDraft.editingId || duplicate?.id;
  els.savePainBtn.innerHTML = editing ? '更新这个痛点 <span>→</span>' : '加入我的自查 <span>→</span>';
}

function savePainRecord() {
  const draft = appState.painDraft;
  if (!draft) return;
  const muscle = MUSCLE_BY_ID[draft.muscleId];
  if (!muscle) return;

  const duplicateIndex = appState.records.findIndex((record) =>
    record.id === draft.editingId
    || (record.muscleId === draft.muscleId && record.side === draft.side)
  );
  const isEdit = duplicateIndex >= 0;
  if (!isEdit && appState.records.length >= MAX_RECORDS) {
    showToast(`最多记录 ${MAX_RECORDS} 个痛点，请先移除一个`, 'danger', 3000);
    return;
  }

  const previous = isEdit ? appState.records[duplicateIndex] : null;
  const record = {
    id: previous?.id || makeId(),
    muscleId: muscle.id,
    side: draft.side,
    intensity: Number(els.intensityRange.value),
    types: [...draft.types],
    duration: els.durationSelect.value,
    trigger: els.triggerInput.value.trim(),
    createdAt: previous?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (isEdit) appState.records[duplicateIndex] = record;
  else appState.records.push(record);

  appState.selectedSide = draft.side;
  updateSideStamp();
  persistRecords();
  renderRecordedList();
  syncRecordedListMarkers();
  syncGlobalUI();
  if (appState.selectedId === muscle.id) renderDetail(muscle);
  updateAddButton();
  updateFlow();
  closeModal('painModal');
  showToast(
    isEdit ? `已更新「${muscle.zh}」的痛点记录` : `已加入「${muscle.zh}」· ${getSideName(record.side)}`,
    'success',
    3000
  );
}

/* =========================================================
   Check modal & report
   ========================================================= */
function openCheckModal() {
  closeLeftPanel();
  showCheckForm();
  renderRecordedList();
  renderRedFlags();
  openModal('checkModal');
}

function showCheckForm() {
  els.reportView.hidden = true;
  els.checkFormView.hidden = false;
  appState.report = null;
  renderRecordedList();
  resetRestartButton();
  const modalCard = els.checkModal.querySelector('.modal-card');
  if (modalCard) modalCard.scrollTop = 0;
}

function renderRecordedList() {
  els.recordedList.replaceChildren();
  const records = appState.records;
  els.recordedCount.textContent = String(records.length);
  els.generateBtn.disabled = records.length === 0;

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'recorded-empty';
    empty.innerHTML = '<b>还没有记录痛点</b>在模型上选择肌肉，点击“记录这个痛点”。';
    els.recordedList.append(empty);
    return;
  }

  records
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((record, index) => {
      const muscle = MUSCLE_BY_ID[record.muscleId];
      if (!muscle) return;
      const item = document.createElement('div');
      item.className = 'recorded-item';
      item.innerHTML = `
        <span class="recorded-num">${String(index + 1).padStart(2, '0')}</span>
        <div class="recorded-main">
          <b>${escapeHTML(muscle.zh)}</b>
          <span>${escapeHTML(getSideName(record.side))} · ${escapeHTML((record.types || []).join(' / ') || '未选择类型')} · ${escapeHTML(record.duration || '')}</span>
        </div>
        <div class="recorded-tools">
          <span class="recorded-intensity"><i style="--level:${Math.max(0, Math.min(100, record.intensity * 10))}%"></i>${record.intensity}</span>
          <button type="button" class="recorded-remove" data-remove="${record.id}" aria-label="移除${escapeHTML(muscle.zh)}记录">×</button>
        </div>
      `;
      els.recordedList.append(item);
    });
}

function renderRedFlags() {
  els.redflagList.replaceChildren();
  for (const flag of RED_FLAGS) {
    const label = document.createElement('label');
    label.className = 'redflag-item';
    label.innerHTML = `
      <input type="checkbox" value="${flag.id}" ${appState.redFlags.has(flag.id) ? 'checked' : ''} />
      <span class="check-box"></span>
      <span class="redflag-text"><b>${escapeHTML(flag.label)}</b><span>${escapeHTML(flag.hint)}</span></span>
    `;
    els.redflagList.append(label);
  }
}

function removeRecord(id) {
  const record = appState.records.find((item) => item.id === id);
  appState.records = appState.records.filter((item) => item.id !== id);
  persistRecords();
  renderRecordedList();
  syncRecordedListMarkers();
  syncGlobalUI();
  updateAddButton();
  updateFlow();
  updateSideStamp();
  if (appState.selectedId) renderDetail(MUSCLE_BY_ID[appState.selectedId]);
  if (record) showToast('已移除这条痛点记录', 'default', 2000);
}

function generateReportView() {
  if (!appState.records.length) {
    showToast('至少记录一个痛点，才能生成自查小结', 'danger', 2500);
    return;
  }
  const report = generateReport(appState.records, [...appState.redFlags]);
  if (!report) return;
  appState.report = report;
  renderReport(report);
  els.checkFormView.hidden = true;
  els.reportView.hidden = false;
  updateFlow();
  const modalCard = els.checkModal.querySelector('.modal-card');
  if (modalCard) modalCard.scrollTop = 0;
}

function renderReport(report) {
  els.reportDate.textContent = report.dateLabel;
  els.reportHeadline.textContent = report.hasFlags ? '需要优先评估的疼痛线索' : '我的疼痛自查小结';
  els.reportIntro.textContent = report.intro;

  const chainHtml = report.chain.map((item, index) => {
    const arrow = index > 0 ? '<span class="report-chain-arrow">→</span>' : '';
    return `${arrow}<span class="report-chain-item${item.related ? ' is-inferred' : ''}">${escapeHTML(item.name)}${item.related ? ' · 可能' : ''}</span>`;
  }).join('');

  const focusHtml = report.focus.map((item) => `
    <li>
      <b>${escapeHTML(item.zh)}</b> · ${escapeHTML(item.sides.join(' / '))} · ${item.intensity}/10<br />
      常见牵涉：${escapeHTML(item.referral.join('、'))}。<br />
      可以先试：${escapeHTML(item.suggestion)}
    </li>
  `).join('');

  const careHtml = report.care.map((item) => `<li>${escapeHTML(item)}</li>`).join('');

  const flagsHtml = report.flags.length
    ? `${report.flags.map((flag) => `<span class="report-flag">${escapeHTML(flag.label)}</span>`).join('')}
       <p class="report-flag-note">请优先进行医疗评估；如为胸痛、气短、突发无力或大小便异常，请立即就医。</p>`
    : '<div class="report-clear"><span class="clear-dot"></span><span><b>本次未勾选优先就医信号。</b><br />这不等于排除疾病；如果疼痛持续、加重或出现新症状，仍应就医。</span></div>';

  const cautionHtml = report.cautionNotes.length
    ? `<div class="report-panel wide report-caution">
        <h4><span>05</span> 还需要留意</h4>
        <ul class="report-care-list">${report.cautionNotes.map((note) => `<li>${escapeHTML(note)}</li>`).join('')}</ul>
      </div>`
    : '';

  const recordHtml = appState.records.map((record) => {
    const muscle = MUSCLE_BY_ID[record.muscleId];
    if (!muscle) return '';
    const detail = [
      getSideName(record.side),
      `${record.intensity}/10`,
      record.types?.length ? record.types.join(' / ') : '未选类型',
      record.duration,
      record.trigger ? `加重：${record.trigger}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="report-record-row"><span>${escapeHTML(muscle.zh)}</span><em>${escapeHTML(detail)}</em></div>`;
  }).join('');

  els.reportContent.innerHTML = `
    <div class="report-hero">
      <div class="report-hero-label">WHAT YOUR MAP SUGGESTS</div>
      <h3>${escapeHTML(report.headline)}</h3>
      <p>${escapeHTML(report.selectedLine)}</p>
    </div>
    <div class="report-columns">
      <div class="report-panel wide">
        <h4><span>01</span> 你标记的疼痛链</h4>
        <div class="report-chain">${chainHtml}</div>
        <p class="report-panel-note">「可能」标记的是尚未记录、但与已选肌肉常同时紧张的肌群。它们只是观察方向，不代表已经有问题。</p>
      </div>
      <div class="report-panel">
        <h4><span>02</span> 优先观察</h4>
        <ul class="report-focus-list">${focusHtml}</ul>
      </div>
      <div class="report-panel">
        <h4><span>03</span> ${report.hasFlags ? '先这样处理' : '今天可以做什么'}</h4>
        <ul class="report-care-list">${careHtml}</ul>
      </div>
      <div class="report-panel wide">
        <h4><span>04</span> 红旗信号</h4>
        <div class="report-flags">${flagsHtml}</div>
      </div>
      ${cautionHtml}
      <div class="report-panel wide">
        <h4><span>06</span> 本次记录</h4>
        <div class="report-records">${recordHtml}</div>
      </div>
    </div>
  `;
}

function printReport() {
  if (!appState.report) return;
  const originalTitle = document.title;
  document.title = `肌源自查小结-${appState.report.dateLabel}`;
  window.print();
  setTimeout(() => { document.title = originalTitle; }, 800);
}

function handleRestart() {
  if (!appState.restartArmed) {
    appState.restartArmed = true;
    els.restartBtn.textContent = '再次点击确认清空';
    els.restartBtn.classList.add('is-danger');
    appState.restartTimer = setTimeout(resetRestartButton, 3500);
    return;
  }
  appState.records = [];
  appState.redFlags.clear();
  persistRecords();
  renderRecordedList();
  renderRedFlags();
  syncRecordedListMarkers();
  syncGlobalUI();
  updateAddButton();
  updateFlow();
  if (appState.selectedId) renderDetail(MUSCLE_BY_ID[appState.selectedId]);
  showCheckForm();
  resetRestartButton();
  showToast('已清空自查记录，可以重新开始', 'default', 2600);
}

function resetRestartButton() {
  appState.restartArmed = false;
  if (appState.restartTimer) clearTimeout(appState.restartTimer);
  if (!els.restartBtn) return;
  els.restartBtn.textContent = '重新自查';
  els.restartBtn.classList.remove('is-danger');
}

/* =========================================================
   Global sync helpers
   ========================================================= */
function syncGlobalUI() {
  const count = appState.records.length;
  els.checkCount.textContent = String(count);
  els.checkCount.classList.toggle('has-items', count > 0);
  syncRecordedListMarkers();
  updateAddButton();
  updateFlow();
}

function persistRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.records));
  } catch (error) {
    showToast('浏览器无法保存记录，请检查隐私模式设置', 'danger', 3200);
  }
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((record) => record && MUSCLE_BY_ID[record.muscleId])
      .slice(0, MAX_RECORDS)
      .map((record) => ({
        ...record,
        side: ['left', 'right', 'both'].includes(record.side) ? record.side : 'both',
        intensity: Math.max(0, Math.min(10, Number(record.intensity) || 0)),
        types: Array.isArray(record.types) ? record.types.slice(0, 6) : [],
      }));
  } catch (error) {
    return [];
  }
}

/* =========================================================
   Modal helpers
   ========================================================= */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  closeLeftPanel();
  appState.lastFocused = document.activeElement;
  for (const other of $$('.modal-backdrop')) {
    if (other.id !== id) other.hidden = true;
  }
  els.toastStack.replaceChildren();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const focusTarget = modal.querySelector('.modal-close') || modal.querySelector('button');
  setTimeout(() => focusTarget?.focus({ preventScroll: true }), 50);
}

function closeModal(id, restoreFocus = true) {
  const modal = document.getElementById(id);
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const anyOpen = $$('.modal-backdrop').some((item) => !item.hidden);
  if (!anyOpen) {
    document.body.classList.remove('modal-open');
    if (restoreFocus) appState.lastFocused?.focus?.({ preventScroll: true });
  }
}

function handleKeyboard(event) {
  if (event.key === 'Escape') {
    const openModalEl = $$('.modal-backdrop').find((modal) => !modal.hidden);
    if (openModalEl) {
      closeModal(openModalEl.id);
      event.preventDefault();
      return;
    }
    if (els.leftPanel.classList.contains('is-open')) {
      closeLeftPanel();
      event.preventDefault();
      return;
    }
    if (document.activeElement === els.searchInput) {
      els.searchInput.value = '';
      appState.query = '';
      renderMuscleList();
      els.searchInput.blur();
    }
  }

  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    els.searchInput.focus();
    els.searchInput.select();
  }

  if (event.key.toLowerCase() === 'x' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    if (!$$('.modal-backdrop').some((modal) => !modal.hidden)) toggleXray();
  }
}

/* =========================================================
   Deep link / initial state
   ========================================================= */
function processDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const muscleId = params.get('m');
  const view = params.get('view');
  if (muscleId && MUSCLE_BY_ID[muscleId]) {
    selectMuscle(muscleId, { source: 'query', side: 'both' });
    if (view && ['front', 'back', 'left', 'right'].includes(view)) {
      viewer?.setView(view, false);
      setActiveView(view);
    } else {
      viewer?.setView(MUSCLE_BY_ID[muscleId].view, false);
      setActiveView(MUSCLE_BY_ID[muscleId].view);
    }
  } else if (view && ['front', 'back', 'left', 'right'].includes(view)) {
    viewer?.setView(view, false);
    setActiveView(view);
  }
}

/* =========================================================
   Utilities
   ========================================================= */
function showToast(message, type = 'default', duration = 2400) {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'danger' ? ' is-danger' : ''}${type === 'success' ? ' is-success' : ''}`;
  toast.textContent = message;
  els.toastStack.append(toast);
  while (els.toastStack.children.length > 3) els.toastStack.firstElementChild.remove();
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `pain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
