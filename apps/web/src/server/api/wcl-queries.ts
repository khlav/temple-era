export const RaidReportQuery = `
  query ($reportID: String!) {
    reportData {
      report(code: $reportID) {
        code
        title
        startTime
        endTime
        guild { id, name }
        zone { id, name }
  
        masterData {
          actors(type: "Player") {
            id
            gameID
            name
            server
            subType
            icon
          }
        }
        
        fights(killType: Encounters) {
          id
          name
          encounterID
          difficulty
          kill
          bossPercentage
          startTime
          endTime
          gameZone { id, name }
          friendlyPlayers
        }
  
      }
    }
  }
`;
