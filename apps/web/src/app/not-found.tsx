import Link from 'next/link';
import BackButton from "~/app/_components/nav/backbutton";

export default function NotFound() {
  return (
    <div className="h-screen w-screen bg-transparent">
      <div className="p-4">
        <h1 className="text-6xl font-extrabold text-gray-800">404</h1>
        <p className="mt-2 text-md text-gray-600">
          The page you are looking for cannot be found.
        </p>
        <BackButton label="Back to safety"/>
      </div>
    </div>
  );
}
