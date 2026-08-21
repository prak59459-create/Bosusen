/* ============================================================
   AETHERIA: ECHOES OF THE VOID — ゲームコンテンツ定義
   ============================================================ */

export const CHAPTERS = [
  {
    key: 'castle',
    sanctuaryLabel: '聖域 I',
    title: '崩壊の古城',
    enemyName: '軋みの番人',
    storyBefore:
      '目覚めたアッシュは、崩れ落ちる古城の地下から地上へと這い出た。\n' +
      '「……ここは、聖域の中でも一番浅い場所ね。まずは足慣らしよ」\n' +
      '宙に浮くランタンを携えた精霊イリスが、静かに寄り添う。\n\n' +
      'かつて城を守っていたはずの騎士像は、いまや結晶病に蝕まれ、\n' +
      '「軋みの番人」と化して回廊を彷徨っている。\n\n' +
      '「思い出せなくても、剣の振り方は覚えている……行こう」',
    storyAfter:
      '崩れ落ちる番人の残骸から、淡い光を放つ結晶の欠片がこぼれた。\n' +
      '『……この程度、序の口ですよ。次は「結晶の森」――もっと深い場所に、\n' +
      'プライム・コアの共鳴が眠っています』\n' +
      'イリスの声に導かれ、アッシュは崩れた城壁の先へと踏み出す。',
    hp: 130,
    hasPhases: false,
    xp: 60,
    shardsBase: 30,
    enemyDef: { skinColor:0x2d5a3d, sheenColor:0x1a3322, emissive:0x0a1f0f, hornColor:0x1a2a1a, eyeColor:0x66ff88, legColor:0x162616, scale:0.85 },
    movesPhase1: [
      { name:'錆びた斬撃', sub:'鈍く重い一撃', min:4, max:8, dodgeWindow:950 },
      { name:'瓦礫の投擲', sub:'崩れた石の礫', min:7, max:13, dodgeWindow:1000 },
      { name:'守護の怒り', sub:'渾身の突進！', min:12, max:18, dodgeWindow:800 },
    ],
    quests: [
      { id:'c1_shard', title:'欠片の回収', type:'explore',
        desc:'回廊に散らばる結晶の欠片を集める。',
        result:'崩れた祭壇の下から、淡く光る欠片を見つけた。',
        reward:{ shards:25 } },
      { id:'c1_skirmish', title:'小型結晶獣の掃討', type:'battle',
        desc:'徘徊する小型の結晶獣を退ける。',
        result:'ネズミ大の結晶獣たちは、一撃であっけなく砕け散った。',
        reward:{ shards:20, itemId:'sword_rusty' } },
      { id:'c1_lore', title:'古い記録を読む', type:'lore',
        desc:'崩れた書庫に残る記録を確認する。',
        result:'『……エーテル採掘、限界深度を突破。空間に亀裂の兆候あり』\n古びた日誌の一節に、かすかな既視感を覚える。',
        reward:{ shards:15 } },
    ],
  },
  {
    key: 'forest',
    sanctuaryLabel: '聖域 II',
    title: '結晶の森',
    enemyName: '棘毒のドライアス',
    storyBefore:
      '木々までもが結晶化した森。触れれば切れそうな枝葉が、\n' +
      '青白い光を弱々しく明滅させている。\n' +
      '「この森はかつて、生命そのものを司る守護霊の住処でした」\n\n' +
      '森の最奥、ひときわ大きな結晶の樹の下に、それはいた。\n' +
      '棘だらけの蔦をまとった、かつての森の守り手――「棘毒のドライアス」。\n\n' +
      '「安らかに眠ってくれ。……お前の苦しみごと、断ち切る」',
    storyAfter:
      '崩れゆく蔦の隙間から、ドライアスの最後の想いが漏れ聞こえた。\n' +
      '『……ヴォイドの核は、この星が生まれる前から在った……』\n' +
      '『お前の右腕……それは、最初のヴォイドの、欠片そのものだ……』\n' +
      'アッシュは無意識に右腕を押さえる。イリスの表情が、初めて曇った。',
    hp: 190,
    hasPhases: false,
    xp: 90,
    shardsBase: 40,
    enemyDef: { skinColor:0x1f6b3a, sheenColor:0x123322, emissive:0x0a2a12, hornColor:0x0c1f10, eyeColor:0xaaff33, legColor:0x143018, metalness:0.15, roughness:0.5, clearcoat:0.4, scale:1.05 },
    movesPhase1: [
      { name:'棘蔦の鞭', sub:'絡みつく一撃', min:8, max:14, dodgeWindow:900 },
      { name:'毒胞子の爆散', sub:'広範囲の毒撃', min:13, max:20, dodgeWindow:850 },
      { name:'大樹の怒り', sub:'渾身の一撃！', min:20, max:28, dodgeWindow:700 },
    ],
    quests: [
      { id:'c2_shard', title:'発光する種子の採取', type:'explore',
        desc:'森に落ちた結晶化した種子を集める。',
        result:'苔むした根元から、淡く発光する種子を三つ見つけた。',
        reward:{ shards:30 } },
      { id:'c2_skirmish', title:'寄生結晶の駆除', type:'battle',
        desc:'木々に取り憑いた寄生型の結晶獣を排除する。',
        result:'寄生していた小さな結晶塊は、剣の一閃で崩れ去った。',
        reward:{ shards:25, itemId:'armor_bark' } },
      { id:'c2_lore', title:'刻まれた祈りの跡', type:'lore',
        desc:'古木の幹に刻まれた祈祷文を読み解く。',
        result:'『どうか、この森だけは……』読みかけの祈りは、そこで途切れていた。',
        reward:{ shards:20 } },
    ],
  },
  {
    key: 'undercity',
    sanctuaryLabel: '聖域 III',
    title: '浸食された地下都市',
    enemyName: '反響するアーカイヴィスト',
    storyBefore:
      '地下深く沈んだ旧都。水没した図書館には、いまも記録者の残響が漂う。\n' +
      '「彼女はかつて、この都市の“知”を司る守護霊でした。\n' +
      '　いまは狂った歌のような呪詛を紡ぐだけの存在に……」\n\n' +
      '詠唱者アーカイヴィストの歌が、静寂の水面に反響する。\n\n' +
      '「その歌を、私が終わらせよう」',
    storyAfter:
      'アーカイヴィストの最後の詩が、静寂の中に溶けていく。\n' +
      '『……あなたの名は、本当は「アッシュ」ではない……』\n' +
      '『あなたは、この星で最初にヴォイドと同化した“観測者”そのもの……』\n' +
      '『そして今のあなたは……その“観測者”が遺した、ただの残響（エコー）……』\n' +
      'イリスが何かを言おうとして、言葉を飲み込んだ。最後の聖域が、目の前に迫る。',
    hp: 230,
    hasPhases: false,
    xp: 130,
    shardsBase: 55,
    enemyDef: { skinColor:0x4a1f7a, sheenColor:0x2a0f4a, emissive:0x1a0530, hornColor:0x120620, eyeColor:0x9955ff, legColor:0x22103a, scale:0.95 },
    movesPhase1: [
      { name:'呪縛の光弾', sub:'魔力の弾丸', min:9, max:15, dodgeWindow:850 },
      { name:'反響する詠唱', sub:'広範囲の呪詛', min:15, max:22, dodgeWindow:800 },
      { name:'狂詩曲', sub:'渾身の魔弾！', min:22, max:30, dodgeWindow:650 },
    ],
    quests: [
      { id:'c3_shard', title:'水没した書架の捜索', type:'explore',
        desc:'水底に沈んだ書架から欠片を回収する。',
        result:'水に沈んだ書架の奥、割れた結晶の欠片を回収した。',
        reward:{ shards:35 } },
      { id:'c3_skirmish', title:'徘徊する残響体の掃討', type:'battle',
        desc:'図書館を彷徨う小さな残響体を鎮める。',
        result:'残響体はか細い悲鳴を上げて、光の粒となって消えた。',
        reward:{ shards:30, itemId:'accessory_lens' } },
      { id:'c3_lore', title:'観測者の手記', type:'lore',
        desc:'アーカイヴィストが遺した手記を読む。',
        result:'『……私は、視てしまった。世界の外側にあるものを』\n手記の文字が、あなたの筆跡とよく似ていることに気づく。',
        reward:{ shards:25 } },
    ],
  },
  {
    key: 'voidtower',
    sanctuaryLabel: '聖域 IV',
    title: '虚無の塔・プライム・コア',
    enemyName: 'ヴォイド・エコー',
    storyBefore:
      '世界の中心、崩落する尖塔の頂で、それは待っていた。\n' +
      '巨大な影と化した、もう一人の「アッシュ」――ヴォイドと同化した“最初の観測者”の残響。\n' +
      '「あなたは、あなた自身と戦うことになる」とイリスが静かに告げる。\n\n' +
      '「……それでも。今のこの手で、決着をつける」',
    storyAfter: null,
    hp: 320,
    hasPhases: true,
    xp: 220,
    shardsBase: 90,
    enemyDef: { skinColor:0x5c2436, sheenColor:0x552211, emissive:0x220000, hornColor:0x141414, eyeColor:0xff0000, legColor:0x220d13, scale:1.0 },
    movesPhase1: [
      { name:'虚無の爪', sub:'素早い一撃', min:6, max:11, dodgeWindow:900 },
      { name:'崩落の一撃', sub:'大振りな一撃', min:11, max:19, dodgeWindow:1100 },
      { name:'残響の衝撃波', sub:'重い攻撃！', min:20, max:30, dodgeWindow:750 },
    ],
    movesPhase2: [
      { name:'連鎖する残響', sub:'高速の連続攻撃', min:10, max:16, dodgeWindow:650 },
      { name:'虚無のブレス', sub:'広範囲侵蝕攻撃！', min:18, max:28, dodgeWindow:800 },
      { name:'すべての終わり', sub:'覚醒の全力攻撃！！', min:28, max:42, dodgeWindow:600 },
    ],
    quests: [
      { id:'c4_shard', title:'塔に残る最後の欠片', type:'explore',
        desc:'崩落する塔の中で、最後の欠片を探す。',
        result:'崩れゆく塔の破片の中に、ひときわ強く輝く欠片と、虚無を退ける鎧を見つけた。',
        reward:{ shards:40, itemId:'armor_voidguard' } },
      { id:'c4_skirmish', title:'残響の先兵を退ける', type:'battle',
        desc:'コアを守る先兵たちと交戦する。',
        result:'先兵たちは、あなたの覚悟を前にあっけなく崩れ去った。',
        reward:{ shards:35, itemId:'accessory_core_shard' } },
      { id:'c4_lore', title:'イリスの過去', type:'lore',
        desc:'イリスに、彼女自身のことを尋ねる。',
        result:'『……私はずっと昔、あなたの――観測者の相棒だった精霊なんです』\nイリスは初めて、寂しそうに微笑んだ。',
        reward:{ shards:30 } },
    ],
    endings: [
      {
        id: 'seal',
        title: '静寂の選択 ―― コアを封じる',
        requiredShards: 0,
        text:
          'アッシュは自らの右腕をコアに捧げ、静かにその身を封として捧げた。\n' +
          '『……ありがとう、アッシュ。あなたの犠牲は、忘れません』\n\n' +
          '世界はゆっくりと安定を取り戻す。だが、アッシュの姿はもう、どこにもない。\n' +
          'イリスはただ一人、静まり返った尖塔の頂で、いつまでも光を灯し続けた。',
      },
      {
        id: 'destroy',
        title: '解放の選択 ―― コアを破壊する',
        requiredShards: 0,
        text:
          'アッシュはコアそのものを打ち砕いた。エーテルの奔流が消え、\n' +
          '世界から「魔法」は失われたが、ヴォイドの侵蝕も同時に止まった。\n\n' +
          '結晶病はゆっくりと癒えていき、人々は平凡だが確かな未来を歩み始める。\n' +
          '『……これでいいんです、きっと』アッシュの隣で、イリスの光がふっと和らいだ。',
      },
      {
        id: 'harmonize',
        title: '調和の選択 ―― 響き合う世界（真エンディング）',
        requiredShards: 200,
        text:
          '聖域を巡る旅で集めた無数の結晶の欠片が、アッシュとコアの間に\n' +
          '新しい共鳴を生み出す。犠牲ではなく、対話による調和。\n\n' +
          '『世界も、あなたも――両方とも救う方法が、ちゃんとありました』\n' +
          'イリスの声が涙混じりに響く。アッシュの右腕の結晶は、静かに淡い光へと変わっていった。\n' +
          '世界は色を取り戻し、アッシュもまた、自分自身の物語を歩き続ける――。',
      },
    ],
  },
];

