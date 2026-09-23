// SuperScale AI Studio - Frontend Controller

let state = {
  currentFile: null,
  originalDataUrl: null,
  upscaledDataUrl: null,
  selectedScale: 2,
  selectedModel: 'realesr-anime-v3-x4',
  models: [],
  isProcessing: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  viewMode: 'split', // 'split' | 'side'
  sliderPos: 50, // 0 to 100%
  isDraggingSlider: false,
  history: [],
};

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const viewerStage = document.getElementById('viewerStage');
const viewportToolbar = document.getElementById('viewportToolbar');
const clearBtn = document.getElementById('clearBtn');
const upscaleBtn = document.getElementById('upscaleBtn');
const upscaleBtnText = document.getElementById('upscaleBtnText');
const downloadBtn = document.getElementById('downloadBtn');
const modelListContainer = document.getElementById('modelListContainer');
const processingScanline = document.getElementById('processingScanline');

// Slider Elements
const splitSliderContainer = document.getElementById('splitSliderContainer');
const sideBySideContainer = document.getElementById('sideBySideContainer');
const afterWrapper = document.getElementById('afterWrapper');
const sliderHandle = document.getElementById('sliderHandle');
const imgBefore = document.getElementById('imgBefore');
const imgAfter = document.getElementById('imgAfter');
const sideBeforeImg = document.getElementById('sideBeforeImg');
const sideAfterImg = document.getElementById('sideAfterImg');

// Badges & Metrics
const badgeOriginalRes = document.getElementById('badgeOriginalRes');
const badgeUpscaledRes = document.getElementById('badgeUpscaledRes');
const metricsCard = document.getElementById('metricsCard');
const metricOrigRes = document.getElementById('metricOrigRes');
const metricNewRes = document.getElementById('metricNewRes');
const metricPixelBoost = document.getElementById('metricPixelBoost');
const metricLatency = document.getElementById('metricLatency');
const metricFileSize = document.getElementById('metricFileSize');

// Sliders & Zoom
const sharpnessInput = document.getElementById('sharpnessInput');
const sharpnessVal = document.getElementById('sharpnessVal');
const contrastInput = document.getElementById('contrastInput');
const contrastVal = document.getElementById('contrastVal');
const formatSelect = document.getElementById('formatSelect');
const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
const transformBox = document.getElementById('transformBox');

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  fetchModels();
  setupEventListeners();
  setupDragAndDrop();
  setupPasteHandler();
  setupSliderEvents();
  setupZoomAndPan();
});

// --- MODELS ---
async function fetchModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    state.models = data.models || [];
    renderModelList();
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

