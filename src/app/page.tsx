import { Controls } from "@/components/Controls";
import { Scene } from "@/components/Scene";
import { Transcript } from "@/components/Transcript";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,#1e293b_0%,#0a0a0b_65%)]" />
      <div className="absolute inset-0">
        <Scene />
      </div>
      <Transcript />
      <Controls />
    </main>
  );
}
