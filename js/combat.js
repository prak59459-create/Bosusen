import * as THREE from 'three';
import { scene } from './scene.js';
import { spawnEnemy } from './enemy.js';
import { player, crossfadeTo, playerMotionBeat, playerModel } from './player.js';
import { bossGlow, torchFires } from './scene.js';
import { sfx, setHeartbeatActive } from './audio.js';
import { rand } from './utils.js';
import { spawnDamageNumber, spawnParticles, flashHit, animateSwing, animateLunge, triggerShake, triggerCritFlash, spawnShockwave, rumble } from './effects.js';
import { els, updateBars, log, showCenterMsg, showToast, setButtonsEnabled, renderQuestTracker } from './ui.js';
import { CHAPTERS, levelStatsFor, BOSS_TAUNTS, VICTORY_LINES, DEFEAT_LINES } from './data.js';
import { state, computeStats, addShards, difficultyMult, checkAchievements } from './state.js';

let dodgeActive = false;
let dodgeAnimHandle = null;
let dodgeJustZoneStart = 0.75; // ラスト25%が「ジャスト」判定
let onChapterWin = null;
let onChapterLose = null;

export function cancelDodgeQTE() {
  dodgeActive = false;
  if (dodgeAnimHandle) cancelAnimationFrame(dodgeAnimHandle);
  if (els.dodgeZone) els.dodgeZone.style.display = 'none';
}

export function setCombatCallbacks({ onWin, onLose }) {
  onChapterWin = onWin;
  onChapterLose = onLose;
}

// spawnEnemy で生成し直されるたびに `boss` の live-binding を参照するため、
// 常に enemy.js から最新のインスタンスを取得するヘルパーを使う。
import * as EnemyModule from './enemy.js';
function getBoss() { return EnemyModule.boss; }

function bossHitPoint() {
  return getBoss().position.clone().add(new THREE.Vector3(0, 3.2, 0.5));
}

function gainCombo() {
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
  if (state.combo === 8) {
    showToast('コンボ最大火力に到達！', 'quest');
    sfx.skillUnlock();
  }
  if (state.combo === (state.lifetimeBestCombo || 0) + 1 && state.combo >= 5) {
    showToast(`自己ベストコンボ更新！ ${state.combo}コンボ`, 'quest');
  }
}

function flashDenied(btnId) {
  const el = document.getElementById(btnId);
  if (!el) return;
  el.classList.remove('denied');
  void el.offsetWidth;
  el.classList.add('denied');
}

function rollCrit(critPct) {
  return Math.random() * 100 < critPct;
}

/* ============================================================
   ボスフェーズ判定・演出
   ============================================================ */
export function checkPhaseTransition() {
  const chapter = CHAPTERS[state.chapterIndex];
  const b = getBoss();
  if (!state.bossLowHpWarned && state.bossHP > 0 && state.bossHP <= state.bossMaxHP * 0.15) {
    state.bossLowHpWarned = true;
    log(`${chapter.enemyName}の力が尽きかけている！ 一気に畳みかけろ！`);
    showCenterMsg('FINISH HIM!', '#ff8844', 1000);
    sfx.lowBossHp();
  }
  if (chapter.hasPhases && !state.phase2 && state.bossHP <= state.bossMaxHP * 0.5) {
    state.phase2 = true;
    els.phaseTag.style.display = 'inline-block';
    log(`${chapter.enemyName}が覚醒した！攻撃が激化する！`);
    if (chapter.awakenLine && state.showBossTaunts !== false) log(chapter.awakenLine);
    showCenterMsg('BOSS AWAKENS!!', '#ff4444', 1400);
    sfx.roar();
    b.userData.body.emissiveIntensity = 1.1;
    b.userData.body.emissive.setHex(0x660000);
    b.userData.eyes.forEach(e => { e.material.emissiveIntensity = 5; });
    bossGlow.intensity = 5.5;
    bossGlow.color.setHex(0xff0000);
    triggerShake(0.3, 0.6);
    rumble(0.9, 500);
    spawnShockwave(b.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 0xff2222);
    const startScale = b.scale.x;
    const t0 = performance.now();
    function grow(t) {
      const p = Math.min(1, (t - t0) / 500);
      const s = startScale + p * 0.15;
      b.scale.set(s, s, s);
      if (p < 1) requestAnimationFrame(grow);
    }
    requestAnimationFrame(grow);
  }
}

