int playerCount = 0;
int dummyRound = 0;

public void Game_OnPluginLoad() {
    HookEvent("cs_win_panel_match", Event_GameOver);
    HookEvent("round_prestart", Event_RoundStart);
}

public void Game_OnMapEnd() {

}

public void Game_OnPlayerConnect(int client) {
    if (IsClientSourceTV(client)) {
        return;
    }

    playerCount++;

    Log("%d: %d", playerCount, ServerTeamSize);

    if (playerCount >= ServerTeamSize * 2) {
        ServerCommand("mp_warmuptime 15");
        ServerCommand("mp_warmup_start");
        ServerCommand("bot_kick all");
        ServerCommand("bot_quota 0");
    }

    if (playerCount == 1) {
        ServerCommand("bot_kick all");
        ServerCommand("bot_quota 0");
    }
}

public void Game_OnPlayerConnectPost(int client) {
    char steam[32], name[32];

    if(!GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam)) && !IsClientSourceTV(client)) {
        KickClient(client, "Unknown Steam ID");
    }

    PlayerName.GetString(steam, name, sizeof(name));
    SetClientName(client, name);
    SendRequest("player_connected", parameters);

    StringMap parameters = new StringMap();
    parameters.SetString("id", steam);
}

public Action Event_GameOver(Event event, const char[] name, bool dontBroadcast) {
    Log("Match Ended");

    if (GetStatus() == STATE_LIVE) {
        SetStatus(STATE_END);

        dummyRound = 0;
    }

    CreateTimer(30 * 1.0, Timer_PostMatchCoolDown);
}

public Action Event_RoundStart(Event event, const char[] name, bool dontBroadcast) {
    Log("Round Started");

    if (GetStatus() == STATE_WAITING) {
        dummyRound++;

        if (dummyRound == 3) {
            SetStatus(STATE_LIVE);
        }
    }
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
