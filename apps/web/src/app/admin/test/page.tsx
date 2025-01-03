export default async function TestPage() {
  return (
      <main>
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] text-center">
            Admin Test Subpage
          </h1>

          <div className="flex flex-col items-center gap-2">

            <div className="flex flex-col items-center justify-center gap-4">
              <p className="text-center text-2xl text-white">
                Additional text.
              </p>
            </div>
          </div>
      </main>
  );
}
