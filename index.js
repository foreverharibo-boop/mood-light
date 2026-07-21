// MoodLight — AI-powered theme color override for SillyTavern
import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'moodlight';
const STYLE_ID = 'moodlight-override-style';

// Default ST CSS variables
const DEFAULT_VARS = [
    { key: 'bodyColor',     css: '--SmartThemeBodyColor',            label: 'Text' },
    { key: 'blurTintColor', css: '--SmartThemeBlurTintColor',        label: 'Panel BG',  tint: true },
    { key: 'borderColor',   css: '--SmartThemeBorderColor',          label: 'Border' },
    { key: 'chatTintColor', css: '--SmartThemeChatTintColor',        label: 'Chat BG',   tint: true },
    { key: 'userMesColor',  css: '--SmartThemeUserMesBlurTintColor', label: 'User Msg',  tint: true },
    { key: 'botMesColor',   css: '--SmartThemeBotMesBlurTintColor',  label: 'Bot Msg',   tint: true },
    { key: 'quoteColor',    css: '--SmartThemeQuoteColor',           label: 'Quote' },
    { key: 'emColor',       css: '--SmartThemeEmColor',              label: 'Emphasis' },
];

const HARMONY_TYPES = [
    { id: 'complementary',       label: '보색',         angles: [180] },
    { id: 'analogous',           label: '유사색',       angles: [-30, 30] },
    { id: 'triadic',             label: '삼각 배색',    angles: [120, 240] },
    { id: 'split-complementary', label: '분할 보색',    angles: [150, 210] },
    { id: 'tetradic',            label: '사각 배색',    angles: [90, 180, 270] },
];

const DEFAULT_SETTINGS = {
    selectedProfile: '',
    presets: [],
    activePresetId: null,
    customVars: [],
    disabledVars: [],
};

let currentColors = null;
let modalEl = null;

// ===== Settings =====

function loadSettings() {
    if (!extension_settings[EXT]) {
        extension_settings[EXT] = structuredClone(DEFAULT_SETTINGS);
    }
    const s = extension_settings[EXT];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (s[k] === undefined) s[k] = typeof v === 'object' ? structuredClone(v) : v;
    }
}

function settings() { return extension_settings[EXT]; }
function save() { saveSettingsDebounced(); }

// ===== Variable Management =====

function getActiveVars() {
    const custom = (settings().customVars || []).map(v => ({ ...v, custom: true }));
    return [...DEFAULT_VARS, ...custom];
}

function isVarEnabled(cssName) {
    return !(settings().disabledVars || []).includes(cssName);
}

function toggleVar(cssName, enabled) {
    const s = settings();
    if (!s.disabledVars) s.disabledVars = [];
    if (enabled) {
        s.disabledVars = s.disabledVars.filter(v => v !== cssName);
    } else {
        if (!s.disabledVars.includes(cssName)) s.disabledVars.push(cssName);
    }
    save();
    // 현재 적용 중이면 다시 주입
    if (currentColors) injectColors(currentColors);
}

function addCustomVar(css, label) {
    const s = settings();
    if (!s.customVars) s.customVars = [];
    const key = css.replace(/^--/, '').replace(/[^a-zA-Z0-9]/g, '_');
    if (getActiveVars().some(v => v.css === css)) return false;
    s.customVars.push({ key, css, label: label || css });
    save();
    return true;
}

function removeCustomVar(css) {
    const s = settings();
    s.customVars = (s.customVars || []).filter(v => v.css !== css);
    s.disabledVars = (s.disabledVars || []).filter(v => v !== css);
    save();
}

// ===== Connection Profile =====

function getConnectionProfiles() {
    const select = document.getElementById('connection_profiles');
    if (!select) return [];
    return Array.from(select.options)
        .filter(opt => opt.value)
        .map(opt => ({ id: opt.value, name: opt.textContent.trim() }));
}

function getCurrentProfileId() {
    return document.getElementById('connection_profiles')?.value || '';
}

async function switchProfile(profileId) {
    const select = document.getElementById('connection_profiles');
    if (!select || !profileId || select.value === profileId) return false;
    select.value = profileId;
    select.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 500));
    return true;
}

