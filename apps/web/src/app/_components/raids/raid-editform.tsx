"use client";

import type { FormEvent } from "react";
import { useState} from "react";
import { RaidLogReport } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";

interface Raid {
  name: string;
  date: Date;
  attendance_weight: number;
  raidLogs: Raid
}


export function CreateRaid() {

  return (
    <></>
  );
}