export function levelStatsFor(level) {
  return {
    maxHP: 100 + (level-1)*25,
    maxMP: 50 + (level-1)*10,
    maxStam: 100 + (level-1)*10,
    dmgMult: 1 + (level-1)*0.07,
  };
}

/* ---------- アイテム定義 ---------- */
export const ITEMS = {
  sword_rusty:        { id:'sword_rusty', slot:'weapon', name:'錆びた古城の剣', atk:4, desc:'かつての騎士が振るっていた剣。刃こぼれしているが芯は生きている。' },
  sword_thornblade:    { id:'sword_thornblade', slot:'weapon', name:'棘の大剣', atk:9, desc:'ドライアスの棘を鍛え直した大剣。振るうたびに微かに発光する。' },
  sword_echo:          { id:'sword_echo', slot:'weapon', name:'残響の刃', atk:15, desc:'観測者の記憶が宿るという、不思議な質感の刃。' },
  armor_bark:          { id:'armor_bark', slot:'armor', name:'樹皮の胸当て', def:6, desc:'結晶化した樹皮を鍛えた軽量な防具。' },
  armor_archive:       { id:'armor_archive', slot:'armor', name:'記録者のローブ', def:10, hp:15, desc:'知識を守るように編まれた、不思議と頑丈なローブ。' },
  armor_voidguard:     { id:'armor_voidguard', slot:'armor', name:'虚無守りの鎧', def:16, hp:25, desc:'ヴォイドの侵蝕そのものを僅かに退ける、最後の聖域で得られる鎧。' },
  accessory_lens:      { id:'accessory_lens', slot:'accessory', name:'観測者のレンズ', crit:6, desc:'かけると、かすかに敵の弱点が見える気がする片眼鏡。' },
  accessory_core_shard: { id:'accessory_core_shard', slot:'accessory', name:'コアの欠片', mp:15, crit:4, desc:'プライム・コアからこぼれ落ちた、温かい光を放つ欠片。' },
  sword_traveler:      { id:'sword_traveler', slot:'weapon', name:'旅商人の片刃', atk:6, crit:3, desc:'行商人が護身用に扱っていた軽量な片刃剣。振りが速い。' },
  armor_wanderer:      { id:'armor_wanderer', slot:'armor', name:'旅人のマント', def:4, hp:10, desc:'各地を巡った行商人が譲ってくれた、丈夫な旅装束。' },
  accessory_charm:     { id:'accessory_charm', slot:'accessory', name:'小さな護符', hp:12, mp:8, desc:'旅の安全を願って作られた素朴な護符。じんわりと力が湧く。' },
  sword_primecore:     { id:'sword_primecore', slot:'weapon', name:'プライムコアの聖剣', atk:22, crit:6, desc:'プライム・コアの結晶を鍛え上げた、最果ての剣。持つ者を選ぶ。' },
  armor_eternal:       { id:'armor_eternal', slot:'armor', name:'永劫の鎧', def:22, hp:35, desc:'幾多の結晶病を退けてきたという伝説の鎧。時を超えて輝く。' },
  accessory_starlight: { id:'accessory_starlight', slot:'accessory', name:'星霜の結晶', mp:25, crit:8, hp:15, desc:'星々の記憶を宿すという、最も澄んだ結晶。' },
  accessory_legend:    { id:'accessory_legend', slot:'accessory', name:'伝説の証', atk:8, def:8, crit:10, hp:20, mp:15, desc:'エーテリアの伝説を成し遂げた者だけが持つことを許される、至高の証。' },
};

