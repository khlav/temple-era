import { redirect } from 'next/navigation';
import { auth } from "~/server/auth";

export default function AdminPage() {
  return (
      <main>
          <h2 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Admin
          </h2>
      </main>
  );
}
