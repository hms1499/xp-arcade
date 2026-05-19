import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
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
        <SharedLeaderboard gameId="snake" />
        <SharedMyNfts gameId="snake" />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
