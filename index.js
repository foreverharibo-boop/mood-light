// MoodLight v2 — AI-powered theme color override for SillyTavern
import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'moodlight';
const STYLE_ID = 'moodlight-override-style';

const DEFAULT_VARS = [
    { key: 'bodyColor',     css: '--SmartThemeBodyColor',            label: 'Text' },
    { key: 'blurTintColor', css: '--SmartThemeBlurTintColor',        label: 'Panel',  tint: true },
    { key: 'borderColor',   css: '--SmartThemeBorderColor',          label: 'Border' },
    { key: 'chatTintColor', css: '--SmartThemeChatTintColor',        label: 'Chat',   tint: true },
    { key: 'userMesColor',  css: '--SmartThemeUserMesBlurTintColor', label: 'User',   tint: true },
    { key: 'botMesColor',   css: '--SmartThemeBotMesBlurTintColor',  label: 'Bot',    tint: true },
    { key: 'quoteColor',    css: '--SmartThemeQuoteColor',           label: 'Quote' },
    { key: 'emColor',       css: '--SmartThemeEmColor',              label: 'Em' },
];

const HARMONY_TYPES = [
    { id: 'complementary',       label: '보색',      angles: [180] },
    { id: 'analogous',           label: '유사색',    angles: [-30, 30] },
    { id: 'triadic',             label: '삼각',      angles: [120, 240] },
    { id: 'split-complementary', label: '분할보색',  angles: [150, 210] },
    { id: 'tetradic',            label: '사각',      angles: [90, 180, 270] },
];

const DEFAULT_SETTINGS = { selectedProfile: '', presets: [], activePresetId: null, customVars: [], disabledVars: [] };
let currentColors = null, modalEl = null;

// ========== SETTINGS ==========
function loadSettings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = structuredClone(DEFAULT_SETTINGS);
    const s = extension_settings[EXT];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS))
        if (s[k] === undefined) s[k] = typeof v === 'object' ? structuredClone(v) : v;
}
function s() { return extension_settings[EXT]; }
function save() { saveSettingsDebounced(); }

// ========== VARIABLES ==========
function getVars() {
    return [...DEFAULT_VARS, ...(s().customVars || []).map(v => ({ ...v, custom: true }))];
}
function isEnabled(css) { return !(s().disabledVars || []).includes(css); }
function toggleVar(css, on) {
    const d = s(); if (!d.disabledVars) d.disabledVars = [];
    d.disabledVars = on ? d.disabledVars.filter(v => v !== css) : [...d.disabledVars, css];
    save(); if (currentColors) injectColors(currentColors);
}
function addVar(css, label) {
    if (getVars().some(v => v.css === css)) return false;
    const k = css.replace(/^--/, '').replace(/[^a-zA-Z0-9]/g, '_');
    s().customVars.push({ key: k, css, label: label || css }); save(); return true;
}
function removeVar(css) {
    const d = s();
    d.customVars = (d.customVars || []).filter(v => v.css !== css);
    d.disabledVars = (d.disabledVars || []).filter(v => v !== css); save();
}

// ========== CONNECTION ==========
function getProfiles() {
    const el = document.getElementById('connection_profiles');
    return el ? Array.from(el.options).filter(o => o.value).map(o => ({ id: o.value, name: o.textContent.trim() })) : [];
}
function curProfile() { return document.getElementById('connection_profiles')?.value || ''; }
async function switchProfile(id) {
    const el = document.getElementById('connection_profiles');
    if (!el || !id || el.value === id) return false;
    el.value = id; el.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 500)); return true;
}

