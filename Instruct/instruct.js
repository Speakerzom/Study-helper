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
  const footerText = document.getElementById('footer-text');

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
      case 'guide' : renderGuide(wrap);  break;
      case 'videos': renderVideos(wrap); break;
      case 'dev'   : renderDev(wrap);    break;
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
        <p class="sec-sub">Study Helper được phát triển bởi đội ngũ tâm huyết với giáo dục.</p>
      </div>

      <!-- Hero card -->
      <div class="dev-hero">
        <div class="dev-avatar">👨‍💻</div>
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
        </div>` : ''}`;
  }

  /* ══════════════════════════════════════════
     6. CẬP NHẬT FOOTER
  ══════════════════════════════════════════ */
  function updateFooter() {
    if (!DB?.dev_info) return;
    if (!footerText) return;
    const d = DB.dev_info;
    footerText.textContent =
      `${d.product_name || 'Study Helper'} v${d.version || '1.0'} © ${d.release_date || '2025'}`;
  }

  /* ══════════════════════════════════════════
     7. RESTORE TAB TỪ URL HASH
  ══════════════════════════════════════════ */
  function restoreHash() {
    const hash = location.hash.replace('#', '');
    const validTabs = ['guide', 'videos', 'dev'];
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
