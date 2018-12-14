#define PLUGIN_VERSION  "1.0.0"
#define UPDATE_URL      ""
#define TAG             "MIX"
#define COLOR_TAG       "{matAmber}"
#define MAX_PLAYERS     36
#define DEBUG
#define DEBUG_TAG       "MIX"
#define MAX_RETRIES     3
#define RETRY_INTERVAL  3
#define GAME_TF2

public Plugin:myinfo = {
    name = "MixMatch",
    author = "PepperKick",
    description = "A plugin to work with MixMatch discord bot",
    version = PLUGIN_VERSION,
    url = "https://pepperkick.com"
}

char HostIP[128];
char HostPort[8];
char ServerName[16];

ArrayList PlayerSteam;
StringMap PlayerName;
StringMap PlayerTeam;

#include <headers>  

public OnPluginStart() {
    DebugLog("Loaded Version: %s", PLUGIN_VERSION);

    CreateCvars();
    
    PlayerSteam = new ArrayList(MAX_PLAYERS);
    PlayerName = new StringMap();
    PlayerTeam = new StringMap();

    RegConsoleCmd("cc_init",      Command_Init);
    RegConsoleCmd("cc_reset",     Command_Reset);
    RegConsoleCmd("cc_setmap",    Command_SetMap);
    RegConsoleCmd("cc_getstatus", Command_GetStatus);
    RegConsoleCmd("cc_setstatus", Command_SetStatus);
    RegConsoleCmd("cc_addplayer", Command_AddPlayer);
    RegConsoleCmd("cc_version",   Command_Version);

    HookEvent("player_changename", Event_NameChange, EventHookMode_Post);

    AddCommandListener(GameCommand_JoinTeam, "jointeam");

    Game_OnPluginLoad();

    SetStatus(STATE_FREE);
}

public void OnClientAuthorized(int client) {
    if (IsClientSourceTV(client)) {
        DebugLog("Client is SourceTV, Ignoring...");
        return;
    }

    if (GetStatus() == STATE_UNKNOWN) {
        KickClient(client, "Server is not ready, please check discord for more info");
    } else if (GetStatus() == STATE_FREE) {
        KickClient(client, "You need to queue in discord to join this server");
    } else if (GetStatus() == STATE_SETUP) {
        KickClient(client, "Server is under going setup, please join back after it's done");
    } else if (GetStatus() == STATE_WAITING) {
        char steam[32];        
        if (!GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam))) {
            KickClient(client, "Unknown Steam ID");
            return;
        }

        if (PlayerSteam.FindString(steam) == -1 && GetConVarInt(g_hcRestrictPlayers) == 1) {
           KickClient(client, "You cannot join the server as you are not in the current game");
           return;
        }

        DebugLog("Player Joined with id %s", steam);
        Game_OnPlayerConnect(client);
    } else if (GetStatus() == STATE_LIVE) {
        KickClient(client, "Match has already started, you cannot join now");
    } else if (GetStatus() == STATE_END) {
        KickClient(client, "You need to queue in discord to join this server");
    }
}

public void OnClientPostAdminCheck(int client) {
    Game_OnPlayerConnectPost(client);
}

public void OnMapStart() {
    #if defined GAME_TF2
    Match_OnMapStart();
    #endif

    if (GetStatus() == STATE_SETUP) {
        SetStatus(STATE_WAITING);

        char map[256];

        GetCurrentMap(map, sizeof(map));
        ServerCommand("exec chillylobby/maps/%s", map);

        #if defined GAME_CSGO
        ServerCommand("mp_warmuptime 1800");
        ServerCommand("mp_warmup_start");
        ServerCommand("bot_kick all");
        ServerCommand("bot_quota 0");
        #endif

        #if defined GAME_TF2
        ServerCommand("mp_tournament 1");
        ServerCommand("mp_tournament_restart");
        #endif
    } else if (GetStatus() == STATE_WAITING) {
        DebugLog("Map changed during waiting phase, Ignoring...");
    } else {
        SetStatus(STATE_FREE);
    }

    DebugLog("Map Started");
}

public void OnMapEnd() {
    DebugLog("Map Ended");

    Game_OnMapEnd();
}

public Action Command_Init(int client, int args) {
    char ip[128], port[128], server_name[128];

    GetCmdArg(1, ip, sizeof(ip));
    GetCmdArg(2, port, sizeof(port));
    GetCmdArg(3, server_name, sizeof(server_name));

    Format(HostIP, sizeof(HostIP), "%s", ip);
    Format(HostPort, sizeof(HostPort), "%s", port);
    Format(ServerName, sizeof(ServerName), "%s", server_name);

    PrintToServer("response::ok");

    return Plugin_Continue;
}

public Action Command_Reset(int client, int args) {
    Reset(false);

    PrintToServer("response::ok");

    return Plugin_Continue;
}

public Action Command_AddPlayer(int client, int args) {
    char steam[128], team[4], name[128];

    GetCmdArg(1, steam, sizeof(steam));
    GetCmdArg(2, team, sizeof(team));
    GetCmdArg(3, name, sizeof(name));

    if (PlayerSteam.FindString(steam) == -1) {
        PlayerSteam.PushString(steam);
    }

    #if defined GAME_CSGO
    if (StrEqual(team, "0", false)) {
        Format(team, sizeof(team), "%d", TEAM_T);
    } else {
        Format(team, sizeof(team), "%d", TEAM_CT);
    }
    #endif

    #if defined GAME_TF2
    if (StrEqual(team, "0", false)) {
        Format(team, sizeof(team), "%d", TEAM_BLU);
    } else {
        Format(team, sizeof(team), "%d", TEAM_RED);
    }
    #endif

    PlayerName.SetString(steam, name, true);
    PlayerTeam.SetString(steam, team, true);

    PrintToServer("Added Player %s with id %s for team %s", name, steam, team);

    return Plugin_Continue;
}

