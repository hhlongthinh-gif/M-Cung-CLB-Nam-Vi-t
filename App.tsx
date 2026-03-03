import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BoardSpace, Zombie, Character, Player, CharacterType, VictoryInfo, GameMode } from './types';
import confetti from 'canvas-confetti';

const BOARD_W = 7; 
const BOARD_H = 7; 
const TOTAL_TILES = BOARD_W * BOARD_H; 
const MOVE_STEP_DELAY = 220; 
const ZOMBIE_COUNT = 5;
const BOMB_COUNT = 5;
const CLOVER_COUNT = 5;
const TRAP_COUNT = 4;
const MAX_PLAYER_HEALTH = 3;
const MAX_ZOMBIE_HEALTH = 2;
const APP_SCALE = 1.0;

const BASIC_EMOJIS = ['🥷', '💂', '👮', '🕵️', '👩‍🚀', '🦸', '🦹', '👷', '🤺', '⚔️', '🛡️', '🏹'];

const CHARACTERS: Character[] = [
  { type: 'wizard', emoji: '🧙🏻‍♀️', name: 'Phù thủy', ability: 'Nếu bước là 1, 1 đối thủ sẽ bị di chuyển lùi ở lượt sau.' },
  { type: 'unicorn', emoji: '🦄', name: 'Kỳ lân', ability: 'Nếu bước là 1, bản thân hoặc đồng đội được x2 số bước ở lượt sau.' },
  { type: 'phoenix', emoji: '🐼', name: 'Gấu trúc', ability: 'Nếu bước là 1, hồi đầy máu cho toàn bộ thành viên trong đội.' },
  { type: 'ninja', emoji: '🥷🏻', name: 'Ninja', ability: 'Nếu bước là 1, cộng thêm 5 bước di chuyển cho bản thân hoặc đồng đội.' },
  { type: 'mermaid', emoji: '🧜🏻‍♂️', name: 'Mỹ nhân ngư', ability: 'Nếu bước là 1, trừ 2 vạch máu của cả 2 thành viên đội đối thủ.' },
  { type: 'dinosaur', emoji: '🦖', name: 'Khủng long', ability: 'Nếu bước là 1, trừ 5 ô di chuyển của 1 thành viên đội đối thủ.' },
  { type: 'snowman', emoji: '☃️', name: 'Người tuyết', ability: 'Nếu bước là 1, vô hiệu hóa 1 lượt đi của 1 thành viên đội đối thủ.' },
];

