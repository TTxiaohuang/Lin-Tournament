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
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [nickname, setNickname] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
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
    if (gameState === 'start') {
      localStorage.removeItem('tournamentState');
    } else if (gameState !== 'leaderboard') {
      localStorage.setItem('tournamentState', JSON.stringify({
        gameState, currentMatches, nextRoundWinners, matchIndex, tournamentHistory
      }));
    }
    // 'leaderboard' 状态不保存也不清除，保留上一个有效状态
  }, [gameState, currentMatches, nextRoundWinners, matchIndex, tournamentHistory]);

  // 记录独立访客
  useEffect(() => {
    if (!localStorage.getItem('has_visited_tournament')) {
      fetch('/api/visit', { method: 'POST' }).catch(() => {});
      localStorage.setItem('has_visited_tournament', 'true');
    }
  }, []);

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
    
    // 乐观更新状态，让图标立即改变
    setAudioPlayed(true);
    setIsMusicPlaying(true);

    audio.play().then(() => {
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
    }).catch(err => {
      console.log('Audio autoplay blocked:', err);
      setIsMusicPlaying(false);
    });
  };

  const toggleMusic = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isMusicPlaying) {
      audio.pause();
      setIsMusicPlaying(false);
    } else {
      setIsMusicPlaying(true);
      setAudioPlayed(true);
      audio.volume = 1; // 明确点击强制恢复正常音量
      audio.play().catch(err => {
        console.log('Play blocked', err);
        setIsMusicPlaying(false);
      });
    }
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

    // 仅当这是最终的决赛（只有一场对决）时，才调用 API 记录最终冠军
    if (currentMatches.length === 1) {
      fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner: winnerSong })
      }).catch(e => console.error(e));
    }

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

    // Top-left title
    const titleEl = document.createElement('div');
    titleEl.style.textAlign = 'left';
    titleEl.style.marginBottom = '15px';
    titleEl.style.fontSize = '20px';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.color = '#333333';
    titleEl.innerText = '林家谦二选一';
    tempDiv.appendChild(titleEl);
    
    const clonedTable = table.cloneNode(true);
    clonedTable.style.width = 'max-content';
    clonedTable.style.borderCollapse = 'collapse';
    clonedTable.style.color = '#333333';
    clonedTable.style.textAlign = 'center';
    clonedTable.style.fontSize = '14px';

    const cells = clonedTable.querySelectorAll('td, th');
    cells.forEach(cell => {
      cell.style.border = '1px solid #999999';
      cell.style.padding = '6px 4px';
      cell.style.verticalAlign = 'middle';
      cell.style.fontWeight = '500';
      cell.style.color = '#333333';
      
      if (cell.classList.contains('col-color-0')) {
        cell.style.backgroundColor = '#d9e5f3';
      } else if (cell.classList.contains('col-color-1')) {
        cell.style.backgroundColor = '#fff1ce';
      } else if (cell.classList.contains('col-color-2')) {
        cell.style.backgroundColor = '#f7e0d3';
      } else {
        cell.style.backgroundColor = '#ffffff';
      }
    });

    tempDiv.appendChild(clonedTable);

    // Bottom-left "by: nickname"
    const bottomRow = document.createElement('div');
    bottomRow.style.display = 'flex';
    bottomRow.style.justifyContent = 'space-between';
    bottomRow.style.alignItems = 'center';
    bottomRow.style.marginTop = '20px';
    bottomRow.style.fontSize = '14px';

    const byEl = document.createElement('div');
    byEl.style.textAlign = 'left';
    byEl.style.color = '#555555';
    byEl.style.fontWeight = 'bold';
    byEl.innerText = nickname.trim() ? `By: ${nickname.trim()}` : 'By: 匿名';
    bottomRow.appendChild(byEl);

    const watermark = document.createElement('div');
    watermark.style.textAlign = 'right';
    watermark.style.color = '#888888';
    watermark.innerText = '来源：https://lin-tournament.vercel.app/';
    bottomRow.appendChild(watermark);

    tempDiv.appendChild(bottomRow);
    
    document.body.appendChild(tempDiv);
    
    try {
      const canvas = await html2canvas(tempDiv, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          clonedDoc.body.style.background = 'none';
          const appContainer = clonedDoc.querySelector('.app-container');
          if (appContainer) appContainer.style.display = 'none';
          const glassOverlay = clonedDoc.querySelector('.glass-overlay');
          if (glassOverlay) glassOverlay.style.display = 'none';
        }
      });
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

  const showLeaderboard = () => {
    setGameState('leaderboard');
    setLeaderboardLoading(true);
    setLeaderboardError('');
    fetch('/api/leaderboard')
      .then(res => {
        if (!res.ok) throw new Error('请求失败');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setLeaderboard(data);
        } else {
          setLeaderboard(data.leaderboard || []);
          setTotalVisitors(data.totalVisitors || 0);
        }
        setLeaderboardLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLeaderboardError('加载排行榜失败，请稍后重试');
        setLeaderboardLoading(false);
      });
  };

  const renderLeaderboard = () => {
    const myChampion = nextRoundWinners[0] || (tournamentHistory.length > 0 ? tournamentHistory[tournamentHistory.length-1]?.matches?.[0]?.winner : null);
    const maxVotes = leaderboard.length > 0 ? leaderboard[0].votes : 1;
    // 使用所有 32 首歌计算真实总夺冠数，用于进度条比例
    const totalChampionVotes = leaderboard.reduce((sum, item) => sum + item.votes, 0);

    // 排名徽章：圆形渐变背景 + 数字
    const RankBadge = ({ rank }) => {
      const gradients = {
        1: { from: '#FFE082', to: '#FFA000', text: '#3E2723', glow: 'rgba(255,193,7,0.5)' },
        2: { from: '#E0E0E0', to: '#9E9E9E', text: '#212121', glow: 'rgba(189,189,189,0.4)' },
        3: { from: '#D7A86E', to: '#8D6E4F', text: '#FFFFFF', glow: 'rgba(141,110,79,0.4)' }
      };
      const g = gradients[rank] || { from: 'rgba(255,255,255,0.12)', to: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.7)', glow: 'transparent' };
      const isTop3 = rank <= 3;
      return (
        <div style={{
          width: isTop3 ? '36px' : '28px',
          height: isTop3 ? '36px' : '28px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${g.from} 0%, ${g.to} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: g.text,
          fontWeight: '800',
          fontSize: isTop3 ? '0.95rem' : '0.8rem',
          flexShrink: 0,
          boxShadow: isTop3 ? `0 4px 12px ${g.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` : 'none',
          fontFamily: "'SF Mono', 'Roboto Mono', monospace",
          letterSpacing: '0'
        }}>
          {rank}
        </div>
      );
    };

    // 王冠矢量图标（仅 Top 1）
    const CrownIcon = () => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))'}}>
        <path d="M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5zm0 2h14v2H5v-2z"/>
      </svg>
    );

    // 勾选图标（你的选择标记）
    const CheckIcon = () => (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    );

    // 单条排行榜卡片
    const RankCard = ({ item, index }) => {
      const rank = index + 1;
      const isTop1 = rank === 1;
      const isMine = item.songName === myChampion;
      const barWidth = (item.votes / maxVotes * 100);
      const percent = totalChampionVotes > 0 ? (item.votes / totalChampionVotes * 100) : 0;

      return (
        <div style={{
          position: 'relative',
          background: isTop1
            ? 'linear-gradient(135deg, rgba(255,224,130,0.18) 0%, rgba(255,160,0,0.08) 100%)'
            : isMine
              ? 'rgba(255,204,0,0.10)'
              : 'rgba(255,255,255,0.06)',
          border: isTop1
            ? '1px solid rgba(255,193,7,0.45)'
            : isMine
              ? '1px solid rgba(255,204,0,0.4)'
              : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px',
          padding: isTop1 ? '14px 14px' : '11px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: isTop1
            ? '0 8px 24px rgba(255,160,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <RankBadge rank={rank} />

          <div style={{position: 'relative', flexShrink: 0}}>
            <img
              src={`/covers/${item.songName}.webp`}
              alt={item.songName}
              style={{
                width: isTop1 ? '52px' : '46px',
                height: isTop1 ? '52px' : '46px',
                borderRadius: '10px',
                objectFit: 'cover',
                boxShadow: '0 4px 10px rgba(0,0,0,0.4)'
              }}
              onError={(e) => { e.target.style.opacity = '0.2'; }}
            />
            {isTop1 && (
              <div style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFE082 0%, #FFA000 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3E2723',
                boxShadow: '0 2px 6px rgba(255,160,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
              }}>
                <CrownIcon />
              </div>
            )}
          </div>

          <div style={{flex: 1, minWidth: 0}}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px'
            }}>
              <div style={{
                color: isTop1 ? '#FFF8E1' : '#ffffff',
                fontWeight: isTop1 ? '700' : '600',
                fontSize: isTop1 ? '1rem' : '0.9rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '0.3px',
                flex: 1,
                minWidth: 0
              }}>
                {item.songName}
              </div>
              {isMine && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 7px 2px 5px',
                  background: 'linear-gradient(135deg, rgba(255,204,0,0.3) 0%, rgba(255,170,0,0.2) 100%)',
                  border: '1px solid rgba(255,204,0,0.5)',
                  borderRadius: '10px',
                  color: '#FFD54F',
                  fontSize: '0.65rem',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  flexShrink: 0
                }}>
                  <CheckIcon />
                  <span>你的选择</span>
                </div>
              )}
            </div>

            {/* 进度条 */}
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <div style={{
                flex: 1,
                height: '4px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: isTop1
                    ? 'linear-gradient(90deg, #FFD54F 0%, #FFA000 100%)'
                    : 'linear-gradient(90deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 100%)',
                  borderRadius: '2px',
                  transition: 'width 0.6s cubic-bezier(0.25, 0.8, 0.25, 1)'
                }}></div>
              </div>
              <div style={{
                color: isTop1 ? '#FFD54F' : 'rgba(255,255,255,0.55)',
                fontSize: '0.7rem',
                fontWeight: '500',
                flexShrink: 0,
                minWidth: '38px',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.3px'
              }}>
                {percent.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* 票数 */}
          <div style={{
            flexShrink: 0,
            textAlign: 'right',
            minWidth: '42px'
          }}>
            <div style={{
              color: isTop1 ? '#FFD54F' : '#ffffff',
              fontWeight: '700',
              fontSize: isTop1 ? '1.15rem' : '0.95rem',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1
            }}>
              {item.votes}
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: '0.65rem',
              marginTop: '3px',
              letterSpacing: '1px'
            }}>
              票
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="app-container" style={{ animation: 'fadeIn 0.5s ease-out', alignItems: 'center' }}>
        {/* 头部 */}
        <div style={{textAlign: 'center', marginBottom: '22px', flexShrink: 0}}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 14px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '20px',
            marginBottom: '14px'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10"/>
              <path d="M12 20V4"/>
              <path d="M6 20v-6"/>
            </svg>
            <span style={{color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '500'}}>Leaderboard</span>
          </div>
          <h2 style={{
            fontSize: '1.6rem',
            color: '#ffffff',
            margin: '0 0 6px 0',
            letterSpacing: '4px',
            fontWeight: '300',
            textShadow: '0 2px 12px rgba(0,0,0,0.4)'
          }}>网友们的选择</h2>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.95rem',
            margin: '0',
            letterSpacing: '1px'
          }}>
            {leaderboardLoading ? '正在统计...' : (totalVisitors > 0 ? `共 ${totalVisitors} 位网友参与` : '暂无数据')}
          </p>
        </div>

        {/* 你的冠军标记 */}
        {myChampion && (
          <div style={{
            width: '100%',
            background: 'linear-gradient(135deg, rgba(255,204,0,0.12) 0%, rgba(255,170,0,0.04) 100%)',
            border: '1px solid rgba(255,204,0,0.3)',
            borderRadius: '12px',
            padding: '11px 16px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            flexShrink: 0
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#FFD54F',
              boxShadow: '0 0 8px rgba(255,213,79,0.8)',
              flexShrink: 0
            }}></div>
            <span style={{color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', letterSpacing: '0.5px'}}>你选出的冠军</span>
            <span style={{color: '#FFD54F', fontWeight: '600', fontSize: '0.9rem', letterSpacing: '0.5px'}}>{myChampion}</span>
          </div>
        )}

        {/* 排行榜列表 */}
        <div style={{width: '100%', flex: 1, overflowY: 'auto', paddingBottom: '20px', display: 'flex', flexDirection: 'column', gap: '9px'}}>
          {leaderboardError && (
            <div style={{
              color: '#FF8A80',
              textAlign: 'center',
              padding: '50px 20px',
              fontSize: '0.9rem',
              letterSpacing: '0.5px'
            }}>{leaderboardError}</div>
          )}

          {leaderboardLoading && (
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '50px 20px'}}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid rgba(255,255,255,0.15)',
                borderTopColor: '#FFD54F',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}></div>
              <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', letterSpacing: '1px'}}>加载中</div>
            </div>
          )}

          {!leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '50px 20px',
              color: 'rgba(255,255,255,0.45)'
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '12px'}}>
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
              <div style={{fontSize: '0.85rem', letterSpacing: '0.5px'}}>还没有数据</div>
              <div style={{fontSize: '0.7rem', marginTop: '4px', color: 'rgba(255,255,255,0.35)'}}>快去玩一局成为第一位</div>
            </div>
          )}

          {!leaderboardLoading && !leaderboardError && leaderboard.length > 0 && (
            leaderboard.slice(0, 10).map((item, index) => (
              <RankCard key={item.songName} item={item} index={index} />
            ))
          )}
        </div>

        {/* 返回按钮 */}
        <div className="action-buttons" style={{marginTop: '15px', flexShrink: 0}}>
          <button
            className="action-btn modern-btn"
            onClick={() => setGameState('result')}
            style={{
              background: '#ffffff',
              color: '#000000',
              boxShadow: '0 8px 25px rgba(255, 255, 255, 0.25)',
              fontSize: '1.1rem',
              padding: '15px',
              border: 'none'
            }}>
            返回
          </button>
        </div>
      </div>
    );
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

          <div style={{width: '100%', flexShrink: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px'}}>
            <label htmlFor="nickname-input" style={{color: "#ffffff", fontSize: "0.95rem", fontWeight: "bold", letterSpacing: "1px", textShadow: "0 2px 6px rgba(0,0,0,0.6)", flexShrink: 0}}>By</label>
            <input
              id="nickname-input"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入你的昵称"
              maxLength={20}
              style={{
                flex: 1,
                padding: '12px 18px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '50px',
                color: '#333333',
                fontSize: '0.95rem',
                fontWeight: '500',
                outline: 'none',
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
              }}
            />
          </div>

          <div className="action-buttons" style={{marginTop: '20px', flexShrink: 0}}>
            <button className="action-btn modern-btn" onClick={saveBracket} style={{background: '#ffffff', color: '#000000', boxShadow: '0 8px 25px rgba(255, 255, 255, 0.25)', fontSize: '1.1rem', padding: '15px', border: 'none'}}>保存对阵图</button>
            <button className="action-btn" onClick={showLeaderboard} style={{background: 'linear-gradient(135deg, #ffcc00 0%, #ffaa00 100%)', color: '#333333', border: 'none', fontSize: '1.1rem', padding: '15px', boxShadow: '0 8px 25px rgba(255, 170, 0, 0.4)', fontWeight: 'bold'}}>看看网友们的选择</button>
            <button className="action-btn" onClick={() => { setCurrentMatches(initialData); setNextRoundWinners([]); setMatchIndex(0); setTournamentHistory([]); setGameState('playing'); }} style={{background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '1.1rem', padding: '15px', boxShadow: 'none'}}>再玩一次</button>
          </div>
      </div>
    );
  };

  return (
    <>
      <div className="glass-overlay"></div>
      <div style={{
        position: 'fixed',
        top: '25px',
        right: '25px',
        zIndex: 1000,
        cursor: 'pointer',
        color: 'rgba(255, 255, 255, 0.85)',
        transition: 'color 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
      }} 
      onClick={toggleMusic}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'; e.currentTarget.style.transform = 'scale(1)'; }}>
        <div style={{ animation: isMusicPlaying ? 'float 4s ease-in-out infinite' : 'none' }}>
          {isMusicPlaying ? (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))', opacity: 0.6 }}>
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
              <line x1="3" y1="3" x2="21" y2="21" strokeWidth="1.5"></line>
            </svg>
          )}
        </div>
      </div>
      <audio 
        ref={audioRef} 
        src="/bgm.mp3" 
        preload="auto"
        onEnded={(e) => {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(console.error);
          }
        }}
      ></audio>
      {gameState === 'start' && renderStart()}
      {gameState === 'playing' && renderPlaying()}
      {gameState === 'result' && renderResult()}
      {gameState === 'leaderboard' && renderLeaderboard()}

      {/* 隐藏的图片强制预加载层：确保在快速点击时图片无需等待网络请求 */}
      <div id="image-preloader" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none', zIndex: -999 }}>
        {Array.from(new Set(initialData.flatMap(m => [m.songA, m.songB]))).map(song => (
          <img key={song} src={`/covers/${song}.webp`} alt="" />
        ))}
      </div>
    </>
  );
}

export default App;
