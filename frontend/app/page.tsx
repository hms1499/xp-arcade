import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
import { TetrisWindow } from "@/components/game/tetris/TetrisWindow";
import { PacManWindow } from "@/components/game/pacman/PacManWindow";
import { BreakoutWindow } from "@/components/game/breakout/BreakoutWindow";
import { MinesweeperWindow } from "@/components/game/minesweeper/MinesweeperWindow";
import { SolitaireWindow } from "@/components/game/solitaire/SolitaireWindow";
import { HighScoreWindow } from "@/components/windows/HighScoreWindow";
import { HallOfFameWindow } from "@/components/windows/HallOfFameWindow";
import { ArcadeChampionWindow } from "@/components/windows/ArcadeChampionWindow";
import { MyNftsWindow } from "@/components/windows/MyNftsWindow";
import { SeasonAdminWindow } from "@/components/windows/SeasonAdminWindow";
import { PlayerProfileWindow } from "@/components/windows/PlayerProfileWindow";
import { BrowserWindow } from "@/components/windows/BrowserWindow";
import { SwapWindow } from "@/components/windows/SwapWindow";
import { ControlPanelWindow } from "@/components/windows/ControlPanelWindow";
import { HowItWorksWindow } from "@/components/windows/HowItWorksWindow";
import { Balloons } from "@/components/dialogs/BalloonNotification";
import { LevelUpWatcher } from "@/components/desktop/LevelUpWatcher";
import { PrizeWatcher } from "@/components/desktop/PrizeWatcher";

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <SnakeWindow />
        <TetrisWindow />
        <PacManWindow />
        <BreakoutWindow />
        <MinesweeperWindow />
        <SolitaireWindow />
        <HighScoreWindow />
        <HallOfFameWindow />
        <ArcadeChampionWindow />
        <MyNftsWindow />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <BrowserWindow />
        <SwapWindow />
        <ControlPanelWindow />
        <HowItWorksWindow />
        <Balloons />
        <LevelUpWatcher />
        <PrizeWatcher />
      </Desktop>
    </BootScreen>
  );
}