/* ---------- スキルツリー定義 ---------- */
export const SKILLS = [
  { id:'atk_up',    name:'力の目覚め',       cost:30, desc:'攻撃力が+10%される。', effect:{ atkPct:0.10 } },
  { id:'def_up',    name:'鉄壁の心得',       cost:30, desc:'防御力が+15%される。', effect:{ defPct:0.15 } },
  { id:'mp_up',     name:'深奥の共鳴',       cost:30, desc:'最大エーテルが+20される。', effect:{ mp:20 } },
  { id:'crit_up',   name:'会心の一撃',       cost:40, desc:'クリティカル率が+10%される。', effect:{ crit:10 } },
  { id:'crit_dmg_up', name:'会心の極意',     cost:55, desc:'クリティカルダメージ倍率が+25%される。', effect:{ critDmgPct:0.25 } },
  { id:'dodge_up',  name:'疾風の反射神経',   cost:40, desc:'ガード／パリィの受付時間が+15%長くなる。', effect:{ dodgeWindowPct:0.15 } },
  { id:'parry_up',  name:'パリィの極意',     cost:50, desc:'パリィ成功時の反撃ダメージが+50%される。', effect:{ parryBonusPct:0.5 } },
  { id:'heal_up',   name:'癒しの心得',       cost:35, desc:'回復技のHP回復量が+40%される。', effect:{ healBonusPct:0.4 } },
  { id:'stam_up',   name:'省エネの型',       cost:35, desc:'攻撃／強攻撃のスタミナ消費が-20%される。', effect:{ staminaCostPct:-0.2 } },
  { id:'heal_extra', name:'秘薬の心得',      cost:45, desc:'戦闘開始時の回復回数が+1される。', effect:{ healUsesBonus:1 } },
  { id:'shard_up',   name:'結晶感応',        cost:40, desc:'結晶獣撃破時の結晶の欠片獲得量が+20%される。', effect:{ shardPct:0.2 } },
  { id:'guard_reflect', name:'反射の盾',      cost:45, desc:'ガード成功時、被ダメージの30%を結晶獣に反射する。', effect:{ guardReflectPct:0.3 } },
  { id:'mp_regen_up', name:'エーテル還流',    cost:40, desc:'毎ターンのエーテル自然回復量が+4される。', effect:{ mpRegenBonus:4 } },
  { id:'stam_max_up', name:'鍛え抜かれた肉体', cost:35, desc:'最大スタミナが+25される。', effect:{ staminaMaxBonus:25 } },
  { id:'heavy_accuracy', name:'確実なる一撃', cost:35, desc:'強攻撃の失敗率が半分になる。', effect:{ heavyAccuracyPct:0.5 } },
  { id:'parry_mp',     name:'反撃の共鳴',     cost:35, desc:'ジャストガード成功時にエーテルを15回復する。', effect:{ parryMpRestore:15 } },
  { id:'revive',    name:'蘇生の残光',       cost:80, desc:'戦闘不能になったとき、一度だけHP30%で復活する。', effect:{ revive:true } },
  { id:'revive_up', name:'蘇生の輝き',       cost:60, desc:'蘇生時の復活HPが+20%される（要：蘇生の残光）。', effect:{ reviveHpPct:0.2 } },
];

