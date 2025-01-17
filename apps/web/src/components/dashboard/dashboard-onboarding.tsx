import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import React from "react";
import type {Session} from "next-auth";

export function DashboardOnboarding({ session }: { session: Session | undefined }) {
  return (
    <>
      {!session?.user?.characterId && (
        <div className="border-1 my-2 flex w-full flex-col rounded-lg border border-muted p-2 md:flex-row">
          <div className="relative min-h-20 min-w-60">
            <Image
              src={"/img/chart_dunckan.png"}
              fill
              objectFit="contain"
              alt="Example with highlighted character"
            />
          </div>
          <div className="flex grow flex-row">
            <div className="my-auto grow pl-2">
              {!session?.user ? (
                <>
                  <div>
                    Highlight your attendance by{" "}
                    <Link
                      href="/"
                      onClick={() => signIn("discord")}
                      className="text-primary underline"
                    >
                      logging in with Discord
                    </Link>
                  </div>
                  <div>and adding a primary character to your profile.</div>
                  <div className="text-sm text-muted-foreground">
                    Note: This site can only see publicly-available Discord
                    details like your public profile ID, username, and image.
                  </div>
                </>
              ) : (
                <>
                  <Link href="/profile" className="text-primary underline">
                    Add a primary character to your profile
                  </Link>
                  .
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
