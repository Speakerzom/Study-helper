/* ============================================================
   practice.js — Module Luyện Tập, Study Helper
   State machine 4 cấp:
     VIEW_HOME    → chọn khối lớp
     VIEW_CLASS   → chọn môn học
     VIEW_SUBJECT → danh sách bài học + nút Bắt đầu Game
     (không có VIEW_LESSON riêng — bấm Bắt đầu đi thẳng game)
   Luồng: Practice → game.html?class=&subject=&lesson=
   Khi quay về: game.html?...&done=lessonId → đánh dấu hoàn thành
============================================================ */

(() => {
  'use strict';

  /* ─── DOM refs ─── */
  const content  = document.getElementById('pr-content');
  const breadNav = document.getElementById('breadcrumb');
  const banner   = document.getElementById('validate-banner');

  /* ─── State ─── */
  const st = {
    view           : 'home',   // 'home' | 'class' | 'subject'
    classId        : null,
    subjectId      : null,
    pendingLessonId: null,     // lesson cần highlight khi từ Theory sang
  };

  /* ─── Dữ liệu ─── */
  let DB       = null;   // practice.json
  let THEORY   = null;   // theory.json — dùng để lấy tên bài

  /* ─── Metadata cố định ─── */
  const CLASS_META = {
    class10: { label: 'Khối 10', icon: '<span class="class-icon-wrap">1️⃣0️⃣</span>', badge: 'badge-c10' },
    class11: { label: 'Khối 11', icon: '<span class="class-icon-wrap">1️⃣1️⃣</span>', badge: 'badge-c11' },
    class12: { label: 'Khối 12', icon: '<span class="class-icon-wrap">1️⃣2️⃣</span>', badge: 'badge-c12' },
  };

  const SUBJECT_META = {
    math       : { label: 'Toán',       icon: '<span class="icon-math">📐</span>' },
    physics    : { label: 'Vật lý',     icon: '<span class="icon-physics">⚛️</span>'  },
    chemistry  : { label: 'Hóa học',    icon: '<span class="icon-chemistry">🧪</span>' },
    biology    : { label: 'Sinh học',   icon: '<span class="icon-biology">🌿</span>' },
    technology : { label: 'Công nghệ',  icon: '<span class="icon-technology">⚙️</span>'  },
    informatics: { label: 'Tin học',    icon: '<span class="icon-informatics">💻</span>' },
    literature : { label: 'Ngữ văn',    icon: '<span class="icon-literature">📚</span>' },
    english    : { label: 'Tiếng Anh',  icon: '<span class="icon-english">🔤</span>' },
    history    : { label: 'Lịch sử',    icon: '<span class="icon-history">🏛️</span>'  },
    geography  : { label: 'Địa lí',     icon: '<span class="icon-geography">🌏</span>' },
  };

  /* ══════════════════════════════════════════
     UTIL
  ══════════════════════════════════════════ */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─── Lấy tên bài từ theory.json; fallback về lessonId nếu không có ─── */
  function getLessonTitle(lessonId) {
    if (!THEORY || !st.classId || !st.subjectId) return lessonId;
    const lessons = THEORY[st.classId]?.[st.subjectId];
    if (!Array.isArray(lessons)) return lessonId;
    const found = lessons.find(l => l.id === lessonId);
    return found?.title || lessonId;
  }

  /* ─── Kiểm tra lesson đã hoàn thành chưa ─── */
  function isDone(lessonId) {
    try {
      const db  = JSON.parse(localStorage.getItem('sh_game_completed') || '{}');
      const key = `${st.classId}__${st.subjectId}__${lessonId}`;
      return !!db[key];
    } catch(_) { return false; }
  }

  /* ─── Lấy % điểm và rank của lesson ─── */
  function getScore(lessonId) {
    try {
      const db  = JSON.parse(localStorage.getItem('sh_game_completed') || '{}');
      const key = `${st.classId}__${st.subjectId}__${lessonId}`;
      const rec = db[key];
      if (!rec) return null;
      /* Đã có pct → dùng luôn */
      if (typeof rec.pct === 'number') return rec.pct;
      /* Data cũ (chỉ có correct/total) → tính pct và migrate */
      if (typeof rec.correct === 'number' && typeof rec.total === 'number' && rec.total > 0) {
        const pct = Math.round(rec.correct / rec.total * 100);
        rec.pct = pct;
        db[key] = rec;
        localStorage.setItem('sh_game_completed', JSON.stringify(db));
        return pct;
      }
      /* Có record nhưng thiếu data → gán 0 để hiện rank C */
      return 0;
    } catch(_) { return null; }
  }

  function getRank(pct) {
    if (pct === null) return null;
    if (pct >= 90) return { label: 'S', color: '#FFD700', glow: 'rgba(255,215,0,.5)' };
    if (pct >= 80) return { label: 'A', color: '#00CED1', glow: 'rgba(0,206,209,.4)' };
    if (pct >= 60) return { label: 'B', color: '#7FFF00', glow: 'rgba(127,255,0,.4)' };
    return               { label: 'C', color: '#FF6B00', glow: 'rgba(255,107,0,.4)' };
  }

  /* ─── Đọc URL params: 2 trường hợp ─────────────────────────
     1. ?class=&subject=&done=   ← quay về từ Game (thắng)
     2. ?class=&subject=&lesson= ← từ Theory "Luyện tập bài này"
  ─────────────────────────────────────────────────────────── */
  function applyURLParams() {
    const params = new URLSearchParams(location.search);
    const cls    = params.get('class');
    const subj   = params.get('subject');
    const doneId = params.get('done');
    const lesId  = params.get('lesson');

    if (!cls || !subj) return;

    /* Trường hợp 1: quay về từ Game sau khi THẮNG (?done=lessonId)
       KHÔNG ghi localStorage ở đây — game.js đã ghi trong markCompleted()
       trước khi redirect. Practice chỉ cần navigate đến đúng subject view. */

    /* Cả 2 trường hợp đều mở subject view đúng */
    st.classId   = cls;
    st.subjectId = subj;
    st.view      = 'subject';

    /* Lưu lessonId cần highlight/scroll sau khi render */
    st.pendingLessonId = lesId || doneId || null;

    /* Xóa params khỏi URL */
    history.replaceState(null, '', location.pathname);
  }

  /* ══════════════════════════════════════════
     LOAD JSON
  ══════════════════════════════════════════ */
  async function loadDB() {
    try {
      const res = await fetch('practice.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DB = await res.json();
    } catch(err) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">⚠️</div>
          <p>Không tải được dữ liệu luyện tập.<br>
             <code>${esc(err.message)}</code></p>
        </div>`;
      return false;
    }
    return true;
  }

  /* Load theory.json riêng để lấy tên bài — không ảnh hưởng nếu lỗi */
  async function loadTheory() {
    try {
      const res = await fetch('../Theory/theory.json');
      if (!res.ok) return;
      THEORY = await res.json();
    } catch(_) { /* tên bài sẽ fallback về lessonId */ }
  }

  /* ══════════════════════════════════════════
     ROUTER
  ══════════════════════════════════════════ */
  function navigate(view, classId = null, subjectId = null) {
    st.view      = view;
    st.classId   = classId;
    st.subjectId = subjectId;

    const hash = [view, classId, subjectId].filter(Boolean).join('/');
    history.replaceState(null, '', `#${hash}`);

    render();
  }

  function render() {
    content.innerHTML = '';
    const wrap = document.createElement('div');
    content.appendChild(wrap);

    switch (st.view) {
      case 'home'   : renderHome(wrap);    break;
      case 'class'  : renderClass(wrap);   break;
      case 'subject': renderSubject(wrap); break;
    }
    renderBreadcrumb();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ══════════════════════════════════════════
     BREADCRUMB
  ══════════════════════════════════════════ */
  function renderBreadcrumb() {
    const crumbs = [{ label: 'Luyện Tập', view: 'home', cls: null, sub: null }];

    if (st.classId) {
      crumbs.push({
        label: CLASS_META[st.classId]?.label || st.classId,
        view: 'class', cls: st.classId, sub: null,
      });
    }
    if (st.subjectId) {
      crumbs.push({
        label: SUBJECT_META[st.subjectId]?.label || st.subjectId,
        view: 'subject', cls: st.classId, sub: st.subjectId,
      });
    }

    breadNav.innerHTML = crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      const sep    = i < crumbs.length - 1 ? '<span class="bc-sep">›</span>' : '';
      if (isLast) return `<span class="bc-item bc-current">${esc(c.label)}</span>${sep}`;
      return `<span class="bc-item"
                    data-view="${c.view}"
                    data-cls="${c.cls || ''}"
                    data-sub="${c.sub || ''}"
              >${esc(c.label)}</span>${sep}`;
    }).join('');

    breadNav.querySelectorAll('.bc-item:not(.bc-current)').forEach(el => {
      el.addEventListener('click', () =>
        navigate(el.dataset.view, el.dataset.cls || null, el.dataset.sub || null)
      );
    });
  }

  /* ══════════════════════════════════════════
     VIEW HOME — chọn khối lớp
  ══════════════════════════════════════════ */
  function renderHome(wrap) {
    wrap.innerHTML = `
      <div class="section-title"><span class="icon icon-practice-logo">✏️</span> Luyện Tập</div>
      <p class="section-sub">Chọn khối lớp để bắt đầu luyện tập.</p>
      <div class="class-grid">
        ${Object.keys(CLASS_META).map(cid => {
          const m        = CLASS_META[cid];
          const subjects = DB[cid] ? Object.keys(DB[cid]).length : 0;
          const lessons  = countLessons(cid);
          return `
            <div class="class-card" data-class="${cid}">
              <div class="c-icon">${m.icon}</div>
              <div class="c-name">${m.label}</div>
              <div class="c-desc">${subjects} môn — ${lessons} bài luyện tập</div>
              <div class="c-badge ${m.badge}">${cid}</div>
            </div>`;
        }).join('')}
      </div>`;

    wrap.querySelectorAll('.class-card').forEach(card =>
      card.addEventListener('click', () => navigate('class', card.dataset.class))
    );
  }

  function countLessons(classId) {
    if (!DB[classId]) return 0;
    return Object.values(DB[classId]).reduce((acc, subj) => acc + Object.keys(subj).length, 0);
  }

  /* ══════════════════════════════════════════
     VIEW CLASS — chọn môn học
  ══════════════════════════════════════════ */
  function renderClass(wrap) {
    const cm       = CLASS_META[st.classId];
    const subjects = DB[st.classId] || {};

    wrap.innerHTML = `
      <div class="section-title">
        ${cm.icon}<span class="section-title-label">${cm.label}</span>
      </div>
      <p class="section-sub">Chọn môn học để xem danh sách bài luyện tập.</p>
      <div class="subject-grid">
        ${Object.keys(subjects).map(sid => {
          const sm    = SUBJECT_META[sid] || { label: sid, icon: '📄' };
          const count = Object.keys(subjects[sid]).length;
          return `
            <div class="subject-card" data-subject="${sid}">
              <div class="s-icon">${sm.icon}</div>
              <div class="s-name">${sm.label}</div>
              <div class="s-id">${count} bài · ${sid}</div>
            </div>`;
        }).join('')}
      </div>`;

    wrap.querySelectorAll('.subject-card').forEach(card =>
      card.addEventListener('click', () =>
        navigate('subject', st.classId, card.dataset.subject)
      )
    );
  }

  /* ══════════════════════════════════════════
     VIEW SUBJECT — danh sách bài + nút Bắt đầu Game
  ══════════════════════════════════════════ */
  function renderSubject(wrap) {
    const cm      = CLASS_META[st.classId];
    const sm      = SUBJECT_META[st.subjectId] || { label: st.subjectId, icon: '📄' };
    const lessons = DB[st.classId]?.[st.subjectId] || {};
    const ids     = Object.keys(lessons);

    if (ids.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">📭</div>
          <p>Chưa có bài luyện tập cho môn này.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="section-title">
        <span class="icon">${sm.icon}</span> ${esc(sm.label)}
        <span style="font-size:.85rem;font-weight:600;color:var(--text2)">${esc(cm.label)}</span>
      </div>
      <p class="section-sub">${ids.length} bài luyện tập. Nhấn <strong>Bắt đầu</strong> để vào game.</p>
      <div class="lesson-list" id="lesson-list"></div>`;

    const list = wrap.querySelector('#lesson-list');

    /* Đếm số bài đã hoàn thành để mở Sinh Tồn */
    let doneCount = 0;

    ids.forEach((lesId, idx) => {
      const done      = isDone(lesId);
      const pct       = getScore(lesId);
      const rank      = getRank(pct);
      const normalCnt = lessons[lesId]?.normal?.length ?? 0;
      const bossCnt   = lessons[lesId]?.boss?.length   ?? 0;
      if (done) doneCount++;

      const item = document.createElement('div');
      item.className     = 'lesson-item';
      item.dataset.lesid = lesId;

      /* Badge rank */
      const rankHtml = rank
        ? `<div class="rank-badge rank-${rank.label}" style="--rank-color:${rank.color};--rank-glow:${rank.glow}">${rank.label}</div>`
        : '';

      item.innerHTML = `
        <div class="l-num">${idx + 1}</div>
        <div class="l-info">
          <div class="l-title">${esc(getLessonTitle(lesId))}</div>
          <div class="l-meta">
            Normal: ${normalCnt} câu &nbsp;·&nbsp; Boss: ${bossCnt} câu
            ${pct !== null ? `&nbsp;·&nbsp;<span style="color:var(--text2);font-size:.76rem">Điểm: ${pct}%</span>` : ''}
          </div>
        </div>
        ${rankHtml}
        <button class="btn-start" data-lesid="${lesId}">
          ${done ? '🔄 Chơi lại' : '▶ Bắt đầu'}
        </button>`;

      item.querySelector('.btn-start').addEventListener('click', e => {
        e.stopPropagation();
        const url = `../Game/game.html`
          + `?class=${encodeURIComponent(st.classId)}`
          + `&subject=${encodeURIComponent(st.subjectId)}`
          + `&lesson=${encodeURIComponent(lesId)}`;
        window.parent.postMessage({ type: 'SH_LOAD_GAME', url }, '*');
      });

      list.appendChild(item);
    });

    /* ── CHẾ ĐỘ SINH TỒN — mở khi ≥2 bài đã hoàn thành ── */
    const survivalItem = document.createElement('div');
    if (doneCount >= 2) {
      survivalItem.className = 'lesson-item survival-item';
      survivalItem.innerHTML = `
        <div class="l-num survival-num">📝</div>
        <div class="l-info">
          <div class="l-title survival-title">📚 Chế độ Ôn tập</div>
          <div class="l-meta">Câu hỏi random từ <strong>${doneCount}</strong> bài đã học · Không giới hạn thời gian</div>
        </div>
        <button class="btn-start btn-survival">▶ Ôn tập</button>`;

      survivalItem.querySelector('.btn-survival').addEventListener('click', e => {
        e.stopPropagation();
        const doneLessons = ids.filter(id => isDone(id));
        const url = `../Game/game.html`
          + `?class=${encodeURIComponent(st.classId)}`
          + `&subject=${encodeURIComponent(st.subjectId)}`
          + `&lesson=${encodeURIComponent(doneLessons.join(','))}`
          + `&mode=survival`;
        window.parent.postMessage({ type: 'SH_LOAD_GAME', url }, '*');
      });
    } else {
      /* Còn khoá — hiển thị mờ */
      const need = 2 - doneCount;
      survivalItem.className = 'lesson-item survival-item survival-locked';
      survivalItem.innerHTML = `
        <div class="l-num survival-num">🔒</div>
        <div class="l-info">
          <div class="l-title survival-title" style="opacity:.5">📚 Chế độ Ôn tập</div>
          <div class="l-meta" style="opacity:.5">Hoàn thành thêm <strong>${need}</strong> bài để mở khoá</div>
        </div>
        <button class="btn-start" disabled style="opacity:.4;cursor:not-allowed">🔒 Khoá</button>`;
    }
    list.appendChild(survivalItem);

    /* ── Highlight + scroll đến lesson được trỏ từ Theory ── */
    if (st.pendingLessonId) {
      const target = list.querySelector(`[data-lesid="${st.pendingLessonId}"]`);
      if (target) {
        target.style.borderColor = 'var(--orange)';
        target.style.boxShadow   = '0 0 0 3px rgba(255,107,0,.25)';
        target.style.background  = 'rgba(255,107,0,.05)';
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
      st.pendingLessonId = null;
    }
  }

  /* ══════════════════════════════════════════
     VALIDATE BANNER
  ══════════════════════════════════════════ */
  function showBanner(msg) {
    banner.innerHTML = msg;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 5000);
  }

  /* ══════════════════════════════════════════
     RESTORE STATE từ URL hash
  ══════════════════════════════════════════ */
  function restoreFromHash() {
    const hash  = location.hash.replace('#', '');
    const parts = hash.split('/').filter(Boolean);
    const views = ['home', 'class', 'subject'];

    if (parts.length > 0 && views.includes(parts[0])) {
      st.view      = parts[0];
      st.classId   = parts[1] || null;
      st.subjectId = parts[2] || null;
    }
  }

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  async function init() {
    /* Dark mode sync lúc load */
    const theme = localStorage.getItem('sh-theme');
    if (theme === 'dark') { document.documentElement.classList.add('dark'); document.body.classList.add('dark'); }

    /* Lắng nghe yêu cầu đổi theme từ home.html qua postMessage */
    window.addEventListener('message', e => {
      if (!e.data || e.data.type !== 'SH_THEME') return;
      document.documentElement.classList.toggle('dark', !!e.data.dark); document.body.classList.toggle('dark', !!e.data.dark);
    });

    /* Load data — theory.json song song để lấy tên bài */
    const [ok] = await Promise.all([loadDB(), loadTheory()]);
    if (!ok) return;

    /* Xử lý URL params: ?done= (từ Game) hoặc ?lesson= (từ Theory) */
    applyURLParams();

    /* Restore hash chỉ khi không có URL params nào điều hướng */
    if (st.view === 'home') {
      restoreFromHash();
    }

    render();
  }

  init();

})();