/* ============================================================
   終了判定
   ============================================================ */
function endCheck() {
  if (state.bossHP <= 0) { state.bossHP = 0; updateBars(); finishGame(true); return true; }
  if (state.playerHP <= 0) {
    const stats = computeStats();
    if (stats.hasRevive && !state.usedRevive) {
      state.usedRevive = true;
      state.playerHP = Math.round(state.playerMaxHP * (0.3 + (stats.reviveHpPct || 0)));
      updateBars();
      log('蘇生の残光が発動！ 力尽きる寸前で意識を取り戻した！');
      showCenterMsg('REVIVE!', '#ffd75e', 1200);
      sfx.skillUnlock();
      return false;
    }
    state.playerHP = 0; updateBars(); finishGame(false); return true;
  }
  return false;
}

function calcRank() {
  if (state.damageTaken <= 20 && state.turns <= 10) return 'S';
  if (state.damageTaken <= 50 && state.turns <= 16) return 'A';
  if (state.damageTaken <= 90) return 'B';
  return 'C';
}

function renderEndingChoices(chapter) {
  els.endChoices.innerHTML = '';
  const totalShards = state.totalShardsEarned;
  chapter.endings.forEach(ending => {
    const unlocked = totalShards >= ending.requiredShards;
    const btn = document.createElement('button');
    btn.className = 'ending-choice-btn' + (unlocked ? '' : ' locked');
    btn.innerHTML = `
      <div class="ending-choice-title">${ending.title}</div>
      <div class="ending-choice-req">${unlocked ? '' : `結晶の欠片 累計 ${ending.requiredShards} 個が必要（現在 ${totalShards} 個）`}</div>
    `;
    if (!unlocked) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        els.endTitle.textContent = `🎉 ${ending.title} 🎉`;
        els.endTitle.style.color = '#5fd35f';
        els.endStory.textContent = ending.text;
        els.endChoices.innerHTML = '';
        els.retryBtn.style.display = 'inline-block';
        els.ngPlusBtn.style.display = 'inline-block';
        sfx.victory();
      });
    }
    els.endChoices.appendChild(btn);
  });
}

