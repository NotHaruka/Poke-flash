import React, { useState, useEffect } from 'react';
import * as Lucide from 'lucide-react';
import { CHARACTERS } from '../game/Characters';
import { PlayerCharacter } from '../types';

interface MainMenuProps {
  onStartGame: (characterId: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
  const [unlockedIds, setUnlockedIds] = useState<string[]>(['commando']);
  const [selectedCharId, setSelectedCharId] = useState<string>('commando');
  const [stats, setStats] = useState({ totalRuns: 0, totalKills: 0 });

  useEffect(() => {
    try {
      // 1. Get unlocked characters list
      const stored = localStorage.getItem('unlocked_characters');
      if (stored) {
        setUnlockedIds(JSON.parse(stored));
      } else {
        localStorage.setItem('unlocked_characters', JSON.stringify(['commando']));
      }

      // 2. Get cumulative milestones
      const totalRuns = Number(localStorage.getItem('meta_runs') || '0');
      const totalKills = Number(localStorage.getItem('meta_kills') || '0');
      setStats({ totalRuns, totalKills });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleStart = () => {
    onStartGame(selectedCharId);
  };

  const currentSelection = CHARACTERS.find(c => c.id === selectedCharId) || CHARACTERS[0];
  const isSelectedUnlocked = unlockedIds.includes(selectedCharId);

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col justify-between p-4 md:p-8 text-white overflow-y-auto select-none font-sans">
      
      {/* Decorative starry or dusty grid overlay background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"></div>

      {/* Header section */}
      <div className="flex justify-between items-center w-full max-w-6xl mx-auto z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
          <Lucide.Trophy className="w-5 h-5 text-sky-400 hidden sm:block" />
          <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
            Sector B-9 | Core Roguelite Engine
          </span>
        </div>
        <div className="text-slate-400 text-[10px] sm:text-xs font-mono">
          V1.0.4-LITE
        </div>
      </div>

      {/* Hero Title & Main Body */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center justify-center max-w-6xl w-full mx-auto my-auto z-10 py-6 lg:py-8">
        
        {/* Left Side: Game Title and Characters Grid */}
        <div className="flex flex-col gap-6 max-w-md w-full">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-500 animate-pulse">
              Void Survivor 3D
            </h1>
            <p className="text-slate-400 text-sm font-medium">
              Land on escalating procedural planets, harvest stacking passive artifacts, and defeat monolithic stage guardians.
            </p>
          </div>

          {/* Character Picker Panel */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs uppercase tracking-widest font-mono text-slate-400 font-bold">
              Select Playable Survivor
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {CHARACTERS.map(char => {
                const isUnlocked = unlockedIds.includes(char.id);
                const isSelected = selectedCharId === char.id;

                return (
                  <button
                    key={char.id}
                    onClick={() => setSelectedCharId(char.id)}
                    className={`text-left p-4 rounded-xl border transition-all duration-150 flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-sky-500 shadow-lg shadow-sky-500/10'
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: `#${char.meshColor.toString(16)}` }}
                      ></div>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-sm">{char.name}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1">
                          {isUnlocked ? char.description : `LOCKED: ${char.unlockCondition}`}
                        </span>
                      </div>
                    </div>

                    {!isUnlocked && (
                      <Lucide.Lock className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Selected Character Attributes & Cooldowns */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-2xl p-6 max-w-lg w-full flex flex-col gap-6 backdrop-blur-md">
          
          {/* Character Profile */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-sky-400 font-mono font-bold uppercase tracking-wide">
              Survivor Statistics & Loadout
            </span>
            <h2 className="text-2xl font-extrabold">{currentSelection.name}</h2>
            <p className="text-slate-400 text-sm leading-relaxed">{currentSelection.description}</p>
          </div>

          {/* Stat bars */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-mono">Max HP</span>
              <span className="text-white font-bold font-mono text-sm">{currentSelection.stats.maxHp} HP</span>
            </div>
            <div className="flex flex-col gap-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-mono">Base Damage</span>
              <span className="text-white font-bold font-mono text-sm">{currentSelection.stats.damage} Damage</span>
            </div>
            <div className="flex flex-col gap-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-mono">Sprinting Speed</span>
              <span className="text-white font-bold font-mono text-sm">{(currentSelection.stats.moveSpeed * 1.5).toFixed(1)} m/s</span>
            </div>
            <div className="flex flex-col gap-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-mono">Crit Strike Chance</span>
              <span className="text-white font-bold font-mono text-sm">{Math.round(currentSelection.stats.critChance * 100)}% Chance</span>
            </div>
          </div>

          {/* Loadout Skills Overview */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wide">Ability Loadout</span>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900">
                <span className="font-extrabold text-sky-400 block">{currentSelection.abilities.primary.name}</span>
                <span className="text-slate-400 text-[10px] line-clamp-1">{currentSelection.abilities.primary.description}</span>
              </div>
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900">
                <span className="font-extrabold text-indigo-400 block">{currentSelection.abilities.secondary.name}</span>
                <span className="text-slate-400 text-[10px] line-clamp-1">{currentSelection.abilities.secondary.description}</span>
              </div>
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900">
                <span className="font-extrabold text-emerald-400 block">{currentSelection.abilities.utility.name}</span>
                <span className="text-slate-400 text-[10px] line-clamp-1">{currentSelection.abilities.utility.description}</span>
              </div>
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-900">
                <span className="font-extrabold text-rose-400 block">{currentSelection.abilities.special.name}</span>
                <span className="text-slate-400 text-[10px] line-clamp-1">{currentSelection.abilities.special.description}</span>
              </div>
            </div>
          </div>

          {/* Action Trigger button */}
          {isSelectedUnlocked ? (
            <button
              onClick={handleStart}
              className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 hover:scale-[1.02] active:scale-95 transition-all py-3.5 rounded-xl font-bold tracking-wide uppercase shadow-lg shadow-sky-500/10 cursor-pointer text-center text-sm"
            >
              Land on Planet
            </button>
          ) : (
            <div className="bg-slate-950/90 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2 font-mono font-medium">
              <Lucide.Lock className="w-4.5 h-4.5 text-red-500 shrink-0" />
              <span>Locked: {currentSelection.unlockCondition}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom instructions row */}
      <div className="w-full max-w-6xl mx-auto border-t border-slate-900 mt-6 pt-4 pb-2 text-slate-500 text-[10px] sm:text-xs flex flex-col md:flex-row justify-between gap-4 z-10">
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <span className="flex items-center gap-1"><Lucide.Sparkles className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Move: WASD/Space</span>
          <span className="flex items-center gap-1"><Lucide.Eye className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Drag to look</span>
          <span className="flex items-center gap-1"><Lucide.Swords className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> L-Click to Shoot | Shift</span>
        </div>
        <div>
          <span>Runs: <b>{stats.totalRuns}</b> | Kills: <b>{stats.totalKills}</b></span>
        </div>
      </div>

    </div>
  );
};
