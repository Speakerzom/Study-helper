/* ============================================================
   instruct.js — Module Hướng Dẫn Sử Dụng, Study Helper
   - Load instruct.json một lần
   - Render 3 tab: Guide (steps), Videos, Dev Info
   - Tab điều hướng không reload trang
   - Link video click được, mở tab mới
============================================================ */

(() => {
  'use strict';

  /* ─── DOM refs ─── */
  const content    = document.getElementById('in-content');
  const tabBtns    = document.querySelectorAll('.tab-btn');
  const footerText = document.getElementById('footer-text'); // có thể null nếu footer bị xóa

  /* ─── State ─── */
  let DB          = null;
  let activeTab   = 'guide';

  /* ─── Util: escape HTML ─── */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════
     1. LOAD JSON
  ══════════════════════════════════════════ */
  async function loadDB() {
    try {
      const res = await fetch('instruct.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DB = await res.json();
      updateFooter();
      renderTab(activeTab);
    } catch (err) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">⚠️</div>
          <p>Không tải được dữ liệu hướng dẫn.<br>
             <code>${esc(err.message)}</code></p>
        </div>`;
    }
  }

  /* ══════════════════════════════════════════
     2. TAB SWITCHING
  ══════════════════════════════════════════ */
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === activeTab) return;
      activeTab = tab;

      /* Cập nhật active class */
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

      /* Ghi hash */
      history.replaceState(null, '', `#${tab}`);

      /* Render */
      if (DB) renderTab(tab);
    });
  });

  function renderTab(tab) {
    content.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tab-panel';
    content.appendChild(wrap);

    switch (tab) {
      case 'guide'    : renderGuide(wrap);     break;
      case 'videos'   : renderVideos(wrap);    break;
      case 'dev'      : renderDev(wrap);       break;
      case 'changelog': renderChangelog(wrap); break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ══════════════════════════════════════════
     3. TAB GUIDE — danh sách hướng dẫn từng bước
  ══════════════════════════════════════════ */
  function renderGuide(wrap) {
    const steps = DB.how_to_use;

    if (!Array.isArray(steps) || steps.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="e-icon">📭</div><p>Chưa có nội dung hướng dẫn.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="sec-header">
        <div class="sec-title"><span class="icon">📋</span> Hướng dẫn sử dụng</div>
        <p class="sec-sub">Làm theo các bước dưới đây để sử dụng Study Helper hiệu quả nhất.</p>
      </div>
      <div class="steps-list">
        ${steps.map(s => `
          <div class="step-card">
            <div class="step-badge">${s.step}</div>
            <div class="step-body">
              <div class="step-head">
                <span class="step-icon">${esc(s.icon || '📌')}</span>
                <span class="step-title">${esc(s.title)}</span>
              </div>
              <p class="step-content">${esc(s.content)}</p>
              ${s.tips ? `
                <div class="step-tip">
                  <span class="tip-icon">💡</span>
                  <span>${esc(s.tips)}</span>
                </div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ══════════════════════════════════════════
     4. TAB VIDEOS — video cards có link
  ══════════════════════════════════════════ */
  function renderVideos(wrap) {
    const videos = DB.link_vid;

    if (!Array.isArray(videos) || videos.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="e-icon">🎬</div><p>Chưa có video hướng dẫn.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="sec-header">
        <div class="sec-title"><span class="icon">🎬</span> Video hướng dẫn</div>
        <p class="sec-sub">Xem video để hiểu rõ cách sử dụng từng tính năng của Study Helper.</p>
      </div>
      <div class="video-grid">
        ${videos.map(v => `
          <a class="video-card"
             href="${esc(v.url)}"
             target="_blank"
             rel="noopener noreferrer"
             aria-label="Xem video: ${esc(v.title)}">
            <div class="video-thumb">
              <span class="thumb-icon">${esc(v.thumbnail_icon || '▶')}</span>
              <div class="play-btn">▶</div>
              ${v.duration ? `<span class="dur-badge">${esc(v.duration)}</span>` : ''}
            </div>
            <div class="video-body">
              <span class="video-tag">${esc(v.tag || 'Video')}</span>
              <div class="video-title">${esc(v.title)}</div>
              <div class="video-desc">${esc(v.description)}</div>
              <div class="video-link-hint">🔗 Nhấn để xem video</div>
            </div>
          </a>`).join('')}
      </div>`;
  }

  /* ══════════════════════════════════════════
     5. TAB DEV — thông tin nhà phát triển
  ══════════════════════════════════════════ */
  function renderDev(wrap) {
    const d = DB.dev_info;
    if (!d) {
      wrap.innerHTML = `<div class="empty-state"><div class="e-icon">👨‍💻</div><p>Chưa có thông tin nhà phát triển.</p></div>`;
      return;
    }

    const dev = d.developer || {};

    /* Xây contact links */
    const contacts = [];
    if (dev.email)   contacts.push({ icon: '✉️',  label: 'Email',   url: `mailto:${dev.email}`,  val: dev.email });
    if (dev.github)  contacts.push({ icon: '🐙',  label: 'GitHub',  url: dev.github,              val: 'GitHub'  });
    if (dev.website) contacts.push({ icon: '🌐',  label: 'Website', url: dev.website,             val: 'Website' });

    /* Module status helper */
    const statusClass = s => {
      if (!s) return 'status-planned';
      const lc = s.toLowerCase();
      if (lc.includes('hoàn') || lc.includes('xong')) return 'status-done';
      if (lc.includes('phát') || lc.includes('wip') || lc.includes('đang')) return 'status-wip';
      return 'status-planned';
    };

    wrap.innerHTML = `
      <div class="sec-header">
        <div class="sec-title"><span class="icon">👨‍💻</span> Thông tin nhà phát triển</div>
      </div>

      <!-- Hero card -->
      <div class="dev-hero">
        <div class="dev-avatar"><span class="dev-avatar-icon">🏢</span></div>
        <div class="dev-info">
          <div class="dev-name">${esc(dev.name || d.product_name)}</div>
          <div class="dev-role">${esc(dev.role || 'Developer')}</div>
          <div class="dev-desc">${esc(d.description || '')}</div>
          ${contacts.length ? `
            <div class="dev-contacts">
              ${contacts.map(c => `
                <a class="contact-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">
                  ${c.icon} ${esc(c.label)}
                </a>`).join('')}
            </div>` : ''}
        </div>
      </div>

      <!-- Version badges -->
      <div class="version-row">
        ${d.version    ? `<span class="ver-badge v-version">📦 v${esc(d.version)}</span>` : ''}
        ${d.release_date ? `<span class="ver-badge v-release">📅 ${esc(d.release_date)}</span>` : ''}
        ${d.license    ? `<span class="ver-badge v-license">⚖️ ${esc(d.license)}</span>` : ''}
      </div>

      <!-- Thành viên nhóm -->
      ${Array.isArray(d.members) && d.members.length ? `
        <div class="dev-section members-section">
          <div class="dev-section-title">👥 Thành viên phát triển</div>
          <div class="members-grid">
            ${d.members.map((m, i) => {
              const isLead = i === 0;
              const leadStyle = isLead
                ? 'style="display:inline-block;white-space:nowrap;position:relative;z-index:30;"'
                : '';
              return `
              <div class="member-card" style="--m-color:${esc(m.color || '#00CED1')};--m-delay:${i * 80}ms;overflow:visible;">
                <div class="member-glow"></div>
                <div class="member-avatar">${esc(m.emoji || '👤')}</div>
                <div class="member-body" style="overflow:visible;">
                  <div class="${isLead ? 'member-name name-lead' : 'member-name'}" ${leadStyle}>${esc(m.name)}</div>
                  <div class="member-role">${esc(m.role || '')}</div>
                </div>
                <div class="member-index">${String(i + 1).padStart(2, '0')}</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

      <!-- Tech stack -->
      ${Array.isArray(d.tech_stack) && d.tech_stack.length ? `
        <div class="dev-section">
          <div class="dev-section-title">⚙️ Công nghệ sử dụng</div>
          <div class="tech-grid">
            ${d.tech_stack.map(t => `
              <div class="tech-card">
                <span class="t-icon">${esc(t.icon || '🔧')}</span>
                <span class="t-name">${esc(t.name)}</span>
                <span class="t-desc">${esc(t.desc || '')}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      <!-- AI Support -->
      <div class="dev-section">
        <div class="dev-section-title">🤖 Công nghệ hỗ trợ</div>
        <div class="ai-support-grid">
          <div class="ai-card ai-claude">
            <div class="ai-logo">✦</div>
            <div class="ai-info">
              <div class="ai-name">Claude</div>
              <div class="ai-desc">Anthropic · AI hỗ trợ code</div>
            </div>
          </div>
          <div class="ai-card ai-chatgpt">
            <div class="ai-logo">⬡</div>
            <div class="ai-info">
              <div class="ai-name">ChatGPT</div>
              <div class="ai-desc">OpenAI · AI hỗ trợ prompt</div>
            </div>
          </div>
          <div class="ai-card ai-gemini">
            <div class="ai-logo">✦</div>
            <div class="ai-info">
              <div class="ai-name">Gemini</div>
              <div class="ai-desc">Google · AI hỗ trợ hình ảnh</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Module status -->
      ${Array.isArray(d.modules) && d.modules.length ? `
        <div class="dev-section">
          <div class="dev-section-title">📋 Trạng thái các module</div>
          <div class="module-list">
            ${d.modules.map(m => `
              <div class="module-item">
                <span class="mod-icon">${esc(m.icon || '📄')}</span>
                <span class="mod-name">${esc(m.name)}</span>
                <span class="mod-status ${statusClass(m.status)}">${esc(m.status || 'Chưa rõ')}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}` ;

    /* ── JS Animation mượt: Trần Lê Tiến Dũng ── */
    requestAnimationFrame(() => {
      const el = wrap.querySelector('.name-lead');
      if (!el) return;

      // Reset mọi CSS animation cũ, chỉ dùng JS rAF
      Object.assign(el.style, {
        display       : 'inline-block',
        whiteSpace    : 'nowrap',
        transformOrigin: 'center center',
        position      : 'relative',
        zIndex        : '30',
        fontWeight    : '900',
        overflow      : 'visible',
        willChange    : 'transform, color, text-shadow',
        animation     : 'none',   /* tắt mọi CSS animation */
        transition    : 'none',   /* tắt mọi CSS transition */
      });

      // Hiệu ứng theo video:
      // - Màu: trắng → xanh lá sáng → xanh đậm (đỉnh) → vàng cam → trắng
      // - Scale: 1 → 1.35 (linear, đều) → 1
      // - Glow theo màu
      // Chu kỳ: 2.4s

      const DUR = 2400; // ★ Chu kỳ hiệu ứng (ms). Đổi số này để nhanh/chậm hơn
      let t0 = null;

      // Lerp màu hex tuyến tính
      function lerpHex(c1, c2, t) {
        const h = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
        const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
        return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
      }

      // Keyframes màu theo video (p=0→1)
      // 0.0: trắng  #FFFFFF  scale=1.0
      // 0.3: xanh sáng #66FF66  scale=1.18
      // 0.5: xanh đậm #00CC44  scale=1.35 (đỉnh)
      // 0.7: vàng  #FFCC00  scale=1.18
      // 1.0: trắng #FFFFFF  scale=1.0
      // ── KEYFRAMES ─────────────────────────────────────────────
      // Phóng to (p=0→0.5): cam #FF6B00 → xanh lá mạ #7FFF00
      // Thu nhỏ  (p=0.5→1): xanh lá mạ #7FFF00 → cam #FF6B00
      //
      // ★ Tỉ lệ phóng to tối đa: scale tại p=0.5 (dòng đỉnh bên dưới)
      //   Giá trị hiện tại: 1.50 (= 150%)
      //   Đổi thành 1.30 để phóng 130%, 1.70 để phóng 170%, v.v.
      //
      // ★ Thời gian chu kỳ: const DUR ở trên (ms)
      //   Giá trị hiện tại: 2400ms = 2.4 giây
      //   Đổi thành 1500 để nhanh hơn, 3000 để chậm hơn
      const KF = [
        { p:0.0, color:'#FF6B00', scale:1.00 }, // bắt đầu: cam, kích thước gốc
        { p:0.5, color:'#7FFF00', scale:1.50 }, // đỉnh: xanh lá mạ, TO NHẤT ← đổi scale ở đây
        { p:1.0, color:'#FF6B00', scale:1.00 }, // kết thúc: cam, kích thước gốc
      ];

      function tick(ts) {
        if (!t0) t0 = ts;
        const p = ((ts - t0) % DUR) / DUR; // 0→1 linear

        // Tìm 2 keyframe bao quanh p
        let i = 0;
        while (i < KF.length-2 && KF[i+1].p <= p) i++;
        const kA = KF[i], kB = KF[i+1];
        const seg = kB.p - kA.p;
        const t = seg > 0 ? (p - kA.p) / seg : 0; // linear trong segment

        const sc  = kA.scale + (kB.scale - kA.scale) * t;
        const col = lerpHex(kA.color, kB.color, t);

        // Glow tỉ lệ với mức phóng to
        const glowSize = Math.round((sc - 1) * 60);
        const glow = glowSize > 2
          ? `0 0 ${glowSize}px ${col}, 0 0 ${glowSize*2}px ${col}55`
          : 'none';

        el.style.transform  = `scale(${sc.toFixed(4)})`;
        el.style.color      = col;
        el.style.textShadow = glow;

        if (el.isConnected) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ══════════════════════════════════════════
     6. CẬP NHẬT FOOTER
  ══════════════════════════════════════════ */
  function updateFooter() {
    if (!DB?.dev_info || !footerText) return;
    const d = DB.dev_info;
    footerText.textContent =
      `${d.product_name || 'Study Helper'} v${d.version || '1.0'} © ${d.release_date || '2025'}`;
  }

  /* ══════════════════════════════════════════
     6b. CHANGELOG — nhật ký phát triển
  ══════════════════════════════════════════ */
  async function renderChangelog(wrap) {
    wrap.innerHTML = `
      <div class="sec-header">
        <div class="sec-title"><span class="icon">📜</span> Nhật ký phát triển</div>
        <p class="sec-sub">Lịch sử các phiên bản và cập nhật của Study Helper.</p>
      </div>
      <div id="cl-loading" style="padding:20px;color:var(--text2)">Đang tải...</div>`;

    let raw = '';
    try {
      const res = await fetch('changelog.txt');
      if (!res.ok) throw new Error('Không tìm thấy file changelog.txt');
      raw = await res.text();
    } catch(e) {
      wrap.querySelector('#cl-loading').outerHTML = `
        <div class="empty-state"><div class="e-icon">📄</div><p>${esc(e.message)}</p></div>`;
      return;
    }

    /* Parse: - tiêu đề lớn, + item con */
    const lines = raw.split('\n');
    const entries = [];
    let cur = null;
    for (const l of lines) {
      const s = l.trim();
      if (!s) continue;
      if (s.startsWith('- '))      { if (cur) entries.push(cur); cur = { title: s.slice(2).trim(), items: [] }; }
      else if (s.startsWith('+ ') && cur) cur.items.push(s.slice(2).trim());
    }
    if (cur) entries.push(cur);

    if (!entries.length) {
      wrap.querySelector('#cl-loading').outerHTML =
        `<div class="empty-state"><div class="e-icon">📭</div><p>Chưa có nội dung.</p></div>`;
      return;
    }

    const html = entries.map((entry, i) => `
      <div class="cl-entry" style="animation-delay:${i * 50}ms">
        <div class="cl-dot"></div>
        <div class="cl-body">
          <div class="cl-title">${esc(entry.title)}</div>
          ${entry.items.length ? `<ul class="cl-items">${entry.items.map(it =>
            `<li>${esc(it)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`).join('');

    wrap.innerHTML = `
      <div class="sec-header">
        <div class="sec-title"><span class="icon">📜</span> Nhật ký phát triển</div>
        <p class="sec-sub">Lịch sử các phiên bản và cập nhật của Study Helper.</p>
      </div>
      <div class="cl-timeline">${html}</div>`;
  }

  /* ══════════════════════════════════════════
     7. RESTORE TAB TỪ URL HASH
  ══════════════════════════════════════════ */
  function restoreHash() {
    const hash = location.hash.replace('#', '');
    const validTabs = ['guide', 'videos', 'dev', 'changelog'];
    if (validTabs.includes(hash)) {
      activeTab = hash;
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === hash));
    }
  }

  /* ══════════════════════════════════════════
     8. INIT
  ══════════════════════════════════════════ */
  function init() {
    /* Đồng bộ dark mode lúc load */
    const theme = localStorage.getItem('sh-theme');
    if (theme === 'dark') { document.documentElement.classList.add('dark'); document.body.classList.add('dark'); }

    /* Lắng nghe yêu cầu đổi theme từ home.html qua postMessage */
    window.addEventListener('message', e => {
      if (!e.data || e.data.type !== 'SH_THEME') return;
      document.documentElement.classList.toggle('dark', !!e.data.dark); document.body.classList.toggle('dark', !!e.data.dark);
    });

    restoreHash();
    loadDB();
  }

  init();
})();
