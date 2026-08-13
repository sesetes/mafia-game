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
  const [nightCount, setNightCount] = useState(1);
  const [targetTime, setTargetTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [globalChat, setGlobalChat] = useState([]);
  const [mafiaChat, setMafiaChat] = useState([]);
  const [globalMsg, setGlobalMsg] = useState('');
  const [mafiaMsg, setMafiaMsg] = useState('');
  
  const [wills, setWills] = useState({});
  const [recentlyDead, setRecentlyDead] = useState('');
  const [myWill, setMyWill] = useState('');
  const [isWillSaved, setIsWillSaved] = useState(false);
  const [willSkippers, setWillSkippers] = useState([]);
  
  const globalChatRef = useRef(null);
  const mafiaChatRef = useRef(null);

  const nightSound = useRef(new Audio('/night.mp3'));
  const daySound = useRef(new Audio('/day.mp3')); 
  const defenseSound = useRef(new Audio('/defense.mp3'));
  const gunSound = useRef(new Audio('/gun.mp3'));
  const ambulanceSound = useRef(new Audio('/ambulance.mp3'));
  const flipSound = useRef(new Audio('/flip.mp3'));

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

  useEffect(() => {
    nightSound.current.loop = true; nightSound.current.volume = 0.6;
    daySound.current.loop = true; daySound.current.volume = 0.4; 
    defenseSound.current.loop = true; defenseSound.current.volume = 0.5;
  }, []);

  const unlockAudio = () => {
    [nightSound.current, daySound.current, defenseSound.current, flipSound.current].forEach(a => a.play().then(()=>a.pause()).catch(()=>{}));
  };

  useEffect(() => {
    nightSound.current.pause(); daySound.current.pause(); defenseSound.current.pause();
    if (phase === 'night') {
      nightSound.current.play().catch(()=>{});
      setTimeout(() => gunSound.current.play().catch(()=>{}), 20000);
      setTimeout(() => ambulanceSound.current.play().catch(()=>{}), 25000);
    } else if (phase === 'day_result') {
      daySound.current.play().catch(()=>{});
    } else if (phase === 'defense') {
      defenseSound.current.play().catch(()=>{});
    } else if (phase === 'role_reveal') {
      setTimeout(() => {
        flipSound.current.play().catch(()=>{});
      }, 1000);
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
      const docRef = await addDoc(collection(db, "rooms"), {
        roomCode: randomCode, phase: "waiting", players: [playerName], alive: [playerName],
        roles: {}, nightActions: { mafia: '', doctor: '', detective: '' }, votes: {},
        nightLog: '', winner: '', targetTime: 0, actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 1,
        wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [] 
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
      if (roomData.players.includes(playerName)) return alert("الاسم موجود!");
      setRoomDocId(docId);
      await updateDoc(doc(db, "rooms", docId), { players: arrayUnion(playerName), alive: arrayUnion(playerName) });
      setRoomId(joinCode); setInRoom(true);
      sessionStorage.setItem('mafiaGameSession', JSON.stringify({ playerName, roomId: joinCode, roomDocId: docId }));
    } catch (error) { alert("خطأ بالانضمام!"); }
  }

  const startGame = async () => {
    if (players.length < 3) return alert("يحتاج 3 لاعبين!");
    let shuffled = [...players].sort(() => Math.random() - 0.5);
    const rolesList = players.length >= 8 ? ['مافيا', 'مافيا', 'طبيب', 'محقق'] : ['مافيا', 'طبيب', 'محقق'];
    let assigned = {};
    shuffled.forEach((p, idx) => { assigned[p] = idx < rolesList.length ? rolesList[idx] : 'مواطن'; });
    
    await updateDoc(doc(db, "rooms", roomDocId), { phase: "write_will", roles: assigned, alive: players, nightActions: { mafia: '', doctor: '', detective: '' }, votes: {}, targetTime: Date.now() + 60000, actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 1, wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [] });
  }

  const restartGame = async () => {
    await updateDoc(doc(db, "rooms", roomDocId), { phase: "waiting", alive: players, roles: {}, nightActions: { mafia: '', doctor: '', detective: '' }, votes: {}, nightLog: '', winner: '', targetTime: 0, actedPlayers: [], mafiaChat: [], globalChat: [], defendingPlayer: '', nightCount: 1, wills: {}, recentlyDead: '', willNextPhase: '', willSkippers: [] });
  }

  const saveWill = async (type = 'normal') => {
    const finalWill = type === 'skip' ? 'لا توجد وصية...' : (myWill.trim() || 'لا توجد وصية...');
    await updateDoc(doc(db, "rooms", roomDocId), {
      [`wills.${playerName}`]: finalWill
    });
    setIsWillSaved(true);
  };

  const skipWillReading = async () => {
    if (!willSkippers.includes(playerName)) {
      await updateDoc(doc(db, "rooms", roomDocId), {
        willSkippers: arrayUnion(playerName)
      });
    }
  };

  const triggerNight = async (docId, currentCount) => {
    await updateDoc(doc(db, "rooms", docId), { 
      phase: 'night', 
      targetTime: Date.now() + 180000, 
      actedPlayers: [], 
      nightCount: currentCount + 1,
      nightActions: { mafia: '', doctor: '', detective: '' } 
    });
  }

  const performNightResolution = async (docId, data) => {
    const { mafia, doctor, detective } = data.nightActions;
    let newAlive = [...data.alive]; 
    let news = [];
    let counter = 1;
    let deadPlayer = '';

    if (!mafia || mafia === 'skip') {
      news.push(`${counter++}. المافيا تتريث ولا تتحرك لسفك الدماء.`);
    } else if (mafia === doctor) {
      news.push(`${counter++}. الطبيب ينقذ روح أحد الأبرياء بعد أن أرادت المافيا قتله.`);
    } else {
      newAlive = newAlive.filter(p => p !== mafia);
      deadPlayer = mafia; 
      news.push(`${counter++}. المافيا تنشر الرعب في المدينة وتقتل (${mafia}).`);
      if(data.roles[doctor] === 'طبيب' && data.alive.includes(doctor)) {
        news.push(`${counter++}. الطبيب ينهار بسبب فشله في الإنقاذ.`);
      }
    }

    if (detective && detective !== 'skip') {
        if (data.roles[detective] === 'مافيا') {
            news.push(`${counter++}. توجد لدى المحقق أخبار سعيدة للشعب!`);
        } else {
            news.push(`${counter++}. المحقق ما زال يسعى إلى كشف المتورطين.`);
        }
    }

    const logMsg = news.join('\n'); 
    const winState = checkWin(newAlive, data.roles);
    await updateDoc(doc(db, "rooms", docId), {
      alive: newAlive, phase: winState ? 'game_over' : 'day_result', nightLog: logMsg,
      winner: winState || '', nightActions: { mafia: '', doctor: '', detective: '' },
      actedPlayers: [], targetTime: winState ? 0 : Date.now() + 20000, mafiaChat: [],
      recentlyDead: deadPlayer 
    });
  }

  const triggerVoting = async (docId) => { await updateDoc(doc(db, "rooms", docId), { phase: 'voting', targetTime: Date.now() + 600000, votes: {} }); }

  const performVoteResolution = async (docId, data) => {
    const voteCounts = {};
    Object.values(data.votes || {}).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
    let highestVote = 0, accused = '', isTie = false;
    Object.entries(voteCounts).forEach(([player, count]) => { if (count > highestVote) { highestVote = count; accused = player; isTie = false; } else if (count === highestVote) isTie = true; });
    if (isTie || accused === 'skip' || accused === '') await updateDoc(doc(db, "rooms", docId), { phase: 'defense_result', nightLog: '⚖️ الأغلبية اختارت التخطي أو تعادلت الأصوات.. لا إعدام اليوم!', targetTime: Date.now() + 8000, votes: {}, actedPlayers: [], recentlyDead: '' });
    else await updateDoc(doc(db, "rooms", docId), { phase: 'defense', defendingPlayer: accused, targetTime: Date.now() + 60000 });
  }

  const performDefenseResolution = async (docId, data) => {
    const voteCounts = {};
    Object.values(data.votes || {}).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
    let highestVote = 0, eliminated = '', isTie = false;
    Object.entries(voteCounts).forEach(([player, count]) => { if (count > highestVote) { highestVote = count; eliminated = player; isTie = false; } else if (count === highestVote) isTie = true; });
    if (isTie || eliminated === 'skip') eliminated = '';
    let newAlive = [...data.alive];
    if (eliminated) newAlive = newAlive.filter(p => p !== eliminated);
    const winState = checkWin(newAlive, data.roles);
    await updateDoc(doc(db, "rooms", docId), { alive: newAlive, phase: winState ? 'game_over' : 'defense_result', nightLog: eliminated ? `🔨 انتهى الدفاع ولم يقتنعوا! تم إعدام (${eliminated}) 💀` : '🛡️ نجح الدفاع! تم سحب الأصوات ونجا المتهم.', winner: winState || '', votes: {}, targetTime: winState ? 0 : Date.now() + 8000, actedPlayers: [], defendingPlayer: '', recentlyDead: eliminated });
  }

  const checkWin = (currentAlive, roles) => {
    const mafias = currentAlive.filter(p => roles[p] === 'مافيا');
    const citizens = currentAlive.filter(p => roles[p] !== 'مافيا');
    if (mafias.length === 0) return 'المواطنين 😇';
    if (mafias.length >= citizens.length) return 'المافيا 🦹‍♂️';
    return null;
  }

  // === حل جذري لمشكلة اختفاء الاختيارات (Race Condition Fix) ===
  const submitNightAction = async () => {
    if (!selectedTarget) return alert("اختار هدفك!");
    
    let field = '';
    if (myRole === 'مافيا') field = 'nightActions.mafia'; 
    if (myRole === 'طبيب') field = 'nightActions.doctor';
    if (myRole === 'محقق') {
      field = 'nightActions.detective';
      if (selectedTarget !== 'skip') {
        setInvestigateResult(`${selectedTarget} هو: ${allRoles[selectedTarget] === 'مافيا' ? '🦹‍♂️ مافيا!' : '😇 ليس مافيا'}`);
      }
    }
    
    // إرسال البيانات مباشرة لقاعدة البيانات بدون قراءتها لتجنب تداخل الاختيارات
    await updateDoc(doc(db, "rooms", roomDocId), { 
      [field]: selectedTarget, 
      actedPlayers: arrayUnion(playerName) 
    });
  }

  const castVote = async (target) => {
    // حل مشكلة تداخل الأصوات لو صوتوا بنفس اللحظة
    await updateDoc(doc(db, "rooms", roomDocId), { 
      [`votes.${playerName}`]: target 
    });
  }

  const withdrawVote = async () => { await updateDoc(doc(db, "rooms", roomDocId), { [`votes.${playerName}`]: deleteField() }); }
  
  const detectiveSacrifice = async () => {
    if (!sacrificeTarget) return alert("اختار المتهم!");
    if (!window.confirm("متأكد؟ راح تطلع من اللعبة!")) return;
    const docSnap = await getDocs(query(collection(db, "rooms"), where("roomCode", "==", roomId)));
    let data; docSnap.forEach(d => data = d.data());
    let newAlive = data.alive.filter(p => p !== playerName);
    const winState = checkWin(newAlive, data.roles);
    const sysMsg = `🚨 المحقق (${playerName}) كشف أن (${sacrificeTarget}) هو ${data.roles[sacrificeTarget] === 'مافيا' ? 'مافيا 🦹‍♂️!' : 'ليس مافيا 😇!'} وخرج من اللعبة.`;
    
    await updateDoc(doc(db, "rooms", roomDocId), { 
      alive: newAlive, 
      phase: winState ? 'game_over' : 'show_will', 
      winner: winState || data.winner, 
      globalChat: arrayUnion({ sender: 'النظام ⚖️', text: sysMsg }),
      recentlyDead: playerName,
      willNextPhase: data.phase, 
      targetTime: Date.now() + 20000, 
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
          setPlayers(data.players); setAlivePlayers(data.alive || []); setPhase(data.phase);
          setNightLog(data.nightLog || ''); setVotes(data.votes || {}); setWinner(data.winner || '');
          setTargetTime(data.targetTime || 0); setAllRoles(data.roles || {});
          setGlobalChat(data.globalChat || []); setMafiaChat(data.mafiaChat || []);
          setActedPlayers(data.actedPlayers || []); setDefendingPlayer(data.defendingPlayer || '');
          setNightCount(data.nightCount || 1); 
          
          setWills(data.wills || {});
          setRecentlyDead(data.recentlyDead || '');
          setWillSkippers(data.willSkippers || []);
          
          if (data.wills && data.wills[playerName]) {
            setIsWillSaved(true);
            setMyWill(data.wills[playerName]);
          } else {
            setIsWillSaved(false);
          }

          if (data.roles && data.roles[playerName]) setMyRole(data.roles[playerName]);
          if (data.phase !== 'night') { setInvestigateResult(''); setSelectedTarget(''); }
        } else {
           sessionStorage.removeItem('mafiaGameSession');
           setInRoom(false);
        }
      });
      return () => unsub();
    }
  }, [roomDocId, playerName]);

  // === التخطي الذكي الشامل: ينهي الوقت فوراً إذا اكتمل العدد (للأدوار، الوصية، والتصويت) ===
  useEffect(() => {
    if (players.length > 0 && players[0] === playerName) { 
      if (phase === 'write_will' && Object.keys(wills).length === players.length) {
        updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 }); 
      }
      else if (phase === 'show_will' && willSkippers.length === players.length) {
        updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 }); 
      }
      else if (phase === 'night') {
        const aliveSpecials = alivePlayers.filter(p => ['مافيا', 'طبيب', 'محقق'].includes(allRoles[p]));
        if (actedPlayers.length > 0 && actedPlayers.length >= aliveSpecials.length) {
          updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 });
        }
      }
      else if (phase === 'voting') {
        if (Object.keys(votes).length >= alivePlayers.length) {
          updateDoc(doc(db, "rooms", roomDocId), { targetTime: 1 });
        }
      }
    }
  }, [wills, willSkippers, actedPlayers, votes, phase, players, playerName, roomDocId, alivePlayers, allRoles]);

  useEffect(() => {
    let interval;
    if (targetTime && phase !== 'waiting' && phase !== 'game_over') {
      interval = setInterval(async () => {
        const left = Math.floor((targetTime - Date.now()) / 1000);
        if (left <= 0) {
          setTimeLeft(0); clearInterval(interval);
          if (players[0] === playerName) {
            // سحب أحدث بيانات من القاعدة قبل إصدار أي قرار لضمان الدقة 100%
            const docSnap = await getDocs(query(collection(db, "rooms"), where("roomCode", "==", roomId)));
            let data; docSnap.forEach(d => data = d.data());
            
            if (data.phase === phase) { 
              if (phase === 'write_will') {
                await updateDoc(doc(db, "rooms", roomDocId), { phase: 'role_reveal', targetTime: Date.now() + 12000 });
              }
              else if (phase === 'role_reveal') {
                triggerNight(roomDocId, data.nightCount || 1);
              }
              else if (phase === 'night') performNightResolution(roomDocId, data);
              else if (phase === 'day_result') {
                if (data.recentlyDead) {
                  await updateDoc(doc(db, "rooms", roomDocId), { phase: 'show_will', willNextPhase: 'voting', targetTime: Date.now() + 20000, willSkippers: [] });
                } else {
                  triggerVoting(roomDocId);
                }
              }
              else if (phase === 'voting') performVoteResolution(roomDocId, data);
              else if (phase === 'defense') performDefenseResolution(roomDocId, data);
              else if (phase === 'defense_result') {
                if (data.recentlyDead) {
                  await updateDoc(doc(db, "rooms", roomDocId), { phase: 'show_will', willNextPhase: 'night', targetTime: Date.now() + 20000, willSkippers: [] });
                } else {
                  triggerNight(roomDocId, data.nightCount || 1);
                }
              }
              else if (phase === 'show_will') {
                if (data.willNextPhase === 'voting') triggerVoting(roomDocId);
                else triggerNight(roomDocId, data.nightCount || 1);
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

  return (
    <div className="game-container">
      
      {/* نافذة عرض الوصية مع زر التخطي الجماعي */}
      {phase === 'show_will' && inRoom && (
        <div className="will-overlay">
          <div className="will-paper">
            <h2 style={{ marginBottom: '10px', borderBottom: '2px dashed #b45309', paddingBottom: '10px' }}>📜 وصية ({recentlyDead})</h2>
            <p className="will-text">{wills[recentlyDead] || 'لا توجد وصية...'}</p>
            <p style={{ marginTop: '30px', fontSize: '16px', color: '#78350f', fontWeight: 'bold' }}>⏳ ستكمل اللعبة بعد {timeLeft} ثانية...</p>
            
            <button 
              onClick={skipWillReading} 
              disabled={willSkippers.includes(playerName)}
              style={{ 
                marginTop: '15px', 
                backgroundColor: willSkippers.includes(playerName) ? '#d97706' : '#b45309', 
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: willSkippers.includes(playerName) ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                width: '100%'
              }}
            >
              {willSkippers.includes(playerName) ? 'بانتظار موافقة البقية...' : `تخطي القراءة (${willSkippers.length}/${players.length}) ⏭️`}
            </button>
          </div>
        </div>
      )}

      {!inRoom ? (
        <div>
          <h1>🕵️‍♂️ لعبة المافيا</h1>
          <p>أدخل اسمك وكود الغرفة للعب</p>
          <input type="text" placeholder="اسمك..." value={playerName} onChange={e=>setPlayerName(e.target.value)} className="input-field"/>
          <button onClick={createRoom} className="btn btn-create">إنشاء غرفة جديد</button>
          <div style={{ marginTop: '15px' }}>
            <input type="text" placeholder="كود الغرفة" value={joinCode} onChange={e=>setJoinCode(e.target.value)} className="input-field"/>
            <button onClick={joinRoom} className="btn btn-join">انضمام لغرفة</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <button onClick={leaveRoom} style={{ backgroundColor: 'transparent', border: '1px solid #ef4444', padding: '5px 15px', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', transition: 'all 0.3s' }}>
              خروج من الغرفة 🚪
            </button>
          </div>

          {phase === 'waiting' && <h2>⏳ كود الغرفة: <span style={{ color: '#f43f5e' }}>{roomId}</span></h2>}
          {phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div className={`role-badge role-${myRole}`}>دورك: {myRole}</div>
              {!isAlive && <div style={{ color: '#ef4444', fontWeight: 'bold' }}>💀 تم إقصاؤك</div>}
            </div>
          )}

          {/* شاشة كتابة الوصية */}
          {phase === 'write_will' && (
            <div style={{ padding: '20px', backgroundColor: '#0f172a', borderRadius: '15px', border: '2px solid #f59e0b', textAlign: 'center' }}>
              <h2 style={{ color: '#f59e0b', fontSize: '28px' }}>📜 اكتب وصيتك!</h2>
              <p style={{ color: '#cbd5e1', fontSize: '15px', marginTop: '10px' }}>قبل توزيع البطاقات والأدوار، اكتب كلمتك الأخيرة. ستظهر للجميع إذا تم قتلك أو إعدامك.</p>
              <h1 style={{ color: timeLeft <= 15 ? '#ef4444' : 'white', margin: '15px 0' }}>⏳ {timeLeft} ثانية</h1>
              
              {!isWillSaved ? (
                <>
                  <textarea 
                    value={myWill} 
                    onChange={e => setMyWill(e.target.value.substring(0, 150))}
                    placeholder="اكتب وصيتك هنا (الحد الأقصى 150 حرف)..."
                    style={{ width: '100%', height: '100px', padding: '15px', borderRadius: '10px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569', marginTop: '10px', resize: 'none', fontSize: '16px' }}
                  />
                  <p style={{ fontSize: '14px', color: myWill.length >= 150 ? '#ef4444' : '#94a3b8', textAlign: 'left', margin: '5px 0' }}>{myWill.length}/150</p>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button onClick={() => saveWill('normal')} className="btn" style={{ backgroundColor: '#10b981', flex: 1, fontSize: '18px' }}>حفظ</button>
                    <button onClick={() => saveWill('skip')} className="btn" style={{ backgroundColor: '#64748b', flex: 1, fontSize: '18px' }}>تخطي ⏭️</button>
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
            <div style={{ padding: '20px', backgroundColor: '#0f172a', borderRadius: '15px', border: '2px dashed #475569', textAlign: 'center' }}>
              <h1>🎭 أهلاً بك في مدينة المافيا!</h1>
              <p>تم توزيع الأدوار، جاري كشف هويتك...</p>

              <div className="card-3d-container">
                <div className="card-3d">
                  <div className="card-face card-front">
                    <div className="role-icon">❓</div>
                    <div style={{fontSize: '20px'}}>بطاقتك</div>
                  </div>
                  <div className={`card-face card-back`} style={{ 
                    borderColor: myRole === 'مافيا' ? '#ef4444' : myRole === 'طبيب' ? '#10b981' : myRole === 'محقق' ? '#3b82f6' : '#f59e0b',
                    boxShadow: myRole === 'مافيا' ? '0 0 30px rgba(239, 68, 68, 0.6)' : myRole === 'طبيب' ? '0 0 30px rgba(16, 185, 129, 0.6)' : myRole === 'محقق' ? '0 0 30px rgba(59, 130, 246, 0.6)' : '0 0 30px rgba(245, 158, 11, 0.6)'
                  }}>
                    <div className="role-icon">
                      {myRole === 'مافيا' ? '🦹‍♂️' : myRole === 'طبيب' ? '👨‍⚕️' : myRole === 'محقق' ? '🕵️‍♂️' : '😇'}
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: myRole === 'مواطن' ? '#fde68a' : 'inherit' }}>
                      أنت: {myRole}
                    </div>
                  </div>
                </div>
              </div>

              {myRole === 'مافيا' && myMafiaMates.length > 0 && <h3 style={{ color: '#fca5a5', marginTop: '15px' }}>🤝 زميلك في المافيا هو: {myMafiaMates.join(' و ')}</h3>}
              <h2 style={{ color: '#10b981', marginTop: '20px' }}>⏳ ستبدأ الليلة الأولى بعد {timeLeft} ثانية...</h2>
            </div>
          )}

          {myRole === 'مافيا' && phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && myMafiaMates.length > 0 && (
            <div className="chat-container" style={{ borderColor: '#7f1d1d' }}>
              <div className="chat-title" style={{ color: '#fca5a5' }}>🤝 شات المافيا السري</div>
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
                  <button onClick={()=>sendMafia()} className="chat-send-btn mafia-btn">إرسال</button>
                </div>
              ) : (
                <p style={{ color: '#ef4444', fontSize: '14px' }}>🚫 لا يمكنك الكتابة لأنك مقصى.</p>
              )}
            </div>
          )}

          {myRole === 'محقق' && isAlive && (phase === 'voting' || phase === 'day_result') && (
            <div style={{ backgroundColor: '#450a0a', padding: '15px', borderRadius: '10px', marginTop: '10px', border: '1px solid #ef4444' }}>
              <h4 style={{ color: '#fca5a5', margin: '0 0 10px 0' }}>🚨 تضحية المحقق</h4>
              <p style={{ fontSize: '13px', margin: '0 0 10px 0' }}>اكشف هويتك وافضح متهم كدام الكل!</p>
              <select onChange={e=>setSacrificeTarget(e.target.value)} value={sacrificeTarget} className="target-select" style={{ borderColor: '#ef4444', padding: '8px' }}>
                <option value="">-- اختار المتهم لفضحه --</option>
                {alivePlayers.filter(p=>p!==playerName).map((p,i)=><option key={i} value={p}>{p}</option>)}
              </select>
              <button onClick={detectiveSacrifice} className="btn" style={{ backgroundColor: '#ef4444', margin: '10px 0 0 0' }}>فضح المتهم والخروج</button>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            {phase === 'waiting' && (
              <div>
                <h3>اللاعبين ({players.length}):</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {players.map((p,i)=><li key={i} style={{backgroundColor: '#334155', margin: '5px 0', padding: '10px', borderRadius: '8px'}}>{p}</li>)}
                </ul>
                {players[0] === playerName && <button onClick={startGame} className="btn btn-start">🔥 بدء اللعبة (يحتاج 3+)</button>}
              </div>
            )}

            {phase === 'night' && (
              <div>
                <h2>🌙 الليلة رقم {nightCount}</h2>
                <h1 style={{ color: timeLeft <= 30 ? '#ef4444' : 'white' }}>⏳ {Math.floor(timeLeft / 60)}:{timeLeft % 60 < 10 ? '0' : ''}{timeLeft % 60}</h1>
                {isAlive && myRole !== 'مواطن' && !hasActed && (
                  <div style={{ borderTop: '2px solid #334155', paddingTop: '15px', marginTop: '15px' }}>
                    <p>اختار هدفك:</p>
                    <select onChange={e=>setSelectedTarget(e.target.value)} value={selectedTarget} className="target-select">
                      <option value="">-- اختار لاعب --</option>
                      {myRole === 'مافيا' && <option value="skip">⏭️ تخطي (لا أريد القتل الليلة)</option>}
                      {alivePlayers.map((p, i) => {
                        if (p === playerName && myRole !== 'طبيب') return null; 
                        return <option key={i} value={p}>{p === playerName ? `${p} (أنا)` : p}</option>;
                      })}
                    </select>
                    <button onClick={submitNightAction} className="btn btn-action">تأكيد الاختيار</button>
                  </div>
                )}
                {hasActed && <p style={{ color: '#10b981', fontWeight: 'bold', fontSize:'20px', marginTop:'15px' }}>✅ تم تسجيل اختيارك!</p>}
                {investigateResult && <p style={{ color: '#f59e0b', fontWeight: 'bold', fontSize:'18px', marginTop:'10px' }}>{investigateResult}</p>}
              </div>
            )}

            {(phase === 'day_result' || phase === 'defense_result') && (
              <div>
                <h2 style={{ lineHeight: '1.5', whiteSpace: 'pre-line', textAlign: 'right', backgroundColor: '#1e293b', padding: '15px', borderRadius: '10px', border: '1px solid #334155' }}>
                  {nightLog}
                </h2>
                <h3 style={{ color: '#3b82f6', marginTop: '15px' }}>⏳ الانتقال للمرحلة القادمة بعد {timeLeft} ثانية...</h3>
              </div>
            )}

            {phase === 'voting' && (
              <div>
                <h2>🗳️ التصويت الجماعي (علني)</h2>
                <h3 style={{ color: timeLeft <= 60 ? '#ef4444' : '#10b981' }}>⏳ الوقت المتبقي: {Math.floor(timeLeft / 60)}:{timeLeft % 60 < 10 ? '0' : ''}{timeLeft % 60}</h3>
                
                <div className={`vote-item ${hasVoted && myVoteTarget !== 'skip' ? 'dimmed' : ''} ${myVoteTarget === 'skip' ? 'selected' : ''}`} style={{ backgroundColor: '#475569' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span>⏭️ تخطي (الأغلبية تلغي الإعدام)</span><br/>
                    {Object.entries(votes).filter(([v, t]) => t === 'skip').map(([v]) => <span key={v} className="voter-tag">{v}</span>)}
                  </div>
                  {isAlive && (
                    myVoteTarget === 'skip' ? (
                      <button onClick={withdrawVote} className="vote-btn" style={{backgroundColor: '#64748b'}}>سحب</button>
                    ) : (
                      <button onClick={()=>castVote('skip')} className="vote-btn">تصويت</button>
                    )
                  )}
                </div>

                {players.map((p, i) => (
                  <div key={i} className={`vote-item ${hasVoted && myVoteTarget !== p ? 'dimmed' : ''} ${myVoteTarget === p ? 'selected' : ''}`}>
                    <div style={{ textAlign: 'right' }}>
                      <span>👤 {p} {!alivePlayers.includes(p) && <span style={{color:'#ef4444'}}>(إقصاء 💀)</span>}</span><br/>
                      {Object.entries(votes).filter(([v, t]) => t === p).map(([v]) => <span key={v} className="voter-tag">{v}</span>)}
                    </div>
                    {isAlive && alivePlayers.includes(p) && (
                      myVoteTarget === p ? (
                        <button onClick={withdrawVote} className="vote-btn" style={{backgroundColor: '#64748b'}}>سحب</button>
                      ) : (
                        <button onClick={()=>castVote(p)} className="vote-btn">تصويت</button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

            {phase === 'defense' && (
              <div style={{ backgroundColor: '#450a0a', padding: '15px', borderRadius: '15px', border: '2px solid #ef4444' }}>
                <h2 style={{ color: '#fca5a5' }}>⚖️ محكمة المدينة!</h2>
                <h3 style={{ color: 'white' }}>المتهم: 🚨 {defendingPlayer} 🚨</h3>
                <h1 style={{ color: timeLeft <= 15 ? '#ef4444' : 'white' }}>⏳ {timeLeft} ثانية</h1>
                <p>أمامك دقيقة واحدة لتبرير موقفك بالدردشة وإقناعهم بسحب أصواتهم!</p>
                {isAlive && votes[playerName] === defendingPlayer && (
                  <button onClick={withdrawVote} className="btn" style={{ backgroundColor: '#10b981', marginTop: '15px' }}>✅ اقتنعت! (سحب تصويتي)</button>
                )}
              </div>
            )}

            {phase === 'game_over' && (
              <div>
                <h1>🎉 انتهاء اللعبة!</h1>
                <h2>الفائز هم: <span style={{ color: '#10b981' }}>{winner}</span></h2>
                {players[0] === playerName ? (
                  <button onClick={restartGame} className="btn btn-start" style={{ marginTop: '20px' }}>
                    🔄 إعادة اللعب (نفس اللاعبين)
                  </button>
                ) : (
                  <p style={{ color: '#f59e0b', marginTop: '20px' }}>ننتظر المضيف لإعادة تشغيل الغرفة...</p>
                )}
              </div>
            )}
          </div>

          {phase !== 'waiting' && phase !== 'game_over' && phase !== 'role_reveal' && phase !== 'write_will' && (
            <div className="chat-container">
              <div className="chat-title">💬 الدردشة العامة للمدينة</div>
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
                  <button onClick={sendGlobal} className="chat-send-btn">إرسال</button>
                </div>
              ) : (
                <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '10px' }}>🚫 تم إقصاؤك ولا يمكنك التحدث.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App