// ========== CSS INJECTION ==========
function getStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.documentElement.appendChild(el); }
    return el;
}
function readAlpha(css) {
    const el = document.getElementById(STYLE_ID), bk = el?.textContent || '';
    if (el) el.textContent = '';
    const raw = getComputedStyle(document.documentElement).getPropertyValue(css).trim();
    if (el) el.textContent = bk;
    const m = raw.match(/rgba?\([\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/);
    return m ? parseFloat(m[1]) : 1;
}
function hexToRgba(hex, a) {
    const h = hex.replace('#','');
    return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
}
function processColor(v, c) { const hex = toHex(c); if (!v.tint) return hex; const a = readAlpha(v.css); return a >= 1 ? hex : hexToRgba(hex, a); }
function injectColors(colors) {
    if (!colors) return;
    const lines = getVars().filter(v => colors[v.key] && isEnabled(v.css))
        .map(v => `${v.css}:${processColor(v, colors[v.key])} !important;`);
    getStyleEl().textContent = lines.length ? `:root{${lines.join('')}}` : '';
    currentColors = { ...colors };
}
function clearInjection() {
    const el = document.getElementById(STYLE_ID); if (el) el.textContent = '';
    currentColors = null; s().activePresetId = null; save();
}

// ========== COLOR HELPERS ==========
function toHex(c) {
    try { const t = document.createElement('div'); t.style.color = c; document.body.appendChild(t);
        const m = getComputedStyle(t).color.match(/\d+/g); document.body.removeChild(t);
        if (m) return '#' + m.slice(0,3).map(x => Number(x).toString(16).padStart(2,'0')).join('');
    } catch {} return '#888888';
}
function hexToHSL(hex) {
    const h = hex.replace('#',''); let r=parseInt(h.slice(0,2),16)/255, g=parseInt(h.slice(2,4),16)/255, b=parseInt(h.slice(4,6),16)/255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let hu=0, sa=0, li=(mx+mn)/2;
    if (mx!==mn) { const d=mx-mn; sa = li>0.5?d/(2-mx-mn):d/(mx+mn);
        if(mx===r)hu=((g-b)/d+(g<b?6:0))/6; else if(mx===g)hu=((b-r)/d+2)/6; else hu=((r-g)/d+4)/6; }
    return {h:hu*360,s:sa*100,l:li*100};
}
function hslToHex(h,sat,l) {
    h=((h%360)+360)%360; sat=Math.max(0,Math.min(100,sat))/100; l=Math.max(0,Math.min(100,l))/100;
    const a=sat*Math.min(l,1-l), f=n=>{const k=(n+h/30)%12;return Math.round((l-a*Math.max(Math.min(k-3,9-k,1),-1))*255).toString(16).padStart(2,'0');};
    return `#${f(0)}${f(8)}${f(4)}`;
}
function luminance(hex) { const h=hex.replace('#',''); return 0.299*parseInt(h.slice(0,2),16)+0.587*parseInt(h.slice(2,4),16)+0.114*parseInt(h.slice(4,6),16); }
function relLum(hex) {
    const h=hex.replace('#',''), f=i=>{let c=parseInt(h.slice(i,i+2),16)/255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
    return 0.2126*f(0)+0.7152*f(2)+0.0722*f(4);
}
function contrast(a,b) { const l1=relLum(a),l2=relLum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }
function ensureContrast(colors) {
    const vars=getVars(), bk=vars.filter(v=>v.tint).map(v=>v.key), fg=vars.filter(v=>!v.tint).map(v=>v.key);
    const bgKey=bk.find(k=>colors[k])||bk[0], bg=colors[bgKey]; if(!bg) return colors;
    const fixed={...colors}, bgHex=toHex(bg), bgLum=luminance(bgHex);
    for(const fk of fg){ if(!fixed[fk])continue; let hex=toHex(fixed[fk]),r=contrast(hex,bgHex);
        if(r>=4.5)continue; const hsl=hexToHSL(hex), dir=bgLum<128?1:-1; let i=0;
        while(r<4.5&&i<30){hsl.l=Math.max(0,Math.min(100,hsl.l+dir*3));hex=hslToHex(hsl.h,hsl.s,hsl.l);r=contrast(hex,bgHex);i++;}
        fixed[fk]=hex;} return fixed;
}

// ========== IMAGE EXTRACTION ==========
function extractFromImage(file) {
    return new Promise((res,rej)=>{
        const img=new Image(), url=URL.createObjectURL(file);
        img.onload=()=>{ try{ const c=document.createElement('canvas'),r=Math.min(100/img.width,100/img.height);
            c.width=Math.floor(img.width*r);c.height=Math.floor(img.height*r);
            const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
            const d=ctx.getImageData(0,0,c.width,c.height).data, bk={};
            for(let i=0;i<d.length;i+=4){ if(d[i+3]<128)continue;
                const r2=Math.round(d[i]/32)*32,g=Math.round(d[i+1]/32)*32,b=Math.round(d[i+2]/32)*32,k=`${r2},${g},${b}`;
                if(!bk[k])bk[k]={r:r2,g,b:b,n:0};bk[k].n++;}
            let sorted=Object.values(bk).sort((a,b)=>b.n-a.n), dist=[];
            for(const c2 of sorted){if(!dist.some(d2=>Math.abs(d2.r-c2.r)+Math.abs(d2.g-c2.g)+Math.abs(d2.b-c2.b)<60))dist.push(c2);if(dist.length>=16)break;}
            const hexes=dist.map(c2=>'#'+[c2.r,c2.g,c2.b].map(v=>Math.min(255,v).toString(16).padStart(2,'0')).join('')).sort((a,b)=>luminance(a)-luminance(b));
            res(ensureContrast(mapToVars(hexes)));
        }catch(e){rej(e);}};
        img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('이미지 로드 실패'));};img.src=url;
    });
}
function mapToVars(sorted) {
    const vars=getVars(),bg=vars.filter(v=>v.tint),fg=vars.filter(v=>!v.tint),colors={};
    while(sorted.length<vars.length){const last=sorted[sorted.length-1]||'#888',h=hexToHSL(last);sorted.push(hslToHex(h.h+20,h.s,Math.min(95,h.l+10)));}
    bg.forEach((v,i)=>{colors[v.key]=sorted[i%sorted.length];});
    const br=sorted.slice().reverse(); fg.forEach((v,i)=>{colors[v.key]=br[i%br.length];}); return colors;
}

// ========== HARMONY ==========
function genHarmony(base, type) {
    const h=HARMONY_TYPES.find(t=>t.id===type)||HARMONY_TYPES[0], b=hexToHSL(base);
    const hues=[b.h,...h.angles.map(a=>(b.h+a+360)%360)], vars=getVars(), bg=vars.filter(v=>v.tint), fg=vars.filter(v=>!v.tint), colors={};
    bg.forEach((v,i)=>{const hu=hues[i%hues.length]; colors[v.key]=hslToHex(hu,Math.max(5,b.s-10),Math.max(5,Math.min(30,b.l-10-i*5)));});
    fg.forEach((v,i)=>{const hu=hues[i%hues.length]; colors[v.key]=hslToHex(hu,Math.max(10,b.s-5+i*3),Math.min(95,b.l+20+i*8));});
    return ensureContrast(colors);
}

// ========== AI GENERATION ==========
function buildPrompt(mood, existing) {
    const keys=getVars().map(v=>`"${v.key}"`).join(', ');
    if(existing){return['You are a UI color palette designer.',`Current palette:\n${JSON.stringify(existing,null,2)}`,`Modify: "${mood}"`,
        'Change only what asked. Keep cohesion.',`Return ONLY raw JSON with keys: ${keys}.`,'Hex #RRGGBB only. No rgba. No markdown.'].join('\n');}
    return['You are a UI color palette designer.',`Mood: "${mood}"`,`Generate palette. Return ONLY raw JSON with keys: ${keys}.`,
        'Hex #RRGGBB only. No rgba.','CRITICAL: text vs background contrast must be WCAG 4.5:1+.','Match brightness/saturation to mood.','No markdown.'].join('\n');
}
async function generateAI(mood, existing) {
    const cfg=s(), target=cfg.selectedProfile, orig=curProfile(); let switched=false;
    try{ if(target&&target!==orig) switched=await switchProfile(target);
        const ctx=getContext(); if(typeof ctx.generateQuietPrompt!=='function') throw new Error('generateQuietPrompt 없음');
        const r=await ctx.generateQuietPrompt(buildPrompt(mood,existing),false,false); if(!r)throw new Error('빈 응답');
        const m=r.match(/\{[\s\S]*\}/); if(!m)throw new Error('JSON 없음');
        const c=JSON.parse(m[0]); if(!getVars().some(v=>c[v.key]))throw new Error('유효한 색상 없음');
        return ensureContrast(c);
    }finally{ if(switched&&orig) await switchProfile(orig); }
}

// ========== PRESETS ==========
function savePreset(name,colors){ const id=Date.now().toString(36); s().presets.push({id,name,colors:{...colors}}); s().activePresetId=id; save(); return id; }
function deletePreset(id){ const d=s(); d.presets=d.presets.filter(p=>p.id!==id); if(d.activePresetId===id)d.activePresetId=null; save(); }
function applyPreset(id){ const p=s().presets.find(p=>p.id===id); if(!p)return; injectColors(p.colors); s().activePresetId=id; save(); }
function exportPresets(){ const b=new Blob([JSON.stringify(s().presets,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='moodlight-presets.json'; a.click(); }
function importPresets(file){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);
    if(!Array.isArray(d))throw new Error('형식오류');d.forEach(p=>{p.id=p.id||Date.now().toString(36)+Math.random().toString(36).slice(2,5);if(p.colors)s().presets.push(p);});
    save();res(d.length);}catch(e){rej(e);}};r.onerror=()=>rej(new Error('읽기실패'));r.readAsText(file);});}

