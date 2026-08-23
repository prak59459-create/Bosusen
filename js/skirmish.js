import { state, computeStats, markFieldTargetDefeated, saveGame } from './state.js';
import { updateBars, showToast } from './ui.js';
import { sfx } from './audio.js';
import { spawnParticles, spawnShockwave, rumble, triggerCritFlash } from './effects.js';

/* ============================================================
   フィールド討伐目標との小規模スキルミッシュ(即死ではなく実際に
   数回打ち合う簡易戦闘)
   ============================================================ */
let active = false;
let enemyHP = 0, enemyMaxHP = 0;
let currentTarget = null;
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

export function startSkirmish(target) {
  if (active) return;
  active = true;
  currentTarget = target;
  enemyMaxHP = target.hp || 30;
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

  const retaliation = Math.round(4 + Math.random() * 6);
  const reduced = Math.max(1, Math.round(retaliation * (100 / (100 + stats.def))));
  state.playerHP = Math.max(1, state.playerHP - reduced);
  rumble(0.3, 150);
  updateBars();
  els.log.textContent = `${dmg}のダメージを与えた！${crit ? '（クリティカル！）' : ''} 反撃で${reduced}のダメージを受けた`;
}

function finishSkirmish(won) {
  active = false;
  els.panel.style.display = 'none';
  if (currentTarget && currentTarget.mesh) currentTarget.mesh.scale.setScalar(1);
  if (won && currentTarget) {
    markFieldTargetDefeated(currentTarget.questId);
    currentTarget.material.emissiveIntensity = 0.1;
    currentTarget.light.intensity = 0.2;
    if (currentTarget.beam) currentTarget.beam.visible = false;
    sfx.questDone();
    if (currentTarget.mesh) spawnShockwave(currentTarget.mesh.getWorldPosition(currentTarget.mesh.position.clone()), 0xff6644);
    rumble(0.6, 350);
    showToast('結晶獣を討伐した！依頼人の元へ戻ろう', 'quest');
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
