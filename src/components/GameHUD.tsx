import React from 'react';
import * as Lucide from 'lucide-react';
import { GameEngine } from '../game/GameEngine'; // import from correct file path
import { Item, Rarity } from '../types';
import { ITEMS } from '../game/ItemSystem';

interface GameHUDProps {
  engine: any; // GameEngine instance
  onPause: () => void;
  onQuit: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ engine, onPause, onQuit }) => {
  if (!engine || !engine.player) return null;

  const player = engine.player;
  const stats = player.stats;
  const char = player.character;
  const runStats = engine.runStats;

  // Percentage health
  const hpPercent = Math.max(0, Math.min(100, (stats.hp / stats.maxHp) * 100));
  const shieldPercent = stats.maxShield > 0 ? Math.max(0, Math.min(100, (stats.shield / stats.maxShield) * 100)) : 0;
  const xpPercent = Math.max(0, Math.min(100, (player.xp / player.xpNeeded) * 100));

  // Determine difficulty level name
  const diffTime = runStats.timeSurvived;
  let diffLevel = 'HAHAHAHA';
  let diffColor = 'text-red-500';

  if (diffTime < 45) {
    diffLevel = 'Easy';
    diffColor = 'text-emerald-400';
  } else if (diffTime < 90) {
    diffLevel = 'Medium';
    diffColor = 'text-green-400';
  } else if (diffTime < 150) {
    diffLevel = 'Hard';
    diffColor = 'text-amber-400';
  } else if (diffTime < 240) {
    diffLevel = 'Very Hard';
    diffColor = 'text-orange-400';
  } else if (diffTime < 360) {
    diffLevel = 'Insane';
    diffColor = 'text-red-400';
  } else if (diffTime < 500) {
    diffLevel = 'IMPOSSIBLE';
    diffColor = 'text-red-600 font-extrabold animate-pulse';
  }

  // Format survival time: MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // Safe wrapper to render Lucide Icons dynamically
  const renderItemIcon = (iconName: string, className = "w-5 h-5") => {
    const IconComponent = (Lucide as any)[iconName];
    if (IconComponent) {
      return <IconComponent className={className} />;
    }
    return <Lucide.Box className={className} />;
  };

  // Cooldown ratios
  const getCDRatio = (current: number, base: number) => {
    if (current <= 0) return 0;
    return (current / base) * 100;
  };

  return (
    <div id="game-hud-overlay" className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-6 font-sans">
      
      {/* Top Bar: Timer, Gold, Level, Stage Info */}
      <div id="hud-top-bar" className="flex justify-between items-start w-full">
        {/* Run state and difficulty */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-4 py-3 rounded-xl pointer-events-auto flex gap-6 items-center">
          <div className="flex flex-col">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-mono">Time Survived</span>
            <span className="text-white text-xl font-bold font-mono">{formatTime(runStats.timeSurvived)}</span>
          </div>

          <div className="h-8 w-[1px] bg-slate-800"></div>

          <div className="flex flex-col">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-mono">Difficulty Level</span>
            <span className={`text-md font-extrabold font-mono uppercase tracking-wide ${diffColor}`}>{diffLevel}</span>
          </div>

          <div className="h-8 w-[1px] bg-slate-800"></div>

          <div className="flex flex-col">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-mono">Stage Index</span>
            <span className="text-sky-400 font-bold font-mono">Stage {runStats.stageIndex + 1}</span>
          </div>
        </div>

        {/* Currency and level */}
        <div className="flex gap-3 pointer-events-auto">
          {/* Gold */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-xl flex items-center gap-2">
            <Lucide.Coins className="w-5 h-5 text-amber-400" />
            <span className="text-amber-300 font-bold text-lg font-mono">${runStats.gold}</span>
          </div>

          {/* Kills */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-xl flex items-center gap-2">
            <Lucide.Flame className="w-5 h-5 text-red-500 animate-pulse" />
            <span className="text-red-200 font-bold text-lg font-mono">{runStats.kills} Kills</span>
          </div>

          {/* Pause Trigger */}
          <button
            onClick={onPause}
            className="bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-3 py-2.5 rounded-xl pointer-events-auto flex items-center justify-center text-slate-300 transition duration-150 cursor-pointer"
          >
            <Lucide.Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Middle Bar: Boss health bar and Teleporter progress (Absolute top-center alignment for maximum screen visibility) */}
      <div id="hud-middle-bar" className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 w-full max-w-xl z-20">
        {/* Boss Health Bar */}
        {engine.activeBoss && (
          <div className="w-full bg-slate-950/95 border border-red-900/60 rounded-2xl p-4 flex flex-col gap-1.5 pointer-events-auto shadow-[0_0_25px_rgba(239,68,68,0.15)] animate-pulse">
            <div className="flex justify-between items-center px-1">
              <span className="text-red-500 font-black tracking-widest text-xs uppercase flex items-center gap-1.5">
                <Lucide.Flame className="w-4 h-4 text-red-500 shrink-0" />
                STAGE BOSS DESPONDENCY
              </span>
              <span className="text-red-400 font-mono text-xs font-bold">
                {engine.activeBoss.stats.hp} / {engine.activeBoss.stats.maxHp} HP
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 rounded-full transition-all duration-150 shadow-[0_0_8px_rgba(220,38,38,0.8)]"
                style={{ width: `${(engine.activeBoss.stats.hp / engine.activeBoss.stats.maxHp) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Teleporter charge progress */}
        {engine.stageGenerator.getTeleporter()?.activated && (
          <div className="bg-slate-950/95 border border-sky-800/40 rounded-2xl px-5 py-3 flex flex-col gap-1 items-center max-w-md pointer-events-auto shadow-2xl backdrop-blur-md">
            <span className="text-slate-200 font-mono font-medium text-xs text-center flex items-center gap-1.5">
              <Lucide.Zap className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-bounce" />
              {engine.teleporterTimerText}
            </span>
            <div className="w-48 h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-300 shadow-[0_0_6px_rgba(14,165,233,0.8)]"
                style={{ width: `${(engine.stageGenerator.getTeleporter()?.chargeProgress || 0) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Proximity Action Prompt: Absolute bottom-center alignment so it floats elegantly above skills and avoids center screen clutter */}
      {engine.nearestInteractive && (
        <div 
          className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 border border-amber-400 text-slate-950 px-6 py-3 rounded-full pointer-events-auto shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center gap-2 animate-pulse font-extrabold text-sm tracking-wide transition duration-150 cursor-pointer" 
          onClick={() => engine.triggerInteraction()}
        >
          <Lucide.Sparkles className="w-4 h-4 text-slate-950 shrink-0" />
          <span>[E] {engine.nearestInteractive.label}</span>
        </div>
      )}

      {/* Bottom Bar: Character HP, Active Abilities, Passive Item Grid */}
      <div id="hud-bottom-bar" className="flex flex-col gap-4 w-full">
        {/* Item inventory items grid */}
        {Object.keys(player.itemsInventory).length > 0 && (
          <div className="bg-slate-950/60 backdrop-blur-sm border border-slate-900/80 p-3 rounded-2xl flex flex-wrap gap-2.5 max-w-2xl pointer-events-auto self-start">
            {Object.keys(player.itemsInventory).map(itemId => {
              const item = ITEMS.find(i => i.id === itemId);
              const count = player.itemsInventory[itemId];
              if (!item || count <= 0) return null;

              const bgRarity = 
                item.rarity === 'boss' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                item.rarity === 'rare' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                item.rarity === 'uncommon' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';

              return (
                <div
                  key={itemId}
                  className={`border px-2 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-mono font-bold ${bgRarity}`}
                  title={`${item.name}: ${item.description}`}
                >
                  {renderItemIcon(item.icon, "w-4 h-4")}
                  <span>x{count}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5 items-end justify-between">
          {/* Health & XP panel */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 p-4 rounded-2xl w-full max-w-md pointer-events-auto flex flex-col gap-2">
            
            {/* Level and HP Numbers */}
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-2">
                <span className="bg-sky-500/20 border border-sky-500/40 text-sky-400 text-xs font-bold px-2.5 py-1 rounded-lg font-mono">
                  Lvl {player.level}
                </span>
                <span className="text-white font-extrabold text-sm">{char.name}</span>
              </div>
              <span className="text-white font-mono text-sm font-bold">
                {Math.floor(stats.hp)} / {stats.maxHp} HP
              </span>
            </div>

            {/* Health Bar */}
            <div className="w-full h-4 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden relative flex">
              {/* Shield chunk if any */}
              {stats.maxShield > 0 && (
                <div
                  className="h-full bg-blue-400 transition-all duration-150"
                  style={{ width: `${shieldPercent}%` }}
                ></div>
              )}
              {/* Health chunk */}
              <div
                className={`h-full bg-emerald-500 rounded-lg transition-all duration-150`}
                style={{ width: `${hpPercent}%` }}
              ></div>
            </div>

            {/* XP progress bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>XP Progress</span>
                <span>{player.xp} / {player.xpNeeded}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-150"
                  style={{ width: `${xpPercent}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Abilities block */}
          <div className="flex gap-3 pointer-events-auto">
            {/* Left Mouse Click Primary */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-center justify-center w-20 h-20 text-center relative overflow-hidden">
              {getCDRatio(player.primaryCD, char.abilities.primary.cooldown) > 0 && (
                <div
                  className="absolute bottom-0 inset-x-0 bg-slate-800/80 transition-all"
                  style={{ height: `${getCDRatio(player.primaryCD, char.abilities.primary.cooldown)}%` }}
                ></div>
              )}
              <span className="relative text-white font-extrabold text-xs z-10 uppercase font-mono">Primary</span>
              <span className="relative text-[10px] text-slate-400 z-10 font-mono">L-Click</span>
              {player.primaryCD > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-sky-400 font-mono font-bold text-sm bg-slate-950/70">
                  {player.primaryCD.toFixed(1)}s
                </span>
              )}
            </div>

            {/* Q Secondary */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-center justify-center w-20 h-20 text-center relative overflow-hidden">
              {getCDRatio(player.secondaryCD, char.abilities.secondary.cooldown) > 0 && (
                <div
                  className="absolute bottom-0 inset-x-0 bg-slate-800/80 transition-all"
                  style={{ height: `${getCDRatio(player.secondaryCD, char.abilities.secondary.cooldown)}%` }}
                ></div>
              )}
              <span className="relative text-white font-extrabold text-xs z-10 uppercase font-mono">Secondary</span>
              <span className="relative text-[10px] text-slate-400 z-10 font-mono">Key Q</span>
              {player.secondaryCD > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-sky-400 font-mono font-bold text-sm bg-slate-950/70">
                  {player.secondaryCD.toFixed(1)}s
                </span>
              )}
            </div>

            {/* Shift Utility */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-center justify-center w-20 h-20 text-center relative overflow-hidden">
              {getCDRatio(player.utilityCD, char.abilities.utility.cooldown) > 0 && (
                <div
                  className="absolute bottom-0 inset-x-0 bg-slate-800/80 transition-all"
                  style={{ height: `${getCDRatio(player.utilityCD, char.abilities.utility.cooldown)}%` }}
                ></div>
              )}
              <span className="relative text-white font-extrabold text-xs z-10 uppercase font-mono">Utility</span>
              <span className="relative text-[10px] text-slate-400 z-10 font-mono">L-Shift</span>
              {player.utilityCD > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-sky-400 font-mono font-bold text-sm bg-slate-950/70">
                  {player.utilityCD.toFixed(1)}s
                </span>
              )}
            </div>

            {/* R Special */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-center justify-center w-20 h-20 text-center relative overflow-hidden">
              {getCDRatio(player.specialCD, char.abilities.special.cooldown) > 0 && (
                <div
                  className="absolute bottom-0 inset-x-0 bg-slate-800/80 transition-all"
                  style={{ height: `${getCDRatio(player.specialCD, char.abilities.special.cooldown)}%` }}
                ></div>
              )}
              <span className="relative text-white font-extrabold text-xs z-10 uppercase font-mono">Special</span>
              <span className="relative text-[10px] text-slate-400 z-10 font-mono">Key R</span>
              {player.specialCD > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-sky-400 font-mono font-bold text-sm bg-slate-950/70">
                  {player.specialCD.toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
