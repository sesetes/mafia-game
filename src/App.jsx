import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, query, where, getDocs, updateDoc, doc, onSnapshot, arrayUnion, deleteField } from 'firebase/firestore'
import { db } from './firebase'
import './App.css'

function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [inRoom, setInRoom] = useState(false);
  const [roomDocId, setRoomDocId] = useState('');
  
  const [phase, setPhase] = useState('waiting'); 
  const [myRole, setMyRole] = useState('');
  const [allRoles, setAllRoles] = useState({});
  const [alivePlayers, setAlivePlayers] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [sacrificeTarget, setSacrificeTarget] = useState(''); 
  const [nightLog, setNightLog] = useState('');
  const [investigateResult, setInvestigateResult] = useState('');
  const [votes, setVotes] = useState({});
  const [winner, setWinner] = useState('');
  const [actedPlayers, setActedPlayers] = useState([]); 
  const [defendingPlayer, setDefendingPlayer] = useState('');
  const [nightCount, setNightCount] = useState(0); 
  const [targetTime, setTargetTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [handcuffed, setHandcuffed] = useState('');

  const [globalChat, setGlobalChat] = useState([]);
  const [mafiaChat, setMafiaChat] = useState([]);
  const [globalMsg, setGlobalMsg] = useState('');
  const [mafiaMsg, setMafiaMsg] = useState('');
  
  const [wills, setWills] = useState({});
  const [recentlyDead, setRecentlyDead] = useState('');
  const [myWill, setMyWill] = useState('');
  const [isWillSaved, setIsWillSaved] = useState(false);
  const [willSkippers, setWillSkippers] = useState([]);
  const [citizenOrder, setCitizenOrder] = useState([]); 
  
  const [showAdvice, setShowAdvice] = useState(false);
  const [menuView, setMenuView] = useState('home');

  const [localMute, setLocalMute] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [gameSettings, setGameSettings] = useState({
    votingTime: 600, 
    defenseTime: 30, 
    nightTime: 60,   
    willTime: 30,    
    enableWill: true,
    enableMusic: true
  });
  const [tempSettings, setTempSettings] = useState({}); 

  const globalChatRef = useRef(null);
  const mafiaChatRef = useRef(null);

  const nightSound = useRef(new Audio('/night.mp3'));
  const daySound = useRef(new Audio('/day.mp3')); 
  const defenseSound = useRef(new Audio('/defense.mp3'));
  const gunSound = useRef(new Audio('/gun.mp3'));
  const ambulanceSound = useRef(new Audio('/ambulance.mp3'));
  const flipSound = useRef(new Audio('/flip.mp3'));
  const votingSound = useRef(new Audio('/voting.mp3')); 

  useEffect(() => {
    const savedSession = sessionStorage.getItem('mafiaGameSession');
    if (savedSession) {
      const data = JSON.parse(savedSession);
      setPlayerName(data.playerName);
      setRoomId(data.roomId);
      setRoomDocId(data.roomDocId);
      setInRoom(true);
    }
  }, []);

  const leaveRoom = () => {
    if (window.confirm("هل أنت متأكد أنك تريد الخروج من الغرفة؟")) {
      sessionStorage.removeItem('mafiaGameSession');
      window.location.reload(); 
    }
  };

  const kickPlayer = async (targetPlayer) => {
    if (!window.confirm(`هل تريد طرد ${targetPlayer} من الغرفة؟`)) return;
    const docSnap = await getDocs(query(collection(db, "rooms"), where("roomCode", "==", roomId)));
    let data; docSnap.forEach(d => data = d.data());
    await updateDoc(doc(db, "rooms", roomDocId), {
      players: data.players.filter(p => p !== targetPlayer),
      alive: data.alive.filter(p => p !== targetPlayer)
    });
  };

  useEffect(() => {
    const isMuted = localMute || gameSettings?.enableMusic === false;
    nightSound.current.loop = true; nightSound.current.volume = 0.6; nightSound.current.muted = isMuted;
    daySound.current.loop = true; daySound.current.volume = 0.4; daySound.current.muted = isMuted;
    defenseSound.current.loop = true; defenseSound.current.volume = 0.5; defenseSound.current.muted = isMuted;
    votingSound.current.loop = true; votingSound.current.volume = 0.4; votingSound.current.muted = isMuted;
    gunSound.current.muted = isMuted; ambulanceSound.current.muted = isMuted; flipSound.current.muted = isMuted;
  }, [localMute, gameSettings?.enableMusic]);

  const unlockAudio = () => {
    [nightSound.current, daySound.current, defenseSound.current, flipSound.current, votingSound.current].forEach(a => a.play().then(()=>a.pause()).catch(()=>{}));
  };

  useEffect(() => {
    nightSound.current.pause(); daySound.current.pause(); defenseSound.current.pause(); votingSound.current.pause();
    if (phase === 'night') {
      nightSound.current.play().catch(()=>{});
      setTimeout(() => gunSound.current.play().catch(()=>{}), 20000);
      setTimeout(() => ambulanceSound.current.play().catch(()=>{}), 25000);
    } else if (phase === 'day_result') {
      daySound.current.play().catch(()=>{});
    } else if (phase === 'voting') {
      votingSound.current.play().catch(()=>{});
    } else if (phase === 'defense') {
      defenseSound.current.play().catch(()=>{});
    } else if (phase === 'role_reveal') {
      setTimeout(() => {
        flipSound.current.play().catch(()=>{});
        setShowAdvice(true);
      }, 1000);
    } else {
      setShowAdvice(false);
    }
  }, [phase]);

  const hasActed = actedPlayers.includes(playerName);
  const isAlive = alivePlayers.includes(playerName);
  const hasVoted = votes[playerName] !== undefined;
  const myVoteTarget = votes[playerName];

  const createRoom = async () => {
    if (!playerName) return alert("اكتب اسمك!");
    unlockAudio();
    try {
      const randomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
      const defaultSettings = { votingTime: 600, defenseTime: 30, nightTime: 60, willTime: 30, enableWill: true, enableMusic: true };
      const docRef = await addDoc(collection(db, "rooms"), {
        roomCode: randomCode, phase: "waiting", players: [playerName], alive: [playerName],
        roles: {}, nightActions: { mafia: '', doctor: '', detective: '', police: '' }, votes: {},
        nightLog: '', winner: '', targetTime: 0, actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 0, 
        wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [], handcuffed: '', citizenOrder: [],
        settings: defaultSettings
      });
      setRoomId(randomCode); setRoomDocId(docRef.id); setInRoom(true);
      sessionStorage.setItem('mafiaGameSession', JSON.stringify({ playerName, roomId: randomCode, roomDocId: docRef.id }));
    } catch (error) { alert("خطأ بالإنشاء."); }
  }

  const joinRoom = async () => {
    if (!playerName || !joinCode) return alert("اكتب اسمك وكود الغرفة!");
    unlockAudio();
    try {
      const q = query(collection(db, "rooms"), where("roomCode", "==", joinCode));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return alert("الغرفة غير موجودة!");
      let roomData = null; let docId = '';
      querySnapshot.forEach((d) => { roomData = d.data(); docId = d.id; });
      if (roomData.players.includes(playerName)) return alert("الاسم موجود مسبقاً!");
      setRoomDocId(docId);
      await updateDoc(doc(db, "rooms", docId), { players: arrayUnion(playerName), alive: arrayUnion(playerName) });
      setRoomId(joinCode); setInRoom(true);
      sessionStorage.setItem('mafiaGameSession', JSON.stringify({ playerName, roomId: joinCode, roomDocId: docId }));
    } catch (error) { alert("خطأ بالانضمام!"); }
  }

  const openSettingsModal = () => {
    setTempSettings(gameSettings);
    setShowSettingsModal(true);
  };

  const saveRoomSettings = async () => {
    await updateDoc(doc(db, "rooms", roomDocId), { settings: tempSettings });
    setShowSettingsModal(false);
  };

  const startGame = async () => {
    if (players.length < 3) return alert("يحتاج 3 لاعبين!");
    let shuffled = [...players].sort(() => Math.random() - 0.5);
    const rolesList = players.length >= 8 ? ['مافيا', 'مافيا', 'طبيب', 'محقق', 'شرطي'] : ['مافيا', 'طبيب', 'محقق', 'شرطي'];
    let assigned = {};
    let citizens = [];
    shuffled.forEach((p, idx) => { 
      let role = idx < rolesList.length ? rolesList[idx] : 'مواطن';
      assigned[p] = role;
      if (role === 'مواطن') citizens.push(p);
    });
    
    await updateDoc(doc(db, "rooms", roomDocId), { 
      phase: gameSettings.enableWill === false ? "role_reveal" : "write_will", 
      roles: assigned, alive: players, nightActions: { mafia: '', doctor: '', detective: '', police: '' }, 
      votes: {}, targetTime: gameSettings.enableWill === false ? Date.now() + 12000 : Date.now() + ((gameSettings.willTime || 30) * 1000), 
      actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 0, 
      wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [], handcuffed: '', citizenOrder: citizens 
    });
  }

  const restartGame = async () => {
    await updateDoc(doc(db, "rooms", roomDocId), { phase: "waiting", alive: players, roles: {}, nightActions: { mafia: '', doctor: '', detective: '', police: '' }, votes: {}, nightLog: '', winner: '', targetTime: 0, actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 0, wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [], handcuffed: '', citizenOrder: [] });
  }

  const saveWill = async (type = 'normal') => {
    const finalWill = type === 'skip' ? 'لا توجد وصية...' : (myWill.trim() || 'لا توجد وصية...');
    await updateDoc(doc(db, "rooms", roomDocId), { [`wills.${playerName}`]: finalWill });
    setIsWillSaved(true);
  }

  const skipWillReading = async () => {
    if (!willSkippers.includes(playerName)) {
      await updateDoc(doc(db, "rooms", roomDocId), { willSkippers: arrayUnion(playerName) });
    }
  }

  const triggerNight = async (docId, currentCount, settings) => {
    await updateDoc(doc(db, "rooms", docId), { 
      phase: 'night', 
      targetTime: Date.now() + ((settings?.nightTime || 60) * 1000), 
      actedPlayers: [], 
      nightCount: currentCount + 1, 
      nightActions: { mafia: '', doctor: '', detective: '', police: '' },
      handcuffed: '' 
    });
  }

  const triggerVoting = async (docId, settings) => { 
    await updateDoc(doc(db, "rooms", docId), { 
      phase: 'voting', 
      targetTime: Date.now() + ((settings?.votingTime || 600) * 1000), 
      votes: {} 
    }); 
  }

  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const checkWin = (currentAlive, roles, initialCount) => {
    const mafias = currentAlive.filter(p => roles[p] === 'مافيا');
    const citizens = currentAlive.filter(p => roles[p] !== 'مافيا');
    if (mafias.length === 0) return 'المواطنين 😇';
    if (initialCount >= 7) {
      if (citizens.length <= 2 && mafias.length > 0) return `المافيا 🦹‍♂️ (${Object.keys(roles).filter(p => roles[p] === 'مافيا').join(' ، ')})`;
    } else {
      if (citizens.length <= 1 && mafias.length > 0) return `المافيا 🦹‍♂️ (${Object.keys(roles).filter(p => roles[p] === 'مافيا').join(' ، ')})`;
    }
    if (mafias.length >= citizens.length) return `المافيا 🦹‍♂️ (${Object.keys(roles).filter(p => roles[p] === 'مافيا').join(' ، ')})`;
    return null;
  }

  const performNightResolution = async (docId, data) => {
    const { mafia, doctor, detective, police } = data.nightActions;
    let newAlive = [...data.alive]; 
    let news = [];
    let counter = 1;
    let deadPlayer = '';
    let handcuffedPlayer = (police && police !== 'skip') ? police : '';

    const isPoliceAlive = data.alive.some(p => data.roles[p] === 'شرطي');
    const isMafiaAlive = data.alive.some(p => data.roles[p] === 'مافيا');
    const isDoctorAlive = data.alive.some(p => data.roles[p] === 'طبيب');
    const isDetectiveAlive = data.alive.some(p => data.roles[p] === 'محقق');

    const policePlayerName = Object.keys(data.roles).find(k => data.roles[k] === 'شرطي');

    const isMafiaTargetingPolice = mafia && mafia !== 'skip' && data.roles[mafia] === 'شرطي';
    const isPoliceTargetingMafia = handcuffedPlayer && data.roles[handcuffedPlayer] === 'مافيا';
    
    const isMafiaBlocked = isMafiaAlive && data.alive.filter(p => data.roles[p] === 'مافيا').includes(handcuffedPlayer) && !(isMafiaTargetingPolice && isPoliceTargetingMafia);
    const isDoctorBlocked = isDoctorAlive && data.alive.filter(p => data.roles[p] === 'طبيب').includes(handcuffedPlayer);
    const isDetectiveBlocked = isDetectiveAlive && data.alive.filter(p => data.roles[p] === 'محقق').includes(handcuffedPlayer);

    let someoneDied = false;
    if (isMafiaAlive && !isMafiaBlocked && mafia && mafia !== 'skip') {
      if (mafia === doctor && !isDoctorBlocked) {
        // تم إنقاذه
      } else {
        deadPlayer = mafia;
        someoneDied = true;
        newAlive = newAlive.filter(p => p !== mafia);
      }
    }

    let finalHandcuffed = handcuffedPlayer;
    if (deadPlayer === policePlayerName && handcuffedPlayer) {
       finalHandcuffed = ''; 
    }

    if (isPoliceAlive) {
      if (handcuffedPlayer) {
        if (deadPlayer === policePlayerName) {
          news.push(`${counter++}. 🚨 ${pickRandom([
            "عُثر على أصفاد مكسورة في أحد الأزقة... مجرمٌ كان على وشك الاعتقال لكنه لاذ بالفرار لسبب غامض!",
            "محاولة اعتقال فاشلة انتهت بهروب المشتبه به في ظروف غامضة!",
            "تشير الأدلة إلى أن الشرطة كانت قريبة جداً من الإيقاع بشخص ما، لكنه اختفى فجأة ونجا من التقييد."
          ])}`);
        } else {
          news.push(`${counter++}. 🚨 الشرطة داهمت مقر (${handcuffedPlayer}) وقامت بتقييد حركته تماماً الليلة.`);
        }
      } else {
        news.push(`${counter++}. 👮‍♂️ الشرطة كانت في دورية ولم تعتقل أحداً.`);
      }
    }

    if (isMafiaAlive) {
      if (isMafiaBlocked || !mafia || mafia === 'skip') {
        news.push(`${counter++}. 🦹‍♂️ ${pickRandom([
          "المافيا تتريث ولا تتحرك في ظلام الليلة.",
          "خيم الهدوء المريب على المدينة، ولم تنفذ المافيا أي عملية اغتيال الليلة.",
          "نجت المدينة من شر المافيا هذه الليلة، لسبب يجهله الجميع."
        ])}`);
      } else if (mafia === doctor && !isDoctorBlocked) {
        news.push(`${counter++}. 🦹‍♂️ ${pickRandom([
          "المافيا شنت هجوماً عنيفاً، ولكن حدث ما لم يكن بالحسبان ونجت الضحية!",
          "محاولة اغتيال فاشلة من المافيا تركت الضحية على قيد الحياة."
        ])}`);
      } else {
        news.push(`${counter++}. 🦹‍♂️ ${pickRandom([
          `المافيا تجرم وتستبيح دماء الأبرياء، لتستيقظ المدينة على جثة (${mafia}).`,
          `رصاصة غادرة في جنح الظلام أنهت حياة (${mafia}) بلا رحمة.`
        ])}`);
      }
    }

    if (isDoctorAlive) {
      if (isDoctorBlocked) {
        news.push(`${counter++}. 👨‍⚕️ ${pickRandom([
          "الطبيب أخفق في معالجة الضحية وواجه ظروفاً غامضة منعته من أداء عمله.",
          "عجز الطبيب عن الخروج الليلة، لتبقى أرواح الأبرياء بلا حماية."
        ])}`);
      } else if (someoneDied) {
        news.push(`${counter++}. 👨‍⚕️ ${pickRandom([
          "الطبيب أخفق في الوصول للضحية في الوقت المناسب.",
          "جهود الطبيب ذهبت سدى، وانهار أمام بشاعة الجريمة."
        ])}`);
      } else if (isMafiaAlive && mafia && mafia !== 'skip' && !isMafiaBlocked && mafia === doctor) {
        news.push(`${counter++}. 👨‍⚕️ ${pickRandom([
          "الطبيب أتم عمله بصورة جميلة وأنقذ روحاً كانت على حافة الموت.",
          "تدخل طبي مذهل في اللحظة الأخيرة أحبط مخطط المافيا الدموي."
        ])}`);
      } else {
        news.push(`${counter++}. 👨‍⚕️ ${pickRandom([
          "الطبيب سهر طوال الليل مستعداً لأي طارئ.",
          "ليلة هادئة مرت على عيادة الطبيب."
        ])}`);
      }
    }

    if (isDetectiveAlive) {
      if (isDetectiveBlocked || !detective || detective === 'skip') {
        news.push(`${counter++}. 🕵️ ${pickRandom([
          "المحقق ما زال يسعى لكشف المتورطين وسط هذا الغموض.",
          "تحقيقات الليلة تعرقلت، والمحقق يواصل عمله بصمت."
        ])}`);
      } else {
        const targetRole = data.roles[detective];
        if (targetRole === 'مافيا') {
           news.push(`${counter++}. 🕵️ ${pickRandom([
            "توجد لدى المحقق أخبار سارة للمواطنين ستغير مجرى الأحداث!",
            "عدسة المحقق التقطت تحركات مشبوهة تؤكد هوية أحد أفراد المافيا."
          ])}`);
        } else {
           news.push(`${counter++}. 🕵️ ${pickRandom([
            "المحقق ما زال يسعى لكشف المتورطين، وقد استبعد أحد المشتبه بهم.",
            "المحقق يواصل تضييق دائرة المشتبه بهم شيئاً فشيئاً."
          ])}`);
        }
      }
    }

    const logMsg = news.join('\n'); 
    const winState = checkWin(newAlive, data.roles, data.players.length);
    await updateDoc(doc(db, "rooms", docId), {
      alive: newAlive, phase: winState ? 'game_over' : 'day_result', nightLog: logMsg,
      winner: winState || '', actedPlayers: [], targetTime: winState ? 0 : Date.now() + 20000, mafiaChat: [],
      recentlyDead: deadPlayer, handcuffed: finalHandcuffed 
    });
  }

  const performVoteResolution = async (docId, data) => {
    const voteCounts = {};
    Object.values(data.votes || {}).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
    let highestVote = 0, accused = '', isTie = false;
    Object.entries(voteCounts).forEach(([player, count]) => { if (count > highestVote) { highestVote = count; accused = player; isTie = false; } else if (count === highestVote) isTie = true; });
    if (isTie || accused === 'skip' || accused === '') await updateDoc(doc(db, "rooms", docId), { phase: 'defense_result', nightLog: '⚖️ الأغلبية اختارت التخطي أو تعادلت الأصوات.. لا إعدام اليوم!', targetTime: Date.now() + 8000, votes: {}, actedPlayers: [], recentlyDead: '' });
    else await updateDoc(doc(db, "rooms", docId), { phase: 'defense', defendingPlayer: accused, targetTime: Date.now() + ((data.settings?.defenseTime || 30) * 1000) });
  }

  const performDefenseResolution = async (docId, data) => {
    const voteCounts = {};
    Object.values(data.votes || {}).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
    let highestVote = 0, eliminated = '', isTie = false;
    Object.entries(voteCounts).forEach(([player, count]) => { if (count > highestVote) { highestVote = count; eliminated = player; isTie = false; } else if (count === highestVote) isTie = true; });
    if (isTie || eliminated === 'skip') eliminated = '';
    let newAlive = [...data.alive];
    if (eliminated) newAlive = newAlive.filter(p => p !== eliminated);
    const winState = checkWin(newAlive, data.roles, data.players.length);
    await updateDoc(doc(db, "rooms", docId), { alive: newAlive, phase: winState ? 'game_over' : 'defense_result', nightLog: eliminated ? `🔨 انتهى الدفاع ولم يقتنعوا! تم إعدام (${eliminated}) 💀` : '🛡️ نجح الدفاع! تم سحب الأصوات ونجا المتهم.', winner: winState || '', votes: {}, targetTime: winState ? 0 : Date.now() + 8000, actedPlayers: [], defendingPlayer: '', recentlyDead: eliminated });
  }

  const submitNightAction = async () => {
    if (!selectedTarget) return alert("اختار هدفك!");
    
    let field = '';
    if (myRole === 'مافيا') field = 'nightActions.mafia'; 
    if (myRole === 'طبيب') field = 'nightActions.doctor';
    if (myRole === 'شرطي') field = 'nightActions.police';
    
    if (myRole === 'محقق') {
      field = 'nightActions.detective';
      if (selectedTarget !== 'skip') {
        const targetRole = allRoles[selectedTarget];
        const emoji = targetRole === 'مافيا' ? '🦹‍♂️' : targetRole === 'طبيب' ? '👨‍⚕️' : targetRole === 'شرطي' ? '👮‍♂️' : '😇';
        setInvestigateResult(`🕵️ تحقيق: (${selectedTarget}) هو [${targetRole} ${emoji}]`);
        setTimeout(() => setInvestigateResult(''), 10000);
      }
    }
    
    await updateDoc(doc(db, "rooms", roomDocId), { 
      [field]: selectedTarget, 
      actedPlayers: arrayUnion(playerName) 
    });
  }

  const castVote = async (target) => { await updateDoc(doc(db, "rooms", roomDocId), { [`votes.${playerName}`]: target }); }
  const withdrawVote = async () => { await updateDoc(doc(db, "rooms", roomDocId), { [`votes.${playerName}`]: deleteField() }); }
  
  const detectiveSacrifice = async () => {
    if (!sacrificeTarget) return alert("اختار المتهم!");
    if (!window.confirm("متأكد؟ راح تطلع من اللعبة!")) return;
    const docSnap = await getDocs(query(collection(db, "rooms"), where("roomCode", "==", roomId)));
    let data; docSnap.forEach(d => data = d.data());
    let newAlive = data.alive.filter(p => p !== playerName);
    const winState = checkWin(newAlive, data.roles, data.players.length);
    const targetRole = data.roles[sacrificeTarget];
    const emoji = targetRole === 'مافيا' ? '🦹‍♂️' : targetRole === 'طبيب' ? '👨‍⚕️' : targetRole === 'شرطي' ? '👮‍♂️' : '😇';
    const sysMsg = `🚨 المحقق (${playerName}) كشف أن (${sacrificeTarget}) هو [${targetRole} ${emoji}] وخرج من اللعبة.`;
    
    // === إصلاح الخطأ: التحقق من إعدادات الوصية للمحقق ===
    const willEnabled = data.settings?.enableWill !== false;

    await updateDoc(doc(db, "rooms", roomDocId), { 
      alive: newAlive, 
      phase: winState ? 'game_over' : (willEnabled ? 'show_will' : data.phase), 
      winner: winState || data.winner, 
      globalChat: arrayUnion({ sender: 'النظام ⚖️', text: sysMsg }), 
      recentlyDead: playerName,
      willNextPhase: data.phase, 
      targetTime: winState ? 0 : (willEnabled ? Date.now() + 20000 : data.targetTime), 
      willSkippers: []
    });
  }
  
  const sendGlobal = async () => { if(!globalMsg.trim() || !isAlive) return; await updateDoc(doc(db, "rooms", roomDocId), { globalChat: arrayUnion({ sender: playerName, text: globalMsg }) }); setGlobalMsg(''); }
  const sendMafia = async (t=null) => { let m = t || mafiaMsg; if(!m.trim() || !isAlive) return; await updateDoc(doc(db, "rooms", roomDocId), { mafiaChat: arrayUnion({ sender: playerName, text: m }) }); setMafiaMsg(''); }

  useEffect(() => {
    if (roomDocId) {
      const unsub = onSnapshot(doc(db, "rooms", roomDocId), (document) => {
        if (document.exists()) {
          const data = document.data();
          if (!data.players.includes(playerName)) {
            sessionStorage.removeItem('mafiaGameSession'); setInRoom(false); alert("لقد تم إخراجك من الغرفة."); return;
          }

          setPlayers(data.players); setAlivePlayers(data.alive || []); setPhase(data.phase);
          setNightLog(data.nightLog || ''); setVotes(data.votes || {}); setWinner(data.winner || '');
          setTargetTime(data.targetTime || 0); setAllRoles(data.roles || {});
          setGlobalChat(data.globalChat || []); setMafiaChat(data.mafiaChat || []);
          setActedPlayers(data.actedPlayers || []); setDefendingPlayer(data.defendingPlayer || '');
          setNightCount(data.nightCount || 0); setHandcuffed(data.handcuffed || ''); setCitizenOrder(data.citizenOrder || []);
          setWills(data.wills || {}); setRecentlyDead(data.recentlyDead || ''); setWillSkippers(data.willSkippers || []);
          
          if (data.settings) setGameSettings(data.settings); 

          if (data.wills && data.wills[playerName]) { setIsWillSaved(true); setMyWill(data.wills[playerName]); } else { setIsWillSaved(false); }
          if (data.roles && data.roles[playerName]) setMyRole(data.roles[playerName]);
          if (data.phase !== 'night') { setInvestigateResult(''); setSelectedTarget(''); }
        } else {
           sessionStorage.removeItem('mafiaGameSession'); setInRoom(false);
        }
      });
      return () => unsub();
    }
  }, [roomDocId, playerName]);

  useEffect(() => {
    if (players.length > 0 && players[0] === playerName) { 
      if (phase === 'write_will' && Object.keys(wills).length === players.length) {
        updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 }); 
      }
      else if (phase === 'show_will' && willSkippers.length === players.length) {
        updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 }); 
      }
      else if (phase === 'night') {
        const aliveSpecials = alivePlayers.filter(p => ['مافيا', 'طبيب', 'محقق', 'شرطي'].includes(allRoles[p]));
        if (actedPlayers.length > 0 && actedPlayers.length >= aliveSpecials.length) {
          updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 });
        }
      }
      else if (phase === 'voting') {
        const requiredVotes = alivePlayers.includes(handcuffed) ? alivePlayers.length - 1 : alivePlayers.length;
        if (Object.keys(votes).length >= requiredVotes) {
          updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 });
        }
      }
    }
  }, [wills, willSkippers, actedPlayers, votes, phase, players, playerName, roomDocId, alivePlayers, allRoles, handcuffed]);

  useEffect(() => {
    let interval;
    if (targetTime && phase !== 'waiting' && phase !== 'game_over') {
      interval = setInterval(async () => {
        const left = Math.floor((targetTime - Date.now()) / 1000);
        if (left <= 0) {
          setTimeLeft(0); clearInterval(interval);
          if (players[0] === playerName) {
            const docSnap = await getDocs(query(collection(db, "rooms"), where("roomCode", "==", roomId)));
            let data; docSnap.forEach(d => data = d.data());
            
            if (data.phase === phase) { 
              if (phase === 'write_will') {
                await updateDoc(doc(db, "rooms", roomDocId), { phase: 'role_reveal', targetTime: Date.now() + 12000 });
              }
              else if (phase === 'role_reveal') {
                triggerNight(roomDocId, data.nightCount || 0, data.settings);
              }
              else if (phase === 'night') performNightResolution(roomDocId, data);
              else if (phase === 'day_result') {
                if (data.recentlyDead && data.settings?.enableWill !== false) {
                  await updateDoc(doc(db, "rooms", roomDocId), { phase: 'show_will', willNextPhase: 'voting', targetTime: Date.now() + 20000, willSkippers: [] });
                } else {
                  triggerVoting(roomDocId, data.settings);
                }
              }
              else if (phase === 'voting') performVoteResolution(roomDocId, data);
              else if (phase === 'defense') performDefenseResolution(roomDocId, data);
              else if (phase === 'defense_result') {
                if (data.recentlyDead && data.settings?.enableWill !== false) {
                  await updateDoc(doc(db, "rooms", roomDocId), { phase: 'show_will', willNextPhase: 'night', targetTime: Date.now() + 20000, willSkippers: [] });
                } else {
                  triggerNight(roomDocId, data.nightCount || 0, data.settings);
                }
              }
              else if (phase === 'show_will') {
                if (data.willNextPhase === 'voting') triggerVoting(roomDocId, data.settings);
                else triggerNight(roomDocId, data.nightCount || 0, data.settings);
              }
            }
          }
        } else setTimeLeft(left);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, targetTime, players, playerName]);

  useEffect(() => {
    if (globalChatRef.current) globalChatRef.current.scrollTop = globalChatRef.current.scrollHeight;
    if (mafiaChatRef.current) mafiaChatRef.current.scrollTop = mafiaChatRef.current.scrollHeight;
  }, [globalChat, mafiaChat]);

  const myMafiaMates = Object.keys(allRoles).filter(p => allRoles[p] === 'مافيا' && p !== playerName);

  const getCitizenDiscovery = () => {
    if (myRole !== 'مواطن' || !isAlive || nightCount < 3 || !citizenOrder || citizenOrder.length < 2) return null;
    const groupSize = Math.min(nightCount - 1, citizenOrder.length);
    const revealedGroup = citizenOrder.slice(0, groupSize);
    
    if (revealedGroup.includes(playerName)) {
      let msgs = [];
      revealedGroup.forEach(ally => {
        if (ally !== playerName && alivePlayers.includes(ally)) {
          msgs.push(`🤝 (${ally}) هو مواطن صالح معك بالسر!`);
        } else if (ally !== playerName && !alivePlayers.includes(ally)) {
          msgs.push(`🤝 (${ally}) كان مواطناً صالحاً معك (💀 مقصى)`);
        }
      });
      return msgs.length > 0 ? msgs : null;
    }
    return null;
  }

  const getCardImageUrl = (role) => {
    if (role === 'طبيب') return "url('/doctor-card.png')";
    if (role === 'مواطن') return "url('/citizen-card.png')";
    if (role === 'محقق') return "url('/detective-card.png')";
    if (role === 'شرطي') return "url('/police-card.png')";
    if (role === 'مافيا') return "url('/mafia-card.png')";
    return 'none';
  };

  const currentCardUrl = getCardImageUrl(myRole);
  const crowBgUrl = currentCardUrl !== 'none' ? currentCardUrl : "url('/doctor-card.png')";

  return (
    <div className="gothic-wrapper">
      
      {showSettingsModal && (
        <div className="will-overlay">
          <div className="gothic-frame" style={{ background: '#0c0a09', zIndex: 10000, maxWidth: '400px' }}>
             <h2 style={{color: '#fde68a', textAlign: 'center', marginBottom: '20px'}}>⚙️ إعدادات الغرفة</h2>
             
             <div style={{display:'flex', flexDirection:'column', gap:'15px', color: '#d6d3d1'}}>
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  وقت التصويت (بالدقائق): 
                  <input type="number" step="0.5" min="0.5" value={tempSettings.votingTime / 60} onChange={e=>setTempSettings({...tempSettings, votingTime: Number(e.target.value) * 60})} className="gothic-input" style={{width:'100px', padding:'5px', fontSize:'16px'}}/>
                </label>
                
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  وقت التبرير (بالدقائق): 
                  <input type="number" step="0.5" min="0.5" value={tempSettings.defenseTime / 60} onChange={e=>setTempSettings({...tempSettings, defenseTime: Number(e.target.value) * 60})} className="gothic-input" style={{width:'100px', padding:'5px', fontSize:'16px'}}/>
                </label>
                
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  وقت الليل (بالدقائق): 
                  <input type="number" step="0.5" min="0.5" value={tempSettings.nightTime / 60} onChange={e=>setTempSettings({...tempSettings, nightTime: Number(e.target.value) * 60})} className="gothic-input" style={{width:'100px', padding:'5px', fontSize:'16px'}}/>
                </label>

                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  وقت الوصية (بالدقائق): 
                  <input type="number" step="0.5" min="0.5" value={tempSettings.willTime / 60} onChange={e=>setTempSettings({...tempSettings, willTime: Number(e.target.value) * 60})} className="gothic-input" style={{width:'100px', padding:'5px', fontSize:'16px'}}/>
                </label>

                <hr style={{borderColor: '#3f3f46', margin: '10px 0'}} />

                <label style={{display:'flex', alignItems:'center', gap:'10px', cursor: 'pointer'}}>
                  <input type="checkbox" checked={tempSettings.enableWill} onChange={e=>setTempSettings({...tempSettings, enableWill: e.target.checked})} style={{width:'20px', height:'20px'}}/>
                  تفعيل فترة الوصية عند الموت
                </label>
                
                <label style={{display:'flex', alignItems:'center', gap:'10px', cursor: 'pointer'}}>
                  <input type="checkbox" checked={tempSettings.enableMusic} onChange={e=>setTempSettings({...tempSettings, enableMusic: e.target.checked})} style={{width:'20px', height:'20px'}}/>
                  تفعيل الموسيقى التلقائية للغرفة
                </label>
             </div>

             <div style={{display:'flex', gap:'10px', marginTop:'25px'}}>
                <button className="gothic-btn btn-teal" onClick={saveRoomSettings} style={{marginBottom: 0}}>حفظ الإعدادات</button>
                <button className="gothic-btn btn-red" onClick={()=>setShowSettingsModal(false)} style={{marginBottom: 0}}>إلغاء</button>
             </div>
          </div>
        </div>
      )}

      {phase === 'show_will' && inRoom && (
        <div className="will-overlay">
          <div className="will-paper">
            <h2 style={{ marginBottom: '10px', borderBottom: '2px dashed #b45309', paddingBottom: '10px' }}>📜 وصية ({recentlyDead})</h2>
            <p className="will-text">{wills[recentlyDead] || 'لا توجد وصية...'}</p>
            <p style={{ marginTop: '30px', fontSize: '16px', color: '#78350f', fontWeight: 'bold' }}>⏳ ستكمل اللعبة بعد {timeLeft} ثانية...</p>
            <button onClick={skipWillReading} disabled={willSkippers.includes(playerName)} style={{ marginTop: '15px', backgroundColor: willSkippers.includes(playerName) ? '#d97706' : '#b45309', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: willSkippers.includes(playerName) ? 'not-allowed' : 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%' }}>
              {willSkippers.includes(playerName) ? 'بانتظار موافقة البقية...' : `تخطي القراءة (${willSkippers.length}/${players.length}) ⏭️`}
            </button>
          </div>
        </div>
      )}

      {inRoom && (
        <button 
          onClick={() => setLocalMute(!localMute)} 
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.7)', border: '1px solid #444', color: '#fde68a', fontSize: '20px', cursor: 'pointer', zIndex: 50, borderRadius: '50%', width: '45px', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 10px rgba(0,0,0,0.8)' }}
          title="كتم/تشغيل الصوت محلياً"
        >
          {localMute || gameSettings?.enableMusic === false ? '🔇' : '🔊'}
        </button>
      )}

      <div className="gothic-frame">
        
        {inRoom && (
          <button className="btn-leave-corner" onClick={leaveRoom}>خروج 🚪</button>
        )}

        {!inRoom ? (
          <div>
            <div className="logo-container">
              <div className="logo-icon">🕵️‍♂️</div>
              <h1 className="gothic-title">لعبة المافيا</h1>
            </div>
            <p className="gothic-subtitle">أدخل اسمك وكود الغرفة للعب</p>
            
            <div className="input-group">
              <input type="text" placeholder="[اسمك...] 🪶" value={playerName} onChange={e=>setPlayerName(e.target.value)} className="gothic-input"/>
              <input type="text" placeholder="كود الغرفة 🗝️" value={joinCode} onChange={e=>setJoinCode(e.target.value)} className="gothic-input"/>
            </div>
            
            <button onClick={createRoom} className="gothic-btn btn-red">إنشاء غرفة جديدة 🌹</button>
            <button onClick={joinRoom} className="gothic-btn btn-teal">الانضمام لغرفة 🕳️</button>
          </div>
        ) : (
          <div>
            {phase === 'waiting' && (
              <div className="logo-container">
                <div className="logo-icon">🕵️‍♂️</div>
                <h1 className="gothic-title">لعبة المافيا</h1>
                <div className="room-code-box" style={{marginTop: '20px'}}>
                  <span>⏳</span>
                  <span>كود الغرفة</span>
                  <span className="code-highlight">{roomId}</span>
                </div>
              </div>
            )}
            
            {phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', marginTop: '20px' }}>
                <div className={`role-badge role-${myRole}`}>دورك: {myRole}</div>
                {!isAlive && <div style={{ color: '#ef4444', fontWeight: 'bold' }}>💀 تم إقصاؤك</div>}
              </div>
            )}

            {phase === 'write_will' && (
              <div style={{ padding: '20px', backgroundColor: '#0f172a', borderRadius: '15px', border: '2px solid #f59e0b', textAlign: 'center', marginTop: '20px' }}>
                <h2 style={{ color: '#f59e0b', fontSize: '28px' }}>📜 اكتب وصيتك!</h2>
                <p style={{ color: '#cbd5e1', fontSize: '15px', marginTop: '10px' }}>اكتب كلمتك الأخيرة. ستظهر للجميع إذا تم قتلك.</p>
                <h1 style={{ color: timeLeft <= 10 ? '#ef4444' : 'white', margin: '15px 0' }}>⏳ {timeLeft} ثانية</h1>
                
                {!isWillSaved ? (
                  <>
                    <textarea value={myWill} onChange={e => setMyWill(e.target.value.substring(0, 150))} placeholder="اكتب وصيتك هنا (الحد الأقصى 150 حرف)..." style={{ width: '100%', height: '100px', padding: '15px', borderRadius: '10px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569', marginTop: '10px', resize: 'none', fontSize: '16px' }} />
                    <p style={{ fontSize: '14px', color: myWill.length >= 150 ? '#ef4444' : '#94a3b8', textAlign: 'left', margin: '5px 0' }}>{myWill.length}/150</p>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button onClick={() => saveWill('normal')} className="gothic-btn btn-teal" style={{ flex: 1, fontSize: '18px', marginBottom: 0 }}>حفظ</button>
                      <button onClick={() => saveWill('skip')} className="gothic-btn" style={{ backgroundColor: '#64748b', color: 'white', flex: 1, fontSize: '18px', marginBottom: 0, border: '2px solid #475569' }}>تخطي ⏭️</button>
                    </div>
                  </>
                ) : (
                  <div style={{ backgroundColor: '#064e3b', padding: '20px', borderRadius: '10px', marginTop: '20px' }}>
                    <h3 style={{ color: '#34d399', margin: 0 }}>✅ تم تأكيد وصيتك!</h3>
                    <p style={{ color: '#a7f3d0', fontSize: '14px', marginTop: '10px' }}>بانتظار باقي اللاعبين لتوزيع الأدوار...</p>
                  </div>
                )}
              </div>
            )}

            {phase === 'role_reveal' && (
              <div style={{ padding: '20px', textAlign: 'center', marginTop: '20px' }}>
                <h1 style={{color: '#d6d3d1'}}>🎭 توزيع الأدوار</h1>
                
                <div className={`card-3d-container ${showAdvice ? 'show-shadow' : ''}`}>
                  <div className={`card-3d ${showAdvice ? 'flipped' : ''}`}>
                    <div className="card-face card-front" style={{
                      backgroundImage: crowBgUrl, backgroundSize: '202% 100%', backgroundPosition: 'left center', 
                      borderRadius: '15px', overflow: 'hidden', border: 'none', boxShadow: '0 0 15px rgba(0,0,0,0.8)'
                    }}></div>
                    <div className={`card-face card-back`} style={{ 
                      backgroundImage: currentCardUrl, backgroundSize: '202% 100%', backgroundPosition: 'right center',
                      borderRadius: '15px', overflow: 'hidden', borderColor: 'transparent',
                      boxShadow: myRole === 'مافيا' ? '0 0 35px rgba(239, 68, 68, 0.8)' : myRole === 'طبيب' ? '0 0 35px rgba(16, 185, 129, 0.8)' : myRole === 'مواطن' ? '0 0 35px rgba(253, 230, 138, 0.8)' : myRole === 'محقق' ? '0 0 35px rgba(139, 92, 246, 0.8)' : myRole === 'شرطي' ? '0 0 35px rgba(37, 99, 235, 0.8)' : '0 0 30px rgba(245, 158, 11, 0.6)'
                    }}></div>
                  </div>
                </div>

                {myRole === 'مافيا' && myMafiaMates.length > 0 && <h3 style={{ color: '#fca5a5', marginTop: '15px' }}>🤝 زميلك بالمافيا: {myMafiaMates.join(' و ')}</h3>}
                
                {showAdvice && (
                  <div style={{ marginTop: '15px', padding: '15px', background: 'linear-gradient(to bottom, #1c1917, #0c0a09)', border: '1px solid #444', borderRadius: '10px', animation: 'fadeIn 0.5s ease-in' }}>
                      {myRole === 'مواطن' && <h3 style={{color: '#fde68a', margin: 0}}>🎯 حاول أن تبقى حياً إلى الليلة الثالثة!</h3>}
                      {myRole === 'محقق' && <h3 style={{color: '#c4b5fd', margin: 0}}>🎯 كثف جهودك، الأبرياء ينتظرون الخلاص!</h3>}
                      {myRole === 'طبيب' && <h3 style={{color: '#a7f3d0', margin: 0}}>🎯 أرواح المواطنين مسؤوليتك!</h3>}
                      {myRole === 'شرطي' && <h3 style={{color: '#93c5fd', margin: 0}}>🎯 كن دقيقاً في واجبك!</h3>}
                      {myRole === 'مافيا' && <h3 style={{color: '#fca5a5', margin: 0}}>🎯 دعنا نحرق هذا العالم 😈</h3>}
                  </div>
                )}

                <h2 style={{ color: '#10b981', marginTop: '20px' }}>⏳ ستبدأ الليلة بعد {timeLeft} ثانية...</h2>
              </div>
            )}

            {myRole === 'مافيا' && phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && myMafiaMates.length > 0 && (
              <div className="chat-container" style={{ borderColor: '#7f1d1d' }}>
                <div className="chat-title" style={{ background: 'linear-gradient(to right, #7f1d1d, #450a0a)' }}>🤝 شات المافيا السري</div>
                <div className="chat-box" ref={mafiaChatRef}>
                  {mafiaChat.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.sender === playerName ? 'msg-mine' : 'msg-mafia'}`}>
                      <strong>{msg.sender}:</strong> {msg.text}
                    </div>
                  ))}
                </div>
                {isAlive ? (
                  <div className="chat-input-area">
                    <input type="text" value={mafiaMsg} onChange={e=>setMafiaMsg(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMafia()} placeholder="اكتب لزميلك..." className="chat-input" />
                    <button onClick={()=>sendMafia()} className="chat-send-btn mafia-btn" style={{fontFamily: 'Amiri'}}>إرسال</button>
                  </div>
                ) : (
                  <p style={{ color: '#ef4444', fontSize: '14px', textAlign: 'center', padding: '5px' }}>🚫 لا يمكنك الكتابة لأنك مقصى.</p>
                )}
              </div>
            )}

            {myRole === 'محقق' && isAlive && (phase === 'voting' || phase === 'day_result') && (
              <div style={{ background: 'linear-gradient(to bottom, #450a0a, #280505)', padding: '15px', borderRadius: '10px', marginTop: '10px', border: '1px solid #7f1d1d' }}>
                <h4 style={{ color: '#fca5a5', margin: '0 0 10px 0' }}>🚨 تضحية المحقق</h4>
                <p style={{ fontSize: '13px', margin: '0 0 10px 0', color: '#d6d3d1' }}>اكشف هويتك وافضح متهم كدام الكل!</p>
                <select onChange={e=>setSacrificeTarget(e.target.value)} value={sacrificeTarget} className="target-select" style={{ borderColor: '#ef4444' }}>
                  <option value="">-- اختار المتهم لفضحه --</option>
                  {alivePlayers.filter(p=>p!==playerName).map((p,i)=><option key={i} value={p}>{p}</option>)}
                </select>
                <button onClick={detectiveSacrifice} className="gothic-btn btn-red" style={{ marginBottom: 0, padding: '10px' }}>فضح المتهم والخروج</button>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              {phase === 'waiting' && (
                <div>
                  <h3 className="players-title">اللاعبين ({players.length}):</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {players.map((p,i) => (
                      <div key={i} className={i === 0 ? 'player-row host-row' : 'player-row'}>
                        <span>👤 {p} {i === 0 && '👑 (المضيف)'}</span>
                        <div style={{display: 'flex', gap: '5px'}}>
                           {players[0] === playerName && i === 0 && (
                             <button onClick={openSettingsModal} style={{ background: 'linear-gradient(to bottom, #d97706, #78350f)', color: '#fef3c7', border: '1px solid #b45309', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'Amiri' }}>⚙️ الإعدادات</button>
                           )}
                           {players[0] === playerName && p !== playerName && (
                             <button onClick={() => kickPlayer(p)} style={{ background: 'linear-gradient(to bottom, #7f1d1d, #450a0a)', color: '#fca5a5', border: '1px solid #991b1b', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'Amiri' }}>طرد ❌</button>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {players[0] === playerName && <button onClick={startGame} className="gothic-btn btn-teal">🔥 بدء اللعبة (يجب الدخول 3)</button>}
                </div>
              )}

              {phase === 'night' && (
                <div>
                  <h2 style={{color: '#d6d3d1'}}>🌙 الليلة رقم {nightCount}</h2>
                  <h1 style={{ color: timeLeft <= 30 ? '#ef4444' : '#fde68a' }}>⏳ {Math.floor(timeLeft / 60)}:{timeLeft % 60 < 10 ? '0' : ''}{timeLeft % 60}</h1>
                  
                  {getCitizenDiscovery() && (
                    <div style={{ background: 'linear-gradient(to bottom, #1c1917, #0c0a09)', border: '1px solid #b45309', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
                      <h4 style={{ color: '#fde68a', margin: '0 0 10px 0' }}>👁️ معلومات سرية (للمواطنين)</h4>
                      {getCitizenDiscovery().map((msg, i) => <p key={i} style={{ color: '#10b981', margin: '5px 0', fontWeight: 'bold' }}>{msg}</p>)}
                    </div>
                  )}

                  {isAlive && myRole !== 'مواطن' && !hasActed && (
                    <div style={{ borderTop: '2px solid #334155', paddingTop: '15px', marginTop: '15px' }}>
                      <p style={{color: '#d6d3d1'}}>اختار هدفك:</p>
                      <select onChange={e=>setSelectedTarget(e.target.value)} value={selectedTarget} className="target-select">
                        <option value="">-- اختار لاعب --</option>
                        {(myRole === 'مافيا' || myRole === 'شرطي') && <option value="skip">⏭️ تخطي</option>}
                        {alivePlayers.map((p, i) => {
                          if (p === playerName && myRole !== 'طبيب') return null; 
                          return <option key={i} value={p}>{p === playerName ? `${p} (أنا)` : p}</option>;
                        })}
                      </select>
                      <button onClick={submitNightAction} className="gothic-btn btn-teal" style={{padding: '10px'}}>تأكيد الاختيار</button>
                    </div>
                  )}
                  {hasActed && <p style={{ color: '#10b981', fontWeight: 'bold', fontSize:'20px', marginTop:'15px' }}>✅ تم تسجيل اختيارك!</p>}
                  
                  {investigateResult && (
                    <div style={{ background: 'linear-gradient(to bottom, #2e1065, #170535)', border: '1px solid #8b5cf6', padding: '15px', borderRadius: '10px', marginTop: '15px' }}>
                      <p style={{ color: '#c4b5fd', fontWeight: 'bold', fontSize:'18px', margin: 0 }}>{investigateResult}</p>
                    </div>
                  )}
                </div>
              )}

              {(phase === 'day_result' || phase === 'defense_result') && (
                <div>
                  <h2 style={{ lineHeight: '1.8', whiteSpace: 'pre-line', textAlign: 'right', background: 'linear-gradient(to right, #1c1917, #0c0a09)', padding: '20px', borderRadius: '10px', border: '1px solid #3f3f46', color: '#d6d3d1' }}>
                    {nightLog}
                  </h2>
                  <h3 style={{ color: '#3b82f6', marginTop: '15px' }}>⏳ الانتقال بعد {timeLeft} ثانية...</h3>
                </div>
              )}

              {phase === 'voting' && (
                <div>
                  <h2 style={{color: '#d6d3d1'}}>🗳️ التصويت الجماعي</h2>
                  <h3 style={{ color: timeLeft <= 60 ? '#ef4444' : '#10b981' }}>⏳ الوقت المتبقي: {Math.floor(timeLeft / 60)}:{timeLeft % 60 < 10 ? '0' : ''}{timeLeft % 60}</h3>
                  
                  {handcuffed === playerName ? (
                    <div style={{ background: 'linear-gradient(to bottom, #7f1d1d, #450a0a)', border: '2px dashed #ef4444', padding: '20px', borderRadius: '10px', textAlign: 'center', margin: '20px 0' }}>
                      <h2 style={{ color: '#fca5a5' }}>🚨 أنت مقيد! 🚨</h2>
                      <p style={{ color: '#f87171' }}>قامت الشرطة بتوقيفك. لا يمكنك التصويت اليوم!</p>
                    </div>
                  ) : (
                    <>
                      <div className={`vote-item ${hasVoted && myVoteTarget !== 'skip' ? 'dimmed' : ''} ${myVoteTarget === 'skip' ? 'selected' : ''}`} style={{ borderColor: '#b45309' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{color: '#fde68a'}}>⏭️ تخطي (الأغلبية تلغي الإعدام)</span><br/>
                          {Object.entries(votes).filter(([v, t]) => t === 'skip').map(([v]) => <span key={v} className="voter-tag">{v}</span>)}
                        </div>
                        {isAlive && (
                          myVoteTarget === 'skip' ? (
                            <button onClick={withdrawVote} className="vote-btn" style={{background: 'linear-gradient(to bottom, #475569, #1e293b)'}}>سحب</button>
                          ) : (
                            <button onClick={()=>castVote('skip')} className="vote-btn" style={{background: 'linear-gradient(to bottom, #d97706, #78350f)'}}>تصويت</button>
                          )
                        )}
                      </div>

                      {players.map((p, i) => (
                        <div key={i} className={`vote-item ${hasVoted && myVoteTarget !== p ? 'dimmed' : ''} ${myVoteTarget === p ? 'selected' : ''}`}>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{color: '#d6d3d1'}}>👤 {p} {!alivePlayers.includes(p) && <span style={{color:'#ef4444'}}>(💀)</span>}</span><br/>
                            {Object.entries(votes).filter(([v, t]) => t === p).map(([v]) => <span key={v} className="voter-tag">{v}</span>)}
                          </div>
                          {isAlive && alivePlayers.includes(p) && (
                            myVoteTarget === p ? (
                              <button onClick={withdrawVote} className="vote-btn" style={{background: 'linear-gradient(to bottom, #475569, #1e293b)'}}>سحب</button>
                            ) : (
                              <button onClick={()=>castVote(p)} className="vote-btn" style={{background: 'linear-gradient(to bottom, #991b1b, #450a0a)'}}>تصويت</button>
                            )
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {phase === 'defense' && (
                <div style={{ background: 'linear-gradient(to bottom, #450a0a, #280505)', padding: '20px', borderRadius: '15px', border: '2px solid #7f1d1d' }}>
                  <h2 style={{ color: '#fca5a5', margin: 0 }}>⚖️ محكمة المدينة!</h2>
                  <h3 style={{ color: '#d6d3d1' }}>المتهم: 🚨 {defendingPlayer} 🚨</h3>
                  <h1 style={{ color: timeLeft <= 15 ? '#ef4444' : '#fde68a' }}>⏳ {timeLeft} ثانية</h1>
                  <p style={{ color: '#a1a1aa' }}>أمامك {(gameSettings?.defenseTime || 30) / 60} دقيقة لتبرير موقفك وإقناعهم بسحب أصواتهم!</p>
                  {isAlive && votes[playerName] === defendingPlayer && handcuffed !== playerName && (
                    <button onClick={withdrawVote} className="gothic-btn btn-teal" style={{ marginTop: '15px', padding: '10px' }}>✅ اقتنعت! (سحب تصويتي)</button>
                  )}
                </div>
              )}

              {phase === 'game_over' && (
                <div>
                  <h1 style={{color: '#fde68a'}}>🎉 انتهاء اللعبة!</h1>
                  <h2 style={{ lineHeight: '1.6', color: '#d6d3d1' }}>الفائز هم: <br/><span style={{ color: '#10b981', fontSize: '28px' }}>{winner}</span></h2>
                  {players[0] === playerName ? (
                    <button onClick={restartGame} className="gothic-btn btn-teal" style={{ marginTop: '20px' }}>
                      🔄 إعادة اللعب
                    </button>
                  ) : (
                    <p style={{ color: '#a1a1aa', marginTop: '20px' }}>ننتظر المضيف لإعادة تشغيل الغرفة...</p>
                  )}
                </div>
              )}
            </div>

            {phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && (
              <div className="chat-container">
                <div className="chat-title" style={{background: 'linear-gradient(to right, #1e293b, #0f172a)'}}>💬 الدردشة العامة</div>
                <div className="chat-box" ref={globalChatRef}>
                  {globalChat.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.sender === playerName ? 'msg-mine' : (msg.sender.includes('النظام') ? 'msg-system' : 'msg-global')}`}>
                      <strong>{msg.sender}:</strong> {msg.text}
                    </div>
                  ))}
                </div>
                {isAlive ? (
                  <div className="chat-input-area">
                    <input type="text" value={globalMsg} onChange={e=>setGlobalMsg(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendGlobal()} placeholder="اكتب للجميع..." className="chat-input" />
                    <button onClick={sendGlobal} className="chat-send-btn" style={{fontFamily: 'Amiri'}}>إرسال</button>
                  </div>
                ) : (
                  <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '10px' }}>🚫 تم إقصاؤك ولا يمكنك التحدث.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App