// ===== CSS Injection =====

function getStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.documentElement.appendChild(el);
    }
    return el;
}

function readOriginalAlpha(cssVar) {
    const el = document.getElementById(STYLE_ID);
    const backup = el ? el.textContent : '';
    if (el) el.textContent = '';
    const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (el) el.textContent = backup;
    const m = raw.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/);
    return (m && m[1] !== undefined) ? parseFloat(m[1]) : 1;
}

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function processColor(v, rawColor) {
    const hex = toHex(rawColor);
    if (!v.tint) return hex;
    const alpha = readOriginalAlpha(v.css);
    return alpha >= 1 ? hex : hexToRgba(hex, alpha);
}

function injectColors(colors) {
    if (!colors) return;
    const vars = getActiveVars();
    const lines = vars
        .filter(v => colors[v.key] && isVarEnabled(v.css))
        .map(v => `  ${v.css}: ${processColor(v, colors[v.key])} !important;`);
    if (!lines.length) { getStyleEl().textContent = ''; return; }
    getStyleEl().textContent = `:root {\n${lines.join('\n')}\n}`;
    currentColors = { ...colors };
}

function clearInjection() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.textContent = '';
    currentColors = null;
    settings().activePresetId = null;
    save();
}

// ===== Color Helpers =====

function toHex(color) {
    try {
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const m = computed.match(/\d+/g);
        if (m) return '#' + m.slice(0, 3).map(c => Number(c).toString(16).padStart(2, '0')).join('');
    } catch {}
    return '#888888';
}

function hexToHSL(hex) {
    const h = hex.replace('#', '');
    let r = parseInt(h.substring(0, 2), 16) / 255;
    let g = parseInt(h.substring(2, 4), 16) / 255;
    let b = parseInt(h.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hue = 0, sat = 0, lit = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) hue = ((b - r) / d + 2) / 6;
        else hue = ((r - g) / d + 4) / 6;
    }
    return { h: hue * 360, s: sat * 100, l: lit * 100 };
}

function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

