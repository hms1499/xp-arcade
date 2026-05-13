import { Desktop } from "@/components/desktop/Desktop";
import { GameWindow } from "@/components/windows/GameWindow";
import { LeaderboardWindow } from "@/components/windows/LeaderboardWindow";
import { MyNftsWindow } from "@/components/windows/MyNftsWindow";

export default function Home() {
  return (
    <Desktop>
      <GameWindow />
      <LeaderboardWindow />
      <MyNftsWindow />
    </Desktop>
  );
}
