public void Game_OnPluginLoad() {
    Match_OnPluginStart();
}

public void Game_OnMapStart() {
    Match_OnMapStart();
}

public void Game_OnMapEnd() {
    Match_OnMapEnd();
}

public void Game_OnPlayerConnect(int client) {

}

public void Game_OnPlayerConnectPost(int client) {
    char steam[32], name[32], team[4];
    
    if (IsClientSourceTV(client)) {
        return;
    }

    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));

    PlayerName.GetString(steam, name, sizeof(name));
    SetClientName(client, name);

    PlayerTeam.GetString(steam, team, sizeof(team));
    ChangeClientTeam(client, StringToInt(team));

    StringMap parameters = new StringMap();
    parameters.SetString("id", steam);

    ShowVGUIPanel(client, PANEL_CLASS_RED);

    PostStatusUpdate();
}

public Action GameCommand_JoinTeam(int client, const char[] command, int argc) {
    char team[9], steam[32], playerTeam[4];

    GetCmdArg(1, team, sizeof(team));
    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));
    PlayerTeam.GetString(steam, playerTeam, sizeof(playerTeam));

    Log("Client %d is joining team %s, client assigned team is %s", client, team, playerTeam);

    if (StrEqual(team, "auto", false)) {
        ChangeClientTeam(client, StringToInt(playerTeam));

        return Plugin_Handled;
    } else if (StrEqual(team, "blue", false) && StrEqual(playerTeam, "3", false)) {
        return Plugin_Continue;
    } else if (StrEqual(team, "red", false) && StrEqual(playerTeam, "2", false)) {
        return Plugin_Continue;
    } else if (StrEqual(team, "spectate", false)) {
        return Plugin_Continue;
    }

    return Plugin_Handled;
}

StartMatch() {
    Log("Match Started");
    LogToGame("World triggered \"Match_Start\"");
}

ResetMatch() {
    Log("Match Reset");
    LogToGame("World triggered \"Match_Reset\"");
}

EndMatch(bool:endedMidgame) {
    Log("Match Ended: %d", endedMidgame);
    LogToGame("World triggered \"Match_End\"");
}

PostStatusUpdate() {
    int players = CountPlayersInAnyTeam();
    int max_players = ServerTeamSize * 2;

    PrintToMinHudAll("Waiting for players to join (%s / %s)", players, max_players);
}