// WCAG 상대 휘도
function relativeLuminance(hex) {
    const h = hex.replace('#', '');
    const srgb = [0, 2, 4].map(i => {
        let c = parseInt(h.substring(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// 대비 4.5:1 미달 시 텍스트 색 자동 보정
function ensureContrast(colors) {
    const vars = getActiveVars();
    const bgKeys = vars.filter(v => v.tint).map(v => v.key);
    const fgKeys = vars.filter(v => !v.tint).map(v => v.key);

    // 대표 배경색 (blurTintColor 우선)
    const bgKey = bgKeys.find(k => colors[k]) || bgKeys[0];
    const bgColor = colors[bgKey];
    if (!bgColor) return colors;

    const fixed = { ...colors };
    for (const fk of fgKeys) {
        if (!fixed[fk]) continue;
        let hex = toHex(fixed[fk]);
        let ratio = contrastRatio(hex, toHex(bgColor));
        if (ratio >= 4.5) continue;

        // 배경이 어두우면 텍스트를 밝게, 밝으면 어둡게
        const bgLum = luminance(toHex(bgColor));
        const hsl = hexToHSL(hex);
        const dir = bgLum < 128 ? 1 : -1;
        let attempts = 0;
        while (ratio < 4.5 && attempts < 30) {
            hsl.l = Math.max(0, Math.min(100, hsl.l + dir * 3));
            hex = hslToHex(hsl.h, hsl.s, hsl.l);
            ratio = contrastRatio(hex, toHex(bgColor));
            attempts++;
        }
        fixed[fk] = hex;
    }
    return fixed;
}

// ===== Image Color Extraction =====

function extractColorsFromImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxDim = 100;
                const ratio = Math.min(maxDim / img.width, maxDim / img.height);
                canvas.width = Math.floor(img.width * ratio);
                canvas.height = Math.floor(img.height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);

                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const colors = quantizeAndMap(data);
                resolve(colors);
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')); };
        img.src = url;
    });
}

function quantizeAndMap(imageData) {
    // 색상 버킷 (각 채널 32단위 = 8레벨, 512 버킷)
    const buckets = {};
    for (let i = 0; i < imageData.length; i += 4) {
        if (imageData[i + 3] < 128) continue;
        const r = Math.round(imageData[i] / 32) * 32;
        const g = Math.round(imageData[i + 1] / 32) * 32;
        const b = Math.round(imageData[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        if (!buckets[key]) buckets[key] = { r, g, b, count: 0 };
        buckets[key].count++;
    }

    // 빈도순 정렬 후 상위 추출
    let sorted = Object.values(buckets).sort((a, b) => b.count - a.count);

    // 너무 비슷한 색 제거 (거리 40 이내)
    const distinct = [];
    for (const c of sorted) {
        const tooClose = distinct.some(d =>
            Math.abs(d.r - c.r) + Math.abs(d.g - c.g) + Math.abs(d.b - c.b) < 60
        );
        if (!tooClose) distinct.push(c);
        if (distinct.length >= 16) break;
    }

    // hex로 변환 후 밝기순 정렬
    const hexColors = distinct.map(c =>
        '#' + [c.r, c.g, c.b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('')
    );
    hexColors.sort((a, b) => luminance(a) - luminance(b));

    // 변수에 매핑: 어두운 것 → 배경, 밝은 것 → 텍스트
    return ensureContrast(mapColorsToVars(hexColors));
}

function mapColorsToVars(sortedHexColors) {
    const vars = getActiveVars();
    const n = vars.length;
    const colors = {};

    // 분류: tint(배경) 변수 = 어두운 색, 나머지 = 밝은 색
    const bgVars = vars.filter(v => v.tint);
    const fgVars = vars.filter(v => !v.tint);

    // 충분한 색이 없으면 보간
    while (sortedHexColors.length < n) {
        const last = sortedHexColors[sortedHexColors.length - 1] || '#888888';
        const hsl = hexToHSL(last);
        sortedHexColors.push(hslToHex(hsl.h + 20, hsl.s, Math.min(95, hsl.l + 10)));
    }

    // 어두운 쪽에서 배경 변수에 할당
    bgVars.forEach((v, i) => {
        colors[v.key] = sortedHexColors[i % sortedHexColors.length];
    });

    // 밝은 쪽에서 전경 변수에 할당
    const bright = sortedHexColors.slice().reverse();
    fgVars.forEach((v, i) => {
        colors[v.key] = bright[i % bright.length];
    });

    return colors;
}

// ===== Color Harmony Engine =====

function generateHarmony(baseHex, harmonyType) {
    const harmony = HARMONY_TYPES.find(h => h.id === harmonyType) || HARMONY_TYPES[0];
    const base = hexToHSL(baseHex);

    const hues = [base.h, ...harmony.angles.map(a => (base.h + a + 360) % 360)];
    const vars = getActiveVars();
    const bgVars = vars.filter(v => v.tint);
    const fgVars = vars.filter(v => !v.tint);
    const colors = {};

    // 배경 변수: 베이스에서 밝기만 낮추고 채도 유지 (상대 오프셋)
    bgVars.forEach((v, i) => {
        const hue = hues[i % hues.length];
        const darkOffset = 10 + i * 5; // 차이를 조금씩 벌림
        colors[v.key] = hslToHex(
            hue,
            Math.max(5, base.s - 10),
            Math.max(5, Math.min(30, base.l - darkOffset))
        );
    });

    // 전경 변수: 베이스에서 밝기 올리고 채도 살짝 조정
    fgVars.forEach((v, i) => {
        const hue = hues[i % hues.length];
        const lightOffset = 20 + i * 8;
        colors[v.key] = hslToHex(
            hue,
            Math.max(10, base.s - 5 + i * 3),
            Math.min(95, base.l + lightOffset)
        );
    });

    return ensureContrast(colors);
}

// ===== AI Generation =====

function buildPrompt(mood, existingColors) {
    const vars = getActiveVars();
    const keys = vars.map(v => `"${v.key}"`).join(', ');

    if (existingColors) {
        const currentJson = JSON.stringify(existingColors, null, 2);
        return [
            'You are a UI color palette designer for a chat application.',
            `Here is the current color palette:\n${currentJson}`,
            `The user wants to modify it: "${mood}"`,
            'Apply the requested changes while keeping the overall palette cohesive.',
            'Only change what the user asked for. Keep other colors consistent.',
            `Return ONLY a raw JSON object with these exact keys: ${keys}.`,
            'ALL values must be hex colors in #RRGGBB format. Do NOT use rgba() or rgb().',
            'No markdown, no backticks, no explanation. Only the raw JSON object.',
        ].join('\n');
    }

    return [
        'You are a UI color palette designer for a chat application.',
        `Given the mood/atmosphere: "${mood}"`,
        `Generate a cohesive color palette. Return ONLY a raw JSON object with these exact keys: ${keys}.`,
        'ALL values must be hex colors in #RRGGBB format. Do NOT use rgba() or rgb().',
        'CRITICAL: text colors (bodyColor, quoteColor, emColor) MUST have at least WCAG 4.5:1 contrast ratio against background colors (blurTintColor, chatTintColor). Make text clearly readable.',
        'Match the brightness and saturation to the mood described.',
        'No markdown, no backticks, no explanation. Only the raw JSON object.',
    ].join('\n');
}

async function generateColors(mood, existingColors) {
    const s = settings();
    const targetProfile = s.selectedProfile;
    const originalProfile = getCurrentProfileId();
    let switched = false;

    try {
        if (targetProfile && targetProfile !== originalProfile) {
            switched = await switchProfile(targetProfile);
        }

        const context = getContext();
        if (typeof context.generateQuietPrompt !== 'function') {
            throw new Error('generateQuietPrompt을 사용할 수 없습니다. ST 버전을 확인해주세요.');
        }

        const prompt = buildPrompt(mood, existingColors);
        const result = await context.generateQuietPrompt(prompt, false, false);
        if (!result) throw new Error('AI 응답이 비어있습니다.');

        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`JSON을 찾을 수 없습니다.\n응답: ${result.slice(0, 200)}`);

        const colors = JSON.parse(jsonMatch[0]);
        const vars = getActiveVars();
        const valid = vars.some(v => colors[v.key]);
        if (!valid) throw new Error('유효한 색상이 없습니다.');
        return ensureContrast(colors);
    } finally {
        if (switched && originalProfile) {
            await switchProfile(originalProfile);
        }
    }
}

// ===== Presets =====

function savePreset(name, colors) {
    const s = settings();
    const id = Date.now().toString(36);
    s.presets.push({ id, name, colors: { ...colors } });
    s.activePresetId = id;
    save();
    return id;
}

function deletePreset(id) {
    const s = settings();
    s.presets = s.presets.filter(p => p.id !== id);
    if (s.activePresetId === id) s.activePresetId = null;
    save();
}

function applyPreset(id) {
    const s = settings();
    const preset = s.presets.find(p => p.id === id);
    if (!preset) return;
    injectColors(preset.colors);
    s.activePresetId = id;
    save();
}

// ===== Modal UI =====

function createModal() {
    if (modalEl) return modalEl;

    const backdrop = document.createElement('div');
    backdrop.className = 'moodlight-backdrop';
    backdrop.innerHTML = `
        <div class="moodlight-modal">
          <div class="moodlight-modal-scroll">
            <div class="moodlight-header">
                <span class="moodlight-title">MoodLight</span>
                <button class="moodlight-close">✕</button>
            </div>

            <!-- Mode Tabs -->
            <div class="moodlight-tabs">
                <button class="moodlight-tab active" data-mode="ai">AI 생성</button>
                <button class="moodlight-tab" data-mode="image">이미지</button>
                <button class="moodlight-tab" data-mode="harmony">하모니</button>
            </div>

            <!-- AI Mode -->
            <div class="moodlight-mode" data-mode="ai">
                <div class="moodlight-input-row">
                    <input class="moodlight-mood-input" type="text"
                        placeholder="분위기 또는 수정 지시 (예: 텍스트 더 밝게)" />
                    <button class="moodlight-generate-btn">생성</button>
                </div>
            </div>

            <!-- Image Mode -->
            <div class="moodlight-mode" data-mode="image" style="display:none;">
                <label class="moodlight-dropzone">
                    <input type="file" accept="image/*" style="display:none;" />
                    <span class="moodlight-dropzone-text">이미지를 선택하세요</span>
                </label>
                <button class="moodlight-extract-btn" disabled>추출</button>
            </div>

            <!-- Harmony Mode -->
            <div class="moodlight-mode" data-mode="harmony" style="display:none;">
                <div class="moodlight-harmony-row">
                    <div class="moodlight-base-color-wrap">
                        <div class="moodlight-base-swatch" style="background:#6C8EBF;"></div>
                        <input type="color" class="moodlight-base-picker" value="#6C8EBF" />
                    </div>
                    <select class="moodlight-harmony-type">
                        ${HARMONY_TYPES.map(h => `<option value="${h.id}">${h.label}</option>`).join('')}
                    </select>
                    <button class="moodlight-harmony-btn">생성</button>
                </div>
            </div>

            <div class="moodlight-status"></div>
            <div class="moodlight-preview"></div>

            <div class="moodlight-actions" style="display:none;">
                <button data-action="apply">적용</button>
                <button data-action="save">저장</button>
                <button data-action="reset">초기화</button>
            </div>

            <hr class="moodlight-divider">

            <!-- Variable Management -->
            <div class="moodlight-var-manager">
                <div class="moodlight-var-header">
                    <span>변수 관리</span>
                    <span class="moodlight-var-toggle-icon">▶</span>
                </div>
                <div class="moodlight-var-content" style="display:none;">
                    <div class="moodlight-var-list"></div>
                    <div class="moodlight-var-add-row">
                        <input type="text" class="moodlight-var-add-css" placeholder="--CSS변수명" />
                        <input type="text" class="moodlight-var-add-label" placeholder="라벨" />
                        <button class="moodlight-var-add-btn">+</button>
                    </div>
                </div>
            </div>

            <hr class="moodlight-divider">

            <div class="moodlight-presets-header">
                <span class="moodlight-presets-label">저장된 프리셋</span>
                <div class="moodlight-presets-actions">
                    <button class="moodlight-export-btn" title="내보내기">↑</button>
                    <label class="moodlight-import-btn" title="가져오기">↓<input type="file" accept=".json" style="display:none;" /></label>
                </div>
            </div>
            <div class="moodlight-presets-list"></div>
          </div>
        </div>
    `;

    // --- Close ---
    backdrop.querySelector('.moodlight-close').addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

    // --- Tabs ---
    backdrop.querySelectorAll('.moodlight-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            backdrop.querySelectorAll('.moodlight-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            backdrop.querySelectorAll('.moodlight-mode').forEach(m => m.style.display = 'none');
            backdrop.querySelector(`.moodlight-mode[data-mode="${tab.dataset.mode}"]`).style.display = '';
        });
    });

    // --- AI Mode ---
    const aiInput = backdrop.querySelector('.moodlight-mood-input');
    const genBtn = backdrop.querySelector('.moodlight-generate-btn');

    async function onAIGenerate() {
        const mood = aiInput.value.trim();
        if (!mood) return;
        genBtn.disabled = true;
        const isRefine = !!currentColors;
        setStatus(`<span class="moodlight-spinner"></span>${isRefine ? '수정' : '생성'} 중...`, backdrop);
        try {
            const colors = await generateColors(mood, isRefine ? currentColors : null);
            currentColors = colors;
            renderPreview(colors, backdrop);
            backdrop.querySelector('.moodlight-actions').style.display = 'flex';
            setStatus('', backdrop);
            updateGenBtn();
        } catch (e) {
            setStatus(`⚠ ${e.message}`, backdrop);
        }
        genBtn.disabled = false;
    }

    genBtn.addEventListener('click', onAIGenerate);
    aiInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAIGenerate(); }
    });

    // --- Image Mode ---
    const fileInput = backdrop.querySelector('.moodlight-dropzone input[type="file"]');
    const extractBtn = backdrop.querySelector('.moodlight-extract-btn');
    const dropzoneText = backdrop.querySelector('.moodlight-dropzone-text');
    let selectedFile = null;

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            selectedFile = fileInput.files[0];
            dropzoneText.textContent = selectedFile.name;
            extractBtn.disabled = false;
        }
    });

    extractBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        extractBtn.disabled = true;
        setStatus('<span class="moodlight-spinner"></span>색상 추출 중...', backdrop);
        try {
            const colors = await extractColorsFromImage(selectedFile);
            currentColors = colors;
            renderPreview(colors, backdrop);
            backdrop.querySelector('.moodlight-actions').style.display = 'flex';
            setStatus('', backdrop);
            updateGenBtn();
        } catch (e) {
            setStatus(`⚠ ${e.message}`, backdrop);
        }
        extractBtn.disabled = false;
    });

    // --- Harmony Mode ---
    const baseSwatch = backdrop.querySelector('.moodlight-base-swatch');
    const basePicker = backdrop.querySelector('.moodlight-base-picker');
    const harmonySelect = backdrop.querySelector('.moodlight-harmony-type');
    const harmonyBtn = backdrop.querySelector('.moodlight-harmony-btn');

    basePicker.addEventListener('input', () => {
        baseSwatch.style.background = basePicker.value;
    });
    baseSwatch.addEventListener('click', () => basePicker.click());

    harmonyBtn.addEventListener('click', () => {
        const colors = generateHarmony(basePicker.value, harmonySelect.value);
        currentColors = colors;
        renderPreview(colors, backdrop);
        backdrop.querySelector('.moodlight-actions').style.display = 'flex';
        setStatus('', backdrop);
        updateGenBtn();
    });

    // --- Actions ---
    backdrop.querySelector('[data-action="apply"]').addEventListener('click', () => {
        if (currentColors) injectColors(currentColors);
    });

    backdrop.querySelector('[data-action="save"]').addEventListener('click', () => {
        if (!currentColors) return;
        const name = aiInput.value.trim() || '무제';
        savePreset(name, currentColors);
        renderPresetList(backdrop);
    });

    backdrop.querySelector('[data-action="reset"]').addEventListener('click', () => {
        clearInjection();
        currentColors = null;
        backdrop.querySelector('.moodlight-preview').innerHTML = '';
        backdrop.querySelector('.moodlight-actions').style.display = 'none';
        renderPresetList(backdrop);
        setStatus('초기화됨', backdrop);
        updateGenBtn();
    });

    // --- Variable Manager ---
    const varHeader = backdrop.querySelector('.moodlight-var-header');
    const varContent = backdrop.querySelector('.moodlight-var-content');
    const varIcon = backdrop.querySelector('.moodlight-var-toggle-icon');

    varHeader.addEventListener('click', () => {
        const open = varContent.style.display !== 'none';
        varContent.style.display = open ? 'none' : 'flex';
        varIcon.textContent = open ? '▶' : '▼';
        if (!open) renderVarList(backdrop);
    });

    backdrop.querySelector('.moodlight-var-add-btn').addEventListener('click', () => {
        const cssInput = backdrop.querySelector('.moodlight-var-add-css');
        const labelInput = backdrop.querySelector('.moodlight-var-add-label');
        const css = cssInput.value.trim();
        const label = labelInput.value.trim();
        if (!css.startsWith('--')) { setStatus('⚠ --로 시작하는 CSS 변수명을 입력하세요', backdrop); return; }
        if (addCustomVar(css, label)) {
            cssInput.value = '';
            labelInput.value = '';
            renderVarList(backdrop);
        } else {
            setStatus('⚠ 이미 존재하는 변수입니다', backdrop);
        }
    });

    // --- Export / Import ---
    backdrop.querySelector('.moodlight-export-btn').addEventListener('click', exportPresets);
    backdrop.querySelector('.moodlight-import-btn input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const count = await importPresets(file);
            setStatus(`${count}개 프리셋 가져옴`, backdrop);
            renderPresetList(backdrop);
        } catch (err) {
            setStatus(`⚠ ${err.message}`, backdrop);
        }
        e.target.value = '';
    });

    document.documentElement.appendChild(backdrop);
    modalEl = backdrop;
    return backdrop;
}