function finishGame(won) {
  state.playing = false;
  setHeartbeatActive(false);
  const chapter = CHAPTERS[state.chapterIndex];
  const isFinal = state.chapterIndex === CHAPTERS.length - 1;
  els.nextBtn.style.display = 'none';
  els.retryBtn.style.display = 'none';
  els.ngPlusBtn.style.display = 'none';
  els.endStory.textContent = '';
  els.endRewards.textContent = '';
  els.endChoices.innerHTML = '';

  if (won) {
    sfx.victory();
    showCenterMsg('VICTORY!', '#5fd35f', 2000);
    const defeatBanner = document.getElementById('boss-intro-banner');
    if (defeatBanner && !state.reduceFlashing) {
      defeatBanner.querySelector('.boss-intro-name').textContent = chapter.enemyName;
      defeatBanner.querySelector('.boss-intro-sub').textContent = '撃破';
      defeatBanner.classList.remove('show');
      void defeatBanner.offsetWidth;
      defeatBanner.classList.add('show');
      setTimeout(() => { defeatBanner.querySelector('.boss-intro-sub').textContent = '討伐対象'; }, 3300);
    }
    crossfadeTo('Idle', 0.4);
    spawnShockwave(player.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x5fd35f);
    [0xffd700, 0x5fd35f, 0x9fe0ff].forEach((c, i) => {
      setTimeout(() => spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6 + i * 0.2, 0)), c, 16), i * 150);
    });
    const rank = calcRank();
    els.endRank.textContent = `評価ランク: ${rank}`;
    if (rank === 'S') {
      showCenterMsg('S RANK!!', '#ffd700', 1800);
      sfx.achievement();
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          const ang = Math.random() * Math.PI * 2;
          const pos = player.position.clone().add(new THREE.Vector3(Math.cos(ang) * 1.5, 1.2 + Math.random() * 1.5, Math.sin(ang) * 1.5));
          spawnParticles(pos, 0xffd700, 12);
        }, i * 120);
      }
    }

    const RANK_BONUS = { S: 1.5, A: 1.2, B: 1.0, C: 1.0 };
    const shardPct = computeStats().shardPct || 0;
    const ngPlusShardMult = 1 + (state.newGamePlus || 0) * 0.2;
    const shardReward = Math.round(chapter.shardsBase * difficultyMult().shards * RANK_BONUS[rank] * (1 + shardPct) * ngPlusShardMult);
    state.xp += chapter.xp;
    state.bossesDefeated++;
    state.chapterClearCounts[chapter.key] = (state.chapterClearCounts[chapter.key] || 0) + 1;
    if (!state.firstDefeatedAt) state.firstDefeatedAt = {};
    if (!state.firstDefeatedAt[chapter.key]) state.firstDefeatedAt[chapter.key] = Date.now();
    if (!state.bestTurnsPerChapter) state.bestTurnsPerChapter = {};
    const prevBest = state.bestTurnsPerChapter[chapter.key];
    if (!prevBest || state.turns < prevBest) state.bestTurnsPerChapter[chapter.key] = state.turns;
    state.winStreak++;
    state.bestWinStreak = Math.max(state.bestWinStreak, state.winStreak);
    state.lifetimeBestCombo = Math.max(state.lifetimeBestCombo, state.maxCombo || 0);
    addShards(shardReward);
    const comboBonus = Math.min(30, Math.floor((state.maxCombo || 0) / 2));
    if (comboBonus > 0) addShards(comboBonus);
    const rankBonusNote = RANK_BONUS[rank] > 1 ? `（ランク${rank}ボーナス+${Math.round((RANK_BONUS[rank]-1)*100)}%）` : '';
    const comboBonusNote = comboBonus > 0 ? ` / コンボボーナス +${comboBonus}` : '';
    els.endRewards.textContent = `獲得経験値 +${chapter.xp} / 結晶の欠片 +${shardReward}${rankBonusNote}${comboBonusNote}（累計 ${state.totalShardsEarned}）`;
    checkAchievements(undefined, rank).forEach((a, i) => {
      sfx.achievement();
      showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest');
      setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300);
    });

    if (isFinal) {
      els.endTitle.textContent = '選択のとき';
      els.endTitle.style.color = '#a3790a';
      els.endStory.textContent = '結末を選んでください。';
      renderEndingChoices(chapter);
      els.retryBtn.textContent = 'もう一度最初から';
    } else {
      els.endTitle.textContent = `🎉 勝利！${chapter.enemyName}を打ち破った 🎉`;
      els.endTitle.style.color = '#5fd35f';
      if (state.showBossTaunts !== false) els.endStory.textContent = VICTORY_LINES[Math.floor(Math.random() * VICTORY_LINES.length)];
      els.nextBtn.style.display = 'inline-block';
    }
    if (onChapterWin) onChapterWin(state.chapterIndex, isFinal);
  } else {
    els.endTitle.textContent = '💀 敗北... 💀';
    els.endTitle.style.color = '#e04a4a';
    els.endRank.textContent = '';
    if (state.showBossTaunts !== false) els.endStory.textContent = DEFEAT_LINES[Math.floor(Math.random() * DEFEAT_LINES.length)];
    state.winStreak = 0;
    sfx.defeat();
    els.retryBtn.textContent = 'この章に再挑戦';
    els.retryBtn.style.display = 'inline-block';
    if (onChapterLose) onChapterLose(state.chapterIndex);
  }
  const bonusTags = [];
  if (won && state.turns > 0 && state.turns <= 5) bonusTags.push('⚡瞬速撃破');
  if (won && state.damageTaken === 0) bonusTags.push('🛡️無傷');
  els.endStats.textContent = `経過ターン数: ${state.turns} / 被ダメージ合計: ${Math.round(state.damageTaken)} / 最大コンボ: ${state.maxCombo || 0} / 習得スキル: ${state.unlockedSkills.length}${bonusTags.length ? ' ｜ ' + bonusTags.join(' ') : ''}`;
  els.endScreen.style.display = 'flex';
}

/* ============================================================
   敵の攻撃パターン（フェーズで変化）
   ============================================================ */
