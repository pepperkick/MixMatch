int playerCount = 0;
int dummyRound = 0;

Handle warmupTimer = INVALID_HANDLE;

public void Game_OnPluginLoad() {
    HookEvent("cs_win_panel_match", Event_GameOver);
    HookEvent("round_prestart", Event_RoundStart);
}

public void Game_OnMapStart() {

}

public void Game_OnMapEnd() {

}

public void Game_OnPlayerConnect(int client) {
    if (IsClientSourceTV(client)) {
        return;
    }
}

public void Game_OnPlayerConnectPost(int client) {
    char steam[32], name[32];

    PlayerName.GetString(steam, name, sizeof(name));
    SetClientName(client, name);

    StringMap parameters = new StringMap();
    parameters.SetString("id", steam);
}

public void Game_Reset() {
    playerCount = 0;
    dummyRound = 0;

    if (warmupTimer != INVALID_HANDLE) KillTimer(warmupTimer);
}

public Action Event_GameOver(Event event, const char[] name, bool dontBroadcast) {
    Log("Match Ended");
}

public Action Event_RoundStart(Event event, const char[] name, bool dontBroadcast) {
    Log("Round Started");
}

public Action GameCommand_JoinTeam(int client, const char[] command, int argc) {
    char team[4], steam[32], playerTeam[4];

    GetCmdArg(1, team, sizeof(team));
    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));
    PlayerTeam.GetString(steam, playerTeam, sizeof(playerTeam));

    if(StrEqual(team, playerTeam, false)) {
        return Plugin_Continue;
    }

    return Plugin_Handled;
}