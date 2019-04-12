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