export function bossTurn() {
  if (!state.playing) return;

  if (state.skillCooldown > 0) state.skillCooldown--;
  state.playerStam = Math.min(state.playerMaxStam, state.playerStam + 8);
  state.playerMP = Math.min(state.playerMaxMP, state.playerMP + 6 + (computeStats().mpRegenBonus || 0));
  updateBars();

  const chapter = CHAPTERS[state.chapterIndex];
  const pool = state.phase2 ? chapter.movesPhase2 : chapter.movesPhase1;
  const weights = state.phase2 ? [0.35, 0.35, 0.3] : [0.4, 0.4, 0.2];
  let r = Math.random(), acc = 0, move = pool[0];
  for (let i = 0; i < pool.length; i++) { acc += weights[i]; if (r <= acc) { move = pool[i]; break; } }

  els.telegraphName.textContent = `⚠ ${move.name} ⚠`;
  els.telegraphSub.textContent = move.sub;
  els.telegraph.style.display = 'block';
  sfx.roar();

  setTimeout(() => {
    if (!state.playing) return;
    els.telegraph.style.display = 'none';
    startDodgeQTE(move);
  }, 650);
}

function startDodgeQTE(move) {
  dodgeActive = true;
  els.dodgeZone.style.display = 'flex';
  els.dodgeRingWrap.classList.remove('just-zone');
  document.getElementById('dodge-label').textContent = '今だ！クリックでガード！';
  const stats = computeStats();
  const window_ = move.dodgeWindow * (1 + stats.dodgeWindowPct);
  const circumference = 389.6;
  els.dodgeCircle.setAttribute('stroke-dashoffset', '0');
  const t0 = performance.now();
  function step(t) {
    if (!dodgeActive) return;
    const p = Math.min(1, (t - t0) / window_);
    els.dodgeCircle.setAttribute('stroke-dashoffset', String(p * circumference));
    if (p >= dodgeJustZoneStart) {
      els.dodgeRingWrap.classList.add('just-zone');
      document.getElementById('dodge-label').textContent = 'ジャストガード（パリィ）！';
    }
    if (p < 1) { dodgeAnimHandle = requestAnimationFrame(step); }
    else { resolveDodge(false, move, false); }
  }
  dodgeAnimHandle = requestAnimationFrame(step);

  els.dodgeBtn.onclick = () => {
    const elapsed = performance.now() - t0;
    const p = elapsed / window_;
    const isParry = p >= dodgeJustZoneStart && p <= 1.08;
    resolveDodge(true, move, isParry);
  };
}

function resolveDodge(clicked, move, isParry) {
  if (!dodgeActive) return;
  dodgeActive = false;
  cancelAnimationFrame(dodgeAnimHandle);
  els.dodgeZone.style.display = 'none';
  els.dodgeRingWrap.classList.remove('just-zone');

  const b = getBoss();
  animateSwing(b.userData.armR, 400, 1.0);
  animateLunge(b, new THREE.Vector3(-1, 0, 1), 0.6, 350);

  setTimeout(() => {
    if (!state.playing) return;
    if (clicked && isParry) {
      const stats = computeStats();
      const comboMult = (1 + Math.min(state.combo, 8) * 0.08) * levelStatsFor(state.level).dmgMult;
      const counterDmg = Math.round(rand(14, 22) * comboMult * (1 + stats.parryBonusPct) + stats.atk * 0.6);
      state.bossHP -= counterDmg;
      state.totalParries = (state.totalParries || 0) + 1;
      sfx.parry();
      log(`${move.name}をジャストガード！ 鮮やかな反撃で ${counterDmg} ダメージ！`);
      showCenterMsg('PERFECT PARRY!', '#ffd75e', 900);
      flashHit(b);
      spawnParticles(bossHitPoint(), 0xffd75e, 20);
      spawnDamageNumber(bossHitPoint(), `-${counterDmg}`, '#ffd75e', true);
      spawnShockwave(player.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xffd75e);
      triggerShake(0.18, 0.3);
      rumble(0.5, 150);
      state.playerStam = Math.min(state.playerMaxStam, state.playerStam + 25);
      if (stats.parryMpRestore) state.playerMP = Math.min(state.playerMaxMP, state.playerMP + stats.parryMpRestore);
      crossfadeTo('Walk', 0.1);
      setTimeout(() => crossfadeTo('Idle', 0.25), 260);
      checkPhaseTransition();
    } else if (clicked) {
      sfx.dodgeSuccess();
      log(`${move.name}を華麗に回避した！`);
      showCenterMsg('DODGE!', '#5eb6ff', 700);
      spawnDamageNumber(player.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 'AVOID', '#5eb6ff', true);
      state.playerStam = Math.min(state.playerMaxStam, state.playerStam + 15);
      crossfadeTo('Walk', 0.1);
      setTimeout(() => crossfadeTo('Idle', 0.25), 260);
    } else {
      let dmg = Math.round(rand(move.min, move.max) * difficultyMult().dmg);
      if (state.guarding) { dmg = Math.round(dmg / 2); }
      const stats = computeStats();
      dmg = Math.round(dmg * (100 / (100 + stats.def)));
      dmg = Math.max(1, dmg);
      if (state.guarding) log(`${move.name}を受けた！ガードで軽減：${dmg} ダメージ`);
      else log(`${move.name}が直撃！ ${dmg} ダメージ`);
      state.playerHP -= dmg;
      state.damageTaken += dmg;
      if (state.guarding && stats.guardReflectPct) {
        const reflectDmg = Math.round(dmg * stats.guardReflectPct);
        if (reflectDmg > 0) {
          state.bossHP -= reflectDmg;
          log(`反射の盾！ ${reflectDmg} ダメージを跳ね返した`);
          spawnDamageNumber(bossHitPoint(), `-${reflectDmg}`, '#88ccff', false);
        }
      }
      state.combo = 0;
      sfx.dodgeFail();
      if (playerModel) flashHit(playerModel);
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xff5555, 10);
      spawnDamageNumber(player.position.clone().add(new THREE.Vector3(0, 2.4, 0)), `-${dmg}`, '#ff6666', dmg > 18);
      triggerShake(Math.min(0.25, dmg / 100), 0.35);
      rumble(Math.min(0.8, dmg / 40), 220);
    }
    state.guarding = false;
    updateBars();
    if (!endCheck()) {
      state.turnBusy = false;
      setButtonsEnabled(true);
    }
  }, 250);
}

