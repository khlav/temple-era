"use client";
import { useRouter } from "next/navigation";

export default function BackButton({label}: {label: string}) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="mt-4 inline-block rounded-full bg-gradient-to-r from-gray-700 to-gray-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:from-gray-800 hover:to-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
    >
      {label}
    </button>
  );
}