// ========== MODAL ==========
function createModal() {
    if (modalEl) return modalEl;
    const bd = document.createElement('div');
    bd.className = 'moodlight-backdrop';
    bd.innerHTML = `
<div class="ml-modal">
  <div class="ml-header">
    <span class="ml-title">MoodLight</span>
    <div class="ml-header-actions">
      <button class="ml-icon-btn ml-vars-open" title="변수 관리">⚙</button>
      <button class="ml-close">✕</button>
    </div>
  </div>
  <div class="ml-body">
    <div class="ml-section">
      <div class="ml-tabs">
        <button class="ml-tab active" data-m="ai">AI 생성</button>
        <button class="ml-tab" data-m="image">이미지</button>
        <button class="ml-tab" data-m="harmony">하모니</button>
      </div>
      <div class="ml-mode" data-m="ai"><div class="ml-input-row"><input class="ml-input ml-mood" placeholder="분위기 또는 수정 지시" /><button class="ml-btn ml-gen">생성</button></div></div>
      <div class="ml-mode" data-m="image" style="display:none"><div class="ml-input-row"><label class="ml-dropzone"><input type="file" accept="image/*" style="display:none"/><span class="ml-drop-text">이미지 선택</span></label><button class="ml-btn ml-extract" disabled>추출</button></div></div>
      <div class="ml-mode" data-m="harmony" style="display:none"><div class="ml-harmony-row"><div class="ml-base-wrap"><div class="ml-base-swatch" style="background:#6C8EBF"></div><input type="color" class="ml-base-picker" value="#6C8EBF"/></div><select class="ml-harmony-select">${HARMONY_TYPES.map(h=>`<option value="${h.id}">${h.label}</option>`).join('')}</select><button class="ml-btn ml-harm-gen">생성</button></div></div>
      <div class="ml-status"></div>
      <div class="ml-colors"></div>
      <div class="ml-actions" style="display:none"><button class="ml-btn" data-a="apply">적용</button><button class="ml-btn" data-a="save">저장</button><button class="ml-btn" data-a="reset">초기화</button></div>
    </div>
    <div class="ml-section">
      <div class="ml-presets-header"><span class="ml-presets-title">프리셋</span><div class="ml-presets-tools"><button class="ml-icon-btn ml-export" title="내보내기">↑</button><label class="ml-icon-btn ml-import" title="가져오기">↓<input type="file" accept=".json" style="display:none"/></label></div></div>
      <div class="ml-preset-list"></div>
    </div>
  </div>
  <div class="ml-vars-panel">
    <div class="ml-vars-header"><button class="ml-vars-back">←</button><span class="ml-vars-title">변수 관리</span></div>
    <div class="ml-vars-body"><div class="ml-vars-list"></div><div class="ml-var-add"><input class="ml-var-css" placeholder="--CSS변수명"/><input class="ml-var-label" placeholder="라벨"/><button class="ml-var-add-btn">+</button></div></div>
  </div>
</div>`;

    // Close
    bd.querySelector('.ml-close').onclick = closeModal;
    bd.onclick = e => { if (e.target === bd) closeModal(); };

    // Tabs
    bd.querySelectorAll('.ml-tab').forEach(t => t.onclick = () => {
        bd.querySelectorAll('.ml-tab').forEach(x => x.classList.remove('active')); t.classList.add('active');
        bd.querySelectorAll('.ml-mode').forEach(x => x.style.display = 'none');
        bd.querySelector(`.ml-mode[data-m="${t.dataset.m}"]`).style.display = '';
    });

    // AI
    const mood = bd.querySelector('.ml-mood'), genBtn = bd.querySelector('.ml-gen');
    async function onGen() {
        if (!mood.value.trim()) return; genBtn.disabled = true;
        const ref = !!currentColors; setStatus(`<span class="ml-spinner"></span>${ref?'수정':'생성'} 중...`, bd);
        try { const c = await generateAI(mood.value.trim(), ref ? currentColors : null);
            currentColors = c; renderColors(c, bd); bd.querySelector('.ml-actions').style.display = 'flex'; setStatus('', bd); updateGenBtn();
        } catch(e) { setStatus(`⚠ ${e.message}`, bd); } genBtn.disabled = false;
    }
    genBtn.onclick = onGen;
    mood.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); onGen(); } };

    // Image
    const fileIn = bd.querySelector('.ml-dropzone input'), extBtn = bd.querySelector('.ml-extract'), dropTxt = bd.querySelector('.ml-drop-text');
    let selFile = null;
    fileIn.onchange = () => { if(fileIn.files.length){selFile=fileIn.files[0];dropTxt.textContent=selFile.name;extBtn.disabled=false;} };
    extBtn.onclick = async () => {
        if(!selFile)return; extBtn.disabled=true; setStatus('<span class="ml-spinner"></span>추출 중...',bd);
        try{ const c=await extractFromImage(selFile); currentColors=c; renderColors(c,bd); bd.querySelector('.ml-actions').style.display='flex'; setStatus('',bd); updateGenBtn();
        }catch(e){setStatus(`⚠ ${e.message}`,bd);} extBtn.disabled=false;
    };

    // Harmony
    const bSwatch=bd.querySelector('.ml-base-swatch'), bPicker=bd.querySelector('.ml-base-picker');
    bPicker.oninput=()=>{bSwatch.style.background=bPicker.value;}; bSwatch.onclick=()=>bPicker.click();
    bd.querySelector('.ml-harm-gen').onclick=()=>{
        const c=genHarmony(bPicker.value,bd.querySelector('.ml-harmony-select').value);
        currentColors=c;renderColors(c,bd);bd.querySelector('.ml-actions').style.display='flex';setStatus('',bd);updateGenBtn();
    };

    // Actions
    bd.querySelector('[data-a="apply"]').onclick=()=>{if(currentColors)injectColors(currentColors);};
    bd.querySelector('[data-a="save"]').onclick=()=>{if(!currentColors)return;savePreset(mood.value.trim()||'무제',currentColors);renderPresets(bd);};
    bd.querySelector('[data-a="reset"]').onclick=()=>{clearInjection();currentColors=null;bd.querySelector('.ml-colors').innerHTML='';bd.querySelector('.ml-actions').style.display='none';renderPresets(bd);setStatus('초기화',bd);updateGenBtn();};

    // Export/Import
    bd.querySelector('.ml-export').onclick=exportPresets;
    bd.querySelector('.ml-import input').onchange=async e=>{
        const f=e.target.files[0];if(!f)return;
        try{const n=await importPresets(f);setStatus(`${n}개 가져옴`,bd);renderPresets(bd);}catch(er){setStatus(`⚠ ${er.message}`,bd);}e.target.value='';
    };

    // Variable Manager
    bd.querySelector('.ml-vars-open').onclick=()=>{bd.querySelector('.ml-vars-panel').classList.add('open');renderVars(bd);};
    bd.querySelector('.ml-vars-back').onclick=()=>{bd.querySelector('.ml-vars-panel').classList.remove('open');};
    bd.querySelector('.ml-var-add-btn').onclick=()=>{
        const ci=bd.querySelector('.ml-var-css'),li=bd.querySelector('.ml-var-label');
        if(!ci.value.trim().startsWith('--')){setStatus('⚠ --로 시작해야 합니다',bd);return;}
        if(addVar(ci.value.trim(),li.value.trim())){ci.value='';li.value='';renderVars(bd);}
    };

    document.documentElement.appendChild(bd);
    modalEl = bd;
    return bd;
}

