import { redirect } from 'next/navigation';
import { auth } from "~/server/auth";

export default function AdminPage() {
  return (
      <main>
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] text-center">
            Admin
          </h1>
      </main>
  );
}
