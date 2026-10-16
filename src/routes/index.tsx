import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/jianghu/game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Game />;
}
