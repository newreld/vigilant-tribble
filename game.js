/* MEGA TAP DELUXE™ — an honest dopamine generator.
 * A persiflage of hyper-casual games: all the cheesy juice, none of the
 * dark patterns. Every reward is deterministic and earned by play. There is
 * no gambling (no variable-ratio rewards), no monetization, no real timers.
 * See DESIGN.md for the psychology this is built on. */

(() => {
  'use strict';

  // ---- game state ----------------------------------------------------------
  const state = {
    coins: 0,
    tapPower: 1,
    comboMult: 1,
    combo: 0,           // consecutive in-window taps
    lastTap: -Infinity, // so the very first tap never counts as a combo
    tapCount: 0,        // for the deterministic "golden every Nth" tap
    frenzy: 0,          // 0..1 meter
    frenzyActive: false,
    frenzyUntil: 0,
    muted: false,
    nextMilestone: 0,   // index into MILESTONES
    lastSeen: 0,        // epoch ms, for offline idle earnings
    stardust: 0,        // prestige currency -> permanent global multiplier
    prestiges: 0,       // how many times you've ascended
    totalEarned: 0,     // lifetime coins earned (never reset)
    runEarned: 0,       // coins earned this run (reset on prestige)
    lastDaily: 0,       // epoch ms of last daily bonus claim
  };

  // legible progress goals -> extra dopamine moments (lever 4 + 6)
  const MILESTONES = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e12, 1e15];
  const SAVE_KEY = 'megatap.save.v1';
  const STATS_KEY = 'megatap.stats.v1';
  const OFFLINE_CAP_SEC = 2 * 3600; // generous but bounded: up to 2h of idle income
  const PRESTIGE_MIN = 1e6;         // can't ascend before earning this (this run)
  const STARDUST_PCT = 0.03;        // each stardust = +3% to all coin gains
  const DAILY_COOLDOWN = 20 * 3600 * 1000; // honest daily bonus, no streak guilt

  // permanent multiplier from prestige (honest, deterministic)
  const globalMult = () => 1 + state.stardust * STARDUST_PCT;
  // stardust you'd get for ascending right now
  const stardustFor = run => Math.floor(10 * Math.sqrt(Math.max(0, run) / PRESTIGE_MIN));

  const COMBO_WINDOW = 1100;   // ms to keep a combo alive
  const COMBO_STEP = 0.12;     // combo multiplier growth per chained tap
  const GOLDEN_EVERY = 12;     // every Nth tap is a guaranteed GOLDEN x10 (not random!)
  const FRENZY_GAIN = 0.045;   // meter fill per tap
  const FRENZY_DURATION = 7000;

  // upgrades: real ones make numbers/juice bigger; joke ones parody dark patterns
  const upgrades = [
    { id: 'power', icon: '💪', name: 'Tap Power', desc: '+1 coin per tap',
      base: 25, level: 0, max: 999,
      cost: u => Math.floor(u.base * Math.pow(1.18, u.level)),
      apply: () => { state.tapPower += 1; } },

    { id: 'combo', icon: '🔥', name: 'Combo Master', desc: 'combos build faster & last longer',
      base: 150, level: 0, max: 20,
      cost: u => Math.floor(u.base * Math.pow(1.55, u.level)),
      apply: () => {} },

    { id: 'auto', icon: '🤖', name: 'Auto-Tapper', desc: '+2 coins/sec, idle income (parody of idle games)',
      base: 400, level: 0, max: 99,
      cost: u => Math.floor(u.base * Math.pow(1.35, u.level)),
      apply: () => {} },

    // ---- the parody / joke items: all FREE, all a wink at the genre ----
    { id: 'noads', icon: '🚫', name: 'Remove Ads — $0.00', desc: 'there were never any ads. enjoy!',
      base: 0, level: 0, max: 1, free: true,
      cost: () => 0,
      apply: () => toast('Ads removed! (there were 0 ads) 🎉') },

    { id: 'lootbox', icon: '🎁', name: 'Legendary Loot Box', desc: 'GUARANTEED legendary. rigged in your favor.',
      base: 0, level: 0, max: 999, free: true,
      cost: () => 0,
      apply: () => { const b = 500 + state.tapPower * 200; addCoins(b, true); toast('LEGENDARY! +' + fmt(b) + ' coins (you always win) 😎'); } },

    { id: 'skip', icon: '⏩', name: 'Skip Timer (Premium)', desc: 'instantly skip the... nothing. free & instant.',
      base: 0, level: 0, max: 1, free: true,
      cost: () => 0,
      apply: () => toast('Timer skipped instantly! Premium feels good, huh? ⚡') },

    // ---- parody items that UNLOCK as you ascend (renewable humor) ----
    { id: 'battlepass', icon: '🎟️', name: 'Battle Pass (Season ∞)', desc: 'all 999 tiers, unlocked free. no grind, no $.',
      base: 0, level: 0, max: 999, free: true, unlockAt: 1,
      cost: () => 0,
      apply: () => { const b = Math.ceil((1000 + state.tapPower * 300) * globalMult()); addCoins(b, true); toast('🎟️ All 999 tiers claimed! +' + fmt(b) + ' (no FOMO here)'); } },

    { id: 'vip', icon: '👑', name: 'VIP Status', desc: 'congrats! everyone is VIP. perks for all, forever.',
      base: 0, level: 0, max: 1, free: true, unlockAt: 2,
      cost: () => 0,
      apply: () => toast('👑 You are now VIP! So is everyone else. Equality! ') },

    { id: 'whale', icon: '🐋', name: 'Whale Package — $999.99', desc: 'price is fake. it is free. whales deserve a break too.',
      base: 0, level: 0, max: 999, free: true, unlockAt: 3,
      cost: () => 0,
      apply: () => { const b = Math.ceil((5000 + state.coins * 0.25) * globalMult()); addCoins(b, true); toast('🐋 SPLASH! +' + fmt(b) + ' coins. You paid $0.00. 💙'); } },
  ];

  // ---- DOM refs ------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const el = {
    shake: $('shake'), coins: $('coins'), tap: $('tap'),
    comboValue: $('combo-value'), comboFill: $('combo-fill'),
    frenzyFill: $('frenzy-fill'), shopList: $('shop-list'),
    shop: $('shop'), play: $('play'), floaters: $('floaters'),
    jackpot: $('jackpot'), reels: document.querySelectorAll('.reel'),
    offer: $('offer'), muteBtn: $('muteBtn'), toast: $('toast'),
    stardust: $('stardust'), ascend: $('ascend'),
  };

  // ---- audio (procedural; no asset files needed) ---------------------------
  let actx = null;
  function audio() {
    if (state.muted) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    return actx;
  }
  function blip(freq, dur = 0.08, type = 'square', gain = 0.15) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }

  // ---- number formatting (K / M / B / T ...) -------------------------------
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  function fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return '' + n;
    let i = 0;
    while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + SUFFIX[i];
  }

  // ---- canvas particles ----------------------------------------------------
  const canvas = $('fx'), ctx = canvas.getContext('2d');
  let parts = [];
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize); resize();

  function burst(x, y, n, hue) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 6;
      parts.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
        life: 1, size: 3 + Math.random() * 5,
        hue: hue == null ? (Math.random() * 60 + 300) : hue,
      });
    }
    if (parts.length > 600) parts = parts.slice(-600); // cap for perf
  }

  function tickParts() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= 0.025;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = `hsl(${p.hue}, 95%, 60%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tickParts);
  }
  requestAnimationFrame(tickParts);

  // ---- screenshake ---------------------------------------------------------
  let shakeAmt = 0;
  function addShake(a) { shakeAmt = Math.min(shakeAmt + a, 22); }
  (function shakeLoop() {
    if (shakeAmt > 0.2) {
      const dx = (Math.random() - 0.5) * shakeAmt, dy = (Math.random() - 0.5) * shakeAmt;
      el.shake.style.transform = `translate(${dx}px, ${dy}px)`;
      shakeAmt *= 0.85;
    } else { el.shake.style.transform = ''; shakeAmt = 0; }
    requestAnimationFrame(shakeLoop);
  })();

  // ---- floating text -------------------------------------------------------
  function floatText(x, y, text, color) {
    const f = document.createElement('div');
    f.className = 'floater'; f.textContent = text;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    if (color) f.style.color = color;
    el.floaters.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  let toastT = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden', 'toast-show');
    void el.toast.offsetWidth;            // restart animation
    el.toast.classList.add('toast-show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.add('hidden'), 2400);
  }

  // ---- core: earning -------------------------------------------------------
  function addCoins(amt, silent) {
    state.coins += amt;
    state.totalEarned += amt;
    state.runEarned += amt;
    el.coins.textContent = fmt(state.coins);
    el.coins.classList.remove('bump'); void el.coins.offsetWidth; el.coins.classList.add('bump');
    checkMilestone();
    if (!silent) renderShopAffordability();
  }

  function checkMilestone() {
    while (state.nextMilestone < MILESTONES.length &&
           state.coins >= MILESTONES[state.nextMilestone]) {
      const m = MILESTONES[state.nextMilestone];
      state.nextMilestone++;
      toast('🏆 MILESTONE: ' + fmt(m) + ' coins! You magnificent tapper!');
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.18), i * 90));
      for (let i = 0; i < 4; i++)
        setTimeout(() => burst(innerWidth * Math.random(), innerHeight * 0.4 * Math.random() + 120, 35, 130), i * 70);
      addShake(16);
    }
  }

  function comboBonus() {
    // Combo Master upgrade makes each chained tap worth more.
    const lvl = upgrades.find(u => u.id === 'combo').level;
    return COMBO_STEP * (1 + lvl * 0.25);
  }
  function comboWindow() {
    const lvl = upgrades.find(u => u.id === 'combo').level;
    return COMBO_WINDOW + lvl * 120;
  }

  function doTap(clientX, clientY) {
    const now = performance.now();

    // combo logic (skill/flow lever, fully deterministic)
    if (now - state.lastTap < comboWindow()) state.combo++;
    else state.combo = 0;
    state.lastTap = now;
    state.comboMult = 1 + state.combo * comboBonus();

    state.tapCount++;
    const golden = state.tapCount % GOLDEN_EVERY === 0;     // guaranteed, not random
    const frenzyMult = state.frenzyActive ? 5 : 1;
    const goldenMult = golden ? 10 : 1;

    const gain = Math.ceil(state.tapPower * state.comboMult * goldenMult * frenzyMult * globalMult());
    addCoins(gain);
    stats.taps++;

    // feedback / juice scaled to combo (lever 1: game feel)
    const intensity = Math.min(state.combo, 30);
    addShake(4 + intensity * 0.5 + (golden ? 8 : 0) + (state.frenzyActive ? 4 : 0));
    burst(clientX, clientY, 8 + intensity + (golden ? 30 : 0), golden ? 50 : null);
    floatText(clientX, clientY - 20, '+' + fmt(gain), golden ? '#fff' : (state.frenzyActive ? '#21e6c1' : null));

    el.tap.classList.remove('pop'); void el.tap.offsetWidth; el.tap.classList.add('pop');
    el.comboValue.textContent = 'x' + state.comboMult.toFixed(1);
    el.comboValue.style.transform = `scale(${1 + Math.min(state.combo, 20) * 0.03})`;
    el.comboValue.style.color = golden ? '#ffd23f' : '#6bff6b';

    // rising pitch with combo (lever 2: anticipation builds audibly)
    const pitch = 220 + Math.min(state.combo, 40) * 18 + (golden ? 400 : 0);
    blip(pitch, golden ? 0.18 : 0.06, golden ? 'sawtooth' : 'square', golden ? 0.22 : 0.13);
    if (golden) { floatText(clientX, clientY - 56, '✨GOLDEN✨', '#ffd23f'); }

    // frenzy meter (deterministic build toward a guaranteed payoff)
    if (!state.frenzyActive) {
      state.frenzy = Math.min(1, state.frenzy + FRENZY_GAIN);
      el.frenzyFill.style.width = (state.frenzy * 100) + '%';
      if (state.frenzy >= 1) triggerJackpot();
    }
  }

  // ---- the rigged-in-your-favor jackpot (parody of loot boxes) -------------
  function triggerJackpot() {
    state.frenzy = 0;
    el.frenzyFill.style.width = '0%';
    el.jackpot.classList.remove('hidden');
    el.reels.forEach(r => r.classList.add('spin'));
    blip(660, 0.1, 'sawtooth', 0.2);

    // reels spin briefly then ALWAYS land on 7-7-7 (no gambling, guaranteed win)
    let spins = 0;
    const spinT = setInterval(() => {
      el.reels.forEach(r => { r.textContent = '' + (1 + Math.floor(Math.random() * 9)); });
      blip(400 + Math.random() * 200, 0.04, 'square', 0.1);
      if (++spins > 12) {
        clearInterval(spinT);
        el.reels.forEach(r => { r.classList.remove('spin'); r.textContent = '7'; });
        winJackpot();
      }
    }, 90);
  }

  function winJackpot() {
    // celebratory ascending arpeggio
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.2), i * 110));
    stats.jackpots++;
    const reward = Math.ceil(((100 + state.coins * 0.15) + state.tapPower * 50) * globalMult());
    setTimeout(() => {
      addCoins(reward);
      for (let i = 0; i < 6; i++)
        setTimeout(() => burst(innerWidth * Math.random(), innerHeight * 0.5 * Math.random() + 100, 40), i * 60);
      addShake(20);
      floatText(innerWidth / 2 - 40, innerHeight / 2, '+' + fmt(reward), '#fff');
      startFrenzy();
    }, 500);
    setTimeout(() => el.jackpot.classList.add('hidden'), 1300);
  }

  function startFrenzy() {
    state.frenzyActive = true;
    state.frenzyUntil = performance.now() + FRENZY_DURATION;
    document.body.id = 'frenzy-active';
    toast('🔥 FRENZY! x5 coins for ' + (FRENZY_DURATION / 1000) + 's — go nuts!');
  }

  // ---- main timers ---------------------------------------------------------
  setInterval(() => {                        // 10x/sec housekeeping
    const now = performance.now();
    // combo decay when idle
    if (state.combo > 0 && now - state.lastTap > comboWindow()) {
      state.combo = 0; state.comboMult = 1;
      el.comboValue.textContent = 'x1.0';
      el.comboValue.style.transform = 'scale(1)';
      el.comboValue.style.color = '#6bff6b';
    }
    // combo bar shows time left in the window
    if (state.combo > 0) {
      const left = Math.max(0, 1 - (now - state.lastTap) / comboWindow());
      el.comboFill.style.width = (left * 100) + '%';
    } else el.comboFill.style.width = '0%';
    // end frenzy
    if (state.frenzyActive && now > state.frenzyUntil) {
      state.frenzyActive = false; document.body.id = '';
    }
  }, 100);

  setInterval(() => {                          // auto-tapper idle income (1/sec)
    const lvl = upgrades.find(u => u.id === 'auto').level;
    if (lvl > 0) addCoins(Math.ceil(lvl * 2 * (state.frenzyActive ? 5 : 1) * globalMult()));
  }, 1000);

  // periodically dangle the parody "free offer"
  setInterval(() => {
    if (el.offer.classList.contains('hidden') && Math.random() < 0.5) {
      el.offer.classList.remove('hidden');
      setTimeout(() => el.offer.classList.add('hidden'), 6000);
    }
  }, 12000);

  // ---- shop rendering ------------------------------------------------------
  function renderShop() {
    el.shopList.innerHTML = '';
    upgrades.forEach(u => {
      if (u.unlockAt != null && state.prestiges < u.unlockAt) return; // unfolds with prestige
      const cost = u.cost(u);
      const maxed = u.level >= u.max && !u.free;
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.innerHTML = `
        <div class="icon">${u.icon}</div>
        <div class="info">
          <div class="name">${u.name}</div>
          <div class="desc">${u.desc}</div>
          ${u.free ? '' : `<div class="lvl">Level ${u.level}${u.max < 900 ? ' / ' + u.max : ''}</div>`}
        </div>
        <button class="buy ${u.free ? 'free' : ''}" data-id="${u.id}">
          ${u.free ? 'FREE' : maxed ? 'MAX' : (cost + ' 🪙')}
        </button>`;
      el.shopList.appendChild(item);
    });
    el.shopList.querySelectorAll('.buy').forEach(b =>
      b.addEventListener('click', () => buy(b.dataset.id)));
    renderShopAffordability();
  }

  function renderShopAffordability() {
    el.shopList.querySelectorAll('.buy').forEach(b => {
      const u = upgrades.find(x => x.id === b.dataset.id);
      if (u.free) { b.disabled = false; return; }
      const maxed = u.level >= u.max;
      b.disabled = maxed || state.coins < u.cost(u);
    });
  }

  function buy(id) {
    const u = upgrades.find(x => x.id === id);
    if (u.free) { u.apply(); blip(880, 0.12, 'triangle', 0.2); addShake(6); return; }
    if (u.level >= u.max) return;
    const cost = u.cost(u);
    if (state.coins < cost) { toast('Keep tapping! Need ' + fmt(cost) + ' 🪙'); return; }
    state.coins -= cost; u.level++; u.apply();
    el.coins.textContent = fmt(state.coins);
    blip(700, 0.1, 'triangle', 0.2); addShake(8);
    burst(innerWidth / 2, innerHeight / 2, 30, 130);
    renderShop();
    save();
  }

  // ---- input wiring --------------------------------------------------------
  function tapAt(e) {
    e.preventDefault();
    const t = e.changedTouches ? e.changedTouches[0] : e;
    doTap(t.clientX, t.clientY);
  }
  el.tap.addEventListener('pointerdown', tapAt);

  el.offer.addEventListener('click', () => {
    const b = 200 + state.tapPower * 100;
    addCoins(b); toast('🎁 Claimed ' + fmt(b) + ' free coins! (no purchase, ever)');
    burst(innerWidth / 2, 120, 40, 50); addShake(10);
    el.offer.classList.add('hidden');
  });

  // tab switching
  document.querySelectorAll('.navbtn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.navbtn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const showShop = btn.dataset.tab === 'shop-tab';
      el.shop.classList.toggle('hidden', !showShop);
      el.play.classList.toggle('hidden', showShop);
      if (showShop) renderShop();
    });
  });

  el.muteBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    el.muteBtn.textContent = state.muted ? '🔇' : '🔊';
    if (!state.muted) blip(660, 0.1);
  });

  // ---- persistence (progression that actually sticks) ----------------------
  function save() {
    try {
      const data = {
        coins: state.coins, tapPower: state.tapPower, muted: state.muted,
        nextMilestone: state.nextMilestone, lastSeen: Date.now(),
        stardust: state.stardust, prestiges: state.prestiges,
        totalEarned: state.totalEarned, runEarned: state.runEarned,
        lastDaily: state.lastDaily,
        levels: Object.fromEntries(upgrades.map(u => [u.id, u.level])),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable -> just play without saving */ }
  }

  function load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data) return false;
    state.coins = data.coins || 0;
    state.tapPower = data.tapPower || 1;
    state.muted = !!data.muted;
    state.nextMilestone = data.nextMilestone || 0;
    state.lastSeen = data.lastSeen || 0;
    state.stardust = data.stardust || 0;
    state.prestiges = data.prestiges || 0;
    state.totalEarned = data.totalEarned || 0;
    state.runEarned = data.runEarned || 0;
    state.lastDaily = data.lastDaily || 0;
    if (data.levels) upgrades.forEach(u => { if (data.levels[u.id] != null) u.level = data.levels[u.id]; });
    // re-apply real, level-scaled upgrade effects (tapPower is stored directly)
    el.muteBtn.textContent = state.muted ? '🔇' : '🔊';
    return true;
  }

  // grant idle income earned while away (parody of idle games' "welcome back")
  function applyOfflineEarnings() {
    const autoLvl = upgrades.find(u => u.id === 'auto').level;
    if (!state.lastSeen || autoLvl <= 0) return;
    const elapsedSec = Math.min(OFFLINE_CAP_SEC, Math.max(0, (Date.now() - state.lastSeen) / 1000));
    const earned = Math.floor(elapsedSec * autoLvl * 2 * globalMult());
    if (earned > 0) {
      addCoins(earned, true);
      setTimeout(() => toast('🤖 Welcome back! Your robots earned ' + fmt(earned) + ' coins while you were gone.'), 400);
    }
  }

  // ---- prestige / ascension (the real long-arc progression) ----------------
  const canPrestige = () => state.runEarned >= PRESTIGE_MIN;

  function updateStardust() {
    if (el.stardust) el.stardust.textContent = state.stardust > 0 ? fmt(state.stardust) : '0';
  }

  function prestige() {
    if (!canPrestige()) {
      toast('Earn ' + fmt(PRESTIGE_MIN) + ' this run to ascend (you have ' + fmt(state.runEarned) + ')');
      return false;
    }
    const gained = stardustFor(state.runEarned);
    state.stardust += gained;
    state.prestiges += 1;
    stats.prestiges++;
    // reset the run: coins + the three real upgrades. Keep stardust, prestige
    // count, and any parody unlocks. (Honest: clearly a fresh, more powerful run.)
    state.coins = 0; state.runEarned = 0; state.combo = 0; state.comboMult = 1;
    state.frenzy = 0; state.frenzyActive = false; state.tapPower = 1; state.nextMilestone = 0;
    document.body.id = '';
    ['power', 'combo', 'auto'].forEach(id => { upgrades.find(u => u.id === id).level = 0; });
    el.coins.textContent = '0';
    el.frenzyFill.style.width = '0%';
    updateStardust();
    [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.2), i * 90));
    for (let i = 0; i < 8; i++)
      setTimeout(() => burst(innerWidth * Math.random(), innerHeight * Math.random() * 0.6 + 100, 40, 280), i * 50);
    addShake(20);
    toast('✨ ASCENDED! +' + gained + ' stardust → permanent +' +
          Math.round(gained * STARDUST_PCT * 100) + '% to everything.');
    renderShop();
    save();
    return true;
  }

  // ---- honest daily bonus (no streak guilt, no FOMO) -----------------------
  function claimDaily() {
    if (state.lastDaily && Date.now() - state.lastDaily < DAILY_COOLDOWN) return false;
    const repeat = state.lastDaily > 0;
    state.lastDaily = Date.now();
    const bonus = Math.ceil((300 + state.tapPower * 200) * globalMult());
    addCoins(bonus, true);
    el.coins.textContent = fmt(state.coins);
    if (repeat) setTimeout(() => toast('🎁 Daily gift: +' + fmt(bonus) + '! Come back whenever — no streak to lose.'), 800);
    return true;
  }

  // ---- analytics (local-only, privacy-respecting; ready for validation) -----
  function loadStats() {
    let s; try { s = JSON.parse(localStorage.getItem(STATS_KEY)); } catch (e) { s = null; }
    return s || { sessions: 0, taps: 0, jackpots: 0, prestiges: 0,
                  maxCoins: 0, firstSeen: Date.now(), lastSeen: 0, playMs: 0 };
  }
  let sessionStart = Date.now();
  function saveStats() {
    const now = Date.now();
    stats.playMs += now - sessionStart; sessionStart = now;
    stats.maxCoins = Math.max(stats.maxCoins, Math.floor(state.totalEarned));
    stats.lastSeen = now;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  }
  const stats = loadStats();

  // ---- boot ----------------------------------------------------------------
  stats.sessions++;
  const hadSave = load();
  applyOfflineEarnings();
  claimDaily();
  updateStardust();
  el.coins.textContent = fmt(state.coins);
  renderShop();
  toast(hadSave ? 'Welcome back, champ! Keep tapping. 😄'
                : 'Tap the big button! It\'s free. It\'s always free. 😄');

  if (el.ascend) el.ascend.addEventListener('click', prestige);

  setInterval(() => { save(); saveStats(); }, 5000);       // autosave
  addEventListener('visibilitychange', () => { if (document.hidden) { save(); saveStats(); } });
  addEventListener('pagehide', () => { save(); saveStats(); });

  // expose internals for automated smoke-testing
  window.__megatap = { state, upgrades, doTap, addCoins, fmt, buy, save, load,
    applyOfflineEarnings, prestige, canPrestige, stardustFor, globalMult,
    claimDaily, stats, MILESTONES, SAVE_KEY, STATS_KEY, PRESTIGE_MIN };
})();