/* ============================================================
   プレイヤー行動
   ============================================================ */
export function playerAction(type) {
  if (!state.playing || state.turnBusy) return;

  if (type === 'attack' && state.playerStam < 10) { log('スタミナが足りない！'); return; }
  const stats0 = computeStats();
  const stamMult = Math.max(0.4, 1 + (stats0.staminaCostPct || 0));
  const attackStamCost = Math.round(10 * stamMult);
  const heavyStamCost = Math.round(30 * stamMult);
  if (type === 'heavy' && state.playerStam < heavyStamCost) {
    log('スタミナが足りない！');
    showToast('スタミナが足りません', 'info');
    sfx.dodgeFail();
    flashDenied('btn-heavy');
    return;
  }
  if (type === 'skill' && (state.playerMP < 25 || state.skillCooldown > 0)) {
    log('結晶技は使えない！');
    showToast(state.skillCooldown > 0 ? '結晶技はクールダウン中です' : 'エーテルが足りません', 'info');
    sfx.dodgeFail();
    flashDenied('btn-skill');
    return;
  }
  if (type === 'heal' && state.healUses <= 0) {
    log('回復はもう使えない！');
    showToast('回復の使用回数がありません', 'info');
    sfx.dodgeFail();
    flashDenied('btn-heal');
    return;
  }

  state.turnBusy = true;
  setButtonsEnabled(false);
  state.guarding = false;
  state.turns++;
  if (state.turns === 20) showToast('長期戦になっている……集中力を切らさずに攻め続けよう', 'info');

  const stats = computeStats();
  const comboMult = (1 + Math.min(state.combo, 8) * 0.08) * levelStatsFor(state.level).dmgMult;
  const b = getBoss();

  if (type === 'attack') {
    state.playerStam -= attackStamCost;
    playerMotionBeat('attack');
    animateLunge(player, new THREE.Vector3(1, 0, -1), 0.7, 300);
    sfx.swing();
    setTimeout(() => {
      if (!state.playing) return;
      const crit = rollCrit(stats.crit);
      let dmg = Math.round((rand(8, 15) + stats.atk * 0.5) * comboMult);
      if (crit) { dmg = Math.round(dmg * (1.5 + (stats.critDmgPct || 0))); triggerCritFlash(); state.totalCrits = (state.totalCrits || 0) + 1; }
      state.bossHP -= dmg;
      gainCombo();
      updateBars();
      flashHit(b);
      crit ? sfx.critHit() : sfx.hit();
      spawnParticles(bossHitPoint(), crit ? 0xffe066 : 0xffcc44, crit ? 20 : 12);
      if (crit) spawnShockwave(bossHitPoint(), 0xffe066);
      spawnDamageNumber(bossHitPoint(), `-${dmg}${crit ? '!' : ''}`, crit ? '#ffe066' : '#ffcc44', crit);
      log(`あなたの攻撃！ ${dmg} ダメージ${crit ? '（クリティカル！）' : ''}${state.combo > 1 ? ` (${state.combo}コンボ)` : ''}`);
      showCenterMsg(crit ? 'CRITICAL!' : 'ATTACK!', crit ? '#ffe066' : '#ffffff', 450);
      rumble(crit ? 0.6 : 0.25, 120);
      checkPhaseTransition();
      if (!endCheck()) setTimeout(bossTurn, 500);
    }, 250);

  } else if (type === 'heavy') {
    state.playerStam -= heavyStamCost;
    playerMotionBeat('heavy');
    animateLunge(player, new THREE.Vector3(1, 0, -1), 1.0, 480);
    sfx.swing();
    setTimeout(() => {
      if (!state.playing) return;
      const success = Math.random() > 0.12 * (1 - (stats.heavyAccuracyPct || 0));
      if (success) {
        const crit = rollCrit(stats.crit);
        let dmg = Math.round((rand(20, 32) + stats.atk) * comboMult);
        if (crit) { dmg = Math.round(dmg * (1.5 + (stats.critDmgPct || 0))); triggerCritFlash(); state.totalCrits = (state.totalCrits || 0) + 1; }
        state.bossHP -= dmg;
        gainCombo();
        updateBars();
        flashHit(b);
        sfx.heavyHit();
        if (crit) sfx.critHit();
        spawnParticles(bossHitPoint(), 0xff8844, 20);
        if (crit) spawnShockwave(bossHitPoint(), 0xffe066);
        spawnDamageNumber(bossHitPoint(), `-${dmg}`, '#ff8844', true);
        log(`強攻撃が炸裂！ ${dmg} ダメージ！${crit ? '（クリティカル！）' : ''}`);
        showCenterMsg(crit ? 'CRITICAL!' : 'HEAVY HIT!', crit ? '#ffe066' : '#ff8844', 700);
        triggerShake(0.15, 0.3);
        rumble(crit ? 0.7 : 0.4, 180);
      } else {
        state.combo = 0;
        log('強攻撃は外れてしまった...！');
        showCenterMsg('MISS...', '#888888', 700);
      }
      checkPhaseTransition();
      if (!endCheck()) setTimeout(bossTurn, 500);
    }, 480);

  } else if (type === 'skill') {
    state.playerMP -= 25;
    state.skillCooldown = 3;
    playerMotionBeat('attack');
    showCenterMsg('結晶技発動！', '#5eb6ff', 600);
    sfx.skill();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x5eb6ff, emissive: 0x2277ff, emissiveIntensity: 3 }));
    orb.position.copy(player.position).add(new THREE.Vector3(0.5, 1.6, 0));
    scene.add(orb);
    const orbLight = new THREE.PointLight(0x5eb6ff, 3, 6);
    orb.add(orbLight);
    const target = bossHitPoint();
    const startPos = player.position.clone().add(new THREE.Vector3(0.5, 1.6, 0));
    const t0 = performance.now();
    function flyOrb(t) {
      if (!state.playing) { scene.remove(orb); orb.geometry.dispose(); orb.material.dispose(); return; }
      const p = Math.min(1, (t - t0) / 450);
      orb.position.lerpVectors(startPos, target, p);
      orb.scale.setScalar(1 + p * 0.5);
      if (p < 1) requestAnimationFrame(flyOrb);
      else {
        scene.remove(orb);
        orb.geometry.dispose();
        orb.material.dispose();
        const crit = rollCrit(stats.crit);
        let dmg = Math.round((rand(30, 45) + stats.atk) * comboMult);
        if (crit) { dmg = Math.round(dmg * (1.5 + (stats.critDmgPct || 0))); triggerCritFlash(); state.totalCrits = (state.totalCrits || 0) + 1; }
        state.bossHP -= dmg;
        gainCombo();
        updateBars();
        flashHit(getBoss());
        sfx.heavyHit();
        if (crit) sfx.critHit();
        spawnParticles(target, 0x5eb6ff, 26);
        if (crit) spawnShockwave(target, 0xffe066);
        spawnDamageNumber(target, `-${dmg}`, '#5eb6ff', true);
        log(`結晶技「アビスブレイク」！ ${dmg} ダメージ！${crit ? '（クリティカル！）' : ''}`);
        showCenterMsg(crit ? 'CRITICAL!' : 'ABYSS BREAK!', crit ? '#ffe066' : '#5eb6ff', 700);
        triggerShake(0.2, 0.35);
        rumble(crit ? 0.75 : 0.45, 200);
        checkPhaseTransition();
        if (!endCheck()) setTimeout(bossTurn, 500);
      }
    }
    requestAnimationFrame(flyOrb);

  } else if (type === 'guard') {
    state.guarding = true;
    state.guardUsedThisBattle = true;
    state.playerStam = Math.min(state.playerMaxStam, state.playerStam + 20);
    updateBars();
    log('ガードの構え。次のダメージを軽減する。');
    showCenterMsg('GUARD', '#6f8fc4', 500);
    sfx.guard();
    setTimeout(bossTurn, 400);

  } else if (type === 'heal') {
    state.healUses--;
    const heal = Math.round((rand(20, 32) + stats.maxHP * 0.05) * (1 + stats.healBonusPct));
    state.playerHP = Math.min(state.playerMaxHP, state.playerHP + heal);
    state.combo = 0;
    updateBars();
    log(`回復！ HPが ${heal} 回復した。`);
    showCenterMsg('HEAL', '#5fd35f', 500);
    sfx.heal();
    spawnDamageNumber(player.position.clone().add(new THREE.Vector3(0, 2.4, 0)), `+${heal}`, '#5fd35f', true);
    setTimeout(bossTurn, 500);
  }
}

