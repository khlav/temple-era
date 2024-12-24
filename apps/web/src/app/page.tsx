import Link from "next/link";

import { LatestPost } from "~/app/_components/post";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

import * as Avatar from "@radix-ui/react-avatar";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[blue] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-[hsl(220,100%,80%)]">T3</span> App
          </h1>

          <div className="flex flex-col items-center gap-2">

            <div className="flex flex-col items-center justify-center gap-4">
              <p className="text-center text-2xl text-white">
                <span>
                  {session ? (
                    <>
                      <Avatar.Root className="inline-flex size-[64px] select-none items-center justify-center overflow-hidden rounded-full bg-gray-900 align-middle">
                        <Avatar.Image
                          className="size-full rounded-[inherit] object-cover"
                          src={session.user.image ?? ""}
                          alt={session.user.name ?? ""}
                        />
                        <Avatar.Fallback
                          className="leading-1 flex size-full items-center justify-center bg-white text-[24px] font-medium text-indigo-600"
                          delayMs={600}
                        >
                          {session.user?.name?.substring(0, 1).toUpperCase()}
                        </Avatar.Fallback>
                      </Avatar.Root>
                      <span className="pl-2">{session?.user?.name}</span>
                      <>{session?.user?.isAdmin ? " (admin)" : ""}</>
                    </>
                  ) : (
                    "Welcome, guest!"
                  )}
                </span>
              </p>
              <Link
                href={session ? "/api/auth/signout" : "/api/auth/signin"}
                className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
              >
                {session ? "Sign out" : "Sign in"}
              </Link>
            </div>
          </div>

          {session?.user && <LatestPost />}
        </div>
      </main>
    </HydrateClient>
  );
}