export const BOSS_TAUNTS = [
  '「……侵入者か。この地に眠るものを暴くつもりか」',
  '「エーテルの匂いがする。お前もいずれ結晶に還る」',
  '「無駄なことを。虚無はすべてを飲み込む」',
  '「その剣で、私を止められるとでも？」',
  '「記憶など、この地では何の意味も持たない」',
];

export const ACHIEVEMENTS = [
  { id:'first_boss',   name:'初陣の証',       desc:'結晶獣を初めて撃破する。', reward:20 },
  { id:'boss_master',  name:'結晶獣狩り',     desc:'結晶獣を4体撃破する。', reward:50 },
  { id:'boss_slayer',  name:'結晶獣の天敵',   desc:'結晶獣を累計10体撃破する。', reward:60 },
  { id:'combo_10',     name:'連撃の達人',     desc:'コンボを10以上つなげる。', reward:20 },
  { id:'combo_20',     name:'無双の剣',       desc:'コンボを20以上つなげる。', reward:40 },
  { id:'treasure_hunter', name:'秘宝の探求者', desc:'すべての結晶の秘宝を発見する。', reward:60 },
  { id:'shard_rich',   name:'結晶長者',       desc:'結晶の欠片を累計300獲得する。', reward:30 },
  { id:'shard_tycoon', name:'結晶王',         desc:'結晶の欠片を累計1000獲得する。', reward:70 },
  { id:'rank_s',       name:'完璧なる一撃',   desc:'結晶獣戦で評価ランクSを獲得する。', reward:40 },
  { id:'completionist', name:'エーテリアの伝説', desc:'他のすべての実績を解除する。', reward:100 },
  { id:'ng_plus',      name:'周回の覚悟',     desc:'装備を引き継いで周回+に挑む。', reward:30 },
  { id:'collector',    name:'蒐集家',         desc:'商店の武具をすべて購入する。', reward:50 },
  { id:'skill_master', name:'結晶技の極致',   desc:'すべての結晶技スキルを習得する。', reward:60 },
  { id:'hard_clear',   name:'不屈の意志',     desc:'難易度「難しい」で結晶獣を撃破する。', reward:50 },
  { id:'flawless',     name:'無傷の勝利',     desc:'被ダメージ0で結晶獣を撃破する。', reward:45 },
  { id:'week_streak',  name:'旅の常連',       desc:'7日連続でログインする。', reward:40 },
  { id:'no_heal',      name:'自信の証',       desc:'回復を一度も使わずに結晶獣を撃破する。', reward:35 },
  { id:'no_guard',     name:'不屈の攻勢',     desc:'一度もガードせずに結晶獣を撃破する。', reward:40 },
  { id:'combo_30',     name:'刃の舞踏者',     desc:'コンボを30以上つなげる。', reward:55 },
  { id:'veteran_hunter', name:'手練れの討伐者', desc:'同じ結晶獣を5回撃破する。', reward:45 },
  { id:'win_streak_3', name:'連勝の炎',       desc:'結晶獣戦に3連勝する。', reward:35 },
  { id:'win_streak_5', name:'不敗の英雄',     desc:'結晶獣戦に5連勝する。', reward:60 },
  { id:'combo_50',     name:'虚無を斬る者',   desc:'コンボを50以上つなげる。', reward:80 },
  { id:'wanderer',     name:'放浪者',         desc:'累計10,000m以上を踏破する。', reward:35 },
  { id:'pilgrim',      name:'大陸の巡礼者',   desc:'累計50,000m以上を踏破する。', reward:60 },
];
