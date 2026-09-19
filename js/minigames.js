/* ============================================================
 * 独立小游戏：全屏网页层 + JFES110 打地鼠初版
 * 对外接口：window.FGEXPIG_MINIGAMES.has(id) / open(id)
 * ============================================================ */
(function () {
  'use strict';

  var GAMES = {
    JFES110: {
      id: 'JFES110',
      title: '打地鼠',
      duration: 30,
      background: 'resources/JFES110/game/bg.png',
      cursor: 'resources/JFES110/game/chuizi.png',
      hitEffect: 'resources/JFES110/game/jizhong.png',
      characters: [
        { name: '哈奇', src: 'resources/JFES110/game/哈奇.png' },
        { name: '吉伊', src: 'resources/JFES110/game/吉伊.png' },
        { name: '栗子馒头', src: 'resources/JFES110/game/栗子馒头.png' },
        { name: '莫莫咖', src: 'resources/JFES110/game/莫莫咖.png' },
        { name: '乌萨奇', src: 'resources/JFES110/game/乌萨奇.png' }
      ]
    }
  };

  var DIFFICULTY = [
    { visibleMin: 1000, visibleMax: 1250, gapMin: 320, gapMax: 480 },
    { visibleMin: 900, visibleMax: 1120, gapMin: 260, gapMax: 400 },
    { visibleMin: 800, visibleMax: 1000, gapMin: 210, gapMax: 330 },
    { visibleMin: 700, visibleMax: 880, gapMin: 170, gapMax: 270 },
    { visibleMin: 570, visibleMax: 720, gapMin: 120, gapMax: 200 },
    { visibleMin: 430, visibleMax: 560, gapMin: 80, gapMax: 140 }
  ];

  var overlay = null;
  var refs = {};
  var keyBuffer = '';
  var state = {
    game: null,
    playing: false,
    score: 0,
    remainingMs: 30000,
    lastTimeAt: 0,
    timeScale: 1,
    cheatActive: false,
    pointerX: null,
    pointerY: null,
    activeTarget: null,
    lastTargetX: 50,
    lastTargetY: 50,
    countdownTimer: 0,
    spawnTimer: 0,
    hideTimer: 0,
    hammerTimer: 0,
    closeTimer: 0,
    previousFocus: null,
    scrollX: 0,
    scrollY: 0
  };

  function gameConfig(id) {
    return Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : null;
  }

  function has(id) {
    return !!gameConfig(String(id || ''));
  }

  function currentImageQuality() {
    var level = Math.round(Number(document.documentElement.dataset.imageQuality || 1));
    if (!isFinite(level)) level = 1;
    return Math.max(1, Math.min(5, level));
  }

  function responsiveGameUrl(path) {
    var original = String(path || '');
    var parts = original.split('/');
    var file = parts.pop() || '';
    var dot = file.lastIndexOf('.');
    var base = dot > 0 ? file.slice(0, dot) : file;
    if (parts.length && /^[1-5]$/.test(parts[parts.length - 1])) {
      parts[parts.length - 1] = String(currentImageQuality());
    } else {
      parts.push(String(currentImageQuality()));
    }
    parts.push(base + '.webp');
    return encodeURI(parts.join('/'));
  }

  function bindGameImage(image, path) {
    if (!image) return;
    image.dataset.gameOriginal = String(path || '');
    image.onerror = null;
    image.src = responsiveGameUrl(path);
  }

  function clearGameTimers() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    if (state.spawnTimer) clearTimeout(state.spawnTimer);
    if (state.hideTimer) clearTimeout(state.hideTimer);
    if (state.hammerTimer) clearTimeout(state.hammerTimer);
    state.countdownTimer = state.spawnTimer = state.hideTimer = state.hammerTimer = 0;
  }

  function emitLifecycle(name, id) {
    document.dispatchEvent(new CustomEvent(name, { detail: { id: id } }));
  }

  function updateHud() {
    if (refs.score) refs.score.textContent = String(state.score);
    if (!refs.time) return;
    var remain = state.playing ? Math.max(0, Math.ceil(state.remainingMs / 1000)) : (state.game ? state.game.duration : 30);
    refs.time.textContent = String(remain);
  }

  function advanceClock(now) {
    if (!state.playing) return;
    if (!state.lastTimeAt) state.lastTimeAt = now;
    var delta = Math.max(0, now - state.lastTimeAt);
    state.lastTimeAt = now;
    state.remainingMs = Math.max(0, state.remainingMs - delta * state.timeScale);
  }

  function scaledDelay(ms) {
    return Math.max(16, ms / state.timeScale);
  }

  function setCheat(enabled) {
    enabled = !!enabled;
    if (state.playing) advanceClock(performance.now());
    state.cheatActive = enabled;
    state.timeScale = enabled ? 0.2 : 1;
    refs.shell.classList.toggle('is-cheat', enabled);
    if (state.pointerX == null || state.pointerY == null) {
      state.pointerX = window.innerWidth / 2;
      state.pointerY = window.innerHeight * 0.68;
    }
    positionHammer(state.pointerX, state.pointerY);
  }

  function setRestartMode(enabled) {
    refs.timeCard.disabled = !enabled;
    if (enabled) refs.time.textContent = String(state.game ? state.game.duration : 30);
    refs.timeCard.setAttribute('aria-label', enabled ? '再来一局' : '倒计时');
  }

  function hideHammer() {
    if (refs.hammer) refs.hammer.classList.remove('is-visible', 'is-swinging');
    if (refs.hammerGrid) refs.hammerGrid.classList.remove('is-visible', 'is-swinging');
  }

  function positionHammer(clientX, clientY) {
    if (!refs.hammer) return;
    refs.hammer.style.left = clientX + 'px';
    refs.hammer.style.top = clientY + 'px';
    if (refs.hammerGrid) {
      refs.hammerGrid.style.left = clientX + 'px';
      refs.hammerGrid.style.top = clientY + 'px';
    }
    state.pointerX = clientX;
    state.pointerY = clientY;
    refs.hammer.classList.add('is-visible');
    if (refs.hammerGrid) refs.hammerGrid.classList.add('is-visible');
  }

  function swingHammer() {
    if (!state.playing || !refs.hammer) return;
    refs.hammer.classList.remove('is-swinging');
    void refs.hammer.offsetWidth;
    refs.hammer.classList.add('is-swinging');
    if (refs.hammerGrid) refs.hammerGrid.classList.add('is-swinging');
    if (state.hammerTimer) clearTimeout(state.hammerTimer);
    state.hammerTimer = setTimeout(function () {
      state.hammerTimer = 0;
      if (refs.hammer) refs.hammer.classList.remove('is-swinging');
      if (refs.hammerGrid) refs.hammerGrid.classList.remove('is-swinging');
    }, 260);
  }

  function clearHitEffects() {
    if (!refs.board) return;
    var effects = refs.board.querySelectorAll('.minigame-hit-effect');
    for (var i = 0; i < effects.length; i++) effects[i].remove();
  }

  function spawnHitEffect() {
    if (!state.game || !state.game.hitEffect || !refs.target) return;
    var effect = document.createElement('span');
    effect.className = 'minigame-hit-effect';
    effect.style.left = refs.target.style.getPropertyValue('--target-x') || '50%';
    effect.style.top = refs.target.style.getPropertyValue('--target-y') || '50%';
    var image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    bindGameImage(image, state.game.hitEffect);
    effect.appendChild(image);
    refs.board.appendChild(effect);
    setTimeout(function () {
      if (effect.parentNode) effect.remove();
    }, 1000);
  }

  function hideActiveTarget() {
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = 0;
    if (state.activeTarget) {
      state.activeTarget.classList.remove('is-up');
      state.activeTarget.disabled = true;
      state.activeTarget.setAttribute('aria-label', '等待角色出现');
      state.activeTarget = null;
    }
  }

  function currentDifficultyLevel() {
    if (!state.game || !state.playing) return 1;
    var elapsed = state.game.duration - (state.remainingMs / 1000);
    return Math.min(6, Math.max(1, Math.floor(elapsed / 5) + 1));
  }

  function difficultyConfig() {
    return DIFFICULTY[currentDifficultyLevel() - 1];
  }

  function scheduleNextTarget(initialDelay) {
    if (!state.playing) return;
    if (state.spawnTimer) clearTimeout(state.spawnTimer);
    var config = difficultyConfig();
    var delay = initialDelay != null ? initialDelay : config.gapMin + Math.random() * (config.gapMax - config.gapMin);
    state.spawnTimer = setTimeout(spawnTarget, scaledDelay(delay));
  }

  function randomTargetPosition() {
    var boardRect = refs.board.getBoundingClientRect();
    var targetRect = refs.target.getBoundingClientRect();
    var marginX = Math.min(46, ((targetRect.width / 2) + 5) / Math.max(1, boardRect.width) * 100);
    var marginY = Math.min(46, ((targetRect.height / 2) + 5) / Math.max(1, boardRect.height) * 100);
    var x = marginX + Math.random() * Math.max(0, 100 - marginX * 2);
    var y = marginY + Math.random() * Math.max(0, 100 - marginY * 2);
    for (var i = 0; i < 5; i++) {
      var dx = x - state.lastTargetX;
      var dy = y - state.lastTargetY;
      if (Math.sqrt(dx * dx + dy * dy) >= 18) break;
      x = marginX + Math.random() * Math.max(0, 100 - marginX * 2);
      y = marginY + Math.random() * Math.max(0, 100 - marginY * 2);
    }
    state.lastTargetX = x;
    state.lastTargetY = y;
    refs.target.style.setProperty('--target-x', x.toFixed(3) + '%');
    refs.target.style.setProperty('--target-y', y.toFixed(3) + '%');
  }

  function spawnTarget() {
    state.spawnTimer = 0;
    if (!state.playing || !state.game || !state.game.characters.length) return;
    hideActiveTarget();
    var character = state.game.characters[Math.floor(Math.random() * state.game.characters.length)];
    var config = difficultyConfig();
    refs.shell.setAttribute('data-level', String(currentDifficultyLevel()));
    bindGameImage(refs.targetImage, character.src);
    randomTargetPosition();
    refs.target.setAttribute('aria-label', character.name + '出现了');
    refs.target.disabled = false;
    refs.target.classList.add('is-up');
    state.activeTarget = refs.target;
    state.hideTimer = setTimeout(function () {
      state.hideTimer = 0;
      hideActiveTarget();
      scheduleNextTarget();
    }, scaledDelay(config.visibleMin + Math.random() * (config.visibleMax - config.visibleMin)));
  }

  function hitTarget(target) {
    if (!state.playing || target !== state.activeTarget) return;
    state.score += 1;
    updateHud();
    spawnHitEffect();
    hideActiveTarget();
    scheduleNextTarget();
  }

  function rectsOverlap(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function hammerHitsTarget() {
    if (!state.activeTarget) return false;
    var targetRect = state.activeTarget.getBoundingClientRect();
    if (!state.cheatActive) return rectsOverlap(refs.hammer.getBoundingClientRect(), targetRect);
    var hammers = refs.hammerGrid.querySelectorAll('img');
    for (var i = 0; i < hammers.length; i++) {
      if (rectsOverlap(hammers[i].getBoundingClientRect(), targetRect)) return true;
    }
    return false;
  }
  function showIntro() {
    setRestartMode(false);
    refs.result.hidden = true;
    refs.board.hidden = true;
    clearHitEffects();
    refs.shell.classList.remove('is-playing');
    hideHammer();
  }

  function endGame() {
    if (!state.playing) return;
    state.playing = false;
    setCheat(false);
    clearGameTimers();
    hideActiveTarget();
    clearHitEffects();
    hideHammer();
    refs.board.hidden = true;
    refs.resultScore.textContent = state.score + '分';
    refs.result.hidden = false;
    setRestartMode(true);
    refs.shell.classList.remove('is-playing');
  }

  function updateCountdown() {
    if (!state.playing) return;
    advanceClock(performance.now());
    refs.time.textContent = String(Math.ceil(state.remainingMs / 1000));
    if (state.remainingMs <= 0) endGame();
  }

  function startGame(startX, startY) {
    if (!state.game) return;
    clearGameTimers();
    hideActiveTarget();
    clearHitEffects();
    state.score = 0;
    state.lastTargetX = 50;
    state.lastTargetY = 50;
    state.playing = true;
    setRestartMode(false);
    state.remainingMs = state.game.duration * 1000;
    state.lastTimeAt = performance.now();
    state.timeScale = 1;
    state.cheatActive = false;
    refs.shell.classList.remove('is-cheat');
    refs.result.hidden = true;
    refs.board.hidden = false;
    refs.shell.classList.add('is-playing');
    refs.shell.setAttribute('data-level', '1');
    positionHammer(startX != null ? startX : window.innerWidth / 2, startY != null ? startY : window.innerHeight * 0.68);
    updateHud();
    state.countdownTimer = setInterval(updateCountdown, 100);
    scheduleNextTarget(180);
  }

  function resetView() {
    state.playing = false;
    setCheat(false);
    clearGameTimers();
    hideActiveTarget();
    clearHitEffects();
    state.score = 0;
    state.lastTargetX = 50;
    state.lastTargetY = 50;
    updateHud();
    showIntro();
  }
  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'minigame-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.tabIndex = -1;
    overlay.innerHTML =
      '<img class="minigame-overlay-bg" id="minigameMap" alt="" draggable="false">' +
      '<div class="minigame-shell" role="dialog" aria-modal="true" aria-label="打地鼠小游戏">' +
        '<button class="minigame-exit" id="minigameExit" type="button" aria-label="退出游戏">X</button>' +
        '<div class="minigame-hud" id="minigameHud">' +
          '<button class="minigame-hud-card minigame-time-card" id="minigameTimeCard" type="button" aria-label="倒计时" disabled>' +
            '<strong id="minigameTime">30</strong>' +
          '</button>' +
          '<div class="minigame-hud-card"><strong id="minigameScore">0</strong></div>' +
        '</div>' +
        '<div class="minigame-result" id="minigameResult" hidden>' +
          '<div class="minigame-result-line">恭喜你获得</div>' +
          '<div class="minigame-result-score" id="minigameResultScore"></div>' +
        '</div>' +
        '<section class="minigame-board" id="minigameBoard" aria-label="打地鼠游戏区域" hidden>' +
          '<button class="minigame-target" id="minigameTarget" type="button" aria-label="等待角色出现" disabled>' +
            '<img id="minigameTargetImage" alt="" draggable="false">' +
          '</button>' +
        '</section>' +
        '<span class="minigame-hammer" id="minigameHammer" aria-hidden="true"><img id="minigameHammerImage" alt=""></span>' +
        '<span class="minigame-hammer-grid" id="minigameHammerGrid" aria-hidden="true"></span>' +
      '</div>';
    document.body.appendChild(overlay);

    refs.shell = overlay.querySelector('.minigame-shell');
    refs.time = document.getElementById('minigameTime');
    refs.timeCard = document.getElementById('minigameTimeCard');
    refs.score = document.getElementById('minigameScore');
    refs.hud = document.getElementById('minigameHud');
    refs.result = document.getElementById('minigameResult');
    refs.resultScore = document.getElementById('minigameResultScore');
    refs.board = document.getElementById('minigameBoard');
    refs.mapImage = document.getElementById('minigameMap');
    refs.target = document.getElementById('minigameTarget');
    refs.targetImage = document.getElementById('minigameTargetImage');
    refs.hammer = document.getElementById('minigameHammer');
    refs.hammerImage = document.getElementById('minigameHammerImage');
    refs.hammerGrid = document.getElementById('minigameHammerGrid');
    for (var hi = 0; hi < 25; hi++) {
      var hammerImage = document.createElement('img');
      hammerImage.alt = '';
      hammerImage.draggable = false;
      refs.hammerGrid.appendChild(hammerImage);
    }

    document.getElementById('minigameExit').addEventListener('click', close);
    refs.board.addEventListener('pointerdown', function (event) {
      if (!state.playing) return;
      positionHammer(event.clientX, event.clientY);
      swingHammer();
      if (hammerHitsTarget()) hitTarget(refs.target);
    });
    refs.board.addEventListener('pointermove', function (event) {
      if (state.playing) positionHammer(event.clientX, event.clientY);
    });
    refs.board.addEventListener('pointerleave', function () {
      if (state.playing) hideHammer();
    });
    refs.timeCard.addEventListener('click', function (event) {
      if (state.playing || refs.result.hidden) return;
      event.stopPropagation();
      var rect = refs.timeCard.getBoundingClientRect();
      startGame(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    overlay.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('#minigameExit')) return;
      if (!state.playing && refs.result.hidden) startGame(event.clientX, event.clientY);
    });
  }

  function ensureOverlay() {
    if (!overlay) buildOverlay();
  }

  function open(id) {
    var config = gameConfig(String(id || ''));
    if (!config) return;
    ensureOverlay();
    if (state.closeTimer) clearTimeout(state.closeTimer);
    state.closeTimer = 0;
    state.game = config;
    state.previousFocus = document.activeElement;
    state.scrollX = window.scrollX || 0;
    state.scrollY = window.scrollY || 0;
    bindGameImage(refs.mapImage, config.background);
    refs.hammerImage.src = responsiveGameUrl(config.cursor);
    var gridImages = refs.hammerGrid.querySelectorAll('img');
    for (var gi = 0; gi < gridImages.length; gi++) gridImages[gi].src = responsiveGameUrl(config.cursor);
    resetView();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('minigame-open');
    emitLifecycle('fgexpig:minigame-open', config.id);
    overlay.focus();
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    state.playing = false;
    setCheat(false);
    clearGameTimers();
    hideActiveTarget();
    clearHitEffects();
    hideHammer();
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('minigame-open');
    emitLifecycle('fgexpig:minigame-close', state.game ? state.game.id : '');
    if (state.previousFocus && state.previousFocus.focus) {
      try { state.previousFocus.focus(); } catch (err) {}
    }
    try { window.scrollTo(state.scrollX, state.scrollY); } catch (err) {}
    state.closeTimer = setTimeout(function () {
      state.closeTimer = 0;
      if (overlay) overlay.hidden = true;
    }, 180);
  }

  document.addEventListener('keydown', function (event) {
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!state.playing || event.ctrlKey || event.metaKey || event.altKey) {
      keyBuffer = '';
      return;
    }
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
    keyBuffer = (keyBuffer + event.key.toLowerCase()).slice(-4);
    event.preventDefault();
    if (keyBuffer === 'king') {
      keyBuffer = '';
      setCheat(!state.cheatActive);
    }
  });

  window.FGEXPIG_MINIGAMES = { has: has, open: open };
})();
