Handle g_hcGameStatus = INVALID_HANDLE;
Handle g_hcRestrictPlayers = INVALID_HANDLE;
Handle g_hcTeamSize = INVALID_HANDLE;

public CreateCvars() {
    //Plugin Version ConVar
    CreateConVar(
        "mixmatch_version",
        PLUGIN_VERSION,
        "MixMatch Plugin Version",
        FCVAR_SPONLY | FCVAR_REPLICATED | FCVAR_NOTIFY
    );

    // CVar to store the status of the game
    g_hcGameStatus =
        CreateConVar(
            "mx_match_status",
            "unknown",
            "Status of the match",
            FCVAR_NOTIFY | FCVAR_DONTRECORD
        );

    // CVar to whether restrict players or not
    g_hcRestrictPlayers =
        CreateConVar(
            "mx_restrict_players",
            "1",
            "Should unknown players be restricted from joining the server?",
            FCVAR_NOTIFY | FCVAR_DONTRECORD
        );

    // CVar to store team size
    g_hcTeamSize =
        CreateConVar(
            "mx_teamsize",
            "0",
            "Size of the teams",
            FCVAR_NOTIFY | FCVAR_DONTRECORD
        );
}