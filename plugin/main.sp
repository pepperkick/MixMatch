#define PLUGIN_VERSION  "1.0.3.7"
#define UPDATE_URL      ""
#define TAG             "MIX"
#define COLOR_TAG       "{matAmber}"
#define MAX_PLAYERS     36
#define DEBUG
#define DEBUG_TAG       "MIX"
#define MAX_RETRIES     3
#define RETRY_INTERVAL  3
#define CONFIG_DIR      "mixmatch"

#define ALLOWBOT
#define GAME_CSGO

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
char ServerFormat[16];
int ServerTeamSize;

ArrayList PlayerSteam;
StringMap PlayerName;
StringMap PlayerTeam;

Handle g_hoHud = INVALID_HANDLE;    //Handle for HUD text display

#include <headers>  

public OnPluginStart() {
    Log("Loaded Version: %s", PLUGIN_VERSION);

    CreateCvars();
    
    PlayerSteam = new ArrayList(MAX_PLAYERS);
    PlayerName = new StringMap();
    PlayerTeam = new StringMap();

    // Attach HUD
    g_hoHud = HudInit(127, 255, 127);

    RegConsoleCmd("mx_list_players", Command_ListPlayers);  
    RegConsoleCmd("mx_add_player", Command_AddPlayer);   
    RegConsoleCmd("mx_get_player_client", Command_GetPlayerClient);  
    RegConsoleCmd("mx_send_player_chat", Command_SendPlayerChat);  

    HookEvent("player_changename", Event_NameChange, EventHookMode_Post);

    AddCommandListener(GameCommand_JoinTeam, "jointeam");

    Game_OnPluginLoad();
    Ready_OnPluginLoad();

    SetStatus(STATE_FREE);
}

public void OnClientAuthorized(int client) {
    if (IsClientSourceTV(client)) {
        Log("Client is SourceTV, Ignoring...");
        return;
    }

    char steam[32];        
    if (!GetClientAuthId(client, AuthId_SteamID64, steam, sizeof(steam))) {
        KickClient(client, "Unknown Steam ID");
        return;
    }

    if (PlayerSteam.FindString(steam) == -1 && GetConVarInt(g_hcRestrictPlayers) == 1) {
        KickClient(client, "You cannot join the server as you are not in the current game");
        return;
    }

    Log("Player Joined with id %s", steam);
    Game_OnPlayerConnect(client);
}

public void OnClientPostAdminCheck(int client) {
    Game_OnPlayerConnectPost(client);
}

public void OnMapStart() {
    Log("Map Started");
    Game_OnMapStart();
}

public void OnMapEnd() {
    Log("Map Ended");
    Game_OnMapEnd();
}

public Action Command_AddPlayer(int client, int args) {
    char steam[128], team[4], name[128];
    
    GetCmdArg(1, steam, sizeof(steam));
    GetCmdArg(2, team, sizeof(team));
    GetCmdArg(3, name, sizeof(name));
    
    if (args > 3) {
        for (int i = 4; i <= args; i++) {
            char temp[128];
            GetCmdArg(i, temp, sizeof(temp));
            Format(name, sizeof(name), "%s %s", name, temp);
        }
    }

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
        Format(team, sizeof(team), "%d", TEAM_RED);
    } else {
        Format(team, sizeof(team), "%d", TEAM_BLU);
    }
    #endif

    PlayerName.SetString(steam, name, true);
    PlayerTeam.SetString(steam, team, true);

    PrintToServer("Added Player %s with id %s for team %s", name, steam, team);

    return Plugin_Continue;
}

public Action Command_GetPlayerClient(int client, int args) {
    char steam[128], auth[128];
    
    GetCmdArg(1, steam, sizeof(steam));

    for (int i = 1; i <= MAX_PLAYERS; i++) {
        if (!IsClientProper(i)) continue;

        GetClientAuthId(i, AuthId_SteamID64, auth, sizeof(auth));

        if (StrEqual(steam, auth, false)) {
            PrintToServer("%d", i);

            return;
        }
    }

    PrintToServer("%d", -1);
}

public Action Command_ListPlayers(int client, int args) {
    for (int i = 0; i < PlayerSteam.Length; i++) {
        char steam[32], name[32], team[4];

        PlayerSteam.GetString(i, steam, sizeof(steam));
        PlayerName.GetString(steam, name, sizeof(name));
        PlayerTeam.GetString(steam, team, sizeof(team));

        PrintToServer("%s %s %s", steam, name, team)
    }
}

public Action Command_SendPlayerChat(int client, int args) {
    char client[128], msg[128];
    int player;
    
    GetCmdArg(1, client, sizeof(client));
    GetCmdArg(2, msg, sizeof(msg));
    player = StringToInt(client, 10);

    PrintToChat(player, "[%s] %s", TAG, msg);
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

public void Reset(bool notify) {
    PlayerSteam.Clear();
    PlayerName.Clear();
    PlayerTeam.Clear();

    for (int i = 1; i <= MaxClients; i++) {
        if (IsClientConnected(i) && !IsClientReplay(i) && !IsClientSourceTV(i)) {
            KickClient(i, "Server is being cleaned up, please check discord for more info");
        }
    }

    #if defined GAME_CSGO
        Game_Reset();
    #endif
}

public Log(const char[] myString, any ...) {
    #if defined DEBUG
        int len = strlen(myString) + 255;
        char[] myFormattedString = new char[len];
        VFormat(myFormattedString, len, myString, 2);

        PrintToServer("[%s] %s", DEBUG_TAG, myFormattedString);
    #endif
}
