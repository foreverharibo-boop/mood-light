// MoodLight — AI-powered theme color override for SillyTavern
import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'moodlight';
const STYLE_ID = 'moodlight-override-style';

// ST CSS variables that control theme colors
const VAR_MAP = [
    { key: 'bodyColor',         css: '--SmartThemeBodyColor',             label: 'Text' },
    { key: 'blurTintColor',     css: '--SmartThemeBlurTintColor',         label: 'Panel BG' },
    { key: 'borderColor',       css: '--SmartThemeBorderColor',           label: 'Border' },
    { key: 'chatTintColor',     css: '--SmartThemeChatTintColor',         label: 'Chat BG' },
    { key: 'userMesColor',      css: '--SmartThemeUserMesBlurTintColor',  label: 'User Msg' },
    { key: 'botMesColor',       css: '--SmartThemeBotMesBlurTintColor',   label: 'Bot Msg' },
    { key: 'quoteColor',        css: '--SmartThemeQuoteColor',            label: 'Quote' },
    { key: 'emColor',           css: '--SmartThemeEmColor',               label: 'Emphasis' },
];

const DEFAULT_SETTINGS = {
    apiEndpoint: '',
    apiKey: '',
    modelName: '',
    presets: [],
    activePresetId: null,
    enabled: true,
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

function settings() {
    return extension_settings[EXT];
}

function save() {
    saveSettingsDebounced();
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

function injectColors(colors) {
    if (!colors) return;
    const lines = VAR_MAP
        .filter(v => colors[v.key])
        .map(v => `  ${v.css}: ${colors[v.key]} !important;`);
    if (!lines.length) return;
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

// ===== AI API =====

function buildPrompt(mood) {
    const keys = VAR_MAP.map(v => `"${v.key}"`).join(', ');
    return [
        {
            role: 'system',
            content: [
                'You are a UI color palette designer. The user describes a mood or atmosphere.',
                'Generate a cohesive color palette for a chat application theme.',
                `Return ONLY a JSON object with these exact keys: ${keys}.`,
                'Values must be valid CSS colors (hex like #RRGGBB, or rgba()).',
                'Ensure good contrast: text colors must be readable on their respective backgrounds.',
                'Background/tint colors should use rgba() with some transparency (0.6~0.9) for glass-like feel.',
                'No markdown, no explanation, no backticks. Only the raw JSON object.',
            ].join(' '),
        },
        {
            role: 'user',
            content: mood,
        },
    ];
}

async function generateColors(mood) {
    const s = settings();
    if (!s.apiEndpoint || !s.apiKey) {
        throw new Error('API 엔드포인트와 키를 먼저 설정해주세요.');
    }

    const endpoint = s.apiEndpoint.replace(/\/+$/, '');
    const url = endpoint.endsWith('/chat/completions')
        ? endpoint
        : `${endpoint}/v1/chat/completions`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.apiKey}`,
        },
        body: JSON.stringify({
            model: s.modelName || 'gpt-4o-mini',
            messages: buildPrompt(mood),
            temperature: 0.9,
            max_tokens: 500,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API 오류 (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();

    try {
        const colors = JSON.parse(cleaned);
        // Validate: at least some keys match
        const valid = VAR_MAP.some(v => colors[v.key]);
        if (!valid) throw new Error('유효한 색상이 없습니다.');
        return colors;
    } catch (e) {
        throw new Error(`AI 응답 파싱 실패: ${e.message}\n응답: ${cleaned.slice(0, 200)}`);
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
            <div class="moodlight-header">
                <span class="moodlight-title">🌈 MoodLight</span>
                <button class="moodlight-close">✕</button>
            </div>

            <div class="moodlight-input-row">
                <input class="moodlight-mood-input" type="text"
                    placeholder="분위기를 입력하세요... (예: 차가운 새벽)" />
                <button class="moodlight-generate-btn">생성</button>
            </div>

            <div class="moodlight-status"></div>

            <div class="moodlight-preview"></div>

            <div class="moodlight-actions" style="display:none;">
                <button data-action="apply">적용</button>
                <button data-action="save">저장</button>
                <button data-action="reset">초기화</button>
            </div>

            <hr class="moodlight-divider">

            <div class="moodlight-presets-label">저장된 프리셋</div>
            <div class="moodlight-presets-list"></div>
        </div>
    `;

    // Close handlers
    backdrop.querySelector('.moodlight-close').addEventListener('click', () => closeModal());
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });

    // Generate
    const input = backdrop.querySelector('.moodlight-mood-input');
    const genBtn = backdrop.querySelector('.moodlight-generate-btn');

    async function onGenerate() {
        const mood = input.value.trim();
        if (!mood) return;
        genBtn.disabled = true;
        setStatus('<span class="moodlight-spinner"></span>생성 중...', backdrop);
        try {
            const colors = await generateColors(mood);
            currentColors = colors;
            renderPreview(colors, backdrop);
            backdrop.querySelector('.moodlight-actions').style.display = 'flex';
            setStatus('', backdrop);
        } catch (e) {
            setStatus(`⚠ ${e.message}`, backdrop);
        }
        genBtn.disabled = false;
    }

    genBtn.addEventListener('click', onGenerate);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onGenerate();
        }
    });

    // Action buttons
    backdrop.querySelector('[data-action="apply"]').addEventListener('click', () => {
        if (currentColors) injectColors(currentColors);
    });

    backdrop.querySelector('[data-action="save"]').addEventListener('click', () => {
        if (!currentColors) return;
        const name = input.value.trim() || '무제';
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
    });

    document.documentElement.appendChild(backdrop);
    modalEl = backdrop;
    return backdrop;
}