function renderColors(colors, ct) {
    const el = ct.querySelector('.ml-colors'); el.innerHTML = '';
    for (const v of getVars()) {
        const c = colors[v.key]; if (!c) continue;
        const en = isEnabled(v.css);
        const item = document.createElement('div');
        item.className = 'ml-color-item' + (en ? '' : ' disabled');

        const sw = document.createElement('div'); sw.className = 'ml-color-swatch'; sw.style.background = c;
        const pk = document.createElement('input'); pk.type = 'color'; pk.value = toHex(c);
        pk.oninput = () => { sw.style.background = pk.value; currentColors[v.key] = pk.value; };
        sw.appendChild(pk);

        const tg = document.createElement('div'); tg.className = 'ml-color-toggle ' + (en ? 'on' : '');
        tg.textContent = en ? '✓' : '';
        tg.onclick = (e) => { e.stopPropagation(); const next = !isEnabled(v.css); toggleVar(v.css, next);
            tg.className = 'ml-color-toggle ' + (next ? 'on' : ''); tg.textContent = next ? '✓' : '';
            item.classList.toggle('disabled', !next); };
        sw.appendChild(tg);

        const lb = document.createElement('div'); lb.className = 'ml-color-label'; lb.textContent = v.label;
        item.append(sw, lb); el.appendChild(item);
    }
}

