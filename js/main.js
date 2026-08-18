import { scene, camera, renderer, camFittedPos, camLookAt, mountRenderer, torchFires, bossGlow } from './scene.js';
import { player, loadPlayerModel, playerMixer, playerReady } from './player.js';
import * as EnemyModule from './enemy.js';
import { spawnEnemy } from './enemy.js';
import { updateParticles, updateShakeAndApplyCamera, triggerShake } from './effects.js';
import { resumeAudio, sfx, setMasterVolume } from './audio.js';
import { CHAPTERS } from './data.js';
import { state, saveGame, loadGame, hasSaveGame, chapterQuestsDone } from './state.js';
import { els, updateBars, log, setLoadingProgress, hideLoadingScreen, renderQuestBoard,
  renderQuestTracker, initMenu, refreshAllMenuTabs } from './ui.js';
import { setupChapterBattle, startBattlePhase, playerAction, setCombatCallbacks } from './combat.js';

mountRenderer();

/* ============================================================
   物語の進行（タイトル → ストーリー → クエスト → 戦闘 → 結果）
   ============================================================ */
function showStory(chapterIndex, prependText) {
  const chapter = CHAPTERS[chapterIndex];
  els.storyChapterTag.textContent = chapter.sanctuaryLabel;
  els.storyTitle.textContent = chapter.title;
  els.storyText.textContent = prependText ? (prependText + '\n\n―――\n\n' + chapter.storyBefore) : chapter.storyBefore;
  const doneCount = chapterQuestsDone(chapter.key);
  els.questPreview.textContent = `この聖域のクエスト: ${doneCount}/${chapter.quests.length} 達成済み`;
  setupChapterBattle(chapterIndex);
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quest-board-screen').style.display = 'none';
  els.endScreen.style.display = 'none';
  els.storyScreen.style.display = 'flex';
  saveGame();
}

function showQuestBoard(chapterIndex) {
  els.storyScreen.style.display = 'none';
  renderQuestBoard(chapterIndex, () => {
    renderQuestTracker();
    saveGame();
  });
  document.getElementById('quest-board-screen').style.display = 'flex';
}

els.storyBtn.addEventListener('click', () => {
  sfx.uiClick();
  showQuestBoard(state.chapterIndex);
});

els.qbFightBtn.addEventListener('click', () => {
  document.getElementById('quest-board-screen').style.display = 'none';
  startBattlePhase();
});

els.startBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  Object.assign(state, {
    chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0,
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], unlockedSkills: [], questProgress: {}, usedRevive: false,
  });
  showStory(0);
});

els.continueBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  loadGame();
  setMasterVolume(state.masterVolume);
  showStory(state.chapterIndex);
});

els.nextBtn.addEventListener('click', () => {
  const prevChapter = CHAPTERS[state.chapterIndex];
  els.endScreen.style.display = 'none';
  const nextIndex = state.chapterIndex + 1;
  showStory(nextIndex, prevChapter.storyAfter);
});

els.retryBtn.addEventListener('click', () => {
  const isFinalWin = els.retryBtn.textContent === 'もう一度最初から';
  els.endScreen.style.display = 'none';
  if (isFinalWin) {
    Object.assign(state, {
      chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0,
      equipment: { weapon: null, armor: null, accessory: null },
      inventory: [], unlockedSkills: [], questProgress: {}, usedRevive: false,
    });
    document.getElementById('start-screen').style.display = 'flex';
  } else {
    setupChapterBattle(state.chapterIndex);
    startBattlePhase();
  }
});

setCombatCallbacks({
  onWin: () => { saveGame(); },
  onLose: () => {},
});

/* ============================================================
   戦闘ボタン
   ============================================================ */
document.getElementById('btn-attack').addEventListener('click', () => playerAction('attack'));
document.getElementById('btn-heavy').addEventListener('click', () => playerAction('heavy'));
document.getElementById('btn-skill').addEventListener('click', () => playerAction('skill'));
document.getElementById('btn-guard').addEventListener('click', () => playerAction('guard'));
document.getElementById('btn-heal').addEventListener('click', () => playerAction('heal'));

/* ============================================================
   メニュー（ステータス／装備／スキル／所持品／設定）
   ============================================================ */
initMenu(
  () => {},
  () => {
    els.menuOverlay.classList.remove('open');
    document.getElementById('start-screen').style.display = 'flex';
    state.playing = false;
    document.getElementById('story-screen').style.display = 'none';
    document.getElementById('quest-board-screen').style.display = 'none';
    els.endScreen.style.display = 'none';
  }
);

/* ============================================================
   モデル読み込み ＆ タイトル初期化
   ============================================================ */
spawnEnemy(CHAPTERS[0].enemyDef);
state.bossHP = CHAPTERS[0].hp;
state.bossMaxHP = CHAPTERS[0].hp;
updateBars();

els.startBtn.textContent = '読み込み中...';
els.startBtn.style.opacity = '0.5';
els.startBtn.style.pointerEvents = 'none';
setLoadingProgress(0.05, '結晶データを読み込み中...');

loadPlayerModel((frac) => {
  setLoadingProgress(0.1 + frac * 0.85, `アッシュの記憶を再構築中... ${Math.round(frac * 100)}%`);
}).then(() => {
  setLoadingProgress(1, '準備完了');
  els.startBtn.textContent = '物語を始める';
  els.startBtn.style.opacity = '1';
  els.startBtn.style.pointerEvents = 'auto';
  if (hasSaveGame()) {
    els.continueBtn.style.display = 'inline-block';
  }
  setTimeout(hideLoadingScreen, 300);
});

/* ============================================================
   アイドルアニメーション & レンダリングループ
   ============================================================ */
let t = 0;
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  t += dt;

  if (playerMixer) playerMixer.update(dt);

  const boss = EnemyModule.boss;
  if (boss) {
    boss.position.y = Math.sin(t * 0.8) * 0.06;
    boss.rotation.y = (state.playing ? -0.5 : boss.rotation.y) + Math.sin(t * 0.3) * 0.05;
    bossGlow.intensity = (state.phase2 ? 5.0 : 3.2) + Math.sin(t * 2) * 0.6;
    boss.userData.eyes.forEach(e => e.material.emissiveIntensity = (state.phase2 ? 5 : 3) + Math.sin(t * 3) * 0.8);
  }

  torchFires.forEach((f, i) => {
    f.rotation.y = t * 0.6 + i;
    f.scale.setScalar(1 + Math.sin(t * 8 + i) * 0.15);
  });

  updateParticles(dt);
  updateShakeAndApplyCamera(dt, camFittedPos);
  camera.lookAt(camLookAt);

  renderer.render(scene, camera);
}
animate();
