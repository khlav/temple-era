"use client";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";

export default function BackButton({ label }: { label: string }) {
  const router = useRouter();

  return <Button onClick={() => router.back()}>{label}</Button>;
}
