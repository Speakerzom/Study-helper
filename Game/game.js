/* ============================================================
   game.js — Game Học Tập, Study Helper
   Dữ liệu đầu vào: query string ?class=&subject=&lesson=
   (Truyền từ Practice → Game qua URL, không cần cleanup,
    dễ debug, hỗ trợ bookmark)

   Luồng:
   1. Đọc params → validate
   2. Fetch practice.json → lấy normal[] + boss[]
   3. Preplash video
   4. Phase NORMAL (từng câu, player tiến gặp enemy)
   5. Phase BOSS (đối mặt, timer 60s)
   6. Win / Lose
============================================================ */

(() => {
  'use strict';

  /* ════════════════════════════════════════
     0. CONSTANTS & HELPERS
  ════════════════════════════════════════ */
  const PRACTICE_JSON = '../Practice/practice.json';
  const LS_KEY        = 'sh_game_completed'; // localStorage key
  const BOSS_TIME     = 60;                   // giây mỗi câu boss
  const ATTACK_MS     = 800;                  // ms hiệu ứng attack

  /* Màu theo hệ thống */
  const C = {
    orange: '#FF6B00', lime: '#7FFF00', yellow: '#FFD700',
    cyan: '#00CED1',   teal: '#00897B', white: '#FFFFFF',
    black: '#0D0D0D',  dark: '#0A0A12', mid: '#111120'
  };

  const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ════════════════════════════════════════
     1. STATE
  ════════════════════════════════════════ */
  const G = {
    /* Input */
    classId: null, subjectId: null, lessonId: null,
    lessonTitle: '',

    /* Data */
    normalQs: [], bossQs: [],

    /* Runtime */
    phase: 'normal',       // 'normal' | 'boss'
    nIndex: 0,             // index trong normalQs
    bIndex: 0,             // index trong bossQs
    energy: 0,
    energyMax: 0,
    answered: false,

    /* Boss timer */
    bossTimerInterval: null,
    bossSecsLeft: BOSS_TIME,

    /* Stats */
    normalCorrect: 0, normalWrong: 0,
    bossCorrect: 0,   bossWrong: 0,

    /* Canvas */
    canvas: null, ctx: null,
    sprites: {},           // loaded Image objects
    animFrame: null,
  };

  /* ════════════════════════════════════════
     2. DOM REFS
  ════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const screens = {
    error   : $('screen-error'),
    preplash: $('screen-preplash'),
    game    : $('screen-game'),
    lose    : $('screen-lose'),
    win     : $('screen-win'),
  };

  /* ════════════════════════════════════════
     3. SCREEN MANAGEMENT
  ════════════════════════════════════════ */
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  /* ════════════════════════════════════════
     4. PARSE & VALIDATE PARAMS
  ════════════════════════════════════════ */
  function parseParams() {
    const p = new URLSearchParams(location.search);
    G.classId   = p.get('class')   || '';
    G.subjectId = p.get('subject') || '';
    G.lessonId  = p.get('lesson')  || '';

    const VALID_CLASSES   = ['class10','class11','class12'];
    const VALID_SUBJECTS  = ['math','physics','chemistry','biology',
                             'technology','informatics','literature',
                             'english','history','geography'];

    if (!VALID_CLASSES.includes(G.classId)) {
      return `Khối lớp không hợp lệ: "${G.classId}". Vui lòng chọn từ module Luyện tập.`;
    }
    if (!VALID_SUBJECTS.includes(G.subjectId)) {
      return `Môn học không hợp lệ: "${G.subjectId}".`;
    }
    if (!G.lessonId) {
      return 'Thiếu thông tin bài học (lesson).';
    }
    return null; // OK
  }

  /* ════════════════════════════════════════
     5. LOAD PRACTICE.JSON
  ════════════════════════════════════════ */
  async function loadData() {
    const res = await fetch(PRACTICE_JSON);
    if (!res.ok) throw new Error(`practice.json: HTTP ${res.status}`);
    const db = await res.json();

    const lessonData = db[G.classId]?.[G.subjectId]?.[G.lessonId];
    if (!lessonData) {
      throw new Error(
        `Không tìm thấy dữ liệu cho: ${G.classId} / ${G.subjectId} / ${G.lessonId}`
      );
    }

    /* Validate & lấy câu hỏi */
    const rawNormal = Array.isArray(lessonData.normal) ? lessonData.normal : [];
    const rawBoss   = Array.isArray(lessonData.boss)   ? lessonData.boss   : [];

    if (!rawNormal.length && !rawBoss.length) {
      throw new Error('Bài học này chưa có câu hỏi nào.');
    }

    /* Validate từng câu, bỏ câu thiếu answer */
    const validate = (qs, mode) => qs.filter((q, i) => {
      if (q.answer === undefined || q.answer === null) {
        console.warn(`[${mode} q${i+1}] thiếu answer → bỏ qua`);
        return false;
      }
      /* type 3: chuẩn hóa answer thành mảng lowercase */
      if (q.type === 3 && !Array.isArray(q.answer)) {
        q.answer = [String(q.answer).trim().toLowerCase()];
      }
      if (q.type === 3 && Array.isArray(q.answer)) {
        q.answer = q.answer.map(a => String(a).trim().toLowerCase());
      }
      return true;
    });

    G.normalQs  = shuffle(validate(rawNormal, 'normal'));
    G.bossQs    = shuffle(validate(rawBoss,   'boss'));
    G.energyMax = G.normalQs.length;
    G.energy    = 0;

    /* Lấy title từ theory.json nếu có, fallback lessonId */
    try {
      const tRes = await fetch('../Theory/theory.json');
      if (tRes.ok) {
        const tdb = await tRes.json();
        const les = tdb[G.classId]?.[G.subjectId]?.find(l => l.id === G.lessonId);
        if (les) G.lessonTitle = les.title;
      }
    } catch(_) {}
    if (!G.lessonTitle) G.lessonTitle = G.lessonId;
  }

  /* ════════════════════════════════════════
     6. PREPLASH
  ════════════════════════════════════════ */
  function runPreplash() {
    showScreen('preplash');
    const vid  = $('preplash-video');
    const skip = $('preplash-skip');

    $('preplash-title').textContent = G.lessonTitle;
    $('preplash-sub').textContent   =
      `${classMeta(G.classId).label} · ${subjectMeta(G.subjectId).label}`;

    const goGame = () => {
      vid.pause();
      vid.removeEventListener('ended', goGame);
      startGame();
    };

    vid.addEventListener('ended', goGame);
    skip.addEventListener('click', goGame);

    vid.load();
    vid.play().catch(() => {
      /* Autoplay blocked → bỏ qua video, vào game luôn */
      startGame();
    });
  }

  /* ════════════════════════════════════════
     7. SPRITES & CANVAS SETUP
  ════════════════════════════════════════ */
  const SPRITE_FILES = {
    playerBack  : 'assets/image/player_back.png',
    playerFront : 'assets/image/player_front.png',
    playerLeft  : 'assets/image/player_left.png',
    enemyRight  : 'assets/image/enemy_right.png',
    enemyLeft   : 'assets/image/enemy_left.png',
    bossRight   : 'assets/image/boss_right.png',
    bossLeft    : 'assets/image/boss_left.png',
    attackImg   : 'assets/image/attack.jpg',
    bg          : 'assets/image/background.jpg',
  };

  function loadSprites() {
    return Promise.all(
      Object.entries(SPRITE_FILES).map(([k, src]) =>
        new Promise(resolve => {
          const img = new Image();
          img.onload  = () => { G.sprites[k] = img; resolve(); };
          img.onerror = () => { G.sprites[k] = null; resolve(); }; // fallback OK
          img.src = src;
        })
      )
    );
  }

  function setupCanvas() {
    G.canvas = $('game-canvas');
    G.ctx    = G.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    const hh = parseInt(getComputedStyle(document.documentElement)
                          .getPropertyValue('--hud-h')) || 52;
    G.canvas.width  = window.innerWidth;
    G.canvas.height = window.innerHeight - hh;
    drawScene();
  }

  /* ════════════════════════════════════════
     8. DRAW SCENE
  ════════════════════════════════════════ */
  function drawScene() {
    const ctx = G.ctx;
    const W = G.canvas.width, H = G.canvas.height;
    ctx.clearRect(0, 0, W, H);

    /* Background */
    if (G.sprites.bg) {
      ctx.drawImage(G.sprites.bg, 0, 0, W, H);
    } else {
      /* Fallback gradient */
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0A0A1E');
      grad.addColorStop(1, '#0D1F0D');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      /* Ground line */
      ctx.fillStyle = 'rgba(127,255,0,.08)';
      ctx.fillRect(0, H * .72, W, H * .28);
    }

    /* Ground indicator line */
    ctx.strokeStyle = 'rgba(0,206,209,.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H * .73); ctx.lineTo(W, H * .73);
    ctx.stroke();

    const groundY = H * .73;
    const charH   = Math.min(H * .38, 200); // tinggi karakter
    const charW   = charH * .6;

    if (G.phase === 'normal') {
      drawNormalScene(ctx, W, H, groundY, charW, charH);
    } else {
      drawBossScene(ctx, W, H, groundY, charW, charH);
    }
  }

  /* ── NORMAL SCENE: player giữa, quay lưng ── */
  function drawNormalScene(ctx, W, H, groundY, cW, cH) {
    const px = W / 2, py = groundY - cH;

    if (G.sprites.playerBack) {
      ctx.drawImage(G.sprites.playerBack, px - cW/2, py, cW, cH);
    } else {
      drawFallbackChar(ctx, px, groundY, cW, cH, C.cyan, '🧍');
    }

    /* Nếu đang tương tác với enemy, vẽ enemy */
    if (G._enemyVisible) {
      const ex = W * .75, ey = groundY - cH;
      if (G.sprites.enemyRight) {
        ctx.drawImage(G.sprites.enemyRight, ex - cW/2, ey, cW, cH);
      } else {
        drawFallbackChar(ctx, ex, groundY, cW, cH, C.orange, '👾');
      }
    }
  }

  /* ── BOSS SCENE: boss trái – player phải, đối mặt ── */
  function drawBossScene(ctx, W, H, groundY, cW, cH) {
    const bossX   = W * .22;
    const playerX = W * .78;
    const charY   = groundY - cH;

    /* Boss – quay sang phải */
    if (G.sprites.bossRight) {
      ctx.drawImage(G.sprites.bossRight, bossX - cW*.6, charY, cW*1.2, cH*1.2);
    } else {
      drawFallbackChar(ctx, bossX, groundY, cW*1.2, cH*1.2, '#D32F2F', '👹');
    }

    /* Player – quay sang trái */
    if (G.sprites.playerLeft) {
      ctx.drawImage(G.sprites.playerLeft, playerX - cW/2, charY, cW, cH);
    } else {
      drawFallbackChar(ctx, playerX, groundY, cW, cH, C.cyan, '🧑‍💼');
    }

    /* VS text */
    ctx.font      = `bold ${Math.round(cH * .22)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = C.yellow;
    ctx.textAlign = 'center';
    ctx.fillText('⚔️ VS', W / 2, groundY - cH * .5);
  }

  /* Fallback vẽ nhân vật bằng canvas khi thiếu sprite */
  function drawFallbackChar(ctx, cx, groundY, cW, cH, color, emoji) {
    /* Body */
    ctx.fillStyle = color + '33';
    ctx.beginPath();
    ctx.roundRect(cx - cW/2, groundY - cH, cW, cH, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    /* Emoji */
    ctx.font = `${Math.round(cH * .55)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.white;
    ctx.fillText(emoji, cx, groundY - cH * .3);
  }

  /* ════════════════════════════════════════
     9. HUD UPDATE
  ════════════════════════════════════════ */
  function updateHUD() {
    /* Energy */
    const pct = G.energyMax > 0
      ? Math.max(0, G.energy / G.energyMax) * 100
      : 0;
    $('energy-bar-fill').style.width = pct + '%';
    $('energy-text').textContent = `${Math.max(0,G.energy)}/${G.energyMax}`;
    $('hud-lesson-name').textContent = G.lessonTitle;

    /* Phase badge */
    const badge = $('phase-badge');
    if (G.phase === 'normal') {
      badge.textContent = `⚡ NORMAL ${G.nIndex}/${G.normalQs.length}`;
      badge.className   = 'phase-normal';
    } else {
      badge.textContent = `🔥 BOSS ${G.bIndex}/${G.bossQs.length}`;
      badge.className   = 'phase-boss';
    }
  }

  /* ════════════════════════════════════════
     10. START GAME (vào màn chơi sau preplash)
  ════════════════════════════════════════ */
  async function startGame() {
    showScreen('game');
    setupCanvas();
    await loadSprites();
    G.phase   = 'normal';
    G.nIndex  = 0;
    G.energy  = 0;
    G._enemyVisible = false;
    updateHUD();
    drawScene();
    setNormalUI();
  }

  /* ════════════════════════════════════════
     11. NORMAL PHASE
  ════════════════════════════════════════ */
  function setNormalUI() {
    G._enemyVisible = false;
    drawScene();
    hideQuestionPanel();
    $('btn-advance').classList.remove('hidden');
    $('btn-advance').disabled = false;
    $('boss-timer').classList.add('hidden');
    updateHUD();
  }

  $('btn-advance').addEventListener('click', () => {
    if (G.phase !== 'normal') return;
    if (G.nIndex >= G.normalQs.length) {
      /* Hết normal → chuyển boss */
      activateBossPhase();
      return;
    }
    /* Hiện enemy, hiện câu hỏi */
    $('btn-advance').disabled = true;
    G._enemyVisible = true;
    drawScene();
    setTimeout(() => showQuestion(G.normalQs[G.nIndex], 'normal'), 400);
  });

  /* ════════════════════════════════════════
     12. HIỆN CÂU HỎI
  ════════════════════════════════════════ */
  function showQuestion(q, mode) {
    G.answered = false;
    const panel = $('question-panel');
    panel.classList.remove('hidden');

    /* Badge */
    const badge = $('q-badge');
    const labels = { 1: '4 lựa chọn', 2: 'Đúng / Sai', 3: 'Trả lời ngắn' };
    badge.textContent = labels[q.type] || 'Câu hỏi';
    badge.className   = mode === 'boss' ? 'boss-q' : '';

    $('q-text').textContent = q.question;
    $('q-explanation').classList.add('hidden');
    $('q-explanation').classList.remove('wrong-expl');

    const body = $('a-body');
    body.innerHTML = '';

    if      (q.type === 1) buildType1(body, q, mode);
    else if (q.type === 2) buildType2(body, q, mode);
    else if (q.type === 3) buildType3(body, q, mode);
  }

  /* ─── TYPE 1 ─── */
  function buildType1(body, q, mode) {
    const letters = ['A','B','C','D'];
    const wrap = document.createElement('div');
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt-btn';
      btn.innerHTML = `<span class="o-ltr">${letters[i]}</span>${esc(opt)}`;
      btn.addEventListener('click', () => {
        if (G.answered) return;
        handleAnswer(i === q.answer, q, mode, () => {
          body.querySelectorAll('.opt-btn').forEach((b, bi) => {
            b.disabled = true;
            if (bi === q.answer) b.classList.add('correct');
            if (bi === i && i !== q.answer) b.classList.add('wrong');
          });
        });
      });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
  }

  /* ─── TYPE 2 ─── */
  function buildType2(body, q, mode) {
    const row = document.createElement('div');
    row.className = 'tf-row';
    [['true','✅ Đúng'],['false','❌ Sai']].forEach(([val, label]) => {
      const btn = document.createElement('button');
      btn.className = 'tf-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (G.answered) return;
        const chosen = val === 'true';
        const isRight = chosen === q.answer;
        handleAnswer(isRight, q, mode, () => {
          row.querySelectorAll('.tf-btn').forEach(b => {
            b.disabled = true;
            const bVal = b.textContent.includes('Đúng');
            if (bVal === q.answer) b.classList.add('correct');
            if (bVal === chosen && !isRight) b.classList.add('wrong');
          });
        });
      });
      row.appendChild(btn);
    });
    body.appendChild(row);
  }

  /* ─── TYPE 3 ─── */
  function buildType3(body, q, mode) {
    const wrap = document.createElement('div');
    wrap.className = 'short-wrap';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'short-inp';
    inp.placeholder = 'Nhập câu trả lời…';
    inp.autocomplete = 'off';
    const btn = document.createElement('button');
    btn.className = 'btn-submit-short';
    btn.textContent = 'Xác nhận';

    const submit = () => {
      if (G.answered) return;
      const raw = inp.value.trim().toLowerCase();
      if (!raw) { inp.focus(); return; }
      const correct = Array.isArray(q.answer) ? q.answer : [String(q.answer).toLowerCase()];
      const isRight = correct.some(a => raw === a || raw.includes(a) || a.includes(raw));
      inp.disabled = true; btn.disabled = true;
      inp.style.borderColor = isRight ? C.teal : '#D32F2F';
      handleAnswer(isRight, q, mode, () => {});
    };

    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    wrap.appendChild(inp); wrap.appendChild(btn);
    body.appendChild(wrap);
    setTimeout(() => inp.focus(), 100);
  }

  /* ════════════════════════════════════════
     13. HANDLE ANSWER
  ════════════════════════════════════════ */
  function handleAnswer(isRight, q, mode, markFn) {
    if (G.answered) return;
    G.answered = true;
    markFn();

    if (mode === 'normal') {
      if (isRight) { G.energy++; G.normalCorrect++; }
      else G.normalWrong++;
    } else {
      /* boss */
      stopBossTimer();
      if (isRight) {
        G.bossCorrect++;
        triggerAttack('player');
      } else {
        G.bossWrong++;
        G.energy = Math.max(0, G.energy - 1);
        triggerAttack('boss');
      }
    }

    updateHUD();
    showExplanation(q, isRight);

    /* Nếu boss và energy = 0 → thua ngay sau flash */
    if (mode === 'boss' && G.energy <= 0) {
      setTimeout(() => endGame('lose'), ATTACK_MS + 200);
      return;
    }

    /* Nút tiếp theo */
    addNextButton(mode, q, isRight);
  }

  /* ════════════════════════════════════════
     14. EXPLANATION & NEXT BUTTON
  ════════════════════════════════════════ */
  function showExplanation(q, isRight) {
    const box = $('q-explanation');
    box.classList.remove('hidden', 'wrong-expl');
    if (!isRight) box.classList.add('wrong-expl');
    $('expl-icon').textContent = isRight ? '✅' : '❌';
    $('expl-text').textContent = q.explanation || (isRight ? 'Chính xác!' : 'Chưa đúng.');
  }

  function addNextButton(mode, q, isRight) {
    const body = $('a-body');
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-next-q';

    const isLastBoss   = mode === 'boss'   && G.bIndex >= G.bossQs.length - 1;
    const isLastNormal = mode === 'normal' && G.nIndex >= G.normalQs.length - 1;

    if (isLastBoss) {
      nextBtn.textContent = '🏁 Xem kết quả';
    } else if (isLastNormal) {
      nextBtn.textContent = '👑 Đối mặt Boss!';
    } else {
      nextBtn.textContent = 'Câu tiếp theo ➜';
    }

    nextBtn.addEventListener('click', () => {
      hideQuestionPanel();
      if (mode === 'normal') {
        /* Animate enemy rời đi */
        animateEnemyLeave(isRight, () => {
          G.nIndex++;
          if (G.nIndex >= G.normalQs.length) {
            /* Hết normal → boss */
            activateBossPhase();
          } else {
            setNormalUI();
          }
        });
      } else {
        /* boss */
        G.bIndex++;
        if (G.bIndex >= G.bossQs.length && G.energy > 0) {
          endGame('win');
        } else {
          startBossQuestion();
        }
      }
    });

    body.appendChild(nextBtn);
  }

  function hideQuestionPanel() {
    $('question-panel').classList.add('hidden');
  }

  /* ════════════════════════════════════════
     15. ENEMY LEAVE ANIMATION
  ════════════════════════════════════════ */
  function animateEnemyLeave(isRight, cb) {
    /* isRight: enemy quay mặt (right), isWrong: quay lưng
       Vì chỉ có sprite tĩnh → dùng opacity fade */
    G._enemyLeaving = true;
    G._enemyVisible = false;
    drawScene();
    setTimeout(() => {
      G._enemyLeaving = false;
      cb();
    }, 350);
  }

  /* ════════════════════════════════════════
     16. ACTIVATE BOSS PHASE
     Điều kiện: G.nIndex >= G.normalQs.length (đã trả lời hết normal)
  ════════════════════════════════════════ */
  function activateBossPhase() {
    /* Kiểm tra bắt buộc: chỉ activate khi hết câu normal */
    if (G.nIndex < G.normalQs.length) {
      console.error('[Game] Cố gắng activate boss trước khi hết normal!');
      return;
    }
    if (!G.bossQs.length) {
      /* Không có câu boss → thắng luôn nếu energy > 0 */
      endGame(G.energy > 0 ? 'win' : 'lose');
      return;
    }

    G.phase  = 'boss';
    G.bIndex = 0;
    $('btn-advance').classList.add('hidden');
    G._enemyVisible = false;
    drawScene(); /* vẽ lại với layout boss */
    updateHUD();

    /* Delay nhỏ cho UX */
    setTimeout(() => startBossQuestion(), 600);
  }

  /* ════════════════════════════════════════
     17. BOSS QUESTION
  ════════════════════════════════════════ */
  function startBossQuestion() {
    if (G.bIndex >= G.bossQs.length) {
      endGame(G.energy > 0 ? 'win' : 'lose');
      return;
    }
    const q = G.bossQs[G.bIndex];
    showQuestion(q, 'boss');
    startBossTimer(q);
  }

  /* ════════════════════════════════════════
     18. BOSS TIMER
  ════════════════════════════════════════ */
  function startBossTimer(q) {
    stopBossTimer();
    G.bossSecsLeft = BOSS_TIME;
    $('boss-timer').classList.remove('hidden');
    $('timer-num').textContent = BOSS_TIME;

    const ring = $('t-ring');
    const circumference = 163.4;
    ring.style.strokeDashoffset = '0';
    ring.className = 't-ring';

    G.bossTimerInterval = setInterval(() => {
      G.bossSecsLeft--;
      const num = $('timer-num');
      if (num) num.textContent = Math.max(0, G.bossSecsLeft);

      /* Ring progress */
      const offset = circumference * (1 - G.bossSecsLeft / BOSS_TIME);
      if (ring) ring.style.strokeDashoffset = offset;

      /* Màu cảnh báo */
      if (ring) {
        ring.className = G.bossSecsLeft <= 10
          ? 't-ring critical'
          : G.bossSecsLeft <= 20 ? 't-ring warn' : 't-ring';
      }

      if (G.bossSecsLeft <= 0) {
        stopBossTimer();
        if (!G.answered) {
          /* Hết giờ → tính là sai */
          G.answered = true;
          G.bossWrong++;
          G.energy = Math.max(0, G.energy - 1);
          updateHUD();
          triggerAttack('boss');
          showExplanation(q, false);

          if (G.energy <= 0) {
            setTimeout(() => endGame('lose'), ATTACK_MS + 200);
          } else {
            addNextButton('boss', q, false);
          }
        }
      }
    }, 1000);
  }

  function stopBossTimer() {
    if (G.bossTimerInterval) {
      clearInterval(G.bossTimerInterval);
      G.bossTimerInterval = null;
    }
    $('boss-timer').classList.add('hidden');
  }

  /* ════════════════════════════════════════
     19. ATTACK FLASH
  ════════════════════════════════════════ */
  function triggerAttack(who) {
    const el = $('attack-flash');
    el.className = '';
    el.classList.remove('hidden');
    void el.offsetWidth; /* reflow để reset animation */
    el.classList.add(who === 'player' ? 'player-atk' : 'boss-atk');
    setTimeout(() => el.classList.add('hidden'), ATTACK_MS);
  }

  /* ════════════════════════════════════════
     20. END GAME
  ════════════════════════════════════════ */
  function endGame(result) {
    stopBossTimer();
    cancelAnimationFrame(G.animFrame);

    const statsHtml = `
      <div class="stat-row"><span>Normal đúng</span><span class="stat-val">${G.normalCorrect}/${G.normalQs.length}</span></div>
      <div class="stat-row"><span>Boss đúng</span><span class="stat-val">${G.bossCorrect}/${G.bossQs.length}</span></div>
      <div class="stat-row"><span>Năng lượng cuối</span><span class="stat-val">${Math.max(0,G.energy)}/${G.energyMax}</span></div>`;

    if (result === 'lose') {
      $('lose-stats').innerHTML = statsHtml;
      showScreen('lose');
    } else {
      $('win-stats').innerHTML  = statsHtml;
      showScreen('win');
    }
  }

  /* ════════════════════════════════════════
     21. BUTTONS – RETRY / COMPLETE
  ════════════════════════════════════════ */
  $('btn-retry').addEventListener('click', () => {
    location.href = location.href.split('?')[0]
      + `?class=${G.classId}&subject=${G.subjectId}&lesson=${G.lessonId}`;
  });
  $('btn-retry-win').addEventListener('click', () => {
    $('btn-retry').click();
  });

  $('btn-complete').addEventListener('click', () => {
    markCompleted();
    const practiceURL = `../Practice/practice.html`
      + `?class=${G.classId}&subject=${G.subjectId}&done=${G.lessonId}`;
    location.href = practiceURL;
  });

  function markCompleted() {
    /* Lưu trạng thái hoàn thành vào localStorage */
    let completed = {};
    try { completed = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(_) {}
    const key = `${G.classId}__${G.subjectId}__${G.lessonId}`;
    completed[key] = { ts: Date.now(), correct: G.bossCorrect + G.normalCorrect };
    localStorage.setItem(LS_KEY, JSON.stringify(completed));
  }

  /* ════════════════════════════════════════
     22. META HELPERS
  ════════════════════════════════════════ */
  function classMeta(id) {
    return { class10:{label:'Khối 10'}, class11:{label:'Khối 11'}, class12:{label:'Khối 12'} }[id]
      || { label: id };
  }
  function subjectMeta(id) {
    return {
      math:{label:'Toán'}, physics:{label:'Vật lý'}, chemistry:{label:'Hóa học'},
      biology:{label:'Sinh học'}, technology:{label:'Công nghệ'},
      informatics:{label:'Tin học'}, literature:{label:'Văn học'},
      english:{label:'Tiếng Anh'}, history:{label:'Lịch sử'}, geography:{label:'Địa lý'}
    }[id] || { label: id };
  }

  /* ════════════════════════════════════════
     23. PRACTICE.JS INTEGRATION:
         Đọc ?done= khi quay về Practice
         (Xử lý ở practice.js: đọc param done, gọi markLessonDone)
  ════════════════════════════════════════ */

  /* ════════════════════════════════════════
     24. INIT
  ════════════════════════════════════════ */
  async function init() {
    /* Dark mode sync */
    if (localStorage.getItem('sh-theme') === 'dark')
      document.body.style.background = '#0a0a12';

    /* Validate params */
    const err = parseParams();
    if (err) {
      $('error-msg').textContent = err;
      showScreen('error');
      return;
    }

    /* Load data */
    try {
      await loadData();
    } catch(e) {
      $('error-msg').textContent = e.message;
      showScreen('error');
      return;
    }

    /* Chạy preplash → game */
    runPreplash();
  }

  init();
})();
