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
  const ATTACK_MS     = 1000;                 // ms hiệu ứng attack

  /* ════════════════════════════════════════
     AUDIO MANAGER
  ════════════════════════════════════════ */
  const AUDIO = (() => {
    let _musicVol = 40;
    let _sfxVol   = 70;

    const _sm = Number(localStorage.getItem('sh_vol_music'));
    const _ss = Number(localStorage.getItem('sh_vol_sfx'));
    if (!isNaN(_sm) && localStorage.getItem('sh_vol_music') !== null) _musicVol = _sm;
    if (!isNaN(_ss) && localStorage.getItem('sh_vol_sfx')   !== null) _sfxVol   = _ss;

    /* ── PLAYLIST: mỗi thư mục có nhiều file nhạc ──
       Tên file không cần extension — thêm vào đây khi có file mới */
    const PLAYLISTS = {
      normal : null,   /* sẽ scan tự động */
      boss   : null,
      win    : null,
      lose   : null,
    };

    /* Scan danh sách file nhạc từ home.json nếu có,
       hoặc dùng danh sách fallback */
    const TRACKS = {
      normal : [],
      boss   : [],
      win    : [],
      lose   : [],
    };

    /* ── State nhạc đang phát ── */
    let _audio       = null;   /* Audio element hiện tại */
    let _currentCat  = null;   /* 'normal' | 'boss' | 'win' | 'lose' */
    let _queue       = [];     /* Hàng chờ bài chưa phát (đã shuffle) */
    let _trackName   = '';     /* Tên bài đang phát (hiển thị HUD) */

    /* ── Helpers ── */
    function _shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    /* Lấy tên hiển thị từ đường dẫn file */
    function _displayName(path) {
      const file = path.split('/').pop();
      return file.replace(/\.[^/.]+$/, '')   /* bỏ extension */
                 .replace(/_/g, ' ');        /* _ → space, giữ nguyên - */
    }

    /* Cập nhật tên nhạc lên HUD */



    function _updateHUD(name) {
      AUDIO.currentTrack = name;
      applyMarquee(document.getElementById('music-name'), name);
      ['end-music-name', 'end-music-name-win'].forEach(id => {
        const endEl = document.getElementById(id);
        if (endEl && endEl.classList.contains('visible')) applyMarquee(endEl, name);
      });
    }

        /* Phát bài tiếp theo trong queue */
    function _playNext() {
      if (!_currentCat) return;

      /* Nếu hết queue → shuffle lại toàn bộ playlist */
      if (_queue.length === 0) {
        const list = TRACKS[_currentCat];
        if (!list || list.length === 0) return;
        _queue = _shuffle(list);
      }

      const src = _queue.shift();
      if (_audio) {
        _audio.pause();
        _audio.onended = null;
        _audio.src = '';
      }

      _audio = new Audio(src);
      _audio.volume  = _musicVol / 100;
      _audio.muted   = (_musicVol === 0);
      _audio.preload = 'auto';
      _audio.loop    = false;

      /* addEventListener once — đảm bảo luôn fire khi hết bài */
      _audio.addEventListener('ended', () => _playNext(), { once: true });

      _audio.play().catch(() => {});
      _updateHUD(_displayName(src));
    }

    const sfxSrc = {
      attack1: 'assets/sound/attack1.mp3',
      attack2: 'assets/sound/attack2.mp3',
      correct: 'assets/sound/true.mp3',
      wrong  : 'assets/sound/false.mp3',
      button : 'assets/sound/button.mp3',
    };

    return {
      init() {},

      get musicVol() { return _musicVol; },
      get sfxVol()   { return _sfxVol;   },

      /* Đăng ký danh sách file nhạc từ ngoài (home.json hoặc scan) */
      setTracks(cat, files) {
        if (TRACKS[cat]) TRACKS[cat] = files;
      },

      setMusicVol(v) {
        _musicVol = Math.max(0, Math.min(100, Math.round(v * 100)));
        if (_audio) {
          _audio.volume = _musicVol / 100;
          _audio.muted  = (_musicVol === 0);
        }
        localStorage.setItem('sh_vol_music', _musicVol);
      },

      setSfxVol(v) {
        _sfxVol = Math.max(0, Math.min(100, Math.round(v * 100)));
        localStorage.setItem('sh_vol_sfx', _sfxVol);
      },

      playSFX(name) {
        if (_sfxVol === 0) return;
        const src = sfxSrc[name];
        if (!src) return;
        try {
          const a = new Audio(src);
          a.volume = _sfxVol / 100;
          a.play().catch(() => {});
        } catch(e) {}
      },

      /* Chuyển sang category nhạc mới → shuffle + phát bài đầu */
      playMusic(cat) {
        if (_currentCat === cat && _audio && !_audio.paused) return;

        /* Dừng bài cũ */
        if (_audio) {
          _audio.pause();
          _audio.onended = null;
          _audio = null;
        }

        _currentCat = cat;
        const list  = TRACKS[cat];

        if (!list || list.length === 0) {
          /* Fallback: nếu chưa có track list → thử file mặc định */
          _updateHUD('');
          return;
        }

        _queue = _shuffle(list);
        _playNext();
      },

      stopMusic() {
        if (_audio) {
          _audio.pause();
          _audio.onended = null;
          _audio = null;
        }
        _currentCat = null;
        _queue      = [];
        _updateHUD('');
      },

      get currentTrack() { return _trackName; },
      set currentTrack(v) { _trackName = v; },
    };
  })();

  AUDIO.init();
  window.AUDIO = AUDIO; /* expose ra global để script inline game.html gọi được */

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
    mode: 'normal',
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
  /* Dùng chung cho #music-name và .end-music-name */
  function applyMarquee(el, name) {
    if (!el) return;
    el.classList.remove('scrolling');
    el.style.removeProperty('--mn-shift');
    el.style.removeProperty('--mn-dur');
    el.innerHTML = '';

    if (!name) { el.style.opacity = '0'; return; }

    const text = '\u266a ' + name;
    el.innerHTML = `<span class="mn-inner">${text}</span>`;
    el.style.opacity = '1';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const containerW = el.offsetWidth;
      el.style.overflow = 'visible';
      const inner = el.querySelector('.mn-inner');
      if (!inner) { el.style.overflow = ''; return; }
      const textW = inner.getBoundingClientRect().width;
      el.style.overflow = '';

      if (textW <= containerW + 2) return; /* vừa khung */

      const GAP   = 60;
      const shift = -(textW + GAP);
      const moveDur = Math.abs(shift) / 40;
      const total   = moveDur / 0.8;

      inner.innerHTML =
        `<span>${text}</span>` +
        `<span style="display:inline-block;width:${GAP}px"></span>` +
        `<span>${text}</span>`;

      el.style.setProperty('--mn-shift', `${shift}px`);
      el.style.setProperty('--mn-dur',   `${total.toFixed(2)}s`);
      el.classList.add('scrolling');
    }));
  }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');

    /* Ẩn tên nhạc trên HUD khi vào màn kết thúc */
    const hudMN = document.getElementById('music-name');
    if (hudMN) hudMN.style.visibility = (name === 'win' || name === 'lose') ? 'hidden' : '';

    /* Hiện tên nhạc ở góc trên phải màn win/lose với marquee */
    ['end-music-name', 'end-music-name-win'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (name === 'win' || name === 'lose') {
        /* Delay nhỏ để màn hình render xong rồi đo kích thước */
        setTimeout(() => {
          applyMarquee(el, AUDIO.currentTrack || '');
          el.classList.add('visible');
        }, 120);
      } else {
        el.classList.remove('visible');
        el.classList.remove('scrolling');
        el.innerHTML = '';
      }
    });
  }

  /* ════════════════════════════════════════
     4. PARSE & VALIDATE PARAMS
  ════════════════════════════════════════ */
  function parseParams() {
    const p = new URLSearchParams(location.search);
    G.classId   = p.get('class')   || '';
    G.subjectId = p.get('subject') || '';
    G.lessonId  = p.get('lesson')  || '';
    G.mode      = p.get('mode')    || 'normal'; /* 'normal' | 'survival' */

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

    let rawNormal = [], rawBoss = [];

    if (G.mode === 'survival') {
      /* Gộp câu hỏi từ tất cả lesson trong G.lessonId (dạng "id1,id2,id3") */
      const lessonIds = G.lessonId.split(',').map(s => s.trim()).filter(Boolean);
      for (const lid of lessonIds) {
        const ld = db[G.classId]?.[G.subjectId]?.[lid];
        if (!ld) continue;
        if (Array.isArray(ld.normal)) rawNormal.push(...ld.normal);
        if (Array.isArray(ld.boss))   rawBoss.push(...ld.boss);
      }
      if (!rawNormal.length && !rawBoss.length) {
        throw new Error('Không tìm thấy câu hỏi cho Chế độ Sinh tồn.');
      }
      G.lessonTitle = '📚 Ôn tập tổng hợp';
    } else {
      const lessonData = db[G.classId]?.[G.subjectId]?.[G.lessonId];
      if (!lessonData) {
        throw new Error(
          `Không tìm thấy dữ liệu cho: ${G.classId} / ${G.subjectId} / ${G.lessonId}`
        );
      }
      rawNormal = Array.isArray(lessonData.normal) ? lessonData.normal : [];
      rawBoss   = Array.isArray(lessonData.boss)   ? lessonData.boss   : [];
      if (!rawNormal.length && !rawBoss.length) {
        throw new Error('Bài học này chưa có câu hỏi nào.');
      }
    }

    /* Validate từng câu, bỏ câu thiếu answer */
    const validate = (qs, mode) => qs.filter((q, i) => {
      if (q.answer === undefined || q.answer === null) {
        console.warn(`[${mode} q${i+1}] thiếu answer → bỏ qua`);
        return false;
      }
      /* type 3: chuẩn hóa answer thành mảng lowercase */
      if (q.type === 3 && !Array.isArray(q.answer)) {
        q.answer = [String(q.answer).trim().toLowerCase().replace(/\s+/g,' ')];
      }
      if (q.type === 3 && Array.isArray(q.answer)) {
        q.answer = q.answer.map(a => String(a).trim().toLowerCase().replace(/\s+/g,' '));
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

    vid.muted = false;
    vid.load();
    vid.play().catch(() => {
      /* Autoplay bị block do có âm thanh → play muted trước */
      vid.muted = true;
      vid.play().catch(() => { startGame(); });
      /* Khi user click → unmute ngay */
      document.addEventListener('click', () => { vid.muted = false; }, { once: true });
    });
  }

  /* ════════════════════════════════════════
     7. SPRITES & CANVAS SETUP
  ════════════════════════════════════════ */
  const SPRITE_FILES = {
    /* Player */
    playerBack   : 'assets/image/player/face.png',         // normal: đứng quay lưng (unused)
    playerFront  : 'assets/image/player/front_side.png',   // boss: đứng quay mặt
    playerLeft   : 'assets/image/player/front_side.png',   // boss: quay sang trái
    playerFace   : 'assets/image/player/face.png',         // normal: mặt player
    playerAtk    : 'assets/image/player/attack.png',       // player tấn công

    /* Enemy / Boss */
    enemyFace    : 'assets/image/enemy/face.png',          // normal: mặt kẻ thù
    enemyFront   : 'assets/image/enemy/front_side.png',    // boss: thân enemy đứng
    bossBody     : 'assets/image/enemy/boss.png',          // boss phase: thân boss
    enemyAtk     : 'assets/image/enemy/attack.png',        // boss tấn công player

    /* Background */
    bgNormal     : 'assets/image/background/main1.jpg',   // nền màn normal
    bgBoss       : 'assets/image/background/main2.jpg',   // nền màn boss
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
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 300));
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

    /* Tính chiều cao panel câu hỏi đang hiện để dịch nhân vật lên */
    const panel  = document.getElementById('question-panel');
    const panelH = (panel && !panel.classList.contains('hidden'))
                   ? panel.getBoundingClientRect().height : 0;
    /* Vùng canvas hiển thị phía trên panel */
    const visibleH = H - panelH;

    /* Background vẽ full canvas */
    const bgSprite = G.phase === 'boss' ? G.sprites.bgBoss : G.sprites.bgNormal;
    if (bgSprite) {
      ctx.drawImage(bgSprite, 0, 0, W, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, G.phase === 'boss' ? '#1A0A0A' : '#0A0A1E');
      grad.addColorStop(1, G.phase === 'boss' ? '#2D0D0D' : '#0D1F0D');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = G.phase === 'boss' ? 'rgba(255,107,0,.06)' : 'rgba(127,255,0,.08)';
      ctx.fillRect(0, visibleH * .72, W, visibleH * .28);
    }

    /* Ground line căn theo vùng hiển thị phía trên panel */
    const groundY = visibleH * .73;
    ctx.strokeStyle = 'rgba(0,206,209,.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY); ctx.lineTo(W, groundY);
    ctx.stroke();

    /* Giới hạn nhân vật: không quá 45% vùng hiển thị, tối đa 180px trên mobile */
    const isMobile = W < 520;
    const charMax  = isMobile ? 160 : 200;
    const charH    = Math.min(visibleH * .36, charMax);
    const charW    = charH * .6;

    if (G.phase === 'normal') {
      drawNormalScene(ctx, W, visibleH, groundY, charW, charH);
    } else {
      drawBossScene(ctx, W, visibleH, groundY, charW, charH);
    }
  }

  /* ── Helper: vẽ ảnh giữ tỉ lệ thực, chân đặt đúng groundY, căn giữa cx ── */
  /* ── Helper: vẽ ảnh giữ tỉ lệ thực, chân đặt đúng groundY, căn giữa cx ── */
  function drawCharSprite(ctx, img, cx, groundY, maxW, maxH) {
    const nat   = img.naturalWidth  || img.width  || 1;
    const nah   = img.naturalHeight || img.height || 1;
    const ratio = nat / nah;
    let dh = maxH, dw = dh * ratio;
    if (dw > maxW) { dw = maxW; dh = dw / ratio; }
    const dx = cx - dw / 2;
    const dy = groundY - dh;
    ctx.drawImage(img, dx, dy, dw, dh);
    return { dx, dy, dw, dh };
  }

  /* ── Fallback: chỉ vẽ emoji, KHÔNG vẽ border frame ── */
  function drawFallbackChar(ctx, cx, groundY, cW, cH, color, emoji) {
    const fontSize = Math.round(cH * .7);
    ctx.font      = `${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(emoji, cx, groundY - cH * .1);
    ctx.textBaseline = 'alphabetic'; /* reset */
    return { dx: cx - cW/2, dy: groundY - cH, dw: cW, dh: cH };
  }

  /* ── NORMAL SCENE: player = face.jpg (giữa), enemy = face.jpg (phải) ── */
  function drawNormalScene(ctx, W, H, groundY, cW, cH) {
    const isMobile = W < 520;
    const maxH = Math.min(cH * (isMobile ? 1.6 : 2), H * (isMobile ? 0.55 : 0.7));
    const maxW = maxH * 0.8;
    const px   = W * 0.35;

    /* Player: dùng playerFace (face.jpg) */
    if (G.sprites.playerFace) {
      G._playerRect = drawCharSprite(ctx, G.sprites.playerFace, px, groundY, maxW, maxH);
    } else {
      G._playerRect = drawFallbackChar(ctx, px, groundY, maxW, maxH, C.cyan, '🧍');
    }

    if (G._enemyVisible) {
      const ex = W * 0.72;
      if (G.sprites.enemyFace) {
        G._enemyRect = drawCharSprite(ctx, G.sprites.enemyFace, ex, groundY, maxW, maxH);
      } else {
        G._enemyRect = drawFallbackChar(ctx, ex, groundY, maxW, maxH, C.orange, '👾');
      }
    }
  }

  /* ── BOSS SCENE: boss trái – player phải dùng front_side.jpg ── */
  function drawBossScene(ctx, W, H, groundY, cW, cH) {
    const bossX   = W * 0.25;
    const playerX = W * 0.75;
    const isMobile = W < 520;

    const pMaxH = Math.min(cH * (isMobile ? 1.5 : 2),   H * (isMobile ? 0.52 : 0.68));
    const pMaxW = pMaxH * 0.8;
    const bMaxH = Math.min(cH * (isMobile ? 1.9 : 2.6), H * (isMobile ? 0.60 : 0.82));
    const bMaxW = bMaxH * 0.9;

    /* Boss — ẩn khi đang hiện attack animation */
    if (!G._bossAttacking) {
      if (G.sprites.bossBody) {
        G._bossRect = drawCharSprite(ctx, G.sprites.bossBody, bossX, groundY, bMaxW, bMaxH);
      } else {
        G._bossRect = drawFallbackChar(ctx, bossX, groundY, bMaxW, bMaxH, '#D32F2F', '👹');
      }
    }

    /* Player: dùng playerFront (front_side.jpg) — ẩn khi đang attack */
    if (!G._playerAttacking) {
      if (G.sprites.playerFront) {
        G._playerRect = drawCharSprite(ctx, G.sprites.playerFront, playerX, groundY, pMaxW, pMaxH);
      } else {
        G._playerRect = drawFallbackChar(ctx, playerX, groundY, pMaxW, pMaxH, C.cyan, '🧑‍💼');
      }
    }

    ctx.font      = `bold ${Math.round(cH * .22)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = C.yellow;
    ctx.textAlign = 'center';
    ctx.fillText('⚔️ VS', W / 2, groundY - cH * .5);
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
    AUDIO.playMusic('normal');
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
    AUDIO.playSFX('button');
    if (G.nIndex >= G.normalQs.length) {
      activateBossPhase();
      return;
    }
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
    /* Redraw sau 1 frame để panel có chiều cao thực, nhân vật dịch lên đúng vị trí */
    requestAnimationFrame(() => requestAnimationFrame(drawScene));

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
      const raw = inp.value.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!raw) { inp.focus(); return; }
      /* Chuẩn hóa: lowercase, bỏ khoảng trắng thừa — chấp nhận HNO3/hno3/Hno3 */
      const correct = (Array.isArray(q.answer) ? q.answer : [q.answer])
                        .map(a => String(a).trim().toLowerCase().replace(/\s+/g, ' '));
      /* So sánh CHÍNH XÁC — không dùng includes để tránh nhận sai */
      const isRight = correct.some(a => raw === a);
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

    /* SFX trả lời */
    AUDIO.playSFX(isRight ? 'correct' : 'wrong');

    if (mode === 'normal') {
      if (isRight) { G.energy++; G.normalCorrect++; }
      else G.normalWrong++;
    } else {
      /* boss */
      stopBossTimer();
      if (isRight) {
        G.bossCorrect++;
        triggerAttack('player');
        /* Delay nhỏ để SFX correct phát trước, rồi attack */
        setTimeout(() => AUDIO.playSFX('attack1'), 150);
      } else {
        G.bossWrong++;
        G.energy = Math.max(0, G.energy - 1);
        triggerAttack('boss');
        setTimeout(() => AUDIO.playSFX('attack2'), 150);
      }
    }

    updateHUD();
    showExplanation(q, isRight);

    if (mode === 'boss' && G.energy <= 0) {
      setTimeout(() => endGame('lose'), ATTACK_MS + 200);
      return;
    }

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
      AUDIO.playSFX('button');
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
    /* Redraw để nhân vật về vị trí giữa khi không có panel */
    requestAnimationFrame(drawScene);
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
    drawScene();
    updateHUD();
    AUDIO.playMusic('boss');
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

    const timerEl = $('boss-timer');
    const numEl   = $('timer-num');
    const ringEl  = $('t-ring');

    timerEl.classList.remove('hidden');
    numEl.textContent = BOSS_TIME;

    /* Reset ring về đầy — dùng setAttribute (SVG presentation attribute)
       thay vì style để tránh bị CSS override */
    ringEl.classList.remove('warn', 'critical');
    /* Tắt transition tạm để reset không bị animate */
    ringEl.style.transition = 'none';
    ringEl.setAttribute('stroke-dashoffset', '0');
    /* Force reflow rồi bật lại transition */
    void ringEl.getBoundingClientRect();
    ringEl.style.transition = '';

    const CIRCUM = 163.4;

    G.bossTimerInterval = setInterval(() => {
      G.bossSecsLeft--;

      const num  = $('timer-num');
      const ring = $('t-ring');
      if (!num || !ring) return;

      const secsLeft = Math.max(0, G.bossSecsLeft);
      num.textContent = secsLeft;

      /* Offset tăng dần từ 0 (đầy) → CIRCUM (rỗng) */
      const offset = CIRCUM * (1 - secsLeft / BOSS_TIME);
      ring.setAttribute('stroke-dashoffset', String(offset));

      /* Đổi màu cảnh báo — chỉ thêm/xóa class, không thay className
         để tránh mất transition */
      if (secsLeft <= 10) {
        ring.classList.remove('warn');
        ring.classList.add('critical');
      } else if (secsLeft <= 20) {
        ring.classList.remove('critical');
        ring.classList.add('warn');
      } else {
        ring.classList.remove('warn', 'critical');
      }

      if (G.bossSecsLeft <= 0) {
        stopBossTimer();
        if (!G.answered) {
          G.answered = true;
          G.bossWrong++;
          G.energy = Math.max(0, G.energy - 1);
          updateHUD();
          AUDIO.playSFX('wrong');
          setTimeout(() => AUDIO.playSFX('attack2'), 150);
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
     19. ATTACK FLASH + SHAKE + HIT TEXT
  ════════════════════════════════════════ */

  /* Shake canvas khi boss bị đánh */
  function shakeScreen(intensity = 8, duration = 400) {
    const canvas = $('game-canvas');
    const start  = performance.now();
    function step(now) {
      const t = now - start;
      if (t >= duration) { canvas.style.transform = ''; return; }
      const decay = 1 - t / duration;
      const dx = (Math.random() - 0.5) * intensity * decay;
      const dy = (Math.random() - 0.5) * intensity * decay;
      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* Flash đỏ khi player mất máu */
  function flashDamage() {
    const overlay = $('damage-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    void overlay.offsetWidth;
    overlay.classList.add('active');
    setTimeout(() => overlay.classList.remove('active'), 500);
  }

  /* Text nổi "HIT!" tại vị trí boss */
  function spawnHitText(who) {
    const canvas  = $('game-canvas');
    const wrapper = canvas.parentElement || document.querySelector('#game-wrap') || document.body;
    const el = document.createElement('div');
    el.className  = 'hit-text';
    el.textContent = who === 'player' ? 'HIT!' : 'OUCH!';
    el.style.color = who === 'player' ? '#7FFF00' : '#FF4444';

    /* Vị trí: dựa theo bossRect hoặc playerRect */
    const rect  = canvas.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect?.() || { left: 0, top: 0 };
    let x, y;
    if (who === 'player' && G._bossRect) {
      x = rect.left - wRect.left + G._bossRect.dx + G._bossRect.dw / 2;
      y = rect.top  - wRect.top  + G._bossRect.dy - 20;
    } else if (who === 'boss' && G._playerRect) {
      x = rect.left - wRect.left + G._playerRect.dx + G._playerRect.dw / 2;
      y = rect.top  - wRect.top  + G._playerRect.dy - 20;
    } else {
      x = rect.width / 2; y = rect.height * 0.3;
    }
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function triggerAttack(who) {
    /* CSS flash overlay */
    const el = $('attack-flash');
    el.className = '';
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add(who === 'player' ? 'player-atk' : 'boss-atk');
    setTimeout(() => el.classList.add('hidden'), ATTACK_MS);

    /* Hiệu ứng bổ sung */
    if (who === 'player') {
      /* Boss bị đánh: shake + HIT! */
      shakeScreen(7, 380);
      setTimeout(() => spawnHitText('player'), 80);
    } else {
      /* Player mất máu: flash đỏ + OUCH! */
      flashDamage();
      setTimeout(() => spawnHitText('boss'), 80);
    }

    const atkSprite = who === 'player' ? G.sprites.playerAtk : G.sprites.enemyAtk;

    if (who === 'boss') {
      /* Ẩn boss, hiện ảnh attack tại vị trí boss trong ATTACK_MS ms */
      G._bossAttacking = true;
      drawScene(); /* vẽ lại: boss bị skip, chỉ còn player */

      /* Vẽ ảnh boss attack lên đúng vị trí boss (cùng kích thước boss) */
      if (atkSprite && G.ctx && G._bossRect) {
        const r = G._bossRect;
        const groundY = r.dy + r.dh;   /* chân nhân vật = dy + dh */
        G.ctx.save();
        G.ctx.globalAlpha = 0.95;
        drawCharSprite(G.ctx, atkSprite, r.dx + r.dw / 2, groundY, r.dw, r.dh);
        G.ctx.restore();
      }

      /* Sau ATTACK_MS: hiện boss lại */
      setTimeout(() => {
        G._bossAttacking = false;
        drawScene();
      }, ATTACK_MS);

    } else {
      /* Player attack:
         1. Ẩn player front (set flag), vẽ lại scene (player biến mất)
         2. Vẽ ảnh attack đúng vị trí + kích thước player (x2)
         3. Sau ATTACK_MS: bỏ flag, vẽ lại scene (player front hiện lại) */
      G._playerAttacking = true;
      drawScene(); /* player front bị ẩn */

      if (atkSprite && G.ctx && G._playerRect) {
        const r = G._playerRect;
        const groundY = r.dy + r.dh;   /* chân player */
        G.ctx.save();
        G.ctx.globalAlpha = 0.95;
        /* Vẽ attack đúng vị trí và kích thước player */
        drawCharSprite(G.ctx, atkSprite, r.dx + r.dw / 2, groundY, r.dw, r.dh);
        G.ctx.restore();
      }

      setTimeout(() => {
        G._playerAttacking = false;
        drawScene(); /* player front hiện lại */
      }, ATTACK_MS);
    }
  }

    /* ════════════════════════════════════════
     20. END GAME
  ════════════════════════════════════════ */
  function endGame(result) {
    stopBossTimer();
    cancelAnimationFrame(G.animFrame);

    /* Luôn lưu điểm khi thua để hiện rank C */
    if (G.mode !== 'survival' && result === 'lose') markCompleted();

    const statsHtml = `
      <div class="stat-row"><span>Normal đúng</span><span class="stat-val">${G.normalCorrect}/${G.normalQs.length}</span></div>
      <div class="stat-row"><span>Boss đúng</span><span class="stat-val">${G.bossCorrect}/${G.bossQs.length}</span></div>
      <div class="stat-row"><span>Năng lượng cuối</span><span class="stat-val">${Math.max(0,G.energy)}/${G.energyMax}</span></div>`;

    if (result === 'lose') {
      $('lose-stats').innerHTML = statsHtml;
      AUDIO.playMusic('lose');
      showScreen('lose');
    } else {
      $('win-stats').innerHTML  = statsHtml;
      AUDIO.playMusic('win');
      showScreen('win');
    }
  }

  /* ════════════════════════════════════════
     21. BUTTONS – RETRY / COMPLETE
  ════════════════════════════════════════ */
  $('btn-retry').addEventListener('click', () => {
    AUDIO.stopMusic();
    AUDIO.playSFX('button');
    location.href = location.href.split('?')[0]
      + `?class=${G.classId}&subject=${G.subjectId}&lesson=${G.lessonId}`;
  });
  $('btn-retry-win').addEventListener('click', () => {
    $('btn-retry').click();
  });

  $('btn-complete').addEventListener('click', () => {
    AUDIO.stopMusic();
    AUDIO.playSFX('button');
    markCompleted();
    const practiceURL = `../Practice/practice.html`
      + `?class=${G.classId}&subject=${G.subjectId}&done=${G.lessonId}`;
    window.parent.postMessage({ type: 'SH_NAVIGATE', page: 'practice', url: practiceURL }, '*');
  });

  function markCompleted() {
    let completed = {};
    try { completed = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(_) {}
    const key    = `${G.classId}__${G.subjectId}__${G.lessonId}`;
    const total  = G.normalQs.length + G.bossQs.length;
    const correct= G.normalCorrect + G.bossCorrect;
    const pct    = total > 0 ? Math.round(correct / total * 100) : 0;
    const prev   = completed[key]?.pct ?? -1;
    /* Luôn ghi nếu chưa có record, hoặc điểm mới tốt hơn */
    if (!completed[key] || pct > prev) {
      completed[key] = { ts: Date.now(), correct, total, pct };
      localStorage.setItem(LS_KEY, JSON.stringify(completed));
    }
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
      informatics:{label:'Tin học'}, literature:{label:'Ngữ văn'},
      english:{label:'Tiếng Anh'}, history:{label:'Lịch sử'}, geography:{label:'Địa lí'}
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
  /* ════════════════════════════════════════
     LOAD TRACK LIST từ music_list.json
     (file này do scan-music.js tự sinh — chạy: node scan-music.js)
  ════════════════════════════════════════ */
  async function loadTracks() {
    try {
      const res = await fetch('music_list.json');
      if (!res.ok) return;
      const cfg = await res.json();
      ['normal','boss','win','lose'].forEach(cat => {
        if (Array.isArray(cfg[cat]) && cfg[cat].length) {
          AUDIO.setTracks(cat, cfg[cat].map(f => `assets/music/${cat}/${f}`));
        }
      });
    } catch(_) {}
  }

  async function init() {
    const _savedTheme = localStorage.getItem('sh-theme');
    if (_savedTheme === 'light') document.body.classList.add('light');

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SH_THEME') {
        document.body.classList.toggle('light', !e.data.dark);
      }
    });

    const err = parseParams();
    if (err) {
      $('error-msg').textContent = err;
      showScreen('error');
      return;
    }

    /* Load nhạc và data song song */
    try {
      await Promise.all([loadData(), loadTracks()]);
    } catch(e) {
      $('error-msg').textContent = e.message;
      showScreen('error');
      return;
    }

    runPreplash();
  }

  init();
})();
