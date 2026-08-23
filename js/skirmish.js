import { state, computeStats, markFieldTargetDefeated, saveGame, checkAchievements, difficultyMult, addShards, ngPlusShardMult } from './state.js';
import { updateBars, showToast, showCenterMsg } from './ui.js';
import { sfx, setHeartbeatActive } from './audio.js';
import { spawnParticles, spawnShockwave, rumble, triggerCritFlash, triggerShake } from './effects.js';

/* ============================================================
   フィールド討伐目標との小規模スキルミッシュ(即死ではなく実際に
   数回打ち合う簡易戦闘)
   ============================================================ */
let active = false;
let enemyHP = 0, enemyMaxHP = 0;
let currentTarget = null;
let repeatHunt = false;
// 再討伐の間隔（連打でシャードを稼げないようにする）
const REPEAT_HUNT_COOLDOWN_MS = 90000;
let els = null;

export function isSkirmishActive() { return active; }

export function resetSkirmish() {
  active = false;
  currentTarget = null;
  if (els) els.panel.style.display = 'none';
}

export function initSkirmishUI() {
  els = {
    panel: document.getElementById('skirmish-panel'),
    name: document.getElementById('skirmish-name'),
    hpFill: document.getElementById('skirmish-hp-fill'),
    hpText: document.getElementById('skirmish-hp-text'),
    log: document.getElementById('skirmish-log'),
    attackBtn: document.getElementById('skirmish-attack-btn'),
    fleeBtn: document.getElementById('skirmish-flee-btn'),
  };
  els.attackBtn.addEventListener('click', attack);
  els.fleeBtn.addEventListener('click', flee);
}

// クールダウンが明けたら輝きを戻し、再び討伐できることを見た目で示す
export function scheduleHuntRespawn(target) {
  const delay = Math.max(0, (target.huntReadyAt || 0) - Date.now());
  setTimeout(() => {
    if (target.baseEmissive === undefined) return;
    target.material.emissiveIntensity = target.baseEmissive;
    target.light.intensity = target.baseLight;
    if (target.beam) target.beam.visible = true;
  }, delay);
}

export function startSkirmish(target, isRepeat = false) {
  if (active) return;
  active = true;
  repeatHunt = isRepeat;
  state.inSkirmish = true;
  currentTarget = target;
  // ボス戦と同じく難易度と周回数でスケールさせ、強化された自機に対して形骸化しないようにする
  const dMult = difficultyMult();
  const ngPlusMult = 1 + (state.newGamePlus || 0) * 0.25;
  enemyMaxHP = Math.round((target.hp || 30) * dMult.hp * ngPlusMult);
  enemyHP = enemyMaxHP;
  els.name.textContent = target.name || '結晶獣（フィールド）';
  els.log.textContent = '襲いかかってきた！';
  updateEnemyBar();
  els.panel.style.display = 'flex';
  if (target.mesh) target.mesh.scale.setScalar(1.3);
  sfx.roar();
  rumble(0.4, 250);
}

function updateEnemyBar() {
  const pct = Math.max(0, enemyHP / enemyMaxHP * 100);
  els.hpFill.style.width = `${pct}%`;
  els.hpText.textContent = `${Math.max(0, Math.round(enemyHP))}/${enemyMaxHP}（${Math.round(pct)}%）`;
}

function attack() {
  if (!active) return;
  const stats = computeStats();
  const crit = Math.random() * 100 < stats.crit;
  let dmg = Math.round(stats.atk * (0.8 + Math.random() * 0.5));
  if (crit) {
    dmg = Math.round(dmg * 1.5);
    state.totalCrits = (state.totalCrits || 0) + 1;
    triggerCritFlash();
  }
  enemyHP -= dmg;
  crit ? sfx.critHit() : sfx.hit();
  if (currentTarget && currentTarget.mesh) spawnParticles(currentTarget.mesh.getWorldPosition(currentTarget.mesh.position.clone()), crit ? 0xffe066 : 0xff6644, crit ? 16 : 10);
  updateEnemyBar();

  if (enemyHP <= 0) {
    els.log.textContent = `${dmg}のダメージ！${crit ? '（クリティカル！）' : ''} 結晶獣を討伐した！`;
    sfx.victory();
    finishSkirmish(true);
    return;
  }

  const retaliation = Math.round((4 + Math.random() * 6) * difficultyMult().dmg * (1 + (state.newGamePlus || 0) * 0.25));
  const reduced = Math.max(1, Math.round(retaliation * (100 / (100 + stats.def))));
  state.playerHP = Math.max(1, state.playerHP - reduced);
  rumble(0.3, 150);
  triggerShake(Math.min(0.2, reduced / 60), 0.3);
  updateBars();
  els.log.textContent = `${dmg}のダメージを与えた！${crit ? '（クリティカル！）' : ''} 反撃で${reduced}のダメージを受けた`;
}

function finishSkirmish(won) {
  active = false;
  state.inSkirmish = false;
  setHeartbeatActive(false);
  els.panel.style.display = 'none';
  if (currentTarget && currentTarget.mesh) currentTarget.mesh.scale.setScalar(1);
  if (won && currentTarget) {
    state.fieldKillsTotal = (state.fieldKillsTotal || 0) + 1;
    if (!repeatHunt) markFieldTargetDefeated(currentTarget.questId);
    // 元の輝きを一度だけ控えておき、再挑戦可能になったら戻せるようにする
    if (currentTarget.baseEmissive === undefined) {
      currentTarget.baseEmissive = currentTarget.material.emissiveIntensity;
      currentTarget.baseLight = currentTarget.light.intensity;
    }
    // 討伐直後は輝きを落とす（再挑戦のクールダウン中であることを示す）
    currentTarget.material.emissiveIntensity = 0.1;
    currentTarget.light.intensity = 0.2;
    if (currentTarget.beam) currentTarget.beam.visible = false;
    if (repeatHunt) {
      currentTarget.huntReadyAt = Date.now() + REPEAT_HUNT_COOLDOWN_MS;
      scheduleHuntRespawn(currentTarget);
    }
    sfx.questDone();
    if (currentTarget.mesh) spawnShockwave(currentTarget.mesh.getWorldPosition(currentTarget.mesh.position.clone()), 0xff6644);
    rumble(0.6, 350);
    if (repeatHunt) {
      const bounty = Math.round(12 * ngPlusShardMult());
      addShards(bounty);
      showToast(`結晶獣を討伐した！ 結晶の欠片 +${bounty}`, 'quest');
    } else {
      showToast('結晶獣を討伐した！依頼人の元へ戻ろう', 'quest');
    }
    checkAchievements().forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
    saveGame();
  }
  currentTarget = null;
}

function flee() {
  if (!active) return;
  sfx.menuClose();
  showToast('その場を離れた', 'info');
  finishSkirmish(false);
}
