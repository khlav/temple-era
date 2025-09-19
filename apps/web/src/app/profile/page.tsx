import { auth } from "~/server/auth";
import React from "react";
import { Separator } from "~/components/ui/separator";
import { ProfileEditor } from "~/components/profile/profile-editor";
import { redirect } from "next/navigation";
import { type Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function ProfileIndex() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  /* Sample profile result
    {
      "name": "dirktec",
      "characterId": 47837140,
      "image": "https://cdn.discordapp.com/avatars/313049555509837885/579991b89886639e00d0bba47ab4688d.png"
    }
   */

  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">Profile</div>
      <Separator className="my-2" />
      <ProfileEditor />
    </main>
  );
}