function renderPresets(ct) {
    const el = ct.querySelector('.ml-preset-list'), presets = s().presets, aid = s().activePresetId;
    if (!presets.length) { el.innerHTML = '<div class="ml-empty">프리셋 없음</div>'; return; }
    el.innerHTML = '';
    for (const p of presets) {
        const active = p.id === aid, item = document.createElement('div');
        item.className = 'ml-preset' + (active ? ' active' : '');

        const sw = document.createElement('div'); sw.className = 'ml-preset-swatches';
        for (const k of ['blurTintColor','bodyColor','userMesColor','botMesColor'])
            if(p.colors[k]){const d=document.createElement('div');d.className='ml-preset-dot';d.style.background=p.colors[k];sw.appendChild(d);}

        const nm = document.createElement('span'); nm.className = 'ml-preset-name'; nm.textContent = p.name;
        nm.onclick = e => { e.stopPropagation();
            const inp = document.createElement('input'); inp.type='text'; inp.className='ml-preset-name-input'; inp.value=p.name;
            nm.replaceWith(inp); inp.focus(); inp.select();
            const commit=()=>{p.name=inp.value.trim()||p.name;save();renderPresets(ct);};
            inp.onblur=commit; inp.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();inp.blur();}if(ev.key==='Escape'){inp.value=p.name;inp.blur();}};
        };

        const ap = document.createElement('button'); ap.className='ml-preset-apply'+(active?' applied':''); ap.textContent=active?'해제':'적용';
        ap.onclick=e=>{e.stopPropagation();
            if(active){clearInjection();currentColors=null;ct.querySelector('.ml-colors').innerHTML='';ct.querySelector('.ml-actions').style.display='none';updateGenBtn();}
            else{applyPreset(p.id);currentColors={...p.colors};renderColors(p.colors,ct);ct.querySelector('.ml-actions').style.display='flex';updateGenBtn();}
            renderPresets(ct);};

        const dl = document.createElement('button'); dl.className='ml-preset-del'; dl.textContent='✕';
        dl.onclick=e=>{e.stopPropagation();deletePreset(p.id);renderPresets(ct);};

        item.append(sw, nm, ap, dl); el.appendChild(item);
    }
}