function renderPreview(colors, container) {
    const previewEl = container.querySelector('.moodlight-preview');
    previewEl.innerHTML = '';
    const vars = getActiveVars();

    for (const v of vars) {
        const color = colors[v.key];
        if (!color) continue;
        const enabled = isVarEnabled(v.css);

        const row = document.createElement('div');
        row.className = 'moodlight-preview-row' + (enabled ? '' : ' disabled');

        // Toggle
        const toggle = document.createElement('label');
        toggle.className = 'moodlight-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = enabled;
        checkbox.addEventListener('change', () => {
            toggleVar(v.css, checkbox.checked);
            row.classList.toggle('disabled', !checkbox.checked);
        });
        const slider = document.createElement('span');
        slider.className = 'moodlight-toggle-slider';
        toggle.append(checkbox, slider);

        // Swatch
        const swatch = document.createElement('div');
        swatch.className = 'moodlight-swatch';
        swatch.style.background = color;
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = toHex(color);
        picker.addEventListener('input', () => {
            swatch.style.background = picker.value;
            currentColors[v.key] = picker.value;
        });
        swatch.appendChild(picker);

        // Label
        const label = document.createElement('span');
        label.className = 'moodlight-var-name';
        label.textContent = v.label;

        row.append(toggle, swatch, label);
        previewEl.appendChild(row);
    }
}

