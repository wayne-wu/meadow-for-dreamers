const EXPORT_WIDTH = 512;
const EXPORT_HEIGHT = 1024;
const MIN_VISIBLE_PIXELS = 240;
const MAX_UNDO_STEPS = 24;

const palette = [
  ['Cream Ivory', '#F1E2C8'],
  ['Blush Pink', '#E8B7B6'],
  ['Dusty Rose', '#C9888B'],
  ['Soft Peach', '#E7B38E'],
  ['Pale Lavender', '#B9A8D8'],
  ['Powder Blue', '#9FB9D7'],
  ['Muted Coral', '#B4635A'],
  ['Dried Sage', '#7F9471'],
  ['Eucalyptus Green', '#A1B392'],
  ['Olive Straw', '#B5A76E'],
  ['Warm Pollen Gold', '#E8C46B'],
  ['Soft Amber Glow', '#F0B66A']
];

const welcomeScene = document.querySelector('#welcome-scene');
const drawingScene = document.querySelector('#drawing-scene');
const thanksScene = document.querySelector('#thanks-scene');
const startButton = document.querySelector('#start-button');
const canvas = document.querySelector('#drawing-canvas');
const brushInput = document.querySelector('#brush-size');
const paletteEl = document.querySelector('#palette');
const undoButton = document.querySelector('#undo-button');
const clearButton = document.querySelector('#clear-button');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const submitIcon = document.querySelector('#submit-icon');
const drawAnotherButton = document.querySelector('#draw-another-button');
const statusMessage = document.querySelector('#status-message');
const context = canvas.getContext('2d', { willReadFrequently: true });

let selectedColor = palette[1][1];
let brushSize = Number(brushInput.value);
let drawing = false;
let lastPoint = null;
let lastMidPoint = null;
let visiblePixels = 0;
let undoStack = [];
let lastTouchEndAt = 0;
let hasDrawnSinceValidation = false;

canvas.width = EXPORT_WIDTH;
canvas.height = EXPORT_HEIGHT;

function showScene(scene) {
  [welcomeScene, drawingScene, thanksScene].forEach((currentScene) => {
    currentScene.classList.toggle('active', currentScene === scene);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getOrCreateSessionId() {
  const key = 'studio-meadow-session-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const next =
    window.crypto && 'randomUUID' in window.crypto
      ? window.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(key, next);
  return next;
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function countVisiblePixels() {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;

  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 24) count += 1;
  }

  return count;
}

function setStatus(state, message = '') {
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', state === 'error');
  submitButton.classList.toggle('sent', state === 'sent');

  if (state === 'sending') {
    submitButton.disabled = true;
    submitLabel.textContent = 'Sending';
    return;
  }

  if (state === 'sent') {
    submitLabel.textContent = 'Sent';
    submitIcon.innerHTML = '<path d="M20 6 9 17l-5-5" />';
    submitButton.disabled = false;
    return;
  }

  submitLabel.textContent = 'Send flower';
  submitIcon.innerHTML = '<path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />';
  submitButton.disabled = !hasDrawnSinceValidation && visiblePixels < MIN_VISIBLE_PIXELS;
}

function updateVisiblePixelCount() {
  visiblePixels = countVisiblePixels();
  hasDrawnSinceValidation = false;
  submitButton.disabled = visiblePixels < MIN_VISIBLE_PIXELS;
}

function pushUndoState() {
  undoStack = [
    ...undoStack.slice(-(MAX_UNDO_STEPS - 1)),
    context.getImageData(0, 0, canvas.width, canvas.height)
  ];
}

function beginStroke(event) {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pushUndoState();
  setStatus('idle');

  const point = getCanvasPoint(event);
  drawing = true;
  lastPoint = point;
  lastMidPoint = point;

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = selectedColor;
  context.fillStyle = selectedColor;
  context.lineWidth = brushSize;
  context.beginPath();
  context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
  context.fill();
  hasDrawnSinceValidation = true;
  submitButton.disabled = false;
}

function drawToPoint(point) {
  if (!lastPoint || !lastMidPoint) return;
  const middlePoint = {
    x: (lastPoint.x + point.x) / 2,
    y: (lastPoint.y + point.y) / 2
  };

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = selectedColor;
  context.lineWidth = brushSize;
  context.beginPath();
  context.moveTo(lastMidPoint.x, lastMidPoint.y);
  context.quadraticCurveTo(lastPoint.x, lastPoint.y, middlePoint.x, middlePoint.y);
  context.stroke();

  lastPoint = point;
  lastMidPoint = middlePoint;
}

function continueStroke(event) {
  if (!drawing || !lastPoint) return;

  event.preventDefault();
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];

  events.forEach((currentEvent) => {
    drawToPoint(getCanvasPoint(currentEvent));
  });
}

function endStroke(event) {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (drawing && lastPoint && lastMidPoint) {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = selectedColor;
    context.lineWidth = brushSize;
    context.beginPath();
    context.moveTo(lastMidPoint.x, lastMidPoint.y);
    context.lineTo(lastPoint.x, lastPoint.y);
    context.stroke();
  }

  drawing = false;
  lastPoint = null;
  lastMidPoint = null;
}

function undo() {
  const previous = undoStack.pop();
  if (!previous) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(previous, 0, 0);
  setStatus('idle');
  updateVisiblePixelCount();
}

function clearCanvas() {
  pushUndoState();
  context.clearRect(0, 0, canvas.width, canvas.height);
  setStatus('idle');
  updateVisiblePixelCount();
}

function resetDrawing() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
  drawing = false;
  lastPoint = null;
  lastMidPoint = null;
  hasDrawnSinceValidation = false;
  setStatus('idle');
  updateVisiblePixelCount();
}

