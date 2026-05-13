import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { GameWindow } from "@/components/windows/GameWindow";
import { LeaderboardWindow } from "@/components/windows/LeaderboardWindow";
import { MyNftsWindow } from "@/components/windows/MyNftsWindow";
import { Balloons } from "@/components/dialogs/BalloonNotification";

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <GameWindow />
        <LeaderboardWindow />
        <MyNftsWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
