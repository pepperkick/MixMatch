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
    #if defined GAME_CSGO
        return IsClientProper(client) ? (GetClientTeam(client) == TEAM_T || GetClientTeam(client) == TEAM_CT) : false;
    #endif

    #if defined GAME_TF2
        return IsClientProper(client) ? (GetClientTeam(client) == TEAM_BLU || GetClientTeam(client) == TEAM_RED) : false;
    #endif
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