function renderVarList(container) {
    const listEl = container.querySelector('.moodlight-var-list');
    listEl.innerHTML = '';
    const vars = getActiveVars();

    for (const v of vars) {
        const item = document.createElement('div');
        item.className = 'moodlight-var-item';

        const toggle = document.createElement('label');
        toggle.className = 'moodlight-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isVarEnabled(v.css);
        cb.addEventListener('change', () => toggleVar(v.css, cb.checked));
        const sl = document.createElement('span');
        sl.className = 'moodlight-toggle-slider';
        toggle.append(cb, sl);

        const name = document.createElement('span');
        name.className = 'moodlight-var-item-name';
        name.textContent = `${v.label} (${v.css})`;

        item.append(toggle, name);

        if (v.custom) {
            const del = document.createElement('button');
            del.className = 'moodlight-var-del';
            del.textContent = '✕';
            del.addEventListener('click', () => { removeCustomVar(v.css); renderVarList(container); });
            item.appendChild(del);
        }

        listEl.appendChild(item);
    }
}

function renderPresetList(container) {
    const listEl = container.querySelector('.moodlight-presets-list');
    const presets = settings().presets;
    const activeId = settings().activePresetId;

    if (!presets.length) {
        listEl.innerHTML = '<div class="moodlight-empty">아직 저장된 프리셋이 없습니다</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const p of presets) {
        const isActive = p.id === activeId;
        const item = document.createElement('div');
        item.className = 'moodlight-preset-item' + (isActive ? ' active' : '');

        // 스워치
        const swatches = document.createElement('div');
        swatches.className = 'moodlight-preset-swatches';
        for (const k of ['blurTintColor', 'bodyColor', 'userMesColor', 'botMesColor']) {
            if (p.colors[k]) {
                const mini = document.createElement('div');
                mini.className = 'moodlight-preset-mini-swatch';
                mini.style.background = p.colors[k];
                swatches.appendChild(mini);
            }
        }

        // 이름 (클릭 → 수정)
        const name = document.createElement('span');
        name.className = 'moodlight-preset-name';
        name.textContent = p.name;
        name.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'moodlight-preset-name-input';
            input.value = p.name;
            name.replaceWith(input);
            input.focus();
            input.select();

            function commitRename() {
                p.name = input.value.trim() || p.name;
                save();
                renderPresetList(container);
            }
            input.addEventListener('blur', commitRename);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                if (ev.key === 'Escape') { input.value = p.name; input.blur(); }
            });
        });

        // 적용/해제 버튼
        const applyBtn = document.createElement('button');
        applyBtn.className = 'moodlight-preset-apply' + (isActive ? ' applied' : '');
        applyBtn.textContent = isActive ? '해제' : '적용';
        applyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isActive) {
                // 적용 해제
                clearInjection();
                currentColors = null;
                container.querySelector('.moodlight-preview').innerHTML = '';
                container.querySelector('.moodlight-actions').style.display = 'none';
                updateGenBtn();
            } else {
                // 적용
                applyPreset(p.id);
                currentColors = { ...p.colors };
                renderPreview(p.colors, container);
                container.querySelector('.moodlight-actions').style.display = 'flex';
                updateGenBtn();
            }
            renderPresetList(container);
        });

        // 삭제
        const del = document.createElement('button');
        del.className = 'moodlight-preset-delete';
        del.textContent = '✕';
        del.addEventListener('click', e => { e.stopPropagation(); deletePreset(p.id); renderPresetList(container); });

        item.append(swatches, name, applyBtn, del);
        listEl.appendChild(item);
    }
}

