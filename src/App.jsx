import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { initialData } from './data';

function App() {
  const [gameState, setGameState] = useState('start'); // 'start', 'playing', 'result'
  const [currentMatches, setCurrentMatches] = useState(initialData);
  const [nextRoundWinners, setNextRoundWinners] = useState([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [tournamentHistory, setTournamentHistory] = useState([]);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const audioRef = useRef(null);

  // Load from local storage
  useEffect(() => {
    const savedState = localStorage.getItem('tournamentState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.gameState === 'playing' || parsed.gameState === 'result') {
           setGameState(parsed.gameState);
           setCurrentMatches(parsed.currentMatches);
           setNextRoundWinners(parsed.nextRoundWinners);
           setMatchIndex(parsed.matchIndex);
           setTournamentHistory(parsed.tournamentHistory || []);
        }
      } catch(e) {
        console.error("Failed to parse local storage", e);
      }
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    if (gameState !== 'start') {
      localStorage.setItem('tournamentState', JSON.stringify({
        gameState, currentMatches, nextRoundWinners, matchIndex, tournamentHistory
      }));
    } else {
      localStorage.removeItem('tournamentState');
    }
  }, [gameState, currentMatches, nextRoundWinners, matchIndex, tournamentHistory]);

  // Eager load images non-blocking
  useEffect(() => {
    const images = new Set();
    initialData.forEach(match => {
      images.add(match.songA);
      images.add(match.songB);
    });
    images.forEach(song => {
      const img = new Image();
      img.src = `/covers/${song}.webp`;
    });
  }, []);

  const playBGM = () => {
    if (!audioRef.current || audioPlayed) return;
    const audio = audioRef.current;
    audio.volume = 0;
    audio.play().then(() => {
      setAudioPlayed(true);
      // fade in
      let vol = 0;
      const interval = setInterval(() => {
        if (vol < 0.95) {
          vol += 0.05;
          audio.volume = vol;
        } else {
          audio.volume = 1;
          clearInterval(interval);
        }
      }, 150);
    }).catch(err => console.log('Audio autoplay blocked:', err));
  };

  const startGame = () => {
    playBGM();
    setGameState('playing');
  };

  const handleVote = (winnerSong) => {
    const currentMatch = currentMatches[matchIndex];
    const roundStr = currentMatches.length * 2;

    // Use functional state updates to prevent race conditions from rapid clicking
    setTournamentHistory(prev => {
      let newHistory = [...prev];
      let roundObjIdx = newHistory.findIndex(r => r.round === roundStr);
      let roundObj;
      if (roundObjIdx === -1) {
        roundObj = { round: roundStr, matches: [] };
        newHistory.push(roundObj);
        roundObjIdx = newHistory.length - 1;
      } else {
        roundObj = { ...newHistory[roundObjIdx], matches: [...newHistory[roundObjIdx].matches] };
        newHistory[roundObjIdx] = roundObj;
      }
      
      const matchExists = roundObj.matches.some(m => m.songA === currentMatch.songA && m.songB === currentMatch.songB);
      if (!matchExists) {
        roundObj.matches.push({
          songA: currentMatch.songA,
          songB: currentMatch.songB,
          winner: winnerSong
        });
      }
      return newHistory;
    });

    // Call API without blocking UI
    fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner: winnerSong })
    }).catch(e => console.error(e));

    setNextRoundWinners(prevWinners => {
      const newWinners = [...prevWinners, winnerSong];
      
      if (matchIndex + 1 < currentMatches.length) {
        setMatchIndex(matchIndex + 1);
        return newWinners;
      } else {
        // Round Finished
        if (newWinners.length === 1) {
          setGameState('result');
          return newWinners;
        } else {
          const nextMatches = [];
          for (let i = 0; i < newWinners.length; i += 2) {
            if (newWinners[i] && newWinners[i+1]) {
              nextMatches.push({ songA: newWinners[i], songB: newWinners[i+1] });
            }
          }
          setCurrentMatches(nextMatches);
          setMatchIndex(0);
          return []; // clear for next round
        }
      }
    });
  };

  const saveBracket = async () => {
    const wrapper = document.getElementById('bracket-wrapper');
    if (!wrapper) return;
    
    const table = wrapper.querySelector('table');
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.top = '-9999px';
    tempDiv.style.left = '0';
    tempDiv.style.background = '#ffffff'; // White background for the image
    tempDiv.style.color = '#333333';
    tempDiv.style.padding = '30px';
    tempDiv.style.borderRadius = '16px';
    
    const clonedTable = table.cloneNode(true);
    clonedTable.style.width = 'max-content';
    tempDiv.appendChild(clonedTable);

    const watermark = document.createElement('div');
    watermark.style.textAlign = 'right';
    watermark.style.marginTop = '20px';
    watermark.style.fontSize = '14px';
    watermark.style.color = '#888888';
    watermark.innerText = '来源：https://lin-tournament.vercel.app/';
    tempDiv.appendChild(watermark);
    
    document.body.appendChild(tempDiv);
    
    try {
      const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = '林家谦锦标赛对阵图.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert('保存截图失败，请重试！');
    } finally {
      document.body.removeChild(tempDiv);
    }
  };

  const restart = () => {
    setGameState('start');
    setCurrentMatches(initialData);
    setNextRoundWinners([]);
    setMatchIndex(0);
    setTournamentHistory([]);
  };

  const renderStart = () => (
    <div className="center-screen" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div className="hero-content">
        <div style={{fontSize: '3rem', marginBottom: '15px', color: '#fff', textShadow: '0 0 20px rgba(255,255,255,0.3)'}}>✦</div>
        <h1 className="app-title">林家谦锦标赛</h1>
        <p className="app-subtitle" style={{letterSpacing: '2px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: '30px'}}>Terence Lam Tournament</p>
        
        {tournamentHistory.length > 0 ? (
          <div className="start-actions" style={{display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px'}}>
            <button className="start-btn pulse-btn" onClick={() => { playBGM(); setGameState('playing'); }} style={{background: '#ffffff', color: '#000000', boxShadow: '0 8px 25px rgba(255, 255, 255, 0.25)', fontSize: '1.1rem', padding: '15px', border: 'none', width: '100%', borderRadius: '50px', fontWeight: 'bold'}}>继续进度</button>
            <button className="start-btn outline-btn" onClick={restart} style={{fontSize: '1.1rem', padding: '15px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', width: '100%', borderRadius: '50px', fontWeight: 'bold'}}>重新开始</button>
          </div>
        ) : (
          <div className="start-actions" style={{marginTop: '40px'}}>
            <button className="start-btn pulse-btn" onClick={startGame} style={{background: '#ffffff', color: '#000000', boxShadow: '0 8px 25px rgba(255, 255, 255, 0.25)', fontSize: '1.2rem', padding: '15px 40px', border: 'none', width: '100%', borderRadius: '50px', fontWeight: 'bold'}}>开始评选</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderPlaying = () => {
    const match = currentMatches[matchIndex];
    if (!match) return null;

    const roundTotal = currentMatches.length * 2;
    const title = roundTotal === 2 ? "决赛 (Final)" : `${roundTotal} 进 ${roundTotal / 2}`;
    
    let displayZone = match.zone;
    let displayRemark = match.remark;
    
    if (!displayZone && !displayRemark) {
      if (roundTotal === 16) {
        displayZone = "十六强赛：诸神之战";
        displayRemark = "能够从首轮杀出重围的，皆是你的心头挚爱。但在这一轮，必须忍痛割爱。是更动人的旋律，还是更深刻的共鸣？";
      } else if (roundTotal === 8) {
        displayZone = "八强赛：巅峰对决";
        displayRemark = "留下来的8首歌，代表了你对林家谦音乐的最高审美。它们之间的碰撞，每一场都是火星撞地球般的艰难抉择。";
      } else if (roundTotal === 4) {
        displayZone = "半决赛：王座之争";
        displayRemark = "只剩最后4首！每一首都是无可替代的灵魂之作。究竟谁能站上最终的决赛舞台？听从你内心最深处的声音。";
      } else if (roundTotal === 2) {
        displayZone = "🏆 总决赛：巅峰王座 🏆";
        displayRemark = "漫长的角逐终于来到终点。在巅峰相见的这两首旷世之作中，谁才是你心中无可替代的林氏金曲 Top 1？";
      }
    }

    return (
      <div className="app-container" style={{ animation: 'fadeIn 0.5s ease-out' }}>
        <div className="top-section">
          <div className="round-title">{title} - {matchIndex + 1}/{currentMatches.length}</div>
          {displayZone && <div className="zone-title">{displayZone}</div>}
          {displayRemark && <div className="remark-text">{displayRemark}</div>}
        </div>
        <div className="cards-container">
          <div className="song-card" onClick={() => handleVote(match.songA)}>
            <img className="album-cover" src={`/covers/${match.songA}.webp`} alt={match.songA} />
            <div className="song-name">{match.songA}</div>
          </div>
          <div className="vs-badge">VS</div>
          <div className="song-card" onClick={() => handleVote(match.songB)}>
            <img className="album-cover" src={`/covers/${match.songB}.webp`} alt={match.songB} />
            <div className="song-name">{match.songB}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderResult = () => {
    // If somehow nextRoundWinners is empty, fallback to the last winner in history
    const champion = nextRoundWinners[0] || (tournamentHistory.length > 0 ? tournamentHistory[tournamentHistory.length-1]?.matches?.[0]?.winner : "未知");
    
    const rounds = [];
    if (tournamentHistory.length > 0) {
      // Find rounds dynamically to handle partial histories gracefully
      const roundNumbers = [32, 16, 8, 4, 2];
      roundNumbers.forEach(rNum => {
         const r = tournamentHistory.find(h => h.round === rNum);
         if (r) rounds.push(r.matches);
      });
    }
    
    const songs32 = initialData.flatMap(m => [m.songA, m.songB]);

    return (
      <div className="app-container result-screen" style={{ animation: 'fadeIn 0.5s ease-out' }}>
        <div className="champion-section" style={{flexShrink: 0}}>
          <h2 style={{fontSize: '1.8rem', color: '#ffffff', textShadow: '0 0 20px rgba(255,255,255,0.4)', letterSpacing: '5px', margin: '10px 0 20px 0'}}>最终冠军</h2>
          <div className="champion-card">
            <img className="album-cover" src={`/covers/${champion}.webp`} alt="champion" />
          </div>
          <div style={{fontSize: '1.6rem', marginTop: '20px', color: '#e0e0e0', fontWeight: 'bold', letterSpacing: '2px', textAlign: 'center'}}>{champion}</div>
          <p className="champion-subtitle">这是你心中的终极浪漫！</p>
        </div>
        
        {rounds.length > 0 && (
          <div id="bracket-wrapper" style={{width: '100%', maxHeight: '45vh', background: 'white', padding: '10px', borderRadius: '8px', marginBottom: '30px', overflow: 'auto', flexShrink: 0}}>
            <h3 style={{color: '#333', textAlign: 'center', marginBottom: '15px', position: 'sticky', left: 0}}>晋级对阵图</h3>
            <table className="bracket-table">
              <tbody>
                {songs32.map((song, i) => {
                   const winner32 = rounds[0] ? rounds[0][Math.floor(i/2)]?.winner : null;
                   const winner16 = rounds[1] ? rounds[1][Math.floor(i/4)]?.winner : null;
                   const winner8  = rounds[2] ? rounds[2][Math.floor(i/8)]?.winner : null;
                   const winner4  = rounds[3] ? rounds[3][Math.floor(i/16)]?.winner : null;
                   const champ    = rounds[4] ? rounds[4][0]?.winner : null;
                   
                   return (
                     <tr key={i}>
                       <td className="bracket-cell col-color-0">{song}</td>
                       {i % 2 === 0 && <td className="bracket-cell col-color-1" rowSpan={2}>{winner32 || ''}</td>}
                       {i % 4 === 0 && <td className="bracket-cell col-color-2" rowSpan={4}>{winner16 || ''}</td>}
                       {i % 8 === 0 && <td className="bracket-cell col-color-0" rowSpan={8}>{winner8 || ''}</td>}
                       {i % 16 === 0 && <td className="bracket-cell col-color-1" rowSpan={16}>{winner4 || ''}</td>}
                       {i % 32 === 0 && <td className="bracket-cell col-color-2" rowSpan={32}>{champ || ''}</td>}
                     </tr>
                   )
                })}
              </tbody>
            </table>
          </div>
        )}

          <div className="action-buttons" style={{marginTop: '20px', flexShrink: 0}}>
            <button className="action-btn modern-btn" onClick={saveBracket} style={{background: '#ffffff', color: '#000000', boxShadow: '0 8px 25px rgba(255, 255, 255, 0.25)', fontSize: '1.1rem', padding: '15px', border: 'none'}}>保存对阵图</button>
            <button className="action-btn" onClick={() => { setGameState('start'); setTournamentHistory([]); }} style={{background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '1.1rem', padding: '15px', boxShadow: 'none'}}>再玩一次</button>
          </div>
      </div>
    );
  };

  return (
    <>
      <div className="glass-overlay"></div>
      <audio ref={audioRef} src="/bgm.mp3" loop preload="none"></audio>
      {gameState === 'start' && renderStart()}
      {gameState === 'playing' && renderPlaying()}
      {gameState === 'result' && renderResult()}
    </>
  );
}

export default App;
