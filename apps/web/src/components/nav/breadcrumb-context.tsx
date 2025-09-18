"use client";

import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useCallback,
} from "react";

interface BreadcrumbData {
  [key: string]: string; // path segment -> display name
}

interface BreadcrumbContextType {
  breadcrumbData: BreadcrumbData;
  setBreadcrumbData: (data: BreadcrumbData) => void;
  updateBreadcrumbSegment: (segment: string, name: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(
  undefined,
);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumbData, setBreadcrumbData] = useState<BreadcrumbData>({});

  const updateBreadcrumbSegment = useCallback(
    (segment: string, name: string) => {
      setBreadcrumbData((prev) => ({
        ...prev,
        [segment]: name,
      }));
    },
    [],
  );

  return (
    <BreadcrumbContext.Provider
      value={{
        breadcrumbData,
        setBreadcrumbData,
        updateBreadcrumbSegment,
      }}
    >
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  const context = useContext(BreadcrumbContext);
  if (context === undefined) {
    throw new Error("useBreadcrumb must be used within a BreadcrumbProvider");
  }
  return context;
}