// ===== Export / Import =====

function exportPresets() {
    const data = JSON.stringify(settings().presets, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moodlight-presets.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importPresets(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const imported = JSON.parse(reader.result);
                if (!Array.isArray(imported)) throw new Error('배열 형식이 아닙니다.');
                const s = settings();
                for (const p of imported) {
                    if (p.colors && typeof p.colors === 'object') {
                        p.id = p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                        s.presets.push(p);
                    }
                }
                save();
                resolve(imported.length);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsText(file);
    });
}

function setStatus(html, container) {
    container.querySelector('.moodlight-status').innerHTML = html;
}

function updateGenBtn() {
    if (!modalEl) return;
    const btn = modalEl.querySelector('.moodlight-generate-btn');
    if (btn) btn.textContent = currentColors ? '수정' : '생성';
}

function openModal() {
    const m = createModal();
    renderPresetList(m);
    updateGenBtn();
    requestAnimationFrame(() => m.classList.add('active'));
}

function closeModal() {
    if (modalEl) modalEl.classList.remove('active');
}

// ===== Settings Panel =====

function populateProfileDropdown() {
    const select = document.getElementById('moodlight-profile-select');
    if (!select) return;
    const profiles = getConnectionProfiles();
    const saved = settings().selectedProfile;
    select.innerHTML = '<option value="">현재 연결 사용</option>';
    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === saved) opt.selected = true;
        select.appendChild(opt);
    }
}