public Action Command_SetMap(int client, int args) {
    char map[256];
    
    GetCmdArg(1, map, sizeof(map));

    ServerCommand("changelevel %s", map);

    PrintToServer("response::ok");

    return Plugin_Continue;
}

public Action Command_SetStatus(int client, int args) {
    char status[16];

    GetCmdArg(1, status, sizeof(status));

    if (StrEqual(status, "free", false)) {
        SetStatus(STATE_FREE);
        PrintToServer("response::ok");
    } else if (StrEqual(status, "setup", false)) {
        SetStatus(STATE_SETUP);
        PrintToServer("response::ok");
    } else if (StrEqual(status, "waiting", false)) {
        SetStatus(STATE_WAITING);
        PrintToServer("response::ok");
    } else {
        PrintToServer("error::unknwon_status");
    }

    return Plugin_Continue;
}

public Action Command_GetStatus(int client, int args) {
    int status = GetStatus();

    switch(status) {
        case STATE_UNKNOWN: 
            PrintToServer("unknown");
        case STATE_FREE: 
            PrintToServer("free");
        case STATE_SETUP: 
            PrintToServer("setup");
        case STATE_WAITING: 
            PrintToServer("waiting");
        case STATE_LIVE: 
            PrintToServer("live");
        case STATE_END: 
            PrintToServer("ended");
        default: 
            PrintToServer("error");
    }

    return Plugin_Continue;
}

public Action Command_Version(int client, int args) {
    ReplyToCommand(0, PLUGIN_VERSION);

    return Plugin_Continue;
}

public void Event_NameChange(Event event, const char[] name, bool dontBroadcast) {
    int client = GetClientOfUserId(event.GetInt("userid"));

    char newName[32];
    event.GetString("newname", newName, sizeof(newName));

    char steam[32];
    GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam));

    char playerName[32];
    if (PlayerName.GetString(steam, playerName, sizeof(playerName))) {
        if (!StrEqual(newName, playerName)) {
            SetClientName(client, playerName);
        }
    }
}

public Action:Timer_PostMatchCoolDown(Handle timer) {
    if (GetStatus() == STATE_END) {
        Reset(true);
    }

    return Plugin_Stop;
}

public void SetStatus(int status) {
    DebugLog("Setting status to %d", status);

    char SeverStatus[32];

    switch(status) {
        case STATE_FREE: 
            Format(SeverStatus, sizeof(SeverStatus), "free");
        case STATE_SETUP: 
            Format(SeverStatus, sizeof(SeverStatus), "setup");
        case STATE_WAITING: 
            Format(SeverStatus, sizeof(SeverStatus), "waiting");
        case STATE_LIVE: 
            Format(SeverStatus, sizeof(SeverStatus), "live");
        case STATE_END: 
            Format(SeverStatus, sizeof(SeverStatus), "ended");
        default: 
            Format(SeverStatus, sizeof(SeverStatus), "unknown");
    }

    StringMap parameters = new StringMap();
    parameters.SetString("status", SeverStatus);

    SendRequest("status_change", parameters);

    SetConVarInt(g_hcGameStatus, status, false, false);
}

public int GetStatus() {
    return GetConVarInt(g_hcGameStatus);
}

public void Reset(bool notify) {
    PlayerSteam.Clear();
    PlayerName.Clear();
    PlayerTeam.Clear();

    SetStatus(STATE_FREE);

    for (int i = 1; i <= MaxClients; i++) {
        if (IsClientConnected(i) && !IsClientReplay(i) && !IsClientSourceTV(i)) {
            KickClient(i, "Server is being cleaned up, please check discord for more info");
        }
    }
}

public void SendRequest(char[] type, StringMap parameters) {
    char url[1024];

    Format(url, sizeof(url), "http://%s:%s/call/%s", HostIP, HostPort, type);

    HTTPRequest req = HTTPRequest("GET", url, "OnRequestComplete");
    req.headers.SetString("User-Agent", "HTTPRequests for SourceMod");

    StringMapSnapshot keys = parameters.Snapshot();

    for (int i = 0; i < keys.Length; i++) {
        char key[1024];
        char value[1024];

        keys.GetKey(i, key, sizeof(key));
        parameters.GetString(key, value, sizeof(value));

        req.params.SetString(key, value);
    }
    
    req.params.SetString("name", ServerName);

    req.SendRequest();

    DebugLog("Sending request %s", type);
}

public void OnRequestComplete(bool bSuccess, int iStatusCode, StringMap tHeaders, const char[] sBody, int iErrorType, int iErrorNum, any data) {
    if (bSuccess) {
        DebugLog("Finished request with status code %d", iStatusCode);
    } else {
        DebugLog("Failed request with error type %d, error num %d", iErrorType, iErrorNum);
    }
}

public DebugLog(const char[] myString, any ...) {
    #if defined DEBUG
        int len = strlen(myString) + 255;
        char[] myFormattedString = new char[len];
        VFormat(myFormattedString, len, myString, 2);

        PrintToServer("[%s] %s", DEBUG_TAG, myFormattedString);
    #endif
}