function renderPreview(colors, container) {
    const previewEl = container.querySelector('.moodlight-preview');
    previewEl.innerHTML = '';

    for (const v of VAR_MAP) {
        const color = colors[v.key];
        if (!color) continue;

        const row = document.createElement('div');
        row.className = 'moodlight-preview-row';

        const swatch = document.createElement('div');
        swatch.className = 'moodlight-swatch';
        swatch.style.background = color;

        // Color picker on swatch click
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = toHex(color);
        picker.addEventListener('input', () => {
            swatch.style.background = picker.value;
            currentColors[v.key] = picker.value;
        });
        swatch.appendChild(picker);

        const label = document.createElement('span');
        label.className = 'moodlight-var-name';
        label.textContent = v.label;

        row.append(swatch, label);
        previewEl.appendChild(row);
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
        const item = document.createElement('div');
        item.className = 'moodlight-preset-item' + (p.id === activeId ? ' active' : '');

        // Mini swatches
        const swatches = document.createElement('div');
        swatches.className = 'moodlight-preset-swatches';
        const previewKeys = ['blurTintColor', 'bodyColor', 'userMesColor', 'botMesColor'];
        for (const k of previewKeys) {
            if (p.colors[k]) {
                const mini = document.createElement('div');
                mini.className = 'moodlight-preset-mini-swatch';
                mini.style.background = p.colors[k];
                swatches.appendChild(mini);
            }
        }

        const name = document.createElement('span');
        name.className = 'moodlight-preset-name';
        name.textContent = p.name;

        const del = document.createElement('button');
        del.className = 'moodlight-preset-delete';
        del.textContent = '✕';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePreset(p.id);
            renderPresetList(container);
        });

        item.append(swatches, name, del);
        item.addEventListener('click', () => {
            applyPreset(p.id);
            currentColors = { ...p.colors };
            renderPreview(p.colors, container);
            container.querySelector('.moodlight-actions').style.display = 'flex';
            renderPresetList(container);
        });

        listEl.appendChild(item);
    }
}

function setStatus(html, container) {
    container.querySelector('.moodlight-status').innerHTML = html;
}

function openModal() {
    const m = createModal();
    renderPresetList(m);
    // Show with animation
    requestAnimationFrame(() => {
        m.classList.add('active');
    });
}

function closeModal() {
    if (modalEl) {
        modalEl.classList.remove('active');
    }
}

// ===== Helpers =====

function toHex(color) {
    try {
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const match = computed.match(/\d+/g);
        if (match) {
            const [r, g, b] = match.map(Number);
            return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        }
    } catch {}
    return '#888888';
}

// ===== Settings Panel UI =====

function createSettingsUI() {
    const s = settings();
    const html = `
        <div id="moodlight-settings" class="extension_container">
            <div class="inline-drawer-toggle" tabindex="0">
                <b>🌈 MoodLight</b>
                <span class="inline-drawer-icon">▼</span>
            </div>
            <div class="inline-drawer-content">
                <label>API 엔드포인트</label>
                <input type="text" id="moodlight-api-endpoint"
                    placeholder="https://api.openai.com"
                    value="${s.apiEndpoint || ''}" />

                <label>API 키</label>
                <input type="password" id="moodlight-api-key"
                    placeholder="sk-..."
                    value="${s.apiKey || ''}" />

                <label>모델명</label>
                <input type="text" id="moodlight-model-name"
                    placeholder="gpt-4o-mini"
                    value="${s.modelName || ''}" />

                <button class="moodlight-open-btn">🌈 MoodLight 열기</button>
            </div>
        </div>
    `;

    $('#extensions_settings2').append(html);

    // Drawer toggle
    $('#moodlight-settings .inline-drawer-toggle').on('click', function () {
        $(this).toggleClass('open');
        $(this).next('.inline-drawer-content').toggleClass('open');
    });

    // Settings inputs
    $('#moodlight-api-endpoint').on('input', function () {
        settings().apiEndpoint = $(this).val().trim();
        save();
    });

    $('#moodlight-api-key').on('input', function () {
        settings().apiKey = $(this).val().trim();
        save();
    });

    $('#moodlight-model-name').on('input', function () {
        settings().modelName = $(this).val().trim();
        save();
    });

    // Open modal button
    $('#moodlight-settings .moodlight-open-btn').on('click', openModal);
}

// ===== Init =====

(function init() {
    loadSettings();
    createSettingsUI();

    // Re-apply active preset on load
    const s = settings();
    if (s.activePresetId) {
        const preset = s.presets.find(p => p.id === s.activePresetId);
        if (preset) {
            injectColors(preset.colors);
            currentColors = { ...preset.colors };
        }
    }
})();
