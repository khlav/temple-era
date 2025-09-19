"use client";

import { useEffect, useState } from "react";

interface MetadataDebugProps {
  raidId?: number;
  characterId?: number;
}

export function MetadataDebug({ raidId, characterId }: MetadataDebugProps) {
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = raidId
      ? `/api/debug/metadata/raid/${raidId}`
      : `/api/debug/metadata/character/${characterId}`;

    fetch(url)
      .then((res) => {
        if (res.status === 403) {
          throw new Error("Admin access required");
        }
        return res.json();
      })
      .then((data) => {
        setMetadata(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching metadata:", err);
        setLoading(false);
      });
  }, [raidId, characterId]);

  if (loading) return <div>Loading metadata...</div>;
  if (!metadata) return <div>No metadata found or admin access required</div>;

  const isRaid = metadata.type === "raid";
  const data = metadata.data;

  return (
    <div className="fixed bottom-4 right-4 max-h-96 max-w-md overflow-auto rounded-lg bg-black/90 p-4 text-xs text-white">
      <h3 className="mb-2 font-bold">
        Metadata Debug - {isRaid ? "Raid" : "Character"}
      </h3>
      <div className="space-y-2">
        <div>
          <strong>Title:</strong> {metadata.metadata?.title}
        </div>
        <div>
          <strong>Description:</strong> {metadata.metadata?.description}
        </div>

        {isRaid ? (
          <>
            <div>
              <strong>Participants:</strong> {data?.totalParticipants || 0}
            </div>
            <div>
              <strong>Kills:</strong> {data?.totalKills || 0}
            </div>
            <div>
              <strong>Bench:</strong> {data?.benchCount || 0}
            </div>
            <div>
              <strong>Zone:</strong> {data?.zone || "Unknown"}
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>Class:</strong> {data?.class || "Unknown"}
            </div>
            <div>
              <strong>Server:</strong> {data?.server || "Unknown"}
            </div>
          </>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer">Full Metadata</summary>
          <pre className="mt-2 overflow-auto text-xs">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