/* ============================================================
   章の初期化
   ============================================================ */
export function setupChapterBattle(chapterIndex) {
  const chapter = CHAPTERS[chapterIndex];
  const level = chapterIndex + 1;
  state.chapterIndex = chapterIndex;
  state.level = level;
  const stats = computeStats();
  const dMult = difficultyMult();
  const ngPlusMult = 1 + (state.newGamePlus || 0) * 0.25;
  const scaledBossHP = Math.round(chapter.hp * dMult.hp * ngPlusMult);
  Object.assign(state, {
    playerHP: stats.maxHP, playerMaxHP: stats.maxHP,
    playerMP: stats.maxMP, playerMaxMP: stats.maxMP,
    playerStam: stats.maxStam, playerMaxStam: stats.maxStam,
    bossHP: scaledBossHP, bossMaxHP: scaledBossHP,
    healUses: 3 + (stats.healUsesBonus || 0), healUsesMax: 3 + (stats.healUsesBonus || 0), guarding: false, playing: false, turnBusy: false,
    combo: 0, maxCombo: 0, phase2: false, turns: 0, damageTaken: 0, skillCooldown: 0,
    usedRevive: false,
    bossLowHpWarned: false,
    guardUsedThisBattle: false,
  });
  els.phaseTag.style.display = 'none';
  spawnEnemy(chapter.enemyDef);
  bossGlow.intensity = 3.5;
  bossGlow.color.setHex(0x8844ff);
  updateBars();
  setButtonsEnabled(true);
  els.logWrap.innerHTML = '';
  renderQuestTracker();
}