function renderModelList() {
  modelListContainer.innerHTML = '';
  state.models.forEach(m => {
    const isSelected = m.id === state.selectedModel;
    const card = document.createElement('div');
    card.className = `p-2.5 rounded-xl border text-xs cursor-pointer transition flex flex-col gap-1.5 ${
      isSelected 
        ? 'border-brand-500 bg-brand-500/10 text-white' 
        : 'border-white/5 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/5'
    }`;

    let statusPill = '';
    if (m.type === 'algorithmic') {
      statusPill = `<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">Zero Download</span>`;
    } else if (m.downloaded) {
      statusPill = `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ready</span>`;
    } else if (m.downloading) {
      statusPill = `<span class="px-1.5 py-0.5 rounded text-[10px] bg-brand-500/20 text-brand-300 border border-brand-500/30">Downloading ${m.progress_percent || 0}%</span>`;
    } else {
      statusPill = `<button class="dl-model-btn px-2 py-0.5 rounded text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white transition font-medium" data-id="${m.id}">Get (${m.approx_size_mb}MB)</button>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold flex items-center gap-1.5">
          <i data-lucide="${m.type === 'ai' ? 'sparkles' : 'zap'}" class="w-3.5 h-3.5 text-brand-400"></i>
          <span>${m.name}</span>
        </span>
        ${statusPill}
      </div>
      <p class="text-[11px] text-slate-400 leading-normal">${m.description}</p>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.dl-model-btn')) return;
      state.selectedModel = m.id;
      // Auto adjust scale factor if model has native scale
      if (m.scale === 4) setScale(4);
      if (m.scale === 2) setScale(2);
      renderModelList();
    });

    const dlBtn = card.querySelector('.dl-model-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDownload(m.id);
      });
    }

    modelListContainer.appendChild(card);
  });
  lucide.createIcons();
}

async function triggerDownload(modelId) {
  const formData = new FormData();
  formData.append('model_id', modelId);
  try {
    await fetch('/api/models/download', { method: 'POST', body: formData });
    pollDownloadStatus(modelId);
  } catch (e) {
    alert('Download failed to start: ' + e.message);
  }
}

function pollDownloadStatus(modelId) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      state.models = data.models || [];
      renderModelList();
      const target = state.models.find(m => m.id === modelId);
      if (target && target.downloaded) {
        clearInterval(interval);
      }
    } catch (e) {
      clearInterval(interval);
    }
  }, 1000);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  clearBtn.addEventListener('click', resetStudio);
  upscaleBtn.addEventListener('click', runUpscale);
  downloadBtn.addEventListener('click', downloadCurrentResult);

  // Scale buttons
  document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setScale(parseInt(btn.getAttribute('data-scale')));
    });
  });

  // Sliders fine tuning
  sharpnessInput.addEventListener('input', (e) => {
    sharpnessVal.textContent = parseFloat(e.target.value).toFixed(1) + '×';
  });

  contrastInput.addEventListener('input', (e) => {
    contrastVal.textContent = parseFloat(e.target.value).toFixed(2) + '×';
  });

  // View modes
  const modeSplitBtn = document.getElementById('modeSplitBtn');
  const modeSideBtn = document.getElementById('modeSideBtn');

  modeSplitBtn.addEventListener('click', () => {
    state.viewMode = 'split';
    modeSplitBtn.className = 'px-2.5 py-1 rounded-md font-medium bg-brand-600 text-white shadow transition flex items-center gap-1.5';
    modeSideBtn.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
    splitSliderContainer.classList.remove('hidden');
    sideBySideContainer.classList.add('hidden');
  });

  modeSideBtn.addEventListener('click', () => {
    state.viewMode = 'side';
    modeSideBtn.className = 'px-2.5 py-1 rounded-md font-medium bg-brand-600 text-white shadow transition flex items-center gap-1.5';
    modeSplitBtn.className = 'px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
    splitSliderContainer.classList.add('hidden');
    sideBySideContainer.classList.remove('hidden');
  });

  // Sample buttons
  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadSyntheticSample(btn.getAttribute('data-sample'));
    });
  });
}

function setScale(scale) {
  state.selectedScale = scale;
  document.querySelectorAll('.scale-btn').forEach(b => {
    const isThis = parseInt(b.getAttribute('data-scale')) === scale;
    if (isThis) {
      b.className = 'scale-btn active px-3 py-2 rounded-xl border border-brand-500 bg-brand-500/10 text-white font-bold text-sm flex items-center justify-center gap-2 transition';
    } else {
      b.className = 'scale-btn px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 font-bold text-sm flex items-center justify-center gap-2 transition';
    }
  });
}

// --- FILE HANDLING & DRAG-DROP ---
function setupDragAndDrop() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  window.addEventListener('dragover', () => {
    dropzone.classList.add('border-brand-500', 'bg-indigo-950/40');
  });

  ['dragleave', 'drop'].forEach(evt => {
    window.addEventListener(evt, () => {
      dropzone.classList.remove('border-brand-500', 'bg-indigo-950/40');
    });
  });

  window.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

function setupPasteHandler() {
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        handleFile(file);
        break;
      }
    }
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file (PNG, JPG, WebP).');
    return;
  }
  state.currentFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.originalDataUrl = e.target.result;
    state.upscaledDataUrl = null;
    displayLoadedImage();
  };
  reader.readAsDataURL(file);
}

function displayLoadedImage() {
  dropzone.classList.add('hidden');
  viewerStage.classList.remove('hidden');
  viewportToolbar.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  upscaleBtn.disabled = false;
  downloadBtn.classList.add('hidden');
  metricsCard.classList.add('hidden');

  imgBefore.src = state.originalDataUrl;
  imgAfter.src = state.originalDataUrl;
  sideBeforeImg.src = state.originalDataUrl;
  sideAfterImg.src = state.originalDataUrl;

  const testImg = new Image();
  testImg.onload = () => {
    badgeOriginalRes.textContent = `${testImg.width} × ${testImg.height}`;
    badgeUpscaledRes.textContent = `${testImg.width * state.selectedScale} × ${testImg.height * state.selectedScale}`;
    metricOrigRes.textContent = `${testImg.width} × ${testImg.height}`;
  };
  testImg.src = state.originalDataUrl;

  resetZoom();
  setSliderPosition(50);
}

function resetStudio() {
  state.currentFile = null;
  state.originalDataUrl = null;
  state.upscaledDataUrl = null;
  dropzone.classList.remove('hidden');
  viewerStage.classList.add('hidden');
  viewportToolbar.classList.add('hidden');
  clearBtn.classList.add('hidden');
  upscaleBtn.disabled = true;
  downloadBtn.classList.add('hidden');
  metricsCard.classList.add('hidden');
  fileInput.value = '';
}

// --- SYNTHETIC SAMPLES ---
function loadSyntheticSample(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  if (type === 'anime') {
    // Draw cute stylized cartoon face / character
    const grad = ctx.createLinearGradient(0, 0, 160, 160);
    grad.addColorStop(0, '#fbc2eb');
    grad.addColorStop(1, '#a6c1ee');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 160, 160);

    // Face
    ctx.fillStyle = '#fff0e6';
    ctx.beginPath();
    ctx.arc(80, 85, 45, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.ellipse(65, 80, 7, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(95, 80, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(63, 76, 3, 0, Math.PI * 2);
    ctx.arc(93, 76, 3, 0, Math.PI * 2);
    ctx.fill();

    // Blush & smile
    ctx.fillStyle = '#ff758c';
    ctx.beginPath();
    ctx.arc(58, 92, 5, 0, Math.PI * 2);
    ctx.arc(102, 92, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(80, 92, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

  } else if (type === 'photo') {
    // Landscape with sunset and mountains
    const sky = ctx.createLinearGradient(0, 0, 0, 100);
    sky.addColorStop(0, '#ff7e5f');
    sky.addColorStop(1, '#feb47b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 160, 160);

    // Sun
    ctx.fillStyle = '#fffcb0';
    ctx.beginPath();
    ctx.arc(80, 60, 20, 0, Math.PI * 2);
    ctx.fill();

    // Mountain 1
    ctx.fillStyle = '#3f2b96';
    ctx.beginPath();
    ctx.moveTo(10, 160);
    ctx.lineTo(60, 75);
    ctx.lineTo(120, 160);
    ctx.fill();

    // Mountain 2
    ctx.fillStyle = '#1c1646';
    ctx.beginPath();
    ctx.moveTo(70, 160);
    ctx.lineTo(115, 90);
    ctx.lineTo(160, 160);
    ctx.fill();

  } else {
    // Pixel Art Logo
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 160, 160);
    const colors = ['#6366f1', '#818cf8', '#a5b4fc', '#38bdf8', '#34d399'];
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        if ((i + j) % 3 === 0 || (i * j) % 5 === 0) {
          ctx.fillStyle = colors[(i + j) % colors.length];
          ctx.fillRect(i * 10, j * 10, 10, 10);
        }
      }
    }
  }

  canvas.toBlob((blob) => {
    const file = new File([blob], `sample_${type}.png`, { type: 'image/png' });
    handleFile(file);
  }, 'image/png');
}

// --- COMPARISON SLIDER ---
function setupSliderEvents() {
  const onMove = (clientX) => {
    if (!state.isDraggingSlider) return;
    const rect = splitSliderContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  sliderHandle.addEventListener('mousedown', (e) => {
    state.isDraggingSlider = true;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => onMove(e.clientX));
  window.addEventListener('mouseup', () => { state.isDraggingSlider = false; });

  // Touch support
  sliderHandle.addEventListener('touchstart', (e) => {
    state.isDraggingSlider = true;
    e.preventDefault();
  });
  window.addEventListener('touchmove', (e) => {
    if (e.touches[0]) onMove(e.touches[0].clientX);
  });
  window.addEventListener('touchend', () => { state.isDraggingSlider = false; });

  // Click anywhere on container to move slider
  splitSliderContainer.addEventListener('click', (e) => {
    const rect = splitSliderContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPosition((x / rect.width) * 100);
  });
}

function setSliderPosition(percent) {
  state.sliderPos = percent;
  afterWrapper.style.width = `${percent}%`;
  sliderHandle.style.left = `${percent}%`;
}

// --- ZOOM & PAN ---
function setupZoomAndPan() {
  document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(state.zoom + 0.5));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(state.zoom - 0.5));
  document.getElementById('zoomFitBtn').addEventListener('click', resetZoom);

  // Mouse wheel zoom
  viewerStage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom(state.zoom + delta);
  });

  // Pan by dragging
  viewerStage.addEventListener('mousedown', (e) => {
    if (e.target.closest('#sliderHandle')) return;
    if (state.zoom <= 1) return;
    state.isPanning = true;
    state.panStartX = e.clientX - state.panX;
    state.panStartY = e.clientY - state.panY;
    viewerStage.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isPanning) return;
    state.panX = e.clientX - state.panStartX;
    state.panY = e.clientY - state.panStartY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isPanning = false;
    viewerStage.style.cursor = 'default';
  });
}

function setZoom(z) {
  state.zoom = Math.max(1, Math.min(6, z));
  if (state.zoom === 1) {
    state.panX = 0;
    state.panY = 0;
  }
  zoomLevelDisplay.textContent = `${Math.round(state.zoom * 100)}%`;
  applyTransform();
}

function resetZoom() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  zoomLevelDisplay.textContent = '100%';
  applyTransform();
}

function applyTransform() {
  transformBox.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

// --- UPSCALING EXECUTION ---
async function runUpscale() {
  if (!state.currentFile || state.isProcessing) return;

  state.isProcessing = true;
  upscaleBtn.disabled = true;
  upscaleBtnText.textContent = 'Enhancing Pixels...';
  processingScanline.classList.remove('hidden');

  const formData = new FormData();
  formData.append('file', state.currentFile);
  formData.append('model_id', state.selectedModel);
  formData.append('scale', state.selectedScale);
  formData.append('sharpness', sharpnessInput.value);
  formData.append('contrast', contrastInput.value);
  formData.append('output_format', formatSelect.value);

  try {
    const res = await fetch('/api/upscale', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Upscaling failed');
    }

    const data = await res.json();
    state.upscaledDataUrl = data.image;

    // Update images
    imgAfter.src = state.upscaledDataUrl;
    sideAfterImg.src = state.upscaledDataUrl;

    const meta = data.metadata;
    badgeUpscaledRes.textContent = `${meta.upscaled_width} × ${meta.upscaled_height}`;
    metricNewRes.textContent = `${meta.upscaled_width} × ${meta.upscaled_height}`;
    const pixelFactor = Math.round((meta.upscaled_width * meta.upscaled_height) / (meta.original_width * meta.original_height));
    metricPixelBoost.textContent = `${pixelFactor}× More Pixels`;
    metricLatency.textContent = `${meta.latency_ms} ms (${(meta.latency_ms / 1000).toFixed(2)}s)`;
    metricFileSize.textContent = `${(meta.output_size_bytes / 1024).toFixed(1)} KB`;

    metricsCard.classList.remove('hidden');
    downloadBtn.classList.remove('hidden');

    // Add to history
    addToHistory({
      thumbnail: state.upscaledDataUrl,
      width: meta.upscaled_width,
      height: meta.upscaled_height,
      scale: meta.scale_factor,
      model: meta.model_name,
      blobUrl: state.upscaledDataUrl,
      format: meta.format,
    });

  } catch (err) {
    alert('Upscaling error: ' + err.message);
  } finally {
    state.isProcessing = false;
    upscaleBtn.disabled = false;
    upscaleBtnText.textContent = 'Upscale Image';
    processingScanline.classList.add('hidden');
  }
}

// --- HISTORY & DOWNLOAD ---
function addToHistory(item) {
  state.history.unshift(item);
  renderHistory();
}

function renderHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';
  state.history.forEach((h, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'w-12 h-12 rounded-lg border border-white/10 hover:border-brand-500 overflow-hidden cursor-pointer relative group flex-shrink-0 transition';
    thumb.innerHTML = `
      <img src="${h.thumbnail}" class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-brand-600/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
        <i data-lucide="download" class="w-3.5 h-3.5 text-white"></i>
      </div>
    `;
    thumb.addEventListener('click', () => {
      downloadFile(h.blobUrl, `upscaled-${h.scale}x-${Date.now()}.${h.format || 'png'}`);
    });
    historyList.appendChild(thumb);
  });
  lucide.createIcons();
}

function downloadCurrentResult() {
  if (!state.upscaledDataUrl) return;
  const ext = formatSelect.value || 'png';
  const filename = `upscaled-${state.selectedScale}x-${Date.now()}.${ext}`;
  downloadFile(state.upscaledDataUrl, filename);
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
