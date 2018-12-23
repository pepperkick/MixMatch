bool g_bReadyPlayers[MAX_PLAYERS] = false;

Ready_OnPluginLoad() {
    RegConsoleCmd("sm_ready", Command_PlayerReady);
    RegConsoleCmd("sm_unready", Command_PlayerUnReady);
    RegConsoleCmd("mx_ready_player", Command_ReadyPlayer);
    RegConsoleCmd("mx_unready_player", Command_UnReadyPlayer);
}

public Action Command_PlayerReady(int client, int args) {
    char steam[32], _client[32];

    if (GetStatus() != STATE_WAITING) {
        PrintToChat(client, "[%s] Cannot use this command at the moment", TAG);

        return;
    }

    if (g_bReadyPlayers[client]) {
        PrintToChat(client, "[%s] You are already ready", TAG);

        return;
    }

    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));
    IntToString(client, _client, sizeof(_client));

    StringMap parameters = new StringMap();
    parameters.SetString("steam", steam);
    parameters.SetString("client", _client);

    #if defined GAME_CSGO
        UpdateHudStatus();
    #endif

    SendRequest("player_ready", parameters);
}

public Action Command_PlayerUnReady(int client, int args) {
    char steam[32], _client[32];

    if (GetStatus() != STATE_WAITING) {
        PrintToChat(client, "[%s] Cannot use this command at the moment", TAG);

        return;
    }

    g_bReadyPlayers[client] = false;

    StringMap parameters = new StringMap();
    parameters.SetString("steam", steam);
    parameters.SetString("client", _client);

    #if defined GAME_CSGO
        UpdateHudStatus();
    #endif

    SendRequest("player_unready", parameters);
    PrintToChat(client, "[%s] You are now marked as unready", TAG);
}

public Action Command_ReadyPlayer(int client, int args) {
    char client[128];
    int player;

    if (GetStatus() != STATE_WAITING) {
        PrintToServer("response::error::diffstatus")

        return;
    }

    GetCmdArg(1, client, sizeof(client));
    player = StringToInt(client, 10);

    g_bReadyPlayers[player] = true;

    #if defined GAME_CSGO
        UpdateHudStatus();
    #endif
}

public Action Command_UnReadyPlayer(int client, int args) {
    char client[128];
    int player;

    if (GetStatus() != STATE_WAITING) {
        PrintToServer("response::error::diffstatus")

        return;
    }

    GetCmdArg(1, client, sizeof(client));
    player = StringToInt(client, 10);

    g_bReadyPlayers[player] = false;

    #if defined GAME_CSGO
        UpdateHudStatus();
    #endif
}

CountReadyPlayers() {
    int count = 0;

    for (int i = 0; i < MAX_PLAYERS; i++) {
        if (g_bReadyPlayers[i]) count++;
    }

    return count;
}