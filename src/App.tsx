import { useState, useEffect, useRef } from 'react';
import * as Lucide from 'lucide-react';
import { GameEngine } from './game/GameEngine';
import { MainMenu } from './components/MainMenu';
import { GameHUD } from './components/GameHUD';
import { CHARACTERS } from './game/Characters';
import { ITEMS } from './game/ItemSystem';

type ScreenState = 'menu' | 'playing' | 'gameover' | 'victory';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [selectedCharId, setSelectedCharId] = useState<string>('commando');
  const [engineTick, setEngineTick] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Keep track of final stats to show on Game Over / Victory
  const [finalStats, setFinalStats] = useState({
    timeSurvived: 0,
    kills: 0,
    gold: 0,
    level: 1,
    damageDealt: 0,
    items: {} as Record<string, number>
  });

  // Start the 3D game engine
  const handleStartGame = (characterId: string) => {
    setSelectedCharId(characterId);
    setScreen('playing');
    setIsPaused(false);
  };

  useEffect(() => {
    if (screen !== 'playing' || !containerRef.current) return;

    // Initialize Game Engine on Canvas
    const engine = new GameEngine(
      containerRef.current,
      selectedCharId,
      (updatedEngine) => {
        // High frequency game tick update callback
        setEngineTick((prev: number) => prev + 1);

        // Capture pause updates
        setIsPaused(updatedEngine.player.utilityCD === -999); // dummy, let's use direct check
        
        if (updatedEngine.isGameOver) {
          // Save cumulative stats
          saveMetaProgress(updatedEngine);

          setFinalStats({
            timeSurvived: updatedEngine.runStats.timeSurvived,
            kills: updatedEngine.runStats.kills,
            gold: updatedEngine.runStats.gold,
            level: updatedEngine.runStats.level,
            damageDealt: updatedEngine.runStats.damageDealt,
            items: { ...updatedEngine.player.itemsInventory }
          });
          setScreen('gameover');
        } else if (updatedEngine.isVictory) {
          saveMetaProgress(updatedEngine);

          setFinalStats({
            timeSurvived: updatedEngine.runStats.timeSurvived,
            kills: updatedEngine.runStats.kills,
            gold: updatedEngine.runStats.gold,
            level: updatedEngine.runStats.level,
            damageDealt: updatedEngine.runStats.damageDealt,
            items: { ...updatedEngine.player.itemsInventory }
          });
          setScreen('victory');
        }
      }
    );

    engineRef.current = engine;

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [screen, selectedCharId]);

  const handleTogglePause = () => {
    if (engineRef.current) {
      engineRef.current.pause();
      setIsPaused((prev: boolean) => !prev);
    }
  };

  const handleQuitToMenu = () => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setScreen('menu');
  };

  // Cumulative meta progression saving
  const saveMetaProgress = (engine: GameEngine) => {
    try {
      const prevRuns = Number(localStorage.getItem('meta_runs') || '0');
      const prevKills = Number(localStorage.getItem('meta_kills') || '0');

      localStorage.setItem('meta_runs', String(prevRuns + 1));
      localStorage.setItem('meta_kills', String(prevKills + engine.runStats.kills));
    } catch (e) {
      console.error(e);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none font-sans">
      
      {/* 1. Main Landing Menu */}
      {screen === 'menu' && (
        <MainMenu onStartGame={handleStartGame} />
      )}

      {/* 2. Three.js viewport stage container */}
      {screen === 'playing' && (
        <div ref={containerRef} className="w-full h-full relative cursor-crosshair">
          {/* Instructions hover overlay (fades after 6 seconds) */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-800/80 text-white px-5 py-3 rounded-2xl pointer-events-none animate-fadeOut flex items-center gap-3 shadow-2xl text-xs z-30 font-mono backdrop-blur-md">
            <Lucide.MousePointerClick className="w-4 h-4 text-sky-400 shrink-0 animate-pulse" />
            <span><b>Click screen</b> to lock mouse & look around. Move with <b>W, A, S, D</b> | <b>Left-Click</b> to Shoot | <b>Right-Click</b> or <b>Q</b> for Secondary.</span>
          </div>

          {/* Precision HUD Aiming Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="relative w-8 h-8 flex items-center justify-center">
              {/* Outer light blue ring segments */}
              <div className="absolute w-5 h-5 border border-sky-400/40 rounded-full animate-[spin_10s_linear_infinite]"></div>
              <div className="absolute w-6 h-6 border-t-2 border-b-2 border-sky-400/20 rounded-full animate-[spin_4s_linear_infinite_reverse]"></div>
              {/* Core bright target dot */}
              <div className="w-1.5 h-1.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)]"></div>
            </div>
          </div>

          {/* Core HUD Layer */}
          <GameHUD
            engine={engineRef.current}
            onPause={handleTogglePause}
            onQuit={handleQuitToMenu}
          />
        </div>
      )}

      {/* 3. In-Game Pause Modal */}
      {isPaused && screen === 'playing' && (
        <div className="absolute inset-0 z-40 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full flex flex-col gap-6 text-white text-center shadow-2xl">
            <div className="flex flex-col gap-1">
              <h2 className="text-3xl font-extrabold uppercase tracking-tight">Game Paused</h2>
              <p className="text-slate-400 text-xs">Sector scanning halted. Ready when you are.</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleTogglePause}
                className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 rounded-xl transition duration-150 cursor-pointer text-sm uppercase"
              >
                Resume Expedition
              </button>
              <button
                onClick={handleQuitToMenu}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition duration-150 cursor-pointer text-sm uppercase"
              >
                Abort & Return to Ship
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Game Over Screen */}
      {screen === 'gameover' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col justify-between p-8 text-white overflow-y-auto">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e1b4b_1px,transparent_1px),linear-gradient(to_bottom,#1e1b4b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none"></div>

          <div className="w-full max-w-4xl mx-auto my-auto flex flex-col items-center gap-8 text-center z-10">
            <div className="flex flex-col gap-2">
              <Lucide.Skull className="w-16 h-16 text-red-500 animate-bounce mx-auto" />
              <h1 className="text-5xl font-black tracking-tighter uppercase text-red-500">
                Connection Terminated
              </h1>
              <p className="text-slate-400 text-sm max-w-md">
                Your biological signatures have flatlined. Artifact retrieval logs archived.
              </p>
            </div>

            {/* Run Recap Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Time Elapsed</span>
                <span className="text-white font-extrabold text-lg font-mono">{formatTime(finalStats.timeSurvived)}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Planet Kills</span>
                <span className="text-red-400 font-extrabold text-lg font-mono">{finalStats.kills} Units</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">XP Reached</span>
                <span className="text-sky-400 font-extrabold text-lg font-mono">Level {finalStats.level}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Damage Dealt</span>
                <span className="text-amber-400 font-extrabold text-lg font-mono">{finalStats.damageDealt} HP</span>
              </div>
            </div>

            {/* Collected items lists */}
            {Object.keys(finalStats.items).length > 0 && (
              <div className="flex flex-col gap-2.5 items-center w-full max-w-xl">
                <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wide">Loot Retrieved</span>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  {Object.keys(finalStats.items).map(itemId => {
                    const item = ITEMS.find(i => i.id === itemId);
                    const count = finalStats.items[itemId];
                    if (!item || count <= 0) return null;

                    return (
                      <div key={itemId} className="bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-sky-400">{item.name}</span>
                        <span className="text-slate-400">x{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Back to ship buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => handleStartGame(selectedCharId)}
                className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-slate-950 font-bold px-8 py-3.5 rounded-xl uppercase tracking-wider text-xs transition transform hover:scale-105 cursor-pointer"
              >
                Cloning Sequence (Retry)
              </button>
              <button
                onClick={handleQuitToMenu}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-300 font-bold px-8 py-3.5 rounded-xl uppercase tracking-wider text-xs transition cursor-pointer"
              >
                Return to Space Station
              </button>
            </div>
          </div>

          <div className="text-center text-[10px] font-mono text-slate-600">
            © 2026 VOID EXPEDITION CORPS. ALL DATA SAVED LOCALLY.
          </div>
        </div>
      )}

      {/* 5. Victory Screen */}
      {screen === 'victory' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col justify-between p-8 text-white overflow-y-auto">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#064e3b_1px,transparent_1px),linear-gradient(to_bottom,#064e3b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none"></div>

          <div className="w-full max-w-4xl mx-auto my-auto flex flex-col items-center gap-8 text-center z-10 animate-fadeIn">
            <div className="flex flex-col gap-2">
              <Lucide.Award className="w-16 h-16 text-emerald-400 animate-pulse mx-auto" />
              <h1 className="text-5xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                Expedition Successful
              </h1>
              <p className="text-slate-400 text-sm max-w-md">
                You successfully charged the final teleporter, neutralized the monolith titans, and safely warped back to orbit.
              </p>
            </div>

            {/* Run Recap Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Time Elapsed</span>
                <span className="text-emerald-400 font-extrabold text-lg font-mono">{formatTime(finalStats.timeSurvived)}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Planet Kills</span>
                <span className="text-red-400 font-extrabold text-lg font-mono">{finalStats.kills} Units</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Final Level</span>
                <span className="text-sky-400 font-extrabold text-lg font-mono">Level {finalStats.level}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Total Damage</span>
                <span className="text-amber-400 font-extrabold text-lg font-mono">{finalStats.damageDealt} HP</span>
              </div>
            </div>

            {/* Collected items lists */}
            {Object.keys(finalStats.items).length > 0 && (
              <div className="flex flex-col gap-2.5 items-center w-full max-w-xl">
                <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wide">Artifacts Gathered</span>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  {Object.keys(finalStats.items).map(itemId => {
                    const item = ITEMS.find(i => i.id === itemId);
                    const count = finalStats.items[itemId];
                    if (!item || count <= 0) return null;

                    return (
                      <div key={itemId} className="bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-emerald-400">{item.name}</span>
                        <span className="text-slate-400">x{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Return options */}
            <div className="flex gap-4">
              <button
                onClick={handleQuitToMenu}
                className="bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-bold px-10 py-3.5 rounded-xl uppercase tracking-wider text-xs transition transform hover:scale-105 cursor-pointer"
              >
                Return to Command Deck
              </button>
            </div>
          </div>

          <div className="text-center text-[10px] font-mono text-slate-600">
            © 2026 VOID EXPEDITION CORPS. EXPEDITION SECURED.
          </div>
        </div>
      )}

    </div>
  );
}
