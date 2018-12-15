public void Game_OnPluginLoad() {
    Match_OnPluginStart();
}

public void Game_OnMapEnd() {
    Match_OnMapEnd();
}

public void Game_OnPlayerConnect(int client) {

}

public void Game_OnPlayerConnectPost(int client) {
    char steam[32], name[32], team[4];

    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));

    PlayerName.GetString(steam, name, sizeof(name));
    SetClientName(client, name);

    PlayerTeam.GetString(steam, team, sizeof(team));
    ChangeClientTeam(client, StringToInt(team));

    StringMap parameters = new StringMap();
    parameters.SetString("id", steam);
    SendRequest("player_connected", parameters);

    ShowVGUIPanel(client, PANEL_CLASS_RED);
}

public Action GameCommand_JoinTeam(int client, const char[] command, int argc) {
    return Plugin_Handled;
}

StartMatch() {
    DebugLog("Match Started");

    if (GetStatus() == STATE_WAITING) {
        StringMap parameters = new StringMap();
        parameters.SetString("status", "live");

        SendRequest("status_change", parameters);

        SetStatus(STATE_LIVE);
    }
}

ResetMatch() {
    DebugLog("Match Reset");
}

EndMatch(bool:endedMidgame) {
    DebugLog("Match Ended: %d", endedMidgame);

    if (GetStatus() == STATE_LIVE) {
        SetStatus(STATE_END);
    }

    CreateTimer(30 * 1.0, Timer_PostMatchCoolDown);
}