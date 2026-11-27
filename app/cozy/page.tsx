import { Suspense } from "react";
import { LibraryRoom } from "@/components/room/LibraryRoom";
import { getLibraryBooks } from "@/lib/books";

export default function CozyPage() {
  return (
    <Suspense fallback={<p className="room-empty">Opening the room…</p>}>
      <CozyLibrary />
    </Suspense>
  );
}

async function CozyLibrary() {
  const books = await getLibraryBooks();
  return <LibraryRoom books={books} />;
}