async function submitFlower(payload) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    window.localStorage.setItem('studio-meadow-last-flower', JSON.stringify(payload));
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    return;
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/flowers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Submission failed');
  }
}

function getApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const apiFromQuery = params.get('api');

  if (apiFromQuery) {
    window.localStorage.setItem('studio-meadow-api-base-url', apiFromQuery);
    return apiFromQuery;
  }

  return (
    window.STUDIO_MEADOW_API_BASE_URL ||
    window.localStorage.getItem('studio-meadow-api-base-url') ||
    getDefaultLocalApiBaseUrl()
  );
}

function getDefaultLocalApiBaseUrl() {
  if (!window.location.hostname) return '';
  if (window.location.port && window.location.port !== '8787') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  return window.location.origin;
}

async function handleSubmit() {
  updateVisiblePixelCount();

  if (visiblePixels < MIN_VISIBLE_PIXELS) {
    setStatus('error', 'Add a little more to your flower before sending.');
    return;
  }

  try {
    setStatus('sending');
    await submitFlower({
      session_id: getOrCreateSessionId(),
      meadow_session_id: getMeadowSessionId(),
      name: null,
      image_base64: canvas.toDataURL('image/png')
    });
    setStatus('sent');
    showScene(thanksScene);
  } catch {
    setStatus('error', 'This flower could not be sent. Please try again.');
  }
}

function getMeadowSessionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || params.get('meadow_session_id') || null;
}

function renderPalette() {
  palette.forEach(([name, value]) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = value === selectedColor ? 'swatch active' : 'swatch';
    swatch.style.backgroundColor = value;
    swatch.title = name;
    swatch.setAttribute('aria-label', name);
    swatch.setAttribute('aria-pressed', String(value === selectedColor));
    swatch.addEventListener('click', () => {
      selectedColor = value;
      document.querySelectorAll('.swatch').forEach((button) => {
        const isActive = button === swatch;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    });
    paletteEl.appendChild(swatch);
  });
}

renderPalette();
updateVisiblePixelCount();

startButton.addEventListener('click', () => {
  showScene(drawingScene);
});

drawAnotherButton.addEventListener('click', () => {
  resetDrawing();
  showScene(welcomeScene);
});

brushInput.addEventListener('input', (event) => {
  brushSize = Number(event.target.value);
});

canvas.addEventListener('pointerdown', beginStroke);
canvas.addEventListener('pointermove', continueStroke);
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();
    if (now - lastTouchEndAt < 350) {
      event.preventDefault();
    }
    lastTouchEndAt = now;
  },
  { passive: false }
);
document.addEventListener(
  'gesturestart',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);
undoButton.addEventListener('click', undo);
clearButton.addEventListener('click', clearCanvas);
submitButton.addEventListener('click', handleSubmit);
