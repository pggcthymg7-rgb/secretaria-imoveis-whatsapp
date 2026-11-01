/* BIGA — retrato vetorial animado e cenário (céu de Goiânia na hora azul). Sem dependências. */
(function () {
  'use strict';

  // Retrato da BIGA (ilustração própria, vetorial)
  function bigaSVG(id = 'b') {
    return `
<svg class="biga-svg" viewBox="0 0 400 440" role="img" aria-label="BIGA, sua secretária virtual" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9b998"/><stop offset=".55" stop-color="#d79f7c"/><stop offset="1" stop-color="#b9805f"/></linearGradient>
    <linearGradient id="${id}skinShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b17654" stop-opacity=".0"/><stop offset="1" stop-color="#8e5a3f" stop-opacity=".55"/></linearGradient>
    <linearGradient id="${id}hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d2a23"/><stop offset=".6" stop-color="#241713"/><stop offset="1" stop-color="#160e0c"/></linearGradient>
    <linearGradient id="${id}rim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#5266eb" stop-opacity=".85"/><stop offset=".35" stop-color="#5266eb" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}blazer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f4f"/><stop offset="1" stop-color="#191b2c"/></linearGradient>
    <linearGradient id="${id}blouse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f1f6"/><stop offset="1" stop-color="#c9c9d6"/></linearGradient>
    <radialGradient id="${id}cheek" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e0857a" stop-opacity=".45"/><stop offset="1" stop-color="#e0857a" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}eyeL"><path d="M156 170 Q172 157 189 169 Q172 180 156 170Z"/></clipPath>
    <clipPath id="${id}eyeR"><path d="M211 169 Q228 157 244 170 Q228 180 211 169Z"/></clipPath>
  </defs>

  <g class="body-g">
    <!-- cabelo (atrás) -->
    <path d="M118 176 C108 120 140 72 200 70 C262 70 294 118 284 178 C280 220 292 262 300 300 C270 312 240 300 222 292 L178 292 C160 300 130 312 100 300 C110 262 122 222 118 176Z" fill="url(#${id}hair)"/>
    <!-- pescoço -->
    <path d="M176 238 L224 238 L228 304 Q200 318 172 304Z" fill="url(#${id}skin)"/>
    <path d="M176 250 Q200 272 224 250 L226 280 Q200 292 174 280Z" fill="url(#${id}skinShade)"/>
    <!-- ombros / blazer -->
    <path d="M30 440 C40 372 82 336 150 322 L200 316 L250 322 C318 336 360 372 370 440Z" fill="url(#${id}blazer)"/>
    <path d="M370 440 C360 372 318 336 250 322 L262 325 C320 342 356 380 366 440Z" fill="url(#${id}rim)" opacity=".7"/>
    <!-- blusa -->
    <path d="M164 318 L200 396 L236 318 Q200 330 164 318Z" fill="url(#${id}blouse)"/>
    <!-- lapelas -->
    <path d="M150 322 L200 410 L176 440 L120 440 L138 360Z" fill="#20233a"/>
    <path d="M250 322 L200 410 L224 440 L280 440 L262 360Z" fill="#20233a"/>
    <path d="M150 322 L200 410" stroke="#5266eb" stroke-opacity=".35" stroke-width="1.2"/>
    <!-- crachá -->
    <g transform="translate(258 372) rotate(-6)">
      <rect x="0" y="0" width="54" height="22" rx="11" fill="#171721" stroke="#ededf3" stroke-opacity=".25"/>
      <circle cx="12" cy="11" r="4" fill="#5266eb"/>
      <text x="21" y="15" font-family="Inter, sans-serif" font-size="10" font-weight="600" letter-spacing="1.5" fill="#ededf3">BIGA</text>
    </g>
  </g>

  <g class="head-g">
    <!-- orelha + brinco -->
    <ellipse cx="129" cy="184" rx="10" ry="16" fill="#c58d6a"/>
    <circle cx="129" cy="206" r="4.5" fill="#ededf3"/>
    <!-- rosto -->
    <path d="M132 160 C132 112 162 92 200 92 C238 92 268 112 268 160 C268 214 240 254 200 258 C160 254 132 214 132 160Z" fill="url(#${id}skin)"/>
    <path d="M140 196 C150 232 172 252 200 256 C228 252 250 232 260 196 C250 236 228 262 200 262 C172 262 150 236 140 196Z" fill="url(#${id}skinShade)"/>
    <ellipse cx="160" cy="206" rx="16" ry="9" fill="url(#${id}cheek)"/>
    <ellipse cx="240" cy="206" rx="16" ry="9" fill="url(#${id}cheek)"/>
    <!-- sobrancelhas -->
    <path d="M154 154 Q170 144 188 152" stroke="#2a1b16" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M212 152 Q230 144 246 154" stroke="#2a1b16" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- olhos -->
    <g clip-path="url(#${id}eyeL)"><path d="M156 170 Q172 157 189 169 Q172 180 156 170Z" fill="#f6f2ee"/><g class="iris"><circle cx="172" cy="169" r="8" fill="#4a2c1e"/><circle cx="172" cy="169" r="4" fill="#1b100b"/><circle cx="175" cy="166" r="2.2" fill="#fff"/></g></g>
    <g clip-path="url(#${id}eyeR)"><path d="M211 169 Q228 157 244 170 Q228 180 211 169Z" fill="#f6f2ee"/><g class="iris"><circle cx="228" cy="169" r="8" fill="#4a2c1e"/><circle cx="228" cy="169" r="4" fill="#1b100b"/><circle cx="231" cy="166" r="2.2" fill="#fff"/></g></g>
    <path d="M155 169 Q172 156 190 168" stroke="#1d1310" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M210 168 Q228 156 245 169" stroke="#1d1310" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path class="lids" d="M154 169 Q172 154 191 168 Q172 182 154 169Z" fill="#d6a07d"/>
    <path class="lids" d="M209 168 Q228 154 246 169 Q228 182 209 168Z" fill="#d6a07d"/>
    <!-- nariz -->
    <path d="M201 176 Q197 196 192 204 Q200 210 208 204" stroke="#a56e50" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <!-- boca -->
    <g class="mouth-rest"><path d="M182 224 Q200 238 218 224 Q200 232 182 224Z" fill="#b65d66"/><path d="M184 224 Q200 229 216 224" stroke="#8d3f48" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
    <ellipse class="mouth-talk" cx="200" cy="228" rx="10" ry="7" fill="#7a2f39" style="transform-origin:200px 228px"/>
    <!-- cabelo (frente) -->
    <path d="M126 186 C112 116 152 76 206 78 C258 80 290 118 278 190 C272 150 256 118 214 110 C188 106 164 124 154 148 C146 166 136 176 126 186Z" fill="url(#${id}hair)"/>
    <path d="M206 80 C246 84 276 112 278 160" stroke="#5266eb" stroke-opacity=".55" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="hair-strand" d="M150 132 C134 168 132 214 142 262 C134 230 132 190 150 132Z" fill="#2c1d18"/>
    <!-- headset -->
    <path d="M124 176 C116 106 160 66 202 66 C246 66 288 104 278 176" stroke="#0f1019" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="266" y="160" width="22" height="40" rx="11" fill="#0f1019" stroke="#ededf3" stroke-opacity=".15"/>
    <path d="M276 196 C270 226 248 240 222 238" stroke="#0f1019" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="220" cy="238" r="6" fill="#0f1019"/>
    <circle class="mic-led" cx="277" cy="170" r="3" fill="#5266eb"/>
  </g>
</svg>`;
  }

  // Cenário: céu da hora azul + estrelas + skyline de Goiânia em camadas (parallax)
  function skySVG() {
    let stars = '';
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 90; i++) {
      const x = (rnd() * 1600).toFixed(0);
      const y = (rnd() * 420).toFixed(0);
      const r = (rnd() * 1.3 + 0.3).toFixed(2);
      stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#ededf3" opacity="${(rnd() * 0.5 + 0.15).toFixed(2)}"><animate attributeName="opacity" values=".15;.8;.15" dur="${(rnd() * 5 + 3).toFixed(1)}s" begin="${(rnd() * 4).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
    }
    const skyline = (base, minH, maxH, color, step, offset) => {
      let d = `M0 ${base}`;
      let x = 0;
      while (x < 1600) {
        const w = step * (0.6 + rnd() * 0.9);
        const h = minH + rnd() * (maxH - minH);
        d += ` L${x.toFixed(0)} ${base - h} L${(x + w).toFixed(0)} ${base - h}`;
        if (rnd() > 0.82) d += ` L${(x + w / 2).toFixed(0)} ${base - h - 14 - rnd() * 18} L${(x + w).toFixed(0)} ${base - h}`;
        x += w + rnd() * 6;
      }
      d += ` L1600 ${base} L1600 900 L0 900Z`;
      let windows = '';
      if (offset) {
        for (let i = 0; i < 70; i++) windows += `<rect x="${(rnd() * 1600).toFixed(0)}" y="${(base - rnd() * maxH * 0.8).toFixed(0)}" width="3" height="4" fill="#f2d79b" opacity="${(rnd() * 0.5 + 0.15).toFixed(2)}"/>`;
      }
      return `<path d="${d}" fill="${color}"/>${windows}`;
    };
    return `
<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11111a"/><stop offset=".55" stop-color="#1b1d33"/><stop offset=".8" stop-color="#2a3160"/><stop offset="1" stop-color="#3b4683"/></linearGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f8fd6" stop-opacity="0"/><stop offset=".55" stop-color="#7f8fd6" stop-opacity=".08"/><stop offset=".8" stop-color="#171721" stop-opacity=".25"/><stop offset="1" stop-color="#171721" stop-opacity=".85"/></linearGradient>
    <radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ededf3" stop-opacity=".9"/><stop offset=".3" stop-color="#c9d0ff" stop-opacity=".25"/><stop offset="1" stop-color="#5266eb" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <g class="layer" data-depth="4">${stars}<circle cx="1260" cy="170" r="120" fill="url(#moon)"/><circle cx="1260" cy="170" r="16" fill="#ededf3" opacity=".85"/></g>
  <g class="layer" data-depth="8">${skyline(780, 60, 230, '#1f2340', false)}</g>
  <g class="layer" data-depth="14">${skyline(840, 40, 280, '#15172a', true)}</g>
  <g class="layer" data-depth="22">${skyline(900, 20, 160, '#0f1019', true)}</g>
  <rect y="560" width="1600" height="340" fill="url(#fog)"/>
</svg>`;
  }

  function miniBiga() {
    // recorte do rosto para o avatar redondo da barra
    return bigaSVG('m').replace('viewBox="0 0 400 440"', 'viewBox="110 60 180 180"').replace('class="biga-svg"', 'class="biga-mini"');
  }

  // Interações: olhos seguem o cursor, parallax e boca "falando"
  function attach(stage) {
    if (!stage) return () => {};
    const svg = stage.querySelector('.biga-svg');
    const irises = stage.querySelectorAll('.iris');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function onMove(e) {
      if (reduce) return;
      const r = stage.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height * 0.4)) / window.innerHeight;
      irises.forEach(i => (i.style.transform = `translate(${(dx * 7).toFixed(2)}px, ${(dy * 5).toFixed(2)}px)`));
      if (svg) svg.style.transform = `translate(${(dx * 10).toFixed(1)}px, ${(dy * 6).toFixed(1)}px) rotate(${(dx * 1.5).toFixed(2)}deg)`;
      document.querySelectorAll('.sky .layer').forEach(l => {
        const d = Number(l.dataset.depth || 0);
        l.style.transform = `translate(${(-dx * d * 2).toFixed(1)}px, ${(-dy * d).toFixed(1)}px)`;
      });
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }

  window.BIGA_ART = { bigaSVG, skySVG, miniBiga, attach };
})();
