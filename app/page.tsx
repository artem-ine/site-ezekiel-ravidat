import { Suspense } from "react";
import { LibraryRoom } from "@/components/room/LibraryRoom";
import { getLibraryBooks } from "@/lib/books";

export default function Home() {
  return (
    <Suspense fallback={<p className="room-empty">Opening the room…</p>}>
      <HomeRoom />
    </Suspense>
  );
}

async function HomeRoom() {
  const books = await getLibraryBooks();
  return <LibraryRoom books={books} />;
}