const BoardTile: React.FC<{ 
  space: BoardSpace; 
  tileSize: number; 
  isBomb?: boolean;
  isZombieSpawn?: boolean;
  isClover?: boolean;
  isTrap?: boolean;
}> = React.memo(({ space, tileSize, isBomb, isZombieSpawn, isClover, isTrap }) => {
  const isStart = space.id === 0;
  const isGoal = space.id === TOTAL_TILES - 1;
  
  let bgColor = '';
  if (isStart) bgColor = 'bg-green-100 border-green-200';
  else if (isGoal) bgColor = 'bg-yellow-400 border-yellow-600';
  else if (isBomb) bgColor = 'bg-red-100 border-red-200';
  else if (isZombieSpawn) bgColor = 'bg-purple-100 border-purple-200';
  else if (isClover) bgColor = 'bg-emerald-100 border-emerald-200';
  else if (isTrap) bgColor = 'bg-orange-200 border-orange-400';
  else {
    // Colorful tiles based on ID
    const colors = ['bg-blue-50', 'bg-pink-50', 'bg-yellow-50', 'bg-indigo-50', 'bg-teal-50'];
    bgColor = colors[space.id % colors.length] + ' border-gray-100';
  }

  return (
    <div 
      className={`absolute sudoku-tile flex items-center justify-center transition-all duration-500 ${bgColor}`}
      style={{ left: space.x, top: space.y, width: tileSize, height: tileSize }}
    >
      <span className="text-[10px] font-black text-blue-600 absolute top-1 left-1 tracking-tighter">{space.id + 1}</span>
      {isStart && <span className="text-[12px] font-black text-white uppercase tracking-widest">ĐI</span>}
      {isGoal && <span className="text-[12px] font-black text-white uppercase tracking-widest">ĐÍCH</span>}
      {isBomb && <span className="text-xl drop-shadow-sm opacity-25">💣</span>}
      {isZombieSpawn && <span className="text-xl drop-shadow-sm opacity-25">🧟</span>}
      {isClover && <span className="text-xl drop-shadow-sm opacity-25">🍀</span>}
      {isTrap && <span className="text-xl drop-shadow-sm opacity-25">🪤</span>}
    </div>
  );
});

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'start' | 'mode_selection' | 'player_count' | 'selection' | 'playing' | 'victory'>('start');
  const [gameMode, setGameMode] = useState<GameMode>('advanced_manual');
  const [playerCount, setPlayerCount] = useState(2);
  const [diceValue, setDiceValue] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [darkMode, setDarkMode] = useState(false); // Bright mode for cartoon
  const [selectionSlot, setSelectionSlot] = useState(0);
  const [selectedCharacters, setSelectedCharacters] = useState<(Character | null)[]>([null, null, null, null]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [skillTargeting, setSkillTargeting] = useState<{ steps: number; player: Player } | null>(null);
  const [isAimingBomb, setIsAimingBomb] = useState(false);

  const [zombies, setZombies] = useState<Zombie[]>([]);
  const [bombIndices, setBombIndices] = useState<number[]>([]);
  const [zombieSpawnIndices, setZombieSpawnIndices] = useState<number[]>([]);
  const [cloverIndices, setCloverIndices] = useState<number[]>([]);
  const [trapIndices, setTrapIndices] = useState<number[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'info' | 'warning' | 'error' | 'success'; icon: string }[]>([]);
  const [hasSeenTrapExplanation, setHasSeenTrapExplanation] = useState(false);
  const [activeEffect, setActiveEffect] = useState<{ type: 'trap' | 'zombie' | 'combat'; pos: number; message?: string } | null>(null);
  const [victoryInfo, setVictoryInfo] = useState<VictoryInfo | null>(null);
  const [tileSize, setTileSize] = useState(48);
  const [isShaking, setIsShaking] = useState(false);
  
  // Draggable popup states
  const [bombPopupPos, setBombPopupPos] = useState({ x: 0, y: 0 });
  const [skillPopupPos, setSkillPopupPos] = useState({ x: 0, y: 0 });
  const [victoryPopupPos, setVictoryPopupPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const activePopup = useRef<'bomb' | 'skill' | 'victory' | null>(null);

  const isZombieMovingRef = useRef(false);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || !activePopup.current) return;
      const newX = e.clientX - dragStartPos.current.x;
      const newY = e.clientY - dragStartPos.current.y;
      if (activePopup.current === 'bomb') setBombPopupPos({ x: newX, y: newY });
      else if (activePopup.current === 'skill') setSkillPopupPos({ x: newX, y: newY });
      else if (activePopup.current === 'victory') setVictoryPopupPos({ x: newX, y: newY });
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      activePopup.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const sidebarWidth = gameState === 'playing' ? 640 : 0; // 320px * 2
      const availableW = (window.innerWidth - sidebarWidth - 40);
      const availableH = (window.innerHeight - 40);
      const horizontalLimit = availableW / BOARD_W;
      const verticalLimit = availableH / BOARD_H;
      const bestSize = Math.max(40, Math.min(horizontalLimit, verticalLimit, 150));
      setTileSize(bestSize);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [gameState]);

  const boardSpaces = useMemo(() => {
    const spaces: BoardSpace[] = [];
    const startX = 0;
    const startY = 0;

    for (let r = 0; r < BOARD_H; r++) {
      const isReversed = r % 2 !== 0;
      const y = (BOARD_H - 1 - r) * tileSize;
      
      if (!isReversed) {
        for (let c = 0; c < BOARD_W; c++) {
          spaces.push({ id: spaces.length, type: 'normal', x: startX + c * tileSize, y: startY + y });
        }
      } else {
        for (let c = BOARD_W - 1; c >= 0; c--) {
          spaces.push({ id: spaces.length, type: 'normal', x: startX + c * tileSize, y: startY + y });
        }
      }
    }
    return spaces;
  }, [tileSize]);

  const getRandomUnique = useCallback((count: number, exclude: number[]) => {
    const res: number[] = [];
    while(res.length < count) {
      const r = Math.floor(Math.random() * TOTAL_TILES);
      if (!exclude.includes(r) && !res.includes(r)) res.push(r);
    }
    return res;
  }, []);

  const initGame = (chars?: (Character | null)[]) => {
    let charsToUse: Character[] = [];
    
    if (gameMode.startsWith('basic')) {
      const shuffledEmojis = [...BASIC_EMOJIS].sort(() => Math.random() - 0.5);
      charsToUse = Array.from({ length: playerCount }).map((_, i) => ({
        type: 'wizard', // Dummy type for basic
        emoji: shuffledEmojis[i % shuffledEmojis.length],
        name: `Người chơi ${i + 1}`,
        ability: 'Không có kỹ năng'
      }));
    } else {
      charsToUse = (chars || selectedCharacters).filter(c => c !== null) as Character[];
    }

    const startExclude = [0, TOTAL_TILES - 1];
    const bInd = getRandomUnique(BOMB_COUNT, startExclude);
    const zInd = getRandomUnique(ZOMBIE_COUNT, [...startExclude, ...bInd]);
    const cInd = getRandomUnique(CLOVER_COUNT, [...startExclude, ...bInd, ...zInd]);
    const tInd = getRandomUnique(TRAP_COUNT, [...startExclude, ...bInd, ...zInd, ...cInd]);
    
    setBombIndices(bInd);
    setZombieSpawnIndices(zInd);
    setCloverIndices(cInd);
    setTrapIndices(tInd);
    setZombies([]);
    setTurnIndex(0);
    setIsMoving(false);
    setVictoryInfo(null);

    const initialPlayers: Player[] = charsToUse.map((char, i) => ({
      id: i,
      team: i < Math.ceil(charsToUse.length / 2) ? 1 : 2,
      character: char,
      pos: 0,
      health: MAX_PLAYER_HEALTH,
      maxHealth: MAX_PLAYER_HEALTH,
      bombs: 0,
      statusEffects: {}
    }));
    setPlayers(initialPlayers);
    setGameState('playing');
  };

  const rollDice = () => {
    if (isRolling || isMoving) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        handleMove(finalValue);
      }
    }, 80);
  };

  const addNotification = useCallback((message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', icon: string = '🔔') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type, icon }]);
    if (type === 'error' || type === 'warning') {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const moveZombies = async () => {
    if (isZombieMovingRef.current) return;
    isZombieMovingRef.current = true;
    const steps = 2;
    for (let s = 0; s < steps; s++) {
      setZombies(prev => {
        const nextZombies = prev.map(z => ({ ...z, pos: z.pos + 1 }));
        
        // Check for exact collision with players at this step
        setPlayers(currentPlayers => {
          let changed = false;
          const updatedPlayers = currentPlayers.map(p => {
            const collidingZombie = nextZombies.find(z => z.pos === p.pos);
            if (collidingZombie) {
              changed = true;
              const newHealth = p.health - 1;
              if (newHealth === 1) {
                addNotification(`${p.character.name} chỉ còn 1 máu! Cẩn thận!`, 'error', '⚠️');
              }
              if (newHealth <= 0) {
                addNotification(`${p.character.name} đã bị Zombie hạ gục!`, 'error', '💀');
                return { ...p, health: MAX_PLAYER_HEALTH, pos: 0 };
              }
              addNotification(`${p.character.name} bị Zombie tấn công!`, 'warning', '🧟');
              return { ...p, health: newHealth };
            }
            return p;
          });
          return changed ? updatedPlayers : currentPlayers;
        });

        return nextZombies;
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // Zombie disappearance: if zombie pos > max player pos
    setPlayers(currentPlayers => {
      const maxPlayerPos = Math.max(...currentPlayers.map(p => p.pos), 0);
      setZombies(prev => prev.filter(z => z.pos <= maxPlayerPos && z.pos < TOTAL_TILES));
      return currentPlayers;
    });
    isZombieMovingRef.current = false;
  };

  const applySkill = async (p: Player, targetId?: number) => {
    const target = players.find(pl => pl.id === targetId);

    switch (p.character.type) {
      case 'wizard':
        if (target) {
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, nextTurnModifier: 'backward', statusMessage: `Bị đi lùi từ ${p.character.emoji}` } } : pl));
        }
        break;
      case 'unicorn':
        if (target) {
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, nextTurnModifier: 'x2', statusMessage: `Nhận x2 bước từ ${p.character.emoji}` } } : pl));
        }
        break;
      case 'phoenix':
        setPlayers(prev => prev.map(pl => pl.team === p.team ? { ...pl, health: pl.maxHealth, statusEffects: { ...pl.statusEffects, statusMessage: `Được hồi máu từ ${p.character.emoji}` } } : pl));
        // Clear phoenix message after 3s since it's immediate
        setTimeout(() => {
          setPlayers(prev => prev.map(pl => pl.team === p.team ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: undefined } } : pl));
        }, 3000);
        break;
      case 'ninja':
        if (target) {
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: `Được cộng 5 bước từ ${p.character.emoji}` } } : pl));
          await executeMove(target, 5, undefined, true);
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: undefined } } : pl));
        }
        break;
      case 'mermaid':
        setPlayers(prev => prev.map(pl => {
          if (pl.team !== p.team) {
            const newHealth = Math.max(0, pl.health - 2);
            const finalHealth = newHealth <= 0 ? MAX_PLAYER_HEALTH : newHealth;
            const finalPos = newHealth <= 0 ? 0 : pl.pos;
            return { ...pl, health: finalHealth, pos: finalPos, statusEffects: { ...pl.statusEffects, statusMessage: `Bị trừ 2 máu từ ${p.character.emoji}` } };
          }
          return pl;
        }));
        // Clear mermaid message after 3s
        setTimeout(() => {
          setPlayers(prev => prev.map(pl => pl.team !== p.team ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: undefined } } : pl));
        }, 3000);
        break;
      case 'dinosaur':
        if (target) {
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: `Bị trừ 5 bước từ ${p.character.emoji}` } } : pl));
          await executeMove(target, -5, undefined, true);
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: undefined } } : pl));
        }
        break;
      case 'snowman':
        if (target) {
          setPlayers(prev => prev.map(pl => pl.id === target.id ? { ...pl, statusEffects: { ...pl.statusEffects, nextTurnModifier: 'disabled', statusMessage: `Bị đóng băng lượt từ ${p.character.emoji}` } } : pl));
        }
        break;
    }
  };

  const executeMove = async (p: Player, steps: number, skillTargetId?: number, isExtraMove = false) => {
    if (!isExtraMove) setIsMoving(true);
    try {
      let currentSteps = steps;
      let currentPos = p.pos;
      
      // Apply turn modifier if exists
      const modifier = p.statusEffects.nextTurnModifier;
      if (modifier === 'double' || modifier === 'x2') {
        currentSteps *= 2;
      } else if (modifier === 'reverse' || modifier === 'backward') {
        currentSteps = -currentSteps;
      } else if (modifier === 'skip' || modifier === 'disabled') {
        setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, statusEffects: { ...pl.statusEffects, nextTurnModifier: undefined, statusMessage: undefined } } : pl));
        if (!isExtraMove) {
          const nextTurn = (turnIndex + 1) % players.length;
          setTurnIndex(nextTurn);
          if (nextTurn === 0) {
            moveZombies();
          }
        }
        return;
      } else if (modifier === 'plus5') {
        currentSteps += 5;
      } else if (modifier === 'minus5') {
        currentSteps = Math.max(1, currentSteps - 5);
      }

      // Clear modifier
      setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, statusEffects: { ...pl.statusEffects, nextTurnModifier: undefined } } : pl));

      // Move animation
      const direction = currentSteps > 0 ? 1 : -1;
      const absSteps = Math.abs(currentSteps);
      let currentBombs = p.bombs;
      
      for (let i = 0; i < absSteps; i++) {
        currentPos += direction;
        if (currentPos < 0) currentPos = 0;
        if (currentPos >= TOTAL_TILES) currentPos = TOTAL_TILES - 1;
        
        // Check for bomb pickup
        if (bombIndices.includes(currentPos) && currentBombs < 1) {
          currentBombs++;
          setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, bombs: currentBombs } : pl));
          setBombIndices(prev => prev.filter(idx => idx !== currentPos));
          addNotification(`${p.character.name} đã nhặt được BOM!`, 'success', '💣');
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
          audio.volume = 0.4;
          audio.play().catch(() => {});
        }

        setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, pos: currentPos } : pl));
        await new Promise(r => setTimeout(r, 200));
        
        if (currentPos === TOTAL_TILES - 1) break;
      }

      // Clear status message after move is finished
      setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: undefined } } : pl));

      // Skill application after move if steps was 1
      if (steps === 1 && !gameMode.startsWith('basic')) {
        await applySkill(p, skillTargetId);
      }

      // Check tile effects
      const finalPos = currentPos;
      if (cloverIndices.includes(finalPos)) {
        addNotification(`${p.character.name} được hồi 1 máu từ Cỏ 4 Lá!`, 'success', '🍀');
        setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, health: Math.min(pl.maxHealth, pl.health + 1) } : pl));
      } else if (trapIndices.includes(finalPos)) {
        addNotification(`${p.character.name} đã đạp trúng BẪY!`, 'error', '🪤');
        if (!hasSeenTrapExplanation) {
          setHasSeenTrapExplanation(true);
          setActiveEffect({ type: 'trap', pos: finalPos, message: 'CHÚ Ý: Đây là BẪY! Bạn sẽ bị văng lùi lại ngẫu nhiên từ 3-10 ô.' });
          await new Promise(r => setTimeout(r, 4000));
          setActiveEffect(null);
        } else {
          setActiveEffect({ type: 'trap', pos: finalPos });
          await new Promise(r => setTimeout(r, 1000));
          setActiveEffect(null);
        }
        
        const backSteps = Math.floor(Math.random() * 8) + 3; // 3 to 10
        setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, statusEffects: { ...pl.statusEffects, statusMessage: `BÙM! Văng lùi ${backSteps} ô` } } : pl));
        await new Promise(r => setTimeout(r, 500));
        await executeMove(p, -backSteps, undefined, true);
      } else if (zombieSpawnIndices.includes(finalPos)) {
        addNotification(`Cẩn thận! Zombie đã xuất hiện và đang đuổi theo ${p.character.name}!`, 'warning', '🧟');
        // Spawn a zombie 6 tiles behind the player
        setZombies(prev => {
          const spawnPos = Math.max(0, finalPos - 6);
          if (prev.some(z => z.pos === spawnPos)) return prev;
          return [...prev, { id: Math.random().toString(36).substr(2, 9), pos: spawnPos, health: MAX_ZOMBIE_HEALTH }];
        });
      }

      // Zombie combat (exact collision)
      const zombieAtPos = zombies.find(z => z.pos === finalPos);
      if (zombieAtPos) {
        addNotification(`${p.character.name} đang chiến đấu với Zombie!`, 'warning', '⚔️');
        setActiveEffect({ type: 'combat', pos: finalPos });
        await new Promise(r => setTimeout(r, 1500));
        setActiveEffect(null);

        setPlayers(prevPlayers => {
          return prevPlayers.map(pl => {
            if (pl.id === p.id) {
              const newHealth = pl.health - 1;
              if (newHealth === 1) {
                addNotification(`${pl.character.name} chỉ còn 1 máu!`, 'error', '⚠️');
              }
              if (newHealth <= 0) {
                addNotification(`${pl.character.name} đã bị Zombie hạ gục!`, 'error', '💀');
                return { ...pl, health: MAX_PLAYER_HEALTH, pos: 0, statusEffects: { ...pl.statusEffects, statusMessage: 'Bị Zombie hạ gục! Về vạch xuất phát' } };
              }
              return { ...pl, health: newHealth, statusEffects: { ...pl.statusEffects, statusMessage: 'Bị Zombie tấn công!' } };
            }
            return pl;
          });
        });
        setZombies(prev => prev.map(z => z.id === zombieAtPos.id ? { ...z, health: z.health - 1 } : z).filter(z => z.health > 0));
      }

      // Zombie disappearance: if zombie pos > max player pos
      setPlayers(currentPlayers => {
        const maxPlayerPos = Math.max(...currentPlayers.map(pl => pl.pos), 0);
        setZombies(prev => prev.filter(z => z.pos <= maxPlayerPos && z.pos < TOTAL_TILES));
        return currentPlayers;
      });

      // Check victory
      if (finalPos === TOTAL_TILES - 1) {
        setVictoryInfo({ winnerTeam: p.team, winnerPlayer: p });
        setGameState('victory');
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      } else if (!isExtraMove) {
        const nextTurn = (turnIndex + 1) % players.length;
        setTurnIndex(nextTurn);
        if (nextTurn === 0) {
          moveZombies();
        }
      }
    } finally {
      if (!isExtraMove) setIsMoving(false);
    }
  };

  const handleMove = async (steps: number) => {
    if (isMoving) return;
    const p = players[turnIndex];
    if (steps === 1) {
      // Auto-apply skills for Phoenix and Mermaid, or skip if basic mode
      if (['phoenix', 'mermaid'].includes(p.character.type) || gameMode.startsWith('basic')) {
        await executeMove(p, steps);
        return;
      }
      setSkillTargeting({ steps, player: p });
      return;
    }
    await executeMove(p, steps);
  };

  const throwBomb = (targetId: string | number, isZombie: boolean) => {
    const p = players[turnIndex];
    if (p.bombs <= 0) return;

    setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, bombs: pl.bombs - 1 } : pl));
    
    if (isZombie) {
      addNotification(`Đã ném bom vào Zombie!`, 'success', '💥');
      setZombies(prev => prev.map(z => z.id === targetId ? { ...z, health: Math.max(0, z.health - 2) } : z).filter(z => z.health > 0));
    } else {
      const target = players.find(pl => pl.id === targetId);
      if (target) {
        addNotification(`Đã ném bom vào ${target.character.name}!`, 'warning', '💥');
      }
      setPlayers(prev => prev.map(pl => {
        if (pl.id === targetId) {
          const newHealth = Math.max(0, pl.health - 2);
          if (newHealth === 1) {
            addNotification(`${pl.character.name} chỉ còn 1 máu!`, 'error', '⚠️');
          }
          if (newHealth <= 0) {
            addNotification(`${pl.character.name} đã bị hạ gục bởi BOM!`, 'error', '💀');
            return { ...pl, health: MAX_PLAYER_HEALTH, pos: 0 };
          }
          return { ...pl, health: newHealth };
        }
        return pl;
      }));
    }

    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
    audio.volume = 0.4;
    audio.play().catch(() => {});
    setIsAimingBomb(false);
  };

  if (gameState === 'start') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-blue-500 overflow-hidden font-['Roboto']">
        <div className="relative z-10 flex flex-col items-center">
          <h1 className="text-[10vw] md:text-[12vw] font-black mb-12 tracking-tighter text-white drop-shadow-2xl text-center leading-[0.9] uppercase">
            ĐẠI CHIẾN<br/>KẸO NGỌT
          </h1>
          <button 
            onClick={() => setGameState('mode_selection')}
            className="px-20 py-8 bg-yellow-400 border-8 border-white text-white rounded-3xl font-black text-5xl hover:scale-110 active:scale-95 transition-all shadow-[0_20px_0_#b45309] hover:translate-y-[5px] active:translate-y-[20px] active:shadow-none uppercase tracking-widest flex items-center gap-4"
          >
            CHƠI NGAY! 🚀
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'mode_selection') {
    const modes: { id: GameMode; label: string; icon: string; desc: string }[] = [
      { id: 'basic_dice', label: 'Cơ bản - có xí ngầu', icon: '🎲', desc: 'Không chọn chiến binh, dùng xí ngầu máy tính' },
      { id: 'basic_manual', label: 'Cơ bản - không xí ngầu', icon: '🔢', desc: 'Không chọn chiến binh, tự chọn số bước' },
      { id: 'advanced_dice', label: 'Nâng cao - có xí ngầu', icon: '🧙‍♀️🎲', desc: 'Có chọn chiến binh, dùng xí ngầu máy tính' },
      { id: 'advanced_manual', label: 'Nâng cao - không xí ngầu', icon: '🧙‍♀️🔢', desc: 'Có chọn chiến binh, tự chọn số bước' },
    ];

    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-indigo-600 p-8 overflow-hidden font-['Roboto']">
        <div className="max-w-6xl w-full z-10 bg-white p-12 rounded-[40px] border-8 border-white shadow-2xl flex flex-col items-center">
          <h2 className="text-5xl font-black text-indigo-600 mb-12 uppercase tracking-widest text-center">CHỌN CHẾ ĐỘ CHƠI</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            {modes.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setGameMode(m.id);
                  setGameState('player_count');
                }}
                className="group p-8 bg-indigo-50 border-4 border-indigo-100 rounded-3xl hover:border-indigo-500 hover:bg-white transition-all text-left flex items-center gap-6 shadow-sm hover:shadow-xl hover:-translate-y-2"
              >
                <div className="text-7xl group-hover:scale-110 transition-transform">{m.icon}</div>
                <div>
                  <div className="text-2xl font-black text-indigo-700 uppercase mb-2">{m.label}</div>
                  <div className="text-indigo-400 font-bold uppercase text-sm tracking-tight">{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <button 
            onClick={() => setGameState('start')}
            className="mt-12 text-indigo-300 font-black text-xl uppercase tracking-widest hover:text-indigo-500 transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'player_count') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-emerald-500 p-8 overflow-hidden font-['Roboto']">
        <div className="max-w-2xl w-full z-10 bg-white p-12 rounded-[40px] border-8 border-white shadow-2xl flex flex-col items-center">
          <h2 className="text-4xl font-black text-emerald-600 mb-12 uppercase tracking-widest text-center">SỐ NGƯỜI CHƠI</h2>
          <div className="flex gap-6 mb-12">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`w-20 h-20 rounded-2xl border-4 font-black text-3xl transition-all ${playerCount === n ? 'bg-emerald-500 border-white text-white scale-110 shadow-lg' : 'bg-emerald-50 border-emerald-100 text-emerald-300 hover:border-emerald-300'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (gameMode.startsWith('basic')) {
                initGame();
              } else {
                setSelectedCharacters(Array(playerCount).fill(null));
                setSelectionSlot(0);
                setGameState('selection');
              }
            }}
            className="px-20 py-6 bg-emerald-500 border-8 border-white text-white rounded-2xl font-black text-4xl hover:scale-110 active:scale-95 transition-all shadow-lg uppercase tracking-widest"
          >
            TIẾP TỤC! 🚀
          </button>
          <button 
            onClick={() => setGameState('mode_selection')}
            className="mt-8 text-emerald-300 font-black text-xl uppercase tracking-widest hover:text-emerald-500 transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'selection') {
    const allSelected = selectedCharacters.every(c => c !== null);

    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-pink-500 p-4 md:p-8 overflow-hidden font-['Roboto']">
        <div className="max-w-[95vw] w-full h-[90vh] z-10 bg-white p-6 md:p-10 rounded-3xl border-8 border-white shadow-2xl flex flex-col items-center relative overflow-y-auto custom-scrollbar">
          
          <div className="flex justify-between items-center w-full mb-8">
            <h2 className="text-3xl font-black text-pink-600 uppercase tracking-widest drop-shadow-sm">
              CHỌN CHIẾN BINH
            </h2>
            <div className={`px-6 py-2 rounded-full border-2 border-white text-lg font-black text-white shadow-sm ${selectionSlot < Math.ceil(playerCount / 2) ? 'bg-blue-500' : 'bg-pink-600'}`}>
              LƯỢT CHỌN: {selectionSlot < Math.ceil(playerCount / 2) ? 'ĐỘI 1' : 'ĐỘI 2'}
            </div>
          </div>

          {/* Selection Slots */}
          <div className="flex flex-wrap justify-center w-full mb-12 gap-8">
            {selectedCharacters.map((char, i) => {
              const team = i < Math.ceil(playerCount / 2) ? 1 : 2;
              const isCurrent = selectionSlot === i;
              return (
                <button 
                  key={i} 
                  onClick={() => {
                    const next = [...selectedCharacters];
                    next[i] = null;
                    setSelectedCharacters(next);
                    setSelectionSlot(i);
                  }}
                  className={`w-24 h-32 rounded-xl border-4 flex flex-col items-center justify-center text-5xl shadow-sm transition-all relative group ${isCurrent ? (team === 1 ? 'border-blue-400 bg-blue-50 scale-110' : 'border-pink-400 bg-pink-50 scale-110') : (team === 1 ? 'border-blue-100 bg-white hover:bg-red-50 hover:border-red-200' : 'border-pink-100 bg-white hover:bg-red-50 hover:border-red-200')}`}
                >
                  {char?.emoji || '?'}
                  <div className={`text-[10px] font-black absolute bottom-2 uppercase group-hover:hidden ${team === 1 ? 'text-blue-400' : 'text-pink-400'}`}>Đội {team} - {team === 1 ? i+1 : i - Math.ceil(playerCount/2) + 1}</div>
                  {char && <div className="hidden group-hover:block text-[10px] font-black text-red-500 absolute bottom-2 uppercase">HỦY</div>}
                </button>
              );
            })}
          </div>

          {/* Character Grid */}
          <div className="grid grid-cols-7 gap-4 w-full mb-8">
            {CHARACTERS.map((char) => {
              const isSelected = selectedCharacters.some(sc => sc?.type === char.type);
              return (
                <button
                  key={char.type}
                  disabled={isSelected || allSelected}
                  onClick={() => {
                    if (allSelected) return;
                    const next = [...selectedCharacters];
                    next[selectionSlot] = char;
                    setSelectedCharacters(next);
                    
                    // Find next empty slot
                    const nextEmpty = next.findIndex(c => c === null);
                    if (nextEmpty !== -1) {
                      setSelectionSlot(nextEmpty);
                    }
                  }}
                  className={`flex flex-col items-center p-4 rounded-xl border-4 transition-all group relative h-64 ${isSelected ? 'bg-gray-100 border-gray-200 opacity-50 grayscale cursor-not-allowed' : 'bg-blue-50 border-blue-200 hover:border-blue-500 hover:scale-105'}`}
                >
                  <div className="text-6xl mb-4 group-hover:scale-110 transition-transform">{char.emoji}</div>
                  <div className="text-lg font-black text-blue-700 uppercase tracking-tighter mb-2 text-center leading-none">{char.name}</div>
                  <div className="text-[9px] text-blue-900 font-bold text-center leading-tight uppercase tracking-tight">
                    {char.ability}
                  </div>
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-white text-pink-600 font-black px-2 py-1 rounded-full text-[10px] border-2 border-pink-600 uppercase tracking-widest shadow-sm transform -rotate-12">ĐÃ CHỌN</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {allSelected && (
            <button
              onClick={() => initGame(selectedCharacters)}
              className="px-24 py-6 bg-green-500 border-8 border-white text-white rounded-2xl font-black text-4xl hover:scale-110 active:scale-95 transition-all shadow-lg uppercase tracking-widest animate-pulse"
            >
              LAUNCH 🚀
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleMouseDown = (e: React.MouseEvent, type: 'bomb' | 'skill' | 'victory') => {
    setIsDragging(true);
    activePopup.current = type;
    const pos = type === 'bomb' ? bombPopupPos : (type === 'skill' ? skillPopupPos : victoryPopupPos);
    dragStartPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const currentPlayer = players[turnIndex];

  return (
    <div 
      className={`h-screen w-screen flex transition-all duration-700 bg-blue-500 overflow-hidden font-['Roboto']`}
    >
      {/* Left Panel: Team 1 */}
      {gameState === 'playing' && (
        <div className="w-80 h-full bg-white border-r-4 border-white p-4 flex flex-col z-50 shadow-md overflow-y-auto custom-scrollbar">
          <div className="text-3xl font-black text-blue-600 uppercase mb-6 flex items-center gap-3 drop-shadow-sm">
            <span className="w-10 h-10 bg-blue-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xl">🔵</span> ĐỘI 1
          </div>
          
          {currentPlayer && currentPlayer.team === 1 && (
            <div className="mb-8 animate-in slide-in-from-left duration-500">
              <div className={`p-6 rounded-[32px] border-[8px] shadow-xl w-full transition-all bg-blue-600 border-white`}>
                <div className="flex flex-col items-center text-center">
                  <div className="w-32 h-32 bg-white/20 backdrop-blur-md rounded-[32px] flex items-center justify-center text-6xl mb-4 border-4 border-white/30 shadow-inner animate-bounce-slow">
                    {currentPlayer.character.emoji}
                  </div>
                  <div className="text-3xl font-black text-white uppercase tracking-tighter mb-1 drop-shadow-lg">{currentPlayer.character.name}</div>
                  <div className="text-[10px] font-black text-white/80 uppercase tracking-widest mb-4 bg-black/10 px-3 py-1 rounded-full">Đang đến lượt...</div>
                  
                  <div className="w-full bg-white/10 backdrop-blur-sm p-4 rounded-2xl border-2 border-white/20">
                    <div className="text-[10px] font-black uppercase text-white/60 mb-1 tracking-widest">Kỹ năng đặc biệt</div>
                    <div className="text-sm font-bold text-white leading-tight uppercase tracking-tight">{currentPlayer.character.ability}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 flex-1">
            {players.filter(p => p.team === 1).map(p => (
              <div 
                key={p.id} 
                className={`p-4 rounded-xl border-4 transition-all relative ${turnIndex === p.id ? 'border-yellow-400 bg-white shadow-md z-10' : 'border-blue-100 bg-blue-50 opacity-90 grayscale'}`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className={`w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center text-4xl shadow-inner border-2 border-white ${turnIndex === p.id ? 'animate-bounce-slow' : ''}`}>
                    {p.character.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-black text-blue-700 truncate uppercase tracking-tighter drop-shadow-sm">{p.character.name}</div>
                    <div className="text-xs font-black text-pink-500 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full inline-block mt-1">Ô số {p.pos + 1}</div>
                  </div>
                </div>
                
                <div className="bg-white p-3 rounded-xl mb-3 border border-blue-100 shadow-inner">
                  <div className="text-[9px] font-black uppercase text-blue-400 mb-1 tracking-widest">Kỹ năng đặc biệt</div>
                  <div className="text-[11px] font-bold text-blue-800 leading-tight uppercase tracking-tight">{p.character.ability}</div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  {p.bombs > 0 && (
                    <button 
                      onClick={() => turnIndex === p.id && setIsAimingBomb(true)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full border-2 transition-all ${turnIndex === p.id ? 'bg-red-500 border-white text-white hover:scale-110' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                    >
                      <span className="text-lg">💣</span>
                      <span className="font-black text-sm">x{p.bombs}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2">
                    {[...Array(p.maxHealth)].map((_, hIdx) => (
                      <div key={hIdx} className={`w-6 h-3 rounded-full border-2 border-white ${hIdx < p.health ? 'bg-blue-500 shadow-md' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  {turnIndex === p.id && <span className="text-xs font-black text-blue-600 uppercase tracking-widest animate-pulse bg-white px-2 py-1 rounded-lg shadow-sm">Đang đi...</span>}
                </div>

                {/* Status Message */}
                {p.statusEffects.statusMessage && (
                  <div className="mt-2 bg-gradient-to-r from-[#6366f1] via-[#a855f7] to-[#ec4899] p-0.5 rounded-2xl shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-white/90 backdrop-blur-sm rounded-[14px] p-2 text-[10px] font-black text-purple-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="text-sm drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">✨</span> {p.statusEffects.statusMessage}
                    </div>
                  </div>
                )}

                {turnIndex === p.id && !isMoving && !skillTargeting && !gameMode.endsWith('dice') && (
                  <div className="mt-4 pt-4 border-t-4 border-blue-100">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6].map(steps => (
                        <button
                          key={steps}
                          onClick={() => handleMove(steps)}
                          className="h-12 bg-blue-500 border-b-4 border-blue-700 text-white rounded-[15px] font-black text-xl hover:scale-105 active:translate-y-[4px] active:border-b-0 transition-all shadow-lg flex items-center justify-center border-2 border-white"
                        >
                          {steps}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Middle Panel: Game Board */}
      <div className={`flex-1 relative overflow-hidden flex items-center justify-center bg-white notion-grid ${isShaking ? 'animate-shake' : ''}`}>
        {/* Dice UI (Center) */}
        {gameState === 'playing' && gameMode.endsWith('dice') && !isMoving && !skillTargeting && !isAimingBomb && (
          <div className="absolute inset-0 flex items-center justify-center z-[70] pointer-events-none">
            <div className="flex flex-col items-center gap-8">
              <button
                onClick={rollDice}
                disabled={isRolling}
                className={`pointer-events-auto group relative flex flex-col items-center justify-center transition-all duration-300 ${isRolling ? 'scale-110' : 'hover:scale-105 active:scale-95'}`}
              >
                <div className="dice-container">
                  <div className={`dice ${isRolling ? 'dice-rolling' : ''}`} style={{ transform: !isRolling ? `rotateX(${(diceValue-1) * 90}deg) rotateY(${(diceValue-1) * 90}deg)` : '' }}>
                    <div className="dice-face front">⚀</div>
                    <div className="dice-face back">⚅</div>
                    <div className="dice-face right">⚂</div>
                    <div className="dice-face left">⚃</div>
                    <div className="dice-face top">⚁</div>
                    <div className="dice-face bottom">⚄</div>
                  </div>
                </div>
                <div className="mt-24 bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-3xl uppercase tracking-widest border-4 border-white shadow-[0_10px_0_#4338ca] group-hover:bg-indigo-500 transition-colors">
                  {isRolling ? 'Đang thảy...' : `Thảy: ${diceValue}`}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Bomb Targeting Overlay */}
        {isAimingBomb && (
          <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center animate-in fade-in duration-300 pointer-events-none">
            <div 
              className="bg-white p-8 rounded-2xl border-4 border-red-500 shadow-2xl max-w-xl w-full text-center relative pointer-events-auto cursor-default"
              style={{ transform: `translate(${bombPopupPos.x}px, ${bombPopupPos.y}px)` }}
            >
              <div 
                className="absolute -top-6 -right-6 text-6xl animate-bounce cursor-grab active:cursor-grabbing p-2"
                onMouseDown={(e) => handleMouseDown(e, 'bomb')}
              >
                💣
              </div>
              <div 
                className="cursor-grab active:cursor-grabbing p-2 mb-4"
                onMouseDown={(e) => handleMouseDown(e, 'bomb')}
              >
                <h3 className="text-3xl font-black text-red-700 uppercase tracking-tighter select-none">CHỌN MỤC TIÊU NÉM BOM</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Nắm kéo để di chuyển</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                {players
                  .filter(p => p.team !== currentPlayer.team)
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => throwBomb(p.id, false)}
                      className={`p-6 rounded-xl border-4 transition-all flex items-center gap-4 group shadow-sm ${p.team === 1 ? 'border-blue-200 hover:border-blue-500 bg-blue-50' : 'border-pink-200 hover:border-pink-500 bg-pink-50'}`}
                    >
                      <div className="text-5xl group-hover:scale-110 transition-transform">{p.character.emoji}</div>
                      <div className="text-left">
                        <div className={`text-xl font-black uppercase ${p.team === 1 ? 'text-blue-600' : 'text-pink-600'}`}>{p.character.name}</div>
                        <div className="text-xs font-bold opacity-60 uppercase tracking-widest">Đội {p.team}</div>
                      </div>
                    </button>
                  ))}
                {zombies.map(z => (
                  <button
                    key={z.id}
                    onClick={() => throwBomb(z.id, true)}
                    className="p-6 rounded-xl border-4 border-gray-200 hover:border-red-500 bg-gray-50 transition-all flex items-center gap-4 group shadow-sm"
                  >
                    <div className="text-5xl group-hover:scale-110 transition-transform">🧟</div>
                    <div className="text-left">
                      <div className="text-xl font-black uppercase text-gray-700">ZOMBIE</div>
                      <div className="text-xs font-bold opacity-60 uppercase tracking-widest">Ô số {z.pos + 1}</div>
                    </div>
                  </button>
                ))}
              </div>
              
              <button 
                onClick={() => {
                  setIsAimingBomb(false);
                  setBombPopupPos({ x: 0, y: 0 });
                }}
                className="mt-8 text-gray-400 font-black text-lg uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Hủy ném bom
              </button>
            </div>
          </div>
        )}
        {skillTargeting && (
          <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center animate-in fade-in duration-300 pointer-events-none">
            <div 
              className="bg-white p-8 rounded-2xl border-4 border-yellow-400 shadow-2xl max-w-xl w-full text-center relative pointer-events-auto cursor-default"
              style={{ transform: `translate(${skillPopupPos.x}px, ${skillPopupPos.y}px)` }}
            >
              <div 
                className="absolute -top-6 -right-6 text-6xl animate-bounce cursor-grab active:cursor-grabbing p-2"
                onMouseDown={(e) => handleMouseDown(e, 'skill')}
              >
                🎯
              </div>
              <div 
                className="cursor-grab active:cursor-grabbing p-2 mb-4"
                onMouseDown={(e) => handleMouseDown(e, 'skill')}
              >
                <h3 className="text-3xl font-black text-purple-700 uppercase tracking-tighter select-none">CHỌN MỤC TIÊU</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Nắm kéo để di chuyển</p>
              </div>
              <p className="text-pink-600 font-bold uppercase mb-8 text-lg tracking-widest">{skillTargeting.player.character.ability}</p>
              
              <div className="grid grid-cols-2 gap-6">
                {players
                  .filter(p => {
                    const charType = skillTargeting.player.character.type;
                    const isTeammate = p.team === skillTargeting.player.team;
                    
                    // Filter targets based on skill type
                    if (['wizard', 'dinosaur', 'snowman'].includes(charType)) {
                      return !isTeammate; // Opponents only
                    }
                    if (['unicorn', 'ninja'].includes(charType)) {
                      return isTeammate; // Teammates only
                    }
                    return true; // Others show all (though Phoenix/Mermaid are auto)
                  })
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        const targetId = p.id;
                        const { steps, player } = skillTargeting;
                        setSkillTargeting(null);
                        setSkillPopupPos({ x: 0, y: 0 });
                        executeMove(player, steps, targetId);
                      }}
                      className={`p-6 rounded-xl border-4 transition-all flex items-center gap-4 group shadow-sm ${p.team === 1 ? 'border-blue-200 hover:border-blue-500 bg-blue-50' : 'border-pink-200 hover:border-pink-500 bg-pink-50'}`}
                    >
                      <div className="text-5xl group-hover:scale-110 transition-transform">{p.character.emoji}</div>
                      <div className="text-left">
                        <div className={`text-xl font-black uppercase ${p.team === 1 ? 'text-blue-600' : 'text-pink-600'}`}>{p.character.name}</div>
                        <div className="text-xs font-bold opacity-60 uppercase tracking-widest">Đội {p.team}</div>
                      </div>
                    </button>
                  ))}
              </div>
              
              <button 
                onClick={() => {
                  const { steps, player } = skillTargeting;
                  setSkillTargeting(null);
                  setSkillPopupPos({ x: 0, y: 0 });
                  executeMove(player, steps);
                }}
                className="mt-8 text-gray-400 font-black text-lg uppercase tracking-widest hover:text-pink-500 transition-colors"
              >
                Bỏ qua kỹ năng
              </button>
            </div>
          </div>
        )}

        {/* Active Effects Layer */}
        {activeEffect && (
          <div className="absolute inset-0 z-[100] pointer-events-none flex items-center justify-center">
            {activeEffect.type === 'trap' && (
              <div className="flex flex-col items-center animate-in zoom-in duration-300">
                <div className="text-9xl animate-bounce">💥</div>
                {activeEffect.message && (
                  <div className="mt-8 bg-black/80 backdrop-blur-md text-white p-8 rounded-3xl border-4 border-orange-500 max-w-md text-center shadow-2xl">
                    <div className="text-3xl font-black text-orange-500 mb-4 uppercase tracking-widest">CẢNH BÁO BẪY!</div>
                    <div className="text-xl font-bold leading-relaxed">{activeEffect.message}</div>
                  </div>
                )}
              </div>
            )}
            {activeEffect.type === 'combat' && (
              <div className="flex flex-col items-center animate-in zoom-in duration-300">
                <div className="relative">
                  <div className="text-9xl animate-ping absolute inset-0 opacity-50">⚔️</div>
                  <div className="text-9xl animate-bounce relative z-10">🧟👊💥</div>
                </div>
                <div className="mt-8 bg-red-600 text-white px-10 py-4 rounded-full font-black text-4xl uppercase tracking-widest border-4 border-white shadow-2xl animate-pulse">
                  CHIẾN ĐẤU!!!
                </div>
              </div>
            )}
          </div>
        )}

        <div 
          className="relative origin-center"
          style={{ 
            transform: `scale(${APP_SCALE})`,
            width: (BOARD_W - 1) * tileSize + tileSize,
            height: (BOARD_H - 1) * tileSize + tileSize
          }}
        >
          <div className="relative w-full h-full">
            <div className="absolute inset-0 z-0">
                {boardSpaces.map(s => {
                  const isBomb = bombIndices.includes(s.id);
                  const isZombieSpawn = zombieSpawnIndices.includes(s.id);
                  const isClover = cloverIndices.includes(s.id);
                  const isTrap = trapIndices.includes(s.id);

                  return (
                    <BoardTile 
                      key={s.id}
                      space={s}
                      tileSize={tileSize}
                      isBomb={isBomb}
                      isZombieSpawn={isZombieSpawn}
                      isClover={isClover}
                      isTrap={isTrap}
                    />
                  );
                })}

                {zombies.map(z => boardSpaces[z.pos] && (
                  <div key={z.id} className="absolute z-20 transition-all duration-400 ease-in-out pointer-events-none" style={{ 
                      left: boardSpaces[z.pos].x + tileSize/2, 
                      top: boardSpaces[z.pos].y + tileSize/2, 
                      transform: `translate(-50%, -50%)` 
                  }}>
                      <div className="flex flex-col items-center">
                          <div className="flex gap-0.5 mb-1 bg-white p-1 rounded-full px-2 border-2 border-red-500 shadow-lg">
                          {[...Array(MAX_ZOMBIE_HEALTH)].map((_, i) => (
                              <div key={i} className={`w-2 h-2 rounded-full ${i < z.health ? 'bg-red-500' : 'bg-gray-200'}`} />
                          ))}
                          </div>
                          <span className="drop-shadow-lg animate-pulse" style={{ fontSize: tileSize * 1.2 }}>🧟</span>
                      </div>
                  </div>
                ))}

                {players.map((p, i) => (
                  <div 
                    key={p.id}
                    className={`absolute z-30 transition-all duration-500 ease-out pointer-events-auto ${turnIndex === i ? 'brightness-110 scale-150 z-40' : 'brightness-90 opacity-80'}`}
                    style={{ 
                        left: (boardSpaces[p.pos]?.x || 0) + tileSize/2, 
                        top: (boardSpaces[p.pos]?.y || 0) + tileSize/2, 
                        transform: 'translate(-50%, -50%)',
                        fontSize: tileSize * 0.4,
                    }}
                  >
                    <div className="flex flex-col items-center relative">
                        <div className="flex gap-0.5 mb-1 bg-white p-1 rounded-full px-2 border-2 border-blue-500 shadow-lg">
                            {[...Array(p.maxHealth)].map((_, idx) => (
                            <div key={idx} className={`w-2 h-2 rounded-full ${idx < p.health ? (p.team === 1 ? 'bg-blue-500' : 'bg-pink-500') : 'bg-gray-200'}`} />
                            ))}
                        </div>
                        <span className="drop-shadow-lg select-none">
                          {p.character.emoji}
                        </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Team 2 */}
      {gameState === 'playing' && (
        <div className="w-80 h-full bg-white border-l-4 border-white p-4 flex flex-col z-50 shadow-md overflow-y-auto custom-scrollbar">
          <div className="text-3xl font-black text-pink-600 uppercase mb-6 flex items-center gap-3 justify-end drop-shadow-sm">
            ĐỘI 2 <span className="w-10 h-10 bg-pink-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xl">🔴</span>
          </div>
          
          {currentPlayer && currentPlayer.team === 2 && (
            <div className="mb-8 animate-in slide-in-from-right duration-500">
              <div className={`p-6 rounded-[32px] border-[8px] shadow-xl w-full transition-all bg-pink-600 border-white`}>
                <div className="flex flex-col items-center text-center">
                  <div className="w-32 h-32 bg-white/20 backdrop-blur-md rounded-[32px] flex items-center justify-center text-6xl mb-4 border-4 border-white/30 shadow-inner animate-bounce-slow">
                    {currentPlayer.character.emoji}
                  </div>
                  <div className="text-3xl font-black text-white uppercase tracking-tighter mb-1 drop-shadow-lg">{currentPlayer.character.name}</div>
                  <div className="text-[10px] font-black text-white/80 uppercase tracking-widest mb-4 bg-black/10 px-3 py-1 rounded-full">Đang đến lượt...</div>
                  
                  <div className="w-full bg-white/10 backdrop-blur-sm p-4 rounded-2xl border-2 border-white/20">
                    <div className="text-[10px] font-black uppercase text-white/60 mb-1 tracking-widest">Kỹ năng đặc biệt</div>
                    <div className="text-sm font-bold text-white leading-tight uppercase tracking-tight">{currentPlayer.character.ability}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 flex-1">
            {players.filter(p => p.team === 2).map(p => (
              <div 
                key={p.id} 
                className={`p-4 rounded-xl border-4 transition-all relative ${turnIndex === p.id ? 'border-yellow-400 bg-white shadow-md z-10' : 'border-pink-100 bg-pink-50 opacity-90 grayscale'}`}
              >
                <div className="flex items-center gap-4 mb-3 flex-row-reverse text-right">
                  <div className={`w-16 h-16 rounded-xl bg-pink-100 flex items-center justify-center text-4xl shadow-inner border-2 border-white ${turnIndex === p.id ? 'animate-bounce-slow' : ''}`}>
                    {p.character.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-black text-pink-700 truncate uppercase tracking-tighter drop-shadow-sm">{p.character.name}</div>
                    <div className="text-xs font-black text-blue-500 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full inline-block mt-1">Ô số {p.pos + 1}</div>
                  </div>
                </div>
                
                <div className="bg-white p-3 rounded-xl mb-3 border border-pink-100 shadow-inner text-right">
                  <div className="text-[9px] font-black uppercase text-pink-400 mb-1 tracking-widest">Kỹ năng đặc biệt</div>
                  <div className="text-[11px] font-bold text-pink-800 leading-tight uppercase tracking-tight">{p.character.ability}</div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-row-reverse">
                  {p.bombs > 0 && (
                    <button 
                      onClick={() => turnIndex === p.id && setIsAimingBomb(true)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full border-2 transition-all ${turnIndex === p.id ? 'bg-red-500 border-white text-white hover:scale-110' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                    >
                      <span className="text-lg">💣</span>
                      <span className="font-black text-sm">x{p.bombs}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between flex-row-reverse mb-2">
                  <div className="flex gap-2">
                    {[...Array(p.maxHealth)].map((_, hIdx) => (
                      <div key={hIdx} className={`w-6 h-3 rounded-full border-2 border-white ${hIdx < p.health ? 'bg-pink-500 shadow-md' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  {turnIndex === p.id && <span className="text-xs font-black text-pink-600 uppercase tracking-widest animate-pulse bg-white px-2 py-1 rounded-lg shadow-sm">Đang đi...</span>}
                </div>

                {/* Status Message */}
                {p.statusEffects.statusMessage && (
                  <div className="mt-2 bg-gradient-to-l from-[#6366f1] via-[#a855f7] to-[#ec4899] p-0.5 rounded-2xl shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-white/90 backdrop-blur-sm rounded-[14px] p-2 text-[10px] font-black text-purple-700 uppercase tracking-widest text-right flex items-center justify-end gap-2">
                      {p.statusEffects.statusMessage} <span className="text-sm drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">✨</span>
                    </div>
                  </div>
                )}

                {turnIndex === p.id && !isMoving && !skillTargeting && !gameMode.endsWith('dice') && (
                  <div className="mt-4 pt-4 border-t-4 border-pink-100">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6].map(steps => (
                        <button
                          key={steps}
                          onClick={() => handleMove(steps)}
                          className="h-12 bg-pink-500 border-b-4 border-pink-700 text-white rounded-[15px] font-black text-xl hover:scale-105 active:translate-y-[4px] active:border-b-0 transition-all shadow-lg flex items-center justify-center border-2 border-white"
                        >
                          {steps}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control Panel (Optional, kept for clarity if needed, but removed fixed bottom one) */}

      {/* Victory Popup */}
      {gameState === 'victory' && victoryInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 font-['Roboto'] p-4 pointer-events-none">
          <div 
            className="bg-white p-10 md:p-20 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-4xl w-full border-[12px] border-yellow-400 relative overflow-y-auto max-h-[90vh] custom-scrollbar pointer-events-auto cursor-default"
            style={{ transform: `translate(${victoryPopupPos.x}px, ${victoryPopupPos.y}px)` }}
          >
            <div 
              className="absolute -top-6 -right-6 text-[100px] md:text-[160px] cursor-grab active:cursor-grabbing p-4"
              onMouseDown={(e) => handleMouseDown(e, 'victory')}
            >
              🏆
            </div>
            <div 
              className="cursor-grab active:cursor-grabbing p-4 mb-6"
              onMouseDown={(e) => handleMouseDown(e, 'victory')}
            >
              <h2 className="text-5xl md:text-8xl font-black mb-4 md:mb-6 tracking-tighter text-blue-600 uppercase drop-shadow-sm select-none">
                CHIẾN THẮNG!
              </h2>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Nắm kéo để di chuyển</p>
            </div>
            <div className="text-2xl md:text-4xl font-black text-pink-600 mb-6 md:mb-10 uppercase tracking-widest bg-pink-50 px-6 md:px-10 py-2 md:py-4 rounded-full border-4 border-pink-200">ĐỘI {victoryInfo.winnerTeam} THẮNG CUỘC!</div>
            
            <div className="flex gap-8 mb-10">
              {players.filter(pl => pl.team === victoryInfo.winnerTeam).map(pl => (
                <div key={pl.id} className="flex flex-col items-center animate-happy-shake">
                  <div className="text-7xl md:text-9xl mb-4 drop-shadow-xl filter saturate-150">{pl.character.emoji}</div>
                  <div className="text-sm md:text-lg font-black uppercase text-blue-600 tracking-tighter">{pl.character.name}</div>
                </div>
              ))}
            </div>

            <div className="text-xl md:text-2xl font-bold text-blue-500 mb-10 md:mb-16 uppercase tracking-tight">
              Người bạn {victoryInfo.winnerPlayer.character.name} đã về đích!
            </div>
            <button 
              onClick={() => {
                setGameState('start');
                setSelectedCharacters([null, null, null, null]);
                setSelectionSlot(0);
                setTurnIndex(0);
                setPlayers([]);
                setZombies([]);
                setBombIndices([]);
                setZombieSpawnIndices([]);
                setCloverIndices([]);
                setBombPopupPos({ x: 0, y: 0 });
                setSkillPopupPos({ x: 0, y: 0 });
                setVictoryPopupPos({ x: 0, y: 0 });
              }}
              className="px-16 md:px-24 py-6 md:py-10 bg-yellow-400 text-white rounded-3xl font-black text-2xl md:text-4xl hover:scale-110 transition-all shadow-[0_10px_0_#d97706] md:shadow-[0_20px_0_#d97706] hover:translate-y-[5px] active:translate-y-[10px] md:active:translate-y-[20px] active:shadow-none uppercase tracking-widest border-8 border-white"
            >
              START
            </button>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-4 shadow-2xl animate-in slide-in-from-right-full duration-300 pointer-events-auto ${
              n.type === 'success' ? 'bg-green-500 border-green-200 text-white' :
              n.type === 'warning' ? 'bg-yellow-400 border-yellow-200 text-white' :
              n.type === 'error' ? 'bg-red-500 border-red-200 text-white' :
              'bg-blue-500 border-blue-200 text-white'
            }`}
          >
            <span className="text-2xl drop-shadow-sm">{n.icon}</span>
            <span className="font-black uppercase tracking-tight text-sm">{n.message}</span>
          </div>
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
        
        body {
          font-family: 'Roboto', sans-serif;
          background-color: #3b82f6;
          color: #ffffff;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }

        .notion-grid { 
          background-color: #3b82f6;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.1) 2px, transparent 2px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 2px, transparent 2px);
          background-size: 50px 50px; 
        }

        .sudoku-tile { 
          border: 4px solid #ffffff; 
          background-color: #ffffff; 
          border-radius: 8px;
          box-shadow: 0 4px 0 rgba(0,0,0,0.1);
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .sudoku-tile.bg-green-400 { background-color: #4ade80; border-color: #16a34a; }
        .sudoku-tile.bg-yellow-400 { background-color: #facc15; border-color: #ca8a04; }

        .sudoku-tile:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 0 rgba(0,0,0,0.1);
        }

        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #eff6ff; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; }
        
        @keyframes happy-shake {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-20px) rotate(-5deg); }
          50% { transform: translateY(0) rotate(5deg); }
          75% { transform: translateY(-20px) rotate(5deg); }
        }
        .animate-happy-shake { animation: happy-shake 0.8s ease-in-out infinite; }

        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }

        .dice-container {
          perspective: 1000px;
          width: 160px;
          height: 160px;
        }

        .dice {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          transition: transform 0.5s ease-out;
        }

        .dice-rolling {
          animation: dice-rotate 0.5s linear infinite;
        }

        @keyframes dice-rotate {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          100% { transform: rotateX(360deg) rotateY(360deg) rotateZ(360deg); }
        }

        .dice-face {
          position: absolute;
          width: 160px;
          height: 160px;
          background: white;
          border: 8px solid #6366f1;
          border-radius: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 100px;
          color: #4338ca;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.1);
        }

        .front  { transform: rotateY(0deg) translateZ(80px); }
        .back   { transform: rotateY(180deg) translateZ(80px); }
        .right  { transform: rotateY(90deg) translateZ(80px); }
        .left   { transform: rotateY(-90deg) translateZ(80px); }
        .top    { transform: rotateX(90deg) translateZ(80px); }
        .bottom { transform: rotateX(-90deg) translateZ(80px); }

        @keyframes shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-5px, 5px) rotate(-5deg); }
          50% { transform: translate(5px, -5px) rotate(5deg); }
          75% { transform: translate(-5px, -5px) rotate(-5deg); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out infinite; }

        @keyframes fly-out {
          0% { transform: scale(1) translateY(0); opacity: 1; }
          50% { transform: scale(2) translateY(-100px) rotate(360deg); opacity: 0.8; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-fly { animation: fly-out 1s ease-in-out forwards; }

        @keyframes slide-in-right {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right { animation: slide-in-right 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
