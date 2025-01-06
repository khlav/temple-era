"use client";

import type { FormEvent } from "react";
import { useState} from "react";
import { api } from "~/trpc/react";

interface Raid {
  name: string;
  date: Date;
  attendance_weight: number;
  raidLogs: Raid
}


export function EditRaid() {

  return (
    <></>
  );
}
