import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
import { TetrisWindow } from "@/components/game/tetris/TetrisWindow";
import { SharedLeaderboard } from "@/components/shared/SharedLeaderboard";
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
        <SharedLeaderboard gameId="snake" />
        <SharedLeaderboard gameId="tetris" />
        <SharedMyNfts gameId="snake" />
        <SharedMyNfts gameId="tetris" />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
