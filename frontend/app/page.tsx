import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
import { TetrisWindow } from "@/components/game/tetris/TetrisWindow";
import { PacManWindow } from "@/components/game/pacman/PacManWindow";
import { HighScoreWindow } from "@/components/windows/HighScoreWindow";
import { SharedMyNfts } from "@/components/shared/SharedMyNfts";
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
        <HighScoreWindow />
        <SharedMyNfts gameId="snake" />
        <SharedMyNfts gameId="tetris" />
        <SharedMyNfts gameId="pacman" />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
