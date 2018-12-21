bool g_bReadyPlayers[MAX_PLAYERS] = false;

Ready_OnPluginLoad() {
    RegConsoleCmd("sm_ready", Command_PlayerReady);
    RegConsoleCmd("mx_ready_player", Command_ReadyPlayer);
}

public Action Command_PlayerReady(int client, int args) {
    char steam[32], _client[32];

    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));
    IntToString(client, _client, sizeof(_client));

    StringMap parameters = new StringMap();
    parameters.SetString("steam", steam);
    parameters.SetString("client", _client);

    SendRequest("check_discord", parameters);
}

public Action Command_ReadyPlayer(int client, int args) {
    char client[128];
    int player;

    GetCmdArg(1, client, sizeof(client));
    player = StringToInt(client, 10);

    g_bReadyPlayers[player] = true;
}

CountReadyPlayers() {
    int count = 0;

    for (int i = 0; i < MAX_PLAYERS; i++) {
        if (g_bReadyPlayers[i]) count++;
    }

    return count;
}