export function startBattlePhase() {
  state.playing = true;
  updateBars();
  const chapter = CHAPTERS[state.chapterIndex];
  log(`戦闘開始！ ${chapter.enemyName}が姿を現した！`);
  const introBanner = document.getElementById('boss-intro-banner');
  if (introBanner && !state.reduceFlashing) {
    introBanner.querySelector('.boss-intro-name').textContent = chapter.enemyName;
    introBanner.classList.remove('show');
    void introBanner.offsetWidth;
    introBanner.classList.add('show');
  }
  const tauntPool = chapter.taunts || BOSS_TAUNTS;
  const taunt = tauntPool[Math.floor(Math.random() * tauntPool.length)];
  if (state.showBossTaunts !== false) log(taunt);
  sfx.roar();
  if (!state.seenBattleTutorial) {
    state.seenBattleTutorial = true;
    const tips = [
      '攻撃・強攻撃・結晶技でダメージを与えよう',
      'ボスの攻撃が来たらガードで被ダメージ半減、タイミングよくジャストガードすればパリィで反撃できる',
      '回復でHPを回復できるが回数制限があるので注意',
    ];
    tips.forEach((tip, i) => {
      setTimeout(() => showToast(tip, 'info'), 1500 + i * 2800);
    });
  }
}

export function getTorchFires() { return torchFires; }
