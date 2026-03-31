/* ============================================================
   theory.js — Module Lý thuyết, Study Helper
   State machine 4 cấp:
     VIEW_HOME   → chọn khối lớp
     VIEW_CLASS  → chọn môn học
     VIEW_SUBJECT→ chọn bài học
     VIEW_LESSON → xem chi tiết bài + công thức
   Dữ liệu load 1 lần từ theory.json, không hard-code.
============================================================ */

(() => {
  'use strict';

  /* ─── DOM refs ─── */
  const content    = document.getElementById('th-content');
  const breadcrumb = document.getElementById('breadcrumb');

  /* ─── Trạng thái hiện tại ─── */
  const state = { view: 'home', classId: null, subjectId: null, lessonId: null };

  /* ─── Dữ liệu tổng (load 1 lần) ─── */
  let DB = null;

  /* ─── Metadata hiển thị ─── */
  const CLASS_META = {
    class10: { label: 'Khối 10', icon: '1️⃣0️⃣', badge: 'badge-c10' },
    class11: { label: 'Khối 11', icon: '1️⃣1️⃣', badge: 'badge-c11' },
    class12: { label: 'Khối 12', icon: '1️⃣2️⃣', badge: 'badge-c12' }
  };

  const SUBJECT_META = {
    math       : { label: 'Toán',         icon: '📐' },
    physics    : { label: 'Vật lý',        icon: '⚛️'  },
    chemistry  : { label: 'Hóa học',       icon: '🧪' },
    biology    : { label: 'Sinh học',      icon: '🌿' },
    technology : { label: 'Công nghệ',     icon: '⚙️'  },
    informatics: { label: 'Tin học',       icon: '💻' },
    literature : { label: 'Ngữ văn',       icon: '📚' },
    english    : { label: 'Tiếng Anh',     icon: '🔤' },
    history    : { label: 'Lịch sử',       icon: '🏛️'  },
    geography  : { label: 'Địa lí',        icon: '🌏' }
  };

  /* ══════════════════════════════════════════
     1. LOAD JSON (1 lần duy nhất)
  ══════════════════════════════════════════ */
  async function loadDB() {
    try {
      const res = await fetch('theory.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DB = await res.json();
      renderView();
    } catch (err) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">⚠️</div>
          <p>Không tải được dữ liệu lý thuyết.<br>
             Lỗi: <code>${err.message}</code></p>
        </div>`;
    }
  }

  /* ══════════════════════════════════════════
     2. ROUTER — điều phối render theo state
  ══════════════════════════════════════════ */
  function renderView() {
    /* Kích hoạt lại animation mỗi lần đổi view */
    content.innerHTML = '';
    const wrap = document.createElement('div');
    content.appendChild(wrap);

    switch (state.view) {
      case 'home'   : renderHome(wrap);    break;
      case 'class'  : renderClass(wrap);   break;
      case 'subject': renderSubject(wrap); break;
      case 'lesson' : renderLesson(wrap);  break;
    }
    renderBreadcrumb();
    /* Cuộn lên đầu mỗi lần chuyển view */
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ══════════════════════════════════════════
     3. BREADCRUMB
  ══════════════════════════════════════════ */
  function renderBreadcrumb() {
    const crumbs = [{ label: 'Lý thuyết', view: 'home', cls: null, sub: null, les: null }];

    if (state.classId) {
      crumbs.push({
        label: CLASS_META[state.classId]?.label || state.classId,
        view: 'class', cls: state.classId, sub: null, les: null
      });
    }
    if (state.subjectId) {
      crumbs.push({
        label: SUBJECT_META[state.subjectId]?.label || state.subjectId,
        view: 'subject', cls: state.classId, sub: state.subjectId, les: null
      });
    }
    if (state.lessonId) {
      const lessons = DB?.[state.classId]?.[state.subjectId] || [];
      const lesson  = lessons.find(l => l.id === state.lessonId);
      crumbs.push({
        label: lesson?.title || state.lessonId,
        view: 'lesson', cls: state.classId, sub: state.subjectId, les: state.lessonId
      });
    }

    breadcrumb.innerHTML = crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      const sep    = i < crumbs.length - 1 ? '<span class="bc-sep">›</span>' : '';
      if (isLast) return `<span class="bc-item bc-current">${c.label}</span>${sep}`;
      return `<span class="bc-item" data-view="${c.view}"
                    data-cls="${c.cls || ''}" data-sub="${c.sub || ''}"
                    data-les="${c.les || ''}">${c.label}</span>${sep}`;
    }).join('');

    breadcrumb.querySelectorAll('.bc-item:not(.bc-current)').forEach(el => {
      el.addEventListener('click', () => navigate(
        el.dataset.view,
        el.dataset.cls  || null,
        el.dataset.sub  || null,
        el.dataset.les  || null
      ));
    });
  }

  /* ══════════════════════════════════════════
     4. VIEW_HOME — Chọn khối lớp
  ══════════════════════════════════════════ */
  function renderHome(wrap) {
    wrap.innerHTML = `
      <div class="section-title"><span class="icon">📖</span> Lý Thuyết</div>
      <p class="section-sub">Chọn khối lớp để xem danh sách môn học.</p>
      <div class="class-grid">
        ${Object.keys(CLASS_META).map(cid => {
          const m = CLASS_META[cid];
          const subjects = DB[cid] ? Object.keys(DB[cid]).length : 0;
          return `
            <div class="class-card" data-class="${cid}">
              <div class="c-icon">${m.icon}</div>
              <div class="c-name">${m.label}</div>
              <div class="c-desc">${subjects} môn học &mdash; ${countLessons(cid)} bài lý thuyết</div>
              <div class="c-badge ${m.badge}">${cid}</div>
            </div>`;
        }).join('')}
      </div>`;

    wrap.querySelectorAll('.class-card').forEach(card => {
      card.addEventListener('click', () => navigate('class', card.dataset.class));
    });
  }

  function countLessons(classId) {
    if (!DB[classId]) return 0;
    return Object.values(DB[classId]).reduce((acc, arr) => acc + arr.length, 0);
  }

  /* ══════════════════════════════════════════
     5. VIEW_CLASS — Chọn môn học
  ══════════════════════════════════════════ */
  function renderClass(wrap) {
    const cm = CLASS_META[state.classId];
    const subjects = DB[state.classId] || {};

    wrap.innerHTML = `
      <div class="section-title">
        <span class="icon">${cm.icon}</span> ${cm.label}
      </div>
      <p class="section-sub">Chọn môn học để xem danh sách bài lý thuyết.</p>
      <div class="subject-grid">
        ${Object.keys(subjects).map(sid => {
          const sm = SUBJECT_META[sid] || { label: sid, icon: '📄' };
          const count = subjects[sid].length;
          return `
            <div class="subject-card" data-subject="${sid}">
              <div class="s-icon">${sm.icon}</div>
              <div class="s-name">${sm.label}</div>
              <div class="s-id">${count} bài · ${sid}</div>
            </div>`;
        }).join('')}
      </div>`;

    wrap.querySelectorAll('.subject-card').forEach(card => {
      card.addEventListener('click', () =>
        navigate('subject', state.classId, card.dataset.subject)
      );
    });
  }

  /* ══════════════════════════════════════════
     6. VIEW_SUBJECT — Danh sách bài học
  ══════════════════════════════════════════ */
  function renderSubject(wrap) {
    const sm      = SUBJECT_META[state.subjectId] || { label: state.subjectId, icon: '📄' };
    const cm      = CLASS_META[state.classId];
    const lessons = DB[state.classId]?.[state.subjectId] || [];

    if (lessons.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">📭</div>
          <p>Chưa có bài lý thuyết cho môn này.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="section-title">
        <span class="icon">${sm.icon}</span> ${sm.label}
        <span style="font-size:.85rem;font-weight:600;color:var(--text2)">${cm.label}</span>
      </div>
      <p class="section-sub">${lessons.length} bài lý thuyết. Chọn bài để xem nội dung chi tiết.</p>
      <div class="lesson-list">
        ${lessons.map((les, idx) => `
          <div class="lesson-item" data-lesid="${les.id}">
            <div class="l-num">${idx + 1}</div>
            <div class="l-title">${escHtml(les.title)}</div>
            <div class="l-arrow">›</div>
          </div>`).join('')}
      </div>`;

    wrap.querySelectorAll('.lesson-item').forEach(item => {
      item.addEventListener('click', () =>
        navigate('lesson', state.classId, state.subjectId, item.dataset.lesid)
      );
    });
  }

  /* ══════════════════════════════════════════
     7. VIEW_LESSON — Chi tiết bài học
  ══════════════════════════════════════════ */
  function renderLesson(wrap) {
    const lessons = DB[state.classId]?.[state.subjectId] || [];
    const lesson  = lessons.find(l => l.id === state.lessonId);

    if (!lesson) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">🔍</div><p>Không tìm thấy bài học.</p>
        </div>`;
      return;
    }

    const cm = CLASS_META[state.classId];
    const sm = SUBJECT_META[state.subjectId] || { label: state.subjectId, icon: '📄' };

    /* Nội dung công thức */
    const formulaHtml = lesson.formulas?.length
      ? `<div class="formula-section">
           <h2>🔢 Công thức</h2>
           <div class="formula-grid">
             ${lesson.formulas.map(f => `
               <div class="formula-card">
                 <div class="f-label">${escHtml(f.label)}</div>
                 <div class="f-expr">${escHtml(f.expr)}</div>
               </div>`).join('')}
           </div>
         </div>`
      : '';

    /* URL sang Practice với params */
    const practiceURL =
      `../Practice/practice.html?class=${encodeURIComponent(state.classId)}`
      + `&subject=${encodeURIComponent(state.subjectId)}`
      + `&lesson=${encodeURIComponent(state.lessonId)}`;

    wrap.innerHTML = `
      <div class="lesson-detail">
        <div class="lesson-header">
          <h1>${escHtml(lesson.title)}</h1>
          <div class="lesson-meta">
            <span class="meta-tag" style="background:var(--cyan);color:var(--black)">${cm.label}</span>
            <span class="meta-tag" style="background:var(--teal);color:var(--white)">${sm.icon} ${sm.label}</span>

          </div>
        </div>

        <div class="lesson-content">${escHtml(lesson.content)}</div>

        ${formulaHtml}

        <div class="lesson-divider"></div>

        <button class="btn-practice" onclick="(function(){
          window.parent.postMessage({
            type: 'SH_NAVIGATE',
            page: 'practice',
            url: '${practiceURL}'
          }, '*');
        })()">
          ✏️ Luyện tập bài này
        </button>
      </div>`;
  }

  /* ══════════════════════════════════════════
     8. NAVIGATE — thay đổi state → re-render
  ══════════════════════════════════════════ */
  function navigate(view, classId = null, subjectId = null, lessonId = null) {
    state.view      = view;
    state.classId   = classId;
    state.subjectId = subjectId;
    state.lessonId  = lessonId;

    /* Ghi vào URL hash để hỗ trợ back/forward */
    const hash = [view, classId, subjectId, lessonId].filter(Boolean).join('/');
    history.replaceState(null, '', `#${hash}`);

    renderView();
  }

  /* ══════════════════════════════════════════
     9. RESTORE STATE từ URL hash
  ══════════════════════════════════════════ */
  function restoreFromHash() {
    const hash  = location.hash.replace('#', '');
    const parts = hash.split('/').filter(Boolean);
    const views = ['home', 'class', 'subject', 'lesson'];

    if (parts.length > 0 && views.includes(parts[0])) {
      state.view      = parts[0] || 'home';
      state.classId   = parts[1] || null;
      state.subjectId = parts[2] || null;
      state.lessonId  = parts[3] || null;
    }
  }

  /* ══════════════════════════════════════════
     10. UTIL
  ══════════════════════════════════════════ */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════
     11. INIT
  ══════════════════════════════════════════ */
  function init() {
    /* Đồng bộ dark mode với trang chủ lúc load */
    const theme = localStorage.getItem('sh-theme');
    if (theme === 'dark') { document.documentElement.classList.add('dark'); document.body.classList.add('dark'); }

    /* Lắng nghe yêu cầu đổi theme từ home.html qua postMessage */
    window.addEventListener('message', e => {
      if (!e.data || e.data.type !== 'SH_THEME') return;
      document.documentElement.classList.toggle('dark', !!e.data.dark); document.body.classList.toggle('dark', !!e.data.dark);
    });

    /* Đọc ?class=&subject=&lesson= từ URL (vd: từ màn thua Game về Lý thuyết) */
    const params = new URLSearchParams(location.search);
    const cls  = params.get('class');
    const subj = params.get('subject');
    const les  = params.get('lesson');
    if (cls && subj && les) {
      /* Trỏ thẳng vào bài cụ thể */
      state.classId   = cls;
      state.subjectId = subj;
      state.lessonId  = les;
      state.view      = 'lesson';
      history.replaceState(null, '', location.pathname);
    } else if (cls && subj) {
      state.classId   = cls;
      state.subjectId = subj;
      state.view      = 'subject';
      history.replaceState(null, '', location.pathname);
    } else {
      restoreFromHash();
    }

    loadDB();
  }

  init();
})();