function renderVars(ct) {
    const el = ct.querySelector('.ml-vars-list'); el.innerHTML = '';
    for (const v of getVars()) {
        const item = document.createElement('div'); item.className = 'ml-var-item';
        const tg = document.createElement('label'); tg.className = 'ml-var-toggle';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isEnabled(v.css);
        cb.onchange = () => toggleVar(v.css, cb.checked);
        const sl = document.createElement('span'); sl.className = 'ml-var-slider';
        tg.append(cb, sl);

        const info = document.createElement('div'); info.className = 'ml-var-info';
        const lb = document.createElement('div'); lb.className = 'ml-var-label'; lb.textContent = v.label;
        const cs = document.createElement('div'); cs.className = 'ml-var-css'; cs.textContent = v.css;
        info.append(lb, cs);

        item.append(tg, info);
        if (v.custom) { const d = document.createElement('button'); d.className='ml-var-del'; d.textContent='✕'; d.onclick=()=>{removeVar(v.css);renderVars(ct);}; item.appendChild(d); }
        el.appendChild(item);
    }
}

function setStatus(h, ct) { ct.querySelector('.ml-status').innerHTML = h; }
function updateGenBtn() { if(!modalEl)return; const b=modalEl.querySelector('.ml-gen'); if(b)b.textContent=currentColors?'수정':'생성'; }
function openModal() { const m=createModal(); renderPresets(m); updateGenBtn(); requestAnimationFrame(()=>m.classList.add('active')); }
function closeModal() { if(modalEl)modalEl.classList.remove('active'); }