function createSettingsUI() {
    const html = `
        <div id="moodlight-settings" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>MoodLight</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label>연결 프로필</label>
                <div style="display:flex; gap:4px;">
                    <select id="moodlight-profile-select" style="flex:1;"></select>
                    <button id="moodlight-refresh-profiles" title="새로고침"
                        style="padding:4px 8px; border:1px solid var(--SmartThemeBorderColor);
                        border-radius:5px; background:transparent; color:var(--SmartThemeBodyColor);
                        cursor:pointer; text-shadow:none;">↻</button>
                </div>
                <button class="moodlight-open-btn menu_button" style="width:60%;">MoodLight 열기</button>
            </div>
        </div>
    `;

    $('#extensions_settings2').append(html);
    populateProfileDropdown();
    $('#moodlight-profile-select').on('change', function () { settings().selectedProfile = $(this).val(); save(); });
    $('#moodlight-refresh-profiles').on('click', populateProfileDropdown);
    $('#moodlight-settings .moodlight-open-btn').on('click', openModal);
}

// ===== Init =====

(function init() {
    loadSettings();
    createSettingsUI();

    const s = settings();
    if (s.activePresetId) {
        const preset = s.presets.find(p => p.id === s.activePresetId);
        if (preset) {
            injectColors(preset.colors);
            currentColors = { ...preset.colors };
        }
    }
})();
