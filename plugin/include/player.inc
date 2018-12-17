//============================================
//    CountPlayersInAnyTeam
//        Checks the number of players in server
//        Only countes players in a team
//         Sets counted players
//============================================

public int CountPlayersInAnyTeam() {
    int l_iPlayers = 0;

    for(new i = 1; i <= MaxClients; i++)
        if(IsClientInAnyTeam(i))
            l_iPlayers++;

    return l_iPlayers;
}

public int CountPlayersInTeam(int team) {
    int l_iPlayers = 0;

    for(new i = 1; i <= MaxClients; i++)
        if(IsClientInTeam(i, team))
            l_iPlayers++;

    return l_iPlayers;
}

public bool IsClientInAnyTeam(client) {
    return IsClientProper(client) ? (GetClientTeam(client) == TEAM_BLU || GetClientTeam(client) == TEAM_RED) : false;
}

public bool IsClientInTeam(client, team) {
    return IsClientProper(client) ? (GetClientTeam(client) == team) : false;
}

public bool IsClientProper(client) {
    #if defined ALLOWBOT
        return client != 0 ? IsClientInGame(client) : false;
    #endif

    return client != 0 ? IsClientInGame(client) && !IsFakeClient(client) : false;
}

public int GetArgTeam(char[] arg) {
    if (StrEqual(arg, "spectate", false))  return TEAM_SPC;
    if (StrEqual(arg, "spectator", false)) return TEAM_SPC;
    if (StrEqual(arg, "blue", false))      return TEAM_BLU;
    if (StrEqual(arg, "red", false))       return TEAM_RED;

    return 0;
}