// ========== SETTINGS UI ==========
function populateProfiles() {
    const el=document.getElementById('moodlight-profile-select'); if(!el)return;
    const ps=getProfiles(), sv=s().selectedProfile;
    el.innerHTML='<option value="">현재 연결 사용</option>';
    ps.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;if(p.id===sv)o.selected=true;el.appendChild(o);});
}
function createSettingsUI() {
    $('#extensions_settings2').append(`
<div id="moodlight-settings" class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>MoodLight</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
    <label style="font-size:11px">연결 프로필</label>
    <div style="display:flex;gap:4px"><select id="moodlight-profile-select" style="flex:1"></select><button id="moodlight-refresh" style="padding:4px 8px;border:1px solid var(--SmartThemeBorderColor);border-radius:5px;background:transparent;color:var(--SmartThemeBodyColor);cursor:pointer">↻</button></div>
    <button class="moodlight-open-btn menu_button" style="width:60%">MoodLight 열기</button>
  </div>
</div>`);
    populateProfiles();
    $('#moodlight-profile-select').on('change',function(){s().selectedProfile=$(this).val();save();});
    $('#moodlight-refresh').on('click',populateProfiles);
    $('#moodlight-settings .moodlight-open-btn').on('click',openModal);
}

// ========== INIT ==========
(function(){
    loadSettings(); createSettingsUI();
    const cfg=s();
    if(cfg.activePresetId){const p=cfg.presets.find(x=>x.id===cfg.activePresetId);if(p){injectColors(p.colors);currentColors={...p.colors};}}
})();
