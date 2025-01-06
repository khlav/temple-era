import React from "react";

type AttendanceData = {
  character: string;
  raidCount: number;
  raidAttended: number;
  attendancePct: number;
};

const attendanceData: AttendanceData[] = [
  { character: "Rankine", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Waffle", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Loons", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Wheaty", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Eurymedon", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Rogand", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Minti", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Abishai", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Yagnar", raidCount: 13, raidAttended: 11, attendancePct: 84.6 },
  { character: "Lottiedottie", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Rasilynn", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Starcows", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Soktage", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Clumsyninja", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Grievous", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Whopperjr", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Rescommunis", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Darthgopher", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Xagg", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Clinto", raidCount: 13, raidAttended: 10, attendancePct: 76.9 },
  { character: "Acomp", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Cowchpotato", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Slackinof", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Xarina", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Drgonzo", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Anneliese", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Healius", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Flopy", raidCount: 13, raidAttended: 9, attendancePct: 69.2 },
  { character: "Dactyl", raidCount: 13, raidAttended: 8, attendancePct: 61.5 },
  { character: "Nierojo", raidCount: 13, raidAttended: 8, attendancePct: 61.5 },
  { character: "Kurrupture", raidCount: 13, raidAttended: 8, attendancePct: 61.5 },
  { character: "Asham", raidCount: 13, raidAttended: 8, attendancePct: 61.5 },
  { character: "Stalln", raidCount: 13, raidAttended: 7, attendancePct: 53.8 },
  { character: "Zorder", raidCount: 13, raidAttended: 7, attendancePct: 53.8 },
  { character: "Puddncheeks", raidCount: 13, raidAttended: 6, attendancePct: 46.2 },
  { character: "Dunckan", raidCount: 13, raidAttended: 6, attendancePct: 46.2 },
  { character: "Slayermoo", raidCount: 13, raidAttended: 6, attendancePct: 46.2 },
  { character: "Hoffman", raidCount: 13, raidAttended: 6, attendancePct: 46.2 },
  { character: "Twyn", raidCount: 13, raidAttended: 6, attendancePct: 46.2 },
  { character: "Zekarias", raidCount: 13, raidAttended: 5, attendancePct: 38.5 },
  { character: "Thumperz", raidCount: 13, raidAttended: 5, attendancePct: 38.5 },
  { character: "Bulakuti", raidCount: 13, raidAttended: 5, attendancePct: 38.5 },
  { character: "Kwatoko", raidCount: 13, raidAttended: 5, attendancePct: 38.5 },
  { character: "Mayochist", raidCount: 13, raidAttended: 4, attendancePct: 30.8 },
  { character: "Saintjimmy", raidCount: 13, raidAttended: 4, attendancePct: 30.8 },
  { character: "Purges", raidCount: 13, raidAttended: 4, attendancePct: 30.8 },
  { character: "Tresor", raidCount: 13, raidAttended: 4, attendancePct: 30.8 },
  { character: "Zokra", raidCount: 13, raidAttended: 4, attendancePct: 30.8 },
  { character: "Slob", raidCount: 13, raidAttended: 3, attendancePct: 23.1 },
];


const AttendanceTable: React.FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Rolling 6 Week Attendance (11/21 - 01/03) <span className="text-lg ">[STATIC EXAMPLE]</span> </h2>
      <table className="max-w-lg border  text-left text-nowrap">
        <thead>
        <tr className="">
          <th className="border  px-4 py-2">Character</th>
          <th className="border  px-4 py-2">Raid Count</th>
          <th className="border  px-4 py-2">Raid Attended</th>
          <th className="border  px-4 py-2">Attendance Pct</th>
        </tr>
        </thead>
        <tbody>
        {attendanceData.map((item, index) => (
          <tr
            key={index}
            className={index % 2 === 0 ? "" : ""}
          >
            <td className="border  px-4 py-2 text-left">{item.character}</td>
            <td className="border  px-4 py-2 text-right">{item.raidCount}</td>
            <td className="border  px-4 py-2 text-right">{item.raidAttended}</td>
            <td className="border  px-4 py-2 text-right">{item.attendancePct.toFixed(1)}%</td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  );
};

export default async function HomePage() {
  return (
    <main>
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
        Dashboard
      </h1>
      <AttendanceTable />
    </main>
  );
}
