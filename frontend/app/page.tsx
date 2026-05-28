import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
import { TetrisWindow } from "@/components/game/tetris/TetrisWindow";
import { PacManWindow } from "@/components/game/pacman/PacManWindow";
import { BreakoutWindow } from "@/components/game/breakout/BreakoutWindow";
import { HighScoreWindow } from "@/components/windows/HighScoreWindow";
import { HallOfFameWindow } from "@/components/windows/HallOfFameWindow";
import { MyNftsWindow } from "@/components/windows/MyNftsWindow";
import { SeasonAdminWindow } from "@/components/windows/SeasonAdminWindow";
import { PlayerProfileWindow } from "@/components/windows/PlayerProfileWindow";
import { Balloons } from "@/components/dialogs/BalloonNotification";

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <SnakeWindow />
        <TetrisWindow />
        <PacManWindow />
        <BreakoutWindow />
        <HighScoreWindow />
        <HallOfFameWindow />
        <MyNftsWindow />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
